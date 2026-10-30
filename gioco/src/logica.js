// Regole di Pizza al Volo, senza disegno né input: così si possono provare con node --test.
// Le misure sono in "unità" (u): 1u = un decimo della larghezza utile dello schermo.

export const INGREDIENTI = ['pomodoro', 'mozzarella', 'basilico', 'funghi', 'olive', 'salame', 'peperoncino'];
export const VIETATO = 'ananas';
export const BONUS = ['cuore', 'orologio'];

export const NOMI = {
  pomodoro: 'Pomodoro',
  mozzarella: 'Mozzarella',
  basilico: 'Basilico',
  funghi: 'Funghi',
  olive: 'Olive',
  salame: 'Salame',
  peperoncino: 'Peperoncino',
  ananas: 'Ananas',
  cuore: 'Vita extra',
  orologio: 'Rallenta',
};

export const VITE_INIZIALI = 3;
export const VITE_MASSIME = 5;
const DURATA_RALLENTA = 5;

// Generatore pseudo-casuale con seme (mulberry32): le partite dei test sono ripetibili
export function creaCasuale(seme = Date.now()) {
  let a = seme >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Comanda del livello: da 3 ingredienti (2 tipi) fino a 8 (5 tipi)
export function nuovaComanda(livello, casuale) {
  const tipi = Math.min(2 + Math.floor(livello / 2), 5);
  const totale = Math.min(3 + livello, 8);
  const mescolati = [...INGREDIENTI];
  for (let i = mescolati.length - 1; i > 0; i--) {
    const j = Math.floor(casuale() * (i + 1));
    [mescolati[i], mescolati[j]] = [mescolati[j], mescolati[i]];
  }
  const scelti = mescolati.slice(0, tipi);
  const richiesti = Object.fromEntries(scelti.map((t) => [t, 1]));
  for (let i = tipi; i < totale; i++) richiesti[scelti[Math.floor(casuale() * tipi)]]++;
  return {
    richiesti,
    presi: Object.fromEntries(scelti.map((t) => [t, 0])),
    tempo: 12 + totale * 2.5,
    tempoTotale: 12 + totale * 2.5,
  };
}

export function mancanti(comanda) {
  return Object.keys(comanda.richiesti).filter((t) => comanda.presi[t] < comanda.richiesti[t]);
}

export class Partita {
  constructor({ larghezza, altezza, casuale = Math.random }) {
    this.casuale = casuale;
    this.punti = 0;
    this.vite = VITE_INIZIALI;
    this.livello = 0;
    this.pizzeServite = 0;
    this.combo = 0;
    this.finita = false;
    this.rallenta = 0;
    this.oggetti = [];
    this.condimenti = [];
    this.eventi = [];
    this.attesaUscita = 0;
    this.prossimo = 0.6;
    this.ridimensiona(larghezza, altezza);
    this.pizza = { x: larghezza / 2, obiettivo: larghezza / 2 };
    this.comanda = nuovaComanda(0, casuale);
  }

  ridimensiona(larghezza, altezza) {
    this.larghezza = larghezza;
    this.altezza = altezza;
    this.u = Math.min(larghezza, altezza * 0.6) / 10;
    this.raggioPizza = this.u * 1.3;
    this.raggioOggetto = this.u * 0.68;
    this.yPizza = altezza - this.u * 2.4;
    if (this.pizza) this.pizza.x = Math.min(Math.max(this.pizza.x, this.raggioPizza), larghezza - this.raggioPizza);
  }

  // Velocità di caduta in px/s: sale a ogni pizza servita, fino a 2,3 volte quella iniziale
  velocita() {
    const base = this.altezza / 3.6;
    return base * Math.min(1 + this.livello * 0.09, 2.3) * (this.rallenta > 0 ? 0.5 : 1);
  }

  intervallo() {
    return Math.max(0.95 - this.livello * 0.06, 0.38);
  }

  muoviVerso(x) {
    this.pizza.obiettivo = Math.min(Math.max(x, this.raggioPizza), this.larghezza - this.raggioPizza);
  }

  scegliTipo() {
    const c = this.casuale();
    if (c < 0.035 && this.vite < VITE_MASSIME) return 'cuore';
    if (c < 0.07) return 'orologio';
    if (c < 0.07 + Math.min(0.08 + this.livello * 0.015, 0.18)) return VIETATO;
    const servono = mancanti(this.comanda);
    // Circa metà delle volte cade un ingrediente che serve ancora, il resto sono distrazioni
    if (servono.length && this.casuale() < 0.52) return servono[Math.floor(this.casuale() * servono.length)];
    return INGREDIENTI[Math.floor(this.casuale() * INGREDIENTI.length)];
  }

  generaOggetto() {
    const r = this.raggioOggetto;
    this.oggetti.push({
      tipo: this.scegliTipo(),
      x: r + this.casuale() * (this.larghezza - 2 * r),
      y: -r,
      fase: this.casuale() * Math.PI * 2,
      angolo: this.casuale() * Math.PI * 2,
      giro: (this.casuale() - 0.5) * 3,
    });
  }

  emetti(tipo, dati = {}) {
    this.eventi.push({ tipo, ...dati });
  }

  // Avanza il gioco di dt secondi; gli eventi (preso, errore, servita, ...) li legge chi disegna e suona
  aggiorna(dt) {
    if (this.finita) return;
    const p = this.pizza;
    p.x += (p.obiettivo - p.x) * Math.min(dt * 18, 1);
    if (this.rallenta > 0) this.rallenta = Math.max(this.rallenta - dt, 0);

    // Pizza servita: breve pausa prima della nuova comanda
    if (this.attesaUscita > 0) {
      this.attesaUscita -= dt;
      if (this.attesaUscita <= 0) {
        this.comanda = nuovaComanda(this.livello, this.casuale);
        this.condimenti = [];
        this.emetti('nuovaComanda');
      }
    } else {
      this.comanda.tempo -= dt;
      if (this.comanda.tempo <= 0) {
        this.emetti('scaduta');
        this.perdiVita();
        if (this.finita) return;
        this.comanda = nuovaComanda(this.livello, this.casuale);
        this.condimenti = [];
      }
    }

    this.prossimo -= dt * (this.rallenta > 0 ? 0.5 : 1);
    if (this.prossimo <= 0) {
      this.generaOggetto();
      this.prossimo = this.intervallo() * (0.75 + this.casuale() * 0.5);
    }

    const v = this.velocita();
    const r = this.raggioOggetto;
    const R = this.raggioPizza;
    for (const o of this.oggetti) {
      o.y += v * dt;
      o.fase += dt * 2;
      o.angolo += o.giro * dt;
      const x = this.xOggetto(o);
      if (!o.via && o.y + r >= this.yPizza - R * 0.35 && o.y - r <= this.yPizza + R * 0.2 && Math.abs(x - p.x) < R + r * 0.25) {
        o.via = true;
        this.prendi(o, x);
        if (this.finita) return;
      } else if (o.y - r > this.altezza) {
        o.via = true;
      }
    }
    this.oggetti = this.oggetti.filter((o) => !o.via);
  }

  // Gli oggetti ondeggiano un po' mentre cadono
  xOggetto(o) {
    return o.x + Math.sin(o.fase) * this.u * 0.25;
  }

  prendi(oggetto, x) {
    const { tipo } = oggetto;
    const y = this.yPizza - this.raggioPizza * 0.3;
    if (tipo === 'cuore') {
      this.vite = Math.min(this.vite + 1, VITE_MASSIME);
      return this.emetti('bonus', { oggetto: tipo, x, y });
    }
    if (tipo === 'orologio') {
      this.rallenta = DURATA_RALLENTA;
      return this.emetti('bonus', { oggetto: tipo, x, y });
    }
    // Mentre la pizza va in forno non si sbaglia: quello che cade si perde e basta
    if (this.attesaUscita > 0) return this.emetti('ignorato', { oggetto: tipo, x, y });
    const c = this.comanda;
    const serve = c.presi[tipo] !== undefined && c.presi[tipo] < c.richiesti[tipo];
    if (!serve) {
      this.emetti('errore', { oggetto: tipo, x, y });
      return this.perdiVita();
    }
    c.presi[tipo]++;
    this.combo++;
    const guadagno = 10 * Math.min(this.combo, 10);
    this.punti += guadagno;
    // Il condimento resta sulla pizza (coordinate relative al centro): tra alcuni punti a caso
    // si sceglie il più lontano da quelli già messi, così non si ammucchiano
    let posto = null;
    for (let i = 0; i < 8; i++) {
      const d = Math.sqrt(this.casuale()) * this.raggioPizza * 0.55;
      const a = this.casuale() * Math.PI * 2;
      const p = { dx: Math.cos(a) * d, dy: Math.sin(a) * d };
      p.spazio = Math.min(Infinity, ...this.condimenti.map((q) => Math.hypot(q.dx - p.dx, q.dy - p.dy)));
      if (!posto || p.spazio > posto.spazio) posto = p;
    }
    this.condimenti.push({ tipo, dx: posto.dx, dy: posto.dy, angolo: this.casuale() * Math.PI * 2 });
    this.emetti('preso', { oggetto: tipo, x, y, guadagno, combo: this.combo });
    if (!mancanti(c).length) this.servi();
  }

  servi() {
    const bonus = 50 + Math.ceil(this.comanda.tempo) * 5;
    this.punti += bonus;
    this.pizzeServite++;
    this.livello++;
    this.attesaUscita = 1.1;
    this.emetti('servita', { bonus });
  }

  perdiVita() {
    this.vite--;
    this.combo = 0;
    if (this.vite <= 0) {
      this.vite = 0;
      this.finita = true;
      this.emetti('fine');
    }
  }

  prendiEventi() {
    const e = this.eventi;
    this.eventi = [];
    return e;
  }
}
