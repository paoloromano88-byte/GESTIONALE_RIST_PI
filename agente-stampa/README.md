# Agente di stampa

Fa arrivare le stampe della cassa (comande, conti, preconti, riepilogo Z) alle **stampanti
termiche di rete** del locale, senza QZ Tray. Funziona con qualunque marca che accetti
ESC/POS sulla porta 9100 (quasi tutte le termiche con presa di rete).

```
Ordini (cassa, sala, App Clienti) ──► server ──┐
Conto, preconto, Z (dalla cassa) ──────────────┴──► Firebase: coda_stampa ──► Agente di stampa ──► stampante (IP:9100)
                                                                               (nel locale)
```
Il testo delle stampe lo prepara `comande-escpos.js`, lo stesso per cassa e server.

L'agente può essere:
- il **programma per Windows** (consigliato): `AgenteStampa-Setup.exe`, da scaricare con la pagina **`agente-windows.html`** del gestionale (Gestionale → Stampanti → «Scarica il programma per Windows»). È `agente.mjs` con una pagina di controllo nel browser (`programma.mjs`, vedi sotto);
- un **ESP32-C3 SuperMini** con il firmware di `esp32/AgenteStampa/`. Si programma dal browser con la pagina **`esp32.html`** del gestionale (Gestionale → Stampanti → «Programma e collega un ESP32-C3»). Il firmware lo compila GitHub a ogni anteprima e pubblicazione (`.github/workflows/firmware-esp32.yml`: Arduino core esp32 3.0.7, ArduinoJson 7.2.1);
- un **PC o Raspberry Pi** sempre acceso, con `agente.mjs` (questa cartella).

## Come si attiva

1. In cassa: **Gestionale → Stampanti**:
   - scrivi gli indirizzi IP delle stampanti;
   - in «Come arrivano le stampe» scegli **Agente di stampa (ESP32 o PC)** e salva.
2. Avvia l'agente nel locale (vedi sotto). Si collega con **l'email e la password del locale**, come una cassa.
3. In alto nella cassa compare il semaforo:
   - **STAMPA OK** quando l'agente risponde;
   - rosso lampeggiante se l'agente è spento o una stampante non risponde.
4. Le comande automatiche (ordini nuovi da cassa, sala, telecomando e App Clienti; VIA, aggiunte e
   storni) le mette in coda il **server** (`functions/comande.js`): escono anche con la cassa chiusa.
   Conto, preconto e riepilogo Z li manda la cassa, da qualunque dispositivo.

### Programma per Windows

Per il cliente non c'è niente da configurare a mano:
1. scarica e installa `AgenteStampa-Setup.exe`, senza permessi di amministratore;
2. nella pagina che si apre scrive email e password del locale.

Cosa fa:
- **Parte con il PC**, senza finestre (collegamento nella cartella Esecuzione automatica).
- Le icone sul desktop e nel menu Start riaprono la **pagina di controllo** su `http://127.0.0.1:17917` (se la porta è occupata usa 17918 o 17919). La pagina mostra:
  - lo stato e il locale collegato;
  - le stampanti impostate in cassa, con «Prova» (stampa un foglietto «PROVA DI STAMPA»);
  - **Cerca stampanti**: prova la porta 9100 sulla rete /24 del PC, si collega e chiude senza stampare;
  - il registro e «Scollega».
- **Sicurezza della pagina**:
  - risponde solo a `127.0.0.1`/`localhost`;
  - ogni richiesta porta una chiave casuale scritta nella pagina, che un altro sito non può leggere;
  - la pagina non si può inserire in un altro sito.
- **Un solo agente per PC**: un secondo avvio apre la pagina del primo e si chiude.
- **Senza internet all'accensione** (router ancora spento) riprova ogni 30 secondi. Se l'accesso non vale più (password del locale cambiata) torna su «Collega».
- **Si aggiorna da solo**:
  - ogni 6 ore legge `programmi/agente-stampa-windows.json` del sito (versione e impronta SHA-256);
  - se c'è una versione più nuova, la scarica e controlla l'impronta;
  - ferma l'agente dopo la comanda in corso e lancia l'installatore in modo silenzioso, che chiude, sostituisce e riaccende il programma;
  - non succede se ha stampato negli ultimi 10 minuti.
- **Dati** in `%APPDATA%\Agente di stampa`: `agente-stampa.json` (solo il token, mai la password) e `registro.txt`.

Come si costruisce (`.github/workflows/agente-windows.yml`, su un Windows di GitHub a ogni anteprima e pubblicazione):
1. `windows/avvio.mjs` + `programma.mjs` + `agente.mjs` in un solo file con esbuild;
2. Node.js «single executable application» → `AgenteStampa.exe`, con icona e nome «Agente di stampa»;
3. `windows/sottosistema-gui.mjs` lo rende senza finestra;
4. Inno Setup (`windows/installatore.iss`) crea l'installatore;
5. la prova installa, controlla pagina e processo unico, aggiorna in silenzio e disinstalla;
6. i file vanno in `programmi/` sul sito.

Se il programma non cambia si riusa l'installatore già provato (cache). La versione è `VERSIONE` in `agente.mjs`: per far aggiornare gli agenti dei clienti basta aumentarla.

Prova senza Windows: `node programma.mjs` (dati in `~/.agente-stampa`). Test: `test/programma-agente.test.mjs` con gli emulatori.

### Agente su PC o Raspberry Pi (riga di comando)

Serve [Node.js](https://nodejs.org) 18 o più recente. Non c'è nient'altro da installare.

```
node agente.mjs
```

- La prima volta chiede email, password del locale e un nome, per esempio «PC cucina».
- La password non viene salvata. Nel file `agente-stampa.json` resta solo il token di accesso: tienilo riservato.
- Per ricollegarlo, ad esempio dopo «Scollega» dalla cassa: `node agente.mjs --collega`.

## Protocollo (uguale per ESP32 e PC)

Tutto passa dalle API REST pubbliche di Firebase, con l'account email/password del locale.
Le regole di Firestore danno all'account accesso solo ai dati del suo locale.

1. **Accesso**
   - Si fa una sola volta:
     ```
     POST https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=API_KEY
     { email, password, returnSecureToken: true }
     ```
   - Si salvano solo `localId` (uid) e `refreshToken`.
   - Ogni ora si chiede un nuovo `id_token`:
     ```
     POST https://securetoken.googleapis.com/v1/token?key=API_KEY
     grant_type=refresh_token&refresh_token=...
     ```
   - Tutte le richieste a Firestore portano `Authorization: Bearer <id_token>`.
2. **Locale**: `GET .../documents/utenti/{uid}` → campo `locale`. Da qui si ricava il percorso base:
   - `default` → `projects/gestionale-ristoranti-96c5b/databases/(default)/documents`;
   - un altro locale → `.../documents/ristoranti/{locale}`.
3. **Coda**: ogni 2 secondi
   ```
   POST {base}:runQuery
   { structuredQuery: { from: [{collectionId: "coda_stampa"}],
       where: { fieldFilter: { field: {fieldPath: "stato"}, op: "EQUAL", value: {stringValue: "da_stampare"} } }, limit: 20 } }
   ```
   Campi di ogni comanda:

   | Campo | Contenuto |
   |---|---|
   | `ip`, `porta` | indirizzo della stampante (porta di solito 9100) |
   | `dati` | byte ESC/POS in **base64**, già pronti: vanno inviati così come sono |
   | `stato` | `da_stampare` → `in_stampa` → (cancellata se stampata) / `errore` / `scaduta` |
   | `tentativi`, `errore` | quante prove e ultimo errore, mostrati in cassa |
   | `stampante`, `descrizione` | per la cassa (es. «PIZZERIA · Rossi 19:30») |
   | `creato` | ora in cui la cassa l'ha messa in coda |
4. **Stampa di una comanda**, dalla più vecchia:
   - Se è più vecchia di 15 minuti → `stato: "scaduta"`.
   - Altrimenti la si **prenota** con `POST .../documents:commit`:
     ```
     { writes: [{ update: { name, fields }, updateMask: { fieldPaths: [...] },
                  currentDocument: { updateTime: <updateTime letto> } }] }
     ```
     con `stato: "in_stampa"`, `agente: {id}` e `tentativi + 1`. Se risponde `FAILED_PRECONDITION`, l'ha presa un altro agente: si salta.
     Anche gli altri cambi di stato si fanno così.
   - Si apre una connessione TCP a `ip:porta`, si mandano i byte e si chiude.
   - Se va bene → `DELETE {nome}`.
   - Se fallisce → `stato: "da_stampare"` ed `errore`, poi si riprova dopo 2, 4, 8… secondi.
   - Al 5° tentativo fallito → `stato: "errore"`: la cassa avvisa e offre «Riprova» / «Scarta».
5. **Battito**: ogni 30 secondi
   ```
   POST .../documents:commit
   ```
   - Aggiorna `{base}/agenti_stampa/{id}` con `nome`, `tipo` (`esp32` / `pc`), `versione`, `ip_locale`, `stampate` e `ultimo_errore`.
   - Imposta `ultimo_contatto` con l'ora del server (`setToServerValue: REQUEST_TIME`).
   - Prima legge il documento: se c'è `disattivato: true` (pulsante «Scollega» in cassa), l'agente si ferma e dimentica il token.
   - Il primo battito dopo un collegamento nuovo (email e password) scrive `disattivato: false`. Così un agente scollegato dalla cassa e poi ricollegato non si ferma di nuovo.
   - `tipo`: `windows`, `pc` o `esp32`, mostrato in cassa.
   - La cassa considera l'agente spento dopo 90 secondi senza battito.

## Prove

`test/agente-stampa.test.mjs` prova l'agente con gli emulatori di Firebase e stampanti finte; `test/programma-agente.test.mjs` il programma per Windows (pagina, collegamento, Scollega, ripresa della rete, aggiornamento):
```
npx firebase-tools@13.29.1 emulators:exec --only auth,firestore --project demo-gestionale "node test/agente-stampa.test.mjs"
npx firebase-tools@13.29.1 emulators:exec --only auth,firestore --project demo-gestionale "node test/programma-agente.test.mjs"
```
