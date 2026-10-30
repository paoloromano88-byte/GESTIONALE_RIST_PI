// Icone dell'interfaccia (zaino, crea, cucina), disegnate nello stesso stile del gioco
import { SPRITE, contornato, disegnaAttrezzo } from './disegno.js';

const TAU = Math.PI * 2;
const cerchio = (g, x, y, r) => {
  g.beginPath();
  g.arc(x, y, r, 0, TAU);
};

function pizza(g, condimenti) {
  contornato(g, [() => cerchio(g, 0, 0, 15)], '#f2c27b', 2);
  g.fillStyle = '#e63946';
  cerchio(g, 0, 0, 11.5);
  g.fill();
  for (const [x, y, c, r] of condimenti) {
    g.fillStyle = c;
    cerchio(g, x, y, r);
    g.fill();
  }
}

const DISEGNI = {
  legna(g) {
    for (const [y, x] of [[5, -2], [-4, 2]]) {
      contornato(g, [() => g.rect(-13 + x, y - 5, 24, 10)], '#a8683a', 2);
      contornato(g, [() => { g.beginPath(); g.ellipse(11 + x, y, 4, 5, 0, 0, TAU); }], '#e3b07a', 1.5);
    }
  },
  pietra(g) {
    g.translate(0, 10);
    g.scale(0.62, 0.62);
    SPRITE.roccia(g, 0.3);
  },
  pomodoro(g) {
    contornato(g, [() => cerchio(g, 0, 2, 12)], '#ff4040', 2);
    contornato(g, [() => { g.beginPath(); for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU - Math.PI / 2; const d = i % 2 ? 2.5 : 7; g.lineTo(Math.cos(a) * d, -9 + Math.sin(a) * d * 0.6); } g.closePath(); }], '#3fae49', 1.5);
    g.fillStyle = 'rgba(255,255,255,0.8)';
    cerchio(g, -5, -2, 2.5);
    g.fill();
  },
  grano(g) {
    g.translate(0, 13);
    g.scale(0.62, 0.62);
    SPRITE.grano(g, 0, false);
  },
  fungo(g) {
    g.translate(0, 12);
    g.scale(0.95, 0.95);
    SPRITE.funghi(g, 0, false);
  },
  carne(g) {
    contornato(g, [() => cerchio(g, 0, 0, 11)], '#c0714a', 2);
    g.fillStyle = '#9a5532';
    for (const [x, y] of [[-4, -3], [4, 2], [0, 5]]) {
      cerchio(g, x, y, 2);
      g.fill();
    }
  },
  cipolla(g) {
    contornato(g, [() => { g.beginPath(); g.moveTo(0, -14); g.quadraticCurveTo(14, -4, 9, 8); g.quadraticCurveTo(0, 14, -9, 8); g.quadraticCurveTo(-14, -4, 0, -14); }], '#b46bb8', 2);
  },
  peperoncino(g) {
    g.rotate(-0.6);
    contornato(g, [() => { g.beginPath(); g.moveTo(-5, -10); g.quadraticCurveTo(-6, 6, 4, 14); g.quadraticCurveTo(6, 2, 5, -10); g.closePath(); }], '#e5383b', 2);
    contornato(g, [() => { g.beginPath(); g.ellipse(0, -11, 6, 3, 0, 0, TAU); }], '#3a9d3a', 1.5);
  },
  pomodoroArrosto(g) {
    DISEGNI.pomodoro(g);
    g.strokeStyle = '#7a1f1f';
    g.lineWidth = 2;
    for (const x of [-5, 0, 5]) {
      g.beginPath();
      g.moveTo(x - 3, -2);
      g.lineTo(x + 3, 8);
      g.stroke();
    }
  },
  funghiTrifolati(g) {
    contornato(g, [() => { g.beginPath(); g.ellipse(0, 4, 15, 8, 0, 0, TAU); }], '#4a4a5a', 2);
    g.fillStyle = '#b9652a';
    for (const [x, y] of [[-6, 2], [3, 5], [6, 0], [-1, -1]]) {
      cerchio(g, x, y, 3.4);
      g.fill();
    }
    g.fillStyle = '#3fae49';
    cerchio(g, 1, 2, 1.5);
    g.fill();
  },
  polpettaCotta(g) {
    contornato(g, [() => cerchio(g, 0, 2, 11)], '#7a3e22', 2);
    contornato(g, [() => { g.beginPath(); g.ellipse(0, -6, 8, 4, 0, 0, TAU); }], '#e63946', 1.5);
  },
  cipollaArrosto(g) {
    DISEGNI.cipolla(g);
    g.strokeStyle = '#5a2a5c';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(-6, 0);
    g.lineTo(6, 4);
    g.stroke();
  },
  pane(g) {
    contornato(g, [() => { g.beginPath(); g.ellipse(0, 2, 15, 10, 0, 0, TAU); }], '#d99a4e', 2);
    g.strokeStyle = '#a8682a';
    g.lineWidth = 2;
    for (const x of [-6, 0, 6]) {
      g.beginPath();
      g.moveTo(x - 2, -4);
      g.lineTo(x + 2, 6);
      g.stroke();
    }
  },
  pizzaMargherita(g) {
    pizza(g, [[-4, -3, '#fff', 3.5], [4, 3, '#fff', 3.5], [3, -5, '#3fae49', 2.2]]);
  },
  pizzaFunghi(g) {
    pizza(g, [[-4, -3, '#b9652a', 3], [4, 3, '#b9652a', 3], [4, -5, '#fff', 3], [-4, 5, '#fff', 3]]);
  },
  pizzaDiavola(g) {
    pizza(g, [[-4, -3, '#7a1f2a', 3.2], [4, 3, '#7a1f2a', 3.2], [4, -5, '#ff8a00', 2], [-4, 5, '#ff8a00', 2]]);
  },
  falo(g) {
    g.translate(0, 9);
    g.scale(0.55, 0.55);
    SPRITE.falo(g);
    contornato(g, [() => { g.beginPath(); g.moveTo(0, -38); g.bezierCurveTo(14, -24, 14, -8, 0, -6); g.bezierCurveTo(-14, -8, -14, -24, 0, -38); }], '#ff7b00', 2);
  },
  forno(g) {
    g.translate(0, 13);
    g.scale(0.4, 0.4);
    SPRITE.forno(g);
  },
  steccato(g) {
    g.translate(0, 12);
    g.scale(0.6, 0.6);
    SPRITE.steccato(g);
  },
};

for (const a of ['mattarello', 'ascia', 'piccone', 'coltello']) {
  DISEGNI[a] = (g) => {
    g.translate(-2, 14);
    g.rotate(0.6);
    g.scale(0.8, 0.8);
    disegnaAttrezzo(g, a);
  };
}

export function icona(nome, lato = 36) {
  const c = document.createElement('canvas');
  const k = Math.min(window.devicePixelRatio || 1, 3);
  c.width = c.height = Math.round(lato * k);
  c.style.width = c.style.height = `${lato}px`;
  c.className = 'icona';
  const g = c.getContext('2d');
  g.scale((lato / 40) * k, (lato / 40) * k);
  g.translate(20, 20);
  DISEGNI[nome]?.(g);
  return c;
}
