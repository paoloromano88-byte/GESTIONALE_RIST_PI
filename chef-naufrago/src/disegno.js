// Grafica realistica: texture generate (erba, sabbia, mare), luce del sole da in alto a sinistra con ombre
// proiettate, volumi sfumati al posto dei contorni, fuoco a strati, notte blu con le luci dei falò.
// Il terreno si disegna a blocchi in tele di appoggio; gli oggetti fermi si disegnano una volta (cache);
// chef, mostri, fuoco ed effetti si disegnano a ogni fotogramma.

import { LATO, CASELLE, ACQUA, SABBIA, ERBA, OGGETTI, hashCasella, creaCasuale } from './mondo.js';
import { COSTRUZIONI, NEMICI } from './logica.js';

const TAU = Math.PI * 2;
const BLOCCO = 8;
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

// Ombra morbida a terra, allungata verso il basso a destra (il sole è in alto a sinistra)
export function ombra(g, x, y, larghezza, altezza = 0, alfa = 0.38) {
  if (alfa <= 0.01) return;
  const allunga = altezza * 0.35;
  g.save();
  g.translate(x + allunga * 0.6, y + 1 + allunga * 0.12);
  g.rotate(0.18);
  g.scale(larghezza + allunga * 0.5, larghezza * 0.42 + allunga * 0.08);
  const gr = g.createRadialGradient(0, 0, 0, 0, 0, 1);
  gr.addColorStop(0, `rgba(10,14,8,${alfa})`);
  gr.addColorStop(0.6, `rgba(10,14,8,${alfa * 0.55})`);
  gr.addColorStop(1, 'rgba(10,14,8,0)');
  g.fillStyle = gr;
  cerchio(g, 0, 0, 1);
  g.fill();
  g.restore();
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
  const erba = textureRumore(lato, [52, 84, 33], [96, 130, 58], { seme: 11, grana: 18 });
  // Fili d'erba sopra il rumore, ripetuti ai bordi per non vedere le cuciture
  const g = erba.getContext('2d');
  const caso = creaCasuale(5);
  for (let i = 0; i < 1400; i++) {
    const x = caso() * lato;
    const y = caso() * lato;
    const l = (3 + caso() * 6) * s;
    const a = -Math.PI / 2 + (caso() - 0.5) * 0.9;
    const v = 70 + caso() * 70;
    g.strokeStyle = `rgba(${v * 0.55},${v + 30},${v * 0.35},${0.35 + caso() * 0.4})`;
    g.lineWidth = (0.6 + caso() * 0.8) * s;
    for (const [dx, dy] of [[0, 0], [lato, 0], [-lato, 0], [0, lato], [0, -lato]]) {
      g.beginPath();
      g.moveTo(x + dx, y + dy);
      g.lineTo(x + dx + Math.cos(a) * l, y + dy + Math.sin(a) * l);
      g.stroke();
    }
  }
  const sabbia = textureRumore(lato, [196, 168, 118], [228, 206, 158], { seme: 23, grana: 22, ottave: [[3, 0.4], [12, 0.35], [40, 0.25]] });
  const bagnata = textureRumore(lato, [140, 118, 80], [176, 152, 106], { seme: 29, grana: 16 });
  const mare = textureRumore(lato, [20, 74, 98], [40, 112, 132], { seme: 31, grana: 6, ottave: [[2, 0.5], [6, 0.3], [16, 0.2]] });
  return { lato, erba, sabbia, bagnata, mare };
}

// ---------- Oggetti fermi (disegnati con la base in (0,0), senza ombra) ----------

function chioma(g, caso, cx, cy, raggio, colori) {
  const [scuro, medio, chiaro, luce] = colori;
  // Strato in ombra, poi quello medio spostato verso la luce, poi i riflessi in alto a sinistra
  for (let i = 0; i < 16; i++) {
    const a = caso() * TAU;
    const d = caso() * raggio * 0.75;
    g.fillStyle = scuro;
    cerchio(g, cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.85, raggio * (0.32 + caso() * 0.2));
    g.fill();
  }
  for (let i = 0; i < 18; i++) {
    const a = caso() * TAU;
    const d = caso() * raggio * 0.65;
    g.fillStyle = medio;
    cerchio(g, cx + Math.cos(a) * d - raggio * 0.12, cy + Math.sin(a) * d * 0.8 - raggio * 0.14, raggio * (0.22 + caso() * 0.16));
    g.fill();
  }
  for (let i = 0; i < 12; i++) {
    const a = Math.PI * 1.25 + (caso() - 0.5) * 1.6;
    const d = caso() * raggio * 0.6;
    g.fillStyle = chiaro;
    cerchio(g, cx + Math.cos(a) * d - raggio * 0.1, cy + Math.sin(a) * d * 0.8 - raggio * 0.2, raggio * (0.12 + caso() * 0.12));
    g.fill();
  }
  // Foglioline
  for (let i = 0; i < 160; i++) {
    const a = caso() * TAU;
    const d = Math.sqrt(caso()) * raggio * 0.95;
    const x = cx + Math.cos(a) * d;
    const y = cy + Math.sin(a) * d * 0.85;
    const inLuce = x - cx + (y - cy) < 0;
    g.fillStyle = inLuce && caso() < 0.6 ? luce : caso() < 0.5 ? medio : scuro;
    g.globalAlpha = 0.55 + caso() * 0.45;
    ellisse(g, x, y, 1.4 + caso() * 2.2, 1 + caso() * 1.3, caso() * TAU);
    g.fill();
  }
  g.globalAlpha = 1;
  // Ombra interna in basso a destra
  const gr = g.createRadialGradient(cx - raggio * 0.35, cy - raggio * 0.4, raggio * 0.2, cx, cy, raggio * 1.1);
  gr.addColorStop(0, 'rgba(0,0,0,0)');
  gr.addColorStop(1, 'rgba(8,20,6,0.38)');
  g.fillStyle = gr;
  cerchio(g, cx, cy, raggio * 1.05);
  g.fill();
}

function corteccia(g, x0, y0, x1, y1, w0, w1) {
  g.beginPath();
  g.moveTo(x0 - w0, y0);
  g.quadraticCurveTo(x0 - w0 * 0.7, (y0 + y1) / 2, x1 - w1, y1);
  g.lineTo(x1 + w1, y1);
  g.quadraticCurveTo(x0 + w0 * 0.8, (y0 + y1) / 2, x0 + w0, y0);
  g.closePath();
  g.fillStyle = lineare(g, x0 - w0, 0, x0 + w0, 0, ['#2e2117', '#6b4f36', '#4a3524', '#21170f']);
  g.fill();
  g.strokeStyle = 'rgba(20,12,6,0.45)';
  g.lineWidth = 0.8;
  for (let i = -2; i <= 2; i++) {
    g.beginPath();
    g.moveTo(x0 + i * w0 * 0.35, y0 - 2);
    g.quadraticCurveTo(x0 + i * w0 * 0.4 + 1.5, (y0 + y1) / 2, x1 + i * w1 * 0.35, y1 + 2);
    g.stroke();
  }
}

export const SPRITE = {
  albero(g, v) {
    const caso = creaCasuale(Math.floor(v * 1000) + 7);
    const ulivo = v > 0.7;
    const s = 0.9 + v * 0.25;
    corteccia(g, 0, 0, 1.5, -40 * s, 6.5, 4);
    if (ulivo) {
      chioma(g, caso, -2, -64 * s, 34 * s, ['#3f4d36', '#5b6d4c', '#7f9270', '#a7b799']);
      g.fillStyle = '#2a2433';
      for (let i = 0; i < 9; i++) {
        cerchio(g, (caso() - 0.5) * 50 * s, -64 * s + (caso() - 0.4) * 40 * s, 2);
        g.fill();
      }
    } else {
      chioma(g, caso, 0, -66 * s, 36 * s, ['#1f3a17', '#2f5622', '#4b7a31', '#78a64d']);
    }
  },
  ceppo(g) {
    g.fillStyle = lineare(g, -12, 0, 12, 0, ['#2b1e13', '#6b4f36', '#3a2a1b']);
    g.beginPath();
    g.moveTo(-12, 0);
    g.lineTo(-11, -12);
    g.lineTo(11, -12);
    g.lineTo(12, 0);
    g.closePath();
    g.fill();
    g.fillStyle = sfera(g, 0, -12, 12, ['#d8b386', '#b48a5c', '#8c6640']);
    ellisse(g, 0, -12, 11.5, 5);
    g.fill();
    g.strokeStyle = 'rgba(90,60,30,0.6)';
    g.lineWidth = 0.7;
    for (const r of [3, 6, 9]) {
      ellisse(g, 0.5, -12, r, r * 0.43);
      g.stroke();
    }
    g.strokeStyle = 'rgba(40,25,10,0.7)';
    g.beginPath();
    g.moveTo(0, -12);
    g.lineTo(7, -14);
    g.stroke();
  },
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
  pomodori(g, v, vuoto) {
    const caso = creaCasuale(Math.floor(v * 1000) + 11);
    const colori = vuoto ? ['#2c3f1c', '#4a5f2c', '#6f7d3f', '#8c9550'] : ['#1d3a16', '#2f5a23', '#4d8034', '#6fa048'];
    for (let i = 0; i < 46; i++) {
      const a = caso() * TAU;
      const d = Math.sqrt(caso()) * 18;
      const x = Math.cos(a) * d;
      const y = -14 + Math.sin(a) * d * 0.7;
      g.fillStyle = colori[Math.min(3, Math.floor(caso() * 2 + (x + y < -10 ? 2 : 0)))];
      ellisse(g, x, y, 3.5 + caso() * 3, 2 + caso() * 1.5, caso() * TAU);
      g.fill();
    }
    if (vuoto) return;
    for (const [x, y] of [[-9, -16], [7, -22], [9, -9], [-2, -6], [-12, -6]]) {
      g.fillStyle = sfera(g, x, y, 4.6, ['#ff8a6a', '#d63420', '#8a160c']);
      cerchio(g, x, y, 4.6);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.75)';
      cerchio(g, x - 1.6, y - 1.8, 1.1);
      g.fill();
      g.fillStyle = '#2f5a23';
      ellisse(g, x + 0.5, y - 4.3, 2, 0.9);
      g.fill();
    }
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

// ---------- Il disegnatore ----------

export class Disegnatore {
  constructor(ctx) {
    this.ctx = ctx;
    this.blocchi = new Map();
    this.sprite = new Map();
    this.buio = tela(1, 1);
    this.texture = null;
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
    if (this.texture?.k !== this.k) this.texture = { ...creaTexture(this.k), k: this.k };
    this.vignetta = null;
  }

  motivo(g, nome) {
    const p = g.createPattern(this.texture[nome], 'repeat');
    const s = TEXTURE / this.texture.lato;
    p.setTransform?.(new DOMMatrix([s, 0, 0, s, 0, 0]));
    return p;
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
    g.fillStyle = this.motivo(g, 'mare');
    g.fillRect(bx * misura, by * misura, misura, misura);
    const caselle = [];
    for (let y = by * BLOCCO - 3; y < (by + 1) * BLOCCO + 3; y++) {
      for (let x = bx * BLOCCO - 3; x < (bx + 1) * BLOCCO + 3; x++) {
        const t = x >= 0 && y >= 0 && x < CASELLE && y < CASELLE ? isola.terreno[y * CASELLE + x] : ACQUA;
        caselle.push({ x, y, t, cx: (x + 0.5) * LATO, cy: (y + 0.5) * LATO, h: hashCasella(x, y, isola.seme) });
      }
    }
    const terra = caselle.filter((q) => q.t !== ACQUA);
    // Acqua bassa e chiara vicino alla costa
    for (const q of terra) {
      const gr = g.createRadialGradient(q.cx, q.cy, LATO * 0.5, q.cx, q.cy, LATO * 2.2);
      gr.addColorStop(0, 'rgba(70,170,170,0.28)');
      gr.addColorStop(1, 'rgba(70,170,170,0)');
      g.fillStyle = gr;
      g.fillRect(q.cx - LATO * 2.2, q.cy - LATO * 2.2, LATO * 4.4, LATO * 4.4);
    }
    // Riflessi sull'acqua
    g.strokeStyle = 'rgba(200,235,240,0.18)';
    g.lineWidth = 1.2;
    g.lineCap = 'round';
    for (const q of caselle) {
      if (q.t !== ACQUA || q.h > 0.3) continue;
      const x = q.cx + (q.h * 13 % 1 - 0.5) * 30;
      const y = q.cy + (q.h * 7 % 1 - 0.5) * 30;
      g.beginPath();
      g.moveTo(x - 8, y);
      g.quadraticCurveTo(x, y - 2, x + 8, y);
      g.stroke();
    }
    // Schiuma morbida sulla riva
    for (const q of terra) {
      const gr = g.createRadialGradient(q.cx, q.cy, LATO * 0.78, q.cx, q.cy, LATO * 1.02);
      gr.addColorStop(0, 'rgba(235,245,240,0.55)');
      gr.addColorStop(1, 'rgba(235,245,240,0)');
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
    const erba = terra.filter((q) => q.t === ERBA);
    strato(terra, 0.86, this.motivo(g, 'bagnata'));
    strato(terra, 0.8, this.motivo(g, 'sabbia'));
    strato(erba, 0.84, this.motivo(g, 'erba'), 0.35);
    strato(erba, 0.8, this.motivo(g, 'erba'), 0.6);
    strato(erba, 0.76, this.motivo(g, 'erba'));
    // Dettagli: ciuffi, fiori di campo, sassolini, conchiglie
    for (const q of terra) {
      const caso = creaCasuale(Math.floor(q.h * 1e6));
      if (q.t === ERBA) {
        if (q.h < 0.4) {
          const x = q.cx + (caso() - 0.5) * 34;
          const y = q.cy + (caso() - 0.5) * 34;
          for (let i = 0; i < 9; i++) {
            const a = -Math.PI / 2 + (caso() - 0.5) * 1.2;
            const l = 5 + caso() * 7;
            g.strokeStyle = caso() < 0.5 ? 'rgba(40,70,25,0.8)' : 'rgba(110,150,70,0.8)';
            g.lineWidth = 1;
            g.beginPath();
            g.moveTo(x + (caso() - 0.5) * 6, y);
            g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
            g.stroke();
          }
        }
        if (q.h > 0.93) {
          const x = q.cx + (caso() - 0.5) * 30;
          const y = q.cy + (caso() - 0.5) * 30;
          g.fillStyle = q.h > 0.97 ? 'rgba(240,240,235,0.9)' : q.h > 0.95 ? 'rgba(230,200,80,0.9)' : 'rgba(160,120,190,0.85)';
          for (let i = 0; i < 3; i++) {
            cerchio(g, x + (caso() - 0.5) * 10, y + (caso() - 0.5) * 8, 1.4);
            g.fill();
          }
        }
        if (q.h > 0.86 && q.h < 0.88) {
          const x = q.cx + (caso() - 0.5) * 30;
          const y = q.cy + (caso() - 0.5) * 30;
          g.fillStyle = sfera(g, x, y, 3.5, ['#a9a59c', '#6e6b64']);
          ellisse(g, x, y, 3.5, 2.4);
          g.fill();
        }
      } else if (q.h < 0.45) {
        for (let i = 0; i < 3; i++) {
          g.fillStyle = caso() < 0.3 ? 'rgba(245,235,220,0.9)' : 'rgba(120,105,80,0.6)';
          ellisse(g, q.cx + (caso() - 0.5) * 36, q.cy + (caso() - 0.5) * 36, 1 + caso() * 1.5, 0.8 + caso());
          g.fill();
        }
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
        // Un'unità in più per lato: niente righe sottili tra un blocco e l'altro
        g.drawImage(this.blocco(isola, bx, by), bx * misura, by * misura, misura + 1, misura + 1);
      }
    }
  }

  // ---------- Oggetti fermi ----------

  disegnaSprite(g, nome, x, y, variante = 0, vuoto = false, alfa = 1) {
    const v = Math.round(variante * 6) / 6;
    const chiave = `${nome}|${v}|${vuoto}`;
    let s = this.sprite.get(chiave);
    if (!s) {
      const w = 120;
      const h = 140;
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

  disegnaChef(g, c, t, attrezzo, alfaOmbra = 0.38) {
    const passo = c.passo ? Math.sin(c.passo) : 0;
    const salto = Math.abs(passo) * 1.5;
    ombra(g, c.x, c.y + 1, 13, 58, alfaOmbra);
    g.save();
    g.translate(c.x, c.y - salto);
    g.scale(c.direzione, 1);
    // Gambe e scarpe
    for (const [x, d] of [[-4.5, passo], [4.5, -passo]]) {
      g.fillStyle = lineare(g, x - 3, 0, x + 3, 0, ['#1d1d24', '#3a3a46', '#1a1a20']);
      g.fillRect(x - 3, -16 + d * 1.2, 6, 14);
      g.fillStyle = '#121212';
      ellisse(g, x + 1 + d * 2, -1.5, 4.2, 2.2);
      g.fill();
    }
    // Giacca da cuoco con pieghe
    g.fillStyle = lineare(g, -13, 0, 13, 0, ['#d9dbd5', '#fbfbf7', '#e9eae5', '#b3b6ae']);
    g.beginPath();
    g.moveTo(-11, -14);
    g.quadraticCurveTo(-14, -26, -10, -38);
    g.quadraticCurveTo(0, -42, 10, -38);
    g.quadraticCurveTo(14, -26, 11, -14);
    g.quadraticCurveTo(0, -11, -11, -14);
    g.fill();
    g.strokeStyle = 'rgba(120,125,120,0.4)';
    g.lineWidth = 0.7;
    g.beginPath();
    g.moveTo(-4, -37);
    g.quadraticCurveTo(-5, -26, -6, -15);
    g.moveTo(6, -36);
    g.quadraticCurveTo(7, -28, 5, -16);
    g.stroke();
    g.fillStyle = '#3a3a3a';
    for (const y of [-33, -27, -21]) {
      for (const x of [1, 6]) {
        cerchio(g, x, y, 0.9);
        g.fill();
      }
    }
    // Fazzoletto al collo
    g.fillStyle = lineare(g, -5, -41, 5, -36, ['#b52a2a', '#7a1414']);
    g.beginPath();
    g.moveTo(-6, -39);
    g.lineTo(6, -39);
    g.lineTo(0, -34);
    g.closePath();
    g.fill();
    // Braccio con l'attrezzo
    const k = c.colpo > 0 ? c.colpo / 0.25 : 0;
    const colpo = k > 0 ? Math.sin((1 - k) * Math.PI) : 0;
    g.save();
    g.translate(9, -32);
    g.rotate(-0.4 + colpo * 1.9);
    g.fillStyle = lineare(g, -3, 0, 3, 0, ['#e7e8e3', '#c3c6be']);
    g.fillRect(-3, 0, 6, 12);
    g.translate(0, 13);
    disegnaAttrezzo(g, attrezzo);
    g.fillStyle = sfera(g, 0, 0, 3.4, ['#f0c39d', '#c98d66']);
    cerchio(g, 0, 0, 3.4);
    g.fill();
    g.restore();
    // Testa
    g.fillStyle = sfera(g, 1, -48, 9.5, ['#f3c7a2', '#d99c74', '#a76a46']);
    cerchio(g, 1, -48, 9.5);
    g.fill();
    g.fillStyle = '#3a2618';
    g.beginPath();
    g.arc(-1, -49, 9.6, Math.PI * 0.55, Math.PI * 1.25);
    g.fill();
    g.fillStyle = '#c98962';
    ellisse(g, -5.5, -47, 1.8, 2.6);
    g.fill();
    g.fillStyle = '#1e1410';
    ellisse(g, 5.5, -50, 1.1, 1.4);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.6)';
    cerchio(g, 5.8, -50.4, 0.35);
    g.fill();
    g.fillStyle = '#c8815a';
    ellisse(g, 9.3, -46.5, 1.6, 2);
    g.fill();
    // Baffi
    g.fillStyle = lineare(g, 0, -45, 0, -41, ['#4a2e1c', '#24150c']);
    g.beginPath();
    g.moveTo(9, -44.5);
    g.quadraticCurveTo(5, -46, 2, -43.5);
    g.quadraticCurveTo(3.5, -41.5, 6, -42.5);
    g.quadraticCurveTo(8, -41, 11, -42.5);
    g.quadraticCurveTo(12.5, -42, 13, -43.5);
    g.quadraticCurveTo(11.5, -45.5, 9, -44.5);
    g.fill();
    // Cappello da cuoco a pieghe
    g.fillStyle = lineare(g, -9, 0, 10, 0, ['#d6d8d2', '#ffffff', '#c4c7bf']);
    g.fillRect(-8, -61, 17, 7);
    g.fillStyle = sfera(g, 0, -69, 13, ['#ffffff', '#eceee8', '#b9bcb4']);
    g.beginPath();
    g.moveTo(-8, -60);
    g.bezierCurveTo(-15, -64, -12, -76, -4, -75);
    g.bezierCurveTo(-1, -81, 7, -80, 9, -74);
    g.bezierCurveTo(16, -73, 15, -63, 9, -60);
    g.closePath();
    g.fill();
    g.strokeStyle = 'rgba(140,145,140,0.45)';
    g.lineWidth = 0.7;
    for (const x of [-4, 0.5, 5]) {
      g.beginPath();
      g.moveTo(x, -55);
      g.quadraticCurveTo(x + 0.5, -66, x - 0.5, -73);
      g.stroke();
    }
    if (c.ferito > 0) {
      g.fillStyle = `rgba(200,20,20,${c.ferito * 1.2})`;
      ellisse(g, 0, -36, 15, 28);
      g.fill();
    }
    if (c.piange) {
      g.fillStyle = 'rgba(150,200,255,0.85)';
      const y = -48 + ((t * 2) % 1) * 12;
      ellisse(g, 5.5, y, 0.9, 1.5);
      g.fill();
    }
    g.restore();
  }

  // ---------- Mostri ----------

  disegnaNemico(g, n, t, chef, alfaOmbra) {
    const def = NEMICI[n.tipo];
    const r = def.raggio;
    const salto = n.tipo === 'polpetta' ? Math.abs(Math.sin(n.fase)) * 6 : n.tipo === 'polpettone' ? Math.abs(Math.sin(n.fase * 0.6)) * 4 : n.tipo === 'peperoncino' ? Math.abs(Math.sin(n.fase * 1.5)) * 3 : 0;
    const guarda = Math.sign(chef.x - n.x) || 1;
    ombra(g, n.x, n.y + 1, r * 0.95, r * 1.6 + salto, alfaOmbra);
    g.save();
    g.translate(n.x, n.y - salto);
    const caso = creaCasuale(n.id * 31 + 1);
    if (n.tipo === 'polpetta' || n.tipo === 'polpettone') {
      const grande = n.tipo === 'polpettone';
      const sq = 1 + Math.sin(n.fase * 2) * 0.05;
      g.scale(sq, 1 / sq);
      g.fillStyle = sfera(g, 0, -r, r, grande ? ['#8c5134', '#5a2c18', '#2a120a'] : ['#9a5a3a', '#653320', '#2e150b']);
      cerchio(g, 0, -r, r);
      g.fill();
      // Superficie grumosa
      for (let i = 0; i < (grande ? 90 : 40); i++) {
        const a = caso() * TAU;
        const d = Math.sqrt(caso()) * r * 0.92;
        const x = Math.cos(a) * d;
        const y = -r + Math.sin(a) * d;
        g.fillStyle = caso() < 0.5 ? 'rgba(40,18,8,0.45)' : 'rgba(170,110,75,0.35)';
        ellisse(g, x, y, r * (0.05 + caso() * 0.08), r * (0.04 + caso() * 0.05), caso() * TAU);
        g.fill();
      }
      // Sugo lucido sopra
      g.fillStyle = sfera(g, -r * 0.1, -r * 1.55, r * 0.6, ['#e0392c', '#a01810', '#6a0c06']);
      g.beginPath();
      g.ellipse(-r * 0.05, -r * 1.55, r * 0.62, r * 0.3, -0.1, 0, TAU);
      g.fill();
      g.fillStyle = 'rgba(255,220,210,0.7)';
      ellisse(g, -r * 0.25, -r * 1.62, r * 0.14, r * 0.05, -0.2);
      g.fill();
      occhiMalvagi(g, guarda * r * 0.22, -r * 1.05, r * 0.16, guarda, '#ff6a2a');
      if (grande) {
        g.fillStyle = '#1a0605';
        g.beginPath();
        g.ellipse(guarda * r * 0.15, -r * 0.55, r * 0.45, r * 0.2, 0, 0, Math.PI);
        g.closePath();
        g.fill();
        g.fillStyle = '#e8dccb';
        for (let i = -3; i <= 3; i++) {
          const x = guarda * r * 0.15 + i * r * 0.12;
          g.beginPath();
          g.moveTo(x - r * 0.05, -r * 0.55);
          g.lineTo(x + r * 0.05, -r * 0.55);
          g.lineTo(x, -r * 0.42);
          g.fill();
        }
        g.fillStyle = lineare(g, -10, -r * 2.2, 10, -r * 1.9, ['#2f6a2a', '#5f9e45', '#2a5420']);
        g.beginPath();
        g.ellipse(-5, -r * 2.05, 5, 11, -0.5, 0, TAU);
        g.ellipse(6, -r * 2.05, 5, 11, 0.5, 0, TAU);
        g.fill();
      }
    } else if (n.tipo === 'cipolla') {
      g.rotate(Math.sin(n.fase * 0.7) * 0.07);
      g.beginPath();
      g.moveTo(0, -r * 2.3);
      g.quadraticCurveTo(r * 1.25, -r * 1.3, r * 0.9, -r * 0.3);
      g.quadraticCurveTo(0, r * 0.3, -r * 0.9, -r * 0.3);
      g.quadraticCurveTo(-r * 1.25, -r * 1.3, 0, -r * 2.3);
      g.fillStyle = sfera(g, 0, -r, r * 1.2, ['#c26a9a', '#7d2d55', '#3d0f27']);
      g.fill();
      // Venature della buccia
      g.strokeStyle = 'rgba(235,190,215,0.35)';
      g.lineWidth = 0.9;
      for (const x of [-0.6, -0.3, 0, 0.3, 0.6]) {
        g.beginPath();
        g.moveTo(0, -r * 2.2);
        g.quadraticCurveTo(r * x * 1.7, -r * 1.1, r * x * 0.9, -r * 0.05);
        g.stroke();
      }
      // Radichette e germoglio
      g.strokeStyle = 'rgba(210,190,150,0.8)';
      g.lineWidth = 0.6;
      for (let i = -2; i <= 2; i++) {
        g.beginPath();
        g.moveTo(i, 0);
        g.lineTo(i * 2, 3);
        g.stroke();
      }
      g.fillStyle = lineare(g, -3, -r * 2.9, 3, -r * 2.2, ['#3d7a32', '#7ab055']);
      g.beginPath();
      g.moveTo(-2, -r * 2.2);
      g.lineTo(-5, -r * 2.95);
      g.lineTo(1, -r * 2.3);
      g.lineTo(5, -r * 2.85);
      g.lineTo(2, -r * 2.2);
      g.fill();
      occhiMalvagi(g, guarda * 2, -r * 1.15, r * 0.17, guarda, '#ffd27a');
      g.fillStyle = 'rgba(160,210,255,0.85)';
      for (const x of [-r * 0.32, r * 0.32]) {
        const y = -r * 0.95 + ((t * 1.6 + (x > 0 ? 0.5 : 0)) % 1) * 14;
        ellisse(g, x + guarda * 2, y, 1.1, 1.8);
        g.fill();
      }
    } else {
      g.rotate(Math.sin(n.fase * 1.4) * 0.1);
      g.beginPath();
      g.moveTo(-r * 0.7, -r * 2);
      g.quadraticCurveTo(-r * 0.95, -r * 0.6, 0, 0);
      g.quadraticCurveTo(r * 0.95, -r * 0.6, r * 0.7, -r * 2);
      g.closePath();
      g.fillStyle = lineare(g, -r, 0, r, 0, ['#ff5a40', '#d0180f', '#7a0805']);
      g.fill();
      g.fillStyle = 'rgba(255,230,220,0.6)';
      ellisse(g, -r * 0.35, -r * 1.25, r * 0.1, r * 0.5, 0.15);
      g.fill();
      g.fillStyle = lineare(g, 0, -r * 2.3, 0, -r * 1.85, ['#5d9a40', '#2c5a1e']);
      ellisse(g, 0, -r * 2.02, r * 0.8, r * 0.24);
      g.fill();
      occhiMalvagi(g, guarda * 2, -r * 1.35, r * 0.22, guarda, '#ffe14a');
      g.translate(0, -r * 2.05);
      fiamma(g, t + n.fase, 0.45);
    }
    if (n.colpito > 0) {
      g.globalCompositeOperation = 'lighter';
      g.fillStyle = `rgba(255,255,255,${n.colpito * 1.5})`;
      cerchio(g, 0, -r, r * 1.1);
      g.fill();
    }
    g.restore();
    const vitaMax = n.vitaMax || def.vita;
    if (n.vita < vitaMax) {
      const w = r * 1.8;
      const y = n.y - r * (n.tipo === 'peperoncino' ? 3.8 : n.tipo === 'cipolla' ? 3.1 : n.tipo === 'polpettone' ? 2.9 : 2.5) - salto;
      barretta(g, n.x, y, w, n.vita / vitaMax, '#d63a2a');
    }
  }

  // ---------- Notte e luce ----------

  disegnaBuio(g, gioco, cam, t) {
    const b = gioco.buio();
    if (b <= 0.01) return;
    const k = Math.min(this.dpr, 2);
    const bg = this.buio.getContext('2d');
    bg.setTransform(k, 0, 0, k, 0, 0);
    bg.globalCompositeOperation = 'source-over';
    bg.clearRect(0, 0, this.L, this.A);
    bg.fillStyle = `rgba(5,9,26,${0.86 * b})`;
    bg.fillRect(0, 0, this.L, this.A);
    bg.globalCompositeOperation = 'destination-out';
    const schermo = (x, y) => ({ x: (x - cam.x) * this.zoom + this.L / 2, y: (y - cam.y) * this.zoom + this.A / 2 });
    const buco = (x, y, r, forza = 1) => {
      const p = schermo(x, y);
      const rr = r * this.zoom;
      const gr = bg.createRadialGradient(p.x, p.y, rr * 0.2, p.x, p.y, rr);
      gr.addColorStop(0, `rgba(0,0,0,${forza})`);
      gr.addColorStop(0.55, `rgba(0,0,0,${forza * 0.7})`);
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      bg.fillStyle = gr;
      bg.fillRect(p.x - rr, p.y - rr, rr * 2, rr * 2);
    };
    buco(gioco.chef.x, gioco.chef.y - 20, 70, 0.55);
    for (const l of gioco.luci()) buco(l.x, l.y - 10, l.raggio * 1.2 * (1 + Math.sin(t * 9 + l.x) * 0.03 + Math.sin(t * 23) * 0.015));
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.drawImage(this.buio, 0, 0, this.L * this.dpr, this.A * this.dpr);
    g.restore();
    // Luce calda dei fuochi sul terreno
    g.save();
    g.globalCompositeOperation = 'lighter';
    for (const l of gioco.luci()) {
      const gr = g.createRadialGradient(l.x, l.y - 8, 0, l.x, l.y - 8, l.raggio * 0.9);
      gr.addColorStop(0, `rgba(255,120,40,${0.28 * b})`);
      gr.addColorStop(0.5, `rgba(200,70,20,${0.1 * b})`);
      gr.addColorStop(1, 'rgba(200,70,20,0)');
      g.fillStyle = gr;
      g.fillRect(l.x - l.raggio, l.y - l.raggio - 8, l.raggio * 2, l.raggio * 2);
    }
    g.restore();
  }

  disegnaFuoco(g, x, y, t, scala = 1) {
    g.save();
    g.translate(x, y - 6);
    fiamma(g, t, scala);
    // Scintille che salgono
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 6; i++) {
      const k = (t * 0.7 + i / 6) % 1;
      const sx = Math.sin(i * 12.9 + t * 2) * 8 * scala + Math.sin(k * 9 + i) * 4;
      g.fillStyle = `rgba(255,${160 + i * 10},60,${(1 - k) * 0.9})`;
      cerchio(g, sx, -18 * scala - k * 50 * scala, 1 + (1 - k));
      g.fill();
    }
    g.restore();
  }

  // ---------- Fotogramma completo ----------

  disegna(gioco, cam, t, effetti) {
    const g = this.ctx;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.fillStyle = '#163d4f';
    g.fillRect(0, 0, this.L, this.A);
    g.save();
    g.translate(this.L / 2, this.A / 2);
    g.scale(this.zoom, this.zoom);
    g.translate(-cam.x, -cam.y);
    this.disegnaTerreno(g, gioco.isola, cam);

    // Le ombre del sole spariscono al buio
    const sole = 0.4 * (1 - gioco.buio());
    const mezzo = Math.hypot(this.L, this.A) / 2 / this.zoom + 80;
    const scena = [];
    const ALTEZZE = { albero: 90, roccia: 26, pomodori: 26, grano: 34, funghi: 18, ceppo: 12 };
    for (const o of gioco.indice.vicini(cam.x, cam.y, mezzo)) {
      if (o.colpi <= 0 && (o.tipo === 'roccia' || o.tipo === 'funghi')) continue;
      const nome = o.tipo === 'albero' && o.colpi <= 0 ? 'ceppo' : o.tipo;
      const raggioOmbra = nome === 'albero' ? 30 : nome === 'ceppo' ? 12 : OGGETTI[o.tipo].raggio;
      ombra(g, o.x, o.y, raggioOmbra, ALTEZZE[nome] * (o.colpi <= 0 && nome !== 'ceppo' ? 0.3 : 1), sole);
      scena.push({ y: o.y, f: () => this.disegnaSprite(g, nome, o.x, o.y, o.variante, o.colpi <= 0) });
    }
    for (const s of gioco.strutture) {
      ombra(g, s.x, s.y, COSTRUZIONI[s.tipo].raggio + 6, s.tipo === 'forno' ? 70 : 26, sole);
      scena.push({ y: s.y, f: () => {
        this.disegnaSprite(g, s.tipo, s.x, s.y);
        if (s.tipo === 'falo') {
          // La fiamma cala con la legna; spenta resta un filo di fumo
          if (s.fuoco > 0) this.disegnaFuoco(g, s.x, s.y, t, 0.55 + 0.45 * Math.min(s.fuoco / 60, 1));
          else {
            for (let i = 0; i < 4; i++) {
              const k = (t * 0.4 + i / 4) % 1;
              g.fillStyle = `rgba(170,170,175,${0.4 * (1 - k)})`;
              cerchio(g, s.x + Math.sin(k * 6 + i) * 6, s.y - 10 - k * 40, 3 + k * 9);
              g.fill();
            }
          }
          barretta(g, s.x, s.y - 52, 36, Math.min(s.fuoco / 240, 1), s.fuoco > 20 ? '#e8a020' : '#d63a2a');
        }
        if (s.tipo === 'forno') this.disegnaFuoco(g, s.x, s.y + 4, t, 0.35);
        if (s.tipo === 'steccato' && s.vita < 80) barretta(g, s.x, s.y - 40, 32, s.vita / 80, '#7ab055');
      } });
    }
    for (const n of gioco.nemici) scena.push({ y: n.y, f: () => this.disegnaNemico(g, n, t, gioco.chef, sole) });
    if (!effetti.senzaChef) scena.push({ y: gioco.chef.y, f: () => this.disegnaChef(g, gioco.chef, t, effetti.attrezzo, sole) });

    // Bersaglio del tasto azione: un anello discreto a terra
    if (effetti.bersaglio && !gioco.piazzamento) {
      const b = effetti.bersaglio.ref;
      const r = (b.raggio || OGGETTI[b.tipo]?.raggio || COSTRUZIONI[b.tipo]?.raggio || 18) + 8;
      g.save();
      g.strokeStyle = effetti.bersaglio.tipo === 'nemico' ? 'rgba(255,90,70,0.75)' : 'rgba(255,250,235,0.6)';
      g.lineWidth = 1.6;
      g.setLineDash([6, 5]);
      g.lineDashOffset = -t * 16;
      ellisse(g, b.x, b.y + 2, r, r * 0.4);
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
      g.fillStyle = ok ? 'rgba(90,200,110,0.3)' : 'rgba(230,70,60,0.3)';
      ellisse(g, p.x, p.y + 2, r, r * 0.45);
      g.fill();
      this.disegnaSprite(g, gioco.piazzamento, p.x, p.y, 0, false, 0.6);
    }

    for (const q of effetti.particelle) {
      g.globalAlpha = Math.max(1 - q.t / q.durata, 0) * (q.cresce ? 0.6 : 1);
      g.fillStyle = q.colore;
      if (q.cresce) cerchio(g, q.x, q.y, q.r * (1 + q.t / q.durata));
      else ellisse(g, q.x, q.y, q.r, q.r * 0.6, q.t * 8);
      g.fill();
    }
    g.globalAlpha = 1;
    this.disegnaBuio(g, gioco, cam, t);
    for (const s of effetti.scritte) {
      const k = s.t / s.durata;
      g.globalAlpha = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
      g.font = `600 ${s.dimensione * 0.85}px system-ui, -apple-system, sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      const y = s.y - k * 30;
      g.fillStyle = 'rgba(0,0,0,0.6)';
      g.fillText(s.testo, s.x + 1, y + 1.5);
      g.fillStyle = s.colore;
      g.fillText(s.testo, s.x, y);
    }
    g.globalAlpha = 1;
    g.restore();

    // Luce del tramonto e vignettatura
    const b = gioco.buio();
    if (b > 0 && b < 1) {
      g.fillStyle = `rgba(255,110,50,${0.16 * Math.sin(b * Math.PI)})`;
      g.fillRect(0, 0, this.L, this.A);
    }
    if (!this.vignetta) {
      const gr = g.createRadialGradient(this.L / 2, this.A / 2, Math.min(this.L, this.A) * 0.35, this.L / 2, this.A / 2, Math.hypot(this.L, this.A) * 0.62);
      gr.addColorStop(0, 'rgba(0,0,0,0)');
      gr.addColorStop(1, 'rgba(0,0,0,0.42)');
      this.vignetta = gr;
    }
    g.fillStyle = this.vignetta;
    g.fillRect(0, 0, this.L, this.A);
    if (gioco.chef.ferito > 0) {
      g.fillStyle = `rgba(160,10,10,${gioco.chef.ferito * 0.5})`;
      g.fillRect(0, 0, this.L, this.A);
    }
  }
}

// Fiamma a strati: rosso scuro fuori, giallo-bianco dentro; tremola con il tempo
function fiamma(g, t, scala) {
  g.save();
  g.scale(scala, scala);
  g.globalCompositeOperation = 'lighter';
  const strati = [
    [34, 15, 'rgba(200,40,10,0.55)', 'rgba(200,40,10,0)'],
    [28, 11, 'rgba(255,110,20,0.75)', 'rgba(255,110,20,0)'],
    [20, 7.5, 'rgba(255,190,60,0.9)', 'rgba(255,190,60,0)'],
    [11, 4, 'rgba(255,245,200,0.95)', 'rgba(255,245,200,0)'],
  ];
  strati.forEach(([h, w, dentro, fuori], i) => {
    for (let l = -1; l <= 1; l++) {
      const tr = Math.sin(t * (13 + i * 3) + l * 2.1 + i) * 0.15 + Math.sin(t * 29 + l) * 0.07;
      const hh = h * (1 + tr) * (l === 0 ? 1 : 0.7);
      const x = l * w * 0.55;
      const gr = g.createLinearGradient(0, 0, 0, -hh);
      gr.addColorStop(0, dentro);
      gr.addColorStop(1, fuori);
      g.fillStyle = gr;
      g.beginPath();
      g.moveTo(x - w * 0.6, 0);
      g.bezierCurveTo(x - w, -hh * 0.4, x + Math.sin(t * 7 + l) * w * 0.4, -hh * 0.75, x + Math.sin(t * 5 + l * 3) * w * 0.3, -hh);
      g.bezierCurveTo(x + w * 0.4, -hh * 0.6, x + w, -hh * 0.3, x + w * 0.6, 0);
      g.closePath();
      g.fill();
    }
  });
  g.restore();
}

function barretta(g, x, y, w, k, colore) {
  g.fillStyle = 'rgba(0,0,0,0.55)';
  g.fillRect(x - w / 2 - 1, y - 1, w + 2, 5);
  g.fillStyle = colore;
  g.fillRect(x - w / 2, y, w * Math.max(Math.min(k, 1), 0), 3);
}

// Occhi piccoli e infossati, con un bagliore
function occhiMalvagi(g, dx, y, r, guarda, colore) {
  for (const x of [-r * 1.4, r * 1.4]) {
    g.fillStyle = 'rgba(15,5,2,0.85)';
    ellisse(g, x + dx, y, r * 1.1, r * 0.8);
    g.fill();
    const gr = g.createRadialGradient(x + dx + guarda * r * 0.3, y, 0, x + dx + guarda * r * 0.3, y, r * 0.7);
    gr.addColorStop(0, colore);
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    cerchio(g, x + dx + guarda * r * 0.3, y, r * 0.7);
    g.fill();
  }
  g.strokeStyle = 'rgba(15,5,2,0.9)';
  g.lineWidth = Math.max(1, r * 0.45);
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(-r * 2.6 + dx, y - r * 1.3);
  g.lineTo(-r * 0.5 + dx, y - r * 0.6);
  g.moveTo(r * 2.6 + dx, y - r * 1.3);
  g.lineTo(r * 0.5 + dx, y - r * 0.6);
  g.stroke();
}

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
