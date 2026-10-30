# Pizza al Volo

Gioco arcade per smartphone. Sul fondo c'è una pala con la pizza: si trascina il dito per spostarla
e prendere al volo gli ingredienti che cadono, seguendo la comanda in alto.

- Si prendono solo gli ingredienti che la comanda chiede ancora. Ogni presa giusta vale punti e fa salire la combo (fino a x10).
- Un ingrediente sbagliato, o già completo, toglie una vita. L'**ananas** toglie sempre una vita.
- La comanda ha un tempo: se scade, si perde una vita.
- Bonus: il **cuore** ridà una vita (massimo 5), l'**orologio** rallenta tutto per 5 secondi.
- Ogni pizza servita dà un bonus per il tempo avanzato. La comanda dopo è più lunga e gli ingredienti cadono più veloci.
- Si parte con 3 vite. Il record resta salvato sul telefono.

È un progetto a parte rispetto al gestionale: non è pubblicato sul sito (`gioco/**` è escluso in `firebase.json`).

## Com'è fatto

Il gioco è scritto in JavaScript, senza librerie, e disegnato su un `<canvas>`. [Capacitor](https://capacitorjs.com)
lo mette dentro due app native: `android/` (progetto Android Studio) e `ios/` (progetto Xcode).

| File | Contenuto |
|---|---|
| `src/logica.js` | Regole: comande, punti, vite, velocità. Non disegna nulla, così si prova con `npm test` |
| `src/disegno.js` | Ingredienti, pizza, pala e sfondo disegnati in vettoriale (nessuna immagine) |
| `src/main.js` | Ciclo di gioco, tocchi, punteggio in alto, effetti, schermate |
| `src/suoni.js` | Effetti sonori generati al momento (nessun file audio) |
| `src/nativo.js` | Vibrazione, salvataggio del record, tasto Indietro di Android (plugin Capacitor) |
| `index.html`, `src/stile.css` | Menu, pausa e fine partita |
| `assets/` | Immagini di partenza per icona e schermata d'avvio |
| `test/logica.test.mjs` | Test automatici delle regole |

Su Android e su iPhone l'app resta in verticale. Sull'iPad si può girare.

## Provarlo

Serve Node.js 22 o più recente.

```bash
cd gioco
npm install
npm run dev      # apre il gioco nel browser, anche dal telefono sulla stessa rete Wi-Fi
npm test         # test delle regole
```

Con `?debug&seme=123` nell'indirizzo le partite sono sempre uguali e `window.pizzaAlVolo` permette di controllarle dalla console.

## Android

**Senza installare niente:** a ogni push che tocca `gioco/` GitHub compila l'app (workflow
*Gioco Pizza al Volo (Android)*). Nella pagina dell'esecuzione, in fondo, si scarica `pizza-al-volo-apk`.
Lo zip contiene `app-debug.apk`: si copia sul telefono, si apre e si conferma l'installazione da "origini sconosciute".

**Con Android Studio:**

```bash
npm run android  # build, copia nel progetto Android e apre Android Studio
```

Poi il pulsante ▶ installa l'app su un telefono collegato via USB o sull'emulatore.

**Play Store:**

1. Account Google Play Console (25 $ una volta sola).
2. Prima della prima pubblicazione scegliere l'identificativo definitivo dell'app. Ora è `it.pizzaalvolo.gioco` in `capacitor.config.json`, `android/app/build.gradle` e nel progetto Xcode. Dopo la pubblicazione non si può più cambiare.
3. In Android Studio: *Build → Generate Signed App Bundle*, creando una chiave di firma. La chiave va conservata con cura e non va messa nel repository.
4. A ogni nuova versione aumentare `versionCode` e `versionName` in `android/app/build.gradle`.

## iPhone / iPad

Per compilare per iOS servono un **Mac con Xcode**. Per installare l'app su un iPhone vero serve un Apple ID
(gratuito: l'app resta installata 7 giorni). Per l'App Store serve l'Apple Developer Program (99 $ l'anno).

```bash
npm run ios      # build, copia nel progetto iOS e apre Xcode
```

In Xcode: *Signing & Capabilities* → scegliere il proprio Team, collegare l'iPhone e premere ▶.
Per l'App Store: *Product → Archive* e poi *Distribute App*.

## Dopo una modifica

- Al codice del gioco (`src/`, `index.html`): `npm run sync` copia la nuova versione in entrambe le app.
- All'icona o alla schermata d'avvio: cambiare le immagini in `assets/` e lanciare
  `npx @capacitor/assets generate --ios --android --iconBackgroundColor '#f26a3d' --splashBackgroundColor '#2a160f'`.
