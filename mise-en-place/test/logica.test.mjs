import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Partita, generaLivello, risolvi, quantiSposta, completo, parametriLivello, CAPIENZA } from '../src/logica.js';

const b = (...tipi) => tipi.map((tipo) => ({ tipo, coperto: false }));

test('si sposta su un barattolo vuoto o sullo stesso ingrediente, mai su uno diverso o pieno', () => {
  const barattoli = [b('olive', 'funghi', 'funghi'), b('salame', 'funghi'), b('olive'), [], b('funghi', 'funghi', 'funghi', 'olive')];
  assert.equal(quantiSposta(barattoli, 0, 1), 2); // due funghi sopra un fungo, c'è posto per due
  assert.equal(quantiSposta(barattoli, 0, 3), 2); // nel vuoto va tutto il gruppo in cima
  assert.equal(quantiSposta(barattoli, 0, 2), 0); // olive in cima al barattolo 2, funghi da spostare
  assert.equal(quantiSposta(barattoli, 2, 4), 0); // barattolo pieno
  assert.equal(quantiSposta(barattoli, 3, 0), 0); // da un barattolo vuoto non si sposta niente
  assert.equal(quantiSposta(barattoli, 0, 0), 0);
});

test('un barattolo completo non si tocca più', () => {
  const barattoli = [b('mais', 'mais', 'mais', 'mais'), []];
  assert.ok(completo(barattoli[0]));
  assert.equal(quantiSposta(barattoli, 0, 1), 0);
});

test('il gruppo si sposta solo finché c\'è posto', () => {
  const barattoli = [b('olive', 'olive', 'olive'), b('salame', 'salame', 'olive')];
  assert.equal(quantiSposta(barattoli, 0, 1), 1);
});

test('ogni livello generato è risolvibile, ripetibile e senza barattoli già pronti', () => {
  for (let n = 1; n <= 60; n++) {
    const l = generaLivello(n);
    const { tipi, vuoti } = parametriLivello(n);
    assert.equal(l.barattoli.length, tipi + vuoti);
    assert.ok(l.barattoli.every((x) => x.length === 0 || x.length === CAPIENZA));
    assert.ok(!l.barattoli.some((x) => x.length && completo(x)), `livello ${n}: barattolo già pronto`);
    assert.ok(risolvi(l.barattoli), `livello ${n}: nessuna soluzione`);
    assert.deepEqual(generaLivello(n).barattoli, l.barattoli);
  }
});

test('ingredienti coperti: solo dal livello 8, la cima resta visibile', () => {
  assert.ok(generaLivello(5).barattoli.flat().every((p) => !p.coperto));
  const l = generaLivello(9).barattoli.filter((x) => x.length);
  assert.ok(l.every((x) => !x[x.length - 1].coperto && x.slice(0, -1).every((p) => p.coperto)));
});

test('seguendo la soluzione la partita si vince, con tre stelle', () => {
  const p = new Partita(6);
  for (const m of risolvi(p.barattoli)) assert.ok(p.sposta(m.da, m.a));
  assert.equal(p.vinta, true);
  assert.equal(p.stelle(), 3);
});

test('spostare scopre l\'ingrediente sotto; annullare non lo ricopre', () => {
  const p = new Partita(9);
  const da = p.barattoli.findIndex((x) => x.length);
  const vuoto = p.barattoli.findIndex((x) => !x.length);
  const prima = p.barattoli[da].length;
  const r = p.sposta(da, vuoto);
  const sotto = p.barattoli[da][p.barattoli[da].length - 1];
  assert.equal(sotto.coperto, false);
  assert.equal(r.scoperto, true);
  assert.ok(p.annulla());
  assert.equal(p.barattoli[da].length, prima);
  assert.equal(p.barattoli[da][prima - r.n - 1].coperto, false);
});

test('la mossa non valida non cambia nulla', () => {
  const p = new Partita(3);
  const pieno = p.barattoli.findIndex((x) => x.length === CAPIENZA);
  const altro = p.barattoli.findIndex((x, i) => i !== pieno && x.length === CAPIENZA);
  const prima = JSON.stringify(p.barattoli);
  assert.equal(p.sposta(pieno, altro), null);
  assert.equal(JSON.stringify(p.barattoli), prima);
  assert.equal(p.mosse, 0);
});

test('aiuti: suggerimento valido e limitato, barattolo extra una volta sola, le stelle calano', () => {
  const p = new Partita(12);
  const s = p.suggerisci();
  assert.ok(p.puoSpostare(s.da, s.a));
  assert.equal(p.stelle(), 2);
  p.suggerisci();
  p.suggerisci();
  assert.equal(p.suggerisci(), null);
  const n = p.barattoli.length;
  assert.ok(p.aggiungiBarattolo());
  assert.equal(p.barattoli.length, n + 1);
  assert.equal(p.aggiungiBarattolo(), false);
  assert.equal(p.stelle(), 1);
  // Annullare dopo il barattolo extra non lo fa sparire
  const vuoto = p.barattoli.length - 1;
  const da = p.barattoli.findIndex((x) => x.length);
  p.sposta(da, vuoto);
  p.annulla();
  assert.equal(p.barattoli.length, n + 1);
});

test('ricomincia riporta il livello all\'inizio', () => {
  const p = new Partita(4);
  const inizio = JSON.stringify(p.barattoli);
  const m = risolvi(p.barattoli)[0];
  p.sposta(m.da, m.a);
  p.ricomincia();
  assert.equal(JSON.stringify(p.barattoli), inizio);
  assert.equal(p.mosse, 0);
});

test('bloccata: nessuna mossa possibile', () => {
  const p = new Partita(1);
  p.barattoli = [b('olive', 'mais', 'olive', 'mais'), b('mais', 'olive', 'mais', 'olive')];
  assert.equal(p.bloccata(), true);
  p.barattoli.push([]);
  assert.equal(p.bloccata(), false);
});

test('seguendo solo gli aiuti si arriva sempre alla fine, senza rimbalzi', () => {
  for (const n of [1, 5, 9, 14, 21]) {
    const p = new Partita(n);
    let passi = 0;
    while (!p.vinta && passi < 200) {
      p.suggerimenti = 1;
      const m = p.suggerisci();
      assert.ok(m, `livello ${n}: nessun aiuto al passo ${passi}`);
      assert.ok(p.sposta(m.da, m.a));
      passi++;
    }
    assert.ok(p.vinta, `livello ${n}: non finito in 200 passi`);
  }
});
