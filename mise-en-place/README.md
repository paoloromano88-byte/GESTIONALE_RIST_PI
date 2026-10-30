# Mise en Place

Puzzle per smartphone. Sul banco della pizzeria ci sono barattoli con gli ingredienti mescolati:
bisogna riordinarli finché ogni barattolo contiene un solo ingrediente.

- Si tocca un barattolo e poi quello di destinazione: si spostano gli ingredienti uguali in cima.
- Si appoggiano solo su un barattolo vuoto o sopra lo stesso ingrediente, finché c'è posto (4 per barattolo).
- Quattro uguali: il barattolo si chiude con il coperchio a quadretti e non si tocca più.
- Dal livello 8 alcuni ingredienti sono incartati e si scoprono solo quando arrivano in cima.
- Aiuti: **Annulla** (senza limiti), **Aiuto** (3 per livello: mostra la mossa giusta con una freccia),
  **Barattolo** (1 per livello: un barattolo vuoto in più).
- Stelle: 3 senza aiuti, 2 se si è usato Aiuto, 1 se si è preso il barattolo in più.
- I livelli si generano da soli e sono infiniti. Ogni livello è sempre uguale per tutti ed è
  controllato da un risolutore prima di essere proposto: ha sempre una soluzione.

Il genere è stato scelto da una ricerca sui dati degli store (ottobre 2026): i puzzle sono il genere
di giochi per smartphone più scaricato, e tra i puzzle i "sort" sono il sottogenere che cresce di più.

È un progetto a parte rispetto al gestionale: non è pubblicato sul sito (`mise-en-place/**` è escluso in `firebase.json`).

## Com'è fatto

Stessa struttura di `gioco/` (Pizza al Volo): JavaScript senza librerie su `<canvas>`, app native con
[Capacitor](https://capacitorjs.com) in `android/` e `ios/`.

| File | Contenuto |
|---|---|
| `src/logica.js` | Regole, generatore dei livelli, risolutore, aiuti, stelle. Non disegna nulla: si prova con `npm test` |
| `src/disegno.js` | Ingredienti, barattoli, coperchi, mensole e marmo disegnati in vettoriale |
| `src/main.js` | Disposizione dei barattoli sullo schermo, tocchi, animazioni, schermate, salvataggio dei progressi |
| `src/suoni.js` | Effetti sonori generati al momento |
| `src/nativo.js` | Vibrazione, salvataggio, tasto Indietro di Android |
| `index.html`, `src/stile.css` | Menu, elenco livelli, barre di gioco, vittoria |
| `assets/` | Immagini di partenza per icona e schermata d'avvio |
| `test/logica.test.mjs` | Test delle regole, della generazione e degli aiuti |

## Provarlo

```bash
cd mise-en-place
npm install
npm run dev      # nel browser, anche dal telefono sulla stessa rete Wi-Fi
npm test
```

Con `?debug` nell'indirizzo, `window.miseEnPlace.gioca(20)` apre direttamente un livello.

## Android, iPhone e store

Come per Pizza al Volo (vedi `gioco/README.md`):

- **APK di prova:** a ogni push che tocca `mise-en-place/` GitHub lo compila (workflow
  *Gioco Mise en Place (Android)*, voce `mise-en-place-apk` in fondo alla pagina dell'esecuzione).
- **Android Studio:** `npm run android`. **Xcode (serve un Mac):** `npm run ios`.
- L'identificativo dell'app è `it.miseenplace.gioco`: va deciso quello definitivo prima della prima pubblicazione.
- Icona e schermata d'avvio: immagini in `assets/`, poi
  `npx @capacitor/assets generate --ios --android --iconBackgroundColor '#2f7d5b' --splashBackgroundColor '#f4efe6'`.
