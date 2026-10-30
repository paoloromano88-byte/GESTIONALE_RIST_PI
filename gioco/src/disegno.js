// Disegno vettoriale degli ingredienti, della pizza sulla pala e dello sfondo.
// Ogni oggetto si disegna una volta sola in una piccola tela (cache) e poi si copia: è veloce anche sui telefoni lenti.

const TAU = Math.PI * 2;

export const COLORI = {
  pomodoro: '#e63946',
  mozzarella: '#f8f4ea',
  basilico: '#40916c',
  funghi: '#b07d4f',
  olive: '#3a3a4a',
  salame: '#b5333a',
  peperoncino: '#ef233c',
  ananas: '#f4a261',
  cuore: '#ff4d6d',
  orologio: '#4cc9f0',
};

function radiale(ctx, x, y, r, stop) {
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
  stop.forEach((c, i) => g.addColorStop(i / (stop.length - 1), c));
  return g;
}

function cerchio(ctx, x, y, r, fill) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fillStyle = fill;
  ctx.fill();
}

function riflesso(ctx, x, y, rx, ry, alfa = 0.4) {
  ctx.save();
  ctx.globalAlpha = alfa;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, -0.6, 0, TAU);
  ctx.fillStyle = '#fff';
  ctx.fill();
  ctx.restore();
}

// Ogni funzione disegna l'oggetto centrato in (0,0) dentro un cerchio di raggio r
const FORME = {
  pomodoro(ctx, r) {
    cerchio(ctx, 0, r * 0.05, r * 0.85, radiale(ctx, 0, r * 0.05, r * 0.85, ['#ff8070', '#e63946', '#9d1c24']));
    riflesso(ctx, -r * 0.35, -r * 0.25, r * 0.22, r * 0.12);
    ctx.fillStyle = '#2d6a4f';
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * TAU - Math.PI / 2;
      const d = i % 2 ? r * 0.14 : r * 0.38;
      ctx.lineTo(Math.cos(a) * d, -r * 0.62 + Math.sin(a) * d * 0.6);
    }
    ctx.fill();
    ctx.strokeStyle = '#1b4332';
    ctx.lineWidth = r * 0.1;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, -r * 0.65);
    ctx.lineTo(r * 0.06, -r * 0.88);
    ctx.stroke();
  },

  mozzarella(ctx, r) {
    ctx.beginPath();
    ctx.moveTo(0, -r * 0.9);
    ctx.quadraticCurveTo(r * 0.28, -r * 0.62, r * 0.18, -r * 0.5);
    ctx.lineTo(-r * 0.18, -r * 0.5);
    ctx.quadraticCurveTo(-r * 0.28, -r * 0.62, 0, -r * 0.9);
    ctx.fillStyle = '#ece5d4';
    ctx.fill();
    cerchio(ctx, 0, r * 0.12, r * 0.74, radiale(ctx, 0, r * 0.12, r * 0.74, ['#ffffff', '#f6f1e6', '#d6ccb6']));
    riflesso(ctx, -r * 0.3, -r * 0.12, r * 0.24, r * 0.13, 0.7);
  },

  basilico(ctx, r) {
    ctx.save();
    ctx.rotate(-0.5);
    ctx.beginPath();
    ctx.moveTo(0, -r * 0.92);
    ctx.bezierCurveTo(r * 0.75, -r * 0.55, r * 0.6, r * 0.5, 0, r * 0.78);
    ctx.bezierCurveTo(-r * 0.6, r * 0.5, -r * 0.75, -r * 0.55, 0, -r * 0.92);
    const g = ctx.createLinearGradient(-r, -r, r, r);
    g.addColorStop(0, '#74c69d');
    g.addColorStop(1, '#2d6a4f');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = 'rgba(216,243,220,0.75)';
    ctx.lineWidth = r * 0.07;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, -r * 0.75);
    ctx.quadraticCurveTo(r * 0.05, 0, 0, r * 0.95);
    for (const t of [-0.35, 0, 0.35]) {
      ctx.moveTo(0, r * t);
      ctx.lineTo(r * 0.32, r * (t - 0.22));
      ctx.moveTo(0, r * t);
      ctx.lineTo(-r * 0.32, r * (t - 0.22));
    }
    ctx.stroke();
    ctx.restore();
  },

  funghi(ctx, r) {
    ctx.beginPath();
    ctx.moveTo(-r * 0.28, 0);
    ctx.lineTo(-r * 0.33, r * 0.72);
    ctx.quadraticCurveTo(0, r * 0.88, r * 0.33, r * 0.72);
    ctx.lineTo(r * 0.28, 0);
    ctx.fillStyle = '#f5ebe0';
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(0, r * 0.02, r * 0.82, r * 0.2, 0, 0, TAU);
    ctx.fillStyle = '#e3cba8';
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 0.9, r * 0.78, 0, Math.PI, TAU);
    ctx.closePath();
    ctx.fillStyle = radiale(ctx, 0, -r * 0.1, r * 0.9, ['#d9a066', '#a0673b', '#6f4426']);
    ctx.fill();
    for (const [x, y, s] of [[-0.4, -0.35, 0.12], [0.15, -0.55, 0.1], [0.45, -0.22, 0.09], [-0.05, -0.2, 0.07]]) {
      cerchio(ctx, r * x, r * y, r * s, 'rgba(255,240,220,0.8)');
    }
  },

  olive(ctx, r) {
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.75, 0, TAU);
    ctx.arc(0, 0, r * 0.28, 0, TAU, true);
    ctx.fillStyle = radiale(ctx, 0, 0, r * 0.75, ['#6b6b80', '#2b2d42', '#14141f']);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = r * 0.08;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.58, Math.PI * 1.1, Math.PI * 1.45);
    ctx.stroke();
  },

  salame(ctx, r) {
    cerchio(ctx, 0, 0, r * 0.86, '#7a1f24');
    cerchio(ctx, 0, 0, r * 0.76, radiale(ctx, 0, 0, r * 0.76, ['#d4505a', '#b5333a', '#93262d']));
    for (const [x, y, s] of [[-0.35, -0.3, 0.1], [0.25, -0.4, 0.08], [0.4, 0.15, 0.11], [-0.1, 0.05, 0.07], [-0.4, 0.3, 0.08], [0.1, 0.45, 0.09], [0.05, -0.12, 0.05]]) {
      cerchio(ctx, r * x, r * y, r * s, '#f6cfc9');
    }
    riflesso(ctx, -r * 0.3, -r * 0.35, r * 0.25, r * 0.1, 0.25);
  },

  peperoncino(ctx, r) {
    ctx.save();
    ctx.rotate(-0.35);
    ctx.beginPath();
    ctx.moveTo(-r * 0.32, -r * 0.5);
    ctx.bezierCurveTo(-r * 0.5, r * 0.15, -r * 0.1, r * 0.75, r * 0.5, r * 0.9);
    ctx.bezierCurveTo(r * 0.12, r * 0.5, r * 0.32, -r * 0.05, r * 0.3, -r * 0.5);
    ctx.quadraticCurveTo(0, -r * 0.7, -r * 0.32, -r * 0.5);
    const g = ctx.createLinearGradient(-r * 0.4, 0, r * 0.4, 0);
    g.addColorStop(0, '#ff6b6b');
    g.addColorStop(0.5, '#ef233c');
    g.addColorStop(1, '#a4161a');
    ctx.fillStyle = g;
    ctx.fill();
    riflesso(ctx, -r * 0.18, -r * 0.1, r * 0.07, r * 0.28, 0.45);
    ctx.beginPath();
    ctx.ellipse(0, -r * 0.56, r * 0.34, r * 0.13, 0, 0, TAU);
    ctx.fillStyle = '#2d6a4f';
    ctx.fill();
    ctx.strokeStyle = '#2d6a4f';
    ctx.lineWidth = r * 0.13;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, -r * 0.6);
    ctx.quadraticCurveTo(r * 0.05, -r * 0.85, r * 0.28, -r * 0.92);
    ctx.stroke();
    ctx.restore();
  },

  ananas(ctx, r) {
    // Alone rosso: è l'oggetto da evitare
    ctx.save();
    ctx.setLineDash([r * 0.22, r * 0.14]);
    ctx.strokeStyle = 'rgba(255,60,60,0.9)';
    ctx.lineWidth = r * 0.09;
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.02, 0, TAU);
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = '#2d6a4f';
    for (const a of [-0.55, -0.25, 0, 0.25, 0.55]) {
      ctx.save();
      ctx.translate(0, -r * 0.42);
      ctx.rotate(a);
      ctx.beginPath();
      ctx.moveTo(-r * 0.1, 0);
      ctx.lineTo(0, -r * (a === 0 ? 0.5 : 0.4));
      ctx.lineTo(r * 0.1, 0);
      ctx.fill();
      ctx.restore();
    }
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(0, r * 0.18, r * 0.52, r * 0.66, 0, 0, TAU);
    ctx.fillStyle = radiale(ctx, 0, r * 0.18, r * 0.66, ['#ffd166', '#f4a261', '#c76d23']);
    ctx.fill();
    ctx.clip();
    ctx.strokeStyle = 'rgba(120,60,10,0.55)';
    ctx.lineWidth = r * 0.06;
    for (let i = -4; i <= 4; i++) {
      ctx.beginPath();
      ctx.moveTo(i * r * 0.22 - r, -r * 0.6);
      ctx.lineTo(i * r * 0.22 + r, r * 1.2);
      ctx.moveTo(i * r * 0.22 + r, -r * 0.6);
      ctx.lineTo(i * r * 0.22 - r, r * 1.2);
      ctx.stroke();
    }
    ctx.restore();
  },

  cuore(ctx, r) {
    alone(ctx, r, 'rgba(255,214,102,0.55)');
    ctx.beginPath();
    ctx.moveTo(0, r * 0.7);
    ctx.bezierCurveTo(-r * 1.0, r * 0.05, -r * 0.6, -r * 0.8, 0, -r * 0.35);
    ctx.bezierCurveTo(r * 0.6, -r * 0.8, r * 1.0, r * 0.05, 0, r * 0.7);
    ctx.fillStyle = radiale(ctx, 0, 0, r * 0.8, ['#ff8fa3', '#ff4d6d', '#c9184a']);
    ctx.fill();
    riflesso(ctx, -r * 0.35, -r * 0.25, r * 0.16, r * 0.09, 0.6);
  },

  orologio(ctx, r) {
    alone(ctx, r, 'rgba(255,214,102,0.55)');
    ctx.fillStyle = '#3a86ff';
    ctx.fillRect(-r * 0.12, -r * 0.86, r * 0.24, r * 0.2);
    cerchio(ctx, 0, r * 0.05, r * 0.72, radiale(ctx, 0, r * 0.05, r * 0.72, ['#90e0ef', '#4cc9f0', '#3a86ff']));
    cerchio(ctx, 0, r * 0.05, r * 0.54, '#f8fdff');
    ctx.strokeStyle = '#1d3557';
    ctx.lineWidth = r * 0.09;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, r * 0.05);
    ctx.lineTo(0, -r * 0.32);
    ctx.moveTo(0, r * 0.05);
    ctx.lineTo(r * 0.26, r * 0.15);
    ctx.stroke();
  },
};

function alone(ctx, r, colore) {
  const g = ctx.createRadialGradient(0, 0, r * 0.4, 0, 0, r * 1.15);
  g.addColorStop(0, colore);
  g.addColorStop(1, 'rgba(255,214,102,0)');
  cerchio(ctx, 0, 0, r * 1.15, g);
}

const cache = new Map();

function tela(lato) {
  const c = document.createElement('canvas');
  c.width = c.height = lato;
  return c;
}

// Restituisce la tela già disegnata dell'oggetto per raggio r (px CSS) e densità dpr
export function sprite(tipo, r, dpr) {
  const chiave = `${tipo}|${Math.round(r * dpr)}`;
  let c = cache.get(chiave);
  if (!c) {
    const lato = Math.ceil(r * 2.4 * dpr);
    c = tela(lato);
    const ctx = c.getContext('2d');
    ctx.translate(lato / 2, lato / 2);
    ctx.scale(dpr, dpr);
    FORME[tipo](ctx, r);
    cache.set(chiave, c);
  }
  return c;
}

export function disegnaOggetto(ctx, tipo, x, y, r, dpr, angolo = 0) {
  const s = sprite(tipo, r, dpr);
  const lato = r * 2.4;
  ctx.save();
  ctx.translate(x, y);
  if (angolo) ctx.rotate(angolo);
  ctx.drawImage(s, -lato / 2, -lato / 2, lato, lato);
  ctx.restore();
}

export function svuotaCache() {
  cache.clear();
}

// Sfondo: muro di mattoni caldo con la luce del forno in basso
export function creaSfondo(larghezza, altezza, dpr) {
  const c = tela(1);
  c.width = Math.ceil(larghezza * dpr);
  c.height = Math.ceil(altezza * dpr);
  const ctx = c.getContext('2d');
  ctx.scale(dpr, dpr);
  const g = ctx.createLinearGradient(0, 0, 0, altezza);
  g.addColorStop(0, '#2a160f');
  g.addColorStop(0.6, '#43251a');
  g.addColorStop(1, '#6b3420');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, larghezza, altezza);

  const hm = Math.max(18, larghezza / 16);
  const lm = hm * 2.2;
  ctx.strokeStyle = 'rgba(0,0,0,0.22)';
  ctx.lineWidth = 2;
  for (let riga = 0, y = 0; y < altezza; riga++, y += hm) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(larghezza, y);
    for (let x = (riga % 2) * (lm / 2); x < larghezza; x += lm) {
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + hm);
    }
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(255,200,150,0.05)';
  ctx.lineWidth = 1;
  for (let riga = 0, y = 2; y < altezza; riga++, y += hm) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(larghezza, y);
    ctx.stroke();
  }

  const luce = ctx.createRadialGradient(larghezza / 2, altezza * 1.05, 10, larghezza / 2, altezza * 1.05, altezza * 0.55);
  luce.addColorStop(0, 'rgba(255,140,40,0.55)');
  luce.addColorStop(1, 'rgba(255,140,40,0)');
  ctx.fillStyle = luce;
  ctx.fillRect(0, 0, larghezza, altezza);
  return c;
}

// Pala di legno con il manico verso il basso
export function disegnaPala(ctx, x, y, R, altezza) {
  const lm = R * 0.42;
  const g = ctx.createLinearGradient(x - lm / 2, 0, x + lm / 2, 0);
  g.addColorStop(0, '#8a5a32');
  g.addColorStop(0.5, '#c9935e');
  g.addColorStop(1, '#8a5a32');
  ctx.fillStyle = g;
  ctx.fillRect(x - lm / 2, y + R, lm, altezza - y - R + 2);
  ctx.beginPath();
  ctx.ellipse(x, y + R * 0.08, R * 1.2, R * 1.12, 0, 0, TAU);
  ctx.fillStyle = radiale(ctx, x, y, R * 1.2, ['#e0b07c', '#c48b55', '#9a6638']);
  ctx.fill();
  ctx.strokeStyle = 'rgba(90,50,20,0.25)';
  ctx.lineWidth = 1.5;
  for (let i = -3; i <= 3; i++) {
    ctx.beginPath();
    ctx.moveTo(x + i * R * 0.3, y - R * 0.95);
    ctx.quadraticCurveTo(x + i * R * 0.33, y, x + i * R * 0.3, y + R * 1.05);
    ctx.stroke();
  }
}

// Base della pizza (impasto e salsa) con i condimenti presi
export function disegnaPizza(ctx, x, y, R, condimenti, dpr, scala = 1, misuraCondimenti = 0.38) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scala, scala);
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = R * 0.25;
  ctx.shadowOffsetY = R * 0.08;
  cerchio(ctx, 0, 0, R, radiale(ctx, 0, 0, R, ['#f7dfae', '#eec27f', '#c98a45']));
  ctx.restore();
  ctx.beginPath();
  for (let i = 0; i <= 24; i++) {
    const a = (i / 24) * TAU;
    const d = R * (0.8 + Math.sin(i * 2.7) * 0.025);
    ctx.lineTo(Math.cos(a) * d, Math.sin(a) * d);
  }
  ctx.fillStyle = radiale(ctx, 0, 0, R * 0.8, ['#e85d4a', '#c1121f', '#9b1018']);
  ctx.fill();
  for (const [a, d] of [[0.4, 0.3], [2.1, 0.55], [3.9, 0.4], [5.2, 0.62], [1.2, 0.68]]) {
    cerchio(ctx, Math.cos(a) * R * d, Math.sin(a) * R * d, R * 0.05, 'rgba(255,190,150,0.35)');
  }
  const rc = R * misuraCondimenti;
  for (const c of condimenti) disegnaOggetto(ctx, c.tipo, c.dx, c.dy, rc, dpr, c.angolo);
  ctx.restore();
}
