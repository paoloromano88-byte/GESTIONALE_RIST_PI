// Regole di Chef Naufrago: movimento, raccolta, attrezzi, costruzioni, cucina, fame, giorno e notte, nemici,
// salvataggio. Niente disegno né DOM: si prova con node --test.

import { generaIsola, terrenoIn, centroIsola, creaIndice, creaCasuale, OGGETTI, ACQUA } from './mondo.js';

export const GIORNO = 120;
export const NOTTE = 90;
export const CICLO = GIORNO + NOTTE;

export const ATTREZZI = {
  mattarello: { nome: 'Mattarello', costo: { legna: 3 }, danno: 14, descrizione: 'Colpisce più del doppio dei pugni' },
  ascia: { nome: 'Ascia', costo: { legna: 3, pietra: 2 }, danno: 11, descrizione: 'Doppia legna dagli alberi' },
  piccone: { nome: 'Piccone', costo: { legna: 2, pietra: 3 }, danno: 9, descrizione: 'Doppia pietra dalle rocce' },
  coltello: { nome: 'Coltello da chef', costo: { legna: 2, pietra: 4, peperoncino: 1 }, danno: 24, descrizione: 'L\'arma migliore' },
};

export const COSTRUZIONI = {
  falo: { nome: 'Falò', costo: { legna: 5, pietra: 3 }, raggio: 20, luce: 170, descrizione: 'Finché brucia tiene lontani i mostri (non i peperoncini). Va alimentato con la legna. Ci si cucina' },
  forno: { nome: 'Forno a legna', costo: { pietra: 12, legna: 6 }, raggio: 30, luce: 0, descrizione: 'Pane e pizze: il cibo migliore' },
  steccato: { nome: 'Steccato', costo: { legna: 3 }, raggio: 20, luce: 0, vita: 80, descrizione: 'Blocca i mostri finché regge: lo prendono a morsi' },
};

// Il falò brucia legna: secondi di fuoco alla costruzione, per ogni legna aggiunta e al massimo
export const FUOCO = { iniziale: 60, perLegna: 40, massimo: 240, basso: 20 };

export const CIBI = {
  pomodoro: { nome: 'Pomodoro', fame: 8, salute: 0 },
  fungo: { nome: 'Fungo crudo', fame: 4, salute: -4 },
  cipolla: { nome: 'Cipolla cruda', fame: 5, salute: 0 },
  pomodoroArrosto: { nome: 'Pomodoro arrosto', fame: 20, salute: 4 },
  funghiTrifolati: { nome: 'Funghi trifolati', fame: 30, salute: 6 },
  polpettaCotta: { nome: 'Polpetta cotta', fame: 35, salute: 10 },
  cipollaArrosto: { nome: 'Cipolla arrosto', fame: 18, salute: 4 },
  pane: { nome: 'Pane', fame: 30, salute: 5 },
  pizzaMargherita: { nome: 'Pizza margherita', fame: 55, salute: 25 },
  pizzaFunghi: { nome: 'Pizza ai funghi', fame: 60, salute: 25 },
  pizzaDiavola: { nome: 'Pizza diavola', fame: 50, salute: 35 },
};

export const RICETTE = {
  pomodoroArrosto: { dove: 'falo', costo: { pomodoro: 1 } },
  funghiTrifolati: { dove: 'falo', costo: { fungo: 2 } },
  polpettaCotta: { dove: 'falo', costo: { carne: 1 } },
  cipollaArrosto: { dove: 'falo', costo: { cipolla: 1 } },
  pane: { dove: 'forno', costo: { grano: 2 } },
  pizzaMargherita: { dove: 'forno', costo: { grano: 2, pomodoro: 2 } },
  pizzaFunghi: { dove: 'forno', costo: { grano: 2, pomodoro: 1, fungo: 2 } },
  pizzaDiavola: { dove: 'forno', costo: { grano: 2, pomodoro: 1, peperoncino: 1 } },
};

export const NEMICI = {
  polpetta: { nome: 'Polpetta rabbiosa', vita: 40, velocita: 105, danno: 12, raggio: 16, bottino: { carne: 1 }, daGiorno: 1, peso: 1 },
  cipolla: { nome: 'Cipolla piagnona', vita: 60, velocita: 72, danno: 9, raggio: 18, bottino: { cipolla: 2 }, daGiorno: 1, peso: 0.5, lacrime: 150 },
  // Il peperoncino è fuoco anche lui: la luce del falò non lo spaventa
  peperoncino: { nome: 'Peperoncino infuocato', vita: 28, velocita: 165, danno: 14, raggio: 14, bottino: { peperoncino: 1 }, daGiorno: 2, peso: 0.6, senzaPaura: true },
  polpettone: { nome: 'Grande Polpettone', vita: 320, velocita: 62, danno: 26, raggio: 34, bottino: { carne: 6 }, daGiorno: Infinity, peso: 0, senzaPaura: true },
};

// Ogni quante notti arriva il Grande Polpettone
export const NOTTE_DEL_BOSS = 4;

// I mostri si rinforzano giorno dopo giorno
export const forzaMostri = (giorno) => ({ vita: 1 + (giorno - 1) * 0.12, danno: 1 + (giorno - 1) * 0.08 });

export const RISORSE = { legna: 'Legna', pietra: 'Pietra', pomodoro: 'Pomodori', grano: 'Grano', fungo: 'Funghi', carne: 'Polpette crude', cipolla: 'Cipolle', peperoncino: 'Peperoncini' };

const VELOCITA = 150;
const RAGGIO_CHEF = 15;
const PORTATA = 46;
const FAME_AL_SECONDO = 100 / 190;

export function haAbbastanza(inventario, costo) {
  return Object.entries(costo).every(([k, n]) => (inventario[k] || 0) >= n);
}

export class Gioco {
  constructor({ seme = Date.now() % 1e9, casuale } = {}) {
    this.seme = seme;
    this.isola = generaIsola(seme);
    this.oggetti = this.isola.oggetti;
    this.indice = creaIndice(this.oggetti);
    this.casuale = casuale || creaCasuale(seme + 99);
    const c = centroIsola();
    this.chef = { x: c.x, y: c.y, raggio: RAGGIO_CHEF, salute: 100, fame: 100, direzione: 1, colpo: 0, ferito: 0, attesa: 0, ultimaFerita: -99, piange: false, passo: 0 };
    this.inventario = {};
    this.attrezzi = {};
    this.strutture = [];
    this.nemici = [];
    this.giorno = 1;
    this.tempo = 0;
    this.eventi = [];
    this.morto = false;
    this.piazzamento = null;
    this.prossimoNemico = 0;
    this.statistiche = { sconfitti: 0, pizze: 0 };
    this.prossimoId = 1;
  }

  get tempoAssoluto() {
    return (this.giorno - 1) * CICLO + this.tempo;
  }

  // 0 di giorno, 1 di notte, con tramonto e alba graduali
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
    let danno = 6;
    for (const [k, a] of Object.entries(ATTREZZI)) if (this.attrezzi[k]) danno = Math.max(danno, a.danno);
    return danno;
  }

  // Solo i falò accesi fanno luce; quando la legna sta finendo la luce si stringe
  luci() {
    return this.strutture
      .filter((s) => s.tipo === 'falo' && s.fuoco > 0)
      .map((s) => ({ x: s.x, y: s.y, raggio: COSTRUZIONI.falo.luce * (0.45 + 0.55 * Math.min(s.fuoco / FUOCO.iniziale, 1)) }));
  }

  // ---------- Movimento e ostacoli ----------

  solidiVicini(x, y, raggio) {
    const out = [];
    for (const o of this.indice.vicini(x, y, raggio + 40)) {
      const def = OGGETTI[o.tipo];
      if (!def.solido) continue;
      if (o.tipo === 'roccia' && o.colpi <= 0) continue;
      out.push({ x: o.x, y: o.y, raggio: o.tipo === 'albero' && o.colpi <= 0 ? 10 : def.raggio });
    }
    for (const s of this.strutture) if (Math.abs(s.x - x) < raggio + 60 && Math.abs(s.y - y) < raggio + 60) out.push({ x: s.x, y: s.y, raggio: COSTRUZIONI[s.tipo].raggio });
    return out;
  }

  muovi(e, dx, dy) {
    const r = e.raggio;
    const libero = (x, y) => terrenoIn(this.isola, x, y) !== ACQUA && terrenoIn(this.isola, x + Math.sign(dx) * r * 0.8, y) !== ACQUA && terrenoIn(this.isola, x, y + Math.sign(dy) * r * 0.8) !== ACQUA;
    if (dx && libero(e.x + dx, e.y)) e.x += dx;
    if (dy && libero(e.x, e.y + dy)) e.y += dy;
    for (const s of this.solidiVicini(e.x, e.y, r)) {
      const ddx = e.x - s.x;
      const ddy = e.y - s.y;
      const d = Math.hypot(ddx, ddy) || 0.01;
      const min = r + s.raggio;
      if (d < min) {
        const nx = e.x + (ddx / d) * (min - d);
        const ny = e.y + (ddy / d) * (min - d);
        if (terrenoIn(this.isola, nx, ny) !== ACQUA) {
          e.x = nx;
          e.y = ny;
        }
      }
    }
  }

  // ---------- Bersaglio del tasto azione ----------

  bersaglio() {
    const c = this.chef;
    let migliore = null;
    for (const n of this.nemici) {
      const d = Math.hypot(n.x - c.x, n.y - c.y) - NEMICI[n.tipo].raggio - c.raggio;
      if (d < PORTATA + 18 && (!migliore || d < migliore.d)) migliore = { d, tipo: 'nemico', ref: n, azione: 'colpisci' };
    }
    if (migliore) return migliore;
    for (const o of this.indice.vicini(c.x, c.y, 120)) {
      if (o.colpi <= 0) continue;
      const d = Math.hypot(o.x - c.x, o.y - c.y) - OGGETTI[o.tipo].raggio - c.raggio;
      if (d < PORTATA && (!migliore || d < migliore.d)) {
        const azione = o.tipo === 'albero' ? 'taglia' : o.tipo === 'roccia' ? 'scava' : 'raccogli';
        migliore = { d, tipo: 'oggetto', ref: o, azione };
      }
    }
    if (migliore) return migliore;
    for (const s of this.strutture) {
      if (s.tipo === 'steccato') continue;
      const d = Math.hypot(s.x - c.x, s.y - c.y) - COSTRUZIONI[s.tipo].raggio - c.raggio;
      if (d < PORTATA + 10 && (!migliore || d < migliore.d)) migliore = { d, tipo: 'struttura', ref: s, azione: 'cucina' };
    }
    return migliore;
  }

  azione() {
    const c = this.chef;
    if (this.morto || c.attesa > 0) return;
    const b = this.bersaglio();
    c.colpo = 0.25;
    if (!b) {
      c.attesa = 0.35;
      return;
    }
    c.direzione = b.ref.x >= c.x ? 1 : -1;
    if (b.tipo === 'nemico') return this.colpisci(b.ref);
    if (b.tipo === 'struttura') {
      c.attesa = 0.6;
      c.colpo = 0;
      return this.emetti('apriCucina', { dove: b.ref.tipo });
    }
    const o = b.ref;
    const def = OGGETTI[o.tipo];
    c.attesa = def.colpi > 1 ? 0.4 : 0.3;
    o.colpi--;
    const molt = def.attrezzo && this.attrezzi[def.attrezzo] ? 2 : 1;
    this.aggiungi({ [def.risorsa]: def.perColpo }, molt);
    this.emetti('raccolto', { risorsa: def.risorsa, quanti: def.perColpo * molt, x: o.x, y: o.y - 30, oggetto: o.tipo });
    if (o.colpi <= 0) {
      o.ricresce = this.tempoAssoluto + def.ricresce;
      this.emetti('esaurito', { oggetto: o.tipo, x: o.x, y: o.y });
    }
  }

  colpisci(n) {
    const c = this.chef;
    c.attesa = 0.45;
    const danno = this.arma();
    n.vita -= danno;
    n.colpito = 0.2;
    const d = Math.hypot(n.x - c.x, n.y - c.y) || 1;
    this.muovi(n, ((n.x - c.x) / d) * 34, ((n.y - c.y) / d) * 34);
    this.emetti('colpito', { x: n.x, y: n.y - 20, danno, nemico: n.tipo });
    if (n.vita <= 0) {
      this.nemici = this.nemici.filter((x) => x !== n);
      this.aggiungi(NEMICI[n.tipo].bottino);
      this.statistiche.sconfitti++;
      this.emetti('sconfitto', { x: n.x, y: n.y, nemico: n.tipo, bottino: NEMICI[n.tipo].bottino });
    }
  }

  // ---------- Creare, costruire, cucinare, mangiare ----------

  crea(nome) {
    if (ATTREZZI[nome]) {
      const a = ATTREZZI[nome];
      if (this.attrezzi[nome] || !haAbbastanza(this.inventario, a.costo)) return false;
      this.spendi(a.costo);
      this.attrezzi[nome] = true;
      this.emetti('creato', { nome });
      return true;
    }
    const s = COSTRUZIONI[nome];
    if (!s || this.piazzamento || !haAbbastanza(this.inventario, s.costo)) return false;
    this.spendi(s.costo);
    this.piazzamento = nome;
    return true;
  }

  // Dove andrebbe la costruzione in attesa: davanti allo chef
  puntoPiazzamento() {
    const c = this.chef;
    const r = COSTRUZIONI[this.piazzamento]?.raggio || 20;
    return { x: c.x + c.direzione * (c.raggio + r + 14), y: c.y + 4 };
  }

  puoPiazzare(x, y) {
    if (!this.piazzamento) return false;
    const r = COSTRUZIONI[this.piazzamento].raggio;
    for (const [dx, dy] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]]) if (terrenoIn(this.isola, x + dx, y + dy) === ACQUA) return false;
    for (const s of this.solidiVicini(x, y, r)) if (Math.hypot(s.x - x, s.y - y) < s.raggio + r - 4) return false;
    for (const o of this.indice.vicini(x, y, r + 30)) if (o.colpi > 0 && !OGGETTI[o.tipo].solido && Math.hypot(o.x - x, o.y - y) < OGGETTI[o.tipo].raggio + r) return false;
    return Math.hypot(this.chef.x - x, this.chef.y - y) >= this.chef.raggio + r - 2;
  }

  piazza() {
    const p = this.puntoPiazzamento();
    if (!this.puoPiazzare(p.x, p.y)) return false;
    const s = { id: this.prossimoId++, tipo: this.piazzamento, x: p.x, y: p.y };
    if (s.tipo === 'falo') s.fuoco = FUOCO.iniziale;
    if (COSTRUZIONI[s.tipo].vita) s.vita = COSTRUZIONI[s.tipo].vita;
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

  vicina(tipo) {
    return this.strutture.find((s) => s.tipo === tipo && Math.hypot(s.x - this.chef.x, s.y - this.chef.y) < COSTRUZIONI[tipo].raggio + this.chef.raggio + PORTATA + 30);
  }

  // Si cucina solo sul fuoco acceso
  vicinoA(tipo) {
    const s = this.vicina(tipo);
    return !!s && (tipo !== 'falo' || s.fuoco > 0);
  }

  alimenta() {
    const s = this.vicina('falo');
    if (!s || !(this.inventario.legna > 0) || s.fuoco >= FUOCO.massimo - 1) return false;
    this.inventario.legna--;
    s.fuoco = Math.min(s.fuoco + FUOCO.perLegna, FUOCO.massimo);
    this.emetti('alimentato', { x: s.x, y: s.y - 50 });
    return true;
  }

  cucina(nome) {
    const r = RICETTE[nome];
    if (!r || !this.vicinoA(r.dove) || !haAbbastanza(this.inventario, r.costo)) return false;
    this.spendi(r.costo);
    this.aggiungi({ [nome]: 1 });
    if (nome.startsWith('pizza')) this.statistiche.pizze++;
    this.emetti('cucinato', { nome });
    return true;
  }

  mangia(nome) {
    const cibo = CIBI[nome];
    if (!cibo || !(this.inventario[nome] > 0) || this.morto) return false;
    this.inventario[nome]--;
    const c = this.chef;
    c.fame = Math.min(c.fame + cibo.fame, 100);
    c.salute = Math.max(Math.min(c.salute + cibo.salute, 100), 1);
    this.emetti('mangiato', { nome });
    return true;
  }

  // ---------- Tempo che passa ----------

  aggiorna(dt, comandi = {}) {
    if (this.morto) return;
    const c = this.chef;
    c.attesa = Math.max(c.attesa - dt, 0);
    c.colpo = Math.max(c.colpo - dt, 0);
    c.ferito = Math.max(c.ferito - dt, 0);

    // Movimento (le lacrime della cipolla rallentano)
    const mx = comandi.mx || 0;
    const my = comandi.my || 0;
    const forza = Math.min(Math.hypot(mx, my), 1);
    if (forza > 0.05) {
      const v = VELOCITA * forza * (c.piange ? 0.6 : 1) * dt;
      const d = Math.hypot(mx, my);
      this.muovi(c, (mx / d) * v, (my / d) * v);
      if (Math.abs(mx) > 0.15) c.direzione = mx > 0 ? 1 : -1;
      c.passo += dt * 10 * forza;
    }
    if (comandi.azione) this.azione();

    // Fame e salute
    c.fame = Math.max(c.fame - FAME_AL_SECONDO * dt, 0);
    // Si guarisce da soli solo a pancia piena e lontani dai guai, e piano: per il resto serve cibo cotto
    if (c.fame <= 0) c.salute -= 2.5 * dt;
    else if (c.fame > 75 && this.tempoAssoluto - c.ultimaFerita > 8) c.salute = Math.min(c.salute + 0.3 * dt, 100);

    // I falò consumano la legna
    for (const s of this.strutture) {
      if (s.tipo !== 'falo' || !(s.fuoco > 0)) continue;
      const prima = s.fuoco;
      s.fuoco = Math.max(s.fuoco - dt, 0);
      if (prima > FUOCO.basso && s.fuoco <= FUOCO.basso) this.emetti('fuocoBasso', { x: s.x, y: s.y });
      if (s.fuoco <= 0) this.emetti('fuocoSpento', { x: s.x, y: s.y });
    }
    if (c.fame < 25 && c.fame + FAME_AL_SECONDO * dt >= 25) this.emetti('affamato');

    // Le piante e gli alberi ricrescono
    const ora = this.tempoAssoluto;
    for (const o of this.oggetti) {
      if (o.colpi <= 0 && o.ricresce && ora >= o.ricresce && Math.hypot(o.x - c.x, o.y - c.y) > OGGETTI[o.tipo].raggio + c.raggio + 4) {
        o.colpi = OGGETTI[o.tipo].colpi;
        o.ricresce = 0;
      }
    }

    // Giorno e notte
    const prima = this.buio();
    this.tempo += dt;
    if (prima < 0.5 && this.buio() >= 0.5) {
      this.emetti('notte', { giorno: this.giorno });
      this.prossimoNemico = 1;
      if (this.giorno % NOTTE_DEL_BOSS === 0 && this.generaNemico('polpettone')) this.emetti('boss');
    }
    if (this.tempo >= CICLO) {
      this.tempo -= CICLO;
      this.giorno++;
      for (const n of this.nemici) this.emetti('sciolto', { x: n.x, y: n.y, nemico: n.tipo });
      this.nemici = [];
      this.prossimoNemico = 12;
      this.emetti('alba', { giorno: this.giorno });
    }

    this.aggiornaNemici(dt);
    if (c.salute <= 0) {
      c.salute = 0;
      this.morto = true;
      this.emetti('morto', { giorno: this.giorno });
    }
  }

  generaNemico(tipo) {
    const c = this.chef;
    if (!tipo) {
      const disponibili = Object.entries(NEMICI).filter(([, n]) => this.giorno >= n.daGiorno && n.peso > 0);
      const totale = disponibili.reduce((a, [, n]) => a + n.peso, 0);
      let r = this.casuale() * totale;
      [tipo] = disponibili.find(([, n]) => (r -= n.peso) <= 0) || disponibili[0];
    }
    const def = NEMICI[tipo];
    const forza = forzaMostri(this.giorno);
    const luci = def.senzaPaura ? [] : this.luci();
    for (let tentativo = 0; tentativo < 12; tentativo++) {
      const a = this.casuale() * Math.PI * 2;
      const d = 300 + this.casuale() * 130;
      const x = c.x + Math.cos(a) * d;
      const y = c.y + Math.sin(a) * d;
      if (terrenoIn(this.isola, x, y) === ACQUA) continue;
      if (luci.some((l) => Math.hypot(l.x - x, l.y - y) < l.raggio + 40)) continue;
      const vita = Math.round(def.vita * forza.vita);
      this.nemici.push({ id: this.prossimoId++, tipo, x, y, raggio: def.raggio, vita, vitaMax: vita, danno: Math.round(def.danno * forza.danno), attesa: 0, colpito: 0, fase: this.casuale() * 6 });
      return true;
    }
    return false;
  }

  aggiornaNemici(dt) {
    const c = this.chef;
    this.prossimoNemico -= dt;
    if (this.buio() > 0.6) {
      // Di notte: sempre di più, sempre più spesso
      const massimo = Math.min(5 + this.giorno * 3, 30);
      if (this.prossimoNemico <= 0 && this.nemici.length < massimo) {
        this.generaNemico();
        this.prossimoNemico = Math.max(3.2 - this.giorno * 0.3, 0.9);
      }
    } else if (this.buio() === 0 && this.giorno >= 2) {
      // Dal secondo giorno qualche polpetta gira anche con la luce del sole
      if (this.prossimoNemico <= 0 && this.nemici.length < 1 + Math.floor(this.giorno / 2)) this.generaNemico('polpetta');
      if (this.prossimoNemico <= 0) this.prossimoNemico = 14;
    }
    const luci = this.luci();
    c.piange = false;
    for (const n of this.nemici) {
      const def = NEMICI[n.tipo];
      n.attesa = Math.max(n.attesa - dt, 0);
      n.colpito = Math.max(n.colpito - dt, 0);
      n.fase += dt * 6;
      const dx = c.x - n.x;
      const dy = c.y - n.y;
      const d = Math.hypot(dx, dy) || 1;
      if (def.lacrime && d < def.lacrime) c.piange = true;
      let vx = dx / d;
      let vy = dy / d;
      // La luce del fuoco li respinge (tranne chi non ha paura del fuoco)
      for (const l of def.senzaPaura ? [] : luci) {
        const lx = n.x - l.x;
        const ly = n.y - l.y;
        const ld = Math.hypot(lx, ly) || 1;
        if (ld < l.raggio + 12) {
          const k = 2.5 * (1 - ld / (l.raggio + 12)) + 1.1;
          vx += (lx / ld) * k;
          vy += (ly / ld) * k;
        }
      }
      // Non si ammucchiano
      for (const m of this.nemici) {
        if (m === n) continue;
        const sx = n.x - m.x;
        const sy = n.y - m.y;
        const sd = Math.hypot(sx, sy);
        if (sd > 0 && sd < n.raggio + m.raggio) {
          vx += (sx / sd) * 0.8;
          vy += (sy / sd) * 0.8;
        }
      }
      const vd = Math.hypot(vx, vy) || 1;
      const passo = def.velocita * dt * (n.colpito > 0 ? 0.3 : 1);
      if (d > n.raggio + c.raggio + 2) this.muovi(n, (vx / vd) * passo, (vy / vd) * passo);
      const danno = n.danno || def.danno;
      if (d < n.raggio + c.raggio + 8 && n.attesa <= 0) {
        n.attesa = 1;
        c.salute -= danno;
        c.ferito = 0.3;
        c.ultimaFerita = this.tempoAssoluto;
        this.muovi(c, (dx / d) * 28, (dy / d) * 28);
        this.emetti('ferito', { danno, nemico: n.tipo });
      } else if (n.attesa <= 0) {
        // Uno steccato in mezzo: lo prendono a morsi
        const s = this.strutture.find((s) => s.tipo === 'steccato' && Math.hypot(s.x - n.x, s.y - n.y) < n.raggio + COSTRUZIONI.steccato.raggio + 6);
        if (s) {
          n.attesa = 1;
          s.vita -= danno;
          this.emetti('steccatoColpito', { x: s.x, y: s.y - 20 });
          if (s.vita <= 0) {
            this.strutture = this.strutture.filter((x) => x !== s);
            this.emetti('distrutto', { x: s.x, y: s.y });
          }
        }
      }
    }
  }

  // ---------- Salvataggio ----------

  salva() {
    // Una costruzione non ancora piazzata torna nello zaino
    const inventario = { ...this.inventario };
    if (this.piazzamento) for (const [k, n] of Object.entries(COSTRUZIONI[this.piazzamento].costo)) inventario[k] = (inventario[k] || 0) + n;
    return {
      versione: 1,
      seme: this.seme,
      giorno: this.giorno,
      tempo: this.tempo,
      chef: { x: this.chef.x, y: this.chef.y, salute: this.chef.salute, fame: this.chef.fame },
      inventario,
      attrezzi: this.attrezzi,
      strutture: this.strutture,
      oggetti: this.oggetti.filter((o) => o.colpi !== OGGETTI[o.tipo].colpi).map((o) => [o.id, o.colpi, o.ricresce]),
      statistiche: this.statistiche,
      prossimoId: this.prossimoId,
    };
  }

  static carica(dati) {
    const g = new Gioco({ seme: dati.seme });
    g.giorno = dati.giorno;
    g.tempo = dati.tempo;
    Object.assign(g.chef, dati.chef);
    g.inventario = { ...dati.inventario };
    g.attrezzi = { ...dati.attrezzi };
    g.strutture = dati.strutture.map((s) => ({ ...s }));
    for (const s of g.strutture) {
      if (s.tipo === 'falo' && s.fuoco === undefined) s.fuoco = FUOCO.iniziale;
      if (COSTRUZIONI[s.tipo].vita && s.vita === undefined) s.vita = COSTRUZIONI[s.tipo].vita;
    }
    for (const [id, colpi, ricresce] of dati.oggetti) Object.assign(g.oggetti[id], { colpi, ricresce });
    g.statistiche = { ...g.statistiche, ...dati.statistiche };
    g.prossimoId = dati.prossimoId || 1000;
    return g;
  }
}
