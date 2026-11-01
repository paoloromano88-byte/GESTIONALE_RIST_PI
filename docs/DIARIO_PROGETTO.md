# Diario del progetto – Gestionale Ristoranti

Il gestionale è derivato da "Da Mimmo" e va **venduto a più locali**. Il **Super Admin**
(il titolare del software) è completamente separato dai locali.

Questo file riassume quanto fatto finora, le decisioni prese e come riprendere il lavoro.
Va aggiornato a ogni tappa importante. Non è pubblicato sul sito: `docs/**` è escluso
dall'hosting in `firebase.json`.

**Ultimo aggiornamento:** 01/11/2026: marketing ripreso, sito vetrina **Gestì** riportato sull'ultima versione (sezione 2, «Marketing: Gestì»), cambio password dal Super Admin, file privati non più pubblicati (sezione 7).

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
| `superadmin.html` | **Super Admin**: crea i locali, licenze e moduli, account dei locali, link da mandare al cliente | titolare del software |
| `agente-windows.html` | Scarica il **programma di stampa per Windows** (Agente di stampa), con le istruzioni | cliente / installatore |
| `esp32.html` | Programma un **ESP32-C3** come Agente di stampa, dal browser via USB (ESP Web Tools 10.2.1), e istruzioni | titolare / installatore |

File condivisi:
- `login-dispositivo.js`: accesso del dispositivo con l'account del locale e controllo della scheda `utenti`.
- `sanitize.js`: protezione da HTML iniettato (`escapeHtml`, `sanitizeHtml`, `safeId`).
- `protezione.js` (PR #54): blocca tasto destro (fuori dai campi di testo), F12, Ctrl+U/S, Ctrl+Shift+I/J/C/K e trascinamento immagini in tutte le app. È solo un deterrente: il codice resta leggibile a chi sa come fare. La sicurezza vera è nelle regole e nel server, e nel codice non ci sono segreti.
- `licenza-locale.js`: blocca la pagina se l'abbonamento è sospeso o il suo modulo è spento (Telecomando, App Rider, Mappa Sale).
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
- **Sezioni del menu aggiunte dal locale** (oltre a pizze, stirate, bibite, primi…):
  - si creano in Cassa → Gestionale → Menu → «📂 Sezioni del menu». Si possono rinominare, spostare ▲▼ ed eliminare, ma solo se non hanno prodotti;
  - stanno in `impostazioni/categorie` → `sezioni: [{ id, nome, reparto, aggiunte, app_clienti }]`. L'id è `sez_…` e viene dal nome (es. «Fritti misti» → `sez_fritti_misti`): non cambia se si rinomina la sezione. Il documento è leggibile da tutti (App Clienti e Menu QR), ma lo scrive solo il personale;
  - le funzioni comuni sono in `categorie-menu.js`: nome→id, pulizia dei dati, ordine ed etichette delle pagine, ingredienti sì/no, reparto. Le prove sono in `test/categorie-menu.test.mjs` e girano senza emulatore;
  - **reparto** (Pizzeria/Cucina/Bar): alla creazione la sezione viene spuntata nelle stampanti di quel reparto (`impostazioni/stampanti`). Viene spuntata anche nel Monitor Cucina (`impostazioni/kds`), ma solo se è già configurato; altrimenti il KDS la mette da solo nel suo reparto. Le comande dell'ordine seguono le spunte delle stampanti, come per tutte le categorie. Anche i messaggi alla cucina (aggiunte, storni, VIA TURNO) seguono le spunte, ma solo per le sezioni: le categorie di sempre seguono le regole fisse di `comande-escpos.js`, invariate. Per questo cassa e server passano `stampanti` nel contesto di stampa;
  - **aggiunte**: se si possono aggiungere o togliere ingredienti (Cassa, Sala, App Clienti). **app_clienti**: se la sezione si ordina dall'App Clienti. Il Menu QR le mostra tutte;
  - compaiono in Cassa (menu, Back Office, statistiche, spunte di stampanti e KDS), Sala, Telecomando (solo se hanno prodotti), App Clienti, Menu QR e Monitor Cucina;
  - limite: il carico del forno conta solo pizze, stirate, speciali e senza glutine, non le sezioni.
- **Disposizione dei tavoli (Mappa Sale)**:
  - quella **standard**, uguale per tutti i giorni, è in `impostazioni/mappa_sala` (sale, tavoli, elementi);
  - un giorno può averne una **speciale** in `mappe_giorno/{AAAA-MM-GG}`, con gli stessi campi: vale solo per quella data. I giorni senza disposizione speciale usano la standard;
  - nella Mappa Sale si sceglie il giorno in alto. In basso c'è scritto «⭐ Disposizione standard» oppure «📅 Disposizione speciale del …»;
  - «SALVA» chiede se salvare **solo per il giorno scelto** o **per tutti i giorni**. Il pulsante «↺ Standard» dell'editor cancella la disposizione speciale del giorno;
  - uscendo dall'editor con modifiche non salvate chiede se salvarle;
  - le altre app (Sala, Agenda, Cassa) non leggono la disposizione: usano solo i numeri dei tavoli.
  - Pannello dell'editor compatto: in alto la barra con giorno e SALVA; subito sotto, se c'è, la scheda dell'oggetto selezionato; poi «Aggiungi» (8 pulsanti in una griglia) e il perimetro della sala, chiuso. Sul telefono il pannello è alto al massimo il 46% dello schermo. Lo spazio sotto la mappa e i pulsanti dello zoom seguono la sua altezza vera (variabile CSS `--h-pannello`).
- **Schede account** `utenti/{uid}`, una per ogni account email/password:
  - Super Admin: `ruolo: "superadmin"`;
  - personale di un locale: `ruolo: "locale"`, `locale: "<id-locale>"`. Per Da Mimmo serve `locale: "default"`, minuscolo e senza spazi.
  - ⚠️ Se `locale` manca, le regole rifiutano ogni salvataggio ("Missing or insufficient permissions"). Ora le app mostrano subito "Account senza locale assegnato" con il codice dell'account (PR #22).
  - Gli account creati da Super Admin → "Account del Locale" hanno già la scheda completa.
- **Immagini** (logo, foto dei prodotti, foto in Agenda): vengono compresse e salvate **dentro il database** (Firestore). Sono quindi protette dalle stesse regole per locale.
  - **Logo del locale**: ogni ristorante carica il suo in Cassa → Gestionale → Impostazioni (`impostazioni/negozio.logo_url`). Compare in:
    - App Clienti e Menu;
    - icona di tutte le app, cioè scheda del browser e schermata Home dell'iPhone (`logo-locale.js`, PR #38);
    - notifiche «Pronto» al rider.
  - Senza logo si usa `logo.png`: un'icona neutra uguale per tutti, cioè forchetta e coltello dorati su fondo scuro (icona «utensils» di Font Awesome Free, licenza CC BY 4.0). Prima era un file rotto.
  - «🗑️ Rimuovi logo» (accanto alla scelta del file, visibile solo se c'è un logo) chiede conferma e cancella `logo_url`. Scarta anche un logo scelto per sbaglio e non ancora salvato. Le app aperte tornano subito all'icona di base, comprese App Clienti e Menu.
  - L'icona dell'App Rider aggiunta alla schermata Home di **Android** è sempre quella neutra (`delivery.webmanifest`); su iPhone è il logo del locale.
- **Sito anonimo** (decisione del 27/10/2026, PR #38): il programma si vende a più locali, quindi nel codice non c'è più niente di Da Mimmo.
  - Finché un locale non inserisce i suoi dati (Cassa → Gestionale → Impostazioni: nome, sottotitolo, telefono, logo) le app mostrano diciture neutre:
    - «CASSA», «KDS», «Agenda», «Menu»;
    - nell'App Clienti «Ordina online», senza telefono;
    - nella privacy, come titolare, «il gestore del locale che riceve l'ordine».
  - Il locale principale (`default`) non ha più nomi di riserva; gli altri locali usano il loro codice (es. «PIZZERIA BELLA»).
  - Tolti anche: il telefono 0965 370013 scritto nell'App Clienti, «Da Mimmo - Restaurant & Pizza» nella privacy, la cartella Olivetti del PC di Da Mimmo, gli esempi con CAP e prefissi di Reggio Calabria e il file `sfondo.jpg` (non usato, conteneva solo testo).
  - Le chiavi del telefono del cliente nell'App Clienti (carrello, accesso, indirizzo, ultimo ordine) ora iniziano con `app_`. Quelle vecchie si spostano da sole una volta, senza perdere niente.
  - Il diario (`docs/`, non pubblicato) e il nome del progetto Firebase restano come sono.
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
   - **Anche con l'app chiusa** (PR #36): notifica push «🍕 Pronto da ritirare · Cognome Nome · ore HH:MM». Toccandola si apre l'App Rider.
   - Il rider la attiva una volta con «🔔 … ATTIVA» in alto. Il telefono si iscrive in `notifiche_rider/{token}` col suo nome; a «Fine turno» l'iscrizione si cancella, e al rider successivo si rifà da sola.
   - La manda il server (`functions/avvisi-rider.js`, trigger `avvisoRiderPrincipale` / `avvisoRiderLocali`). Destinatari: il rider che ha preso l'ordine; se nessuno l'ha preso, tutti i rider iscritti del locale. Solo ordini a domicilio di oggi (ora italiana), non consegnati.
   - Usa Firebase Cloud Messaging con la chiave web predefinita di Firebase. Il service worker è `firebase-messaging-sw.js`, alla radice del sito. I telefoni che non ricevono più si tolgono da soli dall'elenco.
   - Dalla PR #38 il server manda **solo dati** (titolo, testo, tag, link, locale). La notifica la compone il service worker, perché il messaggio FCM non può contenere l'immagine (massimo 4 KB):
     - legge il logo del locale da Firestore (`impostazioni/negozio`, lettura pubblica, solo il campo `logo_url`). Se non c'è, o se la lettura impiega più di 3 secondi, usa `logo.png`;
     - toccando la notifica torna all'App Rider se è aperta, altrimenti la apre;
     - con l'app aperta sullo schermo la libreria non mostra la notifica, perché l'avviso lo dà l'app.
   - **Android** (Chrome): funziona dal browser.
   - **iPhone** (iOS 16.4 o più recente): solo se l'App Rider è aggiunta alla schermata Home (Condividi → «Aggiungi alla schermata Home») e aperta da lì. L'app lo spiega da sola. `delivery.webmanifest` serve a questo.
   - Nell'emulatore non c'è FCM: le notifiche finiscono in `_push_emulatore` per i test.
   - ✅ Provato a Da Mimmo il 27/10/2026 con un telefono Android e l'app chiusa: la notifica arriva.
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
- **Certificato e chiave di QZ Tray** (PR #34):
  - ogni locale ha la sua chiave RSA 2048 e il suo certificato autofirmato (10 anni, CN «Gestionale Ristoranti - <locale>»). Li crea la cassa la prima volta che si collega a QZ Tray o quando si preme «Scarica certificato»;
  - stanno in `impostazioni/qz_firma` del locale. Li leggono solo il personale del locale e il Super Admin: niente regole nuove, perché `qz_firma` non è tra le impostazioni pubbliche;
  - la cassa firma ogni richiesta (SHA512withRSA) sul PC, quindi la stampa resta veloce. La chiave non è più scritta in `cassa.js`;
  - la vecchia chiave è ancora nella storia di git: è da considerare pubblica. Per questo sul PC della cassa va installato il certificato **nuovo**, e quello vecchio smette di valere;
  - installazione: Gestionale → Stampanti → «Certificato QZ Tray» → «Scarica certificato». Il file `override.crt` va nella cartella di QZ Tray (Windows: `C:\Program Files\QZ Tray`), poi si riavvia QZ Tray;
  - finché non è installato, QZ Tray mostra «Invalid Certificate / Untrusted website» e chiede il permesso a ogni stampa. Se resta così anche dopo il riavvio, controllare se `qz-tray.properties` ha una riga `authcert.override` che punta a un altro file;
  - «Crea un certificato nuovo» cambia chiave e certificato (es. se un dispositivo del locale è stato rubato). Va poi reinstallato sul PC;
  - strada più severa per il futuro: firma su una Cloud Function, così la chiave non arriva mai sui dispositivi. Serve dare all'account del deploy il ruolo «Amministratore Cloud Run» per le funzioni chiamabili dal browser.
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
  - legge la coda senza i byte da stampare (10 comande per giro) e scarica i byte di una comanda solo al momento di stamparla (dalla versione 1.0.1; prima 3 per volta con i byte, e quelle di una stampante spenta bloccavano le altre).
- Agenti (PC ed ESP32, versione 1.0.1): se dopo la stampa la rete non risponde, la comanda **non** si ristampa; resta «in stampa» e si toglie dalla coda al giro dopo. «Riprova tutte» in cassa non rimette in coda le comande che un agente sta stampando in quel momento.
- Il firmware lo compila **GitHub** (`.github/workflows/firmware-esp32.yml`: arduino-cli, core esp32 3.0.7, ArduinoJson 7.2.1, `CDCOnBoot=cdc`, `FlashMode=dio`):
  - lo fa a ogni anteprima e a ogni pubblicazione, e i file finiscono in `firmware/` sul sito;
  - sono quattro parti (bootloader 0x0, partizioni 0x8000, boot_app0 0xe000, programma 0x10000): un aggiornamento non cancella Wi-Fi e accesso salvati (NVS a 0x9000);
  - in questa sessione non si può compilare: i siti degli strumenti ESP32 sono bloccati.
- **Programma per Windows** (PR #47, deciso il 27/10/2026, issue #46)
  - **Perché**: per un cliente lontano l'ESP32 è scomodo. Va comprato e programmato via USB (cavo dati, a volte il tasto BOOT), e ogni aggiornamento richiede di ricollegarlo al computer.
  - **Stampanti «cloud» scartate**: Epson Server Direct Print e Star CloudPRNT esistono solo su certi modelli. Le termiche comuni non le hanno: per esempio la NS-8360L di Da Mimmo (USB + rete, porta 9100).
  - **Ora si consiglia il programma per Windows**; l'ESP32 resta per chi non ha un PC acceso durante il servizio, e QZ Tray resta (serve anche per l'Olivetti).
  - **Cos'è**: `agente-stampa/programma.mjs`, cioè l'agente di `agente.mjs` con una pagina di controllo su `http://127.0.0.1:17917`. Il cliente:
    1. lo scarica dalla pagina `agente-windows.html` (Gestionale → Stampanti → «Scarica il programma per Windows»);
    2. installa con doppio clic, senza permessi di amministratore;
    3. scrive email e password del locale nella pagina che si apre.
  - **Cosa fa**:
    - parte con il PC, senza finestre;
    - la pagina mostra le stampanti della cassa con «Prova» e ha «Cerca stampanti» (porta 9100 sulla rete del PC);
    - mostra un avviso se in cassa è ancora scelto QZ Tray;
    - **si aggiorna da solo**: ogni 6 ore legge `programmi/agente-stampa-windows.json`, ma non se ha stampato negli ultimi 10 minuti.
  - **Costruzione**: lo fa GitHub su Windows a ogni anteprima e pubblicazione (`.github/workflows/agente-windows.yml`):
    - Node.js «single executable» + Inno Setup;
    - prova vera: installa, controlla la pagina, processo unico e senza finestra, aggiornamento silenzioso, disinstalla;
    - se il programma non cambia riusa l'installatore già provato (cache);
    - i file vanno in `programmi/` sul sito.
  - **Per aggiornare gli agenti dei clienti**: aumentare `VERSIONE` in `agente-stampa/agente.mjs`.
  - **Da sapere**:
    - Windows al primo avvio dice «Windows ha protetto il PC» (programma senza firma digitale): «Ulteriori informazioni» → «Esegui comunque». Per toglierlo serve un certificato di firma del codice, a pagamento ogni anno;
    - il PC non deve andare in sospensione.
  - **Corretto anche** (agente PC 1.1.0 ed ESP32 1.0.2): un agente scollegato dalla cassa e poi ricollegato si staccava di nuovo dopo 30 secondi. Ora il primo battito dopo il collegamento scrive `disattivato: false`.
  - **Minuti di GitHub**: la costruzione su Windows conta il doppio nei minuti gratuiti di GitHub Actions. Con la cache gira davvero solo quando cambia l'agente.

### Scontrino fiscale: il gestionale NON è fiscale (decisione del 26/10/2026)
- Ogni locale stampa il **preconto** dal gestionale e batte il totale sul **proprio registratore di cassa**, di qualunque marca. Così non serve nessun accordo con l'Agenzia delle Entrate.
- Su preconto, conto e riepilogo Z c'è scritto **"DOCUMENTO NON FISCALE"**; il conto si intitola "CONTO" e non più "RICEVUTA".
- Incasso senza registratore collegato:
  - i pulsanti si chiamano **"INCASSA (Contanti/Carta)"** e non c'è più "FISCALE";
  - un riquadro ricorda di battere il totale sul registratore;
  - alla fine compare "Ora batti € X sul registratore di cassa", con la quota a testa se il conto è diviso.
- **Olivetti** (solo chi ha ElaExecute sul PC della cassa e QZ Tray): si collega in Gestionale → Stampanti → "Scontrino fiscale", scrivendo la cartella IN di ElaExecute.
  - Il valore è salvato in `impostazioni/stampanti`, campo `fiscale: { modo: "nessuno" | "olivetti", cartella }`.
  - Ogni locale, Da Mimmo compreso, parte da "Nessuno: batto il totale a mano" finché non sceglie e salva l'Olivetti con la sua cartella. Fino alla PR #38 il locale `default` aveva come riserva la cartella del PC di Da Mimmo, scritta nel codice: è stata tolta per rendere il sito anonimo.
- Strade valutate e scartate per ora:
  - scontrino online tramite servizi a pagamento che usano la procedura "Documento commerciale online" dell'Agenzia;
  - software certificato (provvedimento del 7/3/2025, operativo secondo gli addetti dal 2027).
  - Se un giorno servirà, si riparte da qui.

### Regole di sicurezza (`firestore.rules`)
- Super Admin: tutto.
- Personale: solo il proprio locale. La licenza la cambia solo il Super Admin.
- **Licenza e moduli** (`impostazioni/licenza`, dalla PR #47):
  - `attiva: false` blocca tutte le pagine;
  - `moduli.<nome> === false` blocca solo la sua pagina:

    | Modulo | Pagina |
    |---|---|
    | `cassa` | Cassa |
    | `telecomando` | `ordini.html` |
    | `sala` | Palmare Sala |
    | `agenda` | Agenda |
    | `kds` | Monitor Cucina (scrive anche `kds_sbloccato`) |
    | `app_clienti` | `index.html` |
    | `rider` | `delivery.html` |
    | `menu` | Menu QR |

  - Mappa Sale non ha un modulo suo: è usata da Cassa, Sala e Agenda.
  - Un modulo che manca nella licenza vale acceso: i locali creati prima restano con tutto acceso.
  - Nel Super Admin link, testo «Copia tutti i link» e caselle dei moduli nascono da un solo elenco (`APP_LOCALE` in `superadmin.html`). Un'app nuova si aggiunge lì, e la sua pagina deve controllare il suo modulo.
- Pubblico (clienti):
  - legge menu, ingredienti, contatori forno/consegne e alcune impostazioni;
  - controlla **un** codice sconto alla volta (`codici_sconto/{CODICE}`, copia tenuta allineata dalla cassa): l'elenco dei codici (`sconti`) lo vede solo il personale;
  - lascia una richiesta di demo dal sito vetrina (`richieste_demo`, solo creazione; la legge solo il Super Admin);
  - crea ordini validi;
  - segue i propri ordini tramite ID o con il telefono verificato via SMS.
- Il pubblico **non** può toccare scorte, rubrica o contatori: lo fa solo il server.

### Marketing: Gestì (decisioni del 27/10/2026)
- **Nome del prodotto: Gestì** (generico: pizzerie, ristoranti, pasticcerie, forni, bar). Da verificare prima di investire: dominio libero (es. gesti.app, gestiapp.it), marchio su UIBM/TMview, nome su Instagram/Facebook.
- **Vendita:** tutta Italia, la fa il titolare di persona (videochiamate di 20 minuti + prime visite vicino a casa), budget pubblicitario quasi zero: gruppi Facebook di ristoratori, video brevi, passaparola premiato (1 mese gratis a chi porta un cliente e al nuovo), partner pagati solo a vendita fatta (rivenditori di registratori di cassa, commercialisti, fornitori).
- **Prezzi:** «Ordini Online» 39 €/mese (App Clienti, menu QR, cassa, comande, App Rider); «Locale Completo» 69 €/mese (+ palmare sala e mappa, schermo cucina, agenda). 30 giorni gratis, nessuna commissione, nessun vincolo; primi 10 locali con attivazione gratuita e prezzo bloccato; annuale con 2 mesi in regalo; attivazione 99 € dopo i primi 10. Prezzi IVA esclusa (da confermare col commercialista). I pacchetti corrispondono ai moduli del Super Admin.
- **Messaggio principale:** «ordini online senza commissioni» (le piattaforme trattengono circa 15-30% per ordine) + «nato in una pizzeria vera».
- **Sito vetrina** `gesti/index.html` (online su `/gesti/`): funzioni, calcolatore del risparmio, prezzi, domande, modulo «Richiedi una demo». Immagini in `gesti/img/` fatte con dati finti («Pizzeria Demo»). Il modulo scrive in `richieste_demo` (solo creazione, campi controllati dalle regole); le richieste si vedono nel **Super Admin** in alto («Richieste di demo dal sito»).
- **Prima di pubblicizzare la pagina:** completare `TITOLARE` nell'informativa privacy di `gesti/index.html` (nome e P.IVA del titolare); poi comprare il dominio e collegarlo (meglio un secondo sito di Firebase Hosting solo per la vetrina).
- **Da preparare dopo:** locale DEMO con dati finti per le videochiamate, presentazione per le visite, contratto di abbonamento e accordo privacy da «responsabile del trattamento» (da far vedere a un avvocato/commercialista), caso Da Mimmo con numeri veri (con il suo permesso), costo per locale (SMS dell'App Clienti).

## 3. Pubblicazione (GitHub Actions)

- Ogni modifica va su un ramo, poi si apre una **PR**:
  - partono i test con gli emulatori;
  - si crea un'**anteprima** Firebase, il cui link compare nei commenti della PR.
- Il titolare prova l'anteprima e scrive **"unisci"**.
- Al merge su `main` (`firebase-hosting-merge.yml`):
  1. test;
  2. **backend**: Cloud Functions e regole Firestore;
  3. **sito**, solo se il backend è andato a buon fine.
- **Versione sempre aggiornata sui dispositivi** (PR #38): in `firebase.json` c'è `Cache-Control: no-cache` per tutti i file del sito.
  - Il browser chiede ogni volta se il file è cambiato. Se non è cambiato riceve solo un «304» grazie all'ETag, quindi non lo riscarica.
  - Prima Firebase lasciava ai browser fino a un'ora di copia vecchia: dopo un aggiornamento un telefono poteva avere ancora la Cassa di prima (successo il 27/10 con l'anteprima del pulsante «Rimuovi logo»).
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
npx firebase-tools@13.29.1 emulators:exec --only auth,firestore --project demo-gestionale "node test/programma-agente.test.mjs"
npx firebase-tools@13.29.1 emulators:exec --only auth,functions,firestore --project demo-gestionale "node functions/test/comande.test.mjs"
npx firebase-tools@13.29.1 emulators:exec --only firestore --project demo-gestionale "node functions/test/ordini.test.mjs"
npx firebase-tools@13.29.1 emulators:exec --only functions,firestore --project demo-gestionale "node functions/test/trigger.test.mjs"
npx firebase-tools@13.29.1 emulators:exec --only auth,functions,firestore --project demo-gestionale "node functions/test/cambio-password.test.mjs"
node test/file-pubblicati.test.mjs
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
| #36 | **Avviso "pronto" al rider anche con l'app chiusa**: notifiche push (Firebase Cloud Messaging), da attivare una volta nell'App Rider; su iPhone dall'app aggiunta alla schermata Home |
| #38 | **Logo di ogni locale** come icona di tutte le app e nelle notifiche al rider; icona neutra al posto di `logo.png` rotto |
| #41 | **Controllo generale del codice**: testi dei clienti mai eseguiti come codice, codici sconto riservati, Super Admin (ID nuovi, account scollegati), controllo prezzi più severo; stampa (cambio turno, niente doppie stampe dell'agente, ESP32 1.0.1, date italiane, domicilio); forno, statistiche, accesso senza internet. Dettagli nella sezione 7 |
| #45 | **Pulsanti della scheda ordine in Cassa**: PIZZA/CUCINA/BAR e PRECONTO dicono sempre com'è andata la stampa; preconto sulla stampante CASSA se manca la sua; scritte intere |
| #47 | **Agente di stampa come programma per Windows**: si scarica dal gestionale, si collega dal browser, parte con il PC, cerca e prova le stampanti, si aggiorna da solo. Al posto dell'ESP32 per i clienti lontani. **Super Admin**: link e moduli per tutte le app (App Rider, Mappa Sale, programma di stampa; moduli App Clienti e App Rider); Telecomando e Menu QR ora si spengono davvero (#48) |
| #65 | **Mappa Sale, disposizione per giorno**: oltre alla disposizione standard, ogni giorno può avere la sua (es. una cena di gruppo), salvata solo per quella data |
| #77 | **Sezioni del menu aggiunte dal locale**: oltre alle categorie di sempre, il locale crea le sue (es. Panini, Fritti, Gelati) con reparto di stampa, ingredienti sì/no e visibilità nell'App Clienti |
| #34 | **QZ Tray**: tolta dal codice la chiave privata. Ogni locale ha chiave e certificato suoi (in `impostazioni/qz_firma`), da scaricare in Gestionale → Stampanti e installare come `override.crt` |

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
- #17 regole di Firebase Storage (Storage non attivo: immagini nel database);
- #16 chiave privata di QZ Tray nel codice (ora una per locale, nel database);
- #35 avviso "pronto" al rider anche con l'app chiusa;
- #37 logo di ogni locale come icona delle app e delle notifiche.

**Da fare, in ordine**: nessuna issue di sicurezza aperta. Sul posto:
1. ✅ Certificato QZ nuovo installato sul PC della cassa di Da Mimmo (27/10/2026, dopo la PR #34): le stampe funzionano. Il certificato vecchio non vale più.
2. provare il **programma per Windows** (#46) su un PC vero con le stampanti del locale: installazione, «Prova», «Cerca stampanti», comande con la cassa chiusa;
3. (meno urgente) provare l'**ESP32-C3** con l'apparecchio vero.

**Stampa senza QZ Tray con ESP32** (#28, deciso il 26/10/2026), in tappe:
1. ✅ Coda di stampa, Agente per PC, semaforo e avvisi (PR #29).
2. ✅ Firmware ESP32-C3 SuperMini (il modello del titolare) e pagina `esp32.html` (PR #29). **Da provare con l'apparecchio vero**: non è stato possibile provarlo qui.
3. ✅ Comande preparate dal server (PR #31): con l'Agente di stampa si stampa anche a cassa chiusa.

Altre strade valutate: stampa dal browser (una sola stampante, finestra «Stampa»); stampanti Star CloudPRNT / Epson Server Direct Print (solo certi modelli); Monitor Cucina (KDS) al posto della carta.

Da verificare sul posto:
- **QR sugli scontrini**: al primo ordine a domicilio, controllare che il QR esca nitido dalla stampante vera e che il rider lo scansioni. Non è stato provato con una stampante reale. Se esce male, servono il modello della stampante e una foto dello scontrino. Alternative: comando QR nativo `GS ( k`, oppure moduli più grandi in `rasterQrBase64`.

**Sito vetrina Gestì e marketing: ripreso il 01/11/2026** (era in pausa dal 27/10).
- I 4 commit della PR #43 (chiusa senza unire) sono stati riportati sull'ultima `main` in una PR nuova, che chiude l'issue #42. Logo scelto: la «G» arancione con la stellina gialla.
- Aggiunti rispetto alla PR #43:
  - anteprima nei social con indirizzi completi (`og:image`, `og:url`), da cambiare quando c'è il dominio;
  - `gesti/` nel test dei file pubblicati;
  - la prova nel browser salvata in `test/browser/gesti.cjs` (sito su telefono e PC, calcolatore, modulo con le regole vere, richieste nel Super Admin con testo «trappola», «Richiamato», «Elimina»).
- **Prima di pubblicizzare la pagina restano:** nome e P.IVA del titolare in `TITOLARE` (`gesti/index.html`, informativa privacy) e il dominio.

Idee per dopo (non richieste):
- ~~Togliere "Prendi a mano" dall'App Rider~~: **deciso di lasciarlo** (27/10/2026), serve se il QR non si legge.
- Ritocchi minori su smartphone (rimandati il 27/10/2026: la Cassa si userà soprattutto dal PC):
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

### Controllo generale del 27/10/2026 (PR #41)
Controllo automatico di tutto il codice più prove a mano; tutto corretto nella stessa PR.
- **Sicurezza**
  - Testi dei clienti eseguiti come codice: nome, note o piatti di un ordine dall'App con dentro HTML venivano inseriti così com'erano in Cassa (Statistiche, Storico), Palmare Sala, Agenda, Mappa sala, Telecomando. Ora tutto passa da `escapeHtml`/`sanitizeHtml` (`sanitize.js`, caricato anche da Sala, Agenda e Mappa sala). Per gli argomenti di `onclick` c'è `argJs`, per le foto allegate `immagineSicura`. Prova: ordini con testi "trappola" in ogni campo aperti in tutte le pagine del personale, nessuno eseguito.
  - SweetAlert2: `title` e `html` sono HTML, `text` no. Un dato del cliente nel titolo va sempre protetto.
  - Codici sconto elencabili da chiunque → ora `codici_sconto/{CODICE}` (solo lettura del singolo codice).
  - Super Admin: due ristoranti con lo stesso nome finivano sullo stesso ID (e sugli stessi dati); un cliente eliminato lasciava attivi i suoi account. Ora l'ID è sempre nuovo («da-mario-2»), il cliente eliminato resta in `saas_clienti` con `eliminato: true` e i suoi `utenti` vengono scollegati. I dati restano.
  - Controllo prezzi (server): quantità negative/con la virgola/enormi, prodotti non in listino, "a peso" finti e Bi-Gusto sotto prezzo ora sono anomalie. Le pizze Gluten Free (stesso nome della normale) si riconoscono dalla categoria.
- **Stampa**: cambio turno da solo non stampato; agente che ristampava se la rete cadeva dopo la stampa; ESP32 bloccato da una stampante spenta; «Riprova tutte» che falliva in silenzio; "PER IL" domani tra mezzanotte e l'una (date in UTC); cassa che non vedeva il cambio QZ/Agente fatto da un altro dispositivo; IP di riserva fisso `192.168.1.131` per i messaggi; comanda d'asporto stampata come domicilio con l'indirizzo di un vecchio ordine (la cassa ora passa l'ordine alla stampa).
- **Dati**: forno contato due volte (ora il server ricalcola il giorno dagli ordini, come la cassa); la cassa scaricava tutti gli ordini della storia a ogni apertura; pizze a domicilio contate male nelle statistiche; senza internet all'apertura i dispositivi dicevano «Account non abilitato» e restavano bloccati.
- Il test "Trigger Cloud Functions end-to-end" ora fallisce davvero se il trigger non parte.

### Pulsanti della scheda ordine in Cassa (27/10/2026)
- PIZZA / CUCINA / BAR, PRECONTO e la ristampa dallo Storico passano da `stampaOrdine(id, reparto, manuale, ordine)` in `cassa.js`. Se premuti dal cassiere dicono sempre com'è andata: inviata / in coda per l'Agente, niente da stampare per quel reparto, stampante non impostata, stampa non uscita (QZ Tray spento). Le comande automatiche degli ordini nuovi restano silenziose: i problemi li mostra il semaforo.
- Il preconto, senza una stampante apposta, esce sulla stampante CASSA.
- Pulsanti della scheda su due righe (3 + 2): prima su PC le scritte erano tagliate («MODIFIC», «PRECON»).

### Aggiunte e rimozioni dal menu (27/10/2026)
- In Gestionale → Aggiunte, «IMPORTA DA MENU» creava **rimozioni** invece di aggiunte: chiamava `generarimozioniAuto()`.
- Ora `importaDaPizze()`:
  - prende gli ingredienti dei prodotti del menu che non sono ancora tra le aggiunte;
  - li mostra e chiede il prezzo di ognuno (proposto 1,00 €);
  - li crea in `ingredienti`.
- Aggiunte e rimozioni usano lo stesso elenco, `ingredientiNuoviDalMenu()`. I doppioni si riconoscono senza maiuscole e senza spazi ai lati: prima «Mozzarella» e «mozzarella» diventavano due voci.

### Menu del Gestionale: eliminare un prodotto (27/10/2026)
- Eliminando un prodotto compariva «Errore: window.caricaProdotti is not a function». Il prodotto veniva eliminato, ma `eliminaDB` chiamava una funzione che non è su `window`.
- `caricaProdotti()` apriva un nuovo ascolto dei prodotti a ogni apertura della scheda Menu: liste ridisegnate più volte e letture in più. Ora l'ascolto è uno solo e le volte dopo si ridisegna soltanto (`disegnaProdottiGestionale()`).
- Tolto da `cassa.html` il vecchio riquadro «ACCESSO LOCALE / Collega Database»: non si apriva mai e chiamava `window.loginAzienda()`, che non esiste.
- Controllo automatico su tutte le pagine: nessun'altra chiamata `window.X()` verso funzioni inesistenti.

### Collaudo completo (31/10/2026, PR #54)
- **Server e database**: 7 gruppi di prove con gli emulatori, **257 controlli, tutti superati**:
  - regole 189;
  - agente 7 e programma Windows 9;
  - ordini 27, comande 13, avviso rider 10;
  - trigger.
- **Pagine**: tutte le app aperte su PC e telefono, ogni scheda del Gestionale, PIN di Sala, Agenda e Rider, e clic sui pulsanti. Controllato che ogni pulsante chiami una funzione esistente: l'unico errore era la vecchia finestra «Prenotazioni Tavoli» della Cassa (`aggiungiPrenotazione` inesistente, finestra mai aperta), ora tolta.
- **Flussi provati**:
  - Cassa (30/30): incasso, modifica, nuovo ordine al tavolo, storico, statistiche, chiusura Z, salvataggi di dati locale, prodotto, sconto e dipendente;
  - Palmare Sala (12/12): PIN, tavolo, pizze, invio;
  - scanner QR dell'App Rider (12/12).
- **Corretti**:
  - Palmare Sala su telefono: il «+» (nuovo tavolo) usciva dallo schermo;
  - Monitor Cucina su telefono: la barra in alto usciva di lato.
- **Prove vecchie nello scratchpad**: alcune falliscono anche sulla versione di 4 giorni prima, perché simulano Firebase in modo superato (funzioni mancanti nei finti moduli, login prima dell'accesso del dispositivo). Non sono difetti del gestionale. Quelle importanti sono state rifatte (`collaudo/`).

### File privati pubblicati sul sito (01/11/2026)
- La radice del repository è la cartella dell'Hosting. La regola `**/.*` di `firebase.json` escludeva le cartelle nascoste ma **non i file al loro interno**: a ogni pubblicazione finivano online anche `.git/` (la copia del repository fatta da GitHub, con codice e diario) e `.github/`, più i registri degli emulatori (`firestore-debug.log`) se presenti.
- Scoperto simulando la scelta dei file con la stessa funzione di `firebase-tools` usata da GitHub (versione 15.34.2): nella prova 139 file invece di 26 (il numero esatto dipende dalla copia di `.git`). Il sito vero non era raggiungibile dalla sessione: per controllare basta aprire `/.git/HEAD` sul sito (con la correzione deve dare «pagina non trovata»).
- Corretto aggiungendo `**/.*/**` e `**/*.log` a `hosting.ignore`.
- Nuovo test `test/file-pubblicati.test.mjs`, eseguito dalla CI dopo gli emulatori: fallisce se viene pubblicato un file privato (cartelle e file nascosti, `docs/`, `functions/`, `test/`, `agente-stampa/`, `CLAUDE.md`, `firebase.json`, `firestore.rules`, registri). Un file privato nuovo va aggiunto sia a `hosting.ignore` sia al test.
- Dopo il merge, la nuova versione del sito contiene solo i file elencati dal test: quelli di `.git/` e `.github/` smettono di essere serviti (restano solo nella cronologia delle versioni dell'Hosting, non visibile al pubblico).
- Durante il deploy `.git/config` contiene il token temporaneo di GitHub Actions (`GITHUB_TOKEN`, lo toglie la pulizia a fine job): se è stato pubblicato era già scaduto alla fine del job, quindi non utilizzabile.

### Cambio password degli account dei locali dal Super Admin (01/11/2026)
- In Super Admin → Account del Locale ogni account ha il pulsante **🔑 Password**: propone una password di 10 caratteri facili da dettare (modificabile, minimo 6), la cambia e la mostra per comunicarla al locale.
- Cambiare la password chiude le sessioni aperte: cassa, telefoni e Agente di stampa chiedono di rifare l'accesso.
- Come funziona: dal browser non si può cambiare la password di un altro account. La pagina scrive una richiesta in `utenti/{uid}/cambio_password/{id}`, che può scrivere e leggere **solo il Super Admin** (verificato con 8 casi nuovi nel test delle regole). La Cloud Function `cambioPasswordAccount` (`functions/account.js`):
  - prende la richiesta in una transazione e toglie subito la password dal database;
  - cambia la password solo agli account con `ruolo: 'locale'`, mai al Super Admin;
  - scrive l'esito. La pagina lo aspetta fino a 45 secondi e poi cancella la richiesta.
- Scelto un trigger su Firestore e non una funzione chiamabile dal browser (`onCall`), che richiederebbe il ruolo «Amministratore Cloud Run» all'account del deploy (vedi la sezione sulla firma di QZ Tray).
- ✅ Provato in produzione il 01/11/2026 dal titolare su un account di prova: la funzione ha il permesso di modificare gli utenti di Authentication e la password cambia. Se in futuro comparisse «Password non cambiata», il messaggio di Google dice quale permesso manca.
- Test: `functions/test/cambio-password.test.mjs` (in CI) e la prova nel browser `test/browser/superadmin-password.cjs` (primo script salvato in `test/browser/`).

## 8. Come riprendere in una nuova sessione

1. Leggere questo file e le issue aperte su GitHub.
2. Partire dall'ultima versione di `main`.
3. Seguire il modo di lavorare della sezione 4, rispondendo al titolare in italiano con istruzioni semplici, passo per passo.
