import { Partita, CAPIENZA, INGREDIENTI, NOMI, completo } from './logica.js';
import { COLORI, creaSfondo, disegnaOggetto, disegnaBarattoloDietro, disegnaBarattoloDavanti, disegnaCoperchio, disegnaMensola, svuotaCache } from './disegno.js';
import { suona, sbloccaAudio, impostaAudio } from './suoni.js';
import { vibra, impostaVibrazione, leggi, salva, suIndietro } from './nativo.js';

const tela = document.getElementById('banco');
const ctx = tela.getContext('2d');
const $ = (id) => document.getElementById(id);
const parametri = new URLSearchParams(location.search);

let L = 0;
let A = 0;
let dpr = 1;
let sfondo = null;
let partita = null;
let stato = 'menu'; // menu | livelli | gioco | vittoria | bloccato
let livelloMax = 1;
let stelle = {};
const opzioni = { audio: true, vibrazione: true };

// Disposizione dei barattoli sullo schermo, ricalcolata quando cambia il numero o la misura
let posti = [];
let misure = null;

// Animazioni
let selezionato = -1;
let sollevamento = 0;
let voli = [];
const coperchi = new Map();
const scosse = new Map();
const rivelati = new Map();
let suggerimento = null;
let coriandoli = [];

// ---------- Misure e disposizione ----------

function misura() {
  dpr = Math.min(window.devicePixelRatio || 1, 3);
  L = window.innerWidth;
  A = window.innerHeight;
  tela.width = Math.round(L * dpr);
  tela.height = Math.round(A * dpr);
  sfondo = creaSfondo(L, A, dpr);
  svuotaCache();
  if (partita) disponi();
  ridisegna();
}

function areaBanco() {
  const m = getComputedStyle($('margini'));
  const alto = $('barra-alta').hidden ? parseFloat(m.paddingTop) || 0 : $('barra-alta').getBoundingClientRect().bottom;
  const basso = $('barra-bassa').hidden ? A - (parseFloat(m.paddingBottom) || 0) : $('barra-bassa').getBoundingClientRect().top;
  return { x: 0, y: alto, w: L, h: basso - alto };
}

// Proporzioni di un barattolo rispetto alla sua larghezza
const ALTEZZA = 2.95;
const SPAZIO_SOPRA = 0.75;
const MENSOLA = 0.16;

function disponi() {
  const n = partita.barattoli.length;
  const area = areaBanco();
  const margine = 16;
  let migliore = null;
  for (let colonne = Math.min(n, 2); colonne <= Math.min(n, 6); colonne++) {
    const righe = Math.ceil(n / colonne);
    const daLarghezza = (area.w - 2 * margine) / (colonne + 0.38 * (colonne - 1));
    const daAltezza = (area.h - 16) / (righe * (ALTEZZA + SPAZIO_SOPRA + MENSOLA) + (righe - 1) * 0.3);
    const w = Math.min(daLarghezza, daAltezza, 96);
    if (!migliore || w > migliore.w + 0.5) migliore = { colonne, righe, w };
  }
  const { colonne, righe, w } = migliore;
  const h = w * ALTEZZA;
  const passoX = w * 1.38;
  const passoY = w * (ALTEZZA + SPAZIO_SOPRA + MENSOLA + 0.3);
  const altezzaTotale = righe * w * (ALTEZZA + SPAZIO_SOPRA + MENSOLA) + (righe - 1) * w * 0.3;
  const y0 = area.y + (area.h - altezzaTotale) / 2 + w * SPAZIO_SOPRA;
  // Le righe si riempiono in modo equilibrato: 7 barattoli diventano 4 + 3, non 6 + 1
  const perRiga = Array.from({ length: righe }, (_, r) => Math.floor(n / righe) + (r < n % righe ? 1 : 0));
  posti = [];
  const mensole = [];
  perRiga.forEach((quanti, r) => {
    const larghezzaRiga = quanti * w + (quanti - 1) * (passoX - w);
    const x0 = (L - larghezzaRiga) / 2;
    const y = y0 + r * passoY;
    for (let c = 0; c < quanti; c++) posti.push({ x: x0 + c * passoX, y });
    mensole.push({ x: x0 - w * 0.35, y: y + h, w: larghezzaRiga + w * 0.7 });
  });
  misure = { w, h, colonne, mensole, passo: (h - w * 0.16 - w * 0.32) / CAPIENZA, r: w * 0.34 };
}

// Centro del pezzo nella posizione k (0 = fondo) del barattolo i
function centroPosto(i, k) {
  const p = posti[i];
  return { x: p.x + misure.w / 2, y: p.y + misure.h - misure.w * 0.2 - misure.passo * (k + 0.5) };
}

// Di quanto si alza il gruppo in cima al barattolo selezionato
function alzata(i) {
  const b = partita.barattoli[i];
  const cima = centroPosto(i, b.length - 1).y;
  return cima - (posti[i].y - misure.w * 0.38);
}

function barattoloSotto(x, y) {
  const { w, h } = misure;
  return posti.findIndex((p) => x >= p.x - w * 0.19 && x <= p.x + w * 1.19 && y >= p.y - w * SPAZIO_SOPRA && y <= p.y + h + w * MENSOLA);
}

// ---------- Schermate e barre ----------

function mostra(id) {
  for (const s of document.querySelectorAll('.schermata')) s.classList.toggle('attiva', s.id === id);
}

function barre(visibili) {
  $('barra-alta').hidden = !visibili;
  $('barra-bassa').hidden = !visibili;
}

function aggiornaBarre() {
  if (!partita) return;
  $('numero-livello').textContent = partita.numero;
  $('annulla').disabled = !partita.storia.length || partita.vinta;
  $('suggerisci').disabled = partita.suggerimenti <= 0 || partita.vinta;
  $('extra').disabled = partita.barattoliExtra <= 0 || partita.vinta;
  $('conta-aiuti').textContent = partita.suggerimenti;
  $('conta-extra').textContent = partita.barattoliExtra;
}

let timerAvviso = 0;
function avviso(testo) {
  const el = $('avviso');
  el.textContent = testo;
  el.hidden = false;
  clearTimeout(timerAvviso);
  timerAvviso = setTimeout(() => (el.hidden = true), 2600);
}

function azzeraAnimazioni() {
  selezionato = -1;
  sollevamento = 0;
  voli = [];
  coperchi.clear();
  scosse.clear();
  rivelati.clear();
  suggerimento = null;
  coriandoli = [];
}

function gioca(numero) {
  sbloccaAudio();
  suona.tocco();
  partita = new Partita(numero);
  azzeraAnimazioni();
  stato = 'gioco';
  mostra(null);
  barre(true);
  $('avviso').hidden = true;
  disponi();
  aggiornaBarre();
  ridisegna();
  if (numero === 1 && !stelle[1]) avviso('Tocca un barattolo, poi quello dove spostare gli ingredienti in cima.');
}

function alMenu() {
  stato = 'menu';
  partita = null;
  barre(false);
  $('livello-menu').textContent = `Livello ${livelloMax}`;
  mostra('menu');
  disegnaVetrina();
  ridisegna();
}

const STELLA = '<path class="stella" d="M12 2.5l2.9 6 6.6.8-4.9 4.6 1.3 6.5L12 17.2l-5.9 3.2 1.3-6.5-4.9-4.6 6.6-.8z"/>';
const svgStella = (piena) => `<svg viewBox="0 0 24 24" aria-hidden="true">${STELLA.replace('stella"', `stella${piena ? ' piena' : ''}"`)}</svg>`;

function apriLivelli() {
  stato = 'livelli';
  const griglia = $('griglia-livelli');
  griglia.innerHTML = '';
  const fino = Math.max(30, Math.ceil((livelloMax + 5) / 5) * 5);
  for (let n = 1; n <= fino; n++) {
    const b = document.createElement('button');
    b.className = 'livello' + (n === livelloMax ? ' attuale' : '');
    b.disabled = n > livelloMax;
    b.setAttribute('aria-label', `Livello ${n}${stelle[n] ? `, ${stelle[n]} stelle` : ''}`);
    b.innerHTML = `${n}<span class="mini-stelle">${n < livelloMax || stelle[n] ? [1, 2, 3].map((s) => svgStella(s <= (stelle[n] || 0))).join('') : ''}</span>`;
    b.addEventListener('click', () => gioca(n));
    griglia.appendChild(b);
  }
  const totale = Object.values(stelle).reduce((a, b) => a + b, 0);
  $('totale-stelle').textContent = `${totale} stelle su ${(livelloMax - 1) * 3} possibili`;
  mostra('livelli');
}

function vittoria() {
  const s = partita.stelle();
  const n = partita.numero;
  stelle[n] = Math.max(stelle[n] || 0, s);
  livelloMax = Math.max(livelloMax, n + 1);
  salva('progressi', { livelloMax, stelle });
  stato = 'vittoria';
  $('stelle').innerHTML = [1, 2, 3].map((k) => svgStella(k <= s)).join('');
  $('esito').textContent = `Livello ${n} in ${partita.mosse} mosse`;
  $('consiglio').textContent = s === 3 ? '' : s === 2 ? 'Senza aiuti sono tre stelle.' : 'Senza barattolo in più sono almeno due stelle.';
  $('prossimo').textContent = `Livello ${n + 1}`;
  mostra('vittoria');
  aggiornaBarre();
}

function controllaBlocco() {
  if (stato === 'gioco' && partita.bloccata()) {
    stato = 'bloccato';
    $('blocco-annulla').disabled = !partita.storia.length;
    $('blocco-extra').disabled = partita.barattoliExtra <= 0;
    mostra('bloccato');
  }
}

// ---------- Mosse ----------

function chiudiVoli() {
  for (const v of voli) atterra(v);
  voli = [];
}

function tocca(x, y) {
  if (stato !== 'gioco' || !partita || partita.vinta) return;
  const i = barattoloSotto(x, y);
  if (selezionato < 0) {
    if (i < 0) return;
    const b = partita.barattoli[i];
    if (!b.length || completo(b)) {
      scosse.set(i, 0.25);
      return ridisegna();
    }
    chiudiVoli();
    selezionato = i;
    sollevamento = 0;
    suggerimento = null;
    suona.seleziona();
    vibra.leggera();
    return ridisegna();
  }
  if (i < 0 || i === selezionato) {
    selezionato = -1;
    return ridisegna();
  }
  chiudiVoli();
  const da = selezionato;
  const sollevato = alzata(da) * sollevamento;
  const r = partita.sposta(da, i);
  selezionato = -1;
  if (!r) {
    scosse.set(i, 0.35);
    suona.errore();
    vibra.errore();
    return ridisegna();
  }
  suggerimento = null;
  for (let k = 0; k < r.n; k++) {
    const dal = centroPosto(da, r.partenza + k);
    voli.push({
      tipo: r.tipo,
      da: { x: dal.x, y: dal.y - sollevato },
      a: centroPosto(i, r.arrivo + k),
      barattolo: i,
      posto: r.arrivo + k,
      t: -k * 0.06,
      durata: 0.3,
      ultimo: k === r.n - 1 ? r : null,
    });
  }
  if (r.scoperto) rivelati.set(`${da}:${partita.barattoli[da].length - 1}`, 0);
  aggiornaBarre();
  ridisegna();
}

function atterra(v) {
  suona.atterra(v.posto);
  const r = v.ultimo;
  if (!r) return;
  vibra.leggera();
  if (r.chiuso) {
    coperchi.set(r.a, 0);
    suona.chiuso();
    vibra.successo();
  }
  if (r.vinta) {
    setTimeout(festa, 350);
  } else {
    setTimeout(controllaBlocco, 200);
  }
}

function festa() {
  suona.vittoria();
  vibra.successo();
  for (let k = 0; k < 36; k++) {
    coriandoli.push({
      tipo: INGREDIENTI[k % INGREDIENTI.length],
      x: Math.random() * L,
      y: -30 - Math.random() * A * 0.4,
      v: A * (0.5 + Math.random() * 0.5),
      a: Math.random() * 6,
      g: (Math.random() - 0.5) * 6,
      r: 10 + Math.random() * 10,
    });
  }
  ridisegna();
  setTimeout(vittoria, 1100);
}

$('annulla').addEventListener('click', () => {
  if (!partita) return;
  chiudiVoli();
  if (partita.annulla()) {
    selezionato = -1;
    suggerimento = null;
    for (const i of [...coperchi.keys()]) if (!completo(partita.barattoli[i])) coperchi.delete(i);
    suona.tocco();
    aggiornaBarre();
    ridisegna();
  }
});

$('suggerisci').addEventListener('click', () => {
  if (!partita) return;
  chiudiVoli();
  const s = partita.suggerisci();
  if (!s) return avviso('Da qui non si arriva alla fine: annulla qualche mossa o prendi un barattolo in più.');
  selezionato = -1;
  suggerimento = { ...s, t: 0 };
  suona.aiuto();
  aggiornaBarre();
  ridisegna();
});

function aggiungiBarattolo() {
  if (!partita?.aggiungiBarattolo()) return false;
  chiudiVoli();
  selezionato = -1;
  disponi();
  suona.aiuto();
  aggiornaBarre();
  ridisegna();
  return true;
}

$('extra').addEventListener('click', aggiungiBarattolo);
$('ricomincia').addEventListener('click', () => {
  if (!partita) return;
  partita.ricomincia();
  azzeraAnimazioni();
  disponi();
  suona.tocco();
  aggiornaBarre();
  ridisegna();
});
$('indietro').addEventListener('click', alMenu);
$('gioca').addEventListener('click', () => gioca(livelloMax));
$('apri-livelli').addEventListener('click', apriLivelli);
$('chiudi-livelli').addEventListener('click', alMenu);
$('prossimo').addEventListener('click', () => gioca(partita.numero + 1));
$('rigioca').addEventListener('click', () => gioca(partita.numero));
$('menu-vittoria').addEventListener('click', alMenu);

function riprendiDalBlocco() {
  stato = 'gioco';
  mostra(null);
}
$('blocco-annulla').addEventListener('click', () => {
  riprendiDalBlocco();
  $('annulla').click();
});
$('blocco-extra').addEventListener('click', () => {
  riprendiDalBlocco();
  aggiungiBarattolo();
});
$('blocco-ricomincia').addEventListener('click', () => {
  riprendiDalBlocco();
  $('ricomincia').click();
});

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

function aggiornaOpzioni() {
  impostaAudio(opzioni.audio);
  impostaVibrazione(opzioni.vibrazione);
  for (const chiave of ['audio', 'vibrazione']) {
    $(chiave).textContent = `${chiave === 'audio' ? 'Audio' : 'Vibrazione'}: ${opzioni[chiave] ? 'sì' : 'no'}`;
    $(chiave).setAttribute('aria-pressed', opzioni[chiave]);
  }
}

suIndietro(() => {
  if (stato === 'gioco' || stato === 'livelli' || stato === 'vittoria') alMenu();
  else if (stato === 'bloccato') riprendiDalBlocco();
  else return false;
  return true;
});

tela.addEventListener('pointerdown', (e) => {
  sbloccaAudio();
  tocca(e.clientX, e.clientY);
});

// ---------- Disegno ----------

let richiesto = false;
let ultimo = 0;

function ridisegna() {
  if (richiesto) return;
  richiesto = true;
  requestAnimationFrame((ora) => {
    richiesto = false;
    const dt = ultimo ? Math.min((ora - ultimo) / 1000, 0.05) : 0;
    ultimo = ora;
    const ancora = aggiorna(dt);
    disegna(ora / 1000);
    if (ancora) ridisegna();
    else ultimo = 0;
  });
}

// Avanza le animazioni; restituisce true se qualcosa si muove ancora
function aggiorna(dt) {
  let attivo = false;
  if (selezionato >= 0 && sollevamento < 1) {
    sollevamento = Math.min(sollevamento + dt * 9, 1);
    attivo = true;
  }
  for (const v of voli) {
    v.t += dt;
    if (v.t >= v.durata && !v.fatto) {
      v.fatto = true;
      atterra(v);
    }
  }
  voli = voli.filter((v) => !v.fatto);
  if (voli.length) attivo = true;
  for (const [i, k] of coperchi) {
    if (k < 1) {
      coperchi.set(i, Math.min(k + dt * 3.5, 1));
      attivo = true;
    }
  }
  for (const [i, t] of scosse) {
    if (t - dt <= 0) scosse.delete(i);
    else scosse.set(i, t - dt);
    attivo = true;
  }
  for (const [k, t] of rivelati) {
    if (t >= 1) rivelati.delete(k);
    else rivelati.set(k, Math.min(t + dt * 4, 1));
    attivo = true;
  }
  if (suggerimento) {
    suggerimento.t += dt;
    if (suggerimento.t > 3) suggerimento = null;
    attivo = true;
  }
  for (const c of coriandoli) {
    c.y += c.v * dt;
    c.a += c.g * dt;
  }
  coriandoli = coriandoli.filter((c) => c.y < A + 40);
  if (coriandoli.length) attivo = true;
  return attivo;
}

function freccia(da, a, t) {
  const p = centroPosto(da, Math.max(partita.barattoli[da].length - 1, 0));
  const q = posti[a];
  const x1 = p.x;
  const y1 = posti[da].y - misure.w * 0.5;
  const x2 = q.x + misure.w / 2;
  const y2 = q.y - misure.w * 0.3;
  const cy = Math.min(y1, y2) - misure.w * (0.9 + 0.1 * Math.sin(t * 6));
  ctx.save();
  ctx.strokeStyle = '#2f7d5b';
  ctx.lineWidth = Math.max(3, misure.w * 0.07);
  ctx.lineCap = 'round';
  ctx.setLineDash([misure.w * 0.12, misure.w * 0.12]);
  ctx.lineDashOffset = -t * 40;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.quadraticCurveTo((x1 + x2) / 2, cy, x2, y2);
  ctx.stroke();
  ctx.setLineDash([]);
  const ang = Math.atan2(y2 - cy, x2 - (x1 + x2) / 2);
  const s = misure.w * 0.22;
  ctx.fillStyle = '#2f7d5b';
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - Math.cos(ang - 0.5) * s, y2 - Math.sin(ang - 0.5) * s);
  ctx.lineTo(x2 - Math.cos(ang + 0.5) * s, y2 - Math.sin(ang + 0.5) * s);
  ctx.fill();
  ctx.restore();
}

function disegna(t) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.drawImage(sfondo, 0, 0, L, A);
  if (stato === 'menu' || stato === 'livelli' || !partita) return;

  const { w, h, r } = misure;
  for (const m of misure.mensole) disegnaMensola(ctx, m.x, m.y, m.w, w * MENSOLA);

  const inArrivo = new Set(voli.map((v) => `${v.barattolo}:${v.posto}`));
  partita.barattoli.forEach((b, i) => {
    const p = posti[i];
    const scossa = scosse.get(i) || 0;
    const dx = scossa ? Math.sin(scossa * 60) * w * 0.06 * (scossa / 0.35) : 0;
    const x = p.x + dx;
    const evidenza = suggerimento && (suggerimento.da === i || suggerimento.a === i) ? 0.55 + 0.45 * Math.sin(t * 8) : 0;
    disegnaBarattoloDietro(ctx, x, p.y, w, h, evidenza);
    const gruppo = i === selezionato ? gruppoSelezionato(b) : 0;
    b.forEach((pezzo, k) => {
      if (inArrivo.has(`${i}:${k}`)) return;
      const c = centroPosto(i, k);
      const su = k >= b.length - gruppo ? alzata(i) * easeOut(sollevamento) : 0;
      const riv = rivelati.get(`${i}:${k}`);
      const scala = riv === undefined ? 1 : 0.6 + 0.4 * easeOut(riv);
      disegnaOggetto(ctx, pezzo.coperto ? 'coperto' : pezzo.tipo, c.x + dx, c.y - su, r * scala, dpr);
    });
    disegnaBarattoloDavanti(ctx, x, p.y, w, h);
    if (coperchi.has(i) && completo(b)) {
      disegnaCoperchio(ctx, x, p.y, w, easeOut(coperchi.get(i)));
      etichetta(NOMI[b[0].tipo], x + w / 2, p.y + h - w * 0.12, coperchi.get(i));
    }
  });

  for (const v of voli) {
    const k = easeInOut(Math.max(v.t, 0) / v.durata);
    const cx = (v.da.x + v.a.x) / 2;
    const cy = Math.min(v.da.y, v.a.y) - w * 1.1;
    const x = (1 - k) * (1 - k) * v.da.x + 2 * (1 - k) * k * cx + k * k * v.a.x;
    const y = (1 - k) * (1 - k) * v.da.y + 2 * (1 - k) * k * cy + k * k * v.a.y;
    disegnaOggetto(ctx, v.tipo, x, y, r, dpr, Math.sin(k * Math.PI) * 0.5);
  }

  if (suggerimento) freccia(suggerimento.da, suggerimento.a, t);
  for (const c of coriandoli) disegnaOggetto(ctx, c.tipo, c.x, c.y, c.r, dpr, c.a);
}

function gruppoSelezionato(b) {
  let n = 0;
  while (n < b.length && b[b.length - 1 - n].tipo === b[b.length - 1].tipo && !b[b.length - 1 - n].coperto) n++;
  return n;
}

function etichetta(testo, x, y, k) {
  ctx.save();
  ctx.globalAlpha = Math.min(k * 2, 1);
  const s = Math.max(9, misure.w * 0.15);
  ctx.font = `800 ${s}px ${getComputedStyle(document.body).fontFamily}`;
  const lw = Math.min(ctx.measureText(testo).width + s, misure.w * 1.05);
  ctx.fillStyle = '#fffaf2';
  ctx.strokeStyle = 'rgba(60,40,20,0.25)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.rect(x - lw / 2, y - s * 0.85, lw, s * 1.5);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#2f2a26';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(testo, x, y - s * 0.08, misure.w);
  ctx.restore();
}

const easeOut = (k) => 1 - Math.pow(1 - k, 3);
const easeInOut = (k) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);

// Vetrina del menu: tre barattoli chiusi, i colori della bandiera
function disegnaVetrina() {
  const c = document.querySelector('.vetrina');
  const lw = c.clientWidth || 220;
  const lh = c.clientHeight || 144;
  const k = window.devicePixelRatio || 1;
  c.width = Math.round(lw * k);
  c.height = Math.round(lh * k);
  const g = c.getContext('2d');
  g.scale(k, k);
  const w = lh / 3.4;
  const h = w * ALTEZZA;
  const passo = w * 1.45;
  const x0 = lw / 2 - passo - w / 2;
  const y = lh - h - w * 0.32;
  disegnaMensola(g, x0 - w * 0.4, y + h, passo * 2 + w * 1.8, w * 0.2);
  ['pomodoro', 'mozzarella', 'basilico'].forEach((tipo, i) => {
    const x = x0 + i * passo;
    disegnaBarattoloDietro(g, x, y, w, h);
    const passoP = (h - w * 0.16 - w * 0.32) / CAPIENZA;
    for (let p = 0; p < CAPIENZA; p++) disegnaOggetto(g, tipo, x + w / 2, y + h - w * 0.2 - passoP * (p + 0.5), w * 0.34, k);
    disegnaBarattoloDavanti(g, x, y, w, h);
    disegnaCoperchio(g, x, y, w, 1);
  });
}

// ---------- Avvio ----------

window.addEventListener('resize', () => {
  misura();
  if (stato === 'menu') disegnaVetrina();
});
misura();
disegnaVetrina();
aggiornaOpzioni();

Promise.all([leggi('progressi', null), leggi('opzioni', opzioni)]).then(([p, o]) => {
  if (p) {
    livelloMax = Math.max(1, Number(p.livelloMax) || 1);
    stelle = p.stelle || {};
  }
  Object.assign(opzioni, o);
  aggiornaOpzioni();
  if (stato === 'menu') $('livello-menu').textContent = `Livello ${livelloMax}`;
});

if (parametri.has('debug')) {
  window.miseEnPlace = { partita: () => partita, stato: () => stato, gioca, posti: () => posti, misure: () => misure };
}
