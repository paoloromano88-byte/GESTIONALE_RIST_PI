// Test delle comande preparate dal server per l'Agente di stampa (functions/comande.js).
// Parte 1: funzioni chiamate direttamente, contro l'emulatore Firestore.
// Parte 2 (solo se c'è anche l'emulatore Functions): i trigger veri sugli ordini.
// Esecuzione (dalla cartella principale del progetto, serve Java):
//   cp zone-consegna.js comande-escpos.js functions/ && (cd functions && npm ci)
//   npx firebase emulators:exec --only functions,firestore --project demo-gestionale "node functions/test/comande.test.mjs"
import assert from 'assert';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp, FieldValue } from 'firebase-admin/firestore';
import { comandeOrdineCreato, comandeMessaggio, comandeDaEvento } from '../comande.js';

process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8085';
initializeApp({ projectId: 'demo-gestionale' });
const db = getFirestore();

let ok = 0, ko = 0;
async function t(nome, fn) {
    try { await fn(); ok++; console.log('  ✔', nome); }
    catch (e) { ko++; console.log('  ✘', nome, '->', e.message); }
}

const STAMPANTI = {
    metodo: 'agente',
    pizzeria: { ip: '192.168.1.50', cats: ['pizza'] }, cucina: { ip: '192.168.1.51:9101', cats: ['primo'] },
    bar: { ip: '192.168.1.52', cats: ['birra', 'bibita_lattina'] }, conto: { ip: '192.168.1.53' },
};
const oggi = new Date().toISOString().split('T')[0];
const ordine = (extra = {}) => ({
    nome: 'Mario', cognome: 'Rossi', telefono: '3331234567', tipo: 'ASPORTO', orario: '20:30', data_ritiro: oggi, stato: 'In attesa', totale: 19,
    prodotti: [{ nome: 'Margherita', prezzo: 6, qta: 2, cat: 'pizza', dettagli: 'Normale' }, { nome: 'Birra Moretti 66cl', prezzo: 3.5, qta: 2, cat: 'birra' }],
    data_invio: Timestamp.now(), ...extra,
});
const coda = async (base) => (await base.collection('coda_stampa').get()).docs.map(d => ({ id: d.id, ...d.data() }));
const testo = (c) => Buffer.from(c.dati, 'base64').toString('latin1');
const svuota = async (base) => { for (const d of (await base.collection('coda_stampa').get()).docs) await d.ref.delete(); };

const principale = db, locale = db.collection('ristoranti').doc('pizzeria-test');
for (const base of [principale, locale]) {
    await base.collection('impostazioni').doc('stampanti').set(STAMPANTI);
    await svuota(base);
}

console.log('Comande dal server (funzioni):');
await t('ordine nuovo: comanda PIZZERIA (tutto l\'asporto) e BAR in coda, formato della cassa', async () => {
    const n = await comandeOrdineCreato(db, principale, 'default', 'ord1', ordine());
    const c = await coda(principale);
    assert.strictEqual(n, 2);
    assert.deepStrictEqual(c.map(x => x.id).sort(), ['ordine_ord1_bar', 'ordine_ord1_pizzeria']);
    const p = c.find(x => x.stampante === 'pizzeria');
    assert.strictEqual(p.ip, '192.168.1.50'); assert.strictEqual(p.porta, 9100);
    assert.strictEqual(p.stato, 'da_stampare'); assert.strictEqual(p.tentativi, 0); assert.strictEqual(p.origine, 'server');
    assert.ok(p.creato instanceof Timestamp);
    assert.strictEqual(p.descrizione, 'PIZZERIA · Rossi 20:30');
    const tp = testo(p);
    assert.ok(tp.startsWith('\x1B\x40\x1B\x61\x01'), 'inizia con ESC @');
    assert.ok(/PIZZERIA\n/.test(tp) && /2 x Margherita/.test(tp) && /2 x Birra Moretti 66cl/.test(tp) && /RITIRO: 20:30/.test(tp) && /TOTALE: E 19.00/.test(tp));
    assert.ok(tp.endsWith('\x1B\x64\x08\x1D\x56\x01'), 'finisce con taglio carta');
    assert.ok(/^[\x00-\x7F]*$/.test(tp), 'solo ASCII');
    const b = testo(c.find(x => x.stampante === 'bar'));
    assert.ok(/BAR\n/.test(b) && /2 x Birra Moretti/.test(b) && !/Margherita/.test(b));
});

await t('ripetizione dello stesso evento: nessun doppione', async () => {
    const n = await comandeOrdineCreato(db, principale, 'default', 'ord1', ordine());
    assert.strictEqual(n, 0);
    assert.strictEqual((await coda(principale)).length, 2);
});

await t('domicilio: blocco consegna, nessun ASPORTO e QR con il link dell\'App Rider del locale', async () => {
    await svuota(locale);
    await comandeOrdineCreato(db, locale, 'pizzeria-test', 'dom1', ordine({ tipo: 'DOMICILIO', indirizzo: 'Via Roma 1', citofono: 'Rossi', zona: 'Centro', supplemento_consegna: 2 }));
    const p = (await coda(locale)).find(x => x.stampante === 'pizzeria');
    const tp = testo(p);
    assert.ok(/CONSEGNA A DOMICILIO/.test(tp) && /IND: VIA ROMA 1/.test(tp) && !/\nASPORTO\n/.test(tp));
    assert.ok(tp.includes('\x1D\x76\x30\x00'), 'immagine del QR');
    assert.ok(/ORDINE #DOM1/.test(tp));
});

await t('ordine vecchio (ripristino da backup) e ordine senza reparti configurati: niente in coda', async () => {
    await svuota(principale);
    const vecchio = await comandeOrdineCreato(db, principale, 'default', 'vecchio', ordine({ data_invio: Timestamp.fromMillis(Date.now() - 10 * 60000) }));
    const soloBibite = await comandeOrdineCreato(db, principale, 'default', 'nobar', ordine({ prodotti: [{ nome: 'Acqua', prezzo: 1, qta: 1, cat: 'acqua' }], tavolo: '4', tipo: 'SALA' }));
    assert.strictEqual(vecchio, 0); assert.strictEqual(soloBibite, 0);
    assert.strictEqual((await coda(principale)).length, 0);
});

await t('locale con QZ Tray: il server non mette niente in coda (stampa il PC della cassa)', async () => {
    await principale.collection('impostazioni').doc('stampanti').set({ ...STAMPANTI, metodo: 'qz' });
    const n = await comandeOrdineCreato(db, principale, 'default', 'qz1', ordine());
    await principale.collection('impostazioni').doc('stampanti').set(STAMPANTI);
    assert.strictEqual(n, 0);
});

const tavolo = (extra = {}) => ordine({ tipo: 'SALA', tavolo: '5', coperti: 4, nome: '', cognome: '',
    prodotti: [{ nome: 'Margherita', prezzo: 6, qta: 2, cat: 'pizza', turno: 1 }, { nome: 'Lasagna', prezzo: 9, qta: 1, cat: 'primo', turno: 2 }, { nome: 'Bufalina', prezzo: 8, qta: 1, cat: 'pizza', turno: 2 }], ...extra });

await t('VIA TURNO 2: chiamata per pizzeria (con cucina) e cucina (sulla porta 9101); il bar no', async () => {
    await svuota(principale);
    const ts = Timestamp.now();
    const n = await comandeMessaggio(db, principale, 'default', 'tav5', tavolo(), tavolo({ messaggio_cucina: 'VIA TURNO 2', timestamp_messaggio: ts }));
    const c = await coda(principale);
    assert.strictEqual(n, 2);
    assert.deepStrictEqual(c.map(x => x.stampante).sort(), ['cucina', 'pizzeria']);
    const p = testo(c.find(x => x.stampante === 'pizzeria')), k = c.find(x => x.stampante === 'cucina');
    assert.ok(/PIZZERIA - CHIAMATA/.test(p) && /VAI COL 2/.test(p) && /CON CUCINA/.test(p) && /TAVOLO 5 \(Cop: 4\)/.test(p) && /1 x Bufalina/.test(p) && !/Margherita/.test(p));
    assert.strictEqual(k.porta, 9101); assert.ok(/1 x Lasagna/.test(testo(k)));
    assert.ok(c.every(x => x.id.startsWith(`messaggio_tav5_${ts.toMillis()}_`)));
});

await t('stesso messaggio senza novità: niente; stesso testo ma nuovo invio: si stampa di nuovo', async () => {
    await svuota(principale);
    const ts = Timestamp.fromMillis(Date.now() - 5000), ts2 = Timestamp.now();
    const agg = (when) => tavolo({ messaggio_cucina: 'AGGIUNTA: 1x Diavola', timestamp_messaggio: when, ultime_aggiunte_real: [{ nome: 'Diavola', qta: 1, cat: 'pizza', turno: 1, prezzo: 7 }] });
    const stesso = await comandeMessaggio(db, principale, 'default', 'tav5', agg(ts), { ...agg(ts), stato: 'In forno' });
    const nuovo = await comandeMessaggio(db, principale, 'default', 'tav5', agg(ts), agg(ts2));
    const c = await coda(principale);
    assert.strictEqual(stesso, 0); assert.strictEqual(nuovo, 1);
    assert.ok(/\*\*\* AGGIORNAMENTO \*\*\*/.test(testo(c[0])) && /NUOVE AGGIUNTE/.test(testo(c[0])) && /1 x Diavola \[T1\]/.test(testo(c[0])));
});

await t('RICHIESTA CONTO, PRONTO dalla cucina, messaggio cancellato: niente in coda', async () => {
    await svuota(principale);
    const prima = tavolo({ messaggio_cucina: 'VIA TURNO 1', timestamp_messaggio: Timestamp.fromMillis(1) });
    const a = await comandeMessaggio(db, principale, 'default', 'tav5', prima, tavolo({ messaggio_cucina: '⚠️ TAVOLO 5: RICHIESTA CONTO', timestamp_messaggio: Timestamp.now() }));
    const b = await comandeMessaggio(db, principale, 'default', 'tav5', prima, tavolo({ messaggio_cucina: '✅ PRONTO 1', timestamp_messaggio: Timestamp.now() }));
    const c = await comandeMessaggio(db, principale, 'default', 'tav5', prima, tavolo({ messaggio_cucina: null }));
    assert.deepStrictEqual([a, b, c], [0, 0, 0]);
    assert.strictEqual((await coda(principale)).length, 0);
});

await t('evento: creazione -> ordine nuovo, modifica -> messaggio, cancellazione -> niente', async () => {
    await svuota(principale);
    const snap = (d) => d ? { exists: true, data: () => d } : { exists: false, data: () => undefined };
    const ev = (prima, dopo) => ({ params: { ordineId: 'ev1' }, data: { before: snap(prima), after: snap(dopo) } });
    const creato = await comandeDaEvento(db, principale, 'default', ev(null, ordine()));
    const modificato = await comandeDaEvento(db, principale, 'default', ev(tavolo(), tavolo({ messaggio_cucina: 'VIA TURNO 1', timestamp_messaggio: Timestamp.now() })));
    const cancellato = await comandeDaEvento(db, principale, 'default', ev(ordine(), null));
    assert.deepStrictEqual([creato, modificato, cancellato], [2, 1, 0]);
});

// ---------- Parte 2: trigger veri (emulatore Functions) ----------
if (process.env.FUNCTIONS_EMULATOR_HOST || process.env.FIREBASE_EMULATOR_HUB) {
    const attendi = (ms) => new Promise(r => setTimeout(r, ms));
    const aspettaCoda = async (base, filtro, n) => { for (let i = 0; i < 40; i++) { const c = (await coda(base)).filter(filtro); if (c.length >= n) return c; await attendi(500); } return (await coda(base)).filter(filtro); };
    console.log('Trigger sugli ordini (emulatore Functions):');
    for (const [base, nome] of [[principale, 'principale'], [locale, 'pizzeria-test']]) {
        await t(`${nome}: ordine dalla cassa -> comande in coda; VIA dal palmare -> chiamata in coda`, async () => {
            await svuota(base);
            const ref = await base.collection('ordini').add({ ...tavolo(), data_invio: FieldValue.serverTimestamp() });
            const c1 = await aspettaCoda(base, x => x.id.startsWith(`ordine_${ref.id}_`), 2);
            assert.deepStrictEqual(c1.map(x => x.stampante).sort(), ['cucina', 'pizzeria']);
            await ref.update({ messaggio_cucina: 'VIA TURNO 2', timestamp_messaggio: FieldValue.serverTimestamp() });
            const c2 = await aspettaCoda(base, x => x.id.startsWith(`messaggio_${ref.id}_`), 2);
            assert.deepStrictEqual(c2.map(x => x.stampante).sort(), ['cucina', 'pizzeria']);
            await ref.update({ stato: 'In forno' });
            await attendi(2000);
            assert.strictEqual((await coda(base)).length, 4, 'un cambio di stato non stampa');
        });
    }
}

// ---------- Parte 3: tutta la catena a cassa chiusa (serve anche l'emulatore Auth) ----------
// ordine -> trigger del server -> coda_stampa -> Agente di stampa -> stampante (finta, porta TCP)
if ((process.env.FUNCTIONS_EMULATOR_HOST || process.env.FIREBASE_EMULATOR_HUB) && process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    const net = await import('node:net');
    const { Agente, accedi } = await import('../../agente-stampa/agente.mjs');
    console.log('Catena completa a cassa chiusa (Auth + Functions + Firestore):');
    await t('ordine nuovo -> l\'agente stampa sulla stampante i byte preparati dal server', async () => {
        const ricevuti = [];
        const stampante = net.createServer(sock => { const parti = []; sock.on('data', b => parti.push(b)); sock.on('end', () => { ricevuti.push(Buffer.concat(parti)); sock.end(); }); });
        await new Promise(r => stampante.listen(0, '127.0.0.1', r));
        const porta = stampante.address().port;
        await principale.collection('impostazioni').doc('stampanti').set({ metodo: 'agente', pizzeria: { ip: `127.0.0.1:${porta}`, cats: ['pizza'] } });
        const r = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=x`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'cassa-chiusa@test.it', password: 'segreta123', returnSecureToken: true }) }).then(x => x.json());
        await db.collection('utenti').doc(r.localId).set({ ruolo: 'locale', locale: 'default' });
        const agente = new Agente({ credenziali: await accedi('cassa-chiusa@test.it', 'segreta123', { apiKey: 'x' }), nome: 'ESP prova', idAgente: 'esp-prova', opzioni: { projectId: 'demo-gestionale', apiKey: 'x', attesaMs: 200 }, registro: () => {} });
        agente.avvia();
        try {
            await svuota(principale);
            const ref = await principale.collection('ordini').add({ ...ordine({ nome: 'Lucia', cognome: 'Neri' }), data_invio: FieldValue.serverTimestamp() });
            for (let i = 0; i < 60 && !ricevuti.length; i++) await new Promise(res => setTimeout(res, 250));
            assert.strictEqual(ricevuti.length, 1, 'una comanda stampata');
            const stampato = ricevuti[0].toString('latin1');
            assert.ok(/PIZZERIA\n/.test(stampato) && /2 x Margherita/.test(stampato) && /Lucia Neri/.test(stampato), stampato.slice(0, 80));
            for (let i = 0; i < 20 && (await coda(principale)).length; i++) await new Promise(res => setTimeout(res, 250));
            assert.strictEqual((await coda(principale)).length, 0, 'comanda tolta dalla coda dopo la stampa');
            assert.ok(ref.id);
        } finally {
            await agente.ferma();
            stampante.close();
            await principale.collection('impostazioni').doc('stampanti').set(STAMPANTI);
        }
    });
}

console.log(`\nRISULTATO: ${ok} ok, ${ko} falliti`);
process.exit(ko ? 1 : 0);
