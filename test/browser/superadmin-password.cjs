// Prova nel browser del cambio password in Super Admin: pagina vera (servita dall'emulatore Hosting)
// con Auth, Firestore e Functions emulati, a misura di telefono (390x664) e di computer.
// Le librerie da CDN (spesso bloccate nelle sessioni cloud) arrivano dai pacchetti installati alla
// radice; i moduli Firebase sono quelli veri del pacchetto "firebase", collegati agli emulatori.
// Esecuzione (dalla cartella principale; Playwright con Chromium, Java; nelle sessioni cloud l'hook
// di avvio installa già tutto il resto):
//   npm install --no-save sweetalert2@11.26.25
//   npx firebase emulators:exec --only auth,functions,firestore,hosting --project demo-gestionale "node test/browser/superadmin-password.cjs"
// Screenshot in test/browser/screenshot/ (ignorata da git).
const fs = require('fs');
const { createRequire } = require('module');
const { chromium } = require('playwright');
const path = require('path');
const R = path.resolve(__dirname, '../..');
const S = path.join(__dirname, 'screenshot');
fs.mkdirSync(S, { recursive: true });
const req = createRequire(R + '/functions/package.json');
const { initializeApp } = req('firebase-admin/app');
const { getAuth } = req('firebase-admin/auth');
const { getFirestore } = req('firebase-admin/firestore');
initializeApp({ projectId: 'demo-gestionale' });
const auth = getAuth(), db = getFirestore();
const AUTH = process.env.FIREBASE_AUTH_EMULATOR_HOST;

const FB = R + '/node_modules/firebase/';
const shim = {
  'firebase-app.js': `import * as v from 'https://vero.local/firebase-app.js'; export * from 'https://vero.local/firebase-app.js';
    export function initializeApp(c, n) { return v.initializeApp({ ...c, projectId: 'demo-gestionale' }, n); }`,
  'firebase-firestore.js': `import * as v from 'https://vero.local/firebase-firestore.js'; export * from 'https://vero.local/firebase-firestore.js';
    const fatti = new WeakSet(); const col = (db) => { if (!fatti.has(db)) { fatti.add(db); try { v.connectFirestoreEmulator(db, '127.0.0.1', 8085); } catch (e) {} } return db; };
    export function getFirestore(...a) { return col(v.getFirestore(...a)); }
    export function initializeFirestore(...a) { return col(v.initializeFirestore(...a)); }`,
  'firebase-auth.js': `import * as v from 'https://vero.local/firebase-auth.js'; export * from 'https://vero.local/firebase-auth.js';
    const fatti = new WeakSet(); export function getAuth(...a) { const x = v.getAuth(...a); if (!fatti.has(x)) { fatti.add(x); v.connectAuthEmulator(x, 'http://${AUTH}', { disableWarnings: true }); } return x; }`,
};
const js = (body) => ({ status: 200, contentType: 'application/javascript', headers: { 'Access-Control-Allow-Origin': '*' }, body });

async function entra(email, password) {
  const r = await fetch(`http://${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=x`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, returnSecureToken: true }) });
  return r.ok;
}

(async () => {
  const admin = await auth.createUser({ email: 'admin@piattaforma.it', password: 'superadmin1' });
  await db.doc(`utenti/${admin.uid}`).set({ email: 'admin@piattaforma.it', ruolo: 'superadmin' });
  const cassa = await auth.createUser({ email: 'cassa@locale.it', password: 'vecchia1' });
  await db.doc(`utenti/${cassa.uid}`).set({ email: 'cassa@locale.it', ruolo: 'locale', locale: 'default' });

  const b = await chromium.launch();
  const esiti = {};
  for (const [nome, vp] of [['telefono', { width: 390, height: 664 }], ['computer', { width: 1280, height: 800 }]]) {
    const ctx = await b.newContext({ viewport: vp });
    await ctx.route('https://www.gstatic.com/firebasejs/10.7.1/*', (r) => { const f = r.request().url().split('/').pop(); return r.fulfill(shim[f] ? js(shim[f]) : js(fs.readFileSync(FB + f, 'utf8'))); });
    await ctx.route('https://vero.local/*', (r) => r.fulfill(js(fs.readFileSync(FB + r.request().url().split('/').pop(), 'utf8'))));
    await ctx.route('https://cdn.jsdelivr.net/npm/sweetalert2@11', (r) => r.fulfill(js(fs.readFileSync(R + '/node_modules/sweetalert2/dist/sweetalert2.all.min.js', 'utf8'))));
    await ctx.route(/cdnjs\.cloudflare\.com|fonts\.googleapis|fonts\.gstatic/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
    const p = await ctx.newPage();
    const errori = []; p.on('pageerror', (e) => errori.push(e.message));
    await p.goto('http://127.0.0.1:5000/superadmin.html');
    await p.fill('#login-dispositivo-overlay input[name=email]', 'admin@piattaforma.it');
    await p.fill('#login-dispositivo-overlay input[name=password]', 'superadmin1');
    await p.click('#login-dispositivo-overlay button[type=submit]');
    await p.waitForSelector('#lista-account button:has-text("Password")', { timeout: 20000 });
    await p.locator('#lista-account').scrollIntoViewIfNeeded(); await p.screenshot({ path: `${S}/sa-${nome}-1-elenco.png` });
    await p.click('#lista-account button:has-text("Password")');
    await p.waitForSelector('.swal2-input');
    const proposta = await p.inputValue('.swal2-input');
    await p.screenshot({ path: `${S}/sa-${nome}-2-dialogo.png` });
    // Troppo corta: il dialogo non si chiude
    await p.fill('.swal2-input', 'abc'); await p.click('.swal2-confirm');
    const avviso = await p.textContent('.swal2-validation-message');
    const nuova = nome === 'telefono' ? proposta : 'Computer2026';
    await p.fill('.swal2-input', nuova); await p.click('.swal2-confirm');
    await p.waitForSelector('.swal2-icon-success, .swal2-icon-error, .swal2-icon-warning', { timeout: 60000 });
    const titolo = await p.textContent('.swal2-title');
    await p.screenshot({ path: `${S}/sa-${nome}-3-esito.png` });
    const rimaste = (await db.collection(`utenti/${cassa.uid}/cambio_password`).get()).size;
    esiti[nome] = { proposta, lunghezzaProposta: proposta.length, avvisoCorta: avviso, titolo, entraConNuova: await entra('cassa@locale.it', nuova), richiesteRimaste: rimaste, errori };
    await ctx.close();
  }
  console.log(JSON.stringify(esiti, null, 1));
  await b.close();
  const ko = Object.values(esiti).filter(e => e.titolo !== 'Password cambiata!' || !e.entraConNuova || e.richiesteRimaste || e.errori.length || e.avvisoCorta !== 'Almeno 6 caratteri');
  console.log(`\nRISULTATO: ${Object.keys(esiti).length - ko.length} ok, ${ko.length} falliti`);
  process.exit(ko.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
