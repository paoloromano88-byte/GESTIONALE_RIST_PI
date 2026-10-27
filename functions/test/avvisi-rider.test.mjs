// Test dell'avviso push al rider quando un ordine è pronto (functions/avvisi-rider.js).
// Parte 1: funzioni chiamate direttamente, contro l'emulatore Firestore, con un invio finto.
// Parte 2 (solo se c'è anche l'emulatore Functions): i trigger veri sugli ordini; nell'emulatore
// le notifiche finiscono in _push_emulatore invece che su FCM.
// Esecuzione (dalla cartella principale del progetto, serve Java):
//   cp zone-consegna.js comande-escpos.js functions/ && (cd functions && npm ci)
//   npx firebase emulators:exec --only functions,firestore --project demo-gestionale "node functions/test/avvisi-rider.test.mjs"
import assert from 'assert';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { avvisaRiderPronto, diventatoPronto } from '../avvisi-rider.js';

process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8085';
initializeApp({ projectId: 'demo-gestionale' });
const db = getFirestore();

let ok = 0, ko = 0;
async function t(nome, fn) {
    try { await fn(); ok++; console.log('  ✔', nome); }
    catch (e) { ko++; console.log('  ✘', nome, '->', e.message); }
}

const oggi = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(new Date());
const ordine = (extra = {}) => ({ nome: 'Mario', cognome: 'Rossi', tipo: 'DOMICILIO', orario: '20:30', data_ritiro: oggi, stato: 'Pronto', indirizzo: 'Via Roma 1', ...extra });
const PRIMA = { stato: 'In forno' };

// Invio finto: registra i messaggi, i token che iniziano con "scaduto" rispondono come FCM per un'app disinstallata
function invioFinto() {
    const inviati = [];
    const invia = async (m) => {
        inviati.push(m);
        return { responses: m.tokens.map(tk => tk.startsWith('scaduto') ? { success: false, error: { code: 'messaging/registration-token-not-registered' } } : { success: true }) };
    };
    return { inviati, invia };
}

async function iscrivi(base, lista) {
    for (const d of (await base.collection('notifiche_rider').get()).docs) await d.ref.delete();
    for (const i of lista) await base.collection('notifiche_rider').doc(i.token).set(i);
}
const tokenIscritti = async (base) => (await base.collection('notifiche_rider').get()).docs.map(d => d.id).sort();

const principale = db, locale = db.collection('ristoranti').doc('pizzeria-test');
const RIDER = [
    { token: 'tok-marco', rider_id: 'D1', rider_nome: 'Marco' },
    { token: 'tok-luca', rider_id: 'D2', rider_nome: 'Luca' },
    { token: 'scaduto-vecchio', rider_id: 'D1', rider_nome: 'Marco' },
];

console.log('Avviso push al rider (funzioni):');
await t('ordine libero diventa Pronto: notifica a tutti i rider iscritti, titolo, testo e link', async () => {
    await iscrivi(principale, RIDER);
    const { inviati, invia } = invioFinto();
    const n = await avvisaRiderPronto(principale, 'default', 'o1', PRIMA, ordine(), { invia });
    assert.strictEqual(n, 2);
    assert.strictEqual(inviati.length, 1);
    const m = inviati[0];
    assert.deepStrictEqual([...m.tokens].sort(), ['scaduto-vecchio', 'tok-luca', 'tok-marco']);
    // Solo dati (stringhe, come vuole FCM): la notifica la compone il service worker col logo del locale
    assert.strictEqual(m.webpush.notification, undefined);
    assert.deepStrictEqual(m.webpush.data, {
        titolo: '🍕 Pronto da ritirare', testo: 'Rossi Mario · ore 20:30', tag: 'pronto-o1',
        link: 'https://gestionale-ristoranti-96c5b.web.app/delivery.html', locale: 'default',
    });
    assert.ok(Object.values(m.webpush.data).every(v => typeof v === 'string'));
    assert.ok(Buffer.byteLength(JSON.stringify(m.webpush.data)) < 4096, 'sotto il limite di 4 KB di FCM');
    assert.strictEqual(m.webpush.headers.Urgency, 'high');
});
await t('il telefono che non riceve più viene tolto dall\'elenco', async () => {
    assert.deepStrictEqual(await tokenIscritti(principale), ['tok-luca', 'tok-marco']);
});
await t('ordine già preso da un rider: notifica solo a lui', async () => {
    const { inviati, invia } = invioFinto();
    await avvisaRiderPronto(principale, 'default', 'o2', PRIMA, ordine({ fattorino_id: 'D2', fattorino: 'Luca', stato_consegna: 'In consegna' }), { invia });
    assert.deepStrictEqual(inviati[0].tokens, ['tok-luca']);
});
await t('ordine vecchio con solo il nome del rider: notifica a quel nome', async () => {
    const { inviati, invia } = invioFinto();
    await avvisaRiderPronto(principale, 'default', 'o3', PRIMA, ordine({ fattorino: 'Marco' }), { invia });
    assert.deepStrictEqual(inviati[0].tokens, ['tok-marco']);
});
await t('rider dell\'ordine senza notifiche attive: nessun invio', async () => {
    const { inviati, invia } = invioFinto();
    const n = await avvisaRiderPronto(principale, 'default', 'o4', PRIMA, ordine({ fattorino_id: 'D9' }), { invia });
    assert.strictEqual(n, 0); assert.strictEqual(inviati.length, 0);
});
await t('nessun invio: già Pronto prima, asporto, consegnato, altro giorno, non pronto, ordine cancellato', async () => {
    const { inviati, invia } = invioFinto();
    const casi = [
        [{ stato: 'Pronto' }, ordine()],
        [PRIMA, ordine({ tipo: 'ASPORTO' })],
        [PRIMA, ordine({ stato_consegna: 'Consegnato' })],
        [PRIMA, ordine({ data_ritiro: '2020-01-01' })],
        [PRIMA, ordine({ stato: 'In forno' })],
        [PRIMA, null],
    ];
    for (const [prima, dopo] of casi) assert.strictEqual(await avvisaRiderPronto(principale, 'default', 'ox', prima, dopo, { invia }), 0);
    assert.strictEqual(inviati.length, 0);
});
await t('"oggi" è il giorno italiano: alle 00:30 di Roma (22:30 UTC del giorno prima) vale la data di Roma', async () => {
    const adesso = new Date('2026-07-15T22:30:00Z');
    assert.ok(diventatoPronto(PRIMA, ordine({ data_ritiro: '2026-07-16' }), adesso));
    assert.ok(!diventatoPronto(PRIMA, ordine({ data_ritiro: '2026-07-15' }), adesso));
});
await t('altro locale: usa i suoi iscritti e il link col locale', async () => {
    await iscrivi(locale, [{ token: 'tok-anna', rider_id: 'R1', rider_nome: 'Anna' }]);
    const { inviati, invia } = invioFinto();
    await avvisaRiderPronto(locale, 'pizzeria-test', 'o5', PRIMA, ordine(), { invia });
    assert.deepStrictEqual(inviati[0].tokens, ['tok-anna']);
    assert.strictEqual(inviati[0].webpush.data.link, 'https://gestionale-ristoranti-96c5b.web.app/delivery.html?locale=pizzeria-test');
    assert.strictEqual(inviati[0].webpush.data.locale, 'pizzeria-test');
});

// ---------- Parte 2: trigger veri (emulatore Functions) ----------
if (process.env.FUNCTIONS_EMULATOR_HOST || process.env.FIREBASE_EMULATOR_HUB) {
    const attendi = (ms) => new Promise(r => setTimeout(r, ms));
    const pushPer = async (tag) => (await db.collection('_push_emulatore').get()).docs.map(d => d.data()).filter(m => m.webpush?.data?.tag === tag);
    const aspettaPush = async (tag, n = 1) => { for (let i = 0; i < 40; i++) { const p = await pushPer(tag); if (p.length >= n) return p; await attendi(500); } return pushPer(tag); };
    console.log('Avviso push al rider (trigger veri):');
    for (const [base, nomeLocale] of [[principale, 'default'], [locale, 'pizzeria-test']]) {
        await iscrivi(base, [{ token: `tok-${nomeLocale}`, rider_id: 'R1', rider_nome: 'Rider' }]);
        await t(`${nomeLocale}: la cucina segna Pronto → una notifica, e una sola anche se l'ordine cambia ancora`, async () => {
            const ref = await base.collection('ordini').add(ordine({ stato: 'In forno' }));
            await attendi(1500);
            await ref.update({ stato: 'Pronto' });
            const p = await aspettaPush(`pronto-${ref.id}`);
            assert.strictEqual(p.length, 1);
            assert.deepStrictEqual(p[0].tokens, [`tok-${nomeLocale}`]);
            await ref.update({ stato_consegna: 'In consegna', fattorino_id: 'R1' });
            await attendi(3000);
            assert.strictEqual((await pushPer(`pronto-${ref.id}`)).length, 1);
        });
    }
}

console.log(`\nRISULTATO: ${ok} ok, ${ko} falliti`);
process.exit(ko ? 1 : 0);
