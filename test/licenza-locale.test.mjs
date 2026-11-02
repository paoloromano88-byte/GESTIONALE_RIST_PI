// Prove di licenza-locale.js (moduli accesi/spenti dal Super Admin). Senza emulatore:
//   node test/licenza-locale.test.mjs
import assert from 'node:assert/strict';
import { motivoBlocco, moduloAcceso } from '../licenza-locale.js';

let ok = 0, ko = 0;
const t = (nome, fn) => {
    try { fn(); ok++; console.log('  ✔', nome); }
    catch (e) { ko++; console.log('  ✘', nome, '->', e.message.split('\n')[0]); }
};

console.log('Licenza del locale:');

t('moduloAcceso: un modulo spento vale false, uno assente (o licenza mancante) vale acceso', () => {
    const lic = { attiva: true, moduli: { agenda: false, rider: true } };
    assert.equal(moduloAcceso(lic, 'agenda'), false);
    assert.equal(moduloAcceso(lic, 'rider'), true);
    assert.equal(moduloAcceso(lic, 'kds'), true, 'modulo nuovo non ancora nella licenza: acceso');
    assert.equal(moduloAcceso(null, 'agenda'), true, 'licenza mai creata: tutto acceso');
    assert.equal(moduloAcceso({ attiva: true }, 'agenda'), true, 'licenza senza moduli: tutto acceso');
});

t('moduloAcceso con più moduli: basta che uno sia acceso (es. Mappa Sale per Sala o Agenda)', () => {
    assert.equal(moduloAcceso({ moduli: { sala: false, agenda: true } }, 'sala', 'agenda'), true);
    assert.equal(moduloAcceso({ moduli: { sala: false, agenda: false } }, 'sala', 'agenda'), false);
});

t('motivoBlocco invariato', () => {
    assert.equal(motivoBlocco({ attiva: false }, 'kds'), 'sospesa');
    assert.equal(motivoBlocco({ moduli: { kds: false } }, 'kds'), 'modulo');
    assert.equal(motivoBlocco({ moduli: {} }, 'kds'), null);
    assert.equal(motivoBlocco(null, 'kds'), null);
});

console.log(`\nRISULTATO: ${ok} ok, ${ko} falliti`);
process.exit(ko ? 1 : 0);
