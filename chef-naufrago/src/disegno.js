// Grafica cartoon: contorni scuri spessi, colori pieni, ombre morbide a terra.
// Il terreno si disegna a blocchi in tele di appoggio; gli oggetti fermi si disegnano una volta (cache);
// chef, mostri, fuoco ed effetti si disegnano a ogni fotogramma.

import { LATO, CASELLE, ACQUA, SABBIA, ERBA, OGGETTI, hashCasella } from './mondo.js';
import { COSTRUZIONI, NEMICI } from './logica.js';

const O = '#2e1a24';
const TAU = Math.PI * 2;
const BLOCCO = 8;

function tela(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

function cerchio(g, x, y, r) {
  g.beginPath();
  g.arc(x, y, r, 0, TAU);
}

// Riempie le forme e le contorna tutte insieme: prima il bordo spesso, poi il colore sopra
export function contornato(g, forme, colore, bordo = 3) {
  g.save();
  g.lineJoin = 'round';
  g.lineCap = 'round';
  g.strokeStyle = O;
  g.lineWidth = bordo * 2;
  for (const f of forme) {
    f();
    g.stroke();
  }
  g.fillStyle = colore;
  for (const f of forme) {
    f();
    g.fill();
  }
  g.restore();
}

function ombra(g, x, y, rx, ry = rx * 0.38) {
  g.save();
  g.fillStyle = 'rgba(30,20,40,0.25)';
  g.beginPath();
  g.ellipse(x, y, rx, ry, 0, 0, TAU);
  g.fill();
  g.restore();
}

// ---------- Oggetti fermi (disegnati con la base in (0,0)) ----------

export const SPRITE = {
  albero(g, v) {
    const ulivo = v > 0.7;
    const verde = ulivo ? '#93b95a' : '#4cbb47';
    const chiaro = ulivo ? '#b6d77c' : '#7fdc5f';
    ombra(g, 0, 0, 30);
    contornato(g, [() => g.rect(-7, -34, 14, 34)], '#9a5b30');
    const s = 0.9 + v * 0.25;
    const chioma = [[-17, -48, 20], [17, -48, 20], [0, -64, 24], [0, -42, 22]].map(([x, y, r]) => () => cerchio(g, x * s, y * s, r * s));
    contornato(g, chioma, verde);
    g.fillStyle = chiaro;
    cerchio(g, -6 * s, -68 * s, 10 * s);
    g.fill();
    cerchio(g, -20 * s, -53 * s, 7 * s);
    g.fill();
    if (ulivo) {
      g.fillStyle = '#3b2b4f';
      for (const [x, y] of [[10, -50], [-12, -40], [4, -58], [18, -40]]) {
        cerchio(g, x * s, y * s, 3.2);
        g.fill();
      }
    }
  },
  ceppo(g) {
    ombra(g, 0, 0, 18);
    contornato(g, [() => g.rect(-12, -14, 24, 14)], '#9a5b30');
    contornato(g, [() => { g.beginPath(); g.ellipse(0, -14, 12, 5, 0, 0, TAU); }], '#e3b07a', 2.5);
    g.strokeStyle = '#b07a48';
    g.lineWidth = 1.5;
    g.beginPath();
    g.ellipse(0, -14, 6, 2.4, 0, 0, TAU);
    g.stroke();
  },
  roccia(g, v) {
    ombra(g, 0, 0, 26);
    const punti = [[-24, -2], [-20, -20], [-6, -30], [12, -27], [24, -12], [22, 0]].map(([x, y], i) => [x * (0.9 + ((v * (i + 3)) % 0.25)), y * (0.85 + v * 0.3)]);
    contornato(g, [() => { g.beginPath(); punti.forEach(([x, y]) => g.lineTo(x, y)); g.closePath(); }], '#a9a6b9');
    g.fillStyle = '#cdcadb';
    g.beginPath();
    g.moveTo(punti[1][0] + 4, punti[1][1] + 3);
    g.lineTo(punti[2][0] + 2, punti[2][1] + 4);
    g.lineTo(punti[3][0] - 2, punti[3][1] + 4);
    g.lineTo(2, -12);
    g.closePath();
    g.fill();
  },
  pomodori(g, v, vuoto) {
    ombra(g, 0, 0, 22);
    const cespuglio = [[-11, -14, 13], [11, -14, 13], [0, -22, 14], [0, -10, 14]].map(([x, y, r]) => () => cerchio(g, x, y, r));
    contornato(g, cespuglio, vuoto ? '#3e8f3f' : '#46a948');
    if (vuoto) return;
    for (const [x, y] of [[-10, -18], [9, -24], [8, -9], [-3, -6]]) {
      contornato(g, [() => cerchio(g, x, y, 5.5)], '#ff4040', 1.8);
      g.fillStyle = 'rgba(255,255,255,0.8)';
      cerchio(g, x - 1.8, y - 2, 1.6);
      g.fill();
    }
  },
  grano(g, v, vuoto) {
    ombra(g, 0, 0, 18);
    if (vuoto) {
      g.strokeStyle = '#b98f2e';
      g.lineWidth = 2.5;
      g.lineCap = 'round';
      for (const x of [-8, -2, 4, 10]) {
        g.beginPath();
        g.moveTo(x, 0);
        g.lineTo(x + 1, -6);
        g.stroke();
      }
      return;
    }
    for (const [x, a] of [[-10, -0.25], [-4, -0.08], [3, 0.1], [9, 0.25], [0, 0]]) {
      g.save();
      g.translate(x, 0);
      g.rotate(a);
      g.strokeStyle = O;
      g.lineWidth = 5;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(0, -26);
      g.stroke();
      g.strokeStyle = '#d9a93a';
      g.lineWidth = 2;
      g.stroke();
      contornato(g, [() => { g.beginPath(); g.ellipse(0, -32, 4.5, 9, 0, 0, TAU); }], '#ffd34d', 1.8);
      g.restore();
    }
  },
  funghi(g, v, vuoto) {
    if (vuoto) return;
    ombra(g, 0, 0, 18);
    for (const [x, s] of [[-8, 0.8], [7, 1]]) {
      contornato(g, [() => g.rect(x - 4 * s, -14 * s, 8 * s, 14 * s)], '#fff3dc', 2);
      contornato(g, [() => { g.beginPath(); g.ellipse(x, -15 * s, 12 * s, 9 * s, 0, Math.PI, TAU); g.closePath(); }], '#b9652a', 2.2);
      g.fillStyle = 'rgba(255,230,190,0.7)';
      cerchio(g, x - 4 * s, -19 * s, 2.2 * s);
      g.fill();
    }
  },
  steccato(g) {
    ombra(g, 0, 0, 26, 8);
    contornato(g, [() => g.rect(-22, -20, 44, 6), () => g.rect(-22, -10, 44, 6)], '#c98a52', 2.5);
    for (const x of [-18, 0, 18]) {
      contornato(g, [() => { g.beginPath(); g.moveTo(x - 4, 0); g.lineTo(x - 4, -26); g.lineTo(x, -31); g.lineTo(x + 4, -26); g.lineTo(x + 4, 0); g.closePath(); }], '#e0a868', 2.5);
    }
  },
  forno(g) {
    ombra(g, 0, 2, 40, 14);
    contornato(g, [() => g.rect(24 - 26, -78, 12, 30)], '#8a8597', 2.5);
    contornato(g, [() => { g.beginPath(); g.moveTo(-36, 0); g.lineTo(-36, -24); g.arc(0, -24, 36, Math.PI, TAU); g.lineTo(36, 0); g.closePath(); }], '#e07a4b');
    g.strokeStyle = 'rgba(120,40,20,0.35)';
    g.lineWidth = 2;
    for (let i = 0; i < 4; i++) {
      g.beginPath();
      g.arc(0, -24, 12 + i * 7, Math.PI * 1.1, Math.PI * 1.9);
      g.stroke();
    }
    contornato(g, [() => { g.beginPath(); g.moveTo(-15, 0); g.lineTo(-15, -14); g.arc(0, -14, 15, Math.PI, TAU); g.lineTo(15, 0); g.closePath(); }], '#3a1d1d', 2.5);
  },
  falo(g) {
    ombra(g, 0, 2, 28, 10);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      contornato(g, [() => { g.beginPath(); g.ellipse(Math.cos(a) * 20, Math.sin(a) * 9 - 4, 7, 5, 0, 0, TAU); }], i % 2 ? '#9d9aae' : '#b9b6c8', 2);
    }
    g.save();
    g.translate(0, -6);
    for (const a of [-0.5, 0.5]) {
      g.save();
      g.rotate(a);
      contornato(g, [() => g.rect(-16, -4, 32, 8)], '#8a4f27', 2);
      g.restore();
    }
    g.restore();
  },
};

// ---------- Il disegnatore ----------

export class Disegnatore {
  constructor(ctx) {
    this.ctx = ctx;
    this.blocchi = new Map();
    this.sprite = new Map();
    this.buio = tela(1, 1);
    this.isola = null;
  }

  imposta(L, A, dpr, zoom) {
    this.L = L;
    this.A = A;
    this.dpr = dpr;
    this.zoom = zoom;
    this.k = zoom * Math.min(dpr, 2);
    this.blocchi.clear();
    this.sprite.clear();
    this.buio = tela(L * Math.min(dpr, 2), A * Math.min(dpr, 2));
  }

  // ---------- Terreno ----------

  blocco(isola, bx, by) {
    const chiave = `${bx},${by}`;
    let c = this.blocchi.get(chiave);
    if (c) return c;
    const misura = BLOCCO * LATO;
    c = tela(misura * this.k, misura * this.k);
    const g = c.getContext('2d');
    g.scale(this.k, this.k);
    g.translate(-bx * misura, -by * misura);
    g.fillStyle = '#39c2e6';
    g.fillRect(bx * misura, by * misura, misura, misura);
    const caselle = [];
    for (let y = by * BLOCCO - 2; y < (by + 1) * BLOCCO + 2; y++) {
      for (let x = bx * BLOCCO - 2; x < (bx + 1) * BLOCCO + 2; x++) {
        const t = x >= 0 && y >= 0 && x < CASELLE && y < CASELLE ? isola.terreno[y * CASELLE + x] : ACQUA;
        caselle.push({ x, y, t, cx: (x + 0.5) * LATO, cy: (y + 0.5) * LATO, h: hashCasella(x, y, isola.seme) });
      }
    }
    // Onde sull'acqua
    g.strokeStyle = 'rgba(255,255,255,0.35)';
    g.lineWidth = 2.5;
    g.lineCap = 'round';
    for (const q of caselle) {
      if (q.t !== ACQUA || q.h > 0.18) continue;
      g.beginPath();
      g.arc(q.cx, q.cy, 7, Math.PI * 1.15, Math.PI * 1.85);
      g.stroke();
    }
    const strato = (filtro, raggio, colore) => {
      g.fillStyle = colore;
      g.beginPath();
      for (const q of caselle) {
        if (!filtro(q.t)) continue;
        g.moveTo(q.cx + raggio * LATO, q.cy);
        g.arc(q.cx, q.cy, raggio * LATO, 0, TAU);
      }
      g.fill();
    };
    const terra = (t) => t !== ACQUA;
    const erba = (t) => t === ERBA;
    strato(terra, 0.98, 'rgba(255,255,255,0.45)');
    strato(terra, 0.84, O);
    strato(terra, 0.78, '#ffd98a');
    strato(erba, 0.8, '#2f8a34');
    strato(erba, 0.74, '#79d651');
    // Macchie, ciuffi e fiori
    for (const q of caselle) {
      if (q.t === ERBA) {
        if (q.h < 0.35) {
          g.fillStyle = '#86e05c';
          cerchio(g, q.cx + (q.h - 0.17) * 40, q.cy + (q.h * 7 % 1 - 0.5) * 20, 14);
          g.fill();
        }
        if (q.h > 0.55 && q.h < 0.75) {
          g.strokeStyle = '#3f9e3a';
          g.lineWidth = 2;
          const x = q.cx + (q.h * 13 % 1 - 0.5) * 30;
          const y = q.cy + (q.h * 29 % 1 - 0.5) * 30;
          g.beginPath();
          g.moveTo(x - 4, y - 5);
          g.lineTo(x, y);
          g.lineTo(x + 4, y - 6);
          g.moveTo(x, y);
          g.lineTo(x, y - 7);
          g.stroke();
        }
        if (q.h > 0.92) {
          const x = q.cx + (q.h * 17 % 1 - 0.5) * 30;
          const y = q.cy + (q.h * 23 % 1 - 0.5) * 30;
          g.fillStyle = q.h > 0.96 ? '#fff' : '#ffe14d';
          for (let i = 0; i < 5; i++) {
            cerchio(g, x + Math.cos((i / 5) * TAU) * 3, y + Math.sin((i / 5) * TAU) * 3, 2.2);
            g.fill();
          }
          g.fillStyle = '#ff8a3d';
          cerchio(g, x, y, 1.8);
          g.fill();
        }
      } else if (q.t === SABBIA && q.h < 0.4) {
        g.fillStyle = 'rgba(200,150,80,0.45)';
        cerchio(g, q.cx + (q.h - 0.2) * 50, q.cy + (q.h * 11 % 1 - 0.5) * 24, 2);
        g.fill();
      }
    }
    if (this.blocchi.size > 40) this.blocchi.delete(this.blocchi.keys().next().value);
    this.blocchi.set(chiave, c);
    return c;
  }

  disegnaTerreno(g, isola, cam) {
    const misura = BLOCCO * LATO;
    const x0 = cam.x - this.L / 2 / this.zoom;
    const y0 = cam.y - this.A / 2 / this.zoom;
    const x1 = x0 + this.L / this.zoom;
    const y1 = y0 + this.A / this.zoom;
    for (let by = Math.floor(y0 / misura); by <= Math.floor(y1 / misura); by++) {
      for (let bx = Math.floor(x0 / misura); bx <= Math.floor(x1 / misura); bx++) {
        g.drawImage(this.blocco(isola, bx, by), bx * misura, by * misura, misura, misura);
      }
    }
  }

  // ---------- Oggetti fermi ----------

  disegnaSprite(g, nome, x, y, variante = 0, vuoto = false, alfa = 1) {
    const v = Math.round(variante * 4) / 4;
    const chiave = `${nome}|${v}|${vuoto}`;
    let s = this.sprite.get(chiave);
    if (!s) {
      const w = 110;
      const h = 130;
      s = tela(w * this.k, h * this.k);
      const sg = s.getContext('2d');
      sg.scale(this.k, this.k);
      sg.translate(w / 2, h - 20);
      SPRITE[nome](sg, v, vuoto);
      s.base = { w, h };
      this.sprite.set(chiave, s);
    }
    g.save();
    g.globalAlpha = alfa;
    g.drawImage(s, x - s.base.w / 2, y - (s.base.h - 20), s.base.w, s.base.h);
    g.restore();
  }

  // ---------- Lo chef ----------

  disegnaChef(g, c, t, attrezzo) {
    const passo = Math.sin(c.passo) * (c.passo ? 1 : 0);
    const salto = Math.abs(Math.sin(c.passo)) * 2.5;
    ombra(g, c.x, c.y + 2, 17, 6);
    g.save();
    g.translate(c.x, c.y - salto);
    g.scale(c.direzione, 1);
    // Gambe
    contornato(g, [() => { g.beginPath(); g.ellipse(-6 + passo * 3, -2, 5, 4, 0, 0, TAU); }, () => { g.beginPath(); g.ellipse(6 - passo * 3, -2, 5, 4, 0, 0, TAU); }], '#3b3355', 2);
    // Giacca
    contornato(g, [() => { g.beginPath(); g.ellipse(0, -16, 14, 15, 0, 0, TAU); }], c.ferito > 0 ? '#ffb3b3' : '#ffffff');
    g.fillStyle = '#d64545';
    for (const y of [-22, -15, -8]) {
      cerchio(g, 4, y, 1.8);
      g.fill();
    }
    contornato(g, [() => { g.beginPath(); g.moveTo(-7, -29); g.lineTo(7, -29); g.lineTo(0, -22); g.closePath(); }], '#e63946', 1.5);
    // Braccio con l'attrezzo che oscilla quando colpisce
    const k = c.colpo > 0 ? c.colpo / 0.25 : 0;
    const colpo = k > 0 ? Math.sin((1 - k) * Math.PI) : 0;
    g.save();
    g.translate(10, -18);
    g.rotate(-0.5 + colpo * 1.9);
    disegnaAttrezzo(g, attrezzo);
    contornato(g, [() => cerchio(g, 0, 0, 4.5)], '#ffd2a6', 2);
    g.restore();
    // Testa
    contornato(g, [() => cerchio(g, 0, -38, 12)], '#ffcf9f');
    g.fillStyle = '#ff9c8a';
    cerchio(g, 7, -34, 3);
    g.fill();
    g.fillStyle = O;
    cerchio(g, 4, -40, 1.9);
    g.fill();
    cerchio(g, 9, -40, 1.9);
    g.fill();
    // Baffi
    contornato(g, [() => { g.beginPath(); g.ellipse(2, -33, 5, 2.4, 0.3, 0, TAU); }, () => { g.beginPath(); g.ellipse(10, -33, 5, 2.4, -0.3, 0, TAU); }], '#5a3420', 1.5);
    // Cappello da cuoco
    contornato(g, [() => g.rect(-10, -54, 20, 8), () => cerchio(g, -6, -60, 8), () => cerchio(g, 6, -60, 8), () => cerchio(g, 0, -66, 9)], '#ffffff', 2.5);
    if (c.piange) {
      g.fillStyle = '#5ac8ff';
      for (const [x, d] of [[3, 0], [9, 0.5]]) {
        const y = -36 + ((t * 2 + d) % 1) * 12;
        g.beginPath();
        g.ellipse(x, y, 1.8, 2.8, 0, 0, TAU);
        g.fill();
      }
    }
    g.restore();
  }

  // ---------- Mostri ----------

  disegnaNemico(g, n, t, chef) {
    const def = NEMICI[n.tipo];
    const r = def.raggio;
    const salto = n.tipo === 'polpetta' ? Math.abs(Math.sin(n.fase)) * 7 : n.tipo === 'peperoncino' ? Math.abs(Math.sin(n.fase * 1.5)) * 4 : 0;
    const guarda = Math.sign(chef.x - n.x) || 1;
    ombra(g, n.x, n.y + 2, r * 1.05, r * 0.38);
    g.save();
    g.translate(n.x, n.y - salto);
    const bianco = n.colpito > 0;
    if (n.tipo === 'polpetta') {
      const sq = 1 + Math.sin(n.fase * 2) * 0.06;
      g.scale(sq, 1 / sq);
      contornato(g, [() => cerchio(g, 0, -r, r)], bianco ? '#fff' : '#9a5532');
      if (!bianco) {
        g.fillStyle = '#7a3e22';
        for (const [x, y, s] of [[-7, -8, 3], [6, -22, 2.5], [8, -10, 2], [-4, -24, 2]]) {
          cerchio(g, x, y, s);
          g.fill();
        }
        contornato(g, [() => { g.beginPath(); g.ellipse(0, -r * 1.7, r * 0.7, r * 0.35, 0, 0, TAU); }], '#e5383b', 1.8);
      }
      occhiCattivi(g, guarda * 3, -r - 2, 4.5, guarda);
    } else if (n.tipo === 'cipolla') {
      g.rotate(Math.sin(n.fase * 0.7) * 0.08);
      contornato(g, [() => { g.beginPath(); g.moveTo(0, -r * 2.3); g.quadraticCurveTo(r * 1.25, -r * 1.3, r * 0.9, -r * 0.3); g.quadraticCurveTo(0, r * 0.35, -r * 0.9, -r * 0.3); g.quadraticCurveTo(-r * 1.25, -r * 1.3, 0, -r * 2.3); }], bianco ? '#fff' : '#b46bb8');
      g.strokeStyle = 'rgba(255,255,255,0.5)';
      g.lineWidth = 2;
      for (const x of [-0.45, 0.45]) {
        g.beginPath();
        g.moveTo(0, -r * 2.15);
        g.quadraticCurveTo(r * x * 1.6, -r, r * x * 0.7, -r * 0.1);
        g.stroke();
      }
      contornato(g, [() => { g.beginPath(); g.moveTo(-2, -r * 2.25); g.lineTo(-6, -r * 2.9); g.lineTo(2, -r * 2.3); g.closePath(); }, () => { g.beginPath(); g.moveTo(1, -r * 2.25); g.lineTo(6, -r * 2.8); g.lineTo(3, -r * 2.2); g.closePath(); }], '#5cbf4a', 1.5);
      // Occhi tristi e lacrime
      for (const x of [-5, 5]) {
        contornato(g, [() => cerchio(g, x + guarda * 1.5, -r * 1.05, 3.6)], '#fff', 1.5);
        g.fillStyle = O;
        cerchio(g, x + guarda * 2.4, -r * 1.0, 1.7);
        g.fill();
        g.strokeStyle = O;
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(x - 4, -r * 1.35 + (x < 0 ? 2 : -1));
        g.lineTo(x + 4, -r * 1.35 + (x < 0 ? -1 : 2));
        g.stroke();
        g.fillStyle = '#5ac8ff';
        const y = -r * 0.85 + ((t * 1.6 + (x > 0 ? 0.5 : 0)) % 1) * 14;
        g.beginPath();
        g.ellipse(x + guarda * 1.5, y, 1.8, 2.8, 0, 0, TAU);
        g.fill();
      }
    } else {
      g.rotate(Math.sin(n.fase * 1.4) * 0.12);
      const fiamma = 1 + Math.sin(t * 22 + n.fase) * 0.15;
      contornato(g, [() => { g.beginPath(); g.moveTo(0, -r * 3.4 * fiamma); g.quadraticCurveTo(r * 0.9, -r * 2.6, r * 0.5, -r * 2.1); g.lineTo(-r * 0.5, -r * 2.1); g.quadraticCurveTo(-r * 0.9, -r * 2.6, 0, -r * 3.4 * fiamma); }], '#ffb703', 1.8);
      g.fillStyle = '#ffe66d';
      g.beginPath();
      g.ellipse(0, -r * 2.45, r * 0.25, r * 0.4 * fiamma, 0, 0, TAU);
      g.fill();
      contornato(g, [() => { g.beginPath(); g.moveTo(-r * 0.75, -r * 2); g.quadraticCurveTo(-r * 0.9, -r * 0.6, 0, 0); g.quadraticCurveTo(r * 0.9, -r * 0.6, r * 0.75, -r * 2); g.closePath(); }], bianco ? '#fff' : '#e5383b');
      contornato(g, [() => { g.beginPath(); g.ellipse(0, -r * 2.05, r * 0.8, r * 0.25, 0, 0, TAU); }], '#3a9d3a', 1.8);
      occhiCattivi(g, guarda * 2, -r * 1.35, 3.6, guarda);
    }
    g.restore();
    if (n.vita < def.vita) {
      const w = r * 1.8;
      const y = n.y - r * (n.tipo === 'peperoncino' ? 3.8 : n.tipo === 'cipolla' ? 3.1 : 2.5) - salto;
      g.fillStyle = O;
      g.fillRect(n.x - w / 2 - 1.5, y - 1.5, w + 3, 6);
      g.fillStyle = '#ff5c5c';
      g.fillRect(n.x - w / 2, y, w * Math.max(n.vita / def.vita, 0), 3);
    }
  }

  disegnaFuoco(g, x, y, t, scala = 1) {
    g.save();
    g.translate(x, y - 8);
    g.scale(scala, scala);
    const f = (k) => 1 + Math.sin(t * 17 + k) * 0.12 + Math.sin(t * 29 + k * 2) * 0.06;
    contornato(g, [() => { g.beginPath(); g.moveTo(0, -30 * f(0)); g.bezierCurveTo(14, -18, 14, -2, 0, 0); g.bezierCurveTo(-14, -2, -14, -18, 0, -30 * f(0)); }], '#ff7b00', 2);
    g.fillStyle = '#ffd23f';
    g.beginPath();
    g.moveTo(0, -20 * f(1));
    g.bezierCurveTo(8, -12, 8, -2, 0, -1);
    g.bezierCurveTo(-8, -2, -8, -12, 0, -20 * f(1));
    g.fill();
    g.restore();
  }

  // ---------- Notte ----------

  disegnaBuio(g, gioco, cam, t) {
    const b = gioco.buio();
    if (b <= 0.01) return;
    const k = Math.min(this.dpr, 2);
    const bg = this.buio.getContext('2d');
    bg.setTransform(k, 0, 0, k, 0, 0);
    bg.globalCompositeOperation = 'source-over';
    bg.clearRect(0, 0, this.L, this.A);
    bg.fillStyle = `rgba(16,20,58,${0.8 * b})`;
    bg.fillRect(0, 0, this.L, this.A);
    bg.globalCompositeOperation = 'destination-out';
    const schermo = (x, y) => ({ x: (x - cam.x) * this.zoom + this.L / 2, y: (y - cam.y) * this.zoom + this.A / 2 });
    const buco = (x, y, r) => {
      const p = schermo(x, y);
      const rr = r * this.zoom;
      const gr = bg.createRadialGradient(p.x, p.y, rr * 0.35, p.x, p.y, rr);
      gr.addColorStop(0, 'rgba(0,0,0,1)');
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      bg.fillStyle = gr;
      bg.fillRect(p.x - rr, p.y - rr, rr * 2, rr * 2);
    };
    buco(gioco.chef.x, gioco.chef.y - 20, 85);
    for (const l of gioco.luci()) buco(l.x, l.y - 10, l.raggio * 1.15 * (1 + Math.sin(t * 9 + l.x) * 0.03));
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.drawImage(this.buio, 0, 0, this.L * this.dpr, this.A * this.dpr);
    g.restore();
    // Bagliore caldo attorno ai fuochi
    g.save();
    g.globalCompositeOperation = 'lighter';
    for (const l of gioco.luci()) {
      const gr = g.createRadialGradient(l.x, l.y - 10, 0, l.x, l.y - 10, l.raggio * 0.8);
      gr.addColorStop(0, `rgba(255,96,24,${0.2 * b})`);
      gr.addColorStop(1, 'rgba(255,96,24,0)');
      g.fillStyle = gr;
      g.fillRect(l.x - l.raggio, l.y - l.raggio - 10, l.raggio * 2, l.raggio * 2);
    }
    g.restore();
  }

  // ---------- Fotogramma completo ----------

  disegna(gioco, cam, t, effetti) {
    const g = this.ctx;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.fillStyle = '#39c2e6';
    g.fillRect(0, 0, this.L, this.A);
    g.save();
    g.translate(this.L / 2, this.A / 2);
    g.scale(this.zoom, this.zoom);
    g.translate(-cam.x, -cam.y);
    this.disegnaTerreno(g, gioco.isola, cam);

    const mezzo = Math.hypot(this.L, this.A) / 2 / this.zoom + 80;
    const scena = [];
    for (const o of gioco.indice.vicini(cam.x, cam.y, mezzo)) {
      if (o.colpi <= 0 && (o.tipo === 'roccia' || o.tipo === 'funghi')) continue;
      scena.push({ y: o.y, f: () => this.disegnaSprite(g, o.tipo === 'albero' && o.colpi <= 0 ? 'ceppo' : o.tipo, o.x, o.y, o.variante, o.colpi <= 0) });
    }
    for (const s of gioco.strutture) {
      scena.push({ y: s.y, f: () => {
        this.disegnaSprite(g, s.tipo, s.x, s.y);
        if (s.tipo === 'falo') this.disegnaFuoco(g, s.x, s.y, t);
        if (s.tipo === 'forno') this.disegnaFuoco(g, s.x, s.y + 6, t, 0.45);
      } });
    }
    for (const n of gioco.nemici) scena.push({ y: n.y, f: () => this.disegnaNemico(g, n, t, gioco.chef) });
    scena.push({ y: gioco.chef.y, f: () => this.disegnaChef(g, gioco.chef, t, effetti.attrezzo) });

    // Bersaglio del tasto azione: un anello sotto
    if (effetti.bersaglio && !gioco.piazzamento) {
      const b = effetti.bersaglio.ref;
      const r = (b.raggio || OGGETTI[b.tipo]?.raggio || COSTRUZIONI[b.tipo]?.raggio || 18) + 8;
      g.save();
      g.strokeStyle = effetti.bersaglio.tipo === 'nemico' ? 'rgba(255,80,80,0.9)' : 'rgba(255,255,255,0.9)';
      g.lineWidth = 3;
      g.setLineDash([8, 6]);
      g.lineDashOffset = -t * 20;
      g.beginPath();
      g.ellipse(b.x, b.y + 2, r, r * 0.4, 0, 0, TAU);
      g.stroke();
      g.restore();
    }

    scena.sort((a, b) => a.y - b.y);
    for (const s of scena) s.f();

    // Costruzione da piazzare: in trasparenza, verde se si può, rossa se no
    if (gioco.piazzamento) {
      const p = gioco.puntoPiazzamento();
      const ok = gioco.puoPiazzare(p.x, p.y);
      const r = COSTRUZIONI[gioco.piazzamento].raggio + 6;
      g.fillStyle = ok ? 'rgba(80,220,100,0.35)' : 'rgba(255,70,70,0.35)';
      g.beginPath();
      g.ellipse(p.x, p.y + 2, r, r * 0.45, 0, 0, TAU);
      g.fill();
      this.disegnaSprite(g, gioco.piazzamento, p.x, p.y, 0, false, 0.65);
    }

    for (const q of effetti.particelle) {
      g.globalAlpha = Math.max(1 - q.t / q.durata, 0);
      g.fillStyle = q.colore;
      cerchio(g, q.x, q.y, q.r * (q.cresce ? 1 + q.t / q.durata : 1));
      g.fill();
    }
    g.globalAlpha = 1;
    this.disegnaBuio(g, gioco, cam, t);
    for (const s of effetti.scritte) {
      const k = s.t / s.durata;
      g.globalAlpha = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
      g.font = `900 ${s.dimensione}px system-ui, sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.lineJoin = 'round';
      g.strokeStyle = O;
      g.lineWidth = 5;
      const y = s.y - k * 34;
      g.strokeText(s.testo, s.x, y);
      g.fillStyle = s.colore;
      g.fillText(s.testo, s.x, y);
    }
    g.globalAlpha = 1;
    g.restore();

    // Tramonto: luce calda sullo schermo
    const b = gioco.buio();
    if (b > 0 && b < 1) {
      g.fillStyle = `rgba(255,120,60,${0.18 * Math.sin(b * Math.PI)})`;
      g.fillRect(0, 0, this.L, this.A);
    }
    if (gioco.chef.ferito > 0) {
      g.fillStyle = `rgba(230,40,40,${gioco.chef.ferito * 0.6})`;
      g.fillRect(0, 0, this.L, this.A);
    }
  }
}

function occhiCattivi(g, dx, y, r, guarda) {
  for (const x of [-r - 1, r + 1]) {
    contornato(g, [() => cerchio(g, x + dx, y, r)], '#fff', 1.5);
    g.fillStyle = O;
    cerchio(g, x + dx + guarda * 1.3, y + 0.5, r * 0.5);
    g.fill();
  }
  g.strokeStyle = O;
  g.lineWidth = 3;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(-r * 2.2 + dx, y - r * 1.5);
  g.lineTo(-r * 0.3 + dx, y - r * 0.8);
  g.moveTo(r * 2.2 + dx, y - r * 1.5);
  g.lineTo(r * 0.3 + dx, y - r * 0.8);
  g.stroke();
}

export function disegnaAttrezzo(g, attrezzo) {
  if (!attrezzo) return;
  if (attrezzo === 'mattarello') {
    contornato(g, [() => g.rect(-3, -30, 6, 30)], '#f0c27a', 2);
    contornato(g, [() => g.rect(-2, -36, 4, 6), () => g.rect(-2, 0, 4, 5)], '#b5773e', 1.5);
  } else if (attrezzo === 'ascia') {
    contornato(g, [() => g.rect(-2, -30, 4, 30)], '#a8683a', 1.8);
    contornato(g, [() => { g.beginPath(); g.moveTo(2, -30); g.quadraticCurveTo(14, -30, 14, -20); g.quadraticCurveTo(8, -22, 2, -20); g.closePath(); }], '#c9cfdb', 1.8);
  } else if (attrezzo === 'piccone') {
    contornato(g, [() => g.rect(-2, -30, 4, 30)], '#a8683a', 1.8);
    contornato(g, [() => { g.beginPath(); g.moveTo(-13, -24); g.quadraticCurveTo(0, -36, 13, -24); g.quadraticCurveTo(0, -31, -13, -24); g.closePath(); }], '#c9cfdb', 1.8);
  } else if (attrezzo === 'coltello') {
    contornato(g, [() => g.rect(-2.5, -10, 5, 10)], '#3b3355', 1.5);
    contornato(g, [() => { g.beginPath(); g.moveTo(-3, -10); g.lineTo(-3, -34); g.quadraticCurveTo(6, -26, 4, -10); g.closePath(); }], '#e6ebf2', 1.8);
  }
}
