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
  preso(combo) {
    const f = 520 * Math.pow(1.06, Math.min(combo, 12));
    nota(f, { durata: 0.09, fine: f * 1.5, tipo: 'triangle' });
  },
  errore() {
    nota(220, { durata: 0.28, fine: 90, tipo: 'sawtooth', volume: 0.12 });
  },
  servita() {
    [523, 659, 784, 1047].forEach((f, i) => nota(f, { inizio: i * 0.08, durata: 0.16, tipo: 'triangle', volume: 0.16 }));
  },
  bonus() {
    nota(880, { durata: 0.1, tipo: 'sine' });
    nota(1320, { inizio: 0.08, durata: 0.16, tipo: 'sine' });
  },
  scaduta() {
    nota(440, { durata: 0.15, tipo: 'square', volume: 0.08 });
    nota(330, { inizio: 0.16, durata: 0.25, tipo: 'square', volume: 0.08 });
  },
  fine() {
    [392, 330, 262, 196].forEach((f, i) => nota(f, { inizio: i * 0.14, durata: 0.22, tipo: 'triangle', volume: 0.15 }));
  },
  tocco() {
    nota(660, { durata: 0.05, tipo: 'sine', volume: 0.1 });
  },
};
