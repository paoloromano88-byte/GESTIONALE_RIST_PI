// Regole di Terra di Nessuno: movimento tra muri e auto, frugare, raccogliere, armi che si consumano,
// costruzioni del rifugio, fame e sete, giorno e notte, zombie che vagano, sentono i rumori e attaccano.
// Niente grafica qui: si prova con node --test.

import { generaMappa, terrenoIn, rettangoloAuto, creaIndice, creaCasuale, OGGETTI, FITTO } from './mondo.js';

export const GIORNO = 150;
export const NOTTE = 90;
export const CICLO = GIORNO + NOTTE;

export const RISORSE = {
  legna: 'Legna',
  metallo: 'Metallo',
  stoffa: 'Stoffa',
  bacche: 'More',
  cibo: 'Scatolette',
  acqua: 'Acqua',
  bende: 'Bende',
  munizioni: 'Munizioni',
  dardi: 'Dardi',
};

// Consumabili: cosa fanno quando si usano
export const CONSUMABILI = {
  cibo: { nome: 'Scatoletta', fame: 35, sete: 0, salute: 0 },
  bacche: { nome: 'More', fame: 8, sete: 4, salute: 0 },
  acqua: { nome: 'Bottiglia d\'acqua', fame: 0, sete: 40, salute: 0 },
  bende: { nome: 'Benda', fame: 0, sete: 0, salute: 30 },
};

// Armi: a distanza ravvicinata si consumano (usura); a distanza servono munizioni o dardi
export const ARMI = {
  pugni: { nome: 'Pugni', danno: 6, portata: 44, cadenza: 0.45 },
  bastone: { nome: 'Bastone chiodato', danno: 16, portata: 50, cadenza: 0.5, usura: 40, costo: { legna: 3, metallo: 1 } },
  ascia: { nome: 'Ascia', danno: 13, portata: 48, cadenza: 0.5, usura: 60, costo: { legna: 2, metallo: 2 }, descrizione: 'Doppia legna dagli alberi' },
  machete: { nome: 'Machete', danno: 28, portata: 52, cadenza: 0.45, usura: 70, costo: { metallo: 4, stoffa: 1 } },
  balestra: { nome: 'Balestra', danno: 40, portata: 300, cadenza: 1, colpi: 'dardi', costo: { legna: 5, metallo: 3, stoffa: 2 }, descrizione: 'Silenziosa. Usa i dardi' },
  pistola: { nome: 'Pistola', danno: 48, portata: 340, cadenza: 0.55, colpi: 'munizioni', rumore: 650, descrizione: 'Si trova solo frugando. Fa rumore: attira gli zombie' },
};

export const OGGETTI_CREABILI = {
  dardi: { nome: '5 dardi', costo: { legna: 1, metallo: 1 }, da: { dardi: 5 } },
  bende: { nome: 'Benda', costo: { stoffa: 2 }, da: { bende: 1 } },
};

export const COSTRUZIONI = {
  barricata: { nome: 'Barricata', costo: { legna: 4 }, raggio: 22, vita: 150, solida: true, descrizione: 'Ferma gli zombie finché regge' },
  muro: { nome: 'Muro di lamiera', costo: { metallo: 4, legna: 2 }, raggio: 24, vita: 400, solida: true, descrizione: 'Molto più resistente della barricata' },
  trappola: { nome: 'Trappola chiodata', costo: { legna: 2, metallo: 2 }, raggio: 18, colpi: 4, danno: 30, descrizione: 'Ferisce gli zombie che ci passano sopra. Si consuma' },
  falo: { nome: 'Falò', costo: { legna: 5 }, raggio: 18, solida: true, luce: 190, descrizione: 'Fa luce di notte. Va alimentato con la legna' },
  raccoglitore: { nome: 'Raccoglitore d\'acqua', costo: { legna: 3, stoffa: 3 }, raggio: 16, solida: true, descrizione: 'Ogni mattina raccoglie 2 bottiglie d\'acqua' },
};

export const FUOCO = { iniziale: 90, perLegna: 45, massimo: 270 };

export const ZOMBIE = {
  camminatore: { nome: 'Zombie', vita: 50, velocita: 60, danno: 10, raggio: 15, vista: 240, daGiorno: 1, peso: 1 },
  corridore: { nome: 'Corridore', vita: 34, velocita: 150, danno: 8, raggio: 14, vista: 300, daGiorno: 2, peso: 0.5 },
  corazzato: { nome: 'Corazzato', vita: 240, velocita: 46, danno: 22, raggio: 20, vista: 220, daGiorno: 4, peso: 0.25 },
};

const VELOCITA = 155;
const RAGGIO = 14;
const PORTATA_USO = 46;
const FAME = 100 / 300;
const SETE = 100 / 220;

export function haAbbastanza(inventario, costo) {
  return Object.entries(costo).every(([k, n]) => (inventario[k] || 0) >= n);
}

// Punto più vicino di un rettangolo a un punto
function puntoVicino(r, x, y) {
  return { x: Math.max(r.x, Math.min(x, r.x + r.w)), y: Math.max(r.y, Math.min(y, r.y + r.h)) };
}

export class Partita {
  constructor({ seme = Date.now() % 1e9, casuale } = {}) {
    this.seme = seme;
    this.mappa = generaMappa(seme);
    this.oggetti = this.mappa.oggetti;
    this.indice = creaIndice(this.oggetti);
    this.casuale = casuale || creaCasuale(seme + 99);
    this.rettangoli = [...this.mappa.edifici.flatMap((e) => e.muri), ...this.oggetti.filter((o) => o.tipo === 'auto' || o.tipo === 'polizia').map(rettangoloAuto)];
    const p = this.mappa.partenza;
    this.io = { x: p.x, y: p.y, raggio: RAGGIO, salute: 100, fame: 100, sete: 100, attesa: 0, colpo: 0, ferito: 0, ultimaFerita: -99, passo: 0, mira: null };
    this.inventario = { acqua: 1, cibo: 1 };
    this.armi = {};
    this.armaAttiva = 'pugni';
    this.strutture = [];
    this.zombie = [];
    this.giorno = 1;
    this.tempo = 0;
    this.eventi = [];
    this.finita = false;
    this.piazzamento = null;
    this.prossimoZombie = 2;
    this.statistiche = { uccisi: 0, frugati: 0 };
    this.prossimoId = 1;
  }

  get tempoAssoluto() {
    return (this.giorno - 1) * CICLO + this.tempo;
  }

  buio() {
    const t = this.tempo;
    if (t < GIORNO - 15) return 0;
    if (t < GIORNO + 5) return (t - (GIORNO - 15)) / 20;
    if (t < CICLO - 10) return 1;
    return (CICLO - t) / 10;
  }

  emetti(tipo, dati = {}) {
    this.eventi.push({ tipo, ...dati });
  }

  prendiEventi() {
    const e = this.eventi;
    this.eventi = [];
    return e;
  }

  aggiungi(risorse, molt = 1) {
    for (const [k, n] of Object.entries(risorse)) this.inventario[k] = (this.inventario[k] || 0) + n * molt;
  }

  spendi(costo) {
    for (const [k, n] of Object.entries(costo)) this.inventario[k] -= n;
  }

  arma() {
    return ARMI[this.armaAttiva] || ARMI.pugni;
  }

  // A distanza si spara solo se ci sono colpi; altrimenti si combatte con quello che resta
  puoSparare() {
    const a = this.arma();
    return !!a.colpi && (this.inventario[a.colpi] || 0) > 0;
  }

  luci() {
    return this.strutture.filter((s) => s.tipo === 'falo' && s.fuoco > 0).map((s) => ({ x: s.x, y: s.y, raggio: COSTRUZIONI.falo.luce }));
  }

  // ---------- Ostacoli ----------

  solidiVicini(x, y, raggio) {
    const out = [];
    for (const o of this.indice.vicini(x, y, raggio + 40)) {
      const def = OGGETTI[o.tipo];
      if (!def.solido || def.raggio === undefined) continue;
      out.push({ x: o.x, y: o.y, raggio: o.tipo === 'albero' && o.colpi <= 0 ? 8 : def.raggio });
    }
    for (const s of this.strutture) if (COSTRUZIONI[s.tipo].solida && Math.abs(s.x - x) < raggio + 60 && Math.abs(s.y - y) < raggio + 60) out.push({ x: s.x, y: s.y, raggio: COSTRUZIONI[s.tipo].raggio, struttura: s });
    return out;
  }

  muovi(e, dx, dy) {
    const r = e.raggio;
    const passabile = (x, y) => terrenoIn(this.mappa, x, y) !== FITTO;
    if (dx && passabile(e.x + dx + Math.sign(dx) * r, e.y)) e.x += dx;
    if (dy && passabile(e.x, e.y + dy + Math.sign(dy) * r)) e.y += dy;
    // Muri e auto: si scivola lungo il bordo
    for (const q of this.rettangoli) {
      if (e.x + r < q.x || e.x - r > q.x + q.w || e.y + r < q.y || e.y - r > q.y + q.h) continue;
      const p = puntoVicino(q, e.x, e.y);
      const ddx = e.x - p.x;
      const ddy = e.y - p.y;
      const d = Math.hypot(ddx, ddy);
      if (d >= r) continue;
      if (d > 0.001) {
        e.x += (ddx / d) * (r - d);
        e.y += (ddy / d) * (r - d);
      } else {
        // Centro dentro il rettangolo: esce dal lato più vicino
        const fuori = [[q.x - r - e.x, 0], [q.x + q.w + r - e.x, 0], [0, q.y - r - e.y], [0, q.y + q.h + r - e.y]].sort((a, b) => Math.hypot(...a) - Math.hypot(...b))[0];
        e.x += fuori[0];
        e.y += fuori[1];
      }
    }
    for (const s of this.solidiVicini(e.x, e.y, r)) {
      const ddx = e.x - s.x;
      const ddy = e.y - s.y;
      const d = Math.hypot(ddx, ddy) || 0.01;
      const min = r + s.raggio;
      if (d < min) {
        e.x += (ddx / d) * (min - d);
        e.y += (ddy / d) * (min - d);
      }
    }
  }

  // ---------- Il tasto azione ----------

  bersaglio() {
    const io = this.io;
    const a = this.arma();
    const spara = this.puoSparare();
    let migliore = null;
    for (const z of this.zombie) {
      const d = Math.hypot(z.x - io.x, z.y - io.y) - z.raggio - io.raggio;
      const portata = spara ? a.portata : (a.colpi ? ARMI.pugni.portata : a.portata) + 12;
      if (d < portata && (!migliore || d < migliore.d)) migliore = { d, tipo: 'zombie', ref: z, azione: spara ? 'spara' : 'colpisci' };
    }
    if (migliore) return migliore;
    for (const o of this.indice.vicini(io.x, io.y, 120)) {
      if (o.colpi <= 0) continue;
      const def = OGGETTI[o.tipo];
      const bordo = o.tipo === 'auto' || o.tipo === 'polizia' ? 30 : def.raggio;
      const d = Math.hypot(o.x - io.x, o.y - io.y) - bordo - io.raggio;
      if (d < PORTATA_USO && (!migliore || d < migliore.d)) {
        const azione = def.contenitore ? 'fruga' : o.tipo === 'albero' ? 'taglia' : o.tipo === 'rottami' ? 'smonta' : 'raccogli';
        migliore = { d, tipo: 'oggetto', ref: o, azione };
      }
    }
    if (migliore) return migliore;
    for (const s of this.strutture) {
      const pronto = s.tipo === 'falo' ? (this.inventario.legna || 0) > 0 && s.fuoco < FUOCO.massimo - 1 : s.tipo === 'raccoglitore' ? s.acqua > 0 : false;
      if (!pronto) continue;
      const d = Math.hypot(s.x - io.x, s.y - io.y) - COSTRUZIONI[s.tipo].raggio - io.raggio;
      if (d < PORTATA_USO + 10 && (!migliore || d < migliore.d)) migliore = { d, tipo: 'struttura', ref: s, azione: s.tipo === 'falo' ? 'alimenta' : 'prendi' };
    }
    return migliore;
  }

  azione() {
    const io = this.io;
    if (this.finita || io.attesa > 0) return;
    const b = this.bersaglio();
    io.colpo = 0.25;
    if (!b) {
      io.attesa = 0.35;
      return;
    }
    io.mira = { x: b.ref.x, y: b.ref.y };
    if (b.tipo === 'zombie') return b.azione === 'spara' ? this.spara(b.ref) : this.colpisci(b.ref);
    if (b.tipo === 'struttura') {
      io.attesa = 0.4;
      const s = b.ref;
      if (b.azione === 'alimenta') {
        this.inventario.legna--;
        s.fuoco = Math.min(s.fuoco + FUOCO.perLegna, FUOCO.massimo);
        this.emetti('alimentato', { x: s.x, y: s.y });
      } else {
        this.aggiungi({ acqua: s.acqua });
        this.emetti('preso', { cosa: { acqua: s.acqua }, x: s.x, y: s.y });
        s.acqua = 0;
      }
      return;
    }
    const o = b.ref;
    const def = OGGETTI[o.tipo];
    if (def.contenitore) {
      io.attesa = 0.8;
      o.colpi = 0;
      o.ricresce = this.tempoAssoluto + def.ricresce * CICLO;
      const trovato = {};
      for (const [cosa, min, max, prob] of def.bottino) {
        if (this.casuale() >= prob) continue;
        if (cosa === 'pistola') {
          if (this.armi.pistola) trovato.munizioni = (trovato.munizioni || 0) + 3;
          else {
            this.armi.pistola = { usura: Infinity };
            this.emetti('armaTrovata', { arma: 'pistola' });
          }
          continue;
        }
        trovato[cosa] = (trovato[cosa] || 0) + min + Math.floor(this.casuale() * (max - min + 1));
      }
      this.aggiungi(trovato);
      this.statistiche.frugati++;
      return this.emetti('frugato', { cosa: trovato, x: o.x, y: o.y, oggetto: o.tipo });
    }
    io.attesa = def.colpi > 1 ? 0.45 : 0.35;
    o.colpi--;
    const doppio = def.attrezzo && this.armaAttiva === def.attrezzo;
    if (doppio) this.consuma();
    this.aggiungi({ [def.risorsa]: def.perColpo }, doppio ? 2 : 1);
    this.emetti('raccolto', { risorsa: def.risorsa, quanti: def.perColpo * (doppio ? 2 : 1), x: o.x, y: o.y, oggetto: o.tipo });
    if (o.colpi <= 0) {
      o.ricresce = this.tempoAssoluto + def.ricresce * CICLO;
      this.emetti('esaurito', { oggetto: o.tipo, x: o.x, y: o.y });
    }
  }

  // Le armi da mischia si consumano a ogni colpo; quando si rompono si torna ai pugni
  consuma() {
    const nome = this.armaAttiva;
    const a = this.armi[nome];
    if (!a || !Number.isFinite(a.usura)) return;
    a.usura--;
    if (a.usura <= 0) {
      delete this.armi[nome];
      this.armaAttiva = 'pugni';
      this.emetti('armaRotta', { arma: nome });
    }
  }

  ferisci(z, danno, dx, dy) {
    z.vita -= danno;
    z.colpito = 0.2;
    z.stato = 'insegue';
    const d = Math.hypot(dx, dy) || 1;
    this.muovi(z, (dx / d) * 24, (dy / d) * 24);
    this.emetti('zombieColpito', { x: z.x, y: z.y, danno, zombie: z.tipo });
    if (z.vita <= 0) {
      this.zombie = this.zombie.filter((x) => x !== z);
      this.statistiche.uccisi++;
      const preda = {};
      if (this.casuale() < 0.3) preda.stoffa = 1;
      if (this.casuale() < 0.08) preda.munizioni = 2;
      if (this.casuale() < 0.05) preda.bende = 1;
      this.aggiungi(preda);
      this.emetti('zombieUcciso', { x: z.x, y: z.y, zombie: z.tipo, preda });
    }
  }

  colpisci(z) {
    const io = this.io;
    const a = this.arma().colpi ? ARMI.pugni : this.arma();
    io.attesa = a.cadenza;
    if (!this.arma().colpi) this.consuma();
    this.ferisci(z, a.danno, z.x - io.x, z.y - io.y);
  }

  spara(z) {
    const io = this.io;
    const a = this.arma();
    io.attesa = a.cadenza;
    this.inventario[a.colpi]--;
    this.emetti('sparo', { da: { x: io.x, y: io.y }, a: { x: z.x, y: z.y }, arma: this.armaAttiva });
    if (a.rumore) this.rumore(io.x, io.y, a.rumore);
    this.ferisci(z, a.danno, z.x - io.x, z.y - io.y);
  }

  // Un rumore forte: gli zombie che lo sentono vengono a vedere
  rumore(x, y, raggio) {
    for (const z of this.zombie) if (Math.hypot(z.x - x, z.y - y) < raggio) z.stato = 'insegue';
    this.emetti('rumore', { x, y, raggio });
  }

  equipaggia(nome) {
    if (nome !== 'pugni' && !this.armi[nome]) return false;
    this.armaAttiva = nome;
    return true;
  }

  // ---------- Creare, costruire, usare ----------

  crea(nome) {
    if (ARMI[nome]?.costo) {
      const a = ARMI[nome];
      if (this.armi[nome] || !haAbbastanza(this.inventario, a.costo)) return false;
      this.spendi(a.costo);
      this.armi[nome] = { usura: a.usura ?? Infinity };
      this.armaAttiva = nome;
      this.emetti('creato', { nome: a.nome });
      return true;
    }
    if (OGGETTI_CREABILI[nome]) {
      const c = OGGETTI_CREABILI[nome];
      if (!haAbbastanza(this.inventario, c.costo)) return false;
      this.spendi(c.costo);
      this.aggiungi(c.da);
      this.emetti('creato', { nome: c.nome });
      return true;
    }
    const s = COSTRUZIONI[nome];
    if (!s || this.piazzamento || !haAbbastanza(this.inventario, s.costo)) return false;
    this.spendi(s.costo);
    this.piazzamento = nome;
    return true;
  }

  puntoPiazzamento() {
    const io = this.io;
    const r = COSTRUZIONI[this.piazzamento]?.raggio || 20;
    const a = io.guarda ?? 0;
    const d = io.raggio + r + 12;
    return { x: io.x + Math.sin(a) * d, y: io.y + Math.cos(a) * d };
  }

  puoPiazzare(x, y) {
    if (!this.piazzamento) return false;
    const r = COSTRUZIONI[this.piazzamento].raggio;
    if (terrenoIn(this.mappa, x, y) === FITTO) return false;
    for (const q of this.rettangoli) {
      const p = puntoVicino(q, x, y);
      if (Math.hypot(x - p.x, y - p.y) < r - 2) return false;
    }
    for (const s of this.solidiVicini(x, y, r)) if (Math.hypot(s.x - x, s.y - y) < s.raggio + r - 4) return false;
    for (const s of this.strutture) if (!COSTRUZIONI[s.tipo].solida && Math.hypot(s.x - x, s.y - y) < COSTRUZIONI[s.tipo].raggio + r) return false;
    return Math.hypot(this.io.x - x, this.io.y - y) >= this.io.raggio + r - 2;
  }

  piazza() {
    const p = this.puntoPiazzamento();
    if (!this.puoPiazzare(p.x, p.y)) return false;
    const def = COSTRUZIONI[this.piazzamento];
    const s = { id: this.prossimoId++, tipo: this.piazzamento, x: p.x, y: p.y };
    if (def.vita) s.vita = def.vita;
    if (def.colpi) s.colpi = def.colpi;
    if (s.tipo === 'falo') s.fuoco = FUOCO.iniziale;
    if (s.tipo === 'raccoglitore') s.acqua = 0;
    this.strutture.push(s);
    this.emetti('piazzato', { nome: this.piazzamento, x: p.x, y: p.y });
    this.piazzamento = null;
    return true;
  }

  annullaPiazzamento() {
    if (!this.piazzamento) return;
    this.aggiungi(COSTRUZIONI[this.piazzamento].costo);
    this.piazzamento = null;
  }

  usa(nome) {
    const c = CONSUMABILI[nome];
    if (!c || !(this.inventario[nome] > 0) || this.finita) return false;
    this.inventario[nome]--;
    const io = this.io;
    io.fame = Math.min(io.fame + c.fame, 100);
    io.sete = Math.min(io.sete + c.sete, 100);
    io.salute = Math.min(io.salute + c.salute, 100);
    this.emetti('usato', { nome });
    return true;
  }

  // ---------- Il tempo che passa ----------

  aggiorna(dt, comandi = {}) {
    if (this.finita) return;
    const io = this.io;
    io.attesa = Math.max(io.attesa - dt, 0);
    io.colpo = Math.max(io.colpo - dt, 0);
    io.ferito = Math.max(io.ferito - dt, 0);

    const mx = comandi.mx || 0;
    const my = comandi.my || 0;
    const forza = Math.min(Math.hypot(mx, my), 1);
    if (forza > 0.05) {
      const d = Math.hypot(mx, my);
      const v = VELOCITA * forza * dt;
      this.muovi(io, (mx / d) * v, (my / d) * v);
      io.guarda = Math.atan2(mx, my);
      io.passo += dt * 10 * forza;
    }
    if (comandi.azione) this.azione();

    // Fame, sete, salute
    io.fame = Math.max(io.fame - FAME * dt, 0);
    io.sete = Math.max(io.sete - SETE * dt, 0);
    if (io.fame <= 0) io.salute -= 1.5 * dt;
    if (io.sete <= 0) io.salute -= 1.5 * dt;
    if (io.fame > 70 && io.sete > 70 && this.tempoAssoluto - io.ultimaFerita > 8) io.salute = Math.min(io.salute + 0.25 * dt, 100);
    for (const [k, v, soglia] of [['fame', io.fame, 25], ['sete', io.sete, 25]]) {
      const prima = v + (k === 'fame' ? FAME : SETE) * dt;
      if (v < soglia && prima >= soglia) this.emetti(k === 'fame' ? 'affamato' : 'assetato');
    }

    // Risorse e contenitori che si ricaricano
    const ora = this.tempoAssoluto;
    for (const o of this.oggetti) {
      if (o.colpi <= 0 && o.ricresce && ora >= o.ricresce && Math.hypot(o.x - io.x, o.y - io.y) > 300) {
        o.colpi = OGGETTI[o.tipo].colpi ?? 1;
        o.ricresce = 0;
      }
    }

    // Falò
    for (const s of this.strutture) {
      if (s.tipo !== 'falo' || !(s.fuoco > 0)) continue;
      s.fuoco = Math.max(s.fuoco - dt, 0);
      if (s.fuoco <= 0) this.emetti('fuocoSpento', { x: s.x, y: s.y });
    }

    // Giorno e notte
    const prima = this.buio();
    this.tempo += dt;
    if (prima < 0.5 && this.buio() >= 0.5) {
      this.emetti('notte', { giorno: this.giorno });
      this.prossimoZombie = 1;
    }
    if (this.tempo >= CICLO) {
      this.tempo -= CICLO;
      this.giorno++;
      // All'alba gli zombie della notte lontani se ne vanno; i raccoglitori si riempiono
      this.zombie = this.zombie.filter((z) => !z.notturno || Math.hypot(z.x - io.x, z.y - io.y) < 500);
      for (const s of this.strutture) if (s.tipo === 'raccoglitore') s.acqua = Math.min((s.acqua || 0) + 2, 6);
      this.emetti('alba', { giorno: this.giorno });
    }

    this.aggiornaZombie(dt);
    if (io.salute <= 0) {
      io.salute = 0;
      this.finita = true;
      this.emetti('fine', { giorno: this.giorno });
    }
  }

  generaZombie(notturno) {
    const io = this.io;
    const disponibili = Object.entries(ZOMBIE).filter(([, z]) => this.giorno >= z.daGiorno);
    const totale = disponibili.reduce((a, [, z]) => a + z.peso, 0);
    let r = this.casuale() * totale;
    const [tipo] = disponibili.find(([, z]) => (r -= z.peso) <= 0) || disponibili[0];
    const def = ZOMBIE[tipo];
    for (let tentativo = 0; tentativo < 16; tentativo++) {
      const a = this.casuale() * Math.PI * 2;
      const d = (notturno ? 380 : 520) + this.casuale() * 220;
      const x = io.x + Math.cos(a) * d;
      const y = io.y + Math.sin(a) * d;
      if (terrenoIn(this.mappa, x, y) === FITTO) continue;
      if (this.rettangoli.some((q) => x > q.x - 20 && x < q.x + q.w + 20 && y > q.y - 20 && y < q.y + q.h + 20)) continue;
      const forza = 1 + (this.giorno - 1) * 0.1;
      const vita = Math.round(def.vita * forza);
      this.zombie.push({ id: this.prossimoId++, tipo, x, y, raggio: def.raggio, vita, vitaMax: vita, danno: Math.round(def.danno * (1 + (this.giorno - 1) * 0.06)), attesa: 0, colpito: 0, fase: this.casuale() * 6, stato: notturno ? 'insegue' : 'vaga', meta: null, notturno, bloccato: 0, deviazione: 0 });
      return true;
    }
    return false;
  }

  aggiornaZombie(dt) {
    const io = this.io;
    const notte = this.buio() > 0.6;
    this.prossimoZombie -= dt;
    if (this.prossimoZombie <= 0) {
      const massimo = notte ? Math.min(6 + this.giorno * 3, 34) : Math.min(5 + this.giorno * 2, 18);
      if (this.zombie.length < massimo) this.generaZombie(notte);
      this.prossimoZombie = notte ? Math.max(3 - this.giorno * 0.25, 0.8) : 4;
    }
    for (const z of this.zombie) {
      const def = ZOMBIE[z.tipo];
      z.attesa = Math.max(z.attesa - dt, 0);
      z.colpito = Math.max(z.colpito - dt, 0);
      z.fase += dt * 5;
      const dx = io.x - z.x;
      const dy = io.y - z.y;
      const d = Math.hypot(dx, dy) || 1;
      if (z.stato === 'vaga' && d < def.vista * (notte ? 1.5 : 1)) {
        z.stato = 'insegue';
        this.emetti('avvistato', { x: z.x, y: z.y });
      }
      let vx;
      let vy;
      let velocita = def.velocita;
      if (z.stato === 'insegue') {
        vx = dx / d;
        vy = dy / d;
      } else {
        // Vaga piano verso una meta a caso
        if (!z.meta || Math.hypot(z.meta.x - z.x, z.meta.y - z.y) < 20) z.meta = { x: z.x + (this.casuale() - 0.5) * 300, y: z.y + (this.casuale() - 0.5) * 300 };
        const md = Math.hypot(z.meta.x - z.x, z.meta.y - z.y) || 1;
        vx = (z.meta.x - z.x) / md;
        vy = (z.meta.y - z.y) / md;
        velocita *= 0.4;
      }
      // Bloccato contro un muro: prova a girare di lato per un po'
      if (z.deviazione > 0) {
        z.deviazione -= dt;
        [vx, vy] = [vx * 0.3 - vy * z.lato, vy * 0.3 + vx * z.lato];
      }
      for (const m of this.zombie) {
        if (m === z) continue;
        const sx = z.x - m.x;
        const sy = z.y - m.y;
        const sd = Math.hypot(sx, sy);
        if (sd > 0 && sd < z.raggio + m.raggio) {
          vx += (sx / sd) * 0.8;
          vy += (sy / sd) * 0.8;
        }
      }
      const vd = Math.hypot(vx, vy) || 1;
      const passo = velocita * dt * (z.colpito > 0 ? 0.3 : 1);
      const px = z.x;
      const py = z.y;
      if (d > z.raggio + io.raggio + 2) this.muovi(z, (vx / vd) * passo, (vy / vd) * passo);
      const mosso = Math.hypot(z.x - px, z.y - py);
      z.bloccato = mosso < passo * 0.3 && z.stato === 'insegue' ? z.bloccato + dt : 0;
      if (z.bloccato > 0.8 && z.deviazione <= 0) {
        z.deviazione = 0.9;
        z.lato = this.casuale() < 0.5 ? -1 : 1;
        z.bloccato = 0;
      }
      // Attacco: al sopravvissuto, oppure alla costruzione che sbarra la strada
      if (z.attesa > 0) continue;
      if (d < z.raggio + io.raggio + 8) {
        z.attesa = 1;
        io.salute -= z.danno;
        io.ferito = 0.3;
        io.ultimaFerita = this.tempoAssoluto;
        this.muovi(io, (dx / d) * 24, (dy / d) * 24);
        this.emetti('ferito', { danno: z.danno, zombie: z.tipo });
        continue;
      }
      const ostacolo = this.strutture.find((s) => COSTRUZIONI[s.tipo].vita && Math.hypot(s.x - z.x, s.y - z.y) < z.raggio + COSTRUZIONI[s.tipo].raggio + 6);
      if (ostacolo && z.stato === 'insegue') {
        z.attesa = 1;
        ostacolo.vita -= z.danno;
        this.emetti('strutturaColpita', { x: ostacolo.x, y: ostacolo.y });
        if (ostacolo.vita <= 0) {
          this.strutture = this.strutture.filter((s) => s !== ostacolo);
          this.emetti('distrutto', { nome: COSTRUZIONI[ostacolo.tipo].nome, x: ostacolo.x, y: ostacolo.y });
        }
      }
    }
    // Trappole
    for (const t of this.strutture.filter((s) => s.tipo === 'trappola')) {
      for (const z of this.zombie) {
        if (Math.hypot(z.x - t.x, z.y - t.y) > COSTRUZIONI.trappola.raggio + z.raggio - 4 || z.trappola > this.tempoAssoluto) continue;
        z.trappola = this.tempoAssoluto + 1;
        t.colpi--;
        this.ferisci(z, COSTRUZIONI.trappola.danno, z.x - t.x, z.y - t.y);
        if (t.colpi <= 0) {
          this.strutture = this.strutture.filter((s) => s !== t);
          this.emetti('distrutto', { nome: COSTRUZIONI.trappola.nome, x: t.x, y: t.y });
          break;
        }
      }
    }
  }

  // ---------- Salvataggio ----------

  salva() {
    const inventario = { ...this.inventario };
    if (this.piazzamento) for (const [k, n] of Object.entries(COSTRUZIONI[this.piazzamento].costo)) inventario[k] = (inventario[k] || 0) + n;
    const armi = Object.fromEntries(Object.entries(this.armi).map(([k, v]) => [k, { usura: Number.isFinite(v.usura) ? v.usura : null }]));
    return {
      versione: 1,
      seme: this.seme,
      giorno: this.giorno,
      tempo: this.tempo,
      io: { x: this.io.x, y: this.io.y, salute: this.io.salute, fame: this.io.fame, sete: this.io.sete },
      inventario,
      armi,
      armaAttiva: this.armaAttiva,
      strutture: this.strutture,
      oggetti: this.oggetti.filter((o) => o.colpi !== (OGGETTI[o.tipo].colpi ?? 1)).map((o) => [o.id, o.colpi, o.ricresce]),
      statistiche: this.statistiche,
      prossimoId: this.prossimoId,
    };
  }

  static carica(dati) {
    const p = new Partita({ seme: dati.seme });
    p.giorno = dati.giorno;
    p.tempo = dati.tempo;
    Object.assign(p.io, dati.io);
    p.inventario = { ...dati.inventario };
    p.armi = Object.fromEntries(Object.entries(dati.armi).map(([k, v]) => [k, { usura: v.usura ?? Infinity }]));
    p.armaAttiva = p.armi[dati.armaAttiva] || dati.armaAttiva === 'pugni' ? dati.armaAttiva : 'pugni';
    p.strutture = dati.strutture.map((s) => ({ ...s }));
    for (const [id, colpi, ricresce] of dati.oggetti) Object.assign(p.oggetti[id], { colpi, ricresce });
    p.statistiche = { ...p.statistiche, ...dati.statistiche };
    p.prossimoId = dati.prossimoId || 1000;
    return p;
  }
}
