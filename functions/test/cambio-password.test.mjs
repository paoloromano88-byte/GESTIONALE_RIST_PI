// Test del cambio password degli account dei locali dal Super Admin (functions/account.js).
// Parte 1: funzione chiamata direttamente, contro gli emulatori Firestore e Auth.
// Parte 2 (solo se c'è anche l'emulatore Functions): il trigger vero su utenti/{uid}/cambio_password.
// Esecuzione (dalla cartella principale del progetto, serve Java):
//   cp zone-consegna.js comande-escpos.js functions/ && (cd functions && npm ci)
//   npx firebase emulators:exec --only auth,functions,firestore --project demo-gestionale "node functions/test/cambio-password.test.mjs"
import assert from 'assert';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { eseguiCambioPassword } from '../account.js';

const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST;
if (!AUTH_HOST) { console.error('Avviare con: firebase emulators:exec --only auth,firestore (e functions per la parte 2)'); process.exit(1); }
process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8085';
initializeApp({ projectId: 'demo-gestionale' });
const db = getFirestore();
const auth = getAuth();

let ok = 0, ko = 0;
async function t(nome, fn) {
    try { await fn(); ok++; console.log('  ✔', nome); }
    catch (e) { ko++; console.log('  ✘', nome, '->', e.message); }
}

// Accesso come farebbe un dispositivo del locale (API REST dell'emulatore Auth)
async function entra(email, password) {
    const r = await fetch(`http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=x`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, returnSecureToken: true }),
    });
    return r.ok;
}

let n = 0;
async function account(ruolo, extra = {}) {
    const email = `account${++n}-${Date.now()}@test.it`;
    const u = await auth.createUser({ email, password: 'vecchia1' });
    if (ruolo) await db.doc(`utenti/${u.uid}`).set({ email, ruolo, ...(ruolo === 'locale' ? { locale: 'pizzeria-test' } : {}), ...extra });
    return { uid: u.uid, email };
}

const richiesta = (uid, dati) => db.collection(`utenti/${uid}/cambio_password`).add({ creato: new Date(), ...dati });
const leggi = async (ref) => (await ref.get()).data();

console.log('Cambio password (funzione):');

await t('account del locale: password cambiata, tolta dalla richiesta, esito "fatto"', async () => {
    const a = await account('locale');
    const ref = await richiesta(a.uid, { password: 'nuova123' });
    await eseguiCambioPassword(db, auth, a.uid, ref);
    const r = await leggi(ref);
    assert.equal(r.stato, 'fatto');
    assert.ok(!('password' in r), 'la password resta nella richiesta');
    assert.ok(r.completato, 'manca completato');
    assert.ok(await entra(a.email, 'nuova123'), 'non entra con la password nuova');
    assert.ok(!(await entra(a.email, 'vecchia1')), 'entra ancora con la password vecchia');
});

await t('account Super Admin: rifiutato, password invariata', async () => {
    const a = await account('superadmin');
    const ref = await richiesta(a.uid, { password: 'nuova123' });
    await eseguiCambioPassword(db, auth, a.uid, ref);
    const r = await leggi(ref);
    assert.equal(r.stato, 'errore');
    assert.ok(!('password' in r));
    assert.ok(await entra(a.email, 'vecchia1'), 'la password del Super Admin è cambiata');
});

await t('account senza scheda in utenti (scollegato): rifiutato', async () => {
    const a = await account(null);
    const ref = await richiesta(a.uid, { password: 'nuova123' });
    await eseguiCambioPassword(db, auth, a.uid, ref);
    const r = await leggi(ref);
    assert.equal(r.stato, 'errore');
    assert.ok(!('password' in r));
    assert.ok(await entra(a.email, 'vecchia1'));
});

await t('password troppo corta o non testo: rifiutata', async () => {
    const a = await account('locale');
    for (const password of ['abc12', 123456, '', null]) {
        const ref = await richiesta(a.uid, { password });
        await eseguiCambioPassword(db, auth, a.uid, ref);
        const r = await leggi(ref);
        assert.equal(r.stato, 'errore', `accettata: ${JSON.stringify(password)}`);
        assert.ok(!('password' in r));
    }
    assert.ok(await entra(a.email, 'vecchia1'));
});

await t('scheda del locale ma account cancellato da Authentication: errore chiaro', async () => {
    const a = await account('locale');
    await auth.deleteUser(a.uid);
    const ref = await richiesta(a.uid, { password: 'nuova123' });
    await eseguiCambioPassword(db, auth, a.uid, ref);
    const r = await leggi(ref);
    assert.equal(r.stato, 'errore');
    assert.match(r.errore, /non esiste/i);
    assert.ok(!('password' in r));
});

await t('due esecuzioni insieme sulla stessa richiesta: una sola la usa', async () => {
    const a = await account('locale');
    const ref = await richiesta(a.uid, { password: 'insieme12' });
    const esiti = await Promise.all([1, 2, 3].map(() => eseguiCambioPassword(db, auth, a.uid, ref)));
    const eseguite = esiti.filter(Boolean);
    // Con l'emulatore Functions acceso anche il trigger può averla presa: al massimo una esecuzione
    assert.ok(eseguite.length <= 1, `eseguita ${eseguite.length} volte`);
    let r;
    for (let i = 0; i < 40; i++) { r = await leggi(ref); if (r.stato && r.stato !== 'in_corso') break; await new Promise(x => setTimeout(x, 250)); }
    assert.equal(r.stato, 'fatto');
    assert.ok(await entra(a.email, 'insieme12'));
});

await t('richiesta già eseguita (ripetizione del trigger): non tocca niente', async () => {
    const a = await account('locale');
    const ref = await richiesta(a.uid, { password: 'nuova123' });
    await eseguiCambioPassword(db, auth, a.uid, ref);
    const prima = await leggi(ref);
    await eseguiCambioPassword(db, auth, a.uid, ref);
    assert.deepEqual(await leggi(ref), prima);
    assert.ok(await entra(a.email, 'nuova123'));
});

// ---------- Parte 2: trigger vero (emulatore Functions) ----------
// FIREBASE_EMULATOR_HUB c'è sempre con emulators:exec: si chiede al hub se Functions è acceso
const hub = process.env.FIREBASE_EMULATOR_HUB;
const attivi = hub ? await fetch(`http://${hub}/emulators`).then(r => r.json()).catch(() => ({})) : {};
if (attivi.functions) {
    console.log('Trigger su utenti/{uid}/cambio_password (emulatore Functions):');
    const attendi = (ms) => new Promise(r => setTimeout(r, ms));
    await t('richiesta scritta → password cambiata dal server', async () => {
        const a = await account('locale');
        const ref = await richiesta(a.uid, { password: 'dalserver9' });
        let r;
        for (let i = 0; i < 40; i++) { await attendi(500); r = await leggi(ref); if (r.stato) break; }
        assert.equal(r.stato, 'fatto', `stato: ${r.stato} ${r.errore || ''}`);
        assert.ok(!('password' in r));
        assert.ok(await entra(a.email, 'dalserver9'));
    });
}

console.log(`\nRISULTATO: ${ok} ok, ${ko} falliti`);
process.exit(ko ? 1 : 0);
