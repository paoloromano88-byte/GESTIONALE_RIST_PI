# Diario del progetto – Gestionale Ristoranti

Il gestionale è derivato da "Da Mimmo" e va **venduto a più locali**. Il **Super Admin**
(il titolare del software) è completamente separato dai locali.

Questo file riassume quanto fatto finora, le decisioni prese e come riprendere il lavoro.
Va aggiornato a ogni tappa importante. Non è pubblicato sul sito: `docs/**` è escluso
dall'hosting in `firebase.json`.

**Ultimo aggiornamento:** 26/10/2026, dopo la PR #24 (QR delle consegne, scanner nell'App Rider, Cassa su smartphone).

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
| `agenda.html` | Prenotazioni | personale |
| `mappa_sala.html` | Mappa dei tavoli | personale |
| `delivery.html` | **App Rider**: consegne del giorno (PIN personale con ruolo "Rider"), scanner QR per prendere in carico la busta, avviso "ordine pronto" | rider |
| `superadmin.html` | **Super Admin**: crea i locali, licenze, account dei locali | titolare del software |

File condivisi:
- `login-dispositivo.js`: accesso del dispositivo con l'account del locale e controllo della scheda `utenti`.
- `sanitize.js`: protezione da HTML iniettato (`escapeHtml`, `sanitizeHtml`, `safeId`).
- `zone-consegna.js`: zone di consegna per CAP. È usato da App Clienti, Cassa e server, così il calcolo è identico ovunque.
- `functions/`: Cloud Functions (server).
- `firestore.rules`: regole di sicurezza del database.
- `test/`, `functions/test/`: test automatici.

## 2. Come funziona Firebase

- **Progetto**: `gestionale-ristoranti-96c5b`, piano **Blaze**, database Firestore in `europe-west12`.
- **Hosting**: la cartella principale del repository.
- **Accessi**:
  - personale: email + password, un account per locale; il dispositivo resta collegato;
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
cp zone-consegna.js functions/ && (cd functions && npm ci)
npx firebase-tools@13.29.1 emulators:exec --only firestore --project demo-gestionale "node test/regole-firestore.test.mjs"
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
- #18 errore all'apertura dell'App Clienti.

**Da fare, in ordine**:
1. **#16**: chiave privata di QZ Tray (stampa) scritta nel codice della cassa → firma lato server.
2. **#17**: regole di Firebase Storage (logo e immagini) per più locali.
3. **#19**: PIN d'emergenza 0000 sempre valido in Sala e Agenda.

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
