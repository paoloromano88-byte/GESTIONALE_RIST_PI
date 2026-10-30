import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Partita, nuovaComanda, mancanti, creaCasuale, INGREDIENTI, VITE_INIZIALI, VITE_MASSIME } from '../src/logica.js';

const nuova = (seme = 1) => new Partita({ larghezza: 390, altezza: 780, casuale: creaCasuale(seme) });

// Fa cadere un oggetto esattamente sulla pizza
function lancia(p, tipo) {
  p.oggetti.push({ tipo, x: p.pizza.x, y: p.yPizza - p.raggioPizza * 0.3, fase: 0, angolo: 0, giro: 0 });
  p.prossimo = 99;
  p.aggiorna(0.001);
}

const unoCheServe = (p) => mancanti(p.comanda)[0];
const unoCheNonServe = (p) => INGREDIENTI.find((t) => !(t in p.comanda.richiesti));

test('la comanda cresce con il livello e resta nei limiti', () => {
  const caso = creaCasuale(7);
  for (let livello = 0; livello < 20; livello++) {
    const c = nuovaComanda(livello, caso);
    const totale = Object.values(c.richiesti).reduce((a, b) => a + b, 0);
    assert.equal(totale, Math.min(3 + livello, 8));
    assert.equal(Object.keys(c.richiesti).length, Math.min(2 + Math.floor(livello / 2), 5));
    assert.ok(Object.values(c.presi).every((n) => n === 0));
    assert.ok(c.tempo > 0);
  }
});

test('stesso seme, stessa partita', () => {
  const a = nuova(42);
  const b = nuova(42);
  for (let i = 0; i < 300; i++) {
    a.aggiorna(1 / 60);
    b.aggiorna(1 / 60);
  }
  assert.deepEqual(a.oggetti, b.oggetti);
  assert.deepEqual(a.comanda, b.comanda);
});

test('prendere un ingrediente che serve dà punti e fa salire la combo', () => {
  const p = nuova();
  lancia(p, unoCheServe(p));
  assert.equal(p.punti, 10);
  assert.equal(p.combo, 1);
  lancia(p, unoCheServe(p));
  assert.equal(p.punti, 30);
  assert.equal(p.condimenti.length, 2);
  assert.equal(p.vite, VITE_INIZIALI);
});

test('un ingrediente sbagliato o l\'ananas tolgono una vita e azzerano la combo', () => {
  const p = nuova();
  lancia(p, unoCheServe(p));
  lancia(p, unoCheNonServe(p));
  assert.equal(p.vite, VITE_INIZIALI - 1);
  assert.equal(p.combo, 0);
  lancia(p, 'ananas');
  assert.equal(p.vite, VITE_INIZIALI - 2);
  assert.ok(p.prendiEventi().filter((e) => e.tipo === 'errore').length === 2);
});

test('un ingrediente già completo nella comanda è un errore', () => {
  const p = nuova();
  const tipo = unoCheServe(p);
  while (p.comanda.presi[tipo] < p.comanda.richiesti[tipo]) lancia(p, tipo);
  if (p.attesaUscita > 0) return; // la comanda era di un solo tipo: già servita
  lancia(p, tipo);
  assert.equal(p.vite, VITE_INIZIALI - 1);
});

test('completare la comanda serve la pizza e passa al livello dopo', () => {
  const p = nuova();
  while (mancanti(p.comanda).length) lancia(p, unoCheServe(p));
  assert.equal(p.pizzeServite, 1);
  assert.equal(p.livello, 1);
  assert.ok(p.punti > 60);
  assert.ok(p.prendiEventi().some((e) => e.tipo === 'servita'));
  // Mentre esce dal forno, quello che si prende non conta
  lancia(p, 'ananas');
  assert.equal(p.vite, VITE_INIZIALI);
  p.aggiorna(1.2);
  assert.ok(p.prendiEventi().some((e) => e.tipo === 'nuovaComanda'));
  assert.equal(p.condimenti.length, 0);
  assert.equal(Object.values(p.comanda.richiesti).reduce((a, b) => a + b, 0), 4);
});

test('il tempo della comanda che scade costa una vita', () => {
  const p = nuova();
  p.oggetti = [];
  p.prossimo = 1e9;
  const tempo = p.comanda.tempo;
  p.aggiorna(tempo + 0.01);
  assert.equal(p.vite, VITE_INIZIALI - 1);
  assert.ok(p.prendiEventi().some((e) => e.tipo === 'scaduta'));
});

test('bonus: vita extra fino al massimo, orologio rallenta la caduta', () => {
  const p = nuova();
  for (let i = 0; i < 5; i++) lancia(p, 'cuore');
  assert.equal(p.vite, VITE_MASSIME);
  const prima = p.velocita();
  lancia(p, 'orologio');
  assert.ok(p.velocita() < prima);
  p.aggiorna(5.1);
  assert.equal(p.velocita(), prima);
});

test('senza vite la partita finisce', () => {
  const p = nuova();
  for (let i = 0; i < VITE_INIZIALI; i++) lancia(p, 'ananas');
  assert.equal(p.finita, true);
  assert.equal(p.vite, 0);
  assert.ok(p.prendiEventi().some((e) => e.tipo === 'fine'));
});

test('la pizza resta dentro lo schermo', () => {
  const p = nuova();
  p.muoviVerso(-500);
  for (let i = 0; i < 60; i++) p.aggiorna(1 / 60);
  assert.ok(p.pizza.x >= p.raggioPizza - 0.01);
  p.muoviVerso(5000);
  for (let i = 0; i < 60; i++) p.aggiorna(1 / 60);
  assert.ok(p.pizza.x <= p.larghezza - p.raggioPizza + 0.01);
});

test('gli oggetti mancati escono dallo schermo senza penalità', () => {
  const p = nuova();
  p.pizza.x = p.pizza.obiettivo = p.raggioPizza;
  p.oggetti.push({ tipo: 'ananas', x: p.larghezza - p.raggioOggetto, y: 0, fase: 0, angolo: 0, giro: 0 });
  p.prossimo = 1e9;
  for (let i = 0; i < 400; i++) p.aggiorna(1 / 60);
  assert.equal(p.oggetti.length, 0);
  assert.equal(p.vite, VITE_INIZIALI);
});
