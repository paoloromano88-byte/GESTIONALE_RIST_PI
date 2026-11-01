// Prove del modulo categorie-menu.js (sezioni del menu aggiunte dal locale). Non serve l'emulatore:
//   node test/categorie-menu.test.mjs
import assert from 'node:assert/strict';
import { nuovoIdSezione, sezioniValide, applicaSezioni, etichettaDaId, repartoSezione, senzaAggiunte, isSezione, MAX_SEZIONI } from '../categorie-menu.js';
import { datiMessaggioCucina, datiOrdine } from '../comande-escpos.js';

let ok = 0, ko = 0;
const t = (nome, fn) => {
    try { fn(); ok++; console.log('  ✔', nome); }
    catch (e) { ko++; console.log('  ✘', nome, '->', e.message.split('\n')[0]); }
};

console.log('Sezioni del menu (categorie-menu.js):');

t('id dal nome: minuscolo, senza accenti e simboli, con prefisso sez_', () => {
    assert.equal(nuovoIdSezione('Panini'), 'sez_panini');
    assert.equal(nuovoIdSezione('  Caffè & Gelati!  '), 'sez_caffe_gelati');
    assert.equal(nuovoIdSezione('Più Pizze Fritte'), 'sez_piu_pizze_fritte');
});

t('id unico: se c\'è già si aggiunge un numero', () => {
    assert.equal(nuovoIdSezione('Panini', ['sez_panini']), 'sez_panini_2');
    assert.equal(nuovoIdSezione('Panini', ['sez_panini', 'sez_panini_2']), 'sez_panini_3');
});

t('id con nome fatto solo di simboli o lunghissimo: resta valido', () => {
    assert.ok(isSezione(nuovoIdSezione('!!!')));
    const lungo = nuovoIdSezione('a'.repeat(200));
    assert.ok(isSezione(lungo) && lungo.length <= 44);
});

t('isSezione: solo gli id sez_ (le categorie di sempre no)', () => {
    assert.ok(isSezione('sez_panini'));
    assert.ok(!isSezione('pizza') && !isSezione('bibita_bottiglia') && !isSezione('sez_') && !isSezione('sez_A B') && !isSezione(null));
});

t('sezioniValide: tiene solo voci corrette, completa i valori mancanti, niente doppioni', () => {
    const s = sezioniValide({ sezioni: [
        { id: 'sez_panini', nome: '  Panini  ', reparto: 'pizzeria', aggiunte: true },
        { id: 'sez_gelati', nome: 'Gelati' },
        { id: 'sez_panini', nome: 'Doppione' },
        { id: 'pizza', nome: 'Finta pizza' },
        { id: 'sez_vuota', nome: '   ' },
        { id: 'sez_x', nome: 'X', reparto: 'cantina' },
        null, 'testo',
    ] });
    assert.deepEqual(s, [
        { id: 'sez_panini', nome: 'Panini', reparto: 'pizzeria', aggiunte: true, app_clienti: true },
        { id: 'sez_gelati', nome: 'Gelati', reparto: 'cucina', aggiunte: false, app_clienti: true },
        { id: 'sez_x', nome: 'X', reparto: 'cucina', aggiunte: false, app_clienti: true },
    ]);
    assert.deepEqual(sezioniValide(null), []);
    assert.deepEqual(sezioniValide({ sezioni: 'no' }), []);
});

t('sezioniValide: nome al massimo 40 caratteri, al massimo MAX_SEZIONI sezioni', () => {
    assert.equal(sezioniValide({ sezioni: [{ id: 'sez_a', nome: 'x'.repeat(90) }] })[0].nome.length, 40);
    const tante = Array.from({ length: MAX_SEZIONI + 5 }, (_, i) => ({ id: `sez_s${i}`, nome: `S${i}` }));
    assert.equal(sezioniValide({ sezioni: tante }).length, MAX_SEZIONI);
});

t('applicaSezioni: aggiunge in fondo all\'ordine e alle etichette, toglie quelle eliminate', () => {
    const ordine = ['pizza', 'bibita', 'sez_vecchia'];
    const etichette = { pizza: 'Pizze', bibita: 'Bibite', sez_vecchia: 'Vecchia' };
    applicaSezioni([{ id: 'sez_panini', nome: 'Panini' }, { id: 'sez_fritti', nome: 'Fritti' }], ordine, etichette);
    assert.deepEqual(ordine, ['pizza', 'bibita', 'sez_panini', 'sez_fritti']);
    assert.equal(etichette.sez_panini, 'Panini');
    assert.equal(etichette.sez_vecchia, undefined);
    assert.equal(etichette.pizza, 'Pizze');
    applicaSezioni([{ id: 'sez_fritti', nome: 'Fritti misti' }], ordine, etichette, { maiuscolo: true });
    assert.deepEqual(ordine, ['pizza', 'bibita', 'sez_fritti']);
    assert.equal(etichette.sez_fritti, 'FRITTI MISTI');
});

t('applicaSezioni con filtro: es. App Clienti solo le sezioni ordinabili', () => {
    const ordine = ['pizza'];
    const etichette = {};
    applicaSezioni([{ id: 'sez_a', nome: 'A', app_clienti: true }, { id: 'sez_b', nome: 'B', app_clienti: false }], ordine, etichette, { filtro: s => s.app_clienti !== false });
    assert.deepEqual(ordine, ['pizza', 'sez_a']);
});

t('etichettaDaId: nome leggibile anche senza leggere le impostazioni', () => {
    assert.equal(etichettaDaId('sez_pizze_fritte'), 'Pizze fritte');
    assert.equal(etichettaDaId('pizza'), 'PIZZA');
});

t('senzaAggiunte: categorie di sempre come prima, sezioni secondo la loro impostazione', () => {
    const sez = [{ id: 'sez_panini', aggiunte: true }, { id: 'sez_gelati', aggiunte: false }];
    assert.ok(senzaAggiunte('bibita', sez) && senzaAggiunte('dolce', sez));
    assert.ok(!senzaAggiunte('pizza', sez));
    assert.ok(!senzaAggiunte('sez_panini', sez));
    assert.ok(senzaAggiunte('sez_gelati', sez));
    assert.ok(senzaAggiunte('sez_sconosciuta', sez));
});

t('repartoSezione: per le sezioni conta la configurazione delle stampanti; per le altre null', () => {
    const stampanti = { pizzeria: { cats: ['pizza', 'sez_panini'] }, cucina: { cats: ['primo', 'sez_fritti'] }, bar: { cats: ['bibita', 'sez_cocktail'] } };
    assert.equal(repartoSezione('sez_panini', stampanti), 'pizzeria');
    assert.equal(repartoSezione('sez_fritti', stampanti), 'cucina');
    assert.equal(repartoSezione('sez_cocktail', stampanti), 'bar');
    assert.equal(repartoSezione('sez_altro', stampanti), null);
    assert.equal(repartoSezione('pizza', stampanti), null);
    assert.equal(repartoSezione('sez_panini', null), null);
});

console.log('Stampa delle sezioni (comande-escpos.js):');
const STAMPANTI = { pizzeria: { ip: '1.1.1.1', cats: ['pizza', 'sez_panini'] }, cucina: { ip: '1.1.1.2', cats: ['primo', 'sez_bar_fritti'] }, bar: { ip: '1.1.1.3', cats: ['bibita', 'sez_cocktail'] } };
const testo = (d) => (d ? d.data.join('') : '');
const tavolo = (prodotti, messaggio, extra = {}) => ({ tavolo: '5', prodotti, messaggio_cucina: messaggio, ...extra });

t('comanda dell\'ordine: la sezione va alla stampante del suo reparto', () => {
    const o = tavolo([{ nome: 'Panino salsiccia', prezzo: 6, qta: 1, cat: 'sez_panini', turno: 1 }, { nome: 'Spritz', prezzo: 5, qta: 1, cat: 'sez_cocktail', turno: 1 }]);
    assert.match(testo(datiOrdine(o, 'PIZZERIA', STAMPANTI)), /Panino salsiccia/);
    assert.equal(datiOrdine(o, 'CUCINA', STAMPANTI), null);
    assert.match(testo(datiOrdine(o, 'BAR', STAMPANTI)), /Spritz/);
});

t('aggiunta al tavolo: sezione nel reparto della configurazione (anche se il nome somiglia ad altro)', () => {
    const p = { nome: 'Crocchette', prezzo: 4, qta: 1, cat: 'sez_bar_fritti', turno: 1 };
    const o = tavolo([p], 'AGGIUNTA', { ultime_aggiunte_real: [p] });
    const ctx = { stampanti: STAMPANTI };
    assert.match(testo(datiMessaggioCucina(o, 'cucina', ctx)), /Crocchette/);
    assert.equal(datiMessaggioCucina(o, 'bar', ctx), null);
    assert.equal(datiMessaggioCucina(o, 'pizzeria', ctx), null);
});

t('VIA TURNO: la sezione viene chiamata nel suo reparto', () => {
    const o = tavolo([{ nome: 'Panino salsiccia', prezzo: 6, qta: 1, cat: 'sez_panini', turno: 2 }], 'VIA TURNO 2');
    const ctx = { stampanti: STAMPANTI };
    assert.match(testo(datiMessaggioCucina(o, 'pizzeria', ctx)), /VAI COL 2/);
    assert.equal(datiMessaggioCucina(o, 'cucina', ctx), null);
});

t('categorie di sempre: nessun cambiamento anche con la configurazione nel contesto', () => {
    const p = { nome: 'Margherita', prezzo: 6, qta: 1, cat: 'pizza', turno: 1 };
    const a = tavolo([p], 'AGGIUNTA', { ultime_aggiunte_real: [p] });
    for (const rep of ['pizzeria', 'cucina', 'bar']) {
        assert.equal(testo(datiMessaggioCucina(a, rep, { stampanti: STAMPANTI })), testo(datiMessaggioCucina(a, rep, {})));
    }
});

console.log(`\nRISULTATO: ${ok} ok, ${ko} falliti`);
process.exit(ko ? 1 : 0);
