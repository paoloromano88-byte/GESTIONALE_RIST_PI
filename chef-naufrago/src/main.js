import { Gioco, ATTREZZI, COSTRUZIONI, CIBI, RICETTE, RISORSE, FUOCO, GIORNO, NOTTE_DEL_BOSS, haAbbastanza } from './logica.js';
import { Disegnatore } from './disegno.js';
import { icona } from './icone.js';
import { suona, sbloccaAudio, impostaAudio } from './suoni.js';
import { vibra, impostaVibrazione, leggi, salva, suIndietro, suSecondoPiano } from './nativo.js';

const tela = document.getElementById('isola');
const ctx = tela.getContext('2d');
const disegnatore = new Disegnatore(ctx);
const $ = (id) => document.getElementById(id);
const parametri = new URLSearchParams(location.search);

let L = 0;
let A = 0;
let dpr = 1;
let gioco = null;
let stato = 'menu'; // menu | gioco | pannello | pausa | fine
let record = 0;
let salvataggio = null;
const opzioni = { audio: true, vibrazione: true };
const cam = { x: 0, y: 0 };
const effetti = { scritte: [], particelle: [], scossa: 0, bersaglio: null, attrezzo: null };
const comandi = { mx: 0, my: 0, azione: false };
// Un tocco rapido sul tasto azione resta in attesa finché l'azione non parte davvero
let tocchiInAttesa = 0;
const tasti = new Set();
let consigli = {};
let daUltimoSalvataggio = 0;

const COLORI = {
  legna: '#a8683a',
  pietra: '#a9a6b9',
  pomodoro: '#ff4040',
  grano: '#ffd34d',
  fungo: '#b9652a',
  polpetta: '#9a5532',
  cipolla: '#b46bb8',
  peperoncino: '#ff7b00',
  polpettone: '#7d4024',
};

// ---------- Schermo ----------

function misura() {
  dpr = Math.min(window.devicePixelRatio || 1, 3);
  L = window.innerWidth;
  A = window.innerHeight;
  tela.width = Math.round(L * dpr);
  tela.height = Math.round(A * dpr);
  const zoom = Math.min(Math.max(Math.min(L, A) / 380, 0.9), 1.8);
  disegnatore.imposta(L, A, dpr, zoom);
}

function mostra(id) {
  for (const s of document.querySelectorAll('.schermata')) s.classList.toggle('attiva', s.id === id);
}

let timerAvviso = 0;
function avviso(testo, durata = 3200) {
  const el = $('avviso');
  el.textContent = testo;
  el.hidden = false;
  clearTimeout(timerAvviso);
  timerAvviso = setTimeout(() => (el.hidden = true), durata);
}

function consiglio(chiave, testo, durata) {
  if (consigli[chiave]) return;
  consigli[chiave] = true;
  avviso(testo, durata);
}

// ---------- Partita ----------

function avvia(g) {
  gioco = g;
  cam.x = gioco.chef.x;
  cam.y = gioco.chef.y;
  effetti.scritte = [];
  effetti.particelle = [];
  daUltimoSalvataggio = 0;
  consigli = g.giorno > 1 || g.strutture.length ? { muoversi: true, falo: true } : {};
  stato = 'gioco';
  mostra(null);
  $('hud').hidden = false;
  aggiornaPiazzamento();
  consiglio('muoversi', 'Trascina il dito per camminare. Tieni premuto il tasto rotondo per raccogliere e colpire.', 5000);
}

function nuovaPartita() {
  sbloccaAudio();
  suona.tocco();
  const seme = parametri.get('seme');
  avvia(new Gioco({ seme: seme ? Number(seme) : Math.floor(Math.random() * 1e9) }));
  salvaPartita();
}

function continua() {
  sbloccaAudio();
  suona.tocco();
  avvia(Gioco.carica(salvataggio));
}

function salvaPartita() {
  if (!gioco || gioco.morto) return;
  salvataggio = gioco.salva();
  salva('partita', salvataggio);
  daUltimoSalvataggio = 0;
}

function alMenu() {
  salvaPartita();
  stato = 'menu';
  gioco = null;
  $('hud').hidden = true;
  $('avviso').hidden = true;
  aggiornaMenu();
  mostra('menu');
}

function pausa() {
  if (stato !== 'gioco') return;
  comandi.azione = false;
  salvaPartita();
  stato = 'pausa';
  $('riepilogo').textContent = `Giorno ${gioco.giorno} · ${gioco.statistiche.sconfitti} mostri sconfitti · ${gioco.statistiche.pizze} pizze sfornate`;
  mostra('pausa-schermata');
}

function riprendi() {
  sbloccaAudio();
  stato = 'gioco';
  mostra(null);
}

function finePartita() {
  const giorni = gioco.giorno;
  const nuovo = giorni > record;
  record = Math.max(record, giorni);
  salva('record', record);
  salva('partita', null);
  salvataggio = null;
  setTimeout(() => {
    stato = 'fine';
    $('esito').textContent = `Hai resistito fino al giorno ${giorni}: ${gioco.statistiche.sconfitti} mostri sconfitti e ${gioco.statistiche.pizze} pizze sfornate.`;
    $('nuovo-record').hidden = !nuovo;
    mostra('fine');
  }, 1400);
}

function aggiornaMenu() {
  $('record').textContent = record;
  $('continua').hidden = !salvataggio;
  if (salvataggio) $('continua-giorno').textContent = `Giorno ${salvataggio.giorno}`;
  $('nuova').textContent = 'Nuova isola';
  confermaNuova = false;
}

let confermaNuova = false;
$('nuova').addEventListener('click', () => {
  // C'è una partita salvata: il primo tocco chiede conferma
  if (salvataggio && !confermaNuova) {
    confermaNuova = true;
    $('nuova').textContent = 'Sicuro? Tocca ancora';
    setTimeout(aggiornaMenu, 3000);
    return;
  }
  nuovaPartita();
});
$('continua').addEventListener('click', continua);
$('pausa').addEventListener('click', pausa);
$('riprendi').addEventListener('click', riprendi);
$('salva-esci').addEventListener('click', alMenu);
$('ancora').addEventListener('click', nuovaPartita);
$('menu-fine').addEventListener('click', () => {
  gioco = null;
  stato = 'menu';
  $('hud').hidden = true;
  aggiornaMenu();
  mostra('menu');
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
  $('audio').textContent = `Audio: ${opzioni.audio ? 'sì' : 'no'}`;
  $('audio').setAttribute('aria-pressed', opzioni.audio);
  $('vibrazione').textContent = `Vibrazione: ${opzioni.vibrazione ? 'sì' : 'no'}`;
  $('vibrazione').setAttribute('aria-pressed', opzioni.vibrazione);
}

suIndietro(() => {
  if (stato === 'gioco') {
    if (gioco.piazzamento) annullaPiazza();
    else pausa();
  } else if (stato === 'pannello') chiudiPannello();
  else if (stato === 'pausa') riprendi();
  else if (stato === 'fine') $('menu-fine').click();
  else return false;
  return true;
});
suSecondoPiano(pausa);

// ---------- Comandi: joystick dove si appoggia il dito, tasto azione da tenere premuto ----------

let dito = null;
const joystick = $('joystick');

tela.addEventListener('pointerdown', (e) => {
  if (stato !== 'gioco') return;
  sbloccaAudio();
  dito = { id: e.pointerId, x: e.clientX, y: e.clientY };
  joystick.style.left = `${e.clientX}px`;
  joystick.style.top = `${e.clientY}px`;
  joystick.firstElementChild.style.transform = '';
  joystick.hidden = false;
  tela.setPointerCapture?.(e.pointerId);
});

tela.addEventListener('pointermove', (e) => {
  if (!dito || e.pointerId !== dito.id) return;
  const dx = e.clientX - dito.x;
  const dy = e.clientY - dito.y;
  const d = Math.hypot(dx, dy);
  const max = 50;
  const k = d > max ? max / d : 1;
  comandi.mx = (dx * k) / max;
  comandi.my = (dy * k) / max;
  joystick.firstElementChild.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
});

function lasciaDito(e) {
  if (!dito || e.pointerId !== dito.id) return;
  dito = null;
  comandi.mx = comandi.my = 0;
  joystick.hidden = true;
}
tela.addEventListener('pointerup', lasciaDito);
tela.addEventListener('pointercancel', lasciaDito);

const tastoAzione = $('azione');
tastoAzione.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  sbloccaAudio();
  comandi.azione = true;
  tocchiInAttesa = 0.4;
  tastoAzione.classList.add('premuto');
});
for (const tipo of ['pointerup', 'pointercancel', 'pointerleave']) {
  tastoAzione.addEventListener(tipo, () => {
    comandi.azione = false;
    tastoAzione.classList.remove('premuto');
  });
}

window.addEventListener('keydown', (e) => {
  tasti.add(e.key.toLowerCase());
  if (e.key === ' ' || e.key === 'e') comandi.azione = true;
  if (e.key === 'Escape') stato === 'pannello' ? chiudiPannello() : stato === 'gioco' ? pausa() : stato === 'pausa' && riprendi();
});
window.addEventListener('keyup', (e) => {
  tasti.delete(e.key.toLowerCase());
  if (e.key === ' ' || e.key === 'e') comandi.azione = false;
});

function comandiTastiera() {
  if (!tasti.size || dito) return;
  const x = (tasti.has('arrowright') || tasti.has('d') ? 1 : 0) - (tasti.has('arrowleft') || tasti.has('a') ? 1 : 0);
  const y = (tasti.has('arrowdown') || tasti.has('s') ? 1 : 0) - (tasti.has('arrowup') || tasti.has('w') ? 1 : 0);
  comandi.mx = x;
  comandi.my = y;
}

// ---------- Pannelli: zaino, crea, cucina ----------

function chip(costo) {
  const div = document.createElement('div');
  div.className = 'costi';
  for (const [k, n] of Object.entries(costo)) {
    const s = document.createElement('span');
    s.className = 'costo' + ((gioco.inventario[k] || 0) < n ? ' manca' : '');
    s.append(icona(k, 20), `${gioco.inventario[k] || 0}/${n}`);
    s.title = RISORSE[k] || CIBI[k]?.nome || k;
    div.appendChild(s);
  }
  return div;
}

function voce(nomeIcona, titolo, descrizione, costo, etichetta, abilitato, azione) {
  const el = document.createElement('div');
  el.className = 'voce';
  const testo = document.createElement('div');
  testo.innerHTML = `<b></b><small></small>`;
  testo.querySelector('b').textContent = titolo;
  testo.querySelector('small').textContent = descrizione;
  if (costo) testo.appendChild(chip(costo));
  const b = document.createElement('button');
  b.className = 'tasto medio';
  b.textContent = etichetta;
  b.disabled = !abilitato;
  b.addEventListener('click', azione);
  el.append(icona(nomeIcona, 40), testo, b);
  return el;
}

function sezione(testo) {
  const p = document.createElement('p');
  p.className = 'sezione';
  p.textContent = testo;
  return p;
}

let pannelloAperto = null;

function apriPannello(tipo, dove) {
  if (stato !== 'gioco' && stato !== 'pannello') return;
  comandi.azione = false;
  pannelloAperto = { tipo, dove };
  stato = 'pannello';
  const c = $('contenuto-pannello');
  c.innerHTML = '';
  const inv = gioco.inventario;
  if (tipo === 'zaino') {
    $('titolo-pannello').textContent = 'Zaino';
    const risorse = Object.keys(RISORSE).filter((k) => inv[k] > 0);
    const cibi = Object.keys(CIBI).filter((k) => inv[k] > 0);
    const attrezzi = Object.keys(ATTREZZI).filter((k) => gioco.attrezzi[k]);
    if (!risorse.length && !cibi.length && !attrezzi.length) {
      const p = document.createElement('p');
      p.className = 'vuoto-testo';
      p.textContent = "Lo zaino è vuoto. Avvicinati ad alberi, rocce e piante e tieni premuto il tasto rotondo.";
      c.appendChild(p);
    }
    if (cibi.length) {
      c.appendChild(sezione('Da mangiare'));
      for (const k of cibi) {
        const cibo = CIBI[k];
        const effetto = `Fame +${cibo.fame}${cibo.salute ? ` · Salute ${cibo.salute > 0 ? '+' : ''}${cibo.salute}` : ''} · ne hai ${inv[k]}`;
        c.appendChild(voce(k, cibo.nome, effetto, null, 'Mangia', true, () => gioco.mangia(k) && apriPannello('zaino')));
      }
    }
    if (risorse.length) {
      c.appendChild(sezione('Risorse'));
      const griglia = document.createElement('div');
      griglia.className = 'risorse';
      for (const k of risorse) {
        const r = document.createElement('div');
        r.className = 'risorsa';
        const small = document.createElement('small');
        small.textContent = RISORSE[k];
        r.append(icona(k, 34), `${inv[k]}`, small);
        griglia.appendChild(r);
      }
      c.appendChild(griglia);
    }
    if (attrezzi.length) {
      c.appendChild(sezione('Attrezzi'));
      const griglia = document.createElement('div');
      griglia.className = 'risorse';
      for (const k of attrezzi) {
        const r = document.createElement('div');
        r.className = 'risorsa';
        const small = document.createElement('small');
        small.textContent = ATTREZZI[k].nome;
        r.append(icona(k, 34), small);
        griglia.appendChild(r);
      }
      c.appendChild(griglia);
    }
  } else if (tipo === 'crea') {
    $('titolo-pannello').textContent = 'Crea';
    c.appendChild(sezione('Costruzioni'));
    for (const [k, s] of Object.entries(COSTRUZIONI)) {
      c.appendChild(voce(k, s.nome, s.descrizione, s.costo, 'Costruisci', haAbbastanza(inv, s.costo) && !gioco.piazzamento, () => {
        if (gioco.crea(k)) {
          suona.tocco();
          chiudiPannello();
          aggiornaPiazzamento();
        }
      }));
    }
    const daFare = Object.entries(ATTREZZI).filter(([k]) => !gioco.attrezzi[k]);
    if (daFare.length) c.appendChild(sezione('Attrezzi'));
    for (const [k, a] of daFare) {
      c.appendChild(voce(k, a.nome, a.descrizione, a.costo, 'Crea', haAbbastanza(inv, a.costo), () => {
        if (gioco.crea(k)) apriPannello('crea');
      }));
    }
  } else {
    $('titolo-pannello').textContent = dove === 'falo' ? 'Falò' : 'Forno a legna';
    if (dove === 'falo') {
      const f = gioco.vicina('falo');
      const stato = f && f.fuoco > 0 ? `Brucia ancora ${Math.ceil(f.fuoco)} secondi. Ogni legna +${FUOCO.perLegna} s (massimo ${FUOCO.massimo} s)` : 'È spento: i mostri non hanno più paura. Aggiungi legna!';
      c.appendChild(voce('legna', 'Alimenta il fuoco', stato, { legna: 1 }, 'Aggiungi', !!f && inv.legna > 0 && f.fuoco < FUOCO.massimo - 1, () => {
        if (gioco.alimenta()) apriPannello('cucina', dove);
      }));
      c.appendChild(sezione(f && f.fuoco > 0 ? 'Cucina' : 'Cucina (serve il fuoco acceso)'));
    }
    for (const [k, r] of Object.entries(RICETTE)) {
      if (r.dove !== dove) continue;
      const cibo = CIBI[k];
      const descr = `Fame +${cibo.fame} · Salute +${cibo.salute}${inv[k] ? ` · ne hai ${inv[k]}` : ''}`;
      c.appendChild(voce(k, cibo.nome, descr, r.costo, dove === 'falo' ? 'Cucina' : 'Inforna', haAbbastanza(inv, r.costo) && gioco.vicinoA(dove), () => {
        if (gioco.cucina(k)) apriPannello('cucina', dove);
      }));
    }
  }
  mostra('pannello');
}

function chiudiPannello() {
  pannelloAperto = null;
  stato = 'gioco';
  mostra(null);
}

$('zaino').addEventListener('click', () => {
  suona.tocco();
  apriPannello('zaino');
});
$('crea').addEventListener('click', () => {
  suona.tocco();
  apriPannello('crea');
});
$('chiudi-pannello').addEventListener('click', chiudiPannello);

// ---------- Piazzare le costruzioni ----------

function aggiornaPiazzamento() {
  const attivo = !!gioco?.piazzamento;
  $('piazzamento').hidden = !attivo;
  $('comandi').hidden = attivo;
}

function annullaPiazza() {
  gioco.annullaPiazzamento();
  aggiornaPiazzamento();
}

$('piazza').addEventListener('click', () => {
  if (!gioco.piazza()) {
    suona.colpito();
    vibra.errore();
    avviso('Qui non si può: serve spazio libero sulla terra.');
  }
  aggiornaPiazzamento();
});
$('annulla-piazza').addEventListener('click', annullaPiazza);

// ---------- Eventi del gioco: suoni, vibrazioni, scritte ----------

function scritta(testo, x, y, colore = '#fff', dimensione = 18) {
  effetti.scritte.push({ testo, x, y, colore, dimensione, t: 0, durata: 1.1 });
}

function particelle(x, y, colore, quanti = 8, opzioni = {}) {
  for (let i = 0; i < quanti; i++) {
    const a = Math.random() * Math.PI * 2;
    const v = 60 + Math.random() * 120;
    effetti.particelle.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 90, r: 2.5 + Math.random() * 3, colore, t: 0, durata: 0.5 + Math.random() * 0.3, ...opzioni });
  }
}

function fumo(x, y) {
  for (let i = 0; i < 8; i++) {
    effetti.particelle.push({ x: x + (Math.random() - 0.5) * 24, y: y - 10 - Math.random() * 16, vx: (Math.random() - 0.5) * 30, vy: -30, r: 7 + Math.random() * 5, colore: 'rgba(255,255,255,0.9)', t: 0, durata: 0.6, cresce: true, leggero: true });
  }
}

function gestisciEventi(eventi) {
  for (const e of eventi) {
    switch (e.tipo) {
      case 'raccolto':
        scritta(`+${e.quanti} ${RISORSE[e.risorsa]}`, e.x, e.y);
        particelle(e.x, e.y + 10, COLORI[e.risorsa], 6);
        if (e.oggetto === 'albero') particelle(e.x, e.y - 20, '#4cbb47', 5);
        suona.raccogli();
        vibra.leggera();
        if (e.risorsa === 'legna') consiglio('falo', 'Con 5 legna e 3 pietre costruisci un falò prima di notte: tocca «Crea».', 5000);
        break;
      case 'esaurito':
        if (e.oggetto === 'albero') fumo(e.x, e.y);
        suona.colpo();
        break;
      case 'colpito':
        scritta(`-${e.danno}`, e.x, e.y - 10, '#ff5c5c', 20);
        particelle(e.x, e.y + 10, COLORI[e.nemico], 7);
        suona.colpito();
        vibra.leggera();
        break;
      case 'sconfitto':
        fumo(e.x, e.y);
        scritta(Object.entries(e.bottino).map(([k, n]) => `+${n} ${RISORSE[k]}`).join(' '), e.x, e.y - 30, '#ffd34d');
        suona.sconfitto();
        break;
      case 'sciolto':
        fumo(e.x, e.y);
        break;
      case 'ferito':
        effetti.scossa = 0.25;
        suona.ferito();
        vibra.errore();
        break;
      case 'notte':
        suona.notte();
        avviso(gioco.strutture.some((s) => s.tipo === 'falo' && s.fuoco > 0) ? 'Cala la notte: resta vicino al fuoco e tienilo acceso con la legna!' : 'Cala la notte! Senza un falò acceso i mostri ti trovano.', 4000);
        break;
      case 'boss':
        effetti.scossa = 0.6;
        vibra.errore();
        setTimeout(() => avviso('Arriva il Grande Polpettone! Non teme il fuoco.', 4500), 4200);
        break;
      case 'fuocoBasso':
        avviso('Il falò si sta spegnendo: aggiungi legna!', 3500);
        break;
      case 'fuocoSpento':
        suona.colpo();
        avviso('Il falò si è spento!', 3000);
        break;
      case 'alimentato':
        scritta(`+${FUOCO.perLegna} s`, e.x, e.y, '#ffb000');
        particelle(e.x, e.y + 40, '#ff7b00', 6);
        suona.raccogli();
        break;
      case 'steccatoColpito':
        particelle(e.x, e.y, '#c98a52', 4);
        suona.colpo();
        break;
      case 'distrutto':
        fumo(e.x, e.y);
        avviso('Uno steccato è stato distrutto!', 2500);
        break;
      case 'alba':
        suona.alba();
        vibra.successo();
        avviso(e.giorno === 2 ? 'Giorno 2: sei vivo! Da oggi le polpette girano anche di giorno.' : e.giorno % NOTTE_DEL_BOSS === 0 ? `Giorno ${e.giorno}: stanotte arriva il Grande Polpettone. Preparati!` : `Giorno ${e.giorno}: sei sopravvissuto alla notte!`, 4000);
        salvaPartita();
        break;
      case 'affamato':
        avviso('Hai fame! Apri lo zaino e mangia qualcosa.', 3500);
        break;
      case 'creato':
        suona.crea();
        vibra.successo();
        scritta(`${ATTREZZI[e.nome].nome}!`, gioco.chef.x, gioco.chef.y - 80, '#ffd34d', 20);
        break;
      case 'piazzato':
        suona.crea();
        vibra.successo();
        fumo(e.x, e.y);
        break;
      case 'cucinato':
        suona.crea();
        vibra.leggera();
        break;
      case 'mangiato':
        suona.mangia();
        scritta(`Gnam! ${CIBI[e.nome].nome}`, gioco.chef.x, gioco.chef.y - 80, '#7dff7a');
        break;
      case 'apriCucina':
        suona.tocco();
        apriPannello('cucina', e.dove);
        break;
      case 'morto':
        suona.fine();
        vibra.errore();
        finePartita();
        break;
    }
  }
}

function aggiornaEffetti(dt) {
  effetti.scossa = Math.max(effetti.scossa - dt, 0);
  for (const s of effetti.scritte) s.t += dt;
  effetti.scritte = effetti.scritte.filter((s) => s.t < s.durata);
  for (const p of effetti.particelle) {
    p.t += dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (!p.leggero) p.vy += 420 * dt;
  }
  effetti.particelle = effetti.particelle.filter((p) => p.t < p.durata);
}

// ---------- HUD ----------

const ETICHETTE = { colpisci: 'Colpisci', taglia: 'Taglia', scava: 'Scava', raccogli: 'Raccogli', cucina: 'Cucina' };
const visti = {};
function imposta(chiave, valore, fn) {
  if (visti[chiave] === valore) return;
  visti[chiave] = valore;
  fn(valore);
}

function aggiornaHud() {
  const c = gioco.chef;
  imposta('salute', Math.ceil(c.salute), (v) => {
    $('salute').style.width = `${v}%`;
    $('salute').closest('.barra').classList.toggle('bassa', v < 30);
  });
  imposta('fame', Math.ceil(c.fame), (v) => {
    $('fame').style.width = `${v}%`;
    $('fame').closest('.barra').classList.toggle('bassa', v < 25);
  });
  imposta('giorno', gioco.giorno, (v) => ($('giorno').textContent = `Giorno ${v}`));
  imposta('luna', gioco.buio() > 0.5, (v) => ($('sole-luna').className = v ? 'luna' : 'sole'));
  const b = gioco.bersaglio();
  effetti.bersaglio = b;
  imposta('azione', b?.tipo === 'struttura' ? b.ref.tipo : b?.azione || 'vuoto', (v) => {
    $('testo-azione').textContent = v === 'falo' ? 'Falò' : v === 'forno' ? 'Forno' : ETICHETTE[v] || 'Agisci';
    tastoAzione.className = `tasto grande ${b?.tipo === 'nemico' ? 'nemico' : v === 'falo' || v === 'forno' ? 'cucina' : v === 'vuoto' ? 'vuoto' : ''}`.trim() + (comandi.azione ? ' premuto' : '');
  });
  const arma = gioco.attrezzi.coltello ? 'coltello' : gioco.attrezzi.mattarello ? 'mattarello' : null;
  effetti.attrezzo = b?.azione === 'taglia' && gioco.attrezzi.ascia ? 'ascia' : b?.azione === 'scava' && gioco.attrezzi.piccone ? 'piccone' : arma || (gioco.attrezzi.ascia ? 'ascia' : null);
  if (gioco.piazzamento) {
    const p = gioco.puntoPiazzamento();
    $('piazza').disabled = !gioco.puoPiazzare(p.x, p.y);
  }
}

// ---------- Ciclo ----------

let ultimo = performance.now();

function ciclo(ora) {
  const dt = Math.min((ora - ultimo) / 1000, 0.05);
  ultimo = ora;
  const t = ora / 1000;
  if (gioco && stato === 'gioco') {
    comandiTastiera();
    const attesaPrima = gioco.chef.attesa;
    gioco.aggiorna(dt, { ...comandi, azione: comandi.azione || tocchiInAttesa > 0 });
    tocchiInAttesa = gioco.chef.attesa > attesaPrima ? 0 : Math.max(tocchiInAttesa - dt, 0);
    gestisciEventi(gioco.prendiEventi());
    daUltimoSalvataggio += dt;
    if (daUltimoSalvataggio > 45) salvaPartita();
  }
  if (gioco && (stato === 'gioco' || stato === 'fine')) aggiornaEffetti(dt);
  if (gioco && stato !== 'menu') {
    const k = 1 - Math.exp(-dt * 7);
    cam.x += (gioco.chef.x - cam.x) * k;
    cam.y += (gioco.chef.y - 20 - cam.y) * k;
    aggiornaHud();
    const vista = { x: cam.x, y: cam.y };
    if (effetti.scossa > 0) {
      vista.x += (Math.random() - 0.5) * 12;
      vista.y += (Math.random() - 0.5) * 12;
    }
    disegnatore.disegna(gioco, vista, t, effetti);
  } else if (stato === 'menu') {
    disegnaMenu(t);
  }
  requestAnimationFrame(ciclo);
}

// Sfondo del menu: un angolo dell'isola al tramonto, con lo chef accanto al fuoco
const scenaMenu = (() => {
  const g = new Gioco({ seme: 20261030 });
  g.tempo = GIORNO - 12;
  g.chef.x += 10;
  g.inventario = { legna: 5, pietra: 3 };
  g.crea('falo');
  g.piazza();
  g.strutture[0].fuoco = FUOCO.massimo;
  return g;
})();
const effettiMenu = { scritte: [], particelle: [], bersaglio: null, attrezzo: 'mattarello' };
function disegnaMenu(t) {
  const c = scenaMenu.chef;
  // Il fuoco resta nella parte alta dello schermo, sopra il titolo
  const z = disegnatore.zoom || 1;
  disegnatore.disegna(scenaMenu, { x: c.x + 20 + Math.sin(t * 0.07) * 40, y: c.y + (A * 0.22) / z + Math.cos(t * 0.05) * 20 }, t, effettiMenu);
}

// ---------- Avvio ----------

window.addEventListener('resize', misura);
misura();
aggiornaOpzioni();
requestAnimationFrame(ciclo);

Promise.all([leggi('record', 0), leggi('opzioni', opzioni), leggi('partita', null)]).then(([r, o, p]) => {
  record = Number(r) || 0;
  Object.assign(opzioni, o);
  salvataggio = p && p.versione === 1 ? p : null;
  aggiornaOpzioni();
  if (stato === 'menu') aggiornaMenu();
});

if (parametri.has('debug')) {
  window.chef = { gioco: () => gioco, stato: () => stato, nuovaPartita, apriPannello };
}
