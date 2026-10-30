// La mappa: campagna dopo l'epidemia, generata da un seme. Strade, un paese di case in cui si entra,
// casali isolati, auto abbandonate, boschi e un bordo di bosco fitto che chiude la mappa.
// Misure in unità del gioco; una casella è LATO unità.

export const LATO = 48;
export const CASELLE = 80;
export const ERBA = 0;
export const STRADA = 1;
export const STERRATO = 2;
export const FITTO = 3;
export const PAVIMENTO = 4;

const SPESSORE_MURO = 8;

export function creaCasuale(seme) {
  let a = seme >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashCasella(x, y, seme = 0) {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(seme, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function rumore(seme, scala) {
  const v = (x, y) => hashCasella(x, y, seme);
  const liscio = (t) => t * t * (3 - 2 * t);
  return (x, y) => {
    const fx = x / scala;
    const fy = y / scala;
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const sx = liscio(fx - x0);
    const sy = liscio(fy - y0);
    const a = v(x0, y0) + (v(x0 + 1, y0) - v(x0, y0)) * sx;
    const b = v(x0, y0 + 1) + (v(x0 + 1, y0 + 1) - v(x0, y0 + 1)) * sx;
    return a + (b - a) * sy;
  };
}

// Oggetti della mappa. solido = blocca; colpi = colpi per esaurirlo; bottino = cosa si trova frugando
export const OGGETTI = {
  albero: { raggio: 16, solido: true, colpi: 3, risorsa: 'legna', perColpo: 1, attrezzo: 'ascia', ricresce: 3 },
  cespuglio: { raggio: 15, solido: false, colpi: 1, risorsa: 'bacche', perColpo: 2, ricresce: 1 },
  rottami: { raggio: 18, solido: false, colpi: 2, risorsa: 'metallo', perColpo: 1, ricresce: 4 },
  auto: { solido: true, contenitore: true, ricresce: 3, bottino: [['metallo', 1, 3, 1], ['stoffa', 1, 1, 0.4], ['bende', 1, 1, 0.2], ['acqua', 1, 1, 0.25], ['munizioni', 2, 5, 0.12]] },
  polizia: { solido: true, contenitore: true, ricresce: 5, bottino: [['munizioni', 4, 8, 0.8], ['pistola', 1, 1, 0.5], ['bende', 1, 2, 0.5], ['metallo', 1, 2, 0.6]] },
  frigo: { raggio: 12, solido: true, contenitore: true, ricresce: 3, bottino: [['cibo', 1, 2, 0.8], ['acqua', 1, 2, 0.7]] },
  armadio: { raggio: 12, solido: true, contenitore: true, ricresce: 3, bottino: [['stoffa', 1, 3, 0.8], ['bende', 1, 1, 0.35], ['munizioni', 1, 3, 0.1]] },
  cassa: { raggio: 13, solido: true, contenitore: true, ricresce: 4, bottino: [['legna', 1, 3, 0.5], ['metallo', 1, 2, 0.5], ['cibo', 1, 1, 0.3], ['dardi', 2, 4, 0.25]] },
};

function strada(terreno, x, y, larghezza) {
  for (let d = -Math.floor(larghezza / 2); d < Math.ceil(larghezza / 2); d++) {
    const yy = y + d;
    if (x >= 0 && x < CASELLE && yy >= 0 && yy < CASELLE && terreno[yy * CASELLE + x] !== FITTO) terreno[yy * CASELLE + x] = STRADA;
  }
}

export function generaMappa(seme) {
  const caso = creaCasuale(seme * 13 + 5);
  const terreno = new Uint8Array(CASELLE * CASELLE);
  const bosco = rumore(seme + 2, 9);
  const prati = rumore(seme + 4, 6);
  // Bordo di bosco fitto, irregolare: chiude la mappa
  const bordo = rumore(seme + 6, 5);
  for (let y = 0; y < CASELLE; y++) {
    for (let x = 0; x < CASELLE; x++) {
      const d = Math.min(x, y, CASELLE - 1 - x, CASELLE - 1 - y);
      if (d < 2 + bordo(x, y) * 3) terreno[y * CASELLE + x] = FITTO;
      else if (prati(x, y) > 0.7) terreno[y * CASELLE + x] = STERRATO;
    }
  }
  // Strada statale da ovest a est che ondeggia, e una provinciale da nord a sud
  const statale = [];
  const fase = caso() * 6;
  for (let x = 0; x < CASELLE; x++) {
    const y = Math.round(CASELLE * 0.48 + Math.sin(x * 0.07 + fase) * 5);
    statale.push(y);
    strada(terreno, x, y, 3);
  }
  const xProv = Math.round(CASELLE * (0.42 + caso() * 0.16));
  for (let y = 0; y < CASELLE; y++) {
    const x = Math.round(xProv + Math.sin(y * 0.09 + fase) * 3);
    for (let d = -1; d <= 1; d++) if (terreno[y * CASELLE + x + d] !== FITTO) terreno[y * CASELLE + x + d] = STRADA;
  }

  const edifici = [];
  const oggetti = [];
  const occupato = new Uint8Array(CASELLE * CASELLE);
  const libero = (x0, y0, w, h, margine = 1) => {
    for (let y = y0 - margine; y < y0 + h + margine; y++) {
      for (let x = x0 - margine; x < x0 + w + margine; x++) {
        if (x < 0 || y < 0 || x >= CASELLE || y >= CASELLE) return false;
        const t = terreno[y * CASELLE + x];
        if (t === FITTO || t === STRADA || occupato[y * CASELLE + x]) return false;
      }
    }
    return true;
  };
  const aggiungi = (o) => {
    o.id = oggetti.length;
    o.colpi = OGGETTI[o.tipo].colpi ?? 1;
    o.ricresce = 0;
    o.variante = o.variante ?? caso();
    oggetti.push(o);
    return o;
  };

  // Case: rettangoli di muri con una porta verso la strada; dentro frigo, armadio, cassa
  const costruisci = (x0, y0, w, h, porta, tipo) => {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
      occupato[y * CASELLE + x] = 1;
      terreno[y * CASELLE + x] = PAVIMENTO;
    }
    const e = { id: edifici.length, tipo, x: x0 * LATO, y: y0 * LATO, w: w * LATO, h: h * LATO, porta, muri: [] };
    const X0 = e.x, Y0 = e.y, X1 = e.x + e.w, Y1 = e.y + e.h, s = SPESSORE_MURO;
    const varco = LATO * 1.1;
    const lato = (x0, y0, x1, y1, conPorta) => {
      const orizzontale = y0 === y1;
      const lunghezza = orizzontale ? x1 - x0 : y1 - y0;
      const pezzi = conPorta ? [[0, (lunghezza - varco) / 2], [(lunghezza + varco) / 2, lunghezza]] : [[0, lunghezza]];
      for (const [a, b] of pezzi) {
        if (orizzontale) e.muri.push({ x: x0 + a - s / 2, y: y0 - s / 2, w: b - a + s, h: s });
        else e.muri.push({ x: x0 - s / 2, y: y0 + a - s / 2, w: s, h: b - a + s });
      }
    };
    lato(X0, Y0, X1, Y0, porta === 'n');
    lato(X0, Y1, X1, Y1, porta === 's');
    lato(X0, Y0, X0, Y1, porta === 'o');
    lato(X1, Y0, X1, Y1, porta === 'e');
    edifici.push(e);
    // Arredi lungo i muri, lontani dalla porta
    const dentro = [['frigo', X0 + 22, Y0 + 22], ['armadio', X1 - 22, Y0 + 22], ['cassa', X1 - 24, Y1 - 24], ['armadio', X0 + 22, Y1 - 22]];
    const quanti = tipo === 'casale' ? 4 : 2 + Math.floor(caso() * 2);
    const scelti = dentro.filter(([, x, y]) => {
      const verso = { n: y < Y0 + 40, s: y > Y1 - 40, o: x < X0 + 40, e: x > X1 - 40 }[porta];
      return !(verso && Math.abs((porta === 'n' || porta === 's' ? x - (X0 + X1) / 2 : y - (Y0 + Y1) / 2)) < 50);
    });
    for (const [tipoArredo, x, y] of scelti.slice(0, quanti)) aggiungi({ tipo: tipoArredo, x, y, edificio: e.id });
    return e;
  };

  // Il paese: attorno all'incrocio, case su entrambi i lati della statale
  const yIncrocio = statale[xProv];
  for (let tentativo = 0; tentativo < 160 && edifici.length < 12; tentativo++) {
    const w = 3 + Math.floor(caso() * 2);
    const h = 3 + Math.floor(caso() * 2);
    const sopra = caso() < 0.5;
    const cx = xProv + Math.round((caso() - 0.5) * 30);
    const yStrada = statale[Math.max(0, Math.min(CASELLE - 1, cx))];
    const y0 = sopra ? yStrada - 2 - h - Math.floor(caso() * 2) : yStrada + 3 + Math.floor(caso() * 2);
    const x0 = cx - Math.floor(w / 2);
    if (Math.abs(cx - xProv) < 3) continue;
    if (!libero(x0, y0, w, h)) continue;
    costruisci(x0, y0, w, h, sopra ? 's' : 'n', 'casa');
  }
  // Casali isolati in campagna, con la porta verso sud
  for (let tentativo = 0; tentativo < 300 && edifici.filter((e) => e.tipo === 'casale').length < 4; tentativo++) {
    const w = 4 + Math.floor(caso() * 2);
    const h = 4;
    const x0 = 6 + Math.floor(caso() * (CASELLE - 16));
    const y0 = 6 + Math.floor(caso() * (CASELLE - 16));
    if (Math.abs(y0 - yIncrocio) < 10 && Math.abs(x0 - xProv) < 18) continue;
    if (!libero(x0, y0, w, h, 2)) continue;
    costruisci(x0, y0, w, h, 's', 'casale');
    for (let x = x0 - 1; x <= x0 + w; x++) for (const y of [y0 + h, y0 + h + 1]) if (terreno[y * CASELLE + x] === ERBA) terreno[y * CASELLE + x] = STERRATO;
  }

  // Auto ferme sulle strade (una ogni tanto è della polizia)
  for (let x = 4; x < CASELLE - 4; x += 3 + Math.floor(caso() * 5)) {
    if (caso() < 0.45) continue;
    const y = statale[x] + (caso() < 0.5 ? -0.5 : 0.5);
    if (Math.abs(x - xProv) < 3) continue;
    aggiungi({ tipo: caso() < 0.12 ? 'polizia' : 'auto', x: (x + 0.5) * LATO, y: (y + 0.5) * LATO, orizzontale: true });
  }
  for (let y = 4; y < CASELLE - 4; y += 4 + Math.floor(caso() * 6)) {
    if (caso() < 0.5 || Math.abs(y - yIncrocio) < 4) continue;
    aggiungi({ tipo: caso() < 0.1 ? 'polizia' : 'auto', x: (xProv + 0.5 + (caso() < 0.5 ? -0.6 : 0.6)) * LATO, y: (y + 0.5) * LATO, orizzontale: false });
  }

  // Natura: boschi, cespugli di more, rottami, qualche cassa sperduta
  const centro = { x: xProv + 9, y: yIncrocio + 9 };
  for (let y = 2; y < CASELLE - 2; y++) {
    for (let x = 2; x < CASELLE - 2; x++) {
      const t = terreno[y * CASELLE + x];
      if (t !== ERBA && t !== STERRATO) continue;
      if (occupato[y * CASELLE + x] || Math.hypot(x - centro.x, y - centro.y) < 3) continue;
      const r = caso();
      const b = bosco(x, y);
      const f = Math.max(b - 0.45, 0) * 0.55;
      let tipo = null;
      if (r < 0.014 + f && t === ERBA) tipo = 'albero';
      else if (r < 0.032 + f * 0.25) tipo = 'cespuglio';
      else if (r < 0.04 + f * 0.25) tipo = 'rottami';
      else if (r < 0.043 + f * 0.1) tipo = 'cassa';
      if (tipo) aggiungi({ tipo, x: (x + 0.2 + caso() * 0.6) * LATO, y: (y + 0.2 + caso() * 0.6) * LATO });
    }
  }
  // Alberi fitti sul bordo: solo scenografia (non si tagliano)
  const sfondo = [];
  for (let y = 0; y < CASELLE; y++) for (let x = 0; x < CASELLE; x++) if (terreno[y * CASELLE + x] === FITTO && caso() < 0.3) sfondo.push({ x: (x + caso()) * LATO, y: (y + caso()) * LATO, variante: caso() });

  return { seme, terreno, oggetti, edifici, sfondo, partenza: { x: (centro.x + 0.5) * LATO, y: (centro.y + 0.5) * LATO }, statale, xProv };
}

export function terrenoIn(mappa, x, y) {
  const cx = Math.floor(x / LATO);
  const cy = Math.floor(y / LATO);
  if (cx < 0 || cy < 0 || cx >= CASELLE || cy >= CASELLE) return FITTO;
  return mappa.terreno[cy * CASELLE + cx];
}

// Rettangolo di un'auto (lunga 90, larga 44), orientata lungo la sua strada
export function rettangoloAuto(o) {
  const lungo = 90;
  const largo = 44;
  return o.orizzontale ? { x: o.x - lungo / 2, y: o.y - largo / 2, w: lungo, h: largo } : { x: o.x - largo / 2, y: o.y - lungo / 2, w: largo, h: lungo };
}

const CELLA = LATO * 4;

export function creaIndice(elementi) {
  const celle = new Map();
  const metti = (e) => {
    const k = `${Math.floor(e.x / CELLA)},${Math.floor(e.y / CELLA)}`;
    if (!celle.has(k)) celle.set(k, []);
    celle.get(k).push(e);
  };
  for (const e of elementi) metti(e);
  return {
    metti,
    togli(e) {
      const k = `${Math.floor(e.x / CELLA)},${Math.floor(e.y / CELLA)}`;
      const l = celle.get(k);
      if (l) l.splice(l.indexOf(e) >>> 0, 1);
    },
    vicini(x, y, raggio) {
      const out = [];
      for (let cy = Math.floor((y - raggio) / CELLA); cy <= Math.floor((y + raggio) / CELLA); cy++) {
        for (let cx = Math.floor((x - raggio) / CELLA); cx <= Math.floor((x + raggio) / CELLA); cx++) for (const e of celle.get(`${cx},${cy}`) || []) out.push(e);
      }
      return out;
    },
  };
}
