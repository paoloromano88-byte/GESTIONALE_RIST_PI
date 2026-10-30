import { Partita, NOMI, VITE_INIZIALI, creaCasuale } from './logica.js';
import { COLORI, creaSfondo, disegnaOggetto, disegnaPala, disegnaPizza, svuotaCache } from './disegno.js';
import { suona, sbloccaAudio, impostaAudio } from './suoni.js';
import { vibra, impostaVibrazione, leggi, salva, suIndietro, suSecondoPiano } from './nativo.js';

const FONT = getComputedStyle(document.documentElement).getPropertyValue('--carattere') || 'system-ui, sans-serif';
const tela = document.getElementById('gioco');
const ctx = tela.getContext('2d');
const $ = (id) => document.getElementById(id);
const parametri = new URLSearchParams(location.search);

let L = 0;
let A = 0;
let dpr = 1;
let sfondo = null;
let hud = null;
let partita = null;
let stato = 'menu'; // menu | gioco | pausa | fine
let record = 0;
let nuovoRecord = false;
const opzioni = { audio: true, vibrazione: true };
const effetti = { scritte: [], particelle: [], scossa: 0, lampo: 0 };
const demo = [];

// ---------- Misure dello schermo ----------

function misura() {
  dpr = Math.min(window.devicePixelRatio || 1, 3);
  L = window.innerWidth;
  A = window.innerHeight;
  tela.width = Math.round(L * dpr);
  tela.height = Math.round(A * dpr);
  const m = getComputedStyle($('margini'));
  const alto = parseFloat(m.paddingTop) || 0;
  const basso = parseFloat(m.paddingBottom) || 0;
  const s = Math.min(Math.max(L / 390, 0.82), 1.5);
  const y0 = alto + 8 * s;
  hud = {
    s,
    alto,
    basso,
    riga: { y: y0, h: 40 * s },
    scheda: { x: 12 * s, y: y0 + 46 * s, w: L - 24 * s, h: 78 * s },
  };
  hud.fondo = hud.scheda.y + hud.scheda.h + 6 * s;
  hud.pausa = { x: L - 12 * s - 40 * s, y: y0, w: 40 * s, h: 40 * s };
  sfondo = creaSfondo(L, A, dpr);
  svuotaCache();
  partita?.ridimensiona(L, altezzaGioco());
}

// La partita si svolge sotto la comanda e sopra la barra dei gesti
const altezzaGioco = () => A - hud.fondo - hud.basso;

// ---------- Schermate ----------

function mostra(id) {
  for (const s of document.querySelectorAll('.schermata')) s.classList.toggle('attiva', s.id === id);
}

function formato(n) {
  return Math.round(n).toLocaleString('it-IT');
}

function nuovaPartita() {
  sbloccaAudio();
  suona.tocco();
  const seme = parametri.get('seme');
  partita = new Partita({ larghezza: L, altezza: altezzaGioco(), casuale: seme ? creaCasuale(Number(seme)) : Math.random });
  effetti.scritte = [];
  effetti.particelle = [];
  effetti.scossa = effetti.lampo = 0;
  nuovoRecord = false;
  stato = 'gioco';
  mostra(null);
}

function pausa() {
  if (stato !== 'gioco') return;
  stato = 'pausa';
  mostra('pausa');
}

function riprendi() {
  sbloccaAudio();
  stato = 'gioco';
  mostra(null);
}

function alMenu() {
  stato = 'menu';
  partita = null;
  $('record-menu').textContent = formato(record);
  mostra('menu');
}

function finePartita() {
  stato = 'fine';
  if (partita.punti > record) {
    record = partita.punti;
    nuovoRecord = record > 0;
    salva('record', record);
  }
  setTimeout(() => {
    if (stato !== 'fine') return;
    $('punti-fine').textContent = formato(partita.punti);
    $('pizze-fine').textContent = partita.pizzeServite;
    $('record-fine').textContent = formato(record);
    $('nuovo-record').hidden = !nuovoRecord;
    $('titolo-fine').textContent = partita.pizzeServite >= 10 ? 'Pizzaiolo leggendario!' : partita.pizzeServite >= 4 ? 'Ottimo servizio!' : 'Forno spento!';
    mostra('fine');
  }, 900);
}

function aggiornaOpzioni() {
  impostaAudio(opzioni.audio);
  impostaVibrazione(opzioni.vibrazione);
  $('audio').textContent = `Audio: ${opzioni.audio ? 'sì' : 'no'}`;
  $('audio').setAttribute('aria-pressed', opzioni.audio);
  $('vibrazione').textContent = `Vibrazione: ${opzioni.vibrazione ? 'sì' : 'no'}`;
  $('vibrazione').setAttribute('aria-pressed', opzioni.vibrazione);
}

$('gioca').addEventListener('click', nuovaPartita);
$('ancora').addEventListener('click', nuovaPartita);
$('riprendi').addEventListener('click', riprendi);
$('esci').addEventListener('click', alMenu);
$('menu-fine').addEventListener('click', alMenu);
for (const chiave of ['audio', 'vibrazione']) {
  $(chiave).addEventListener('click', () => {
    opzioni[chiave] = !opzioni[chiave];
    aggiornaOpzioni();
    salva('opzioni', opzioni);
    sbloccaAudio();
    suona.tocco();
    if (chiave === 'vibrazione') vibra.leggera();
  });
}

suIndietro(() => {
  if (stato === 'gioco') pausa();
  else if (stato === 'pausa') riprendi();
  else if (stato === 'fine') alMenu();
  else return false;
  return true;
});
suSecondoPiano(pausa);

// ---------- Comandi: si trascina il dito, la pala segue lo spostamento ----------

let trascina = null;
const tasti = new Set();

function dentro(r, x, y) {
  return x >= r.x - 8 && x <= r.x + r.w + 8 && y >= r.y - 8 && y <= r.y + r.h + 8;
}

tela.addEventListener('pointerdown', (e) => {
  if (stato !== 'gioco') return;
  if (dentro(hud.pausa, e.clientX, e.clientY)) return pausa();
  trascina = { id: e.pointerId, dito: e.clientX, pala: partita.pizza.obiettivo };
  tela.setPointerCapture?.(e.pointerId);
});

tela.addEventListener('pointermove', (e) => {
  if (stato !== 'gioco' || !trascina || e.pointerId !== trascina.id) return;
  partita.muoviVerso(trascina.pala + (e.clientX - trascina.dito) * 1.3);
});

for (const tipo of ['pointerup', 'pointercancel']) {
  tela.addEventListener(tipo, (e) => {
    if (trascina?.id === e.pointerId) trascina = null;
  });
}

window.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') tasti.add(e.key);
  if (e.key === 'Escape' || e.key === 'p') stato === 'gioco' ? pausa() : stato === 'pausa' && riprendi();
});
window.addEventListener('keyup', (e) => tasti.delete(e.key));

// ---------- Effetti (scritte, particelle, scossa) ----------

function scritta(testo, x, y, { colore = '#fff', dimensione = 22, durata = 0.9, sale = 60 } = {}) {
  effetti.scritte.push({ testo, x, y, colore, dimensione: dimensione * hud.s, durata, t: 0, sale });
}

function scoppio(x, y, colore, quanti = 10) {
  for (let i = 0; i < quanti; i++) {
    const a = Math.random() * Math.PI * 2;
    const v = (80 + Math.random() * 160) * hud.s;
    effetti.particelle.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 80 * hud.s, r: (2 + Math.random() * 3) * hud.s, colore, t: 0, durata: 0.5 + Math.random() * 0.3 });
  }
}

function gestisciEventi(eventi) {
  const centro = altezzaGioco() * 0.42;
  for (const e of eventi) {
    switch (e.tipo) {
      case 'preso':
        scritta(`+${e.guadagno}`, e.x, e.y - 20, { colore: e.combo >= 3 ? '#ffd166' : '#fff' });
        scoppio(e.x, e.y, COLORI[e.oggetto]);
        suona.preso(e.combo);
        vibra.leggera();
        break;
      case 'errore':
        scritta(e.oggetto === 'ananas' ? "Niente ananas!" : `${NOMI[e.oggetto]}? Non serve!`, L / 2, centro, { colore: '#ff6b6b', dimensione: 28, durata: 1.1, sale: 30 });
        scoppio(e.x, e.y, '#ff3b3b', 14);
        effetti.scossa = 0.35;
        effetti.lampo = 0.3;
        suona.errore();
        vibra.errore();
        break;
      case 'bonus':
        scritta(e.oggetto === 'cuore' ? '+1 vita' : 'Rallenta!', e.x, e.y - 24, { colore: '#ffd166', dimensione: 26 });
        scoppio(e.x, e.y, '#ffd166', 16);
        suona.bonus();
        vibra.leggera();
        break;
      case 'ignorato':
        scoppio(e.x, e.y, 'rgba(255,255,255,0.6)', 5);
        break;
      case 'servita':
        scritta('Pizza servita!', L / 2, centro, { colore: '#ffd166', dimensione: 34, durata: 1.3, sale: 40 });
        scritta(`+${e.bonus}`, L / 2, centro + 40 * hud.s, { colore: '#fff', dimensione: 26, durata: 1.3, sale: 40 });
        suona.servita();
        vibra.successo();
        break;
      case 'scaduta':
        scritta('Tempo scaduto!', L / 2, centro, { colore: '#ff6b6b', dimensione: 30, durata: 1.2, sale: 30 });
        effetti.scossa = 0.35;
        effetti.lampo = 0.3;
        suona.scaduta();
        vibra.errore();
        break;
      case 'fine':
        suona.fine();
        finePartita();
        break;
    }
  }
}

function aggiornaEffetti(dt) {
  effetti.scossa = Math.max(effetti.scossa - dt, 0);
  effetti.lampo = Math.max(effetti.lampo - dt, 0);
  for (const s of effetti.scritte) s.t += dt;
  effetti.scritte = effetti.scritte.filter((s) => s.t < s.durata);
  for (const p of effetti.particelle) {
    p.t += dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 500 * hud.s * dt;
  }
  effetti.particelle = effetti.particelle.filter((p) => p.t < p.durata);
}

// ---------- Disegno ----------

function rettangoloTondo(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function testo(t, x, y, { dimensione = 16, peso = 800, colore = '#fff', allinea = 'left', base = 'alphabetic', ombra = false } = {}) {
  ctx.font = `${peso} ${dimensione}px ${FONT}`;
  ctx.textAlign = allinea;
  ctx.textBaseline = base;
  if (ombra) {
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillText(t, x, y + dimensione * 0.08);
  }
  ctx.fillStyle = colore;
  ctx.fillText(t, x, y);
}

function disegnaHud() {
  const { s, riga, scheda } = hud;
  const p = partita;

  testo('PUNTI', 14 * s, riga.y + 12 * s, { dimensione: 11 * s, colore: 'rgba(255,243,224,0.7)' });
  testo(formato(p.punti), 14 * s, riga.y + 37 * s, { dimensione: 26 * s, peso: 900, ombra: true });

  // Vite: cuori pieni e (fino a 3) cuori spenti
  const rc = 11 * s;
  const posti = Math.max(p.vite, VITE_INIZIALI);
  for (let i = 0; i < posti; i++) {
    const x = hud.pausa.x - 16 * s - i * rc * 2.1;
    ctx.globalAlpha = i < p.vite ? 1 : 0.25;
    disegnaOggetto(ctx, 'cuore', x, riga.y + riga.h / 2, rc, dpr);
  }
  ctx.globalAlpha = 1;

  // Pulsante pausa
  const b = hud.pausa;
  ctx.fillStyle = 'rgba(255,243,224,0.14)';
  rettangoloTondo(b.x, b.y, b.w, b.h, b.w / 2);
  ctx.fill();
  ctx.fillStyle = '#fff3e0';
  ctx.fillRect(b.x + b.w * 0.34, b.y + b.h * 0.3, b.w * 0.11, b.h * 0.4);
  ctx.fillRect(b.x + b.w * 0.55, b.y + b.h * 0.3, b.w * 0.11, b.h * 0.4);

  // Scheda della comanda
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.4)';
  ctx.shadowBlur = 12 * s;
  ctx.shadowOffsetY = 4 * s;
  ctx.fillStyle = '#fff3e0';
  rettangoloTondo(scheda.x, scheda.y, scheda.w, scheda.h, 14 * s);
  ctx.fill();
  ctx.restore();
  testo(`COMANDA ${p.pizzeServite + 1}`, scheda.x + 12 * s, scheda.y + 17 * s, { dimensione: 11 * s, colore: '#9d1c24' });
  if (p.combo >= 3) testo(`COMBO x${Math.min(p.combo, 10)}`, scheda.x + scheda.w - 12 * s, scheda.y + 17 * s, { dimensione: 11 * s, colore: '#e85d04', allinea: 'right' });
  else if (p.rallenta > 0) testo(`RALLENTA ${Math.ceil(p.rallenta)}s`, scheda.x + scheda.w - 12 * s, scheda.y + 17 * s, { dimensione: 11 * s, colore: '#3a86ff', allinea: 'right' });

  const c = p.comanda;
  const tipi = Object.keys(c.richiesti);
  const passo = Math.min(66 * s, (scheda.w - 16 * s) / tipi.length);
  const x0 = scheda.x + scheda.w / 2 - (passo * tipi.length) / 2 + passo / 2;
  const yi = scheda.y + 43 * s;
  tipi.forEach((t, i) => {
    const x = x0 + i * passo;
    const resta = c.richiesti[t] - c.presi[t];
    ctx.globalAlpha = resta ? 1 : 0.4;
    disegnaOggetto(ctx, t, x - 9 * s, yi, 15 * s, dpr);
    ctx.globalAlpha = 1;
    if (resta) testo(`${resta}`, x + 14 * s, yi + 6 * s, { dimensione: 18 * s, peso: 900, colore: '#3d1f10', allinea: 'center' });
    else testo('✓', x + 14 * s, yi + 7 * s, { dimensione: 20 * s, peso: 900, colore: '#2d6a4f', allinea: 'center' });
  });

  // Tempo della comanda
  const q = Math.max(c.tempo / c.tempoTotale, 0);
  const bx = scheda.x + 12 * s;
  const bw = scheda.w - 24 * s;
  const by = scheda.y + scheda.h - 14 * s;
  ctx.fillStyle = 'rgba(61,31,16,0.15)';
  rettangoloTondo(bx, by, bw, 6 * s, 3 * s);
  ctx.fill();
  ctx.fillStyle = q > 0.5 ? '#40916c' : q > 0.25 ? '#f4a261' : '#e63946';
  if (q > 0) {
    rettangoloTondo(bx, by, Math.max(bw * q, 6 * s), 6 * s, 3 * s);
    ctx.fill();
  }
}

function disegnaPartita(t) {
  const p = partita;
  const R = p.raggioPizza;
  ctx.save();
  ctx.translate(0, hud.fondo);
  // Gli oggetti nascono sotto la comanda
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, L, A);
  ctx.clip();
  for (const o of p.oggetti) disegnaOggetto(ctx, o.tipo, p.xOggetto(o), o.y, p.raggioOggetto, dpr, o.tipo === 'ananas' ? 0 : o.angolo);
  ctx.restore();

  disegnaPala(ctx, p.pizza.x, p.yPizza, R, A - hud.fondo);
  if (p.attesaUscita > 0) {
    // La pizza finita vola verso il cliente, sulla pala ne compare una nuova
    const k = 1 - p.attesaUscita / 1.1;
    ctx.globalAlpha = Math.min(k * 2, 1);
    disegnaPizza(ctx, p.pizza.x, p.yPizza, R, [], dpr, 0.6 + 0.4 * Math.min(k * 2, 1));
    ctx.globalAlpha = 1;
    disegnaPizza(ctx, p.pizza.x, p.yPizza - k * k * (p.yPizza + R * 2), R, p.condimenti, dpr, 1 - k * 0.3);
  } else {
    disegnaPizza(ctx, p.pizza.x, p.yPizza, R, p.condimenti, dpr);
  }

  for (const q of effetti.particelle) {
    ctx.globalAlpha = 1 - q.t / q.durata;
    ctx.beginPath();
    ctx.arc(q.x, q.y, q.r, 0, Math.PI * 2);
    ctx.fillStyle = q.colore;
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  for (const s of effetti.scritte) {
    const k = s.t / s.durata;
    ctx.globalAlpha = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
    const zoom = k < 0.12 ? 0.6 + (k / 0.12) * 0.4 : 1;
    testo(s.testo, s.x, s.y - s.sale * hud.s * k, { dimensione: s.dimensione * zoom, peso: 900, colore: s.colore, allinea: 'center', base: 'middle', ombra: true });
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  // Ultimi secondi della comanda: il bordo dello schermo lampeggia
  const c = p.comanda;
  if (p.attesaUscita <= 0 && c.tempo < 4 && !p.finita) {
    ctx.strokeStyle = `rgba(230,57,70,${0.35 + 0.35 * Math.sin(t * 12)})`;
    ctx.lineWidth = 8 * hud.s;
    ctx.strokeRect(0, 0, L, A);
  }
  if (p.rallenta > 0) {
    ctx.fillStyle = 'rgba(76,201,240,0.08)';
    ctx.fillRect(0, 0, L, A);
  }
}

function disegnaDemo(dt) {
  // Nel menu cadono ingredienti dietro al titolo
  if (demo.length < 9 && Math.random() < dt * 2) {
    const tipi = Object.keys(COLORI);
    demo.push({ tipo: tipi[Math.floor(Math.random() * tipi.length)], x: Math.random() * L, y: -40, v: 40 + Math.random() * 60, a: Math.random() * 6, g: Math.random() - 0.5 });
  }
  for (const o of demo) {
    o.y += o.v * dt;
    o.a += o.g * dt;
    disegnaOggetto(ctx, o.tipo, o.x, o.y, 24 * hud.s, dpr, o.a);
  }
  for (let i = demo.length - 1; i >= 0; i--) if (demo[i].y > A + 40) demo.splice(i, 1);
}

let ultimo = performance.now();

function ciclo(ora) {
  const dt = Math.min((ora - ultimo) / 1000, 0.05);
  ultimo = ora;

  if (stato === 'gioco') {
    if (tasti.size) {
      const dir = (tasti.has('ArrowRight') ? 1 : 0) - (tasti.has('ArrowLeft') ? 1 : 0);
      partita.muoviVerso(partita.pizza.obiettivo + dir * L * 1.4 * dt);
    }
    partita.aggiorna(dt);
    gestisciEventi(partita.prendiEventi());
  }
  if (stato === 'gioco' || stato === 'fine') aggiornaEffetti(dt);

  if (stato !== 'pausa') {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.drawImage(sfondo, 0, 0, L, A);
    if (partita) {
      ctx.save();
      if (effetti.scossa > 0) {
        const f = effetti.scossa * 22 * hud.s;
        ctx.translate((Math.random() - 0.5) * f, (Math.random() - 0.5) * f);
      }
      disegnaPartita(ora / 1000);
      ctx.restore();
      disegnaHud();
      if (effetti.lampo > 0) {
        ctx.fillStyle = `rgba(230,57,70,${effetti.lampo})`;
        ctx.fillRect(0, 0, L, A);
      }
    } else {
      disegnaDemo(dt);
    }
  }
  requestAnimationFrame(ciclo);
}

// ---------- Avvio ----------

function disegnaIcone() {
  for (const c of document.querySelectorAll('canvas[data-tipo]')) {
    const lato = c.clientWidth || c.width;
    const k = window.devicePixelRatio || 1;
    c.width = c.height = Math.round(lato * k);
    const g = c.getContext('2d');
    g.scale(k, k);
    const tipo = c.dataset.tipo;
    if (tipo === 'logo' || tipo === 'pizza') {
      const R = lato * 0.45;
      const cond =
        tipo === 'logo'
          ? [
              ['mozzarella', -0.35, -0.3], ['pomodoro', 0.3, -0.35], ['basilico', 0, 0.05], ['salame', -0.4, 0.3],
              ['funghi', 0.38, 0.28], ['olive', 0.05, -0.55], ['peperoncino', 0.05, 0.55], ['mozzarella', 0.55, -0.02], ['olive', -0.6, -0.02],
            ]
          : [['mozzarella', -0.3, -0.2], ['basilico', 0.3, 0.2]];
      disegnaPizza(g, lato / 2, lato / 2, R, cond.map(([t, x, y], i) => ({ tipo: t, dx: x * R, dy: y * R, angolo: i * 1.7 })), k, 1, 0.27);
    } else {
      disegnaOggetto(g, tipo, lato / 2, lato / 2, lato * 0.4, k);
    }
  }
}

window.addEventListener('resize', misura);
misura();
disegnaIcone();
aggiornaOpzioni();
requestAnimationFrame(ciclo);

Promise.all([leggi('record', 0), leggi('opzioni', opzioni)]).then(([r, o]) => {
  record = Number(r) || 0;
  Object.assign(opzioni, o);
  aggiornaOpzioni();
  $('record-menu').textContent = formato(record);
});

if (parametri.has('debug')) {
  window.pizzaAlVolo = { partita: () => partita, stato: () => stato, nuovaPartita, pausa };
}
