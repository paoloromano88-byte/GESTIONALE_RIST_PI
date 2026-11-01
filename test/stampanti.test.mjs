// Prove delle stampanti con nome e delle stampanti aggiunte dal locale (comande-escpos.js). Senza emulatore:
//   node test/stampanti.test.mjs
import assert from 'node:assert/strict';
import {
    stampantiAggiunte, repartiComande, nomeStampante, nuovoIdStampante, isStampanteAggiunta,
    datiOrdine, datiMessaggioCucina, MAX_STAMPANTI_AGGIUNTE
} from '../comande-escpos.js';
import { sezioniValide } from '../categorie-menu.js';

let ok = 0, ko = 0;
const t = (nome, fn) => {
    try { fn(); ok++; console.log('  ✔', nome); }
    catch (e) { ko++; console.log('  ✘', nome, '->', e.message.split('\n')[0]); }
};
const testo = (d) => (d ? d.data.join('') : '');

const BASE = {
    conto: { ip: '1.1.1.9' }, preconto: { ip: '' },
    pizzeria: { ip: '1.1.1.1', cats: ['pizza', 'ant_pizzeria'] },
    cucina: { ip: '1.1.1.2', cats: ['primo', 'ant_ristorante'] },
    bar: { ip: '1.1.1.3', cats: ['bibita', 'birra'] },
};
const CON_AGGIUNTE = {
    ...BASE,
    pizzeria: { ...BASE.pizzeria, nome: 'Forno a legna' },
    bar: { ...BASE.bar, nome: 'Bancone' },
    conto: { ...BASE.conto, nome: 'Cassa sala' },
    stm_friggitoria: { nome: 'Friggitoria', ip: '1.1.1.4', cats: ['ant_pizzeria', 'sez_fritti'] },
    stm_pasticceria: { nome: 'Pasticceria', ip: '1.1.1.5:9101', cats: ['dolce'] },
    stm_rotta: 'non è una stampante',
    metodo: 'agente',
};

console.log('Stampanti con nome e stampanti aggiunte:');

t('stampanti aggiunte: solo le voci stm_ valide, in ordine di nome', () => {
    assert.deepEqual(stampantiAggiunte(CON_AGGIUNTE).map(s => s.id), ['stm_friggitoria', 'stm_pasticceria']);
    assert.deepEqual(stampantiAggiunte(BASE), []);
    assert.deepEqual(stampantiAggiunte(null), []);
    assert.ok(isStampanteAggiunta('stm_friggitoria') && !isStampanteAggiunta('pizzeria') && !isStampanteAggiunta('stm_'));
});

t('reparti delle comande: i tre di sempre più le stampanti aggiunte', () => {
    assert.deepEqual(repartiComande(BASE), ['pizzeria', 'cucina', 'bar']);
    assert.deepEqual(repartiComande(CON_AGGIUNTE), ['pizzeria', 'cucina', 'bar', 'stm_friggitoria', 'stm_pasticceria']);
});

t('nome della stampante: quello scelto, altrimenti quello di sempre', () => {
    assert.equal(nomeStampante(CON_AGGIUNTE, 'pizzeria'), 'Forno a legna');
    assert.equal(nomeStampante(CON_AGGIUNTE, 'cucina'), 'CUCINA');
    assert.equal(nomeStampante(CON_AGGIUNTE, 'conto'), 'Cassa sala');
    assert.equal(nomeStampante(BASE, 'conto'), 'CASSA');
    assert.equal(nomeStampante(BASE, 'preconto'), 'PRECONTO');
    assert.equal(nomeStampante(CON_AGGIUNTE, 'stm_friggitoria'), 'Friggitoria');
    assert.equal(nomeStampante({ pizzeria: { nome: '   ' } }, 'pizzeria'), 'PIZZERIA');
});

t('id di una stampante nuova: dal nome, unico', () => {
    assert.equal(nuovoIdStampante('Friggitoria'), 'stm_friggitoria');
    assert.equal(nuovoIdStampante('Bar 2 (giardino)'), 'stm_bar_2_giardino');
    assert.equal(nuovoIdStampante('Friggitoria', ['stm_friggitoria']), 'stm_friggitoria_2');
    assert.ok(isStampanteAggiunta(nuovoIdStampante('!!!')));
    assert.ok(MAX_STAMPANTI_AGGIUNTE >= 5);
});

console.log('Comande dell\'ordine:');
const tavolo = (prodotti, extra = {}) => ({ tavolo: '5', coperti: 2, prodotti, ...extra });
const P = {
    pizza: { nome: 'Margherita', prezzo: 6, qta: 1, cat: 'pizza', turno: 1 },
    crocche: { nome: 'Crocche', prezzo: 3, qta: 2, cat: 'ant_pizzeria', turno: 1 },
    fritto: { nome: 'Fritto misto', prezzo: 9, qta: 1, cat: 'sez_fritti', turno: 1 },
    tiramisu: { nome: 'Tiramisu', prezzo: 4, qta: 1, cat: 'dolce', turno: 1 },
    birra: { nome: 'Birra', prezzo: 4, qta: 1, cat: 'birra', turno: 1 },
};

t('la stampante aggiunta stampa le sue categorie, con il suo nome in cima', () => {
    const d = datiOrdine(tavolo([P.pizza, P.crocche, P.fritto, P.tiramisu]), 'stm_friggitoria', CON_AGGIUNTE, {});
    const s = testo(d);
    assert.match(s, /FRIGGITORIA\n/);
    assert.match(s, /Crocche/); assert.match(s, /Fritto misto/);
    assert.doesNotMatch(s, /Margherita|Tiramisu/);
    assert.equal(d.titolo, 'FRIGGITORIA');
    assert.match(testo(datiOrdine(tavolo([P.tiramisu]), 'stm_pasticceria', CON_AGGIUNTE, {})), /PASTICCERIA\n[\s\S]*Tiramisu/);
    assert.equal(datiOrdine(tavolo([P.pizza]), 'stm_pasticceria', CON_AGGIUNTE, {}), null);
});

t('stampante di sempre rinominata: in cima il nome scelto (accenti come apostrofo per la termica)', () => {
    const cfg = { ...CON_AGGIUNTE, pizzeria: { ...CON_AGGIUNTE.pizzeria, nome: 'Forno à legna' } };
    const d = datiOrdine(tavolo([P.pizza]), 'PIZZERIA', cfg, {});
    assert.match(testo(d), /FORNO A' LEGNA\n/);
    assert.ok(/^[\x00-\x7F]*$/.test(testo(d)));
    assert.equal(d.titolo, "FORNO A' LEGNA");
    assert.match(testo(datiOrdine(tavolo([P.pizza]), 'PIZZERIA', BASE, {})), /PIZZERIA\n/);
});

t('asporto: la pizzeria stampa tutto come prima; la stampante aggiunta le sue categorie', () => {
    const asporto = { nome: 'Rossi', orario: '20:30', prodotti: [P.pizza, P.crocche, P.fritto] };
    const piz = testo(datiOrdine(asporto, 'pizzeria', CON_AGGIUNTE, {}));
    assert.match(piz, /Margherita/); assert.match(piz, /Crocche/); assert.match(piz, /Fritto misto/);
    const fri = testo(datiOrdine(asporto, 'stm_friggitoria', CON_AGGIUNTE, {}));
    assert.match(fri, /Crocche/); assert.doesNotMatch(fri, /Margherita/);
});

t('senza stampanti aggiunte le comande sono identiche a prima', () => {
    const o = tavolo([P.pizza, P.crocche, P.birra, P.tiramisu]);
    for (const r of ['PIZZERIA', 'CUCINA', 'BAR', 'CONTO', 'PRECONTO']) {
        const conNomiVuoti = { ...BASE, pizzeria: { ...BASE.pizzeria, nome: '' } };
        assert.equal(testo(datiOrdine(o, r, conNomiVuoti, {})).replace(/\d\d\/\d\d\/\d{4}.*\n/, ''), testo(datiOrdine(o, r, BASE, {})).replace(/\d\d\/\d\d\/\d{4}.*\n/, ''));
    }
});

console.log('Messaggi alla cucina (aggiunte, VIA TURNO):');
const ctx = { stampanti: CON_AGGIUNTE };

t('aggiunta: le crocche vanno alla Friggitoria e non più in cucina (spuntate solo lì e in pizzeria)', () => {
    const o = tavolo([P.crocche], { messaggio_cucina: 'AGGIUNTA', ultime_aggiunte_real: [P.crocche] });
    assert.match(testo(datiMessaggioCucina(o, 'stm_friggitoria', ctx)), /Crocche/);
    assert.equal(datiMessaggioCucina(o, 'cucina', ctx), null);
    // in pizzeria sono spuntate anche lì: escono anche in pizzeria
    assert.match(testo(datiMessaggioCucina(o, 'pizzeria', ctx)), /Crocche/);
    assert.equal(datiMessaggioCucina(o, 'stm_pasticceria', ctx), null);
});

t('aggiunta di un dolce: alla Pasticceria, non in cucina', () => {
    const o = tavolo([P.tiramisu], { messaggio_cucina: 'AGGIUNTA', ultime_aggiunte_real: [P.tiramisu] });
    assert.match(testo(datiMessaggioCucina(o, 'stm_pasticceria', ctx)), /Tiramisu/);
    assert.equal(datiMessaggioCucina(o, 'cucina', ctx), null);
});

t('VIA TURNO: chiamata alla stampante aggiunta, con il suo nome', () => {
    const o = tavolo([{ ...P.fritto, turno: 2 }, { ...P.pizza, turno: 2 }], { messaggio_cucina: 'VIA TURNO 2' });
    const f = testo(datiMessaggioCucina(o, 'stm_friggitoria', ctx));
    assert.match(f, /FRIGGITORIA - CHIAMATA/); assert.match(f, /VAI COL 2/); assert.match(f, /Fritto misto/);
    assert.match(testo(datiMessaggioCucina(o, 'pizzeria', ctx)), /FORNO A LEGNA - CHIAMATA/);
});

t('senza stampanti aggiunte i messaggi sono identici a prima', () => {
    const p = [P.pizza, P.crocche, P.birra, P.tiramisu];
    const msgs = [
        tavolo(p, { messaggio_cucina: 'AGGIUNTA', ultime_aggiunte_real: p }),
        tavolo(p.map(x => ({ ...x, turno: 2 })), { messaggio_cucina: 'VIA TURNO 2' }),
        { nome: 'Rossi', prodotti: p, messaggio_cucina: 'AGGIUNTA', ultime_aggiunte_real: p },
    ];
    for (const o of msgs) for (const r of ['pizzeria', 'cucina', 'bar']) {
        const strip = (s) => s.replace(/\d\d\/\d\d\/\d{4}.*\n/g, '');
        assert.equal(strip(testo(datiMessaggioCucina(o, r, { stampanti: BASE }))), strip(testo(datiMessaggioCucina(o, r, {}))));
    }
});

console.log('Sezioni del menu con una stampante aggiunta come reparto:');
t('sezioniValide accetta come reparto una stampante aggiunta', () => {
    const s = sezioniValide({ sezioni: [{ id: 'sez_fritti', nome: 'Fritti', reparto: 'stm_friggitoria' }, { id: 'sez_x', nome: 'X', reparto: 'stm_' }] });
    assert.equal(s[0].reparto, 'stm_friggitoria');
    assert.equal(s[1].reparto, 'cucina');
});

console.log(`\nRISULTATO: ${ok} ok, ${ko} falliti`);
process.exit(ko ? 1 : 0);
