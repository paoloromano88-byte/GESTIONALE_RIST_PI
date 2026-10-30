// Effetti sonori sintetizzati con Web Audio: nessun file audio da scaricare o includere nell'app

let ac = null;
let attivo = true;

export function impostaAudio(si) {
  attivo = si;
}

// Va chiamata da un tocco dell'utente, altrimenti iOS e Android tengono l'audio muto
export function sbloccaAudio() {
  try {
    ac ??= new (window.AudioContext || window.webkitAudioContext)();
    if (ac.state === 'suspended') ac.resume();
  } catch {
    ac = null;
  }
}

function nota(frequenza, { inizio = 0, durata = 0.12, tipo = 'sine', volume = 0.18, fine = frequenza } = {}) {
  if (!attivo || !ac) return;
  const t = ac.currentTime + inizio;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = tipo;
  osc.frequency.setValueAtTime(frequenza, t);
  osc.frequency.exponentialRampToValueAtTime(fine, t + durata);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(volume, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + durata);
  osc.connect(g).connect(ac.destination);
  osc.start(t);
  osc.stop(t + durata + 0.02);
}

export const suona = {
  seleziona() {
    nota(740, { durata: 0.05, tipo: 'sine', volume: 0.1 });
  },
  atterra(i) {
    const f = 300 * Math.pow(1.12, i);
    nota(f, { durata: 0.08, fine: f * 0.6, tipo: 'triangle', volume: 0.16 });
  },
  errore() {
    nota(200, { durata: 0.18, fine: 120, tipo: 'square', volume: 0.07 });
  },
  chiuso() {
    nota(1046, { durata: 0.08, tipo: 'triangle', volume: 0.14 });
    nota(1568, { inizio: 0.07, durata: 0.2, tipo: 'sine', volume: 0.12 });
  },
  vittoria() {
    [523, 659, 784, 1047, 784, 1047].forEach((f, i) => nota(f, { inizio: i * 0.09, durata: 0.2, tipo: 'triangle', volume: 0.15 }));
  },
  aiuto() {
    nota(880, { durata: 0.1, tipo: 'sine' });
    nota(1175, { inizio: 0.08, durata: 0.14, tipo: 'sine' });
  },
  tocco() {
    nota(660, { durata: 0.05, tipo: 'sine', volume: 0.1 });
  },
};
