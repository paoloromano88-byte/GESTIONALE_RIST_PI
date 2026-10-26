# Diario del progetto – Gestionale Ristoranti

Il gestionale è derivato da "Da Mimmo" e va **venduto a più locali**. Il **Super Admin**
(il titolare del software) è completamente separato dai locali.

Questo file riassume quanto fatto finora, le decisioni prese e come riprendere il lavoro.
Va aggiornato a ogni tappa importante. Non è pubblicato sul sito: `docs/**` è escluso
dall'hosting in `firebase.json`.

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
| `delivery.html` | **App Rider**: consegne del giorno (PIN personale con ruolo "Rider") | rider |
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
- #18 errore all'apertura dell'App Clienti.

**Da fare, in ordine**:
1. **#9**: notifica al rider quando un ordine a domicilio è pronto.
2. **#16**: chiave privata di QZ Tray (stampa) scritta nel codice della cassa → firma lato server.
3. **#17**: regole di Firebase Storage (logo e immagini) per più locali.
4. **#19**: PIN d'emergenza 0000 sempre valido in Sala e Agenda.

Altre note:
- `firebase-functions` è alla 6.6.0; la 7 richiede adattamenti.
- Le azioni GitHub segnalano Node 20 deprecato: aggiornarle quando escono le nuove versioni.

## 7. Problemi già risolti (utile se si ripresentano)

- **"Missing or insufficient permissions" in Cassa** → la scheda `utenti/{uid}` dell'account non ha `locale` (vedi sezione 2).
- **Super Admin non entra** → in `utenti/{uid del Super Admin}` serve `ruolo: "superadmin"`. L'UID è quello dell'account in Authentication.
- **Regole incollate a mano con errore "rrules_version"** → c'era una "r" in più. Ora le regole si pubblicano da sole al merge: non incollarle più a mano.
- **Deploy fermo per permessi** → leggere l'errore nel log della GitHub Action. Di solito manca un ruolo IAM o un'API da attivare (sezione 3).
- **Orario dell'App Clienti che si azzerava** cambiando il carrello → risolto (#20).

## 8. Come riprendere in una nuova sessione

1. Leggere questo file e le issue aperte su GitHub.
2. Partire dall'ultima versione di `main`.
3. Seguire il modo di lavorare della sezione 4, rispondendo al titolare in italiano con istruzioni semplici, passo per passo.
