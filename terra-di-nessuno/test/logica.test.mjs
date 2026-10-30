import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Partita, ARMI, COSTRUZIONI, ZOMBIE, CICLO, GIORNO, FUOCO } from '../src/logica.js';
import { generaMappa, terrenoIn, OGGETTI, FITTO, PAVIMENTO } from '../src/mondo.js';

const nuova = (seme = 42) => new Partita({ seme });

function accanto(p, tipo) {
  const o = p.oggetti.find((x) => x.tipo === tipo && x.colpi > 0);
  const bordo = tipo === 'auto' || tipo === 'polizia' ? 30 : OGGETTI[tipo].raggio;
  p.io.x = o.x;
  p.io.y = o.y + bordo + p.io.raggio + 4;
  if (tipo === 'auto' || tipo === 'polizia') p.io.y = o.y + (o.orizzontale ? 22 : 45) + p.io.raggio + 2;
  return p.bersaglio()?.ref;
}

function premi(p, volte = 1) {
  for (let i = 0; i < volte; i++) {
    p.io.attesa = 0;
    p.aggiorna(0.01, { azione: true });
  }
}

function zombie(p, tipo, dx, dy, extra = {}) {
  const z = { id: 900 + p.zombie.length, tipo, x: p.io.x + dx, y: p.io.y + dy, raggio: ZOMBIE[tipo].raggio, vita: ZOMBIE[tipo].vita, vitaMax: ZOMBIE[tipo].vita, danno: ZOMBIE[tipo].danno, attesa: 0, colpito: 0, fase: 0, stato: 'insegue', bloccato: 0, deviazione: 0, ...extra };
  p.zombie.push(z);
  return z;
}

test('la mappa: stessa mappa dallo stesso seme, bordi chiusi, paese e casali con muri e porte', () => {
  const a = generaMappa(7);
  const b = generaMappa(7);
  assert.deepEqual(a.terreno, b.terreno);
  assert.deepEqual(a.oggetti, b.oggetti);
  assert.ok(a.edifici.length >= 8);
  assert.ok(a.edifici.some((e) => e.tipo === 'casale'));
  for (const e of a.edifici) assert.ok(e.muri.length >= 5, 'ogni edificio ha una porta (un lato spezzato in due)');
  assert.equal(terrenoIn(a, 0, 0), FITTO);
  assert.notEqual(terrenoIn(a, a.partenza.x, a.partenza.y), FITTO);
  assert.ok(a.oggetti.some((o) => o.tipo === 'auto'));
  assert.ok(a.oggetti.filter((o) => o.edificio !== undefined).every((o) => terrenoIn(a, o.x, o.y) === PAVIMENTO));
});

test('non si attraversano muri, auto e bosco fitto', () => {
  const p = nuova();
  const e = p.mappa.edifici[0];
  p.io.x = e.x + e.w / 2;
  p.io.y = e.porta === 's' ? e.y - 60 : e.y + e.h + 60;
  const verso = e.porta === 's' ? 1 : -1;
  for (let i = 0; i < 200; i++) p.aggiorna(0.02, { mx: 0.0, my: verso });
  // Il lato opposto alla porta è un muro pieno: si resta fuori
  assert.ok(e.porta === 's' ? p.io.y < e.y : p.io.y > e.y + e.h);
  for (let i = 0; i < 3000; i++) p.aggiorna(0.02, { mx: -1, my: 0 });
  assert.notEqual(terrenoIn(p.mappa, p.io.x, p.io.y), FITTO);
});

test('frugare un\'auto dà qualcosa e la svuota; si ricarica dopo qualche giorno', () => {
  const p = nuova(3);
  p.casuale = () => 0;
  const auto = accanto(p, 'auto');
  assert.equal(auto.tipo, 'auto');
  premi(p);
  assert.ok(p.inventario.metallo >= 1);
  assert.equal(auto.colpi, 0);
  const ev = p.prendiEventi().find((e) => e.tipo === 'frugato');
  assert.ok(ev && Object.keys(ev.cosa).length);
  p.io.x += 600;
  p.giorno += OGGETTI.auto.ricresce + 1;
  p.aggiorna(0.01);
  assert.equal(auto.colpi, 1);
});

test('la pistola si trova nelle auto della polizia; la seconda volta diventa munizioni', () => {
  const p = nuova();
  p.casuale = () => 0;
  const pol = { id: p.oggetti.length, tipo: 'polizia', x: p.io.x + 80, y: p.io.y, orizzontale: true, colpi: 1, ricresce: 0 };
  p.oggetti.push(pol);
  p.indice.metti(pol);
  p.io.y = pol.y + 22 + p.io.raggio + 2;
  p.io.x = pol.x;
  premi(p);
  assert.ok(p.armi.pistola);
  assert.ok(p.inventario.munizioni >= 4);
});

test('tagliare alberi: con l\'ascia in mano il doppio, e l\'ascia si consuma', () => {
  const p = nuova();
  const albero = accanto(p, 'albero');
  assert.equal(albero.tipo, 'albero');
  premi(p);
  assert.equal(p.inventario.legna, 1);
  p.armi.ascia = { usura: 2 };
  p.armaAttiva = 'ascia';
  premi(p, 2);
  assert.equal(p.inventario.legna, 5);
  assert.equal(p.armi.ascia, undefined);
  assert.equal(p.armaAttiva, 'pugni');
  assert.ok(p.prendiEventi().some((e) => e.tipo === 'armaRotta'));
});

test('creare armi e oggetti consuma le risorse giuste', () => {
  const p = nuova();
  p.inventario = { legna: 10, metallo: 10, stoffa: 10 };
  assert.ok(p.crea('machete'));
  assert.equal(p.armaAttiva, 'machete');
  assert.equal(p.armi.machete.usura, ARMI.machete.usura);
  assert.equal(p.crea('machete'), false);
  assert.ok(p.crea('dardi'));
  assert.equal(p.inventario.dardi, 5);
  assert.ok(p.crea('bende'));
  assert.equal(p.inventario.bende, 1);
  assert.deepEqual([p.inventario.legna, p.inventario.metallo, p.inventario.stoffa], [9, 5, 7]);
});

test('combattere: il machete uccide uno zombie; la balestra spara senza rumore, la pistola fa rumore', () => {
  const p = nuova();
  p.armi.machete = { usura: 70 };
  p.armaAttiva = 'machete';
  const z = zombie(p, 'camminatore', 40, 0, { attesa: 9 });
  premi(p, 2);
  assert.ok(!p.zombie.includes(z));
  assert.equal(p.statistiche.uccisi, 1);
  assert.equal(p.armi.machete.usura, 68);

  p.armi.balestra = { usura: Infinity };
  p.armaAttiva = 'balestra';
  p.inventario.dardi = 3;
  zombie(p, 'camminatore', 200, 0, { attesa: 9, stato: 'vaga' });
  const lontano = zombie(p, 'camminatore', 300, 300, { attesa: 9, stato: 'vaga' });
  p.prendiEventi();
  premi(p);
  assert.equal(p.inventario.dardi, 2);
  assert.ok(!p.prendiEventi().some((e) => e.tipo === 'rumore'));
  assert.equal(lontano.stato, 'vaga');

  p.armi.pistola = { usura: Infinity };
  p.armaAttiva = 'pistola';
  p.inventario.munizioni = 2;
  premi(p);
  assert.equal(p.inventario.munizioni, 1);
  assert.equal(lontano.stato, 'insegue');
});

test('senza colpi l\'arma a distanza non spara: si va a pugni da vicino', () => {
  const p = nuova();
  p.armi.pistola = { usura: Infinity };
  p.armaAttiva = 'pistola';
  zombie(p, 'camminatore', 200, 0, { attesa: 9 });
  assert.equal(p.bersaglio(), null);
  const vicino = zombie(p, 'camminatore', 34, 0, { attesa: 9 });
  assert.equal(p.bersaglio().azione, 'colpisci');
  premi(p);
  assert.equal(vicino.vita, ZOMBIE.camminatore.vita - ARMI.pugni.danno);
});

test('gli zombie feriscono, vagano finché non vedono, e sfondano le barricate', () => {
  const p = nuova();
  const z = zombie(p, 'camminatore', 30, 0);
  p.aggiorna(0.05);
  assert.ok(p.io.salute < 100);
  const pigro = zombie(p, 'camminatore', 1000, 0, { stato: 'vaga' });
  p.aggiorna(0.05);
  assert.equal(pigro.stato, 'vaga');
  pigro.x = p.io.x + 150;
  pigro.y = p.io.y;
  p.aggiorna(0.05);
  assert.equal(pigro.stato, 'insegue');

  const q = nuova();
  q.inventario = { legna: 4 };
  q.io.guarda = Math.PI / 2;
  q.crea('barricata');
  assert.ok(q.piazza());
  const b = q.strutture[0];
  const att = zombie(q, 'camminatore', 0, 0);
  att.x = b.x + 40;
  att.y = b.y;
  q.io.salute = 1e9;
  q.aggiorna(0.05);
  assert.equal(b.vita, COSTRUZIONI.barricata.vita - att.danno);
});

test('trappole: feriscono chi ci passa e si consumano', () => {
  const p = nuova();
  p.inventario = { legna: 2, metallo: 2 };
  p.io.guarda = 0;
  p.crea('trappola');
  assert.ok(p.piazza());
  const t = p.strutture[0];
  const z = zombie(p, 'corazzato', 0, 0, { attesa: 9 });
  z.x = t.x;
  z.y = t.y;
  p.aggiorna(0.01);
  assert.equal(z.vita, ZOMBIE.corazzato.vita - COSTRUZIONI.trappola.danno);
  assert.equal(t.colpi, COSTRUZIONI.trappola.colpi - 1);
});

test('fame e sete: si mangia e si beve; a zero si perde salute fino alla fine', () => {
  const p = nuova();
  p.io.fame = 10;
  p.io.sete = 10;
  p.inventario = { cibo: 1, acqua: 1 };
  assert.ok(p.usa('cibo'));
  assert.ok(p.usa('acqua'));
  assert.equal(p.io.fame, 45);
  assert.equal(p.io.sete, 50);
  assert.equal(p.usa('cibo'), false);
  p.io.fame = 0;
  p.io.sete = 0;
  p.io.salute = 5;
  for (let i = 0; i < 5 && !p.finita; i++) p.aggiorna(1);
  assert.ok(p.finita);
});

test('notte: arrivano gli zombie; all\'alba i lontani se ne vanno e il raccoglitore si riempie', () => {
  const p = nuova();
  p.io.salute = 1e9;
  p.inventario = { legna: 3, stoffa: 3 };
  p.io.guarda = 0;
  p.crea('raccoglitore');
  p.piazza();
  p.tempo = GIORNO;
  let massimo = 0;
  while (p.giorno === 1 && !p.finita) {
    p.io.salute = 100;
    p.aggiorna(0.1);
    massimo = Math.max(massimo, p.zombie.filter((z) => z.notturno).length);
  }
  assert.ok(massimo > 3);
  assert.ok(p.zombie.every((z) => !z.notturno || Math.hypot(z.x - p.io.x, z.y - p.io.y) < 500));
  assert.equal(p.strutture[0].acqua, 2);
  // Con uno zombie vicino il tasto azione attaccherebbe: per prendere l'acqua serve campo libero
  p.zombie = [];
  // Durante la notte gli zombie l'hanno spinto via: torna accanto al raccoglitore
  p.io.x = p.strutture[0].x;
  p.io.y = p.strutture[0].y - COSTRUZIONI.raccoglitore.raggio - p.io.raggio - 6;
  premi(p);
  assert.equal(p.inventario.acqua, 2);
});

test('il falò si consuma e si alimenta con la legna dal tasto azione', () => {
  const p = nuova();
  p.inventario = { legna: 6 };
  p.io.guarda = 0;
  p.crea('falo');
  p.piazza();
  const f = p.strutture[0];
  p.aggiorna(FUOCO.iniziale + 1);
  assert.equal(p.luci().length, 0);
  assert.equal(p.bersaglio()?.azione, 'alimenta');
  premi(p);
  assert.ok(Math.abs(f.fuoco - FUOCO.perLegna) < 0.1);
  assert.equal(p.luci().length, 1);
});

test('salvare e ricaricare', () => {
  const p = nuova(5);
  p.inventario = { legna: 10, metallo: 5 };
  p.crea('bastone');
  p.armi.bastone.usura = 7;
  p.io.guarda = 0;
  p.crea('barricata');
  p.piazza();
  p.aggiorna(3);
  const q = Partita.carica(JSON.parse(JSON.stringify(p.salva())));
  assert.equal(q.armaAttiva, 'bastone');
  assert.equal(q.armi.bastone.usura, 7);
  assert.deepEqual(q.inventario, p.inventario);
  assert.deepEqual(q.strutture, p.strutture);
  assert.ok(Math.abs(q.tempo - p.tempo) < 1e-9);
  assert.equal(q.io.x, p.io.x);
});
