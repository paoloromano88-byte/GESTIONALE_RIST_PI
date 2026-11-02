// Prove di ruoli-dipendenti.js (chi entra in Palmare Sala, Agenda e App Rider col proprio PIN). Senza emulatore:
//   node test/ruoli-dipendenti.test.mjs
import assert from 'node:assert/strict';
import { ruoloDipendente, puoEntrare, cercaPin, NOMI_APP } from '../ruoli-dipendenti.js';

let ok = 0, ko = 0;
const t = (nome, fn) => {
    try { fn(); ok++; console.log('  ✔', nome); }
    catch (e) { ko++; console.log('  ✘', nome, '->', e.message.split('\n')[0]); }
};

const DIP = [
    { id: 'c1', nome: 'Giulia', pin: '1111', ruolo: 'cameriere' },
    { id: 'r1', nome: 'Marco', pin: '2222', ruolo: 'rider' },
    { id: 'm1', nome: 'Anna', pin: '3333', ruolo: 'responsabile' },
    { id: 'v1', nome: 'Luca', pin: '4444' },                 // creato prima dei ruoli: vale cameriere
    { id: 'x1', nome: 'Sara', pin: ' 5555 ', ruolo: 'boh' },  // ruolo sconosciuto: vale cameriere
];

console.log('Ruoli dei dipendenti:');

t('ruolo: rider e responsabile come sono; tutto il resto (anche vuoto) è cameriere', () => {
    assert.equal(ruoloDipendente(DIP[0]), 'cameriere');
    assert.equal(ruoloDipendente(DIP[1]), 'rider');
    assert.equal(ruoloDipendente(DIP[2]), 'responsabile');
    assert.equal(ruoloDipendente(DIP[3]), 'cameriere');
    assert.equal(ruoloDipendente(DIP[4]), 'cameriere');
    assert.equal(ruoloDipendente(null), 'cameriere');
});

t('Palmare Sala e Agenda: cameriere e responsabile sì, rider no', () => {
    for (const app of ['sala', 'agenda']) {
        assert.ok(puoEntrare(DIP[0], app) && puoEntrare(DIP[2], app) && puoEntrare(DIP[3], app));
        assert.ok(!puoEntrare(DIP[1], app));
    }
});

t('App Rider: rider e responsabile sì, cameriere no', () => {
    assert.ok(puoEntrare(DIP[1], 'rider') && puoEntrare(DIP[2], 'rider'));
    assert.ok(!puoEntrare(DIP[0], 'rider') && !puoEntrare(DIP[3], 'rider'));
});

t('app sconosciuta: nessuno entra', () => {
    assert.ok(!puoEntrare(DIP[2], 'cassa'));
});

t('cercaPin: PIN giusto e abilitato -> il dipendente', () => {
    assert.deepEqual(cercaPin(DIP, '1111', 'sala'), { dipendente: DIP[0] });
    assert.deepEqual(cercaPin(DIP, '2222', 'rider'), { dipendente: DIP[1] });
    assert.deepEqual(cercaPin(DIP, '3333', 'rider'), { dipendente: DIP[2] });
    assert.deepEqual(cercaPin(DIP, '5555', 'agenda'), { dipendente: DIP[4] }, 'spazi nel PIN salvato');
});

t('cercaPin: PIN di un ruolo non abilitato -> negato con il suo ruolo', () => {
    assert.deepEqual(cercaPin(DIP, '2222', 'sala'), { negato: 'rider' });
    assert.deepEqual(cercaPin(DIP, '1111', 'rider'), { negato: 'cameriere' });
    assert.deepEqual(cercaPin(DIP, '4444', 'rider'), { negato: 'cameriere' });
});

t('cercaPin: PIN inesistente o vuoto -> null', () => {
    assert.equal(cercaPin(DIP, '9999', 'sala'), null);
    assert.equal(cercaPin(DIP, '', 'sala'), null);
    assert.equal(cercaPin([], '1111', 'sala'), null);
});

t('cercaPin: due dipendenti con lo stesso PIN -> vince quello abilitato', () => {
    const doppi = [{ id: 'a', nome: 'R', pin: '7777', ruolo: 'rider' }, { id: 'b', nome: 'C', pin: '7777', ruolo: 'cameriere' }];
    assert.equal(cercaPin(doppi, '7777', 'sala').dipendente.id, 'b');
    assert.equal(cercaPin(doppi, '7777', 'rider').dipendente.id, 'a');
});

t('nomi delle app per i messaggi', () => {
    assert.equal(NOMI_APP.sala, 'Palmare Sala');
    assert.equal(NOMI_APP.rider, 'App Rider');
    assert.equal(NOMI_APP.agenda, 'Agenda');
});

console.log(`\nRISULTATO: ${ok} ok, ${ko} falliti`);
process.exit(ko ? 1 : 0);
