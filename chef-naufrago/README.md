# Chef Naufrago

Survival per smartphone. La nave delle provviste è affondata e lo chef è finito su un'isola dove il cibo
ha preso vita. Di giorno si raccoglie, si costruisce e si cucina; di notte arrivano i mostri. Lo scopo è
sopravvivere più giorni possibile.

## Come si gioca

- **Muoversi:** si appoggia il dito in un punto qualsiasi dello schermo e lo si trascina (joystick).
- **Tasto rosso:** fa l'azione giusta per quello che c'è vicino: *Taglia* gli alberi (legna), *Scava*
  le rocce (pietra), *Raccogli* pomodori, grano e funghi, *Colpisci* i mostri; accanto a *Falò* e *Forno* apre la cucina (e al falò si aggiunge legna).
  Si può tenere premuto.
- **Crea:** attrezzi (mattarello, ascia, piccone, coltello da chef) e costruzioni (falò, forno a legna,
  steccato). Una costruzione si piazza davanti allo chef: si cammina per scegliere il posto e si tocca *Posiziona*.
- **Zaino:** risorse, attrezzi e cibo da mangiare.
- **Fame e salute:** la fame scende in fretta; a zero si perde salute. La salute torna da sola solo a
  pancia piena e lontano dai mostri, e molto piano: per curarsi serve cibo cotto. Al falò arrosti, funghi
  trifolati e polpette, al forno pane e pizze (margherita, ai funghi, diavola).
- **Falò:** fa luce solo finché brucia. Parte con 60 secondi di fuoco; ogni legna aggiunta (tasto *Falò*,
  poi *Aggiungi*) ne dà 40, fino a 240. Quando la legna sta finendo la luce si stringe; spento non protegge
  e non cucina.
- **Notte:** dopo 2 minuti cala il buio per un minuto e mezzo. Polpette rabbiose e cipolle piagnone (le loro
  lacrime rallentano) restano fuori dalla luce del falò. Dal secondo giorno arrivano i peperoncini infuocati,
  più veloci dello chef, che il fuoco non lo temono. Ogni 4 notti arriva il **Grande Polpettone**.
  I mostri sono più numerosi e più forti giorno dopo giorno e prendono a morsi gli steccati.
- **Giorno:** dal secondo giorno qualche polpetta gira anche con il sole.
- Alberi e piante ricrescono piano. La partita si salva da sola all'alba, in pausa e ogni 45 secondi.

| Risorsa | Da dove |
|---|---|
| Legna | Alberi (doppia con l'ascia) |
| Pietra | Rocce (doppia con il piccone) |
| Pomodori, grano, funghi | Piante, campi, sottobosco |
| Polpette crude, cipolle, peperoncini | Mostri sconfitti |

## Com'è fatto

Stessa struttura degli altri giochi del repository: JavaScript senza librerie su `<canvas>`, app native
con [Capacitor](https://capacitorjs.com) in `android/` e `ios/`.

| File | Contenuto |
|---|---|
| `src/mondo.js` | Isola generata da un seme: terreno, alberi, rocce, piante; ricerca veloce degli oggetti vicini |
| `src/logica.js` | Regole: movimento e ostacoli, raccolta, attrezzi, costruzioni, cucina, fame, giorno e notte, mostri, salvataggio |
| `src/disegno.js` | Grafica cartoon: costa morbida, oggetti, chef, mostri, fuoco, buio con le luci |
| `src/icone.js` | Icone di risorse, cibi, attrezzi e costruzioni per i pannelli |
| `src/main.js` | Ciclo di gioco, telecamera, joystick, tasti, pannelli, avvisi, salvataggio |
| `src/suoni.js`, `src/nativo.js` | Suoni generati al momento; vibrazione, memoria e tasto Indietro di Android |
| `test/logica.test.mjs` | Test delle regole |

## Provarlo

```bash
cd chef-naufrago
npm install
npm run dev      # nel browser; da computer: WASD o frecce per muoversi, spazio per il tasto azione
npm test
```

Con `?debug&seme=42` nell'indirizzo l'isola è sempre la stessa e `window.chef.gioco()` dà accesso alla partita.

## Android, iPhone e store

Come per gli altri giochi (vedi `gioco/README.md`):

- **APK di prova:** a ogni push che tocca `chef-naufrago/` GitHub lo compila (workflow
  *Gioco Chef Naufrago (Android)*, voce `chef-naufrago-apk` in fondo alla pagina dell'esecuzione).
- **Android Studio:** `npm run android`. **Xcode (serve un Mac):** `npm run ios`.
- L'identificativo dell'app è `it.chefnaufrago.gioco`: va deciso quello definitivo prima della prima pubblicazione.
- Icona e schermata d'avvio: immagini in `assets/`, poi
  `npx @capacitor/assets generate --ios --android --iconBackgroundColor '#39c2e6' --splashBackgroundColor '#39c2e6'`.
