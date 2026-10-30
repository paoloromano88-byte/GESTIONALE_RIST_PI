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
  raccogli() {
    nota(620, { durata: 0.07, fine: 900, tipo: 'triangle', volume: 0.12 });
  },
  colpo() {
    nota(140, { durata: 0.09, fine: 70, tipo: 'square', volume: 0.08 });
  },
  colpito() {
    nota(260, { durata: 0.08, fine: 120, tipo: 'sawtooth', volume: 0.1 });
  },
  sconfitto() {
    nota(500, { durata: 0.15, fine: 80, tipo: 'triangle', volume: 0.14 });
    nota(900, { inizio: 0.05, durata: 0.1, fine: 300, tipo: 'sine', volume: 0.08 });
  },
  ferito() {
    nota(180, { durata: 0.22, fine: 90, tipo: 'sawtooth', volume: 0.12 });
  },
  crea() {
    [660, 880, 1320].forEach((f, i) => nota(f, { inizio: i * 0.06, durata: 0.12, tipo: 'triangle', volume: 0.12 }));
  },
  mangia() {
    nota(300, { durata: 0.06, fine: 200, tipo: 'square', volume: 0.06 });
    nota(280, { inizio: 0.12, durata: 0.06, fine: 180, tipo: 'square', volume: 0.06 });
  },
  notte() {
    [392, 311, 262].forEach((f, i) => nota(f, { inizio: i * 0.22, durata: 0.5, tipo: 'sine', volume: 0.12 }));
  },
  alba() {
    [523, 659, 784, 1047].forEach((f, i) => nota(f, { inizio: i * 0.1, durata: 0.25, tipo: 'triangle', volume: 0.13 }));
  },
  fine() {
    [392, 330, 262, 196].forEach((f, i) => nota(f, { inizio: i * 0.16, durata: 0.3, tipo: 'triangle', volume: 0.14 }));
  },
  tocco() {
    nota(660, { durata: 0.05, tipo: 'sine', volume: 0.1 });
  },
};
