// Prova nel browser del cambio password in Super Admin: pagina vera con Auth, Firestore e Functions
// emulati (vedi ambiente.cjs), a misura di telefono (390x664) e di computer (1280x800).
// Esecuzione (dalla cartella principale; Playwright con Chromium e Java):
//   npx firebase emulators:exec --only auth,functions,firestore,hosting --project demo-gestionale "node test/browser/superadmin-password.cjs"
// Screenshot in test/browser/screenshot/ (ignorata da git).
const assert = require('assert');
const { chromium } = require('playwright');
const { admin, contesto, entra, accediSuperAdmin, registro, SCREENSHOT } = require('./ambiente.cjs');

(async () => {
    const { auth, db } = admin();
    const sa = await auth.createUser({ email: 'admin-pwd@piattaforma.it', password: 'superadmin1' });
    await db.doc(`utenti/${sa.uid}`).set({ email: 'admin-pwd@piattaforma.it', ruolo: 'superadmin' });
    const cassa = await auth.createUser({ email: 'cassa-pwd@locale.it', password: 'vecchia1' });
    await db.doc(`utenti/${cassa.uid}`).set({ email: 'cassa-pwd@locale.it', ruolo: 'locale', locale: 'default' });

    const b = await chromium.launch();
    const r = registro();
    for (const [nome, viewport] of [['telefono', { width: 390, height: 664 }], ['computer', { width: 1280, height: 800 }]]) {
        await r.t(`${nome}: cambio password dal pulsante «Password»`, async () => {
            const ctx = await contesto(b, viewport);
            const p = await ctx.newPage();
            const errori = []; p.on('pageerror', (e) => errori.push(e.message));
            await accediSuperAdmin(p, 'admin-pwd@piattaforma.it', 'superadmin1');
            const pulsante = p.locator('#lista-account div', { hasText: 'cassa-pwd@locale.it' }).locator('button:has-text("Password")');
            await pulsante.waitFor({ timeout: 20000 });
            await p.locator('#lista-account').scrollIntoViewIfNeeded();
            await p.screenshot({ path: `${SCREENSHOT}/password-${nome}-1-elenco.png` });
            await pulsante.click();
            await p.waitForSelector('.swal2-input');
            const proposta = await p.inputValue('.swal2-input');
            assert.equal(proposta.length, 10, 'password proposta');
            // Troppo corta: il dialogo resta aperto con l'avviso
            await p.fill('.swal2-input', 'abc'); await p.click('.swal2-confirm');
            assert.equal(await p.textContent('.swal2-validation-message'), 'Almeno 6 caratteri');
            const nuova = nome === 'telefono' ? proposta : 'Computer2026';
            await p.fill('.swal2-input', nuova); await p.click('.swal2-confirm');
            await p.waitForSelector('.swal2-icon-success, .swal2-icon-error, .swal2-icon-warning', { timeout: 60000 });
            await p.screenshot({ path: `${SCREENSHOT}/password-${nome}-2-esito.png` });
            assert.equal(await p.textContent('.swal2-title'), 'Password cambiata!');
            assert.ok(await entra('cassa-pwd@locale.it', nuova), 'non entra con la password nuova');
            assert.equal((await db.collection(`utenti/${cassa.uid}/cambio_password`).get()).size, 0, 'richiesta rimasta nel database');
            assert.deepEqual(errori, []);
            await ctx.close();
        });
    }
    await b.close();
    process.exit(r.fine() ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
