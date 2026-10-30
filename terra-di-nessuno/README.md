# Terra di Nessuno

Survival con zombie per smartphone. Dopo l'epidemia la campagna è vuota: un paese attraversato dalla
statale, casali isolati, auto ferme in mezzo alla strada, boschi. Di giorno si fruga e si costruisce,
di notte i morti arrivano a ondate. Lo scopo è sopravvivere più giorni possibile.

## Come si gioca

- **Muoversi:** si appoggia il dito in un punto qualsiasi e lo si trascina (joystick).
- **Tasto rotondo:** fa l'azione giusta per quello che c'è vicino: *Fruga* auto, frigoriferi, armadi e
  casse (un luccichio indica quelli ancora da frugare), *Taglia* gli alberi, *Smonta* i rottami,
  *Raccogli* le more, *Colpisci* o *Spara* agli zombie, *Legna* per alimentare il falò, *Acqua* dal raccoglitore.
- **Arma in mano** (riquadro in basso a sinistra): un tocco passa all'arma successiva.
  - Pugni, bastone chiodato, ascia (doppia legna) e machete si consumano a ogni colpo e alla fine si rompono.
  - La balestra usa i dardi ed è silenziosa.
  - La pistola si trova solo nelle auto della polizia. Le munizioni sono rare e lo sparo attira gli zombie da lontano.
- **Crea:** armi, dardi, bende e le costruzioni del rifugio. Barricata e muro di lamiera fermano gli zombie
  finché reggono. La trappola chiodata ferisce chi ci passa sopra. Il falò fa luce e consuma legna.
  Il raccoglitore d'acqua si riempie ogni mattina.
- **Sopravvivere:** fame e sete scendono sempre; a zero si perde salute. Si guarisce da soli solo ben nutriti
  e lontano dai guai, altrimenti servono le bende.
- **Zombie:** di giorno vagano e ti inseguono se ti vedono o se sentono uno sparo. Di notte arrivano dritti
  da te, sempre più numerosi. Dal secondo giorno ci sono i corridori, veloci; dal quarto i corazzati, lenti
  ma resistenti. All'alba quelli della notte rimasti lontani se ne vanno.
- Le case si possono visitare: quando entri il tetto sparisce. Auto e mobili si riempiono di nuovo dopo
  qualche giorno. La partita si salva all'alba, in pausa e ogni 45 secondi.

## Modelli 3D veri

Per ora personaggi, zombie, alberi e auto sono generati dal codice: è una grafica provvisoria.
Il gioco è già pronto a usare modelli 3D veri (file `.glb`). Basta metterli in `public/modelli/`
insieme a un file `indice.json` che dice quale file usare per cosa, per esempio:

```json
{
  "sopravvissuto": { "file": "sopravvissuto.glb", "scala": 30, "animazioni": { "fermo": "Idle", "cammina": "Walk", "attacca": "Punch" } },
  "camminatore": { "file": "zombie.glb", "scala": 30, "animazioni": { "fermo": "Idle", "cammina": "Walk", "attacca": "Attack", "muore": "Death" } },
  "albero": { "file": "albero.glb", "scala": 40 },
  "auto": { "file": "auto.glb", "scala": 22 }
}
```

- **Nomi riconosciuti:** `sopravvissuto`, `camminatore`, `corridore`, `corazzato`, `albero`, `auto`, `polizia`.
- **Valori di ogni modello:** `scala` lo porta alla misura del gioco (una persona è alta circa 56 unità), `rotazione` e `y` lo raddrizzano. `animazioni` collega i nomi delle animazioni del file a fermo, cammina, attacca e muore.
- **Se manca qualcosa:** se mancano corridore o corazzato si usa il modello del camminatore (il corazzato più grande). Tutto ciò che manca resta generato dal codice.

Fonti di modelli gratuiti e liberi da diritti (licenza CC0, utilizzabili anche in un gioco in vendita):
- [Quaternius](https://quaternius.com): pacchetti di personaggi animati, zombie e ambienti;
- [Kenney](https://kenney.nl/assets): Survival Kit, Car Kit, City Kit;
- [Poly Pizza](https://poly.pizza): raccolta di modelli singoli.

## Com'è fatto

Stessa struttura degli altri giochi del repository: regole in JavaScript senza grafica (provate con
`npm test`), scena 3D con [three.js](https://threejs.org), app native con [Capacitor](https://capacitorjs.com).

| File | Contenuto |
|---|---|
| `src/mondo.js` | Mappa generata da un seme: statale e provinciale, paese, casali con muri e porte, auto, boschi, contenitori |
| `src/logica.js` | Regole: movimento tra muri e auto, frugare, armi con usura e munizioni, rumore, costruzioni, fame e sete, zombie, giorno e notte, salvataggio |
| `src/scena3d.js` | Scena 3D: terreno, case (tetto che sparisce da dentro), auto, alberi, zombie animati, rifugio, luci; sopra, barre e scritte |
| `src/modelli.js` | Caricamento dei modelli `.glb` da `public/modelli/` |
| `src/disegno.js` | Texture della mappa vista dall'alto: prati, asfalto, sterrato, sottobosco, pavimenti |
| `src/icone.js`, `src/main.js` | Icone dell'interfaccia; ciclo di gioco, comandi, pannelli, salvataggio |
| `test/logica.test.mjs` | Test delle regole |

## Provarlo

```bash
cd terra-di-nessuno
npm install
npm run dev      # nel browser; da computer: WASD o frecce, spazio per il tasto azione, Q per cambiare arma
npm test
```

Con `?debug&seme=42` nell'indirizzo la mappa è sempre la stessa e `window.terra.partita()` dà accesso alla partita.

## Android, iPhone e store

Come per gli altri giochi (vedi `gioco/README.md`): a ogni push che tocca `terra-di-nessuno/` GitHub compila
l'APK di prova (workflow *Gioco Terra di Nessuno (Android)*, voce `terra-di-nessuno-apk`). Si apre in
Android Studio con `npm run android` e in Xcode (serve un Mac) con `npm run ios`. L'identificativo dell'app
è `it.terradinessuno.gioco`: va deciso quello definitivo prima della prima pubblicazione.
