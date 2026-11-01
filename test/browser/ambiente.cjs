// Ambiente comune delle prove nel browser (Playwright + emulatori Firebase, avviati da emulators:exec):
// - le pagine vere le serve l'emulatore Hosting su http://127.0.0.1:5000;
// - i moduli Firebase del CDN gstatic arrivano dal pacchetto "firebase" installato alla radice, con
//   l'aggiunta del collegamento agli emulatori e il progetto "demo-gestionale";
// - SweetAlert2 dal pacchetto locale; Font Awesome e Google Fonts vuoti (i CDN nelle sessioni cloud
//   sono spesso bloccati).
// Pacchetti alla radice (nelle sessioni cloud li installa l'hook di avvio):
//   npm install --no-save firebase@10.7.1 sweetalert2@11.26.25
const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');

const RADICE = path.resolve(__dirname, '../..');
const SITO = 'http://127.0.0.1:5000';
const PROGETTO = 'demo-gestionale';
const AUTH = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';
const FIRESTORE = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8085').split(':');

// Admin SDK (dalle dipendenze delle Cloud Functions) per preparare e controllare i dati
function admin() {
    const req = createRequire(path.join(RADICE, 'functions/package.json'));
    const { initializeApp, getApps } = req('firebase-admin/app');
    const { getAuth } = req('firebase-admin/auth');
    const { getFirestore } = req('firebase-admin/firestore');
    if (!getApps().length) initializeApp({ projectId: PROGETTO });
    return { auth: getAuth(), db: getFirestore() };
}

const FB = path.join(RADICE, 'node_modules/firebase/');
const SHIM = {
    'firebase-app.js': `import * as v from 'https://vero.local/firebase-app.js'; export * from 'https://vero.local/firebase-app.js';
        export function initializeApp(c, n) { return v.initializeApp({ ...c, projectId: '${PROGETTO}' }, n); }`,
    'firebase-firestore.js': `import * as v from 'https://vero.local/firebase-firestore.js'; export * from 'https://vero.local/firebase-firestore.js';
        const fatti = new WeakSet(); const col = (db) => { if (!fatti.has(db)) { fatti.add(db); try { v.connectFirestoreEmulator(db, '${FIRESTORE[0]}', ${FIRESTORE[1]}); } catch (e) {} } return db; };
        export function getFirestore(...a) { return col(v.getFirestore(...a)); }
        export function initializeFirestore(...a) { return col(v.initializeFirestore(...a)); }`,
    'firebase-auth.js': `import * as v from 'https://vero.local/firebase-auth.js'; export * from 'https://vero.local/firebase-auth.js';
        const fatti = new WeakSet(); export function getAuth(...a) { const x = v.getAuth(...a); if (!fatti.has(x)) { fatti.add(x); v.connectAuthEmulator(x, 'http://${AUTH}', { disableWarnings: true }); } return x; }`,
};
const js = (body) => ({ status: 200, contentType: 'application/javascript', headers: { 'Access-Control-Allow-Origin': '*' }, body });

// Contesto del browser con tutte le deviazioni verso file locali ed emulatori
async function contesto(browser, viewport) {
    const ctx = await browser.newContext({ viewport });
    await ctx.route('https://www.gstatic.com/firebasejs/10.7.1/*', (r) => {
        const f = r.request().url().split('/').pop();
        return r.fulfill(js(SHIM[f] || fs.readFileSync(FB + f, 'utf8')));
    });
    await ctx.route('https://vero.local/*', (r) => r.fulfill(js(fs.readFileSync(FB + r.request().url().split('/').pop(), 'utf8'))));
    await ctx.route('https://cdn.jsdelivr.net/npm/sweetalert2@11', (r) => r.fulfill(js(fs.readFileSync(path.join(RADICE, 'node_modules/sweetalert2/dist/sweetalert2.all.min.js'), 'utf8'))));
    await ctx.route(/cdnjs\.cloudflare\.com|fonts\.googleapis\.com|fonts\.gstatic\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
    return ctx;
}

// Accesso come un dispositivo (API REST dell'emulatore Auth): true se email e password sono giuste
async function entra(email, password) {
    const r = await fetch(`http://${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=x`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, returnSecureToken: true }),
    });
    return r.ok;
}

// Accesso al Super Admin dalla schermata di login-dispositivo.js
async function accediSuperAdmin(page, email, password) {
    await page.goto(SITO + '/superadmin.html');
    await page.fill('#login-dispositivo-overlay input[name=email]', email);
    await page.fill('#login-dispositivo-overlay input[name=password]', password);
    await page.click('#login-dispositivo-overlay button[type=submit]');
}

// Piccolo registro dei risultati, come negli altri test
function registro() {
    let ok = 0, ko = 0;
    return {
        async t(nome, fn) {
            try { await fn(); ok++; console.log('  ✔', nome); }
            catch (e) { ko++; console.log('  ✘', nome, '->', e.message.split('\n')[0]); }
        },
        fine() { console.log(`\nRISULTATO: ${ok} ok, ${ko} falliti`); return ko; },
    };
}

const SCREENSHOT = path.join(__dirname, 'screenshot');
fs.mkdirSync(SCREENSHOT, { recursive: true });

module.exports = { RADICE, SITO, admin, contesto, entra, accediSuperAdmin, registro, SCREENSHOT };
