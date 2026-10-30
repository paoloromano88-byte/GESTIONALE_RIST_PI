import { Partita, ARMI, COSTRUZIONI, CONSUMABILI, OGGETTI_CREABILI, RISORSE, FUOCO, GIORNO, haAbbastanza } from './logica.js';
import { Scena3D } from './scena3d.js';
import { caricaModelli } from './modelli.js';
import { icona } from './icone.js';
import { suona, sbloccaAudio, impostaAudio } from './suoni.js';
import { vibra, impostaVibrazione, leggi, salva, suIndietro, suSecondoPiano } from './nativo.js';

const $ = (id) => document.getElementById(id);
const tela = $('isola');
const scena = new Scena3D(tela, $('sopra'));
const parametri = new URLSearchParams(location.search);

let L = 0;
let A = 0;
let dpr = 1;
let partita = null;
let stato = 'menu'; // menu | gioco | pannello | pausa | fine
let record = 0;
let salvataggio = null;
const opzioni = { audio: true, vibrazione: true };
const cam = { x: 0, y: 0 };
const effetti = { scritte: [], particelle: [], spari: [], scossa: 0, bersaglio: null };
const comandi = { mx: 0, my: 0, azione: false };
// Un tocco rapido sul tasto azione resta in attesa finché l'azione non parte davvero
let tocchiInAttesa = 0;
const tasti = new Set();
let consigli = {};
let daUltimoSalvataggio = 0;

// ---------- Schermo ----------

function misura() {
  dpr = Math.min(window.devicePixelRatio || 1, 3);
  L = window.innerWidth;
  A = window.innerHeight;
  const zoom = Math.min(Math.max(Math.min(L, A) / 380, 0.9), 1.8);
  scena.imposta(L, A, dpr, zoom);
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

function avvia(p) {
  partita = p;
  cam.x = p.io.x;
  cam.y = p.io.y;
  effetti.scritte = [];
  effetti.particelle = [];
  effetti.spari = [];
  daUltimoSalvataggio = 0;
  consigli = p.giorno > 1 ? { muoversi: true, frugare: true } : {};
  stato = 'gioco';
  mostra(null);
  $('hud').hidden = false;
  aggiornaPiazzamento();
  consiglio('muoversi', 'Trascina il dito per camminare. Il tasto rotondo fruga, raccoglie e colpisce.', 5000);
}

function nuovaPartita() {
  sbloccaAudio();
  suona.tocco();
  const seme = parametri.get('seme');
  avvia(new Partita({ seme: seme ? Number(seme) : Math.floor(Math.random() * 1e9) }));
  salvaPartita();
}

function continua() {
  sbloccaAudio();
  suona.tocco();
  avvia(Partita.carica(salvataggio));
}

function salvaPartita() {
  if (!partita || partita.finita) return;
  salvataggio = partita.salva();
  salva('partita', salvataggio);
  daUltimoSalvataggio = 0;
}

function alMenu() {
  salvaPartita();
  stato = 'menu';
  partita = null;
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
  $('riepilogo').textContent = `Giorno ${partita.giorno} · ${partita.statistiche.uccisi} zombie abbattuti · ${partita.statistiche.frugati} posti frugati`;
  mostra('pausa-schermata');
}

function riprendi() {
  sbloccaAudio();
  stato = 'gioco';
  mostra(null);
}

function finePartita() {
  const giorni = partita.giorno;
  const nuovo = giorni > record;
  record = Math.max(record, giorni);
  salva('record', record);
  salva('partita', null);
  salvataggio = null;
  setTimeout(() => {
    stato = 'fine';
    $('esito').textContent = `Hai resistito fino al giorno ${giorni}: ${partita.statistiche.uccisi} zombie abbattuti, ${partita.statistiche.frugati} posti frugati.`;
    $('nuovo-record').hidden = !nuovo;
    mostra('fine');
  }, 1600);
}

let confermaNuova = false;
function aggiornaMenu() {
  $('record').textContent = record;
  $('continua').hidden = !salvataggio;
  if (salvataggio) $('continua-giorno').textContent = `Giorno ${salvataggio.giorno}`;
  $('nuova').textContent = 'Nuova partita';
  confermaNuova = false;
}

$('nuova').addEventListener('click', () => {
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
  partita = null;
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
    if (partita.piazzamento) annullaPiazza();
    else pausa();
  } else if (stato === 'pannello') chiudiPannello();
  else if (stato === 'pausa') riprendi();
  else if (stato === 'fine') $('menu-fine').click();
  else return false;
  return true;
});
suSecondoPiano(pausa);

// ---------- Comandi ----------

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
  if (e.key === 'q' && stato === 'gioco') prossimaArma();
  if (e.key === 'Escape') stato === 'pannello' ? chiudiPannello() : stato === 'gioco' ? pausa() : stato === 'pausa' && riprendi();
});
window.addEventListener('keyup', (e) => {
  tasti.delete(e.key.toLowerCase());
  if (e.key === ' ' || e.key === 'e') comandi.azione = false;
});

function comandiTastiera() {
  if (!tasti.size || dito) return;
  comandi.mx = (tasti.has('arrowright') || tasti.has('d') ? 1 : 0) - (tasti.has('arrowleft') || tasti.has('a') ? 1 : 0);
  comandi.my = (tasti.has('arrowdown') || tasti.has('s') ? 1 : 0) - (tasti.has('arrowup') || tasti.has('w') ? 1 : 0);
}

// Il riquadro dell'arma: un tocco passa alla prossima arma posseduta
function armiPossedute() {
  return ['pugni', ...Object.keys(ARMI).filter((k) => partita.armi[k])];
}

function prossimaArma() {
  const lista = armiPossedute();
  const i = lista.indexOf(partita.armaAttiva);
  partita.equipaggia(lista[(i + 1) % lista.length]);
  suona.tocco();
}
$('arma').addEventListener('click', prossimaArma);

// ---------- Pannelli: zaino e crea ----------

function chip(costo) {
  const div = document.createElement('div');
  div.className = 'costi';
  for (const [k, n] of Object.entries(costo)) {
    const s = document.createElement('span');
    s.className = 'costo' + ((partita.inventario[k] || 0) < n ? ' manca' : '');
    s.append(icona(k, 20), `${partita.inventario[k] || 0}/${n}`);
    s.title = RISORSE[k] || k;
    div.appendChild(s);
  }
  return div;
}

function voce(nomeIcona, titolo, descrizione, costo, etichetta, abilitato, azione) {
  const el = document.createElement('div');
  el.className = 'voce';
  const testo = document.createElement('div');
  testo.innerHTML = '<b></b><small></small>';
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

function descriviArma(nome) {
  const a = ARMI[nome];
  const u = partita.armi[nome]?.usura;
  const parti = [`Danno ${a.danno}`];
  if (a.colpi) parti.push(`${RISORSE[a.colpi]}: ${partita.inventario[a.colpi] || 0}`);
  else if (Number.isFinite(u)) parti.push(`Usura ${u}/${a.usura}`);
  if (a.descrizione) parti.push(a.descrizione);
  return parti.join(' · ');
}

function apriPannello(tipo) {
  if (stato !== 'gioco' && stato !== 'pannello') return;
  comandi.azione = false;
  stato = 'pannello';
  const c = $('contenuto-pannello');
  c.innerHTML = '';
  const inv = partita.inventario;
  if (tipo === 'zaino') {
    $('titolo-pannello').textContent = 'Zaino';
    const usabili = Object.keys(CONSUMABILI).filter((k) => inv[k] > 0);
    const risorse = Object.keys(RISORSE).filter((k) => inv[k] > 0 && !CONSUMABILI[k]);
    if (usabili.length) {
      c.appendChild(sezione('Da usare'));
      for (const k of usabili) {
        const u = CONSUMABILI[k];
        const effetto = [u.fame && `Fame +${u.fame}`, u.sete && `Sete +${u.sete}`, u.salute && `Salute +${u.salute}`].filter(Boolean).join(' · ');
        c.appendChild(voce(k, u.nome, `${effetto} · ne hai ${inv[k]}`, null, k === 'bende' ? 'Curati' : k === 'acqua' ? 'Bevi' : 'Mangia', true, () => partita.usa(k) && apriPannello('zaino')));
      }
    }
    c.appendChild(sezione('Armi'));
    for (const k of armiPossedute()) {
      const attiva = partita.armaAttiva === k;
      c.appendChild(voce(k, ARMI[k].nome, descriviArma(k), null, attiva ? 'In mano' : 'Impugna', !attiva, () => {
        partita.equipaggia(k);
        suona.tocco();
        apriPannello('zaino');
      }));
    }
    if (risorse.length) {
      c.appendChild(sezione('Materiali'));
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
  } else {
    $('titolo-pannello').textContent = 'Crea';
    c.appendChild(sezione('Rifugio'));
    for (const [k, s] of Object.entries(COSTRUZIONI)) {
      c.appendChild(voce(k, s.nome, s.descrizione, s.costo, 'Costruisci', haAbbastanza(inv, s.costo) && !partita.piazzamento, () => {
        if (partita.crea(k)) {
          suona.tocco();
          chiudiPannello();
          aggiornaPiazzamento();
        }
      }));
    }
    const daFare = Object.entries(ARMI).filter(([k, a]) => a.costo && !partita.armi[k]);
    if (daFare.length) c.appendChild(sezione('Armi'));
    for (const [k, a] of daFare) {
      c.appendChild(voce(k, a.nome, `Danno ${a.danno}${a.usura ? ` · dura ${a.usura} colpi` : ''}${a.descrizione ? ` · ${a.descrizione}` : ''}`, a.costo, 'Crea', haAbbastanza(inv, a.costo), () => {
        if (partita.crea(k)) apriPannello('crea');
      }));
    }
    c.appendChild(sezione('Scorte'));
    for (const [k, o] of Object.entries(OGGETTI_CREABILI)) {
      c.appendChild(voce(k, o.nome, k === 'dardi' ? 'Per la balestra' : 'Ridà 30 di salute', o.costo, 'Crea', haAbbastanza(inv, o.costo), () => {
        if (partita.crea(k)) apriPannello('crea');
      }));
    }
  }
  mostra('pannello');
}

function chiudiPannello() {
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

// ---------- Costruzioni da piazzare ----------

function aggiornaPiazzamento() {
  const attivo = !!partita?.piazzamento;
  $('piazzamento').hidden = !attivo;
  $('comandi').hidden = attivo;
  $('arma').hidden = attivo;
}

function annullaPiazza() {
  partita.annullaPiazzamento();
  aggiornaPiazzamento();
}

$('piazza').addEventListener('click', () => {
  if (!partita.piazza()) {
    suona.colpito();
    vibra.errore();
    avviso('Qui non si può: serve spazio libero.');
  }
  aggiornaPiazzamento();
});
$('annulla-piazza').addEventListener('click', annullaPiazza);

// ---------- Eventi del gioco ----------

function scritta(testo, x, y, colore = '#f1e9dc', dimensione = 18) {
  effetti.scritte.push({ testo, x, y, colore, dimensione, t: 0, durata: 1.2 });
}

function particelle(x, y, colore, quanti = 8) {
  for (let i = 0; i < quanti; i++) {
    const a = Math.random() * Math.PI * 2;
    const v = 50 + Math.random() * 110;
    effetti.particelle.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, r: 2 + Math.random() * 2.5, colore, t: 0, durata: 0.45 + Math.random() * 0.3 });
  }
}

const elenco = (cosa) => Object.entries(cosa).map(([k, n]) => `+${n} ${RISORSE[k] || k}`).join('  ');

function gestisciEventi(eventi) {
  for (const e of eventi) {
    switch (e.tipo) {
      case 'frugato': {
        const vuoto = !Object.keys(e.cosa).length;
        scritta(vuoto ? 'Vuoto' : elenco(e.cosa), e.x, e.y, vuoto ? '#a89f92' : '#f1e9dc');
        suona.raccogli();
        vibra.leggera();
        consiglio('frugare', 'Con legna e metallo costruisci armi e barricate: tocca «Crea».', 4500);
        break;
      }
      case 'raccolto':
        scritta(`+${e.quanti} ${RISORSE[e.risorsa]}`, e.x, e.y);
        particelle(e.x, e.y, e.oggetto === 'albero' ? '#6a4a2a' : e.oggetto === 'rottami' ? '#8a8e94' : '#3a1a2a', 6);
        suona.raccogli();
        vibra.leggera();
        break;
      case 'esaurito':
        suona.colpo();
        break;
      case 'zombieColpito':
        scritta(`-${e.danno}`, e.x, e.y, '#ff7a6a', 18);
        particelle(e.x, e.y, '#5a1a14', 7);
        suona.colpito();
        vibra.leggera();
        break;
      case 'zombieUcciso':
        if (Object.keys(e.preda).length) scritta(elenco(e.preda), e.x, e.y - 20, '#e4b04f');
        suona.sconfitto();
        break;
      case 'sparo':
        effetti.spari.push({ ...e, t: 0 });
        if (e.arma === 'pistola') {
          effetti.scossa = 0.08;
          suona.ferito();
        } else suona.colpo();
        break;
      case 'ferito':
        effetti.scossa = 0.25;
        suona.ferito();
        vibra.errore();
        break;
      case 'armaRotta':
        avviso(`${ARMI[e.arma].nome}: si è rotto!`, 2500);
        suona.colpo();
        break;
      case 'armaTrovata':
        avviso('Hai trovato una pistola! Le munizioni sono rare, e lo sparo si sente lontano.', 4500);
        suona.crea();
        vibra.successo();
        break;
      case 'notte':
        suona.notte();
        avviso(e.giorno === 1 ? 'Cala la notte. Arriveranno da ogni parte: chiuditi dentro o barricati.' : 'Cala la notte. Arrivano.', 4000);
        break;
      case 'alba':
        suona.alba();
        vibra.successo();
        avviso(`Giorno ${e.giorno}. Sei ancora vivo.`, 3500);
        salvaPartita();
        break;
      case 'affamato':
        avviso('Hai fame: apri lo zaino e mangia qualcosa.', 3500);
        break;
      case 'assetato':
        avviso('Hai sete: bevi, o cerca acqua nei frigoriferi e nelle auto.', 3500);
        break;
      case 'creato':
        suona.crea();
        vibra.successo();
        scritta(e.nome, partita.io.x, partita.io.y - 40, '#e4b04f', 20);
        break;
      case 'piazzato':
        suona.crea();
        vibra.successo();
        break;
      case 'strutturaColpita':
        particelle(e.x, e.y, '#7a5c3c', 4);
        suona.colpo();
        break;
      case 'distrutto':
        avviso(`${e.nome} distrutta!`, 2500);
        break;
      case 'alimentato':
        scritta(`+${FUOCO.perLegna} s`, e.x, e.y, '#e8a020');
        suona.raccogli();
        break;
      case 'preso':
        scritta(elenco(e.cosa), e.x, e.y, '#9fd0f0');
        suona.raccogli();
        break;
      case 'usato':
        suona.mangia();
        break;
      case 'fuocoSpento':
        avviso('Il falò si è spento.', 2500);
        break;
      case 'fine':
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
  for (const s of effetti.spari) s.t += dt;
  effetti.spari = effetti.spari.filter((s) => s.t < 0.2);
  for (const p of effetti.particelle) {
    p.t += dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 0.92;
    p.vy *= 0.92;
  }
  effetti.particelle = effetti.particelle.filter((p) => p.t < p.durata);
}

// ---------- HUD ----------

const ETICHETTE = { colpisci: 'Colpisci', spara: 'Spara', taglia: 'Taglia', smonta: 'Smonta', raccogli: 'Raccogli', fruga: 'Fruga', alimenta: 'Legna', prendi: 'Acqua' };
const visti = {};
function imposta(chiave, valore, fn) {
  if (visti[chiave] === valore) return;
  visti[chiave] = valore;
  fn(valore);
}

function aggiornaHud() {
  const io = partita.io;
  for (const k of ['salute', 'fame', 'sete']) {
    imposta(k, Math.ceil(io[k]), (v) => {
      $(k).style.width = `${v}%`;
      $(k).closest('.barra').classList.toggle('bassa', v < (k === 'salute' ? 30 : 25));
    });
  }
  imposta('giorno', partita.giorno, (v) => ($('giorno').textContent = `Giorno ${v}`));
  imposta('luna', partita.buio() > 0.5, (v) => ($('sole-luna').className = v ? 'luna' : 'sole'));
  const b = partita.bersaglio();
  effetti.bersaglio = b;
  imposta('azione', b?.azione || 'vuoto', (v) => {
    $('testo-azione').textContent = ETICHETTE[v] || '—';
    tastoAzione.className = `tasto grande ${b?.tipo === 'zombie' ? 'nemico' : v === 'fruga' ? 'cucina' : v === 'vuoto' ? 'vuoto' : ''}`.trim() + (comandi.azione ? ' premuto' : '');
  });
  const a = ARMI[partita.armaAttiva];
  const u = partita.armi[partita.armaAttiva]?.usura;
  const statoArma = a.colpi ? `${partita.inventario[a.colpi] || 0} ${RISORSE[a.colpi].toLowerCase()}` : Number.isFinite(u) ? `usura ${u}` : '';
  imposta('arma', partita.armaAttiva, (v) => {
    $('nome-arma').textContent = ARMI[v].nome;
    $('icona-arma').replaceChildren(icona(v, 30));
  });
  imposta('statoArma', statoArma, (v) => ($('stato-arma').textContent = v));
  if (partita.piazzamento) {
    const p = partita.puntoPiazzamento();
    $('piazza').disabled = !partita.puoPiazzare(p.x, p.y);
  }
}

// ---------- Ciclo ----------

let ultimo = performance.now();

function ciclo(ora) {
  const dt = Math.min((ora - ultimo) / 1000, 0.05);
  ultimo = ora;
  const t = ora / 1000;
  if (partita && stato === 'gioco') {
    comandiTastiera();
    const attesaPrima = partita.io.attesa;
    partita.aggiorna(dt, { ...comandi, azione: comandi.azione || tocchiInAttesa > 0 });
    tocchiInAttesa = partita.io.attesa > attesaPrima ? 0 : Math.max(tocchiInAttesa - dt, 0);
    gestisciEventi(partita.prendiEventi());
    daUltimoSalvataggio += dt;
    if (daUltimoSalvataggio > 45) salvaPartita();
  }
  if (partita && (stato === 'gioco' || stato === 'fine')) aggiornaEffetti(dt);
  if (partita && stato !== 'menu') {
    const k = 1 - Math.exp(-dt * 7);
    cam.x += (partita.io.x - cam.x) * k;
    cam.y += (partita.io.y - cam.y) * k;
    aggiornaHud();
    const vista = { x: cam.x, y: cam.y };
    if (effetti.scossa > 0) {
      vista.x += (Math.random() - 0.5) * 10;
      vista.y += (Math.random() - 0.5) * 10;
    }
    scena.disegna(partita, vista, t, effetti);
  } else if (stato === 'menu') {
    disegnaMenu(t);
  }
  requestAnimationFrame(ciclo);
}

// Sfondo del menu: il paese al tramonto, con il sopravvissuto accanto al fuoco
const scenaMenu = (() => {
  const p = new Partita({ seme: 20261030 });
  p.tempo = GIORNO - 10;
  p.inventario = { legna: 5 };
  p.io.guarda = Math.PI / 2;
  p.crea('falo');
  p.piazza();
  p.strutture[0].fuoco = FUOCO.massimo;
  p.io.guarda = Math.PI / 2;
  return p;
})();
const effettiMenu = { scritte: [], particelle: [], spari: [], bersaglio: null };
function disegnaMenu(t) {
  const io = scenaMenu.io;
  const z = scena.zoom || 1;
  scena.disegna(scenaMenu, { x: io.x + 30 + Math.sin(t * 0.07) * 40, y: io.y + (A * 0.22) / z + Math.cos(t * 0.05) * 20 }, t, effettiMenu);
}

// ---------- Avvio ----------

window.addEventListener('resize', misura);
misura();
aggiornaOpzioni();
requestAnimationFrame(ciclo);

caricaModelli().then((modelli) => {
  const nomi = Object.keys(modelli);
  if (nomi.length) scena.usaModelli(modelli);
  $('stato-modelli').textContent = nomi.length ? `Modelli 3D caricati: ${nomi.join(', ')}` : 'Grafica provvisoria: i modelli 3D veri arriveranno in public/modelli/.';
});

Promise.all([leggi('record', 0), leggi('opzioni', opzioni), leggi('partita', null)]).then(([r, o, p]) => {
  record = Number(r) || 0;
  Object.assign(opzioni, o);
  salvataggio = p && p.versione === 1 ? p : null;
  aggiornaOpzioni();
  if (stato === 'menu') aggiornaMenu();
});

if (parametri.has('debug')) {
  window.terra = { partita: () => partita, stato: () => stato, nuovaPartita, apriPannello, scena };
}
