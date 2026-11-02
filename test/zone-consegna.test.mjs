// Prove di zone-consegna.js: fascia d'arrivo stimata per la consegna a domicilio. Senza emulatore:
//   node test/zone-consegna.test.mjs
import assert from 'node:assert/strict';
import { margineConsegna, fasciaArrivo, testoFasciaArrivo, MARGINE_CONSEGNA_PREDEFINITO } from '../zone-consegna.js';

let ok = 0, ko = 0;
const t = (nome, fn) => {
    try { fn(); ok++; console.log('  ✔', nome); }
    catch (e) { ko++; console.log('  ✘', nome, '->', e.message.split('\n')[0]); }
};

console.log('Fascia d\'arrivo della consegna:');

t('margine: quello impostato dal locale (0-120 minuti), altrimenti 15', () => {
    assert.equal(MARGINE_CONSEGNA_PREDEFINITO, 15);
    assert.equal(margineConsegna({ margine_consegna: 20 }), 20);
    assert.equal(margineConsegna({ margine_consegna: '10' }), 10);
    assert.equal(margineConsegna({ margine_consegna: 0 }), 0, '0 = non mostrare la fascia');
    assert.equal(margineConsegna({}), 15);
    assert.equal(margineConsegna(null), 15);
    assert.equal(margineConsegna({ margine_consegna: -5 }), 15);
    assert.equal(margineConsegna({ margine_consegna: 'abc' }), 15);
    assert.equal(margineConsegna({ margine_consegna: 500 }), 120);
});

t('fascia: dall\'orario scelto all\'orario più il margine', () => {
    assert.deepEqual(fasciaArrivo('20:30', 15), { da: '20:30', a: '20:45' });
    assert.deepEqual(fasciaArrivo('19:00', 20), { da: '19:00', a: '19:20' });
    assert.deepEqual(fasciaArrivo('20:45', 30), { da: '20:45', a: '21:15' });
    assert.deepEqual(fasciaArrivo('9:05', 10), { da: '09:05', a: '09:15' }, 'orario con un\'ora sola cifra');
});

t('fascia a cavallo della mezzanotte', () => {
    assert.deepEqual(fasciaArrivo('23:50', 15), { da: '23:50', a: '00:05' });
});

t('niente fascia con margine 0 o orario non valido', () => {
    assert.equal(fasciaArrivo('20:30', 0), null);
    assert.equal(fasciaArrivo('', 15), null);
    assert.equal(fasciaArrivo('PIENO', 15), null);
    assert.equal(fasciaArrivo('25:00', 15), null);
    assert.equal(fasciaArrivo(null, 15), null);
});

t('testo per il cliente', () => {
    assert.equal(testoFasciaArrivo('20:30', 15), 'Arrivo previsto tra le 20:30 e le 20:45');
    assert.equal(testoFasciaArrivo('20:30', 0), '');
});

console.log(`\nRISULTATO: ${ok} ok, ${ko} falliti`);
process.exit(ko ? 1 : 0);
