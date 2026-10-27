# Diario del progetto – Gestionale Ristoranti

Il gestionale è derivato da "Da Mimmo" e va **venduto a più locali**. Il **Super Admin**
(il titolare del software) è completamente separato dai locali.

Questo file riassume quanto fatto finora, le decisioni prese e come riprendere il lavoro.
Va aggiornato a ogni tappa importante. Non è pubblicato sul sito: `docs/**` è escluso
dall'hosting in `firebase.json`.

**Ultimo aggiornamento:** 27/10/2026, con la PR #33 (Firebase Storage: non attivo e non usato, immagini nel database).

> Non scrivere qui password, chiavi o codici segreti. Vanno solo nei segreti di
> GitHub o nella console Firebase/Google Cloud.

---

## 1. Le app

| Pagina | A cosa serve | Chi la usa |
|---|---|---|
| `index.html` | **App Clienti**: ordini da asporto e a domicilio, accesso con SMS | clienti |
| `menu.html` | Menu QR al tavolo | clienti in sala |
| `cassa.html` + `cassa.js` + `cassa.css` | **Cassa**: ordini, tavoli, prodotti, dipendenti, impostazioni, statistiche, stampa | personale |
| `sala.html` | Palmare dei camerieri (PIN personale) | camerieri |
| `ordini.html` | Telecomando / riepilogo ordini | personale |
| `kds.html` | Monitor cucina | cucina |
| `agenda.html` | Prenotazioni (PIN personale) | personale |
| `mappa_sala.html` | Mappa dei tavoli | personale |
| `delivery.html` | **App Rider**: consegne del giorno (PIN personale con ruolo "Rider"), scanner QR per prendere in carico la busta, avviso "ordine pronto" | rider |
| `superadmin.html` | **Super Admin**: crea i locali, licenze, account dei locali | titolare del software |
| `esp32.html` | Programma un **ESP32-C3** come Agente di stampa, dal browser via USB (ESP Web Tools 10.2.1), e istruzioni | titolare / installatore |

File condivisi:
- `login-dispositivo.js`: accesso del dispositivo con l'account del locale e controllo della scheda `utenti`.
- `sanitize.js`: protezione da HTML iniettato (`escapeHtml`, `sanitizeHtml`, `safeId`).
- `zone-consegna.js`: zone di consegna per CAP. È usato da App Clienti, Cassa e server, così il calcolo è identico ovunque.
- `comande-escpos.js`: testo ESC/POS di comande, conto/preconto, chiamata turni, aggiornamenti, blocco domicilio e QR. È lo stesso per Cassa e server (`functions/comande.js`): le comande escono identiche.
- `agente-stampa/`: **Agente di stampa** per PC/Raspberry (`agente.mjs`) e protocollo per l'ESP32 (`README.md`). Non è pubblicato sul sito.
- `functions/`: Cloud Functions (server).
- `firestore.rules`: regole di sicurezza del database.
- `test/`, `functions/test/`: test automatici.

## 2. Come funziona Firebase

- **Progetto**: `gestionale-ristoranti-96c5b`, piano **Blaze**, database Firestore in `europe-west12`.
- **Hosting**: la cartella principale del repository.
- **Accessi**:
  - personale: email + password, un account per locale; il dispositivo resta collegato;
  - operatori (Sala, Agenda, App Rider): PIN personale di 4 cifre, creato in Cassa → Gestionale → Dipendenti. Ruoli: Cameriere, Rider (App Rider), **Responsabile** (può entrare in Sala da più dispositivi insieme: è l'accesso d'emergenza del locale). Il vecchio PIN fisso `0000` non esiste più (PR #32) e non si può assegnare;
  - clienti: SMS.
- **Più locali (multi-tenant)**:
  - locale principale (Da Mimmo, id `default`): raccolte alla radice (`ordini`, `prodotti`, …);
  - altri locali: `ristoranti/{id-locale}/...`;
  - ogni pagina sceglie il locale da `?locale=` o dal valore ricordato sul dispositivo.
- **Schede account** `utenti/{uid}`, una per ogni account email/password:
  - Super Admin: `ruolo: "superadmin"`;
  - personale di un locale: `ruolo: "locale"`, `locale: "<id-locale>"`. Per Da Mimmo serve `locale: "default"`, minuscolo e senza spazi.
  - ⚠️ Se `locale` manca, le regole rifiutano ogni salvataggio ("Missing or insufficient permissions"). Ora le app mostrano subito "Account senza locale assegnato" con il codice dell'account (PR #22).
  - Gli account creati da Super Admin → "Account del Locale" hanno già la scheda completa.
- **Immagini** (logo, foto dei prodotti, foto in Agenda): vengono compresse e salvate **dentro il database** (Firestore). Sono quindi protette dalle stesse regole per locale.
  - **Firebase Storage non è attivo** nel progetto e il programma non lo usa (verificato il 27/10/2026, PR #33). Non ci sono regole di Storage da gestire.
  - Se un giorno servisse (es. file grandi), attivarlo in **modalità produzione** (tutto chiuso), mettere i file in `locali/{locale}/…`, scrivere `storage.rules` sul modello di `firestore.rules` e aggiungere `storage` al deploy.

### Cloud Functions (server)
- `ordineAppPrincipale` e `ordineAppLocali` partono a ogni nuovo ordine dell'**App Clienti**, riconosciuto dal campo `user_agent`.
- In una transazione che non conta mai due volte lo stesso ordine:
  - scalano le **scorte**;
  - aggiornano la **rubrica** `clienti/{telefono}`;
  - aggiornano i contatori **pizze e consegne** per fascia oraria (`occupazione_forno/{data}`).
- Ricontrollano i prezzi. Se non tornano scrivono `anomalia_prezzo` e in Cassa compare "⚠️ PREZZI DA VERIFICARE"; l'ordine non viene bloccato.
- Gli ordini del personale (cassa, sala, …) aggiornano scorte e rubrica dal proprio dispositivo.

### Consegne a domicilio: dall'ordine alla consegna
1. **Ordine**: arriva dall'App Clienti oppure viene inserito in Cassa.
   - La zona e il supplemento si calcolano dal CAP (`zone-consegna.js`).
   - C'è un limite di consegne ogni 15 minuti: gli orari al completo compaiono come "PIENO".
2. **Stampa** (Cassa, tramite QZ Tray su stampanti termiche di rete ESC/POS):
   - su ogni scontrino della consegna c'è il riquadro con indirizzo, citofono, CAP e zona;
   - in fondo c'è il **QR dell'ordine**, con il codice breve `ORDINE #XXXXXX` (ultime 6 lettere dell'ID) e il nome del cliente.
   - Il QR contiene il link `delivery.html?locale=<locale>&ordine=<ID>`.
   - È stampato come **immagine raster ESC/POS (`GS v 0`)** inviata a QZ in base64 (`datiQrConsegnaESC` in `cassa.html`): funziona con tutte le termiche, senza il comando QR nativo.
   - L'intercettore di stampa in `cassa.html` modifica solo le voci di testo (`isTestoSemplice`), non i byte delle immagini.
3. **Cucina**: quando l'ordine passa a "Pronto", l'App Rider suona e vibra; in alto compare "🔔 N pronte".
4. **Presa in carico (App Rider)**: il rider scansiona il QR della busta che ha in mano.
   - Pulsante "📷 SCANSIONA QR" in basso, oppure "Scansiona e prendi" sulla scheda. Se il QR è di un'altra busta, l'app avvisa ("Busta diversa!").
   - Lettore: quello nativo del telefono (`BarcodeDetector`) o la libreria `jsQR`. Se la fotocamera non va, c'è "Fai una foto al QR".
   - La presa avviene con una **transazione**: se due rider ci provano insieme, vince il primo. L'app blocca ordini di altri rider, già consegnati, annullati e QR di altri locali.
   - Uscita d'emergenza: "Scontrino senza QR? Prendi a mano", con conferma.
   - Un ordine preso è visibile **solo** a quel rider. "Rilascia" lo restituisce agli altri.
5. **Consegna**: il rider preme "Consegnato". La Cassa vede tutto in "🛵 CONSEGNE DI OGGI".

### Stampa: QZ Tray oppure Agente di stampa (dalla PR #29)
- Si sceglie in Gestionale → Stampanti → «Come arrivano le stampe» (`impostazioni/stampanti.metodo`: `qz` predefinito, oppure `agente`).
- Tutte le stampe termiche passano da `inviaStampaTermica()` in `cassa.js`:
  - comande, VIA/aggiunte, chiamata turni, conto, preconto, riepilogo Z;
  - i ritocchi (blocco domicilio, testo solo ASCII) sono in `preparaDatiStampaTermica()` in `cassa.html`.
- **QZ Tray**: identico a prima. Provato confrontando byte per byte 8 tipi di stampa prima e dopo.
- **Agente**:
  - la cassa scrive i byte ESC/POS in base64 in `coda_stampa` del locale;
  - un apparecchio nel locale (ESP32, oppure PC con `agente-stampa/agente.mjs`) li manda a IP:9100 e cancella la comanda;
  - il tentativo 5 fallito porta lo stato a `errore`; dopo 15 minuti la comanda è `scaduta`;
  - ogni 30 secondi il battito aggiorna `agenti_stampa/{id}`;
  - l'agente usa l'account email/password del locale, quindi niente server in più e niente regole nuove;
  - la prenotazione di una comanda è un commit con `currentDocument.updateTime`, così due agenti non stampano due volte la stessa comanda. Con PATCH e la condizione nell'URL l'emulatore sbaglia.
- **Semaforo** in alto (sugli smartphone un badge in basso, solo se c'è un problema):
  - QZ Tray spento / errore sul PC con «QUESTO PC È LA CASSA»;
  - agente spento (nessun battito da 90 s);
  - comande ferme da più di 20 s o in errore;
  - avviso a comparsa quando diventa rosso.
- **Comande dal server** (PR #31, `functions/comande.js`, trigger `comandePrincipale` / `comandeLocali` su ogni scrittura di un ordine), solo con «Agente di stampa»:
  - ordine nuovo (`data_invio` entro 2 minuti, come la cassa): comande pizzeria/cucina/bar in `coda_stampa`, con id `ordine_{id}_{reparto}`;
  - nuovo messaggio alla cucina (VIA TURNO, AGGIUNTA, STORNO: cambia `timestamp_messaggio`): id `messaggio_{id}_{millis}_{reparto}`. RICHIESTA CONTO e PRONTO non stampano;
  - con id fissi, se la funzione viene ripetuta non stampa due volte;
  - in quel caso la cassa non stampa più in automatico (`stampaAutomaticaDaQuestaCassa`), per non avere doppioni;
  - conto, preconto e Z li manda sempre la cassa;
  - data e ora in fondo sono in ora italiana (`Europe/Rome`). Il QR punta a `https://gestionale-ristoranti-96c5b.web.app/delivery.html`.
- Verifiche fatte:
  - 23 tipi di stampa della cassa identici byte per byte a prima del modulo condiviso;
  - 17 comande del server identiche a quelle della cassa (tranne data/ora e indirizzo del sito nel QR);
  - catena completa provata con gli emulatori: ordine → server → coda → agente → stampante finta.
- **ESP32-C3 SuperMini** (firmware in `agente-stampa/esp32/AgenteStampa/`, stesso protocollo dell'agente per PC):
  - al primo avvio crea la rete «AgenteStampa-xxxx» con una pagina per Wi-Fi (solo 2,4 GHz), email e password del locale e nome;
  - la password serve solo al primo accesso: poi resta il token di rinnovo;
  - lucina blu (GPIO 8): fissa = ok, lampeggio veloce = da configurare, lento = problema, tre lampi = stampato;
  - tasto BOOT per 5 s = ripristino;
  - prende 3 comande per volta (memoria limitata).
- Il firmware lo compila **GitHub** (`.github/workflows/firmware-esp32.yml`: arduino-cli, core esp32 3.0.7, ArduinoJson 7.2.1, `CDCOnBoot=cdc`, `FlashMode=dio`):
  - lo fa a ogni anteprima e a ogni pubblicazione, e i file finiscono in `firmware/` sul sito;
  - sono quattro parti (bootloader 0x0, partizioni 0x8000, boot_app0 0xe000, programma 0x10000): un aggiornamento non cancella Wi-Fi e accesso salvati (NVS a 0x9000);
  - in questa sessione non si può compilare: i siti degli strumenti ESP32 sono bloccati.

### Scontrino fiscale: il gestionale NON è fiscale (decisione del 26/10/2026)
- Ogni locale stampa il **preconto** dal gestionale e batte il totale sul **proprio registratore di cassa**, di qualunque marca. Così non serve nessun accordo con l'Agenzia delle Entrate.
- Su preconto, conto e riepilogo Z c'è scritto **"DOCUMENTO NON FISCALE"**; il conto si intitola "CONTO" e non più "RICEVUTA".
- Incasso senza registratore collegato:
  - i pulsanti si chiamano **"INCASSA (Contanti/Carta)"** e non c'è più "FISCALE";
  - un riquadro ricorda di battere il totale sul registratore;
  - alla fine compare "Ora batti € X sul registratore di cassa", con la quota a testa se il conto è diviso.
- **Olivetti** (solo chi ha ElaExecute sul PC della cassa e QZ Tray): si collega in Gestionale → Stampanti → "Scontrino fiscale", scrivendo la cartella IN di ElaExecute.
  - Il valore è salvato in `impostazioni/stampanti`, campo `fiscale: { modo: "nessuno" | "olivetti", cartella }`.
  - Da Mimmo (`default`) resta collegato alla cartella di sempre finché in quella pagina non si salva un'altra scelta. Gli altri locali partono da "Nessuno: batto il totale a mano".
- Strade valutate e scartate per ora:
  - scontrino online tramite servizi a pagamento che usano la procedura "Documento commerciale online" dell'Agenzia;
  - software certificato (provvedimento del 7/3/2025, operativo secondo gli addetti dal 2027).
  - Se un giorno servirà, si riparte da qui.

### Regole di sicurezza (`firestore.rules`)
- Super Admin: tutto.
- Personale: solo il proprio locale. La licenza la cambia solo il Super Admin.
- Pubblico (clienti):
  - legge menu, ingredienti, sconti, contatori forno/consegne e alcune impostazioni;
  - crea ordini validi;
  - segue i propri ordini tramite ID o con il telefono verificato via SMS.
- Il pubblico **non** può toccare scorte, rubrica o contatori: lo fa solo il server.

## 3. Pubblicazione (GitHub Actions)

- Ogni modifica va su un ramo, poi si apre una **PR**:
  - partono i test con gli emulatori;
  - si crea un'**anteprima** Firebase, il cui link compare nei commenti della PR.
- Il titolare prova l'anteprima e scrive **"unisci"**.
- Al merge su `main` (`firebase-hosting-merge.yml`):
  1. test;
  2. **backend**: Cloud Functions e regole Firestore;
  3. **sito**, solo se il backend è andato a buon fine.
- Segreto GitHub: `FIREBASE_SERVICE_ACCOUNT_GESTIONALE_RISTORANTI_96C5B` (account di servizio `firebase-adminsdk-…`).
- Ruoli dati a quell'account in Google Cloud IAM, che servono tutti:
  - **Editor**;
  - **Amministratore IAM progetto**;
  - **Utente account di servizio**;
  - più quelli per l'Hosting dati all'inizio.
- API attivate a mano: **Cloud Billing API**. Le altre (Cloud Functions, Cloud Build, Artifact Registry, Eventarc, Cloud Run, Pub/Sub) le ha attivate il primo deploy.
- Primo deploy delle funzioni (26/10/2026): al terzo tentativo è fallito con "Permission denied while using the Eventarc Service Agent". Era solo l'attesa dei permessi della prima volta; il tentativo successivo è riuscito.

## 4. Modo di lavorare

1. Ogni lavoro è una **issue** su GitHub, con etichette di priorità.
2. Lo sviluppo avviene sul ramo indicato dalla sessione, poi si apre una PR in italiano con cosa cambia e quali test sono stati fatti.
3. Prove: test automatici (emulatori) e prove nel browser con Firebase simulato.
   - Il browser è Playwright/Chromium, a misura di telefono (390×664) e di computer.
   - Icone, caratteri e SweetAlert sono quelli reali.
   - Per lo scanner: fotocamera finta di Chromium (`--use-file-for-fake-video-capture` con un video `.y4m` del QR) e foto caricate nel campo file.
   - Per la stampa: i byte ESC/POS del QR vengono ricostruiti in immagine e riletti con jsQR.
   - Questi script sono rimasti nella sessione di lavoro e **non sono nel repository**: se servono di nuovo, conviene salvarli in `test/browser/`.
4. Il merge avviene **solo** dopo "unisci" del titolare.
5. Dopo il merge si controlla che la pubblicazione sia andata a buon fine.

### Test (dalla cartella principale, serve Java)
```
npm install --no-save @firebase/rules-unit-testing@3.0.4 firebase@10.7.1
cp zone-consegna.js comande-escpos.js functions/ && (cd functions && npm ci)
npx firebase-tools@13.29.1 emulators:exec --only firestore --project demo-gestionale "node test/regole-firestore.test.mjs"
npx firebase-tools@13.29.1 emulators:exec --only auth,firestore --project demo-gestionale "node test/agente-stampa.test.mjs"
npx firebase-tools@13.29.1 emulators:exec --only auth,functions,firestore --project demo-gestionale "node functions/test/comande.test.mjs"
npx firebase-tools@13.29.1 emulators:exec --only firestore --project demo-gestionale "node functions/test/ordini.test.mjs"
npx firebase-tools@13.29.1 emulators:exec --only functions,firestore --project demo-gestionale "node functions/test/trigger.test.mjs"
```

## 5. Cronologia delle PR

| PR | Contenuto |
|---|---|
| #10 | Domicilio salvato in un'unica scrittura in Cassa; protezione da HTML iniettato (`sanitize.js`) |
| #11 | Stampa termica ESC/POS solo ASCII; App Rider con PIN personale |
| #12 | Tolte le credenziali condivise dal codice: login una volta per dispositivo |
| #13 | Regole Firestore: dati protetti; App Clienti adattata |
| #14 | Multi-locale: ogni account vede solo il suo locale; Super Admin separato |
| #15 | Super Admin e login: UID visibile e istruzioni per il primo avvio |
| #20 | App Clienti: correzione all'apertura; zone di consegna per CAP con supplemento, minimo d'ordine e consegna gratuita |
| #21 | Cloud Functions (scorte, rubrica, forno, controllo prezzi); "Consegne di oggi" in Cassa con lo stato dei rider; App Rider: un ordine preso è visibile solo a quel rider, con tasto "Rilascia" |
| #22 | Limite di consegne ogni 15 minuti ("PIENO" nell'App Clienti); messaggio chiaro per gli account senza locale |
| #23 | Questo diario del progetto (`docs/`, escluso dal sito) |
| #24 | **QR delle consegne**: stampato sugli scontrini a domicilio, scanner nell'App Rider. **Avviso "ordine pronto"** al rider (suono, vibrazione, badge). App Rider: schede intere anche con tante consegne. **Cassa su smartphone**: controllo di 32 schermate (liste, colonna Orari, barra della data, finestre che si scorrono fino in fondo, Incasso, Nuovo ordine/Modifica, Statistiche, Mappa, Gestionale). Anche sul computer: Preconto, scritte illeggibili su tavoli occupati, "DA FARE" e titolo Bi-Gusto |
| #25 | Aggiornamento di questo diario |
| #27 | **Cassa non fiscale**: per ogni locale "Scontrino fiscale" in Gestionale → Stampanti (Nessuno / Olivetti con cartella impostabile). Incasso con "INCASSA" e promemoria "batti € X sul registratore". "DOCUMENTO NON FISCALE" su preconto, conto e riepilogo Z |
| #29 | **Stampa senza QZ Tray, tappe 1 e 2**: coda di stampa (`coda_stampa`), Agente di stampa per PC (`agente-stampa/`), **firmware ESP32-C3** compilato da GitHub e pagina `esp32.html` per installarlo, scelta in Gestionale → Stampanti, semaforo e avvisi quando la stampa non funziona (anche con QZ Tray) |
| #31 | **Comande dal server**: con «Agente di stampa» ordini nuovi e messaggi alla cucina vanno in coda dal server, anche a cassa chiusa. Testo delle stampe in `comande-escpos.js`, condiviso da cassa e server |
| #32 | **Niente più PIN 0000** in Sala e Agenda: si entra solo col PIN di un dipendente. Nuovo ruolo «Responsabile» (accesso d'emergenza scelto dal locale). Senza dipendenti registrati, Sala e Agenda spiegano dove aggiungerli |
| #33 | Firebase Storage verificato: non attivo e non usato. Tolto dalla Cassa il codice di Storage rimasto (non si scarica più) |

## 6. Issue

**Chiuse**:
- #1 credenziali App Rider;
- #2 HTML iniettato;
- #3 regole e isolamento;
- #4 domicilio in Cassa;
- #5 stampa ESC/POS;
- #6 zone di consegna;
- #7 capacità consegne;
- #8 minimo e consegna gratuita;
- #9 avviso al rider quando un ordine è pronto;
- #18 errore all'apertura dell'App Clienti;
- #26 cassa non fiscale (preconto + totale a mano sul registratore);
- #28 stampa senza QZ Tray, tappe 1 e 2 (coda, Agente di stampa, ESP32);
- #30 comande preparate dal server (tappa 3);
- #19 PIN d'emergenza 0000 in Sala e Agenda;
- #17 regole di Firebase Storage (Storage non attivo: immagini nel database).

**Da fare, in ordine**:
1. **#16**: chiave privata di QZ Tray (stampa) scritta nel codice della cassa → firma lato server.

**Stampa senza QZ Tray con ESP32** (#28, deciso il 26/10/2026), in tappe:
1. ✅ Coda di stampa, Agente per PC, semaforo e avvisi (PR #29).
2. ✅ Firmware ESP32-C3 SuperMini (il modello del titolare) e pagina `esp32.html` (PR #29). **Da provare con l'apparecchio vero**: non è stato possibile provarlo qui.
3. ✅ Comande preparate dal server (PR #31): con l'Agente di stampa si stampa anche a cassa chiusa.

Altre strade valutate: stampa dal browser (una sola stampante, finestra «Stampa»); stampanti Star CloudPRNT / Epson Server Direct Print (solo certi modelli); Monitor Cucina (KDS) al posto della carta.

Da verificare sul posto:
- **QR sugli scontrini**: al primo ordine a domicilio, controllare che il QR esca nitido dalla stampante vera e che il rider lo scansioni. Non è stato provato con una stampante reale. Se esce male, servono il modello della stampante e una foto dello scontrino. Alternative: comando QR nativo `GS ( k`, oppure moduli più grandi in `rasterQrBase64`.

Idee per dopo (non richieste):
- Togliere "Prendi a mano" dall'App Rider se si vuole la presa **solo** con il QR.
- Notifiche push al rider anche con l'app chiusa (oggi l'avviso "pronto" richiede l'app aperta).
- Ritocchi minori su smartphone:
  - nomi dei prodotti stretti nella finestra Modifica;
  - filtri delle categorie del menu che scorrono di lato;
  - alcuni pulsanti piccoli (turni 1–5, matita e cestino).

Altre note:
- `firebase-functions` è alla 6.6.0; la 7 richiede adattamenti.
- Le azioni GitHub segnalano Node 20 deprecato: aggiornarle quando escono le nuove versioni.
- Librerie da CDN aggiunte con la PR #24:
  - `qrcode-generator@1.4.4` (Cassa);
  - `jsqr@1.4.0` (App Rider, caricata solo quando si apre lo scanner).

## 7. Problemi già risolti (utile se si ripresentano)

- **"Missing or insufficient permissions" in Cassa** → la scheda `utenti/{uid}` dell'account non ha `locale` (vedi sezione 2).
- **Super Admin non entra** → in `utenti/{uid del Super Admin}` serve `ruolo: "superadmin"`. L'UID è quello dell'account in Authentication.
- **Regole incollate a mano con errore "rrules_version"** → c'era una "r" in più. Ora le regole si pubblicano da sole al merge: non incollarle più a mano.
- **Deploy fermo per permessi** → leggere l'errore nel log della GitHub Action. Di solito manca un ruolo IAM o un'API da attivare (sezione 3).
- **Orario dell'App Clienti che si azzerava** cambiando il carrello → risolto (#20).
- **Primo deploy delle Cloud Functions**: è servita l'abilitazione manuale della **Cloud Billing API**. Poi un tentativo è fallito per "Eventarc Service Agent", solo per i tempi di propagazione della prima volta (sezione 3).
- **App Rider: schede schiacciate con 3 o più consegne**, con pulsanti e piatti nascosti. Causa: lista in colonna flessibile e `overflow: hidden` sulle schede. Ora le schede hanno `flex-shrink: 0` (#24).
- **Cassa su telefono** (tutto risolto nella #24):
  - liste Asporto/Tavoli/Pronti mescolate: una regola mobile forzava `display:flex !important`;
  - colonna ORARI sotto la barra in alto: le griglie avevano `z-index`. Inoltre non si apriva da Tavoli/Pronti, perché sta nella lista Asporto;
  - finestre (Incasso…) che non si scorrevano fino in fondo: `.modal-overlay` era alto 100% più 150 px di padding. Corretto con `box-sizing: border-box`.
  - Le regole per smartphone sono in fondo al primo `<style>` di `cassa.html` ("Rifiniture smartphone") e nei blocchi `@media (max-width: 768px)` di `cassa.css`.
- **Scritte illeggibili**:
  - "DA FARE" nella colonna Orari: mancava la variabile `--gold`, ora definita in `cassa.css`;
  - nomi sui tavoli occupati, bianchi su rosa;
  - titolo Bi-Gusto, giallo su bianco.
- **Il QR non si legge** con l'App Rider:
  1. provare "Fai una foto al QR", con più luce e da vicino;
  2. controllare che il QR sia del locale giusto (`locale` nel link);
  3. controllare che l'ordine non sia di un altro rider o già consegnato. L'app lo dice con un messaggio.

## 8. Come riprendere in una nuova sessione

1. Leggere questo file e le issue aperte su GitHub.
2. Partire dall'ultima versione di `main`.
3. Seguire il modo di lavorare della sezione 4, rispondendo al titolare in italiano con istruzioni semplici, passo per passo.
