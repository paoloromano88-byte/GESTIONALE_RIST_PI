// L'isola: terreno e oggetti generati da un seme, così la stessa isola si ricrea identica dal salvataggio.
// Le misure sono in unità del mondo (1 unità = 1 px con zoom 1). Una casella è LATO unità.

export const LATO = 48;
export const CASELLE = 72;
export const ACQUA = 0;
export const SABBIA = 1;
export const ERBA = 2;

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

// Numero pseudo-casuale fisso per una casella (decorazioni, varianti)
export function hashCasella(x, y, seme = 0) {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(seme, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// Rumore "a valori" su griglia, interpolato morbido: colline e boschi senza bordi netti
function rumore(seme, scala) {
  const valore = (x, y) => hashCasella(x, y, seme);
  const liscio = (t) => t * t * (3 - 2 * t);
  return (x, y) => {
    const fx = x / scala;
    const fy = y / scala;
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const sx = liscio(fx - x0);
    const sy = liscio(fy - y0);
    const a = valore(x0, y0) + (valore(x0 + 1, y0) - valore(x0, y0)) * sx;
    const b = valore(x0, y0 + 1) + (valore(x0 + 1, y0 + 1) - valore(x0, y0 + 1)) * sx;
    return a + (b - a) * sy;
  };
}

// Caratteristiche di ogni oggetto: solido = blocca il passaggio, colpi = quanti colpi servono
export const OGGETTI = {
  albero: { raggio: 18, solido: true, colpi: 3, risorsa: 'legna', perColpo: 1, ricresce: 2 * 220, attrezzo: 'ascia' },
  roccia: { raggio: 20, solido: true, colpi: 4, risorsa: 'pietra', perColpo: 1, ricresce: 3 * 220, attrezzo: 'piccone' },
  pomodori: { raggio: 18, solido: false, colpi: 1, risorsa: 'pomodoro', perColpo: 2, ricresce: 110 },
  grano: { raggio: 16, solido: false, colpi: 1, risorsa: 'grano', perColpo: 2, ricresce: 140 },
  funghi: { raggio: 14, solido: false, colpi: 1, risorsa: 'fungo', perColpo: 2, ricresce: 170 },
};

export function generaIsola(seme) {
  const altezza = rumore(seme, 11);
  const dettaglio = rumore(seme + 1, 4);
  const bosco = rumore(seme + 2, 9);
  const campi = rumore(seme + 3, 7);
  const terreno = new Uint8Array(CASELLE * CASELLE);
  const c = CASELLE / 2;
  for (let y = 0; y < CASELLE; y++) {
    for (let x = 0; x < CASELLE; x++) {
      const d = Math.hypot(x + 0.5 - c, y + 0.5 - c) / c;
      const h = altezza(x, y) * 0.7 + dettaglio(x, y) * 0.3 + 0.55 - d * d * 1.25 - d * 0.35;
      terreno[y * CASELLE + x] = h < 0.2 ? ACQUA : h < 0.29 ? SABBIA : ERBA;
    }
  }
  // Il centro (dove arriva lo chef) è sempre erba
  for (let y = c - 3; y < c + 3; y++) for (let x = c - 3; x < c + 3; x++) terreno[y * CASELLE + x] = ERBA;

  const casuale = creaCasuale(seme * 31 + 7);
  const oggetti = [];
  for (let y = 1; y < CASELLE - 1; y++) {
    for (let x = 1; x < CASELLE - 1; x++) {
      const t = terreno[y * CASELLE + x];
      if (t === ACQUA) continue;
      if (Math.hypot(x + 0.5 - c, y + 0.5 - c) < 4) continue;
      const r = casuale();
      let tipo = null;
      if (t === ERBA) {
        const b = bosco(x, y);
        const f = Math.max(b - 0.45, 0) * 0.6;
        if (campi(x, y) > 0.66 && r < 0.22) tipo = 'grano';
        else if (r < 0.025 + f) tipo = 'albero';
        else if (r < 0.06 + f) tipo = 'roccia';
        else if (r < 0.075 + f) tipo = b > 0.5 ? 'funghi' : 'pomodori';
        else if (r < 0.1 + f) tipo = 'pomodori';
      } else if (r < 0.04) {
        tipo = 'roccia';
      }
      if (!tipo) continue;
      oggetti.push({
        id: oggetti.length,
        tipo,
        x: (x + 0.25 + casuale() * 0.5) * LATO,
        y: (y + 0.25 + casuale() * 0.5) * LATO,
        colpi: OGGETTI[tipo].colpi,
        ricresce: 0,
        variante: casuale(),
      });
    }
  }
  return { seme, terreno, oggetti };
}

export function terrenoIn(isola, x, y) {
  const cx = Math.floor(x / LATO);
  const cy = Math.floor(y / LATO);
  if (cx < 0 || cy < 0 || cx >= CASELLE || cy >= CASELLE) return ACQUA;
  return isola.terreno[cy * CASELLE + cx];
}

export const centroIsola = () => ({ x: (CASELLE / 2) * LATO, y: (CASELLE / 2) * LATO });

// Griglia di ricerca: trova in fretta gli oggetti vicini a un punto
const CELLA = LATO * 4;

export function creaIndice(elementi) {
  const celle = new Map();
  for (const e of elementi) {
    const k = `${Math.floor(e.x / CELLA)},${Math.floor(e.y / CELLA)}`;
    if (!celle.has(k)) celle.set(k, []);
    celle.get(k).push(e);
  }
  return {
    vicini(x, y, raggio) {
      const out = [];
      const x0 = Math.floor((x - raggio) / CELLA);
      const x1 = Math.floor((x + raggio) / CELLA);
      const y0 = Math.floor((y - raggio) / CELLA);
      const y1 = Math.floor((y + raggio) / CELLA);
      for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) for (const e of celle.get(`${cx},${cy}`) || []) out.push(e);
      return out;
    },
  };
}
