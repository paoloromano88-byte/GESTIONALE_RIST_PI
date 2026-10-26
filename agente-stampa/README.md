# Agente di stampa

Fa arrivare le stampe della cassa (comande, conti, preconti, riepilogo Z) alle **stampanti
termiche di rete** del locale, senza QZ Tray. Funziona con qualunque marca che accetti
ESC/POS sulla porta 9100 (quasi tutte le termiche con presa di rete).

```
Cassa / Sala / App Clienti ──► Firebase: coda_stampa ──► Agente di stampa ──► stampante (IP:9100)
                                                          (nel locale)
```

L'agente può essere:
- un **ESP32** (programma in arrivo nella prossima tappa, stesso protocollo descritto qui sotto);
- un **PC o Raspberry Pi** sempre acceso, con `agente.mjs` (questa cartella).

## Come si attiva

1. In cassa: **Gestionale → Stampanti**:
   - scrivi gli indirizzi IP delle stampanti;
   - in «Come arrivano le stampe» scegli **Agente di stampa (ESP32 o PC)** e salva.
2. Avvia l'agente nel locale (vedi sotto). Si collega con **l'email e la password del locale**, come una cassa.
3. In alto nella cassa compare il semaforo:
   - **STAMPA OK** quando l'agente risponde;
   - rosso lampeggiante se l'agente è spento o una stampante non risponde.
4. Le comande automatiche (ordini da sala, telecomando e App Clienti) le prepara il dispositivo
   con «QUESTO PC È LA CASSA» acceso. Va bene anche un tablet o un telefono, perché QZ Tray non serve.

### Agente su PC o Raspberry Pi

Serve [Node.js](https://nodejs.org) 18 o più recente. Non c'è nient'altro da installare.

```
node agente.mjs
```

- La prima volta chiede email, password del locale e un nome, per esempio «PC cucina».
- La password non viene salvata. Nel file `agente-stampa.json` resta solo il token di accesso: tienilo riservato.
- Per ricollegarlo, ad esempio dopo «Scollega» dalla cassa: `node agente.mjs --collega`.

## Protocollo (per il programma dell'ESP32)

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
   - La cassa considera l'agente spento dopo 90 secondi senza battito.

## Prove

`test/agente-stampa.test.mjs` prova l'agente con gli emulatori di Firebase e stampanti finte:
```
npx firebase-tools@13.29.1 emulators:exec --only auth,firestore --project demo-gestionale "node test/agente-stampa.test.mjs"
```
