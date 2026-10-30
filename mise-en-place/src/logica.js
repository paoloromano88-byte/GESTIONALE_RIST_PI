// Regole di Mise en Place: barattoli da 4 posti, si sposta in cima a un barattolo vuoto
// o sopra lo stesso ingrediente. Vince chi riempie ogni barattolo con un solo ingrediente.
// Niente disegno qui: le regole si provano con node --test.

export const CAPIENZA = 4;
export const INGREDIENTI = ['pomodoro', 'mozzarella', 'basilico', 'funghi', 'olive', 'salame', 'peperoncino', 'cipolla', 'mais', 'prosciutto'];
export const NOMI = {
  pomodoro: 'Pomodoro',
  mozzarella: 'Mozzarella',
  basilico: 'Basilico',
  funghi: 'Funghi',
  olive: 'Olive',
  salame: 'Salame',
  peperoncino: 'Peperoncino',
  cipolla: 'Cipolla',
  mais: 'Mais',
  prosciutto: 'Prosciutto',
};

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

const cima = (b) => b[b.length - 1];

export function completo(b) {
  return b.length === CAPIENZA && b.every((p) => p.tipo === b[0].tipo);
}

// Quanti pezzi uguali e visibili ci sono in cima al barattolo (quelli coperti restano dove sono)
export function gruppoInCima(b) {
  let n = 0;
  while (n < b.length && b[b.length - 1 - n].tipo === cima(b).tipo && !b[b.length - 1 - n].coperto) n++;
  return n;
}

export function quantiSposta(barattoli, da, a) {
  const sorgente = barattoli[da];
  const dest = barattoli[a];
  if (da === a || !sorgente.length || completo(sorgente) || dest.length >= CAPIENZA) return 0;
  if (dest.length && cima(dest).tipo !== cima(sorgente).tipo) return 0;
  return Math.min(gruppoInCima(sorgente), CAPIENZA - dest.length);
}

// ---------- Risolutore (serve per creare livelli risolvibili e per i suggerimenti) ----------

const chiave = (barattoli) => barattoli.map((b) => b.map((p) => p.tipo).join(',')).sort().join('|');

function mosseUtili(barattoli) {
  const mosse = [];
  for (let da = 0; da < barattoli.length; da++) {
    const s = barattoli[da];
    if (!s.length || completo(s)) continue;
    const uniforme = gruppoInCima(s) === s.length;
    let vuotoProvato = false;
    for (let a = 0; a < barattoli.length; a++) {
      const n = quantiSposta(barattoli, da, a);
      if (!n) continue;
      if (!barattoli[a].length) {
        // Spostare un barattolo tutto uguale in uno vuoto non serve; i vuoti sono tutti equivalenti
        if (uniforme || vuotoProvato) continue;
        vuotoProvato = true;
        mosse.push({ da, a, n, peso: 0 });
      } else {
        // Prima le mosse che uniscono gruppi interi o chiudono un barattolo
        mosse.push({ da, a, n, peso: (n === gruppoInCima(s) ? 2 : 1) + (barattoli[a].length + n === CAPIENZA ? 2 : 0) });
      }
    }
  }
  return mosse.sort((x, y) => x.peso - y.peso);
}

function applica(barattoli, { da, a, n }) {
  const copia = barattoli.map((b) => b.slice());
  copia[a].push(...copia[da].splice(copia[da].length - n, n));
  return copia;
}

// Stato dei barattoli nell'ordine in cui sono sul banco (a differenza di chiave, che li ordina)
const fotografia = (barattoli) => barattoli.map((b) => b.map((p) => p.tipo).join(',')).join('|');

const vinto = (barattoli) => barattoli.every((b) => !b.length || completo(b));

// Ricerca in profondità con memoria degli stati già visti. Restituisce le mosse o null.
export function risolvi(partenza, limite = 60000) {
  // Il risolutore vede anche gli ingredienti coperti
  const barattoli = partenza.map((b) => b.map((p) => ({ tipo: p.tipo })));
  const visti = new Set([chiave(barattoli)]);
  const pila = [{ stato: barattoli, mosse: mosseUtili(barattoli), percorso: [] }];
  let nodi = 0;
  while (pila.length) {
    const cima = pila[pila.length - 1];
    if (vinto(cima.stato)) return cima.percorso;
    const m = cima.mosse.pop();
    if (!m) {
      pila.pop();
      continue;
    }
    if (++nodi > limite) return null;
    const nuovo = applica(cima.stato, m);
    const k = chiave(nuovo);
    if (visti.has(k)) continue;
    visti.add(k);
    pila.push({ stato: nuovo, mosse: mosseUtili(nuovo), percorso: [...cima.percorso, { da: m.da, a: m.a }] });
  }
  return null;
}

// ---------- Livelli ----------

export function parametriLivello(n) {
  return {
    tipi: Math.min(2 + Math.ceil(n / 2), INGREDIENTI.length),
    vuoti: 2,
    // Dal livello 8 compaiono ingredienti coperti: si scoprono quando arrivano in cima
    coperti: n >= 8 && n % 3 !== 1,
  };
}

export function generaLivello(n) {
  const { tipi, vuoti, coperti } = parametriLivello(n);
  const casuale = creaCasuale(n * 7919 + 13);
  const scelti = INGREDIENTI.slice();
  for (let i = scelti.length - 1; i > 0; i--) {
    const j = Math.floor(casuale() * (i + 1));
    [scelti[i], scelti[j]] = [scelti[j], scelti[i]];
  }
  const tipiLivello = scelti.slice(0, tipi);
  for (let tentativo = 0; ; tentativo++) {
    const pezzi = tipiLivello.flatMap((t) => Array(CAPIENZA).fill(t));
    for (let i = pezzi.length - 1; i > 0; i--) {
      const j = Math.floor(casuale() * (i + 1));
      [pezzi[i], pezzi[j]] = [pezzi[j], pezzi[i]];
    }
    const barattoli = [];
    for (let i = 0; i < tipi; i++) {
      barattoli.push(pezzi.slice(i * CAPIENZA, (i + 1) * CAPIENZA).map((tipo, k) => ({ tipo, coperto: coperti && k < CAPIENZA - 1 })));
    }
    for (let i = 0; i < vuoti; i++) barattoli.push([]);
    // Niente barattoli già pronti, niente partenze troppo facili, e deve esistere una soluzione
    const inizioFacile = barattoli.some((b) => b.length && gruppoInCima(b) >= 3);
    if (inizioFacile && tentativo < 50) continue;
    const soluzione = risolvi(barattoli);
    if (soluzione && (soluzione.length >= tipi * 2 || tentativo >= 50)) return { numero: n, barattoli, mosseSoluzione: soluzione.length };
  }
}

// ---------- Partita ----------

export const AIUTI = { suggerimenti: 3, barattoliExtra: 1 };

export class Partita {
  constructor(numero) {
    const livello = generaLivello(numero);
    this.numero = numero;
    this.iniziale = livello.barattoli;
    this.ricomincia();
  }

  ricomincia() {
    this.barattoli = this.iniziale.map((b) => b.map((p) => ({ ...p })));
    this.storia = [];
    this.mosse = 0;
    this.suggerimenti = AIUTI.suggerimenti;
    this.barattoliExtra = AIUTI.barattoliExtra;
    this.usatoSuggerimento = false;
    this.usatoExtra = false;
    this.vinta = false;
  }

  puoSpostare(da, a) {
    return quantiSposta(this.barattoli, da, a) > 0;
  }

  // Sposta e restituisce i dettagli per l'animazione, o null se la mossa non è valida
  sposta(da, a) {
    const n = quantiSposta(this.barattoli, da, a);
    if (!n) return null;
    this.storia.push(this.barattoli.map((b) => b.map((p) => ({ ...p }))));
    const pezzi = this.barattoli[da].splice(this.barattoli[da].length - n, n);
    const partenza = this.barattoli[da].length;
    const arrivo = this.barattoli[a].length;
    this.barattoli[a].push(...pezzi);
    const scoperto = this.barattoli[da].length && cima(this.barattoli[da]).coperto;
    if (scoperto) cima(this.barattoli[da]).coperto = false;
    this.mosse++;
    const chiuso = completo(this.barattoli[a]);
    this.vinta = vinto(this.barattoli);
    return { da, a, n, tipo: pezzi[0].tipo, partenza, arrivo, chiuso, scoperto: !!scoperto, vinta: this.vinta };
  }

  annulla() {
    if (!this.storia.length || this.vinta) return false;
    // I pezzi già scoperti restano scoperti: annullare non deve nascondere di nuovo informazioni
    const visti = new Set();
    this.barattoli.forEach((b, i) => b.forEach((p, k) => !p.coperto && visti.add(`${i}:${k}`)));
    this.barattoli = this.storia.pop();
    this.barattoli.forEach((b, i) => b.forEach((p, k) => visti.has(`${i}:${k}`) && (p.coperto = false)));
    this.mosse++;
    return true;
  }

  aggiungiBarattolo() {
    if (this.barattoliExtra <= 0 || this.vinta) return false;
    this.barattoliExtra--;
    this.usatoExtra = true;
    this.barattoli.push([]);
    this.storia = this.storia.map((s) => [...s, []]);
    return true;
  }

  // Prossima mossa di una soluzione dallo stato attuale, o null se da qui non si vince.
  // La soluzione si tiene da parte: finché il giocatore la segue, ogni aiuto è il passo successivo
  // dello stesso piano (ricalcolarla ogni volta potrebbe far rimbalzare gli aiuti avanti e indietro).
  suggerisci() {
    if (this.suggerimenti <= 0 || this.vinta) return null;
    const ora = fotografia(this.barattoli);
    let passo = this.piano?.find((p) => p.prima === ora);
    if (!passo) {
      const soluzione = risolvi(this.barattoli, 150000);
      if (!soluzione || !soluzione.length) return null;
      let stato = this.barattoli.map((b) => b.map((p) => ({ tipo: p.tipo })));
      this.piano = soluzione.map((m) => {
        const prima = fotografia(stato);
        stato = applica(stato, { ...m, n: quantiSposta(stato, m.da, m.a) });
        return { prima, mossa: m };
      });
      passo = this.piano[0];
    }
    this.suggerimenti--;
    this.usatoSuggerimento = true;
    return passo.mossa;
  }

  bloccata() {
    if (this.vinta) return false;
    for (let da = 0; da < this.barattoli.length; da++) {
      for (let a = 0; a < this.barattoli.length; a++) if (this.puoSpostare(da, a)) return false;
    }
    return true;
  }

  stelle() {
    return this.usatoExtra ? 1 : this.usatoSuggerimento ? 2 : 3;
  }
}
