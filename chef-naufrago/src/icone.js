// Icone dell'interfaccia (zaino, crea, cucina), disegnate con la stessa luce e gli stessi materiali del gioco
import { SPRITE, disegnaAttrezzo } from './disegno.js';

const TAU = Math.PI * 2;

function cerchio(g, x, y, r) {
  g.beginPath();
  g.arc(x, y, r, 0, TAU);
}

function sfera(g, x, y, r, stop) {
  const gr = g.createRadialGradient(x - r * 0.4, y - r * 0.45, r * 0.05, x, y, r * 1.05);
  stop.forEach((c, i) => gr.addColorStop(i / (stop.length - 1), c));
  return gr;
}

function riflesso(g, x, y, r) {
  g.fillStyle = 'rgba(255,255,255,0.7)';
  g.beginPath();
  g.ellipse(x, y, r, r * 0.55, -0.5, 0, TAU);
  g.fill();
}

function pizza(g, condimenti) {
  g.fillStyle = sfera(g, 0, 0, 15, ['#f1cf91', '#d9a05a', '#9c6430']);
  cerchio(g, 0, 0, 15);
  g.fill();
  g.fillStyle = sfera(g, 0, 0, 11.5, ['#e2523a', '#b52a18', '#7d170c']);
  cerchio(g, 0, 0, 11.5);
  g.fill();
  for (const [x, y, c, r] of condimenti) {
    g.fillStyle = c;
    g.beginPath();
    g.ellipse(x, y, r, r * 0.85, x, 0, TAU);
    g.fill();
  }
}

const DISEGNI = {
  legna(g) {
    for (const [y, x] of [[5, -2], [-4, 2]]) {
      g.fillStyle = (() => {
        const gr = g.createLinearGradient(0, y - 5, 0, y + 5);
        gr.addColorStop(0, '#8c6a44');
        gr.addColorStop(1, '#4a3420');
        return gr;
      })();
      g.fillRect(-13 + x, y - 5, 24, 10);
      g.fillStyle = sfera(g, 11 + x, y, 5, ['#e0c095', '#b08a5c']);
      g.beginPath();
      g.ellipse(11 + x, y, 4, 5, 0, 0, TAU);
      g.fill();
      g.strokeStyle = 'rgba(110,80,45,0.7)';
      g.lineWidth = 0.6;
      g.beginPath();
      g.ellipse(11 + x, y, 2, 2.5, 0, 0, TAU);
      g.stroke();
    }
  },
  pietra(g) {
    g.translate(0, 9);
    g.scale(0.62, 0.62);
    SPRITE.roccia(g, 0.3);
  },
  pomodoro(g) {
    g.fillStyle = sfera(g, 0, 2, 12, ['#ff8a6a', '#d63420', '#7a120a']);
    cerchio(g, 0, 2, 12);
    g.fill();
    riflesso(g, -4.5, -2.5, 2.4);
    g.fillStyle = '#2f5a23';
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU;
      g.beginPath();
      g.ellipse(Math.cos(a) * 3.5, -9 + Math.sin(a) * 1.6, 3.6, 1.2, a, 0, TAU);
      g.fill();
    }
  },
  grano(g) {
    g.translate(0, 15);
    g.scale(0.62, 0.62);
    SPRITE.grano(g, 0.2, false);
  },
  fungo(g) {
    g.translate(2, 13);
    g.scale(1.05, 1.05);
    SPRITE.funghi(g, 0, false);
  },
  carne(g) {
    g.fillStyle = sfera(g, 0, 0, 11, ['#c58a6a', '#9a5a40', '#5a2c18']);
    cerchio(g, 0, 0, 11);
    g.fill();
    g.fillStyle = 'rgba(60,25,10,0.4)';
    for (const [x, y] of [[-4, -3], [4, 2], [0, 5], [5, -4], [-5, 4]]) {
      cerchio(g, x, y, 1.3);
      g.fill();
    }
  },
  cipolla(g) {
    g.fillStyle = sfera(g, 0, 0, 14, ['#c26a9a', '#7d2d55', '#3d0f27']);
    g.beginPath();
    g.moveTo(0, -14);
    g.quadraticCurveTo(14, -4, 9, 8);
    g.quadraticCurveTo(0, 14, -9, 8);
    g.quadraticCurveTo(-14, -4, 0, -14);
    g.fill();
    g.strokeStyle = 'rgba(235,190,215,0.4)';
    g.lineWidth = 0.7;
    for (const x of [-0.5, 0, 0.5]) {
      g.beginPath();
      g.moveTo(0, -13);
      g.quadraticCurveTo(x * 22, -2, x * 10, 11);
      g.stroke();
    }
  },
  peperoncino(g) {
    g.rotate(-0.6);
    const gr = g.createLinearGradient(-6, 0, 6, 0);
    gr.addColorStop(0, '#ff5a40');
    gr.addColorStop(0.5, '#d0180f');
    gr.addColorStop(1, '#7a0805');
    g.fillStyle = gr;
    g.beginPath();
    g.moveTo(-5, -10);
    g.quadraticCurveTo(-6, 6, 4, 15);
    g.quadraticCurveTo(6, 2, 5, -10);
    g.closePath();
    g.fill();
    riflesso(g, -2, -3, 1.6);
    g.fillStyle = '#3d7a32';
    g.beginPath();
    g.ellipse(0, -11, 6, 2.6, 0, 0, TAU);
    g.fill();
  },
  pomodoroArrosto(g) {
    DISEGNI.pomodoro(g);
    g.strokeStyle = 'rgba(40,10,5,0.8)';
    g.lineWidth = 1.8;
    for (const x of [-5, 0, 5]) {
      g.beginPath();
      g.moveTo(x - 3, -2);
      g.lineTo(x + 3, 9);
      g.stroke();
    }
  },
  funghiTrifolati(g) {
    g.fillStyle = sfera(g, 0, 4, 15, ['#6a6d74', '#3a3c42', '#1c1d21']);
    g.beginPath();
    g.ellipse(0, 4, 15, 8, 0, 0, TAU);
    g.fill();
    for (const [x, y] of [[-6, 2], [3, 5], [6, 0], [-1, -1], [-4, 6]]) {
      g.fillStyle = sfera(g, x, y, 3.4, ['#c08a50', '#7a4a24']);
      cerchio(g, x, y, 3.4);
      g.fill();
    }
    g.fillStyle = '#4d8034';
    cerchio(g, 1, 2, 1.3);
    g.fill();
  },
  polpettaCotta(g) {
    g.fillStyle = sfera(g, 0, 2, 11, ['#9a5a3a', '#5a2c16', '#2a1208']);
    cerchio(g, 0, 2, 11);
    g.fill();
    g.fillStyle = sfera(g, 0, -5, 8, ['#e0392c', '#8a140c']);
    g.beginPath();
    g.ellipse(0, -5, 8, 4, 0, 0, TAU);
    g.fill();
    riflesso(g, -3, -6, 1.6);
  },
  cipollaArrosto(g) {
    DISEGNI.cipolla(g);
    g.fillStyle = 'rgba(60,30,10,0.45)';
    g.beginPath();
    g.ellipse(2, 3, 8, 6, 0, 0, TAU);
    g.fill();
  },
  pane(g) {
    g.fillStyle = sfera(g, 0, 2, 15, ['#e8b878', '#b97a3a', '#7a4a1c']);
    g.beginPath();
    g.ellipse(0, 2, 15, 10, 0, 0, TAU);
    g.fill();
    g.strokeStyle = 'rgba(245,220,170,0.8)';
    g.lineWidth = 1.6;
    for (const x of [-6, 0, 6]) {
      g.beginPath();
      g.moveTo(x - 2, -4);
      g.lineTo(x + 2, 6);
      g.stroke();
    }
  },
  pizzaMargherita(g) {
    pizza(g, [[-4, -3, '#f6f1e4', 3.6], [4, 3, '#f6f1e4', 3.6], [-3, 5, '#f6f1e4', 2.6], [3, -5, '#3f7a2c', 2.2]]);
  },
  pizzaFunghi(g) {
    pizza(g, [[-4, -3, '#8a5a30', 3], [4, 3, '#8a5a30', 3], [4, -5, '#f6f1e4', 3], [-4, 5, '#f6f1e4', 3]]);
  },
  pizzaDiavola(g) {
    pizza(g, [[-4, -3, '#7a1a20', 3.2], [4, 3, '#7a1a20', 3.2], [4, -5, '#7a1a20', 2.8], [-4, 5, '#d0180f', 1.6]]);
  },
  falo(g) {
    g.translate(0, 9);
    g.scale(0.55, 0.55);
    SPRITE.falo(g);
    g.globalCompositeOperation = 'lighter';
    for (const [h, w, c] of [[38, 12, 'rgba(255,110,20,0.8)'], [26, 7, 'rgba(255,200,80,0.95)']]) {
      const gr = g.createLinearGradient(0, -4, 0, -4 - h);
      gr.addColorStop(0, c);
      gr.addColorStop(1, 'rgba(255,120,20,0)');
      g.fillStyle = gr;
      g.beginPath();
      g.moveTo(-w, -4);
      g.quadraticCurveTo(-w, -h * 0.6, 0, -4 - h);
      g.quadraticCurveTo(w, -h * 0.6, w, -4);
      g.fill();
    }
  },
  forno(g) {
    g.translate(0, 13);
    g.scale(0.4, 0.4);
    SPRITE.forno(g);
  },
  steccato(g) {
    g.translate(0, 13);
    g.scale(0.6, 0.6);
    SPRITE.steccato(g);
  },
};

for (const a of ['mattarello', 'ascia', 'piccone', 'coltello']) {
  DISEGNI[a] = (g) => {
    g.translate(-2, 14);
    g.rotate(0.6);
    g.scale(0.85, 0.85);
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
