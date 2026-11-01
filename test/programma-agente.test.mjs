// Prova il programma per Windows dell'Agente di stampa (agente-stampa/programma.mjs): la pagina di
// controllo su 127.0.0.1, il collegamento con email e password, "Scollega" (dalla cassa e dalla pagina),
// la ripresa quando torna internet, la stampa di prova, la ricerca delle stampanti e l'aggiornamento.
// Esecuzione (serve Java):
//   npx firebase emulators:exec --only auth,firestore --project demo-gestionale "node test/programma-agente.test.mjs"
import net from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import assert from 'node:assert';
import { Programma, versioneMaggiore, indirizziDaCercare, scontrinoDiProva } from '../agente-stampa/programma.mjs';
import { VERSIONE } from '../agente-stampa/agente.mjs';

const PROGETTO = 'demo-gestionale';
const FS_HOST = process.env.FIRESTORE_EMULATOR_HOST, AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST;
if (!FS_HOST || !AUTH_HOST) { console.error('Avviare con: firebase emulators:exec --only auth,firestore'); process.exit(1); }
const FS = `http://${FS_HOST}/v1/projects/${PROGETTO}/databases/(default)/documents`;
const OPZ = { projectId: PROGETTO, apiKey: 'chiave-finta', attesaMs: 150, battitoMs: 500, ripresaMs: 100, tentativiMassimi: 3, timeoutStampanteMs: 1000 };

async function richiesta(url, opz = {}) {
  const r = await fetch(url, opz);
  const t = await r.text();
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`${r.status} ${t}`);
  return t ? JSON.parse(t) : null;
}
const admin = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
const val = (x) => typeof x === 'string' ? { stringValue: x } : Number.isInteger(x) ? { integerValue: String(x) } : x instanceof Date ? { timestampValue: x.toISOString() } : typeof x === 'boolean' ? { booleanValue: x }
  : x && typeof x === 'object' ? { mapValue: { fields: Object.fromEntries(Object.entries(x).map(([k, v]) => [k, val(v)])) } } : { nullValue: null };
const campi = (o) => ({ fields: Object.fromEntries(Object.entries(o).map(([k, v]) => [k, val(v)])) });
const leggi = (doc) => doc && Object.fromEntries(Object.entries(doc.fields || {}).map(([k, v]) => [k, v.stringValue ?? (v.integerValue !== undefined ? Number(v.integerValue) : v.booleanValue ?? v.timestampValue ?? null)]));
const scriviAdmin = (p, o) => richiesta(`${FS}/${p}`, { method: 'PATCH', headers: admin, body: JSON.stringify(campi(o)) });
const leggiAdmin = async (p) => leggi(await richiesta(`${FS}/${p}`, { headers: admin }));
const svuota = () => richiesta(`http://${FS_HOST}/emulator/v1/projects/${PROGETTO}/databases/(default)/documents`, { method: 'DELETE' });

async function creaAccount(email, locale) {
  const r = await richiesta(`http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=x`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'segreta123', returnSecureToken: true }) });
  if (locale !== undefined) await scriviAdmin(`utenti/${r.localId}`, locale ? { ruolo: 'locale', locale } : { ruolo: 'locale' });
  return { uid: r.localId, idToken: r.idToken, email };
}
async function mettiInCoda(account, base, o) {
  const r = await richiesta(`${FS}/${base}coda_stampa`, { method: 'POST', headers: { Authorization: `Bearer ${account.idToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(campi({ stampante: 'pizzeria', descrizione: 'PIZZERIA · prova', porta: 9100, stato: 'da_stampare', tentativi: 0, creato: new Date(), ...o })) });
  return r.name.split('/').pop();
}
function stampanteFinta() {
  return new Promise(ok => {
    const ricevuti = [];
    const srv = net.createServer(s => { const parti = []; s.on('data', b => parti.push(b)); s.on('end', () => { if (parti.length) ricevuti.push(Buffer.concat(parti)); s.end(); }); s.on('error', () => {}); });
    srv.listen(0, '127.0.0.1', () => ok({ porta: srv.address().port, ricevuti, chiudi: () => srv.close() }));
  });
}
const portaLibera = () => new Promise(ok => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => ok(p)); }); });
const attendi = async (cond, ms = 10000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await cond()) return true; await new Promise(r => setTimeout(r, 100)); } return false; };
const pausa = (ms) => new Promise(r => setTimeout(r, ms));

// La pagina come la usa il browser: prima "/", da cui prende la chiave, poi le richieste con la chiave
async function pagina(p) {
  const base = `http://127.0.0.1:${p.porta}`;
  const html = await (await fetch(base + '/')).text();
  const chiave = JSON.parse(html.match(/const CHIAVE = ("[^"]+")/)[1]);
  const chiama = async (percorso, dati) => {
    const r = await fetch(base + percorso, { method: dati === undefined ? 'GET' : 'POST', headers: { 'X-Chiave': chiave, 'Content-Type': 'application/json' }, body: dati === undefined ? undefined : JSON.stringify(dati) });
    return { codice: r.status, ...(await r.json()) };
  };
  return { html, chiave, chiama, base };
}

const programmi = [];
const cartelle = [];
async function nuovoProgramma(extra = {}) {
  const cartella = extra.cartella || fs.mkdtempSync(path.join(os.tmpdir(), 'agente-programma-'));
  cartelle.push(cartella);
  const p = new Programma({ cartella, porte: [await portaLibera()], apriBrowser: false, silenzioso: true, opzioniAgente: OPZ, riprovaReteMs: 300, ...extra });
  programmi.push(p);
  return p;
}

let ok = 0, ko = 0;
async function prova(nome, fn) {
  try { await fn(); ok++; console.log('  ✔', nome); }
  catch (e) { ko++; console.log('  ✘', nome, '->', e.stack?.split('\n').slice(0, 3).join(' | ')); programmi.forEach(p => console.log(p.righe.slice(-6).map(r => '      ' + r).join('\n'))); }
  finally { await Promise.all(programmi.splice(0).map(p => p.chiudi())); }
}

console.log('Programma per Windows dell\'Agente di stampa:');

await prova('funzioni di base: versioni, indirizzi da cercare, scontrino di prova', async () => {
  assert.ok(versioneMaggiore('1.2.0', '1.1.9') && versioneMaggiore('2.0.0', '1.10.3') && !versioneMaggiore('1.1.0', '1.1.0') && !versioneMaggiore('1.0.9', '1.1.0'));
  const ind = indirizziDaCercare([{ family: 'IPv4', address: '192.168.1.20', internal: false }, { family: 'IPv4', address: '127.0.0.1', internal: true }, { family: 'IPv4', address: '169.254.3.4', internal: false }, { family: 'IPv6', address: '::1', internal: true }]);
  assert.strictEqual(ind.length, 253, 'tutta la rete 192.168.1.x tranne il PC');
  assert.ok(ind.includes('192.168.1.1') && ind.includes('192.168.1.254') && !ind.includes('192.168.1.20'));
  const s = scontrinoDiProva({ nome: 'PIZZERIA', ip: '192.168.1.50', porta: 9100, locale: 'da-mimmo', agente: 'PC cassa città' });
  assert.ok(s.startsWith('\x1B\x40') && s.includes('PROVA DI STAMPA') && s.includes('192.168.1.50:9100') && s.includes('PC cassa citta') && s.endsWith('\x1D\x56\x01'));
  assert.ok(/^[\x00-\x7F]*$/.test(s), 'solo caratteri ASCII');
});

await prova('pagina: solo da questo PC e solo con la chiave', async () => {
  await svuota();
  const p = await nuovoProgramma();
  assert.strictEqual(await p.avvia(), true);
  const { html, chiama, base } = await pagina(p);
  assert.ok(html.includes('Agente di stampa') && html.includes(VERSIONE));
  // Senza chiave (un altro sito aperto nel browser): niente
  for (const [metodo, percorso] of [['GET', '/stato'], ['POST', '/collega'], ['POST', '/scollega'], ['POST', '/prova']]) {
    const r = await fetch(base + percorso, { method: metodo, headers: { 'Content-Type': 'application/json' }, body: metodo === 'POST' ? '{}' : undefined });
    assert.strictEqual(r.status, 403, `${metodo} ${percorso} senza chiave`);
  }
  const sbagliata = await fetch(base + '/stato', { headers: { 'X-Chiave': 'x'.repeat(24) } });
  assert.strictEqual(sbagliata.status, 403);
  // Nome diverso da 127.0.0.1/localhost ("DNS rebinding"): niente, nemmeno la pagina
  const rebinding = await new Promise((ok) => http.get({ host: '127.0.0.1', port: p.porta, path: '/', headers: { Host: 'sito-cattivo.example:' + p.porta } }, (r) => { r.resume(); ok(r.statusCode); }));
  assert.strictEqual(rebinding, 403);
  const pg = await fetch(base + '/');
  assert.strictEqual(pg.headers.get('x-frame-options'), 'DENY', 'non si può mettere dentro un altro sito');
  const s = await chiama('/stato');
  assert.strictEqual(s.codice, 200);
  assert.strictEqual(s.fase, 'da_collegare');
});

await prova('collegamento: errori spiegati, password non salvata, agente in linea e stampa', async () => {
  await svuota();
  const cassa = await creaAccount('cassa@programma.it', 'default');
  await creaAccount('senzalocale@programma.it', '');
  const p = await nuovoProgramma();
  await p.avvia();
  const { chiama } = await pagina(p);
  let r = await chiama('/collega', { email: 'cassa@programma.it', password: 'sbagliata', nome: 'PC cassa' });
  assert.strictEqual(r.codice, 400); assert.match(r.errore, /Email o password sbagliate/);
  r = await chiama('/collega', { email: 'senzalocale@programma.it', password: 'segreta123' });
  assert.strictEqual(r.codice, 400); assert.match(r.errore, /non è collegato a un locale/);
  r = await chiama('/collega', { email: '', password: '' });
  assert.match(r.errore, /Scrivi email e password/);

  r = await chiama('/collega', { email: 'cassa@programma.it', password: 'segreta123', nome: 'PC cassa' });
  assert.strictEqual(r.codice, 200, JSON.stringify(r)); assert.strictEqual(r.locale, 'default');
  const salvato = fs.readFileSync(p.fileConfig, 'utf8');
  assert.ok(!salvato.includes('segreta123'), 'la password non resta sul PC');
  assert.ok(JSON.parse(salvato).refreshToken);
  if (process.platform !== 'win32') assert.strictEqual(fs.statSync(p.fileConfig).mode & 0o077, 0, 'file leggibile solo dall\'utente');
  const s = await chiama('/stato');
  assert.strictEqual(s.fase, 'attivo'); assert.strictEqual(s.locale, 'default'); assert.strictEqual(s.nome, 'PC cassa');
  const idAgente = JSON.parse(salvato).idAgente;
  assert.ok(await attendi(async () => (await leggiAdmin(`agenti_stampa/${idAgente}`))?.nome === 'PC cassa'), 'compare in cassa');
  assert.strictEqual((await leggiAdmin(`agenti_stampa/${idAgente}`)).tipo, 'pc');

  const st = await stampanteFinta();
  await mettiInCoda(cassa, '', { ip: '127.0.0.1', porta: st.porta, dati: Buffer.from('COMANDA 1').toString('base64') });
  assert.ok(await attendi(async () => st.ricevuti.length === 1), 'comanda stampata');
  assert.strictEqual(st.ricevuti[0].toString(), 'COMANDA 1');
  assert.ok(await attendi(async () => (await chiama('/stato')).stampate === 1));
  st.chiudi();
});

await prova('stampanti della cassa, avviso QZ, stampa di prova e ricerca in rete', async () => {
  await svuota();
  const cassa = await creaAccount('cassa2@programma.it', 'pizzeria-test');
  const st = await stampanteFinta(), st2 = await stampanteFinta();
  await scriviAdmin('ristoranti/pizzeria-test/impostazioni/negozio', { nome: 'Pizzeria Bella' });
  // pizzeria rinominata «Forno» e una stampante aggiunta dal locale (Friggitoria)
  await scriviAdmin('ristoranti/pizzeria-test/impostazioni/stampanti', { metodo: 'qz', conto: { ip: `127.0.0.1:${st.porta}` }, preconto: { ip: '' }, pizzeria: { ip: '192.168.1.50', nome: 'Forno' }, cucina: { ip: '' }, bar: { ip: '' }, stm_friggitoria: { nome: 'Friggitoria', ip: '192.168.1.60', cats: ['ant_pizzeria'] } });
  const p = await nuovoProgramma({ ricerca: { indirizzi: ['127.0.0.1', '127.0.0.2'], porta: st2.porta, timeoutMs: 400 } });
  await p.avvia();
  const { chiama } = await pagina(p);
  const c = await chiama('/collega', { email: cassa.email, password: 'segreta123', nome: 'PC bar' });
  assert.strictEqual(c.locale, 'Pizzeria Bella', 'si vede il nome del locale, non il suo codice');
  let s;
  assert.ok(await attendi(async () => (s = await chiama('/stato')).stampanti));
  assert.strictEqual(s.locale, 'Pizzeria Bella');
  assert.strictEqual(s.stampanti.metodo, 'qz', 'la pagina avvisa di scegliere «Agente di stampa» in cassa');
  assert.deepStrictEqual(s.stampanti.elenco.map(x => [x.nome, x.ip]), [['CASSA', `127.0.0.1:${st.porta}`], ['PRECONTO', ''], ['Forno', '192.168.1.50'], ['CUCINA', ''], ['BAR', ''], ['Friggitoria', '192.168.1.60']], 'nomi scelti dal locale e stampanti aggiunte');

  let r = await chiama('/prova', { indirizzo: `127.0.0.1:${st.porta}`, nome: 'CASSA' });
  assert.strictEqual(r.codice, 200, JSON.stringify(r));
  assert.ok(await attendi(async () => st.ricevuti.length === 1));
  const foglio = st.ricevuti[0].toString('latin1');
  assert.ok(foglio.includes('PROVA DI STAMPA') && foglio.includes('Stampante: CASSA') && foglio.includes('Locale: Pizzeria Bella') && foglio.includes('Agente: PC bar'), foglio);

  r = await chiama('/prova', { indirizzo: `127.0.0.1:${await portaLibera()}` });
  assert.strictEqual(r.codice, 400); assert.match(r.errore, /127\.0\.0\.1 rifiuta il collegamento/);
  r = await chiama('/prova', { indirizzo: 'ciao come va' });
  assert.match(r.errore, /Indirizzo non valido/);

  r = await chiama('/cerca', {});
  assert.deepStrictEqual(r.trovate, ['127.0.0.1'], 'trova la stampante accesa (127.0.0.2 non risponde)');
  assert.strictEqual(st2.ricevuti.length, 0, 'la ricerca non stampa niente');
  st.chiudi(); st2.chiudi();
});

await prova('"Scollega" dalla cassa, poi ricollegato: resta in linea (prima tornava scollegato)', async () => {
  await svuota();
  const cassa = await creaAccount('cassa3@programma.it', 'default');
  const p = await nuovoProgramma();
  await p.avvia();
  const { chiama } = await pagina(p);
  await chiama('/collega', { email: cassa.email, password: 'segreta123', nome: 'PC cucina' });
  const id = p.config.idAgente;
  assert.ok(await attendi(async () => !!(await leggiAdmin(`agenti_stampa/${id}`))));
  await richiesta(`${FS}/agenti_stampa/${id}?updateMask.fieldPaths=disattivato`, { method: 'PATCH', headers: { Authorization: `Bearer ${cassa.idToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify(campi({ disattivato: true })) });
  assert.ok(await attendi(async () => (await chiama('/stato')).fase === 'da_collegare'), 'si ferma');
  assert.match((await chiama('/stato')).messaggio, /Scollegato dalla cassa/);
  assert.ok(!JSON.parse(fs.readFileSync(p.fileConfig, 'utf8')).refreshToken, 'accesso dimenticato');

  const r = await chiama('/collega', { email: cassa.email, password: 'segreta123', nome: 'PC cucina' });
  assert.strictEqual(r.codice, 200);
  assert.strictEqual(p.config.idAgente, id, 'stesso agente in cassa');
  await pausa(1800);  // più battiti
  assert.strictEqual((await chiama('/stato')).fase, 'attivo');
  assert.strictEqual((await leggiAdmin(`agenti_stampa/${id}`)).disattivato, false);
});

await prova('"Scollega" dalla pagina: si ferma e sparisce dalla cassa', async () => {
  await svuota();
  const cassa = await creaAccount('cassa4@programma.it', 'default');
  const p = await nuovoProgramma();
  await p.avvia();
  const { chiama } = await pagina(p);
  await chiama('/collega', { email: cassa.email, password: 'segreta123', nome: 'PC sala' });
  const id = p.config.idAgente;
  assert.ok(await attendi(async () => !!(await leggiAdmin(`agenti_stampa/${id}`))));
  const r = await chiama('/scollega', {});
  assert.strictEqual(r.codice, 200);
  const s = await chiama('/stato');
  assert.strictEqual(s.fase, 'da_collegare');
  assert.strictEqual(s.email, cassa.email, 'l\'email resta per ricollegarlo');
  await pausa(800);
  assert.strictEqual(await leggiAdmin(`agenti_stampa/${id}`), null, 'tolto dall\'elenco della cassa');
});

await prova('riacceso: riparte da solo; senza internet aspetta e riprova; accesso scaduto → da collegare', async () => {
  await svuota();
  const cassa = await creaAccount('cassa5@programma.it', 'default');
  const p1 = await nuovoProgramma();
  await p1.avvia();
  await (await pagina(p1)).chiama('/collega', { email: cassa.email, password: 'segreta123', nome: 'PC cassa' });
  await p1.chiudi();

  // PC riacceso: stesso file, nessuna password
  const p2 = await nuovoProgramma({ cartella: p1.cartella, avvioAutomatico: true });
  await p2.avvia();
  assert.strictEqual(p2.fase, 'attivo');
  await p2.chiudi();

  // PC acceso prima del router: internet non risponde, poi torna
  const vero = process.env.FIREBASE_AUTH_EMULATOR_HOST;
  process.env.FIREBASE_AUTH_EMULATOR_HOST = `127.0.0.1:${await portaLibera()}`;
  const p3 = await nuovoProgramma({ cartella: p1.cartella, avvioAutomatico: true });
  await p3.avvia();
  assert.strictEqual(p3.fase, 'attesa_rete');
  assert.match(p3.messaggio, /Internet non risponde/);
  process.env.FIREBASE_AUTH_EMULATOR_HOST = vero;
  assert.ok(await attendi(async () => p3.fase === 'attivo', 5000), 'riparte quando torna internet');
  assert.ok(JSON.parse(fs.readFileSync(p1.fileConfig, 'utf8')).refreshToken, 'l\'accesso NON si perde per un problema di rete');
  await p3.chiudi();

  // Accesso non più valido (es. password del locale cambiata)
  const conf = JSON.parse(fs.readFileSync(p1.fileConfig, 'utf8'));
  fs.writeFileSync(p1.fileConfig, JSON.stringify({ ...conf, refreshToken: 'token-non-valido' }));
  const p4 = await nuovoProgramma({ cartella: p1.cartella, avvioAutomatico: true });
  await p4.avvia();
  assert.strictEqual(p4.fase, 'da_collegare');
  assert.match(p4.messaggio, /non vale più/);
});

await prova('un solo agente per PC: il secondo avvio apre la pagina del primo e si chiude', async () => {
  const p1 = await nuovoProgramma();
  assert.strictEqual(await p1.avvia(), true);
  const p2 = await nuovoProgramma({ porte: p1.porte });
  assert.strictEqual(await p2.avvia(), false);
  // Porta occupata da un altro programma: usa la successiva
  const altro = http.createServer((q, r) => r.end('altro')).listen(0, '127.0.0.1');
  await new Promise(r => altro.once('listening', r));
  const p3 = await nuovoProgramma({ porte: [altro.address().port, await portaLibera()] });
  assert.strictEqual(await p3.avvia(), true);
  assert.strictEqual(p3.porta, p3.porte[1]);
  altro.close();
});

await prova('aggiornamento automatico: scarica, controlla, installa; mai durante il servizio', async () => {
  await svuota();
  const cassa = await creaAccount('cassa6@programma.it', 'default');
  const installatore = Buffer.from('MZ installatore finto');
  const giusto = crypto.createHash('sha256').update(installatore).digest('hex');
  let info = { versione: '99.0.0', file: 'AgenteStampa-Setup.exe', sha256: giusto };
  const srv = http.createServer((q, r) => { if (q.url.endsWith('.json')) { r.setHeader('Content-Type', 'application/json'); r.end(JSON.stringify(info)); } else r.end(installatore); }).listen(0, '127.0.0.1');
  await new Promise(r => srv.once('listening', r));
  const url = `http://127.0.0.1:${srv.address().port}/programmi/agente-stampa-windows.json`;
  const eseguiti = [];
  const p = await nuovoProgramma({ pacchetto: true, piattaforma: 'win32', urlAggiornamenti: url, eseguiInstallatore: (f) => eseguiti.push(f), attesaInstallazioneMs: 600 });
  await p.avvia();
  await (await pagina(p)).chiama('/collega', { email: cassa.email, password: 'segreta123', nome: 'PC' });
  const id = p.config.idAgente;
  assert.ok(await attendi(async () => (await leggiAdmin(`agenti_stampa/${id}`))?.tipo === 'windows'), 'in cassa risulta «windows»');

  // Stessa versione, impronta sbagliata, file su un altro sito: niente
  info = { versione: VERSIONE, file: 'AgenteStampa-Setup.exe', sha256: giusto };
  assert.strictEqual(await p.controllaAggiornamento(), 'no');
  info = { versione: '99.0.0', file: 'AgenteStampa-Setup.exe', sha256: 'a'.repeat(64) };
  assert.strictEqual(await p.controllaAggiornamento(), 'no');
  info = { versione: '99.0.0', file: 'https://altro-sito.example/x.exe', sha256: giusto };
  assert.strictEqual(await p.controllaAggiornamento(), 'no');
  info = { versione: '../../x', file: 'AgenteStampa-Setup.exe', sha256: giusto };
  assert.strictEqual(await p.controllaAggiornamento(), 'no');
  assert.strictEqual(eseguiti.length, 0);
  assert.strictEqual(p.fase, 'attivo');

  // Ha appena stampato: aspetta
  info = { versione: '99.0.0', file: 'AgenteStampa-Setup.exe', sha256: giusto };
  p.agente.ultimaStampa = Date.now();
  assert.strictEqual(await p.controllaAggiornamento(), 'occupato');
  p.agente.ultimaStampa = Date.now() - 11 * 60000;
  assert.strictEqual(await p.controllaAggiornamento(), 'installato');
  assert.strictEqual(eseguiti.length, 1);
  assert.deepStrictEqual(fs.readFileSync(eseguiti[0]), installatore);
  assert.strictEqual(p.fase, 'aggiornamento');
  assert.strictEqual(p.agente, null, 'agente fermato prima di installare');
  // L'installazione non è partita: torna a stampare
  assert.ok(await attendi(async () => p.fase === 'attivo', 4000), 'riprende da solo');
  fs.rmSync(eseguiti[0], { force: true });
  // Fuori da Windows (o non installato) non si aggiorna mai
  const p2 = await nuovoProgramma({ pacchetto: false, piattaforma: 'win32', urlAggiornamenti: url, eseguiInstallatore: (f) => eseguiti.push(f) });
  assert.strictEqual(await p2.controllaAggiornamento(), 'no');
  srv.close();
});

for (const c of cartelle) fs.rmSync(c, { recursive: true, force: true });
console.log(`\n${ok} ok, ${ko} falliti`);
process.exit(ko ? 1 : 0);
