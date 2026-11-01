// Prova nel browser del sito vetrina gesti/ e delle richieste di demo nel Super Admin, con Auth e
// Firestore emulati e le regole vere (vedi ambiente.cjs).
// Esecuzione (dalla cartella principale; Playwright con Chromium e Java):
//   npx firebase emulators:exec --only auth,firestore,hosting --project demo-gestionale "node test/browser/gesti.cjs"
// Screenshot in test/browser/screenshot/ (ignorata da git).
const assert = require('assert');
const { chromium } = require('playwright');
const { SITO, admin, contesto, accediSuperAdmin, registro, SCREENSHOT } = require('./ambiente.cjs');

const TRAPPOLA = 'Mario <img src=x onerror="window.__violato=1">';

(async () => {
    const { auth, db } = admin();
    const richieste = async () => (await db.collection('richieste_demo').get()).docs.map(d => ({ id: d.id, ...d.data() }));
    // La pagina mostra subito le proprie modifiche, prima che arrivino al database: si aspetta il salvataggio vero
    const aspetta = async (prova, ms = 10000) => { for (const fine = Date.now() + ms; Date.now() < fine; await new Promise(x => setTimeout(x, 200))) if (await prova()) return true; return false; };
    for (const d of (await db.collection('richieste_demo').get()).docs) await d.ref.delete();

    const b = await chromium.launch();
    const r = registro();

    console.log('Sito vetrina gesti/:');
    for (const [nome, viewport] of [['telefono 360', { width: 360, height: 740 }], ['telefono 390', { width: 390, height: 664 }], ['computer 1366', { width: 1366, height: 768 }]]) {
        await r.t(`${nome}: niente esce dallo schermo, immagini caricate, nessun errore`, async () => {
            const ctx = await contesto(b, viewport);
            const p = await ctx.newPage();
            const errori = []; p.on('pageerror', (e) => errori.push(e.message));
            const risposta = await p.goto(SITO + '/gesti/', { waitUntil: 'networkidle' });
            assert.equal(risposta.status(), 200);
            assert.ok(!(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth)), 'la pagina scorre di lato');
            const rotte = await p.$$eval('img', (imgs) => imgs.filter(i => !(i.complete && i.naturalWidth > 0)).map(i => i.getAttribute('src')));
            assert.deepEqual(rotte, [], 'immagini non caricate');
            await p.screenshot({ path: `${SCREENSHOT}/gesti-${nome.replace(' ', '-')}.png`, fullPage: true });
            assert.deepEqual(errori, []);
            await ctx.close();
        });
    }

    const ctx = await contesto(b, { width: 390, height: 664 });
    const p = await ctx.newPage();
    await p.goto(SITO + '/gesti/', { waitUntil: 'networkidle' });
    const cursori = (ordini, scontrino, perc) => p.evaluate(([o, s, c]) => {
        for (const [id, v] of [['calc-ordini', o], ['calc-scontrino', s], ['calc-commissione', c]]) {
            const el = document.getElementById(id); el.value = v; el.dispatchEvent(new Event('input'));
        }
    }, [ordini, scontrino, perc]);
    const testo = (id) => p.textContent('#' + id);

    await r.t('calcolatore: 150 ordini × 25 € al 20% = 750 € al mese, 8532 € l\'anno (meno 39 €/mese)', async () => {
        await cursori(150, 25, 20);
        assert.match(await testo('esito-commissioni'), /750/);
        // In italiano i numeri di 4 cifre non hanno il punto delle migliaia (8532 €, 12.000 €)
        assert.match(await testo('esito-anno'), /^8532/);
        assert.match(await testo('esito-titolo'), /restano in tasca/);
    });
    await r.t('calcolatore: con pochi ordini nessuna promessa di risparmio', async () => {
        await cursori(Number(await p.getAttribute('#calc-ordini', 'min')), Number(await p.getAttribute('#calc-scontrino', 'min')), Number(await p.getAttribute('#calc-commissione', 'min')));
        assert.match(await testo('esito-titolo'), /risparmio è minimo/);
        assert.match(await testo('esito-anno'), /^0/);
    });

    const compila = async ({ consenso = true, sito = '' } = {}) => {
        await p.fill('#f-nome', TRAPPOLA); await p.fill('#f-locale', 'Pizzeria Prova');
        await p.selectOption('#f-tipo', 'Pizzeria'); await p.fill('#f-citta', 'Bari');
        await p.fill('#f-telefono', '333 123 4567'); await p.fill('#f-email', 'mario@esempio.it');
        await p.fill('#f-messaggio', 'Vorrei vedere la cassa');
        await p.evaluate((v) => { document.getElementById('f-sito').value = v; }, sito);
        if (consenso) await p.check('#f-consenso'); else await p.uncheck('#f-consenso');
    };
    const invia = () => p.evaluate(() => document.getElementById('modulo-demo').requestSubmit());

    await r.t('modulo: senza la spunta sull\'informativa non parte', async () => {
        await compila({ consenso: false });
        await p.evaluate(() => { const f = document.getElementById('f-consenso'); f.removeAttribute('required'); });
        await invia(); await p.waitForTimeout(800);
        assert.equal((await richieste()).length, 0);
    });
    await r.t('modulo: campo nascosto compilato (programma automatico) → niente invio', async () => {
        await compila({ sito: 'https://spam.example' });
        await invia(); await p.waitForTimeout(800);
        assert.equal((await richieste()).length, 0);
    });
    await r.t('modulo: richiesta inviata con i campi giusti (le regole vere la accettano)', async () => {
        await compila();
        await invia();
        await p.waitForSelector('#esito-modulo.ok', { timeout: 15000 });
        const [d] = await richieste();
        assert.ok(d, 'richiesta non salvata');
        assert.equal(d.nome, TRAPPOLA); assert.equal(d.tipo, 'Pizzeria'); assert.equal(d.telefono, '333 123 4567');
        assert.equal(d.consenso, true); assert.equal(d.pagina, 'gesti'); assert.ok(d.creato);
        await p.screenshot({ path: `${SCREENSHOT}/gesti-modulo-inviato.png` });
    });
    await ctx.close();

    console.log('Super Admin, richieste di demo:');
    const sa = await auth.createUser({ email: 'admin-gesti@piattaforma.it', password: 'superadmin1' });
    await db.doc(`utenti/${sa.uid}`).set({ email: 'admin-gesti@piattaforma.it', ruolo: 'superadmin' });
    const ctxSa = await contesto(b, { width: 390, height: 664 });
    const ps = await ctxSa.newPage();
    const errori = []; ps.on('pageerror', (e) => errori.push(e.message));
    await accediSuperAdmin(ps, 'admin-gesti@piattaforma.it', 'superadmin1');

    await r.t('la richiesta compare con «1 da richiamare», il testo «trappola» non viene eseguito', async () => {
        await ps.waitForSelector('#badge-richieste:has-text("1 da richiamare")', { timeout: 20000 });
        await ps.click('#btn-mostra-richieste');
        await ps.waitForSelector('#lista-richieste:has-text("Pizzeria Prova")');
        assert.match(await ps.textContent('#lista-richieste'), /<img src=x/);
        assert.equal(await ps.evaluate(() => window.__violato), undefined);
        assert.equal(await ps.getAttribute('#lista-richieste a[href^="https://wa.me/"]', 'href'), 'https://wa.me/393331234567');
        await ps.locator('#lista-richieste').scrollIntoViewIfNeeded();
        await ps.screenshot({ path: `${SCREENSHOT}/gesti-superadmin-richieste.png` });
    });
    await r.t('«Richiamato» la segna e toglie il badge', async () => {
        await ps.click('#lista-richieste button:has-text("Richiamato")');
        await ps.waitForSelector('#badge-richieste', { state: 'hidden' });
        assert.ok(await aspetta(async () => (await richieste())[0]?.contattato === true), 'non salvata come richiamata');
    });
    await r.t('«Elimina» con conferma la cancella', async () => {
        await ps.click('#lista-richieste button:has-text("Elimina")');
        await ps.click('.swal2-confirm');
        await ps.waitForSelector('#lista-richieste:has-text("Nessuna richiesta")');
        assert.ok(await aspetta(async () => (await richieste()).length === 0), 'non cancellata');
        assert.deepEqual(errori, []);
    });
    await b.close();
    process.exit(r.fine() ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
