// Icone dell'interfaccia: risorse, consumabili, armi e costruzioni, con luce e materiali realistici

const TAU = Math.PI * 2;

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

function rett(g, x, y, w, h, colore) {
  g.fillStyle = colore;
  g.fillRect(x, y, w, h);
}

const DISEGNI = {
  legna(g) {
    for (const [y, x] of [[5, -2], [-4, 2]]) {
      g.fillStyle = lineare(g, 0, y - 5, 0, y + 5, ['#8c6a44', '#4a3420']);
      g.fillRect(-13 + x, y - 5, 24, 10);
      g.fillStyle = sfera(g, 11 + x, y, 5, ['#e0c095', '#b08a5c']);
      g.beginPath();
      g.ellipse(11 + x, y, 4, 5, 0, 0, TAU);
      g.fill();
    }
  },
  metallo(g) {
    g.fillStyle = lineare(g, -14, -6, 14, 6, ['#c9ced4', '#7d848c', '#4a5058']);
    g.beginPath();
    g.moveTo(-14, 4);
    g.lineTo(-6, -8);
    g.lineTo(14, -4);
    g.lineTo(8, 9);
    g.closePath();
    g.fill();
    g.fillStyle = 'rgba(140,70,30,0.6)';
    g.beginPath();
    g.ellipse(4, 3, 5, 3, 0.4, 0, TAU);
    g.fill();
  },
  stoffa(g) {
    g.fillStyle = lineare(g, -12, -10, 12, 10, ['#9a8a6a', '#6b5c42']);
    g.beginPath();
    g.moveTo(-13, -8);
    g.quadraticCurveTo(0, -12, 13, -7);
    g.lineTo(11, 10);
    g.quadraticCurveTo(0, 6, -12, 10);
    g.closePath();
    g.fill();
    g.strokeStyle = 'rgba(50,40,25,0.5)';
    g.lineWidth = 1;
    for (const y of [-3, 3]) {
      g.beginPath();
      g.moveTo(-11, y);
      g.quadraticCurveTo(0, y - 3, 11, y);
      g.stroke();
    }
  },
  bacche(g) {
    for (const [x, y] of [[-5, -2], [3, -4], [5, 4], [-3, 5], [0, 0]]) {
      g.fillStyle = sfera(g, x, y, 4.5, ['#6a3a5a', '#2a0f1e', '#12060c']);
      g.beginPath();
      g.arc(x, y, 4.5, 0, TAU);
      g.fill();
    }
    g.fillStyle = '#3d6a2a';
    g.beginPath();
    g.ellipse(6, -10, 6, 2.5, -0.5, 0, TAU);
    g.fill();
  },
  cibo(g) {
    g.fillStyle = lineare(g, -10, 0, 10, 0, ['#8a8e94', '#d6dade', '#7a7e84']);
    g.fillRect(-10, -9, 20, 20);
    rett(g, -10, -4, 20, 10, '#a8381e');
    g.fillStyle = '#e8d8a0';
    g.font = '700 7px system-ui, sans-serif';
    g.textAlign = 'center';
    g.fillText('CARNE', 0, 3.5);
    g.fillStyle = sfera(g, 0, -9, 10, ['#e0e4e8', '#8a8e94']);
    g.beginPath();
    g.ellipse(0, -9, 10, 3, 0, 0, TAU);
    g.fill();
  },
  acqua(g) {
    g.fillStyle = 'rgba(160,210,235,0.55)';
    g.beginPath();
    g.moveTo(-6, -8);
    g.lineTo(-6, 13);
    g.quadraticCurveTo(0, 16, 6, 13);
    g.lineTo(6, -8);
    g.quadraticCurveTo(4, -12, 2, -13);
    g.lineTo(-2, -13);
    g.quadraticCurveTo(-4, -12, -6, -8);
    g.fill();
    g.fillStyle = 'rgba(60,140,200,0.55)';
    g.fillRect(-6, -1, 12, 14);
    rett(g, -2.5, -17, 5, 4, '#2a6ab0');
    g.fillStyle = 'rgba(255,255,255,0.7)';
    g.fillRect(-4.5, -6, 1.5, 16);
  },
  bende(g) {
    g.fillStyle = sfera(g, 0, 0, 12, ['#ffffff', '#e8e4da', '#b8b2a4']);
    g.beginPath();
    g.ellipse(0, 0, 12, 9, 0, 0, TAU);
    g.fill();
    g.fillStyle = '#c42a24';
    g.fillRect(-2, -6, 4, 12);
    g.fillRect(-6, -2, 12, 4);
  },
  munizioni(g) {
    for (const x of [-8, -2, 4, 10]) {
      g.fillStyle = lineare(g, x - 2.5, 0, x + 2.5, 0, ['#8a6a2a', '#e8c46a', '#8a6a2a']);
      g.fillRect(x - 2.5, -4, 5, 14);
      g.fillStyle = sfera(g, x, -5, 3, ['#d0a080', '#8a5a3a']);
      g.beginPath();
      g.ellipse(x, -5, 2.5, 4, 0, Math.PI, TAU);
      g.fill();
    }
  },
  dardi(g) {
    g.rotate(-0.6);
    for (const y of [-4, 2]) {
      rett(g, -14, y, 26, 1.8, '#8a6a44');
      g.fillStyle = '#9aa0a8';
      g.beginPath();
      g.moveTo(12, y - 2);
      g.lineTo(17, y + 0.9);
      g.lineTo(12, y + 3.8);
      g.fill();
      g.fillStyle = '#c03a2a';
      g.beginPath();
      g.moveTo(-14, y - 3);
      g.lineTo(-9, y + 0.9);
      g.lineTo(-14, y + 4.8);
      g.fill();
    }
  },
  pugni(g) {
    g.fillStyle = sfera(g, 0, 0, 11, ['#e0b08c', '#a87050']);
    g.beginPath();
    g.ellipse(0, 2, 10, 9, 0, 0, TAU);
    g.fill();
    g.strokeStyle = 'rgba(80,40,20,0.5)';
    for (const x of [-4, 0, 4]) {
      g.beginPath();
      g.moveTo(x, -6);
      g.lineTo(x, 0);
      g.stroke();
    }
  },
  bastone(g) {
    g.rotate(0.7);
    g.fillStyle = lineare(g, -2.5, 0, 2.5, 0, ['#4a3420', '#8a6a44', '#4a3420']);
    g.fillRect(-2.5, -16, 5, 32);
    g.fillStyle = '#a0a6ac';
    for (const [x, y] of [[-4, -12], [4, -9], [-4, -6], [4, -3]]) g.fillRect(x - 1.5, y, 3, 1.4);
  },
  ascia(g) {
    g.rotate(0.6);
    g.fillStyle = lineare(g, -1.5, 0, 1.5, 0, ['#4a3420', '#8a6a44']);
    g.fillRect(-1.5, -14, 3, 30);
    g.fillStyle = lineare(g, 0, -16, 12, -4, ['#e0e4e8', '#7a8088']);
    g.beginPath();
    g.moveTo(1, -15);
    g.quadraticCurveTo(14, -16, 13, -4);
    g.quadraticCurveTo(7, -6, 1, -6);
    g.closePath();
    g.fill();
  },
  machete(g) {
    g.rotate(0.7);
    rett(g, -2, 6, 4, 10, '#1a1a1a');
    g.fillStyle = lineare(g, -3, 0, 4, 0, ['#eef1f4', '#8a9098']);
    g.beginPath();
    g.moveTo(-2.5, 6);
    g.lineTo(-2.5, -15);
    g.quadraticCurveTo(5, -10, 3.5, 6);
    g.closePath();
    g.fill();
  },
  balestra(g) {
    g.fillStyle = lineare(g, -2, 0, 2, 0, ['#4a3420', '#8a6a44']);
    g.fillRect(-2, -10, 4, 24);
    g.strokeStyle = '#5a4028';
    g.lineWidth = 3;
    g.beginPath();
    g.arc(0, 2, 14, Math.PI * 1.15, Math.PI * 1.85);
    g.stroke();
    g.strokeStyle = '#d8d0b8';
    g.lineWidth = 0.8;
    g.beginPath();
    g.moveTo(-12, -4);
    g.lineTo(0, 4);
    g.lineTo(12, -4);
    g.stroke();
  },
  pistola(g) {
    g.fillStyle = lineare(g, 0, -8, 0, 0, ['#3a3c40', '#16171a']);
    g.fillRect(-12, -8, 22, 7);
    g.fillStyle = '#1e1f22';
    g.beginPath();
    g.moveTo(-2, -1);
    g.lineTo(6, -1);
    g.lineTo(4, 12);
    g.lineTo(-4, 12);
    g.closePath();
    g.fill();
    g.strokeStyle = '#1e1f22';
    g.lineWidth = 1.5;
    g.beginPath();
    g.arc(-4, 1, 4, 0, Math.PI);
    g.stroke();
  },
  barricata(g) {
    for (const x of [-11, 0, 11]) rett(g, x - 2, -13, 4, 26, '#4f3a26');
    g.fillStyle = '#8a6a44';
    for (const y of [-8, 0, 8]) g.fillRect(-15, y - 2.5, 30, 5);
    g.save();
    g.rotate(0.5);
    g.fillRect(-17, -2, 34, 4);
    g.restore();
  },
  muro(g) {
    for (let x = -14; x < 14; x += 2) {
      const v = 110 + Math.sin(x * 1.6) * 40;
      g.fillStyle = `rgb(${v},${v + 4},${v + 8})`;
      g.fillRect(x, -12, 2, 24);
    }
    g.fillStyle = 'rgba(140,70,25,0.5)';
    g.beginPath();
    g.ellipse(5, 5, 6, 4, 0.3, 0, TAU);
    g.fill();
  },
  trappola(g) {
    g.fillStyle = '#7a5c3c';
    g.beginPath();
    g.moveTo(-15, 8);
    g.lineTo(-8, -4);
    g.lineTo(15, -4);
    g.lineTo(8, 8);
    g.closePath();
    g.fill();
    g.fillStyle = '#b0b6bc';
    for (const [x, y] of [[-6, 2], [1, 2], [8, 2], [-3, -2], [4, -2]]) {
      g.beginPath();
      g.moveTo(x - 1.5, y);
      g.lineTo(x, y - 9);
      g.lineTo(x + 1.5, y);
      g.fill();
    }
  },
  falo(g) {
    for (const a of [-0.5, 0.5]) {
      g.save();
      g.translate(0, 8);
      g.rotate(a);
      rett(g, -12, -2.5, 24, 5, '#3a2618');
      g.restore();
    }
    g.globalCompositeOperation = 'lighter';
    for (const [h, w, c] of [[24, 9, 'rgba(255,110,20,0.85)'], [16, 5, 'rgba(255,210,90,0.95)']]) {
      const gr = g.createLinearGradient(0, 8, 0, 8 - h);
      gr.addColorStop(0, c);
      gr.addColorStop(1, 'rgba(255,120,20,0)');
      g.fillStyle = gr;
      g.beginPath();
      g.moveTo(-w, 8);
      g.quadraticCurveTo(-w, 8 - h * 0.6, 0, 8 - h);
      g.quadraticCurveTo(w, 8 - h * 0.6, w, 8);
      g.fill();
    }
  },
  raccoglitore(g) {
    g.fillStyle = lineare(g, -9, 0, 9, 0, ['#1e3f66', '#3a6aa0', '#1e3f66']);
    g.fillRect(-9, -2, 18, 16);
    g.fillStyle = '#7d7a5e';
    g.beginPath();
    g.moveTo(-15, -12);
    g.lineTo(15, -12);
    g.lineTo(3, -2);
    g.lineTo(-3, -2);
    g.closePath();
    g.fill();
  },
};

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
