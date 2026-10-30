// Disegno vettoriale degli ingredienti, dei barattoli e del banco di marmo.
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
  cipolla: '#9d4edd',
  mais: '#f6c000',
  prosciutto: '#f08a8a',
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

  cipolla(ctx, r) {
    cerchio(ctx, 0, 0, r * 0.82, radiale(ctx, 0, 0, r * 0.82, ['#fdf4ff', '#f1dcf7', '#d9b8e6']));
    ctx.strokeStyle = '#8e3fbf';
    for (const [d, s] of [[0.74, 0.13], [0.52, 0.08], [0.31, 0.07]]) {
      ctx.lineWidth = r * s;
      ctx.beginPath();
      ctx.arc(0, 0, r * d, 0, TAU);
      ctx.stroke();
    }
    riflesso(ctx, -r * 0.3, -r * 0.35, r * 0.2, r * 0.09, 0.5);
  },

  mais(ctx, r) {
    const chicchi = [[0, 0], [0.42, 0], [-0.42, 0], [0.21, -0.38], [-0.21, -0.38], [0.21, 0.38], [-0.21, 0.38]];
    for (const [x, y] of chicchi) {
      ctx.beginPath();
      ctx.ellipse(r * x, r * y, r * 0.22, r * 0.25, 0, 0, TAU);
      ctx.fillStyle = radiale(ctx, r * x, r * y, r * 0.25, ['#fff3a3', '#ffd23f', '#e0a000']);
      ctx.fill();
      ctx.strokeStyle = 'rgba(150,90,0,0.35)';
      ctx.lineWidth = r * 0.03;
      ctx.stroke();
    }
  },

  prosciutto(ctx, r) {
    ctx.beginPath();
    for (let i = 0; i <= 40; i++) {
      const a = (i / 40) * TAU;
      const d = r * (0.8 + Math.sin(a * 5) * 0.05);
      ctx.lineTo(Math.cos(a) * d, Math.sin(a) * d * 0.82);
    }
    ctx.fillStyle = radiale(ctx, 0, 0, r * 0.8, ['#ffc4c4', '#f08a8a', '#d65f6a']);
    ctx.fill();
    ctx.strokeStyle = '#fff4ee';
    ctx.lineWidth = r * 0.13;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.72, Math.PI * 0.15, Math.PI * 0.85);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,240,235,0.6)';
    ctx.lineWidth = r * 0.05;
    ctx.beginPath();
    ctx.moveTo(-r * 0.45, -r * 0.2);
    ctx.quadraticCurveTo(-r * 0.05, -r * 0.4, r * 0.35, -r * 0.15);
    ctx.stroke();
  },

  // Ingrediente coperto: un fagottino di carta da forno, si scopre quando arriva in cima
  coperto(ctx, r) {
    ctx.beginPath();
    ctx.moveTo(-r * 0.12, -r * 0.62);
    ctx.lineTo(-r * 0.3, -r * 0.88);
    ctx.lineTo(r * 0.3, -r * 0.88);
    ctx.lineTo(r * 0.12, -r * 0.62);
    ctx.fillStyle = '#b9895a';
    ctx.fill();
    cerchio(ctx, 0, r * 0.06, r * 0.74, radiale(ctx, 0, r * 0.06, r * 0.74, ['#e8c9a0', '#cf9f6c', '#a8774a']));
    ctx.strokeStyle = 'rgba(110,70,30,0.35)';
    ctx.lineWidth = r * 0.04;
    for (const a of [-0.5, 0.1, 0.6]) {
      ctx.beginPath();
      ctx.moveTo(Math.cos(a - 1.6) * r * 0.6, Math.sin(a - 1.6) * r * 0.6);
      ctx.quadraticCurveTo(0, 0, Math.cos(a + 1.4) * r * 0.62, Math.sin(a + 1.4) * r * 0.62);
      ctx.stroke();
    }
    ctx.fillStyle = '#5c3a1c';
    ctx.font = `900 ${r * 0.8}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('?', 0, r * 0.1);
  },
};

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


// Banco di marmo chiaro con venature: si disegna una volta per misura dello schermo
export function creaSfondo(larghezza, altezza, dpr) {
  const c = tela(1);
  c.width = Math.ceil(larghezza * dpr);
  c.height = Math.ceil(altezza * dpr);
  const ctx = c.getContext('2d');
  ctx.scale(dpr, dpr);
  const g = ctx.createLinearGradient(0, 0, larghezza, altezza);
  g.addColorStop(0, '#f7f3ec');
  g.addColorStop(1, '#ebe3d6');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, larghezza, altezza);
  let seme = 7;
  const caso = () => ((seme = (seme * 16807) % 2147483647) / 2147483647);
  for (let v = 0; v < 9; v++) {
    ctx.beginPath();
    let x = caso() * larghezza;
    let y = -20;
    ctx.moveTo(x, y);
    while (y < altezza + 20) {
      x += (caso() - 0.45) * 60;
      y += 30 + caso() * 50;
      ctx.lineTo(x, y);
    }
    ctx.strokeStyle = `rgba(150,135,120,${0.05 + caso() * 0.08})`;
    ctx.lineWidth = 0.6 + caso() * 1.8;
    ctx.stroke();
  }
  return c;
}

// Mensola di legno sotto una fila di barattoli
export function disegnaMensola(ctx, x, y, w, h) {
  ctx.save();
  ctx.shadowColor = 'rgba(60,35,15,0.25)';
  ctx.shadowBlur = h;
  ctx.shadowOffsetY = h * 0.4;
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, '#d39a62');
  g.addColorStop(0.35, '#b97b45');
  g.addColorStop(1, '#8e5a30');
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
  ctx.restore();
  ctx.strokeStyle = 'rgba(90,50,20,0.25)';
  ctx.lineWidth = 1;
  for (let i = 1; i < 3; i++) {
    ctx.beginPath();
    ctx.moveTo(x, y + (h * i) / 3);
    ctx.bezierCurveTo(x + w * 0.3, y + (h * i) / 3 - 1.5, x + w * 0.6, y + (h * i) / 3 + 1.5, x + w, y + (h * i) / 3);
    ctx.stroke();
  }
}

function forma(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, y + h - r);
  ctx.quadraticCurveTo(x, y + h, x + r, y + h);
  ctx.lineTo(x + w - r, y + h);
  ctx.quadraticCurveTo(x + w, y + h, x + w, y + h - r);
  ctx.lineTo(x + w, y);
}

// Barattolo di vetro: (x, y) è l'angolo in alto a sinistra del collo, w la larghezza, h l'altezza totale.
// Il fondo e il retro si disegnano prima degli ingredienti, il vetro davanti dopo.
export function disegnaBarattoloDietro(ctx, x, y, w, h, evidenza = 0) {
  const collo = w * 0.16;
  ctx.save();
  forma(ctx, x, y + collo, w, h - collo, w * 0.22);
  ctx.closePath();
  ctx.fillStyle = 'rgba(255,255,255,0.38)';
  ctx.fill();
  if (evidenza) {
    ctx.shadowColor = `rgba(47,125,91,${0.7 * evidenza})`;
    ctx.shadowBlur = w * 0.3;
    ctx.strokeStyle = `rgba(47,125,91,${evidenza})`;
    ctx.lineWidth = w * 0.06;
    ctx.stroke();
  }
  ctx.restore();
}

export function disegnaBarattoloDavanti(ctx, x, y, w, h) {
  const collo = w * 0.16;
  ctx.save();
  forma(ctx, x, y + collo, w, h - collo, w * 0.22);
  ctx.strokeStyle = 'rgba(120,140,140,0.55)';
  ctx.lineWidth = Math.max(1.5, w * 0.035);
  ctx.stroke();
  const g = ctx.createLinearGradient(x, 0, x + w, 0);
  g.addColorStop(0, 'rgba(255,255,255,0.0)');
  g.addColorStop(0.12, 'rgba(255,255,255,0.55)');
  g.addColorStop(0.22, 'rgba(255,255,255,0.0)');
  g.addColorStop(0.85, 'rgba(255,255,255,0.0)');
  g.addColorStop(0.92, 'rgba(255,255,255,0.3)');
  g.addColorStop(1, 'rgba(255,255,255,0.0)');
  ctx.fillStyle = g;
  ctx.fillRect(x, y + collo * 1.6, w, h - collo * 2.4);
  // Bordo del collo
  ctx.fillStyle = 'rgba(200,215,215,0.7)';
  ctx.fillRect(x - w * 0.04, y + collo * 0.55, w * 1.08, collo * 0.5);
  ctx.restore();
}

// Coperchio a quadretti rossi e bianchi; k da 0 a 1 lo fa scendere sul barattolo
export function disegnaCoperchio(ctx, x, y, w, k) {
  const collo = w * 0.16;
  const yc = y - (1 - k) * w * 0.9;
  ctx.save();
  ctx.globalAlpha = Math.min(k * 3, 1);
  ctx.beginPath();
  ctx.moveTo(x - w * 0.1, yc + collo * 1.3);
  ctx.lineTo(x + w * 0.02, yc - collo * 0.35);
  ctx.lineTo(x + w * 0.98, yc - collo * 0.35);
  ctx.lineTo(x + w * 1.1, yc + collo * 1.3);
  ctx.closePath();
  ctx.fillStyle = '#fbf6ee';
  ctx.fill();
  ctx.clip();
  ctx.fillStyle = '#d1495b';
  const q = w / 6;
  for (let i = -1; i < 8; i++) {
    for (let j = -1; j < 3; j++) {
      if ((i + j) % 2 === 0) ctx.fillRect(x - w * 0.1 + i * q, yc - collo * 0.35 + j * q, q, q);
    }
  }
  ctx.restore();
  ctx.save();
  ctx.globalAlpha = Math.min(k * 3, 1);
  ctx.strokeStyle = '#a8323f';
  ctx.lineWidth = Math.max(1.5, w * 0.04);
  ctx.beginPath();
  ctx.moveTo(x - w * 0.08, yc + collo * 1.2);
  ctx.lineTo(x + w * 1.08, yc + collo * 1.2);
  ctx.stroke();
  ctx.restore();
}
