import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Gioco, GIORNO, CICLO, ATTREZZI, COSTRUZIONI, NEMICI, RICETTE } from '../src/logica.js';
import { generaIsola, terrenoIn, centroIsola, OGGETTI, ACQUA, ERBA } from '../src/mondo.js';

const nuovo = (seme = 42) => new Gioco({ seme });

// Mette lo chef accanto a un oggetto del tipo voluto
function accanto(g, tipo) {
  const o = g.oggetti.find((x) => x.tipo === tipo && x.colpi > 0);
  g.chef.x = o.x - OGGETTI[tipo].raggio - g.chef.raggio - 6;
  g.chef.y = o.y;
  // Se un altro oggetto è ancora più vicino, il tasto azione colpisce quello
  return g.bersaglio().ref;
}

function premi(g, volte = 1) {
  for (let i = 0; i < volte; i++) {
    g.chef.attesa = 0;
    g.aggiorna(0.01, { azione: true });
  }
}

test('la stessa isola dallo stesso seme, il centro è erba e libero', () => {
  const a = generaIsola(7);
  const b = generaIsola(7);
  assert.deepEqual(a.terreno, b.terreno);
  assert.deepEqual(a.oggetti, b.oggetti);
  const c = centroIsola();
  assert.equal(terrenoIn(a, c.x, c.y), ERBA);
  assert.ok(a.oggetti.every((o) => Math.hypot(o.x - c.x, o.y - c.y) > 3 * 48));
  assert.ok(a.oggetti.every((o) => terrenoIn(a, o.x, o.y) !== ACQUA));
  for (const tipo of Object.keys(OGGETTI)) assert.ok(a.oggetti.some((o) => o.tipo === tipo), `manca ${tipo}`);
});

test('tagliare un albero dà legna a ogni colpo; con l\'ascia il doppio; poi resta il ceppo', () => {
  const g = nuovo();
  const albero = accanto(g, 'albero');
  assert.equal(albero.tipo, 'albero');
  premi(g);
  assert.equal(g.inventario.legna, 1);
  g.attrezzi.ascia = true;
  premi(g, 2);
  assert.equal(g.inventario.legna, 5);
  assert.equal(albero.colpi, 0);
  assert.ok(albero.ricresce > g.tempoAssoluto);
  // Il ceppo non si taglia più: il tasto azione passa ad altro
  assert.notEqual(g.bersaglio()?.ref, albero);
});

test('raccogliere pomodori, poi la pianta ricresce', () => {
  const g = nuovo();
  const pianta = accanto(g, 'pomodori');
  premi(g);
  assert.equal(g.inventario.pomodoro, 2);
  assert.equal(pianta.colpi, 0);
  g.chef.x -= 200;
  g.tempo = 0;
  g.giorno += 1;
  g.aggiorna(0.01);
  assert.equal(pianta.colpi, 1);
});

test('lo chef non entra in acqua e non attraversa le rocce', () => {
  const g = nuovo();
  for (let i = 0; i < 2000; i++) g.aggiorna(0.02, { mx: 1, my: 0 });
  assert.notEqual(terrenoIn(g.isola, g.chef.x, g.chef.y), ACQUA);
  const r = g.oggetti.find((o) => o.tipo === 'roccia');
  g.chef.x = r.x - 60;
  g.chef.y = r.y;
  for (let i = 0; i < 100; i++) g.aggiorna(0.02, { mx: 1, my: 0 });
  assert.ok(Math.hypot(g.chef.x - r.x, g.chef.y - r.y) >= OGGETTI.roccia.raggio + g.chef.raggio - 0.5);
});

test('attrezzi: si creano solo con le risorse, una volta sola', () => {
  const g = nuovo();
  assert.equal(g.crea('ascia'), false);
  g.inventario = { legna: 10, pietra: 10 };
  assert.ok(g.crea('ascia'));
  assert.deepEqual(g.inventario, { legna: 7, pietra: 8 });
  assert.equal(g.crea('ascia'), false);
  assert.ok(g.crea('mattarello'));
  assert.equal(g.arma(), ATTREZZI.mattarello.danno);
});

test('costruzioni: si piazzano davanti allo chef; annullare restituisce le risorse', () => {
  const g = nuovo();
  g.inventario = { legna: 10, pietra: 10 };
  assert.ok(g.crea('falo'));
  assert.equal(g.piazzamento, 'falo');
  g.annullaPiazzamento();
  assert.deepEqual(g.inventario, { legna: 10, pietra: 10 });
  assert.ok(g.crea('falo'));
  assert.ok(g.piazza());
  assert.equal(g.strutture.length, 1);
  assert.equal(g.piazzamento, null);
  assert.equal(g.inventario.legna, 5);
});

test('cucinare serve il posto giusto: al falò l\'arrosto, al forno la pizza', () => {
  const g = nuovo();
  g.inventario = { legna: 20, pietra: 20, pomodoro: 5, grano: 4 };
  assert.equal(g.cucina('pomodoroArrosto'), false);
  g.crea('falo');
  g.piazza();
  assert.ok(g.cucina('pomodoroArrosto'));
  assert.equal(g.cucina('pizzaMargherita'), false);
  g.chef.direzione = -1;
  g.crea('forno');
  assert.ok(g.piazza());
  assert.ok(g.cucina('pizzaMargherita'));
  assert.equal(g.inventario.pizzaMargherita, 1);
  assert.equal(g.statistiche.pizze, 1);
  for (const [nome, r] of Object.entries(RICETTE)) assert.ok(['falo', 'forno'].includes(r.dove), nome);
});

test('il tasto azione vicino al falò apre la cucina', () => {
  const g = nuovo();
  g.inventario = { legna: 5, pietra: 3 };
  g.crea('falo');
  g.piazza();
  premi(g);
  assert.ok(g.prendiEventi().some((e) => e.tipo === 'apriCucina' && e.dove === 'falo'));
});

test('mangiare toglie fame; senza cibo la salute cala fino alla fine', () => {
  const g = nuovo();
  g.chef.fame = 10;
  g.inventario = { pizzaMargherita: 1 };
  assert.ok(g.mangia('pizzaMargherita'));
  assert.equal(g.chef.fame, 65);
  assert.equal(g.mangia('pizzaMargherita'), false);
  g.chef.fame = 0;
  g.chef.salute = 5;
  for (let i = 0; i < 10 && !g.morto; i++) g.aggiorna(1);
  assert.ok(g.morto);
  assert.ok(g.prendiEventi().some((e) => e.tipo === 'morto'));
});

test('di giorno nessun mostro; di notte arrivano, lontani dalla luce; all\'alba spariscono', () => {
  const g = nuovo();
  for (let t = 0; t < GIORNO - 20; t += 0.5) g.aggiorna(0.5);
  assert.equal(g.nemici.length, 0);
  g.chef.salute = 1e9;
  g.inventario = { legna: 5, pietra: 3 };
  g.crea('falo');
  g.piazza();
  const falo = g.strutture[0];
  let visti = 0;
  while (g.tempo < CICLO - 12) {
    g.aggiorna(0.1);
    visti = Math.max(visti, g.nemici.length);
    for (const n of g.nemici) assert.ok(Math.hypot(n.x - falo.x, n.y - falo.y) > COSTRUZIONI.falo.luce * 0.75, 'un mostro è entrato nella luce');
  }
  assert.ok(visti > 0);
  while (g.giorno === 1) g.aggiorna(0.1);
  assert.equal(g.nemici.length, 0);
  assert.equal(g.giorno, 2);
});

test('sconfiggere un mostro dà il suo bottino', () => {
  const g = nuovo();
  g.attrezzi.coltello = true;
  g.nemici.push({ id: 1, tipo: 'polpetta', x: g.chef.x + 40, y: g.chef.y, raggio: 16, vita: NEMICI.polpetta.vita, attesa: 5, colpito: 0, fase: 0 });
  premi(g, 2);
  assert.equal(g.nemici.length, 0);
  assert.equal(g.inventario.carne, 1);
  assert.equal(g.statistiche.sconfitti, 1);
});

test('i mostri feriscono lo chef; la cipolla lo rallenta', () => {
  const g = nuovo();
  g.nemici.push({ id: 1, tipo: 'cipolla', x: g.chef.x + 30, y: g.chef.y, raggio: 18, vita: 45, attesa: 0, colpito: 0, fase: 0 });
  g.aggiorna(0.05);
  assert.ok(g.chef.salute < 100);
  assert.ok(g.chef.piange);
});

test('salvare e ricaricare riporta la stessa partita', () => {
  const g = nuovo(5);
  accanto(g, 'albero');
  premi(g, 3);
  g.inventario.pietra = 3;
  g.crea('falo');
  g.piazza();
  g.aggiorna(12);
  const dati = JSON.parse(JSON.stringify(g.salva()));
  const h = Gioco.carica(dati);
  assert.equal(h.giorno, g.giorno);
  assert.ok(Math.abs(h.tempo - g.tempo) < 1e-9);
  assert.deepEqual(h.inventario, g.inventario);
  assert.deepEqual(h.strutture, g.strutture);
  assert.deepEqual(h.oggetti.map((o) => o.colpi), g.oggetti.map((o) => o.colpi));
  assert.equal(h.chef.x, g.chef.x);
});
