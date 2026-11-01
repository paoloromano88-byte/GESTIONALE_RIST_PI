# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Contesto

Gestionale per ristoranti venduto a più locali (multi-tenant), su Firebase (progetto `gestionale-ristoranti-96c5b`, Firestore in `europe-west12`). Il **Super Admin** (titolare del software) è separato dai locali.

- **Prima di iniziare leggi `docs/DIARIO_PROGETTO.md`**: decisioni prese, cronologia delle PR, problemi già risolti, cose da verificare sul posto. Va aggiornato a ogni tappa importante (non è pubblicato: `docs/**` è escluso dall'hosting).
- Tutto è in **italiano**: identificatori, commenti, messaggi di commit, PR. Con il titolare si parla in italiano, con istruzioni semplici passo per passo.
- Il sito deve restare **anonimo**: nel codice non vanno nomi, telefoni o percorsi di un locale specifico (ex «Da Mimmo»). Senza dati del locale le app mostrano diciture neutre.
- Il gestionale **non è fiscale**: preconto, conto e Z riportano «DOCUMENTO NON FISCALE»; il conto non si chiama «ricevuta».

## Comandi

Niente build, bundler o linter: le pagine HTML si pubblicano così come sono. Il frontend importa Firebase JS SDK **10.7.1** dal CDN gstatic (`<script type="module">`); le altre librerie (SweetAlert2, QZ Tray, jsrsasign, qrcode-generator, Chart.js, jsQR) arrivano anch'esse da CDN.

Test con gli emulatori Firebase (dalla radice; servono Node 22 e Java). Nelle sessioni cloud le prime tre righe qui sotto le esegue già `.claude/hooks/session-start.sh` all'avvio (scarica anche l'emulatore Firestore e reinstalla solo se cambiano lo script o `functions/package*.json`): i test si lanciano direttamente.

```
npm install --no-save --no-audit --no-fund firebase-tools@13.29.1 @firebase/rules-unit-testing@3.0.4 firebase@10.7.1
(cd functions && npm ci --no-audit --no-fund)
cp zone-consegna.js comande-escpos.js functions/

npx firebase emulators:exec --only firestore            --project demo-gestionale "node test/regole-firestore.test.mjs"
npx firebase emulators:exec --only auth,firestore       --project demo-gestionale "node test/agente-stampa.test.mjs"
npx firebase emulators:exec --only auth,firestore       --project demo-gestionale "node test/programma-agente.test.mjs"
npx firebase emulators:exec --only firestore            --project demo-gestionale "node functions/test/ordini.test.mjs"
npx firebase emulators:exec --only auth,functions,firestore --project demo-gestionale "node functions/test/comande.test.mjs"
npx firebase emulators:exec --only functions,firestore  --project demo-gestionale "node functions/test/avvisi-rider.test.mjs"
npx firebase emulators:exec --only functions,firestore  --project demo-gestionale "node functions/test/trigger.test.mjs"
npx firebase emulators:exec --only auth,functions,firestore --project demo-gestionale "node functions/test/cambio-password.test.mjs"
node test/file-pubblicati.test.mjs    # file che l'Hosting pubblica (senza emulatori)
node test/categorie-menu.test.mjs     # sezioni del menu aggiunte dal locale (senza emulatori)
node test/stampanti.test.mjs          # stampanti con nome e stampanti aggiunte (senza emulatori)
```

- Non c'è un framework di test: ogni file è uno script Node autonomo (helper `t()` + `assert`). Per una sola suite si lancia solo il suo comando; non si filtrano i singoli casi.
- Nel test delle regole i log `PERMISSION_DENIED` sono normali (sono le scritture che devono fallire): conta la riga finale `RISULTATO: N ok, 0 falliti` e il codice di uscita.
- Le porte degli emulatori sono fisse in `firebase.json` (Firestore 8085, Auth 9099, Functions 5011) e i test le danno per scontate.
- `functions/zone-consegna.js` e `functions/comande-escpos.js` sono **copie** (ignorate da git) degli originali alla radice: l'hook di avvio le rifà, ma dopo aver modificato gli originali durante la sessione vanno ricopiate prima dei test. Al deploy le copia il `predeploy` di `firebase.json`.
- La CI (`.github/workflows/test-emulatori.yml`) esegue esattamente questi comandi.
- Agente di stampa senza Windows: `node agente-stampa/programma.mjs` (pagina su `http://127.0.0.1:17917`, dati in `~/.agente-stampa`). Riga di comando: `node agente-stampa/agente.mjs`.
- Il firmware ESP32 lo compila solo GitHub (`firmware-esp32.yml`, arduino-cli, core esp32 3.0.7): nelle sessioni cloud i siti degli strumenti ESP32 sono bloccati.

## Architettura

### Pagine
`gesti/index.html` è il **sito vetrina** del prodotto (nome commerciale **Gestì**, prezzi 39/69 €/mese): pagina statica con calcolatore delle commissioni e modulo «Richiedi una demo». Decisioni di marketing e cose da fare prima di pubblicizzarla nel diario («Marketing: Gestì»).

Ogni app è una pagina HTML alla radice con dentro il suo `<script type="module">` (configurazione Firebase compresa). Fa eccezione la Cassa, divisa in `cassa.html` (markup e alcuni script inline, per esempio `preparaDatiStampaTermica()` e il QR raster), `cassa.js` (modulo, circa 5.000 righe) e `cassa.css`. Poiché i moduli non espongono nulla, le funzioni chiamate dagli `onclick` inline devono essere assegnate a `window.*`: chiamare una funzione non esposta è già stato causa di bug. Le regole per smartphone della Cassa sono nei blocchi `@media (max-width: 768px)` di `cassa.css` e in fondo al primo `<style>` di `cassa.html`.

La radice del repository **è** la cartella pubblicata dall'Hosting: ciò che non deve finire online va aggiunto a `hosting.ignore` in `firebase.json` (oggi `test/`, `functions/`, `docs/`, `agente-stampa/`, `CLAUDE.md`, `*.log`, file e cartelle nascosti…). Attenzione: `**/.*` esclude una cartella nascosta ma non i file al suo interno, per questo c'è anche `**/.*/**`. `test/file-pubblicati.test.mjs` elenca i file con la stessa funzione di `firebase-tools` e fallisce se ne pubblica uno privato: un file privato nuovo va aggiunto sia a `hosting.ignore` sia al test. Il `Cache-Control: no-cache` su tutto serve a non lasciare versioni vecchie sui dispositivi.

### Multi-locale
- Locale principale `default`: raccolte alla radice (`ordini`, `prodotti`, `impostazioni`…). Altri locali: `ristoranti/{locale}/…`. Le raccolte di piattaforma (`utenti`, `saas_clienti`, `ristoranti`) restano sempre alla radice.
- **Browser**: ogni pagina importa `collection as _collection, doc as _doc` e ridefinisce `collection`/`doc` come wrapper che aggiungono `ristoranti/{TENANT_ID}` al percorso. `window.TENANT_ID` arriva da `?locale=` o dal valore salvato in `localStorage` (`saas_tenant_id`). Usa sempre i wrapper, mai `_collection`/`_doc` per i dati del locale.
- **Server** (`functions/index.js`): ogni trigger esiste in coppia, `…Principale` su `ordini/{id}` e `…Locali` su `ristoranti/{locale}/ordini/{id}`, e passa alla logica un `base` (`db` oppure `db.collection('ristoranti').doc(locale)`). Un trigger nuovo va aggiunto in entrambe le versioni.
- **Agente di stampa**: ricava il percorso base da `utenti/{uid}.locale`.

### Accessi e permessi (`firestore.rules`)
- `utenti/{uid}`: `{ruolo: 'superadmin'}` (accesso a tutto) oppure `{ruolo: 'locale', locale: '<id>'}` (solo il proprio locale, tranne `impostazioni/licenza`). Se `locale` manca, ogni scrittura viene rifiutata con «Missing or insufficient permissions».
- Dispositivi del personale: email e password del locale, una sola volta per dispositivo (`login-dispositivo.js` → `assicuraLoginDispositivo()`). Gli operatori (Sala, Agenda, App Rider) entrano poi con un PIN di 4 cifre preso da `dipendenti` (ruoli Cameriere, Rider, Responsabile). Clienti: accesso via SMS.
- Pubblico: legge menu e alcune `impostazioni`, crea ordini che passano `ordineValido()` (elenco chiuso di campi con `hasOnly`, limiti su lunghezze e importi) e segue il proprio ordine. **Un campo nuovo negli ordini dell'App Clienti richiede di aggiornare `ordineValido()` e `test/regole-firestore.test.mjs`.**
- Scorte, rubrica `clienti/{tel}` e `occupazione_forno` per gli ordini dell'App Clienti li aggiorna solo il server (Admin SDK).
- Licenza: `impostazioni/licenza` (`attiva`, `moduli.<nome> === false`). Ogni pagina chiama `mostraBloccoLicenza()` di `licenza-locale.js` con il proprio modulo; un modulo assente dalla licenza vale acceso. Un'app nuova va aggiunta a `APP_LOCALE` in `superadmin.html` e deve controllare il suo modulo.
- Firebase Storage non è attivo: le immagini (logo, foto) sono compresse e salvate dentro Firestore.
- `richieste_demo` (dal sito vetrina `gesti/`): il pubblico può solo crearle, con campi e lunghezze controllati e consenso obbligatorio; le legge, segna e cancella solo il Super Admin (sezione «Richieste di demo dal sito»).

### Moduli condivisi browser/server
- `zone-consegna.js` (zone e supplementi per CAP) e `comande-escpos.js` (testo ESC/POS di comande, conti, turni, QR) sono usati sia dalle pagine sia da `functions/`, così i risultati sono identici. Non devono toccare il DOM: ciò che dipende dall'ambiente (ora, fuso `Europe/Rome`, QR…) arriva nel parametro `ctx`.
- Il testo per le termiche è solo ASCII (`pulisciTestoESC`).
- `categorie-menu.js` (solo browser): sezioni del menu aggiunte dal locale in `impostazioni/categorie` (id `sez_…`). Le pagine aggiungono le sezioni ai loro elenchi fissi di categorie con `applicaSezioni()`. Il reparto di una sezione è quello in cui è spuntata nelle stampanti: `comande-escpos.js` lo legge da `ctx.stampanti` con una copia della stessa regola, perché gira anche sul server.
- `sanitize.js`: ogni testo che viene dai clienti va protetto con `escapeHtml`/`sanitizeHtml`, `argJs` per gli argomenti degli `onclick`, `immagineSicura` per le foto. In SweetAlert2 `title` e `html` sono HTML, `text` no.

### Stampa
- Tutte le stampe termiche della Cassa passano da `inviaStampaTermica()` in `cassa.js`; quelle dei pulsanti della scheda ordine da `stampaOrdine(id, reparto, manuale, ordine)`.
- `impostazioni/stampanti.metodo` sceglie il percorso:
  - `qz` (predefinito): QZ Tray sul PC della cassa, con richieste firmate dalla chiave del locale in `impostazioni/qz_firma`;
  - `agente`: la cassa scrive i byte ESC/POS in base64 in `coda_stampa`, e l'Agente di stampa nel locale li manda a `IP:9100`.
- Con `agente` le comande automatiche (ordini nuovi, VIA/aggiunte/storni) le crea il server (`functions/comande.js`) con id fissi (`ordine_{id}_{reparto}`, `messaggio_{id}_{millis}_{reparto}`), così una funzione ripetuta non stampa due volte; la cassa allora non stampa in automatico (`stampaAutomaticaDaQuestaCassa`). Conto, preconto e Z li manda sempre la cassa.
- Agente di stampa (`agente-stampa/`, protocollo completo nel suo `README.md`):
  - `agente.mjs` è il nucleo: Node 18 o più recente, nessuna dipendenza, solo API REST di Firebase;
  - `programma.mjs` aggiunge la pagina di controllo per Windows (impacchettato da `agente-windows.yml`);
  - il firmware ESP32 (`esp32/AgenteStampa/`) usa lo stesso protocollo;
  - la presa di una comanda è un `documents:commit` con `currentDocument.updateTime`: non usare PATCH con la condizione nell'URL, perché l'emulatore sbaglia.
- Versioni: aumentare `VERSIONE` in `agente-stampa/agente.mjs` fa aggiornare da soli i programmi Windows dei clienti. Il firmware ha `#define VERSIONE` nel `.ino` e la versione in `esp32/manifest.json`.

### Cloud Functions (`functions/`)
- ESM, Node 22, `firebase-functions` 6.6.0 (la 7 richiede adattamenti). La regione `europe-west12` deve restare uguale a quella di Firestore.
- `ordini.js`: gli ordini dell'App Clienti, riconosciuti dal campo `user_agent`, aggiornano in transazione scorte, rubrica e forno. La transazione è idempotente grazie a `elaborato_server`. I prezzi vengono ricontrollati: se non tornano si scrive `anomalia_prezzo`, senza bloccare l'ordine.
- `comande.js`: comande per l'Agente di stampa.
- `avvisi-rider.js`: notifica push (FCM, solo dati) quando un ordine a domicilio diventa «Pronto». La notifica la compone `firebase-messaging-sw.js`. Nell'emulatore le notifiche finiscono in `_push_emulatore`.
- `account.js`: cambio password degli account dei locali dal Super Admin. La pagina scrive `utenti/{uid}/cambio_password/{id}` (solo il Super Admin può: nessuna regola copre le sottoraccolte di `utenti`), il trigger prende la richiesta in una transazione togliendo subito la password, chiama `updateUser` (solo `ruolo: 'locale'`) e scrive `stato: 'fatto' | 'errore'`. Niente funzioni chiamabili dal browser (`onCall`): richiederebbero un ruolo IAM in più all'account del deploy.

## Modo di lavorare e pubblicazione
- Si lavora su un ramo con una PR in italiano (cosa cambia e quali test sono stati fatti). La PR avvia i test e un'anteprima Firebase di 7 giorni, il cui link compare nei commenti della PR. **Si unisce solo dopo che il titolare scrive «unisci».**
- Il merge su `main` (`firebase-hosting-merge.yml`) esegue i test, poi Functions e regole Firestore, poi il sito insieme al firmware ESP32 e all'installatore Windows compilati. Le regole non si incollano mai a mano nella console.
- Prove nel browser: Playwright/Chromium a misura di telefono (390×664) e di computer, salvate in `test/browser/` (fuori dalla CI). `test/browser/ambiente.cjs` prepara tutto: pagina vera servita dall'emulatore Hosting, moduli Firebase veri del pacchetto `firebase` collegati agli emulatori al posto del CDN, SweetAlert2 dal pacchetto locale (i CDN nelle sessioni cloud sono bloccati), Admin SDK per preparare e controllare i dati. Esempi: `superadmin-password.cjs` (con Functions) e `gesti.cjs` (`emulators:exec --only auth,firestore,hosting`).
