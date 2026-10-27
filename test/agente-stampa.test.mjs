// Prova l'Agente di stampa (agente-stampa/agente.mjs) con gli emulatori di Firebase
// (accesso email/password + Firestore con le regole vere) e stampanti finte sulla porta TCP.
// Esecuzione (serve Java):
//   npx firebase emulators:exec --only auth,firestore --project demo-gestionale "node test/agente-stampa.test.mjs"
import net from 'node:net';
import crypto from 'node:crypto';
import assert from 'node:assert';
import { Agente, accedi } from '../agente-stampa/agente.mjs';

const PROGETTO = 'demo-gestionale';
const FS_HOST = process.env.FIRESTORE_EMULATOR_HOST, AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST;
if (!FS_HOST || !AUTH_HOST) { console.error('Avviare con: firebase emulators:exec --only auth,firestore'); process.exit(1); }
const FS = `http://${FS_HOST}/v1/projects/${PROGETTO}/databases/(default)/documents`;
const OPZ = { projectId: PROGETTO, apiKey: 'chiave-finta', attesaMs: 150, battitoMs: 600, ripresaMs: 100, tentativiMassimi: 3, timeoutStampanteMs: 1000 };

async function http(url, opz = {}) {
  const r = await fetch(url, opz);
  const t = await r.text();
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`${r.status} ${t}`);
  return t ? JSON.parse(t) : null;
}
const admin = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
const val = (x) => typeof x === 'string' ? { stringValue: x } : Number.isInteger(x) ? { integerValue: String(x) } : x instanceof Date ? { timestampValue: x.toISOString() } : typeof x === 'boolean' ? { booleanValue: x } : { nullValue: null };
const campi = (o) => ({ fields: Object.fromEntries(Object.entries(o).map(([k, v]) => [k, val(v)])) });
const leggi = (doc) => doc && Object.fromEntries(Object.entries(doc.fields || {}).map(([k, v]) => [k, v.stringValue ?? (v.integerValue !== undefined ? Number(v.integerValue) : v.booleanValue ?? v.timestampValue ?? null)]));

const scriviAdmin = (p, o) => http(`${FS}/${p}`, { method: 'PATCH', headers: admin, body: JSON.stringify(campi(o)) });
const leggiAdmin = async (p) => leggi(await http(`${FS}/${p}`, { headers: admin }));
const elencaAdmin = async (p) => ((await http(`${FS}/${p}`, { headers: admin }))?.documents || []).map(d => ({ id: d.name.split('/').pop(), ...leggi(d) }));
const svuota = () => http(`http://${FS_HOST}/emulator/v1/projects/${PROGETTO}/databases/(default)/documents`, { method: 'DELETE' });

async function creaAccount(email, locale) {
  const r = await http(`http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=x`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'segreta123', returnSecureToken: true }) });
  if (locale !== undefined) await scriviAdmin(`utenti/${r.localId}`, locale ? { ruolo: 'locale', locale } : { ruolo: 'locale' });
  return { uid: r.localId, idToken: r.idToken, email };
}

// La cassa (con l'account del locale) mette una comanda in coda
async function mettiInCoda(account, base, o) {
  const r = await http(`${FS}/${base}coda_stampa`, { method: 'POST', headers: { Authorization: `Bearer ${account.idToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(campi({ stampante: 'pizzeria', descrizione: 'PIZZERIA · prova', porta: 9100, stato: 'da_stampare', tentativi: 0, creato: new Date(), ...o })) });
  return r.name.split('/').pop();
}

function stampanteFinta() {
  return new Promise(ok => {
    const ricevuti = [];
    const srv = net.createServer(s => { const parti = []; s.on('data', b => parti.push(b)); s.on('end', () => { ricevuti.push(Buffer.concat(parti)); s.end(); }); s.on('error', () => {}); });
    srv.listen(0, '127.0.0.1', () => ok({ porta: srv.address().port, ricevuti, chiudi: () => srv.close() }));
  });
}
const portaChiusa = () => new Promise(ok => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => ok(p)); }); });
const attendi = async (cond, ms = 10000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await cond()) return true; await new Promise(r => setTimeout(r, 100)); } return false; };
const nuovoAgente = async (account, idAgente, extra = {}) => {
  const cred = await accedi(account.email, 'segreta123', { apiKey: 'chiave-finta' });
  const log = [];
  const a = new Agente({ credenziali: cred, nome: 'Agente ' + idAgente, idAgente, opzioni: { ...OPZ, ...extra }, registro: (m) => log.push(m) });
  a.log_ = log;
  agentiAvviati.push(a);
  return a;
};
const agentiAvviati = [];

let ok = 0, ko = 0;
async function prova(nome, fn) {
  try { await fn(); ok++; console.log('  ✔', nome); }
  catch (e) { ko++; console.log('  ✘', nome, '->', e.message); agentiAvviati.forEach(a => console.log(a.log_.slice(-5).map(m => '      [' + a.idAgente + '] ' + m).join('\n'))); }
  finally { await Promise.all(agentiAvviati.splice(0).map(a => a.ferma())); }
}

console.log('Agente di stampa con emulatori:');

await prova('accesso: password sbagliata rifiutata; account senza locale non parte', async () => {
  await svuota();
  const senza = await creaAccount('senzalocale@test.it', '');
  await assert.rejects(accedi('senzalocale@test.it', 'sbagliata', { apiKey: 'x' }));
  const a = await nuovoAgente(senza, 'x1');
  await assert.rejects(a.leggiLocale(), /non è collegato a un locale/);
});

await prova('locale principale: stampa byte identici, errore dopo 3 tentativi, scaduta, battito', async () => {
  await svuota();
  const cassa = await creaAccount('cassa@locale-principale.it', 'default');
  const p1 = await stampanteFinta();
  const byte = Buffer.concat([Buffer.from('\x1B\x40\x1B\x61\x01PIZZERIA\n', 'latin1'), crypto.randomBytes(3000), Buffer.from('\x1D\x56\x01', 'latin1')]);
  const buona = await mettiInCoda(cassa, '', { ip: '127.0.0.1', porta: p1.porta, dati: byte.toString('base64'), descrizione: 'PIZZERIA · Rossi 20:00' });
  const guasta = await mettiInCoda(cassa, '', { ip: '127.0.0.1', porta: await portaChiusa(), dati: 'G0A=', stampante: 'bar' });
  const vecchia = await mettiInCoda(cassa, '', { ip: '127.0.0.1', porta: p1.porta, dati: 'G0A=', creato: new Date(Date.now() - 20 * 60000) });
  const a = await nuovoAgente(cassa, 'pc1');
  a.avvia();
  assert.ok(await attendi(async () => p1.ricevuti.length === 1 && !(await leggiAdmin(`coda_stampa/${buona}`))), 'comanda stampata e tolta dalla coda');
  assert.ok(Buffer.compare(p1.ricevuti[0], byte) === 0, 'byte identici a quelli della cassa');
  assert.ok(await attendi(async () => (await leggiAdmin(`coda_stampa/${guasta}`))?.stato === 'errore'), 'stampante spenta -> errore');
  const g = await leggiAdmin(`coda_stampa/${guasta}`);
  assert.strictEqual(g.tentativi, 3); assert.match(g.errore, /bar.*rifiuta il collegamento/);
  assert.ok(await attendi(async () => (await leggiAdmin(`coda_stampa/${vecchia}`))?.stato === 'scaduta'), 'comanda vecchia -> scaduta');
  assert.strictEqual(p1.ricevuti.length, 1, 'la comanda scaduta non si stampa');
  assert.ok(await attendi(async () => (await leggiAdmin('agenti_stampa/pc1'))?.stampate === 1, 3000), 'il battito riporta le stampe');
  const ag = await leggiAdmin('agenti_stampa/pc1');
  assert.ok(ag.ultimo_contatto && Math.abs(Date.now() - new Date(ag.ultimo_contatto)) < 10000, 'ultimo_contatto con l\'ora del server');
  assert.strictEqual(ag.nome, 'Agente pc1'); assert.strictEqual(ag.tipo, 'pc'); assert.ok(ag.versione);
  await a.ferma(); p1.chiudi();
});

await prova('altro locale: stampa le sue comande e NON tocca quelle del locale principale', async () => {
  await svuota();
  const cassaDefault = await creaAccount('cassa2@locale-principale.it', 'default');
  const cassaTest = await creaAccount('cassa@pizzeriatest.it', 'pizzeria-test');
  const p = await stampanteFinta();
  const suaComanda = await mettiInCoda(cassaTest, 'ristoranti/pizzeria-test/', { ip: '127.0.0.1', porta: p.porta, dati: Buffer.from('TEST').toString('base64') });
  const altrui = await mettiInCoda(cassaDefault, '', { ip: '127.0.0.1', porta: p.porta, dati: Buffer.from('DEFAULT').toString('base64') });
  const a = await nuovoAgente(cassaTest, 'esp-test');
  a.avvia();
  assert.ok(await attendi(async () => !(await leggiAdmin(`ristoranti/pizzeria-test/coda_stampa/${suaComanda}`))), 'stampata');
  await new Promise(r => setTimeout(r, 800));
  await a.ferma();
  assert.deepStrictEqual(p.ricevuti.map(b => b.toString()), ['TEST']);
  assert.strictEqual((await leggiAdmin(`coda_stampa/${altrui}`)).stato, 'da_stampare', 'la comanda dell\'altro locale resta lì');
  assert.ok(await leggiAdmin('ristoranti/pizzeria-test/agenti_stampa/esp-test'), 'battito nel suo locale');
  assert.strictEqual(await leggiAdmin('agenti_stampa/esp-test'), null);
  p.chiudi();
});

await prova('due agenti nello stesso locale: ogni comanda esce una volta sola', async () => {
  await svuota();
  const cassa = await creaAccount('cassa3@locale-principale.it', 'default');
  const p = await stampanteFinta();
  for (let i = 0; i < 8; i++) await mettiInCoda(cassa, '', { ip: '127.0.0.1', porta: p.porta, dati: Buffer.from('C' + i).toString('base64') });
  const a1 = await nuovoAgente(cassa, 'a1', { attesaMs: 50 }), a2 = await nuovoAgente(cassa, 'a2', { attesaMs: 50 });
  a1.avvia(); a2.avvia();
  assert.ok(await attendi(async () => (await elencaAdmin('coda_stampa')).length === 0), 'coda svuotata');
  await new Promise(r => setTimeout(r, 500));
  await Promise.all([a1.ferma(), a2.ferma()]);
  assert.deepStrictEqual(p.ricevuti.map(b => b.toString()).sort(), ['C0', 'C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7']);
  p.chiudi();
});

await prova('stampata ma la rete cade prima di toglierla dalla coda: NON si ristampa, si toglie al giro dopo', async () => {
  await svuota();
  const cassa = await creaAccount('cassa6@locale-principale.it', 'default');
  const p = await stampanteFinta();
  const id = await mettiInCoda(cassa, '', { ip: '127.0.0.1', porta: p.porta, dati: Buffer.from('UNA').toString('base64') });
  const a = await nuovoAgente(cassa, 'pc6', { attesaMs: 100 });
  // La prima cancellazione dalla coda non arriva (rete che cade)
  const fsVero = a.fs.bind(a);
  let cancellazioniFallite = 0;
  a.fs = async (url, opz = {}) => {
    if (opz.method === 'DELETE' && cancellazioniFallite === 0) { cancellazioniFallite++; throw new Error('fetch failed'); }
    return fsVero(url, opz);
  };
  a.avvia();
  assert.ok(await attendi(async () => !(await leggiAdmin(`coda_stampa/${id}`))), 'tolta dalla coda al giro dopo');
  await new Promise(r => setTimeout(r, 500));
  await a.ferma();
  assert.strictEqual(cancellazioniFallite, 1);
  assert.deepStrictEqual(p.ricevuti.map(b => b.toString()), ['UNA'], 'stampata una volta sola');
  assert.ok(a.log_.some(m => /non ancora tolta dalla coda/.test(m)));
  p.chiudi();
});

await prova('"Scollega" dalla cassa: l\'agente si ferma e dimentica il token', async () => {
  await svuota();
  const cassa = await creaAccount('cassa4@locale-principale.it', 'default');
  const a = await nuovoAgente(cassa, 'esp-cucina');
  let scollegato = false;
  a.onScollegato = () => { scollegato = true; };
  const ciclo = a.avvia();
  assert.ok(await attendi(async () => !!(await leggiAdmin('agenti_stampa/esp-cucina'))));
  // la cassa scrive disattivato: true (pulsante "Scollega")
  await http(`${FS}/agenti_stampa/esp-cucina?updateMask.fieldPaths=disattivato`, { method: 'PATCH', headers: { Authorization: `Bearer ${cassa.idToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify(campi({ disattivato: true })) });
  assert.ok(await attendi(async () => scollegato, 5000), 'agente fermato');
  await ciclo;
  assert.strictEqual(a.attivo, false);
  assert.ok(a.log_.some(m => /scollegato dalla cassa/.test(m)));
});

await prova('il token si rinnova da solo', async () => {
  await svuota();
  const cassa = await creaAccount('cassa5@locale-principale.it', 'default');
  const a = await nuovoAgente(cassa, 'pc5');
  let rinnovato = null;
  a.onCredenziali = (c) => { rinnovato = c; };
  await a.leggiLocale();
  a.cred.scadenza = 0;
  await a.controllaCoda();
  assert.ok(rinnovato && rinnovato.idToken && rinnovato.refreshToken, 'nuovo token ottenuto');
});

console.log(`\nRISULTATO: ${ok} ok, ${ko} falliti`);
process.exit(ko ? 1 : 0);
