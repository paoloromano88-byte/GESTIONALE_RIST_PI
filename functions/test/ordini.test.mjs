// Test dell'elaborazione ordini lato server, contro l'emulatore Firestore.
// Esecuzione (dalla cartella principale del progetto, serve Java):
//   cp zone-consegna.js functions/ && (cd functions && npm ci)
//   npx firebase emulators:exec --only firestore --project demo-gestionale "node functions/test/ordini.test.mjs"
import assert from 'assert';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { elaboraOrdineApp, analizzaOrdine } from '../ordini.js';

process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8085';
initializeApp({ projectId: 'demo-gestionale' });
const db = getFirestore();

let ok = 0, ko = 0;
async function t(nome, fn) {
    try { await fn(); ok++; console.log('  ✔', nome); }
    catch (e) { ko++; console.log('  ✘', nome, '->', e.message); }
}

const ZONE = { supplemento_consegna: 2, supplemento_fuori_zona: 5, zone_consegna: [
    { nome: 'Centro', cap: '89100, 89121-89125', supplemento: 1.5, ordine_minimo: 15, gratis_sopra: 30, attiva: true }] };

async function prepara(base) {
    const col = (n) => base.collection(n);
    await col('prodotti').doc('marg').set({ nome: 'Margherita', prezzo: 6, scorta: 10, attivo: true, cat: 'pizza' });
    await col('prodotti').doc('diav').set({ nome: 'Diavola', prezzo: 7, scorta: '4', attivo: true, cat: 'pizza' });
    await col('prodotti').doc('coca').set({ nome: 'Coca Cola Lattina', prezzo: 2.5, cat: 'bibita_lattina' });   // senza scorte
    await col('ingredienti').doc('buf').set({ nome: 'Bufala', prezzo: 2 });
    await col('rimozioni').doc('moz').set({ nome: 'Mozzarella', prezzo: 1 });
    await col('sconti').doc('s1').set({ codice: 'PROMO10', tipo: 'percent', valore: 10 });
    await col('impostazioni').doc('negozio').set(ZONE);
    await col('clienti').doc('3339998888').set({ nome: 'Anna', telefono: '3339998888', numOrdini: 3, totaleSpeso: 40, tag: 'VIP' });
}

const ordineApp = (extra = {}) => ({
    nome: 'Anna', cognome: 'Bianchi', telefono: '3339998888',
    cliente: { nome: 'Anna', cognome: 'Bianchi', telefono: '3339998888', cap: '89122' },
    prodotti: [
        { nome: 'Margherita', prezzo: 6, qta: 2, cat: 'pizza', dettagli: 'Normale' },
        { nome: 'Margherita', prezzo: 7, qta: 1, cat: 'pizza', dettagli: '+Bufala|NO Mozzarella' },
        { nome: 'STIRATA BI-GUSTO', prezzo: 7, qta: 1, cat: 'stirata', componenti: ['marg', 'diav'], dettagli: '<b>1/2</b> Margherita' },
        { nome: 'Coca Cola Lattina', prezzo: 2, qta: 1, cat: 'bibita_lattina', dettagli: 'Normale' }
    ],
    totale: 29.5, orario: '20:30', data_ritiro: '2026-10-27', tipo: 'DOMICILIO',
    indirizzo: 'Via Roma 1', citofono: 'Bianchi', zona: 'Centro', supplemento_consegna: 1.5,
    codice_sconto: '', stato: 'In attesa', user_agent: 'Mozilla/5.0', ...extra
});

for (const nomeBase of ['', 'ristoranti/pizzeria-test']) {
    const base = nomeBase ? db.doc(nomeBase) : db;
    const col = (n) => base.collection(n);
    console.log(`\n== ${nomeBase || '(locale principale)'}`);
    await prepara(base);

    await t('ordine regolare: scorte, rubrica, forno, nessuna anomalia', async () => {
        const ref = await col('ordini').add(ordineApp());
        const esito = await elaboraOrdineApp(db, base, ref);
        assert.deepEqual(esito.anomalie, []);
        // 2 + 1 Margherita + mezza Bi-Gusto = 3.5 ; Diavola mezza = 0.5 (scorta stringa "4")
        assert.equal((await col('prodotti').doc('marg').get()).data().scorta, 6.5);
        assert.equal((await col('prodotti').doc('diav').get()).data().scorta, 3.5);
        assert.equal((await col('prodotti').doc('coca').get()).data().scorta, undefined);
        const scheda = (await col('clienti').doc('3339998888').get()).data();
        assert.equal(scheda.numOrdini, 4); assert.equal(scheda.totaleSpeso, 69.5);
        assert.equal(scheda.cap, '89122'); assert.equal(scheda.tag, 'VIP');
        const occ = (await col('occupazione_forno').doc('2026-10-27').get()).data();
        assert.equal(occ.slot['20:30'], 4); assert.equal(occ.consegne['20:30'], 1);
        const ord = (await ref.get()).data();
        assert.ok(ord.elaborato_server); assert.equal(ord.anomalia_prezzo, undefined);
    });

    await t('stesso ordine elaborato due volte: nessun doppio conteggio', async () => {
        const ref = await col('ordini').add(ordineApp());
        await elaboraOrdineApp(db, base, ref);
        const prima = (await col('prodotti').doc('marg').get()).data().scorta;
        const esito = await elaboraOrdineApp(db, base, ref);
        assert.equal(esito.saltato, 'già elaborato');
        assert.equal((await col('prodotti').doc('marg').get()).data().scorta, prima);
    });

    await t('asporto senza pizze: nessuna consegna, nessuna pizza nel contatore', async () => {
        const ref = await col('ordini').add(ordineApp({ tipo: 'ASPORTO', orario: '21:45', supplemento_consegna: 0, totale: 2,
            prodotti: [{ nome: 'Coca Cola Lattina', prezzo: 2, qta: 1, cat: 'bibita_lattina', dettagli: 'Normale' }] }));
        await elaboraOrdineApp(db, base, ref);
        const occ = (await col('occupazione_forno').doc('2026-10-27').get()).data();
        assert.equal(occ.slot['21:45'], undefined); assert.equal(occ.consegne['21:45'], undefined);
    });

    await t('consegna senza pizze: conta solo la consegna', async () => {
        const ref = await col('ordini').add(ordineApp({ orario: '22:00', supplemento_consegna: 1.5, totale: 3.5,
            prodotti: [{ nome: 'Coca Cola Lattina', prezzo: 2, qta: 1, cat: 'bibita_lattina', dettagli: 'Normale' }] }));
        await elaboraOrdineApp(db, base, ref);
        const occ = (await col('occupazione_forno').doc('2026-10-27').get()).data();
        assert.equal(occ.slot['22:00'], undefined); assert.equal(occ.consegne['22:00'], 1);
    });

    await t('ordine del personale (senza user_agent) ignorato', async () => {
        const { user_agent, ...daCassa } = ordineApp();
        const ref = await col('ordini').add({ ...daCassa, operatore: 'Cassa' });
        const esito = await elaboraOrdineApp(db, base, ref);
        assert.equal(esito.saltato, 'ordine del personale');
    });

    await t('prezzo manomesso: anomalia segnalata, ordine non bloccato', async () => {
        const o = ordineApp();
        o.prodotti[0].prezzo = 1;   // Margherita a 1 €
        o.totale = 19.5;
        const ref = await col('ordini').add(o);
        await elaboraOrdineApp(db, base, ref);
        const a = (await ref.get()).data().anomalia_prezzo;
        assert.ok(a.motivi.some(m => m.includes('Margherita: € 1.00 invece di € 6.00')), JSON.stringify(a));
    });

    await t('totale manomesso: anomalia', async () => {
        const ref = await col('ordini').add(ordineApp({ totale: 5 }));
        await elaboraOrdineApp(db, base, ref);
        assert.ok((await ref.get()).data().anomalia_prezzo.motivi.some(m => m.startsWith('Totale')));
    });

    await t('consegna gratis non dovuta: anomalia', async () => {
        const ref = await col('ordini').add(ordineApp({ supplemento_consegna: 0, totale: 28 }));
        await elaboraOrdineApp(db, base, ref);
        assert.ok((await ref.get()).data().anomalia_prezzo.motivi.some(m => m.startsWith('Consegna')));
    });

    await t('codice sconto valido accettato, inesistente segnalato', async () => {
        const buono = await col('ordini').add(ordineApp({ codice_sconto: 'PROMO10', totale: 26.7 }));   // 28*0.9 + 1.5
        await elaboraOrdineApp(db, base, buono);
        assert.equal((await buono.get()).data().anomalia_prezzo, undefined);
        const falso = await col('ordini').add(ordineApp({ codice_sconto: 'GRATIS', totale: 1.5 }));
        await elaboraOrdineApp(db, base, falso);
        assert.ok((await falso.get()).data().anomalia_prezzo.motivi.some(m => m.includes('GRATIS')));
    });
}

const LISTINO = { prodotti: [
    { id: 'marg', nome: 'Margherita', prezzo: 6, cat: 'pizza', scorta: 10 },
    { id: 'margGF', nome: 'Margherita', prezzo: 8, cat: 'gf', scorta: 5 },
    { id: 'diav', nome: 'Diavola', prezzo: 7, cat: 'stirata' },
    { id: 'pane', nome: 'Pane al kg', prezzo: 12, cat: 'speciale', isPeso: true },
    { id: 'coca', nome: 'Coca Cola Lattina', prezzo: 2.5, cat: 'bibita_lattina', scorta: 20 }] };
const asporto = (prodotti, totale) => ordineApp({ tipo: 'ASPORTO', supplemento_consegna: 0, prodotti, totale });

await t('pizza normale e senza glutine con lo stesso nome: prezzo e scorta giusti', async () => {
    const r = analizzaOrdine(asporto([{ nome: 'Margherita', prezzo: 6, qta: 1, cat: 'pizza', dettagli: 'Normale' },
        { nome: 'Margherita', prezzo: 8, qta: 2, cat: 'gf', dettagli: 'GLUTEN FREE' }], 22), LISTINO, ZONE);
    assert.deepEqual(r.anomalie, []); assert.equal(r.scorte.get('marg'), 1); assert.equal(r.scorte.get('margGF'), 2);
    const gfBasso = analizzaOrdine(asporto([{ nome: 'Margherita', prezzo: 6, qta: 1, cat: 'gf', dettagli: 'Normale' }], 6), LISTINO, ZONE);
    assert.ok(gfBasso.anomalie.some(m => m.includes('€ 6.00 invece di € 8.00')), JSON.stringify(gfBasso.anomalie));
});

await t('quantità negativa per abbassare il totale: anomalia, scorte non toccate', async () => {
    const r = analizzaOrdine(asporto([{ nome: 'Margherita', prezzo: 6, qta: 3, cat: 'pizza', dettagli: 'Normale' },
        { nome: 'Coca Cola Lattina', prezzo: 2.5, qta: -6, cat: 'bibita_lattina', dettagli: 'Normale' }], 3), LISTINO, ZONE);
    assert.ok(r.anomalie.some(m => m.includes('quantità non valida (-6)')), JSON.stringify(r.anomalie));
    assert.ok(r.anomalie.some(m => m.startsWith('Totale')), JSON.stringify(r.anomalie));
    assert.equal(r.scorte.get('coca'), undefined);
});

await t('quantità con la virgola su un prodotto normale: anomalia', async () => {
    const r = analizzaOrdine(asporto([{ nome: 'Margherita', prezzo: 6, qta: 0.1, cat: 'pizza', dettagli: 'Normale' }], 0.6), LISTINO, ZONE);
    assert.ok(r.anomalie.some(m => m.includes('quantità non valida')), JSON.stringify(r.anomalie));
});

await t('prodotto inventato o "a peso" finto: anomalia', async () => {
    const r = analizzaOrdine(asporto([{ nome: 'Pizza Gigante', prezzo: 0.5, qta: 1, cat: 'pizza', dettagli: 'Normale' },
        { nome: 'Margherita', prezzo: 0, qta: 1, cat: 'pizza', isPeso: true, dettagli: 'Normale' }], 0.5), LISTINO, ZONE);
    assert.ok(r.anomalie.some(m => m.includes('Pizza Gigante: prodotto non presente nel listino')), JSON.stringify(r.anomalie));
    assert.ok(r.anomalie.some(m => m.includes('Margherita: prodotto a peso non previsto')), JSON.stringify(r.anomalie));
    assert.ok(r.anomalie.some(m => m.includes('Margherita: € 0.00 invece di € 6.00')), JSON.stringify(r.anomalie));
});

await t('prodotto a peso vero: prezzo deciso in cassa, nessuna anomalia', async () => {
    const r = analizzaOrdine(asporto([{ nome: 'Pane al kg', prezzo: 12, qta: 0.45, cat: 'speciale', isPeso: true, dettagli: 'Normale' }], 0), LISTINO, ZONE);
    assert.deepEqual(r.anomalie, []);
});

await t('Bi-Gusto: almeno il prezzo del gusto più caro, gusti inventati segnalati', async () => {
    const bg = (prezzo, componenti) => ({ nome: 'STIRATA BI-GUSTO', prezzo, qta: 1, cat: 'stirata', componenti, dettagli: '<b>1/2</b>' });
    assert.deepEqual(analizzaOrdine(asporto([bg(7, ['marg', 'diav'])], 7), LISTINO, ZONE).anomalie, []);
    const basso = analizzaOrdine(asporto([bg(1, ['marg', 'diav'])], 1), LISTINO, ZONE);
    assert.ok(basso.anomalie.some(m => m.includes('€ 1.00 invece di € 7.00')), JSON.stringify(basso.anomalie));
    const finto = analizzaOrdine(asporto([bg(0.01, ['x'])], 0.01), LISTINO, ZONE);
    assert.ok(finto.anomalie.some(m => m.includes('gusto non presente')), JSON.stringify(finto.anomalie));
});

await t('riga non valida (null) segnalata senza errori', async () => {
    const r = analizzaOrdine(asporto([null, { nome: 'Margherita', prezzo: 6, qta: 1, cat: 'pizza', dettagli: 'Normale' }], 6), LISTINO, ZONE);
    assert.ok(r.anomalie.some(m => m.includes('Riga')), JSON.stringify(r.anomalie));
});

await t('forno: contatore ricalcolato dagli ordini del giorno (niente doppio conteggio con la cassa)', async () => {
    const base = db.doc('ristoranti/forno-test');
    const col = (n) => base.collection(n);
    await prepara(base);
    // La cassa ha già scritto il valore giusto (4 pizze alle 20:30) prima che arrivasse il server
    const ref = await col('ordini').add(ordineApp({ data_ritiro: '2026-11-02' }));
    await col('occupazione_forno').doc('2026-11-02').set({ slot: { '20:30': 4 }, consegne: { '20:30': 1 } });
    await elaboraOrdineApp(db, base, ref);
    let occ = (await col('occupazione_forno').doc('2026-11-02').get()).data();
    assert.equal(occ.slot['20:30'], 4); assert.equal(occ.consegne['20:30'], 1);
    // Ordini annullati e tavoli non contano; un secondo ordine si somma
    await col('ordini').add({ ...ordineApp({ data_ritiro: '2026-11-02' }), stato: 'Annullato' });
    await col('ordini').add({ ...ordineApp({ data_ritiro: '2026-11-02', tipo: 'ASPORTO' }), tavolo: '5' });
    const ref2 = await col('ordini').add(ordineApp({ data_ritiro: '2026-11-02', tipo: 'ASPORTO', orario: '21:00' }));
    await elaboraOrdineApp(db, base, ref2);
    occ = (await col('occupazione_forno').doc('2026-11-02').get()).data();
    assert.deepEqual(occ.slot, { '20:30': 4, '21:00': 4 }); assert.deepEqual(occ.consegne, { '20:30': 1 });
});

await t('analisi pura: consegna gratis sopra soglia non è anomalia', async () => {
    const o = ordineApp({ prodotti: [{ nome: 'Margherita', prezzo: 6, qta: 5, cat: 'pizza', dettagli: 'Normale' }], totale: 30, supplemento_consegna: 0 });
    const r = analizzaOrdine(o, { prodotti: [{ id: 'marg', nome: 'Margherita', prezzo: 6, scorta: 3 }] }, ZONE);
    assert.deepEqual(r.anomalie, []); assert.equal(r.scorte.get('marg'), 5); assert.equal(r.pizze, 5);
});

console.log(`\nRISULTATO: ${ok} ok, ${ko} falliti`);
process.exit(ko ? 1 : 0);
