// Pittura 2D: dipinge l'isola intera (diventa la texture del terreno 3D) e disegna le icone dei pannelli.

import { LATO, CASELLE, ACQUA, ERBA, hashCasella, creaCasuale } from './mondo.js';

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
  // Toni spenti e terrosi: erba oliva, sabbia grigiastra, mare scuro
  const erba = textureRumore(lato, [50, 64, 32], [94, 106, 58], { seme: 11, grana: 20 });
  // Fili d'erba sopra il rumore, ripetuti ai bordi per non vedere le cuciture
  const g = erba.getContext('2d');
  const caso = creaCasuale(5);
  for (let i = 0; i < 1400; i++) {
    const x = caso() * lato;
    const y = caso() * lato;
    const l = (3 + caso() * 6) * s;
    const a = -Math.PI / 2 + (caso() - 0.5) * 0.9;
    const v = 70 + caso() * 70;
    g.strokeStyle = `rgba(${v * 0.62},${v + 12},${v * 0.4},${0.35 + caso() * 0.4})`;
    g.lineWidth = (0.6 + caso() * 0.8) * s;
    for (const [dx, dy] of [[0, 0], [lato, 0], [-lato, 0], [0, lato], [0, -lato]]) {
      g.beginPath();
      g.moveTo(x + dx, y + dy);
      g.lineTo(x + dx + Math.cos(a) * l, y + dy + Math.sin(a) * l);
      g.stroke();
    }
  }
  const sabbia = textureRumore(lato, [168, 152, 116], [204, 188, 148], { seme: 23, grana: 24, ottave: [[3, 0.4], [12, 0.35], [40, 0.25]] });
  const bagnata = textureRumore(lato, [104, 94, 72], [138, 124, 96], { seme: 29, grana: 16 });
  const mare = textureRumore(lato, [18, 48, 58], [34, 74, 84], { seme: 31, grana: 6, ottave: [[2, 0.5], [6, 0.3], [16, 0.2]] });
  const terra = textureRumore(lato, [62, 50, 36], [104, 86, 62], { seme: 37, grana: 26, ottave: [[4, 0.45], [16, 0.35], [48, 0.2]] });
  return { lato, erba, sabbia, bagnata, mare, terra };
}

// ---------- Oggetti fermi (disegnati con la base in (0,0), senza ombra) ----------

export const SPRITE = {
  roccia(g, v) {
    const caso = creaCasuale(Math.floor(v * 1000) + 3);
    const punti = [];
    const n = 9;
    for (let i = 0; i < n; i++) {
      const a = Math.PI + (i / (n - 1)) * Math.PI;
      const r = 20 + (caso() - 0.5) * 9;
      punti.push([Math.cos(a) * r * 1.15, Math.sin(a) * r * (0.95 + v * 0.35) - 2]);
    }
    punti.push([24, 2], [-24, 2]);
    g.beginPath();
    punti.forEach(([x, y]) => g.lineTo(x, y));
    g.closePath();
    g.fillStyle = lineare(g, -20, -26, 18, 4, ['#b3afa6', '#8a867e', '#5d5a54', '#3d3b37']);
    g.fill();
    g.save();
    g.clip();
    // Facce più chiare e crepe
    g.fillStyle = 'rgba(255,255,255,0.12)';
    g.beginPath();
    g.moveTo(-18, -8);
    g.lineTo(-8, -26);
    g.lineTo(6, -24);
    g.lineTo(-2, -10);
    g.fill();
    g.fillStyle = 'rgba(0,0,0,0.18)';
    g.beginPath();
    g.moveTo(6, -24);
    g.lineTo(22, -10);
    g.lineTo(24, 4);
    g.lineTo(4, 4);
    g.fill();
    g.strokeStyle = 'rgba(30,28,25,0.55)';
    g.lineWidth = 0.9;
    for (let i = 0; i < 3; i++) {
      g.beginPath();
      let x = (caso() - 0.5) * 24;
      let y = -20 + caso() * 6;
      g.moveTo(x, y);
      for (let j = 0; j < 3; j++) {
        x += (caso() - 0.5) * 9;
        y += 4 + caso() * 5;
        g.lineTo(x, y);
      }
      g.stroke();
    }
    // Muschio sulla cima
    for (let i = 0; i < 14; i++) {
      g.fillStyle = `rgba(${70 + caso() * 30},${95 + caso() * 30},${40 + caso() * 15},0.75)`;
      ellisse(g, -10 + caso() * 16, -22 + caso() * 6, 2 + caso() * 3, 1.2 + caso() * 1.5);
      g.fill();
    }
    g.restore();
  },
  grano(g, v, vuoto) {
    const caso = creaCasuale(Math.floor(v * 1000) + 17);
    if (vuoto) {
      g.strokeStyle = '#8f7a44';
      g.lineWidth = 1.2;
      for (let i = 0; i < 14; i++) {
        const x = (caso() - 0.5) * 26;
        g.beginPath();
        g.moveTo(x, 0);
        g.lineTo(x + (caso() - 0.5) * 2, -3 - caso() * 4);
        g.stroke();
      }
      return;
    }
    for (let i = 0; i < 16; i++) {
      const x = (caso() - 0.5) * 26;
      const h = 26 + caso() * 12;
      const piega = (caso() - 0.3) * 8;
      g.strokeStyle = caso() < 0.5 ? '#a88a42' : '#c4a557';
      g.lineWidth = 1.1;
      g.beginPath();
      g.moveTo(x, 0);
      g.quadraticCurveTo(x, -h * 0.6, x + piega, -h);
      g.stroke();
      // Spiga: chicchi e reste
      for (let k = 0; k < 6; k++) {
        const y = -h + k * 2.4;
        g.fillStyle = k % 2 ? '#d8b763' : '#c79f45';
        ellisse(g, x + piega - 1.4, y, 1.5, 2.2, -0.4);
        g.fill();
        ellisse(g, x + piega + 1.4, y, 1.5, 2.2, 0.4);
        g.fill();
      }
      g.strokeStyle = 'rgba(220,200,140,0.6)';
      g.lineWidth = 0.4;
      g.beginPath();
      g.moveTo(x + piega, -h);
      g.lineTo(x + piega + 2, -h - 8);
      g.stroke();
    }
  },
  funghi(g, v, vuoto) {
    if (vuoto) return;
    for (const [x, s] of [[-8, 0.8], [7, 1]]) {
      g.fillStyle = lineare(g, x - 5 * s, 0, x + 5 * s, 0, ['#d9cbb0', '#f1e7d2', '#b9a682']);
      g.beginPath();
      g.moveTo(x - 4 * s, 0);
      g.quadraticCurveTo(x - 6 * s, -8 * s, x - 3.5 * s, -14 * s);
      g.lineTo(x + 3.5 * s, -14 * s);
      g.quadraticCurveTo(x + 6 * s, -8 * s, x + 4 * s, 0);
      g.closePath();
      g.fill();
      g.fillStyle = sfera(g, x, -16 * s, 11 * s, ['#b9824a', '#7a4a24', '#4a2a12']);
      g.beginPath();
      g.ellipse(x, -14 * s, 11 * s, 9 * s, 0, Math.PI, TAU);
      g.quadraticCurveTo(x, -12 * s, x - 11 * s, -14 * s);
      g.fill();
      g.fillStyle = 'rgba(255,230,190,0.25)';
      ellisse(g, x - 4 * s, -19 * s, 3 * s, 1.6 * s, -0.4);
      g.fill();
    }
  },
  steccato(g) {
    for (const y of [-19, -9]) {
      g.fillStyle = lineare(g, 0, y, 0, y + 5, ['#9a7a52', '#6e5236', '#4a3522']);
      g.fillRect(-23, y, 46, 5);
    }
    for (const x of [-18, 0, 18]) {
      g.fillStyle = lineare(g, x - 4, 0, x + 4, 0, ['#5a4128', '#8c6c47', '#4a3420']);
      g.beginPath();
      g.moveTo(x - 4, 0);
      g.lineTo(x - 4, -26);
      g.lineTo(x, -31);
      g.lineTo(x + 4, -26);
      g.lineTo(x + 4, 0);
      g.closePath();
      g.fill();
      g.strokeStyle = 'rgba(30,18,8,0.4)';
      g.lineWidth = 0.6;
      g.beginPath();
      g.moveTo(x - 1, -2);
      g.lineTo(x - 1.5, -24);
      g.moveTo(x + 1.5, -4);
      g.lineTo(x + 1, -22);
      g.stroke();
      g.fillStyle = '#2c2c2c';
      for (const y of [-16.5, -6.5]) {
        cerchio(g, x, y, 0.9);
        g.fill();
      }
    }
  },
  forno(g) {
    // Comignolo
    g.fillStyle = lineare(g, 14, 0, 26, 0, ['#5d5a55', '#8a867e', '#4a4844']);
    g.fillRect(14, -76, 12, 30);
    // Cupola di mattoni
    g.save();
    g.beginPath();
    g.moveTo(-36, 0);
    g.lineTo(-36, -24);
    g.arc(0, -24, 36, Math.PI, TAU);
    g.lineTo(36, 0);
    g.closePath();
    g.fillStyle = sfera(g, 0, -28, 46, ['#d07a4f', '#a9532f', '#6d2f18']);
    g.fill();
    g.clip();
    g.strokeStyle = 'rgba(225,205,170,0.45)';
    g.lineWidth = 1;
    for (let fila = 0; fila < 7; fila++) {
      const r = 8 + fila * 5.5;
      g.beginPath();
      g.arc(0, -24, r, Math.PI, TAU);
      g.stroke();
      for (let k = 0; k < 4 + fila * 2; k++) {
        const a = Math.PI + ((k + (fila % 2) * 0.5) / (4 + fila * 2)) * Math.PI;
        g.beginPath();
        g.moveTo(Math.cos(a) * r, -24 + Math.sin(a) * r);
        g.lineTo(Math.cos(a) * (r + 5.5), -24 + Math.sin(a) * (r + 5.5));
        g.stroke();
      }
    }
    for (let y = -20; y < 0; y += 5) {
      g.beginPath();
      g.moveTo(-36, y);
      g.lineTo(36, y);
      g.stroke();
    }
    // Fuliggine sopra la bocca
    const fu = g.createRadialGradient(0, -22, 2, 0, -22, 22);
    fu.addColorStop(0, 'rgba(20,10,5,0.55)');
    fu.addColorStop(1, 'rgba(20,10,5,0)');
    g.fillStyle = fu;
    g.fillRect(-30, -50, 60, 50);
    g.restore();
    // Bocca
    g.fillStyle = '#140b08';
    g.beginPath();
    g.moveTo(-14, 0);
    g.lineTo(-14, -12);
    g.arc(0, -12, 14, Math.PI, TAU);
    g.lineTo(14, 0);
    g.closePath();
    g.fill();
    const brace = g.createRadialGradient(0, -2, 1, 0, -2, 14);
    brace.addColorStop(0, 'rgba(255,140,40,0.85)');
    brace.addColorStop(1, 'rgba(255,80,20,0)');
    g.fillStyle = brace;
    g.fillRect(-14, -16, 28, 16);
  },
  falo(g) {
    // Cenere al centro, pietre attorno, ciocchi carbonizzati
    g.fillStyle = sfera(g, 0, -4, 17, ['#7a7470', '#4a4542', '#2a2624']);
    ellisse(g, 0, -4, 17, 7.5);
    g.fill();
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * TAU + 0.2;
      const x = Math.cos(a) * 21;
      const y = Math.sin(a) * 9 - 4;
      g.fillStyle = sfera(g, x, y, 6, ['#c2beb6', '#8a867f', '#4f4c47']);
      ellisse(g, x, y, 6.5, 4.5);
      g.fill();
    }
    for (const a of [-0.45, 0.45]) {
      g.save();
      g.translate(0, -6);
      g.rotate(a);
      g.fillStyle = lineare(g, 0, -3.5, 0, 3.5, ['#3a2618', '#20140c', '#0c0806']);
      g.fillRect(-15, -3.5, 30, 7);
      g.fillStyle = 'rgba(255,110,30,0.6)';
      g.fillRect(-4, -1, 8, 1.4);
      g.restore();
    }
  },
};

export function disegnaAttrezzo(g, attrezzo) {
  if (!attrezzo) return;
  const legno = (x0, x1) => lineare(g, x0, 0, x1, 0, ['#5a3e24', '#9a7448', '#4a321c']);
  const metallo = (x0, y0, x1, y1) => lineare(g, x0, y0, x1, y1, ['#f2f4f6', '#9aa2ab', '#5b636c']);
  if (attrezzo === 'mattarello') {
    g.fillStyle = lineare(g, -3, 0, 3, 0, ['#b8915e', '#e8c99a', '#a07848']);
    g.fillRect(-3, -28, 6, 28);
    g.fillStyle = legno(-2, 2);
    g.fillRect(-1.8, -34, 3.6, 6);
    g.fillRect(-1.8, 0, 3.6, 5);
  } else if (attrezzo === 'ascia') {
    g.fillStyle = legno(-1.8, 1.8);
    g.fillRect(-1.8, -30, 3.6, 30);
    g.fillStyle = metallo(2, -31, 13, -19);
    g.beginPath();
    g.moveTo(1, -30);
    g.quadraticCurveTo(13, -31, 13, -19);
    g.quadraticCurveTo(7, -21, 1, -21);
    g.closePath();
    g.fill();
  } else if (attrezzo === 'piccone') {
    g.fillStyle = legno(-1.8, 1.8);
    g.fillRect(-1.8, -30, 3.6, 30);
    g.fillStyle = metallo(-13, -32, 13, -22);
    g.beginPath();
    g.moveTo(-13, -23);
    g.quadraticCurveTo(0, -35, 13, -23);
    g.quadraticCurveTo(0, -29, -13, -23);
    g.closePath();
    g.fill();
  } else if (attrezzo === 'coltello') {
    g.fillStyle = lineare(g, -2.5, 0, 2.5, 0, ['#1a1a1a', '#3a3a3a', '#111']);
    g.fillRect(-2.2, -10, 4.4, 10);
    g.fillStyle = metallo(-3, -34, 4, -10);
    g.beginPath();
    g.moveTo(-2.5, -10);
    g.lineTo(-2.5, -34);
    g.quadraticCurveTo(5, -26, 3.5, -10);
    g.closePath();
    g.fill();
  }
}

// ---------- L'isola intera, vista dall'alto: diventa la texture del terreno 3D ----------

// Riquadro (in caselle) che contiene la terra, con un margine di mare
export function riquadroIsola(isola, margine = 3) {
  let x0 = CASELLE, y0 = CASELLE, x1 = 0, y1 = 0;
  for (let y = 0; y < CASELLE; y++) {
    for (let x = 0; x < CASELLE; x++) {
      if (isola.terreno[y * CASELLE + x] === ACQUA) continue;
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
  }
  const lato = Math.max(x1 - x0, y1 - y0) + 1 + margine * 2;
  const cx = (x0 + x1 + 1) / 2;
  const cy = (y0 + y1 + 1) / 2;
  return { x: (cx - lato / 2) * LATO, y: (cy - lato / 2) * LATO, lato: lato * LATO };
}

export function dipingiIsola(isola, pixel) {
  const r = riquadroIsola(isola);
  const k = pixel / r.lato;
  const tex = creaTexture(k);
  const c = tela(pixel, pixel);
  const g = c.getContext('2d');
  g.scale(k, k);
  g.translate(-r.x, -r.y);
  const motivo = (nome) => {
    const p = g.createPattern(tex[nome], 'repeat');
    const s = TEXTURE / tex.lato;
    p.setTransform?.(new DOMMatrix([s, 0, 0, s, 0, 0]));
    return p;
  };
  g.fillStyle = motivo('mare');
  g.fillRect(r.x, r.y, r.lato, r.lato);

  const caselle = [];
  const terrenoIn = (x, y) => (x >= 0 && y >= 0 && x < CASELLE && y < CASELLE ? isola.terreno[y * CASELLE + x] : ACQUA);
  for (let y = 0; y < CASELLE; y++) {
    for (let x = 0; x < CASELLE; x++) {
      const t = terrenoIn(x, y);
      if (t === ACQUA) continue;
      let costa = false;
      for (let dy = -1; dy <= 1 && !costa; dy++) for (let dx = -1; dx <= 1; dx++) if (terrenoIn(x + dx, y + dy) === ACQUA) costa = true;
      caselle.push({ x, y, t, costa, cx: (x + 0.5) * LATO, cy: (y + 0.5) * LATO, h: hashCasella(x, y, isola.seme) });
    }
  }
  const costa = caselle.filter((q) => q.costa);
  // Fondale più chiaro vicino alla riva e schiuma morbida
  for (const q of costa) {
    const gr = g.createRadialGradient(q.cx, q.cy, LATO * 0.6, q.cx, q.cy, LATO * 2.1);
    gr.addColorStop(0, 'rgba(84,126,118,0.45)');
    gr.addColorStop(1, 'rgba(84,126,118,0)');
    g.fillStyle = gr;
    g.fillRect(q.cx - LATO * 2.1, q.cy - LATO * 2.1, LATO * 4.2, LATO * 4.2);
  }
  for (const q of costa) {
    const gr = g.createRadialGradient(q.cx, q.cy, LATO * 0.78, q.cx, q.cy, LATO * 1.02);
    gr.addColorStop(0, 'rgba(215,222,214,0.5)');
    gr.addColorStop(1, 'rgba(215,222,214,0)');
    g.fillStyle = gr;
    cerchio(g, q.cx, q.cy, LATO * 1.02);
    g.fill();
  }
  const strato = (lista, raggio, riempimento, alfa = 1) => {
    g.save();
    g.globalAlpha = alfa;
    g.fillStyle = riempimento;
    g.beginPath();
    for (const q of lista) {
      g.moveTo(q.cx + raggio * LATO, q.cy);
      g.arc(q.cx, q.cy, raggio * LATO, 0, TAU);
    }
    g.fill();
    g.restore();
  };
  const erba = caselle.filter((q) => q.t === ERBA);
  strato(caselle, 0.86, motivo('bagnata'));
  strato(caselle, 0.8, motivo('sabbia'));
  strato(erba, 0.84, motivo('erba'), 0.35);
  strato(erba, 0.8, motivo('erba'), 0.6);
  strato(erba, 0.76, motivo('erba'));
  // Qualche chiazza di terra battuta e fango tra l'erba, di forma irregolare
  for (const q of erba.filter((x) => x.h > 0.62 && x.h < 0.655)) {
    const caso = creaCasuale(Math.floor(q.h * 1e7));
    g.save();
    g.globalAlpha = 0.42;
    g.fillStyle = motivo('terra');
    g.beginPath();
    for (let i = 0; i < 5; i++) {
      const x = q.cx + (caso() - 0.5) * LATO * 0.9;
      const y = q.cy + (caso() - 0.5) * LATO * 0.6;
      const r = LATO * (0.18 + caso() * 0.3);
      g.moveTo(x + r, y);
      g.ellipse(x, y, r, r * (0.5 + caso() * 0.4), caso() * Math.PI, 0, TAU);
    }
    g.fill();
    g.restore();
  }
  // Dettagli: ciuffi, fiori secchi, sassi, conchiglie e legni sulla spiaggia
  for (const q of caselle) {
    const caso = creaCasuale(Math.floor(q.h * 1e6));
    if (q.t === ERBA) {
      if (q.h < 0.45) {
        const x = q.cx + (caso() - 0.5) * 34;
        const y = q.cy + (caso() - 0.5) * 34;
        for (let i = 0; i < 10; i++) {
          const a = -Math.PI / 2 + (caso() - 0.5) * 1.3;
          const l = 5 + caso() * 8;
          g.strokeStyle = caso() < 0.5 ? 'rgba(38,48,22,0.8)' : 'rgba(120,128,72,0.75)';
          g.lineWidth = 1;
          g.beginPath();
          g.moveTo(x + (caso() - 0.5) * 6, y);
          g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
          g.stroke();
        }
      }
      if (q.h > 0.94) {
        g.fillStyle = q.h > 0.97 ? 'rgba(220,214,190,0.85)' : 'rgba(176,150,70,0.85)';
        const x = q.cx + (caso() - 0.5) * 30;
        const y = q.cy + (caso() - 0.5) * 30;
        for (let i = 0; i < 3; i++) {
          cerchio(g, x + (caso() - 0.5) * 10, y + (caso() - 0.5) * 8, 1.3);
          g.fill();
        }
      }
      if (q.h > 0.86 && q.h < 0.9) {
        const x = q.cx + (caso() - 0.5) * 30;
        const y = q.cy + (caso() - 0.5) * 30;
        g.fillStyle = sfera(g, x, y, 3.5, ['#8f8b82', '#55524c']);
        ellisse(g, x, y, 3.5, 2.6);
        g.fill();
      }
    } else {
      if (q.h < 0.5) {
        for (let i = 0; i < 4; i++) {
          g.fillStyle = caso() < 0.3 ? 'rgba(225,215,195,0.85)' : 'rgba(90,80,62,0.55)';
          ellisse(g, q.cx + (caso() - 0.5) * 36, q.cy + (caso() - 0.5) * 36, 1 + caso() * 1.5, 0.8 + caso());
          g.fill();
        }
      }
      if (q.h > 0.9) {
        g.save();
        g.translate(q.cx + (caso() - 0.5) * 20, q.cy + (caso() - 0.5) * 20);
        g.rotate(caso() * Math.PI);
        g.fillStyle = lineare(g, 0, -3, 0, 3, ['#9a8a70', '#6a5c48']);
        g.fillRect(-14, -2.5, 28, 5);
        g.restore();
      }
    }
  }
  return { tela: c, ...r };
}
