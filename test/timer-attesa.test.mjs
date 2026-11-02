// Prove di timer-attesa.js (timer di attesa in Cassa e App Rider). Senza emulatore:
//   node test/timer-attesa.test.mjs
import assert from 'node:assert/strict';
import { timerOrario, timerPronto, timerConsegna, timerOrdine, testoDurata, htmlTimer } from '../timer-attesa.js';

let ok = 0, ko = 0;
const t = (nome, fn) => {
    try { fn(); ok++; console.log('  ✔', nome); }
    catch (e) { ko++; console.log('  ✘', nome, '->', e.message.split('\n')[0]); }
};

// Ore italiane: novembre = UTC+1, luglio = UTC+2
const OGGI = '2026-11-02';
const roma = (hhmm, data = OGGI) => new Date(`${data}T${hhmm}:00+01:00`);
const asporto = (extra = {}) => ({ tipo: 'ASPORTO', stato: 'In attesa', orario: '20:30', data_ritiro: OGGI, ...extra });
const domicilio = (extra = {}) => ({ tipo: 'DOMICILIO', indirizzo: 'Via Roma 1', stato: 'In attesa', orario: '20:30', data_ritiro: OGGI, ...extra });
const ts = (d) => ({ toMillis: () => d.getTime() });   // come un Timestamp di Firestore

console.log('Durate:');
t('testo della durata: minuti, ore e minuti', () => {
    assert.equal(testoDurata(0), 'meno di 1 min');
    assert.equal(testoDurata(1), '1 min');
    assert.equal(testoDurata(59), '59 min');
    assert.equal(testoDurata(60), '1 h');
    assert.equal(testoDurata(75), '1 h 15 min');
});

console.log('Conto alla rovescia all\'orario:');
t('asporto: mancano N minuti al ritiro (verde lontano, arancione negli ultimi 10)', () => {
    assert.deepEqual(timerOrario(asporto(), roma('20:00')), { tipo: 'orario', livello: 'ok', minuti: 30, testo: '⏱ Ritiro tra 30 min' });
    assert.equal(timerOrario(asporto(), roma('20:20')).livello, 'vicino');
    assert.equal(timerOrario(asporto(), roma('20:21')).testo, '⏱ Ritiro tra 9 min');
    assert.equal(timerOrario(asporto(), roma('18:15')).testo, '⏱ Ritiro tra 2 h 15 min');
});

t('dopo l\'orario: rosso «in ritardo di N min»', () => {
    const r = timerOrario(asporto(), roma('20:42'));
    assert.equal(r.livello, 'ritardo');
    assert.equal(r.minuti, -12);
    assert.equal(r.testo, '⚠️ In ritardo di 12 min');
});

t('domicilio: conta fino alla fine della fascia «Arrivo previsto» (orario + margine)', () => {
    assert.equal(timerOrario(domicilio(), roma('20:00'), 15).testo, '⏱ Consegna entro 45 min');
    assert.equal(timerOrario(domicilio(), roma('20:40'), 15).livello, 'vicino');
    assert.equal(timerOrario(domicilio(), roma('20:50'), 15).testo, '⚠️ In ritardo di 5 min');
    assert.equal(timerOrario(domicilio(), roma('20:00'), 0).testo, '⏱ Consegna entro 30 min', 'margine 0: l\'orario');
    assert.equal(timerOrario(domicilio(), roma('20:00')).testo, '⏱ Consegna entro 30 min', 'senza margine: l\'orario');
    // un ordine con indirizzo ma senza tipo è a domicilio (come nel resto della Cassa)
    assert.match(timerOrario({ ...domicilio(), tipo: undefined }, roma('20:00'), 15).testo, /Consegna entro 45 min/);
});

t('ora estiva (UTC+2): stesso risultato in ora italiana', () => {
    const o = asporto({ data_ritiro: '2026-07-10' });
    assert.equal(timerOrario(o, new Date('2026-07-10T20:00:00+02:00')).testo, '⏱ Ritiro tra 30 min');
});

t('niente timer: tavoli, ordini chiusi o annullati, senza orario, altri giorni, ritardo oltre 3 ore', () => {
    assert.equal(timerOrario({ tipo: 'SALA', stato: 'In forno', orario: '20:30', data_ritiro: OGGI }, roma('20:00')), null);
    assert.equal(timerOrario(asporto({ stato: 'Consegnato' }), roma('20:00')), null);
    assert.equal(timerOrario(asporto({ stato: 'Annullato' }), roma('20:00')), null);
    assert.equal(timerOrario(domicilio({ stato_consegna: 'Consegnato' }), roma('20:00')), null);
    assert.equal(timerOrario(asporto({ orario: '' }), roma('20:00')), null);
    assert.equal(timerOrario(asporto({ orario: '25:99' }), roma('20:00')), null);
    assert.equal(timerOrario(asporto({ data_ritiro: '2026-11-03' }), roma('20:00')), null, 'domani');
    assert.equal(timerOrario(asporto({ orario: '12:00' }), roma('20:00')), null, 'oltre 3 ore di ritardo');
    assert.equal(timerOrario(null, roma('20:00')), null);
});

t('domicilio già pagato in cassa ma non ancora consegnato dal rider: il timer resta', () => {
    assert.ok(timerOrario(domicilio({ stato: 'Consegnato', stato_consegna: 'In consegna' }), roma('20:00'), 15));
    assert.ok(timerOrario(domicilio({ stato: 'Consegnato' }), roma('20:00'), 15));
});

t('senza data di ritiro vale oggi', () => {
    assert.equal(timerOrario(asporto({ data_ritiro: undefined }), roma('20:00')).minuti, 30);
});

console.log('Pronto da quanto:');
t('pronto da N minuti (verde, arancione da 5, rosso da 10)', () => {
    const o = asporto({ stato: 'Pronto', pronto_alle: ts(roma('20:10')) });
    assert.deepEqual(timerPronto(o, roma('20:13')), { tipo: 'pronto', livello: 'ok', minuti: 3, testo: '🍕 Pronto da 3 min' });
    assert.equal(timerPronto(o, roma('20:15')).livello, 'vicino');
    assert.equal(timerPronto(o, roma('20:20')).livello, 'ritardo');
    assert.equal(timerPronto(o, roma('20:10')).testo, '🍕 Pronto da meno di 1 min');
});

t('accetta Timestamp, Date, millisecondi e {seconds}', () => {
    const d = roma('20:10');
    for (const v of [ts(d), d, d.getTime(), { seconds: d.getTime() / 1000 }, { toDate: () => d }]) {
        assert.equal(timerPronto(asporto({ stato: 'Pronto', pronto_alle: v }), roma('20:14')).minuti, 4);
    }
});

t('niente «pronto da»: non pronto, tavoli, già preso dal rider, senza ora (ordini vecchi o ora non ancora arrivata dal server)', () => {
    const p = ts(roma('20:10'));
    assert.equal(timerPronto(asporto({ stato: 'In forno', pronto_alle: p }), roma('20:20')), null);
    assert.equal(timerPronto({ tipo: 'SALA', stato: 'Pronto', pronto_alle: p }, roma('20:20')), null);
    assert.equal(timerPronto(domicilio({ stato: 'Pronto', pronto_alle: p, stato_consegna: 'In consegna' }), roma('20:20')), null);
    assert.equal(timerPronto(asporto({ stato: 'Pronto' }), roma('20:20')), null);
    assert.equal(timerPronto(asporto({ stato: 'Pronto', pronto_alle: null }), roma('20:20')), null);
});

t('orologio del dispositivo un po\' indietro: mai minuti negativi', () => {
    assert.equal(timerPronto(asporto({ stato: 'Pronto', pronto_alle: ts(roma('20:10')) }), roma('20:09')).minuti, 0);
});

console.log('In consegna da quanto:');
t('in consegna da N minuti (verde, arancione da 20, rosso da 30)', () => {
    const o = domicilio({ stato: 'Pronto', stato_consegna: 'In consegna', fattorino: 'Marco', timestamp_consegna_avvio: ts(roma('20:00')) });
    assert.deepEqual(timerConsegna(o, roma('20:12')), { tipo: 'consegna', livello: 'ok', minuti: 12, testo: '🛵 In consegna da 12 min' });
    assert.equal(timerConsegna(o, roma('20:20')).livello, 'vicino');
    assert.equal(timerConsegna(o, roma('20:30')).livello, 'ritardo');
});

t('niente «in consegna da»: non partito, consegnato, senza ora di partenza', () => {
    const avvio = ts(roma('20:00'));
    assert.equal(timerConsegna(domicilio({ timestamp_consegna_avvio: avvio }), roma('20:10')), null);
    assert.equal(timerConsegna(domicilio({ stato_consegna: 'Consegnato', timestamp_consegna_avvio: avvio }), roma('20:10')), null);
    assert.equal(timerConsegna(domicilio({ stato_consegna: 'In consegna' }), roma('20:10')), null);
});

console.log('Tutti insieme:');
t('timerOrdine: orario + pronto / in consegna, nell\'ordine', () => {
    const pronto = domicilio({ stato: 'Pronto', pronto_alle: ts(roma('20:10')) });
    assert.deepEqual(timerOrdine(pronto, roma('20:15'), 15).map(x => x.tipo), ['orario', 'pronto']);
    const via = domicilio({ stato: 'Pronto', stato_consegna: 'In consegna', timestamp_consegna_avvio: ts(roma('20:20')) });
    assert.deepEqual(timerOrdine(via, roma('20:25'), 15).map(x => x.tipo), ['orario', 'consegna']);
    assert.deepEqual(timerOrdine(domicilio({ stato_consegna: 'Consegnato' }), roma('20:25'), 15), []);
    assert.deepEqual(timerOrdine({ tipo: 'SALA', stato: 'Pronto', pronto_alle: ts(roma('20:10')) }, roma('20:25')), []);
});

t('htmlTimer: un riquadro colorato per timer, vuoto se non ce ne sono', () => {
    const h = htmlTimer(timerOrdine(asporto({ stato: 'Pronto', pronto_alle: ts(roma('20:00')) }), roma('20:35')));
    assert.match(h, /class="timer-badge timer-ritardo"[^>]*>⚠️ In ritardo di 5 min</);
    assert.match(h, /class="timer-badge timer-ritardo"[^>]*>🍕 Pronto da 35 min</);
    assert.equal(htmlTimer([]), '');
});

console.log(`\nRISULTATO: ${ok} ok, ${ko} falliti`);
process.exit(ko ? 1 : 0);
