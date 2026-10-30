// Pittura 2D: dipinge la mappa intera vista dall'alto (diventa la texture del terreno 3D).

import { LATO, CASELLE, ERBA, STRADA, STERRATO, FITTO, hashCasella, creaCasuale } from './mondo.js';

const TAU = Math.PI * 2;
const TEXTURE = 256;

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

function ellisse(g, x, y, rx, ry, rot = 0) {
  g.beginPath();
  g.ellipse(x, y, Math.max(rx, 0.1), Math.max(ry, 0.1), rot, 0, TAU);
}

// Sfumatura sferica con la luce in alto a sinistra
function sfera(g, x, y, r, stop) {
  const gr = g.createRadialGradient(x - r * 0.4, y - r * 0.45, r * 0.05, x, y, r * 1.05);
  stop.forEach((c, i) => gr.addColorStop(i / (stop.length - 1), c));
  return gr;
}

function lineare(g, x0, y0, x1, y1, stop) {
  const gr = g.createLinearGradient(x0, y0, x1, y1);
  stop.forEach((c, i) => gr.addColorStop(i / (stop.length - 1), c));
  return gr;
}

// ---------- Texture del terreno (ripetibili senza cuciture) ----------

function rumorePeriodico(seme, periodo) {
  const v = (x, y) => hashCasella(((x % periodo) + periodo) % periodo, ((y % periodo) + periodo) % periodo, seme);
  const liscio = (t) => t * t * (3 - 2 * t);
  return (x, y) => {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const sx = liscio(x - x0);
    const sy = liscio(y - y0);
    const a = v(x0, y0) + (v(x0 + 1, y0) - v(x0, y0)) * sx;
    const b = v(x0, y0 + 1) + (v(x0 + 1, y0 + 1) - v(x0, y0 + 1)) * sx;
    return a + (b - a) * sy;
  };
}

function mescola(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

// Riempie una tela con rumore a più ottave tra due colori, più una grana fine
function textureRumore(lato, scuro, chiaro, { seme = 1, grana = 14, ottave = [[4, 0.5], [8, 0.3], [24, 0.2]] } = {}) {
  const c = tela(lato, lato);
  const g = c.getContext('2d');
  const img = g.createImageData(lato, lato);
  const rumori = ottave.map(([p], i) => rumorePeriodico(seme + i * 17, p));
  const casuale = creaCasuale(seme * 7 + 3);
  for (let y = 0; y < lato; y++) {
    for (let x = 0; x < lato; x++) {
      let n = 0;
      ottave.forEach(([p, peso], i) => (n += rumori[i]((x / lato) * p, (y / lato) * p) * peso));
      const col = mescola(scuro, chiaro, Math.min(Math.max((n - 0.5) * 1.8 + 0.5, 0), 1));
      const gr = (casuale() - 0.5) * grana;
      const i = (y * lato + x) * 4;
      img.data[i] = col[0] + gr;
      img.data[i + 1] = col[1] + gr;
      img.data[i + 2] = col[2] + gr;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

function creaTexture(k) {
  const lato = Math.round(TEXTURE * Math.min(k, 2.5));
  const s = lato / TEXTURE;
  const erba = textureRumore(lato, [46, 56, 30], [88, 96, 54], { seme: 11, grana: 20 });
  const g = erba.getContext('2d');
  const caso = creaCasuale(5);
  for (let i = 0; i < 1300; i++) {
    const x = caso() * lato;
    const y = caso() * lato;
    const l = (3 + caso() * 6) * s;
    const a = -Math.PI / 2 + (caso() - 0.5) * 0.9;
    const v = 60 + caso() * 60;
    g.strokeStyle = `rgba(${v * 0.7},${v + 8},${v * 0.42},${0.35 + caso() * 0.4})`;
    g.lineWidth = (0.6 + caso() * 0.8) * s;
    for (const [dx, dy] of [[0, 0], [lato, 0], [-lato, 0], [0, lato], [0, -lato]]) {
      g.beginPath();
      g.moveTo(x + dx, y + dy);
      g.lineTo(x + dx + Math.cos(a) * l, y + dy + Math.sin(a) * l);
      g.stroke();
    }
  }
  const asfalto = textureRumore(lato, [44, 44, 46], [74, 74, 76], { seme: 17, grana: 30, ottave: [[6, 0.4], [24, 0.35], [64, 0.25]] });
  const terra = textureRumore(lato, [70, 58, 42], [112, 94, 68], { seme: 37, grana: 26, ottave: [[4, 0.45], [16, 0.35], [48, 0.2]] });
  const sottobosco = textureRumore(lato, [24, 28, 18], [48, 50, 30], { seme: 41, grana: 18 });
  // Pavimento di assi di legno consumate
  const assi = textureRumore(lato, [92, 70, 48], [128, 100, 70], { seme: 43, grana: 18, ottave: [[2, 0.3], [32, 0.5], [64, 0.2]] });
  const ga = assi.getContext('2d');
  ga.strokeStyle = 'rgba(30,20,10,0.55)';
  ga.lineWidth = 1.2 * s;
  for (let y = 0; y < lato; y += lato / 10) {
    ga.beginPath();
    ga.moveTo(0, y);
    ga.lineTo(lato, y);
    ga.stroke();
    const x = ((y * 7.3) % 1) * lato || lato * 0.37;
    ga.beginPath();
    ga.moveTo(x, y);
    ga.lineTo(x, y + lato / 10);
    ga.stroke();
  }
  return { lato, erba, asfalto, terra, sottobosco, assi };
}

// La mappa intera vista dall'alto
export function dipingiMappa(mappa, pixel) {
  const latoMondo = CASELLE * LATO;
  const k = pixel / latoMondo;
  const tex = creaTexture(k);
  const c = tela(pixel, pixel);
  const g = c.getContext('2d');
  g.scale(k, k);
  const motivo = (nome) => {
    const p = g.createPattern(tex[nome], 'repeat');
    const s = TEXTURE / tex.lato;
    p.setTransform?.(new DOMMatrix([s, 0, 0, s, 0, 0]));
    return p;
  };
  g.fillStyle = motivo('erba');
  g.fillRect(0, 0, latoMondo, latoMondo);
  const caselle = [];
  for (let y = 0; y < CASELLE; y++) for (let x = 0; x < CASELLE; x++) caselle.push({ x, y, t: mappa.terreno[y * CASELLE + x], cx: (x + 0.5) * LATO, cy: (y + 0.5) * LATO, h: hashCasella(x, y, mappa.seme) });
  const strato = (filtro, raggio, riempimento, alfa = 1) => {
    g.save();
    g.globalAlpha = alfa;
    g.fillStyle = riempimento;
    g.beginPath();
    for (const q of caselle) {
      if (!filtro(q)) continue;
      g.moveTo(q.cx + raggio * LATO, q.cy);
      g.arc(q.cx, q.cy, raggio * LATO, 0, TAU);
    }
    g.fill();
    g.restore();
  };
  // Bosco fitto ai bordi, sterrato e prati spelacchiati
  strato((q) => q.t === FITTO, 0.9, motivo('sottobosco'));
  strato((q) => q.t === STERRATO, 0.85, motivo('terra'), 0.55);
  strato((q) => q.t === STERRATO, 0.7, motivo('terra'), 0.8);
  // Ciglio della strada in terra battuta, poi l'asfalto
  strato((q) => q.t === STRADA, 0.95, motivo('terra'), 0.6);
  g.fillStyle = motivo('asfalto');
  for (const q of caselle) if (q.t === STRADA) g.fillRect(q.cx - LATO * 0.62, q.cy - LATO * 0.62, LATO * 1.24, LATO * 1.24);
  // Riga di mezzeria tratteggiata e crepe sull'asfalto
  g.strokeStyle = 'rgba(210,200,160,0.55)';
  g.lineWidth = 3;
  g.setLineDash([26, 30]);
  g.beginPath();
  mappa.statale.forEach((y, x) => (x ? g.lineTo((x + 0.5) * LATO, (y + 0.5) * LATO) : g.moveTo(0.5 * LATO, (y + 0.5) * LATO)));
  g.stroke();
  g.setLineDash([]);
  g.strokeStyle = 'rgba(20,20,20,0.5)';
  g.lineWidth = 1.2;
  for (const q of caselle) {
    if (q.t !== STRADA || q.h > 0.25) continue;
    const caso = creaCasuale(Math.floor(q.h * 1e7));
    g.beginPath();
    let x = q.cx + (caso() - 0.5) * 30;
    let y = q.cy + (caso() - 0.5) * 30;
    g.moveTo(x, y);
    for (let i = 0; i < 4; i++) {
      x += (caso() - 0.5) * 18;
      y += (caso() - 0.5) * 18;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  // Pavimenti delle case
  g.fillStyle = motivo('assi');
  for (const e of mappa.edifici) g.fillRect(e.x, e.y, e.w, e.h);
  // Dettagli: ciuffi, foglie secche, sassi, macchie d'olio e cartacce sull'asfalto
  for (const q of caselle) {
    const caso = creaCasuale(Math.floor(q.h * 1e6) + 1);
    if (q.t === ERBA && q.h < 0.4) {
      const x = q.cx + (caso() - 0.5) * 34;
      const y = q.cy + (caso() - 0.5) * 34;
      for (let i = 0; i < 9; i++) {
        const a = -Math.PI / 2 + (caso() - 0.5) * 1.3;
        const l = 5 + caso() * 9;
        g.strokeStyle = caso() < 0.5 ? 'rgba(34,40,20,0.8)' : 'rgba(120,118,70,0.7)';
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(x + (caso() - 0.5) * 6, y);
        g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
        g.stroke();
      }
    } else if ((q.t === ERBA || q.t === STERRATO) && q.h > 0.9) {
      g.fillStyle = sfera(g, q.cx, q.cy, 4, ['#8a867c', '#4f4c46']);
      ellisse(g, q.cx + (caso() - 0.5) * 30, q.cy + (caso() - 0.5) * 30, 4, 3);
      g.fill();
    } else if (q.t === STRADA && q.h > 0.92) {
      g.fillStyle = 'rgba(10,10,10,0.35)';
      ellisse(g, q.cx + (caso() - 0.5) * 20, q.cy + (caso() - 0.5) * 20, 10 + caso() * 10, 6 + caso() * 6, caso() * 3);
      g.fill();
    } else if (q.t === FITTO && q.h < 0.5) {
      for (let i = 0; i < 6; i++) {
        g.fillStyle = caso() < 0.5 ? 'rgba(90,60,30,0.5)' : 'rgba(60,70,30,0.5)';
        ellisse(g, q.cx + (caso() - 0.5) * 40, q.cy + (caso() - 0.5) * 40, 2 + caso() * 2, 1 + caso(), caso() * 3);
        g.fill();
      }
    }
  }
  return { tela: c, x: 0, y: 0, lato: latoMondo };
}
