#!/usr/bin/env node
// =============================================================================
// AGENTE DI STAMPA - PROGRAMMA PER WINDOWS
//
// È l'Agente di stampa di agente.mjs con una pagina di controllo nel browser del PC
// (http://127.0.0.1:17917, raggiungibile solo da quel PC) per:
//   - collegarlo al locale con email e password del locale (la password non resta salvata);
//   - vedere se stampa, le stampanti impostate in cassa, l'ultimo problema e il registro;
//   - cercare le stampanti in rete e fare una stampa di prova;
//   - scollegarlo.
// Su Windows diventa AgenteStampa.exe (vedi windows/): parte da solo quando si accende il PC,
// senza finestre, e si aggiorna da solo quando pubblichiamo una versione nuova.
//
// Prova senza Windows:  node programma.mjs   (dati in ~/.agente-stampa)
// =============================================================================
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Agente, accedi, inviaAllaStampante, VERSIONE } from './agente.mjs';
import { paginaHtml, ICONA_SVG } from './pagina.mjs';

// Porte della pagina (solo 127.0.0.1): se la prima è occupata da un altro programma si prova la successiva
export const PORTE = [17917, 17918, 17919];
export const URL_AGGIORNAMENTI = 'https://gestionale-ristoranti-96c5b.web.app/programmi/agente-stampa-windows.json';

const NOMI_STAMPANTI = { conto: 'CASSA', preconto: 'PRECONTO', pizzeria: 'PIZZERIA', cucina: 'CUCINA', bar: 'BAR' };
// Stampanti della cassa da mostrare nella pagina: quelle di sempre (con il nome scelto dal locale, se c'è)
// e quelle aggiunte dal locale (stm_..., es. Friggitoria), in ordine di nome. f = campi di impostazioni/stampanti.
function elencoStampanti(f) {
  const campi = (k) => f[k]?.mapValue?.fields || {};
  const nome = (k, base) => String(campi(k).nome?.stringValue || '').trim().slice(0, 30) || base;
  const ip = (k) => campi(k).ip?.stringValue || '';
  const fisse = Object.entries(NOMI_STAMPANTI).map(([chiave, base]) => ({ chiave, nome: nome(chiave, base), ip: ip(chiave) }));
  const aggiunte = Object.keys(f).filter((k) => /^stm_[a-z0-9_]{1,40}$/.test(k) && f[k]?.mapValue)
    .map((chiave) => ({ chiave, nome: nome(chiave, chiave.slice(4).replace(/_/g, ' ').toUpperCase()), ip: ip(chiave) }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'it')).slice(0, 10);
  return [...fisse, ...aggiunte];
}

// Cartella dei dati: %APPDATA%\Agente di stampa su Windows, ~/.agente-stampa altrove
export function cartellaPredefinita() {
  if (process.env.AGENTE_CARTELLA) return process.env.AGENTE_CARTELLA;
  if (process.platform === 'win32' && process.env.APPDATA) return path.join(process.env.APPDATA, 'Agente di stampa');
  return path.join(os.homedir(), '.agente-stampa');
}

// Errori di accesso spiegati a chi usa il programma
function erroreAccesso(e) {
  const m = String(e?.message || e);
  if (/INVALID_LOGIN_CREDENTIALS|INVALID_PASSWORD|EMAIL_NOT_FOUND|INVALID_EMAIL|MISSING_PASSWORD/.test(m)) return 'Email o password sbagliate.';
  if (/TOO_MANY_ATTEMPTS/.test(m)) return 'Troppi tentativi sbagliati: aspetta qualche minuto e riprova.';
  if (/USER_DISABLED/.test(m)) return 'Questo account è disattivato.';
  if (/non è collegato a un locale/.test(m)) return m;
  if (!e?.status) return 'Internet non risponde: controlla la rete di questo PC e riprova.';
  return `Accesso non riuscito (${m}).`;
}

// L'accesso salvato non vale più (password del locale cambiata, account disattivato o eliminato)
const accessoNonValido = (e) => /TOKEN_EXPIRED|INVALID_REFRESH_TOKEN|USER_DISABLED|USER_NOT_FOUND|non è collegato a un locale/.test(String(e?.message || e))
  || [401, 403, 404].includes(e?.status);

export function versioneMaggiore(a, b) {
  const pa = String(a || '').split('.').map(n => parseInt(n) || 0), pb = String(b || '').split('.').map(n => parseInt(n) || 0);
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
  return false;
}

// Solo lettere ASCII sullo scontrino (le termiche economiche non hanno tutte le lettere accentate)
const ascii = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7E]/g, '?');

export function scontrinoDiProva({ nome, ip, porta, locale, agente }) {
  const ora = new Date().toLocaleString('it-IT');
  return '\x1B\x40\x1B\x61\x01\x1D\x21\x11\x1B\x45\x01PROVA DI STAMPA\n\x1D\x21\x00\x1B\x45\x00\n'
    + (nome ? `Stampante: ${ascii(nome)}\n` : '')
    + `Indirizzo: ${ascii(ip)}:${porta}\n`
    + (locale ? `Locale: ${ascii(locale)}\n` : '')
    + `Agente: ${ascii(agente)}\n${ora}\n\nSe leggi questo foglio,\nla stampante funziona.\n`
    + '\x1B\x64\x08\x1D\x56\x01';
}

// Indirizzi da provare: le reti di casa/locale (/24) delle schede di rete del PC
export function indirizziDaCercare(schede = Object.values(os.networkInterfaces()).flat()) {
  const proprie = new Set(), reti = new Set();
  for (const s of schede) {
    if (!s || (s.family !== 'IPv4' && s.family !== 4) || s.internal || s.address.startsWith('169.254.')) continue;
    proprie.add(s.address);
    reti.add(s.address.split('.').slice(0, 3).join('.'));
  }
  const elenco = [];
  for (const r of [...reti].slice(0, 4)) for (let d = 1; d < 255; d++) if (!proprie.has(`${r}.${d}`)) elenco.push(`${r}.${d}`);
  return elenco;
}

function rispondeSullaPorta(ip, porta, timeoutMs) {
  return new Promise((ok) => {
    const s = net.connect({ host: ip, port: porta });
    const fine = (r) => { clearTimeout(t); s.destroy(); ok(r); };
    const t = setTimeout(() => fine(false), timeoutMs);
    s.on('connect', () => fine(true));
    s.on('error', () => fine(false));
  });
}

// Cerca chi risponde sulla porta delle stampanti (9100): si collega e chiude, senza mandare niente
export async function cercaStampanti({ indirizzi = indirizziDaCercare(), porta = 9100, timeoutMs = 700, contemporanee = 64 } = {}) {
  const trovate = [];
  let i = 0;
  const lavora = async () => { while (i < indirizzi.length) { const ip = indirizzi[i++]; if (await rispondeSullaPorta(ip, porta, timeoutMs)) trovate.push(ip); } };
  await Promise.all(Array.from({ length: Math.min(contemporanee, indirizzi.length) }, lavora));
  const numero = (ip) => ip.split('.').reduce((n, x) => n * 256 + Number(x), 0);
  return trovate.sort((a, b) => numero(a) - numero(b));
}

export function apriNelBrowser(url) {
  if (process.env.AGENTE_NO_BROWSER) return;
  const [cmd, args, extra] = process.platform === 'win32' ? ['cmd.exe', ['/c', 'start', '""', url], { windowsVerbatimArguments: true }]
    : process.platform === 'darwin' ? ['open', [url], {}] : ['xdg-open', [url], {}];
  try { spawn(cmd, args, { detached: true, stdio: 'ignore', windowsHide: true, ...extra }).on('error', () => {}).unref(); } catch { /* nessun browser */ }
}

// Un altro Agente di stampa risponde già su questa porta?
async function agenteSullaPorta(porta) {
  try {
    const r = await fetch(`http://127.0.0.1:${porta}/ping`, { signal: AbortSignal.timeout(1500) });
    return (await r.json()).agente === 'agente-stampa';
  } catch { return false; }
}

// Il nome del locale (impostazioni/negozio), da mostrare al posto del suo codice
async function nomeDelLocale(agente) {
  try { return String((await agente.fs(`${agente.base}/impostazioni/negozio`)).fields?.nome?.stringValue || '').trim().slice(0, 60); } catch { return ''; }
}

export class Programma {
  constructor({ cartella = cartellaPredefinita(), porte = PORTE, apriBrowser = true, avvioAutomatico = false, pacchetto = false,
    piattaforma = process.platform, opzioniAgente = {}, urlAggiornamenti = URL_AGGIORNAMENTI, stampaSuStampante = inviaAllaStampante,
    ricerca = {}, riprovaReteMs = 30000, attesaInstallazioneMs = 120000, eseguiInstallatore, silenzioso = false } = {}) {
    Object.assign(this, { cartella, porte, apriBrowser, avvioAutomatico, pacchetto, piattaforma, opzioniAgente, urlAggiornamenti,
      stampaSuStampante, ricerca, riprovaReteMs, attesaInstallazioneMs, silenzioso });
    this.eseguiInstallatore = eseguiInstallatore || ((file) => spawn(file, ['/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART'], { detached: true, stdio: 'ignore', windowsHide: true }).on('error', () => {}).unref());
    this.fileConfig = path.join(cartella, 'agente-stampa.json');
    this.fileRegistro = path.join(cartella, 'registro.txt');
    this.righe = [];
    this.chiave = crypto.randomBytes(18).toString('base64url');   // la usa la pagina: altri siti non la conoscono
    this.config = {};
    this.agente = null;
    this.fase = 'da_collegare';
    this.messaggio = '';
    this.stampanti = null;
    this.stampantiLette = 0;
    this.timer = new Set();
  }

  // ---------- Dati sul PC ----------
  leggiConfig() {
    try { return JSON.parse(fs.readFileSync(this.fileConfig, 'utf8')) || {}; } catch { return {}; }
  }

  // Scrittura "sicura": prima un file temporaneo, poi lo scambio (niente file rotti se va via la corrente)
  salvaConfig() {
    fs.mkdirSync(this.cartella, { recursive: true });
    const tmp = this.fileConfig + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.config, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, this.fileConfig);
  }

  registra(msg) {
    const riga = `${new Date().toLocaleString('it-IT')}  ${msg}`;
    this.righe.push(riga);
    if (this.righe.length > 200) this.righe.shift();
    if (!this.silenzioso) console.log(riga);
    try {
      fs.mkdirSync(this.cartella, { recursive: true });
      if ((fs.statSync(this.fileRegistro, { throwIfNoEntry: false })?.size || 0) > 512 * 1024) fs.renameSync(this.fileRegistro, path.join(this.cartella, 'registro-precedente.txt'));
      fs.appendFileSync(this.fileRegistro, riga + '\n');
    } catch { /* registro su file non indispensabile */ }
  }

  dopo(ms, fn) {
    const t = setTimeout(() => { this.timer.delete(t); fn(); }, ms);
    this.timer.add(t);
    return t;
  }

  // ---------- Avvio ----------
  // Restituisce false se sul PC c'è già un Agente di stampa acceso (allora apre solo la sua pagina)
  async avvia() {
    for (const porta of this.porte) {
      if (await this.ascolta(porta)) break;
      // Porta occupata: se è già l'Agente di stampa si apre la sua pagina, altrimenti si prova la successiva
      if (await agenteSullaPorta(porta)) {
        if (this.apriBrowser && !this.avvioAutomatico) apriNelBrowser(`http://127.0.0.1:${porta}/`);
        return false;
      }
    }
    if (!this.server) throw new Error(`Nessuna porta libera per la pagina dell'agente (${this.porte.join(', ')})`);
    this.config = this.leggiConfig();
    this.registra(`Agente di stampa ${VERSIONE} acceso. Pagina: ${this.indirizzo}`);
    this.pronto = this.config.refreshToken ? this.avviaAgente() : Promise.resolve();
    // All'accensione del PC la pagina si apre solo se c'è da collegarlo
    if (this.apriBrowser && (!this.avvioAutomatico || !this.config.refreshToken)) apriNelBrowser(this.indirizzo);
    if (this.pacchetto) {
      this.dopo(60000, () => this.controlloPeriodico());
      // Installatori degli aggiornamenti già fatti
      try { for (const f of fs.readdirSync(os.tmpdir())) if (/^AgenteStampa-Setup-[\d.]+\.exe$/.test(f)) fs.rmSync(path.join(os.tmpdir(), f), { force: true }); } catch { /* niente */ }
    }
    await this.pronto;
    return true;
  }

  ascolta(porta) {
    return new Promise((ok) => {
      const server = http.createServer((req, res) => this.rispondi(req, res).catch((e) => manda(res, 500, { errore: e.message })));
      server.once('error', () => ok(false));
      server.listen(porta, '127.0.0.1', () => {
        this.server = server;
        this.porta = server.address().port;
        this.indirizzo = `http://127.0.0.1:${this.porta}/`;
        ok(true);
      });
    });
  }

  async chiudi() {
    for (const t of this.timer) clearTimeout(t);
    this.timer.clear();
    const a = this.agente;
    this.agente = null;
    if (a) await a.ferma();
    if (this.server) await new Promise((ok) => this.server.close(ok));
    this.server = null;
  }

  // ---------- Agente ----------
  async avviaAgente(riattiva = false) {
    if (!this.config.refreshToken) { this.fase = 'da_collegare'; return; }
    const agente = new Agente({
      credenziali: { email: this.config.email, uid: this.config.uid, refreshToken: this.config.refreshToken },
      nome: this.config.nome, idAgente: this.config.idAgente, tipo: this.pacchetto ? 'windows' : 'pc', riattiva,
      opzioni: this.opzioniAgente, registro: (m) => this.messaggioAgente(agente, m), stampaSuStampante: this.stampaSuStampante,
    });
    agente.onCredenziali = (c) => { if (this.agente === agente) { this.config.refreshToken = c.refreshToken; this.salvaConfig(); } };
    agente.onScollegato = () => { if (this.agente === agente) this.dimentica('Scollegato dalla cassa (Gestionale → Stampanti). Per usarlo di nuovo collegalo qui sotto.'); };
    this.agente = agente;
    this.fase = 'avvio';
    this.messaggio = 'Collegamento al locale in corso...';
    this.stampanti = null;
    this.stampantiLette = 0;
    try {
      await agente.leggiLocale();
    } catch (e) {
      if (this.agente !== agente) return;
      if (accessoNonValido(e)) return this.dimentica("L'accesso salvato non vale più (password del locale cambiata o account disattivato): collegalo di nuovo.");
      return this.attendiRete(agente, riattiva, e);
    }
    if (this.agente !== agente) return;
    if (this.config.locale !== agente.locale) { this.config.locale = agente.locale; this.salvaConfig(); }
    nomeDelLocale(agente).then((nome) => { if (nome && this.agente === agente && nome !== this.config.nomeLocale) { this.config.nomeLocale = nome; this.salvaConfig(); } });
    this.fase = 'attivo';
    this.messaggio = '';
    // avvia() finisce quando l'agente si ferma; se il primo "sono acceso" non parte (rete) si riprova
    agente.avvia().catch((e) => { if (this.agente === agente) { agente.attivo = false; this.attendiRete(agente, riattiva, e); } });
  }

  attendiRete(agente, riattiva, e) {
    this.fase = 'attesa_rete';
    this.messaggio = `Internet non risponde: riprovo tra ${Math.round(this.riprovaReteMs / 1000)} secondi. (${e.message})`;
    this.registra('⚠️  ' + this.messaggio);
    this.dopo(this.riprovaReteMs, () => { if (this.agente === agente) this.avviaAgente(riattiva); });
  }

  messaggioAgente(agente, m) {
    this.registra(m);
    if (this.agente === agente && /^⚠️\s+Collegamento: /.test(m) && accessoNonValido(m)) {
      this.dimentica("L'accesso salvato non vale più (password del locale cambiata o account disattivato): collegalo di nuovo.");
    }
  }

  // Dimentica l'accesso e ferma l'agente (la pagina torna su "Collega")
  async dimentica(motivo) {
    const a = this.agente;
    this.agente = null;
    delete this.config.refreshToken;
    this.salvaConfig();
    this.fase = 'da_collegare';
    this.messaggio = motivo;
    this.stampanti = null;
    this.registra('⛔ ' + motivo);
    if (a) await a.ferma();
  }

  async collega({ email, password, nome }) {
    email = String(email || '').trim();
    password = String(password || '');
    nome = String(nome || '').trim().slice(0, 40) || os.hostname();
    if (!email || !password) throw new Error('Scrivi email e password del locale.');
    let cred;
    try { cred = await accedi(email, password, { apiKey: this.opzioniAgente.apiKey }); } catch (e) { throw new Error(erroreAccesso(e)); }
    // Prima di salvare controlla che l'account sia di un locale
    const prova = new Agente({ credenziali: cred, nome, idAgente: 'prova', opzioni: this.opzioniAgente, registro: () => {} });
    try { await prova.leggiLocale(); } catch (e) { throw new Error(erroreAccesso(e)); }
    const nomeLocale = await nomeDelLocale(prova);
    const vecchio = this.agente;
    this.agente = null;
    if (vecchio) await vecchio.ferma();
    this.config = { email, uid: prova.cred.uid, refreshToken: prova.cred.refreshToken, nome, idAgente: this.config.idAgente || 'pc-' + crypto.randomBytes(4).toString('hex'), locale: prova.locale, nomeLocale };
    this.salvaConfig();
    this.registra(`✅ Collegato al locale "${nomeLocale || prova.locale}" come "${nome}".`);
    await this.avviaAgente(true);
    return { locale: nomeLocale || prova.locale };
  }

  // "Scollega" dalla pagina: ferma l'agente e lo toglie dall'elenco della cassa
  async scollega() {
    const a = this.agente;
    this.agente = null;
    if (a) {
      await a.ferma();
      if (a.base) await a.fs(`${a.base}/agenti_stampa/${a.idAgente}`, { method: 'DELETE' }).catch(() => {});
    }
    await this.dimentica('Scollegato da questo PC. Per usarlo di nuovo collegalo qui sotto.');
  }

  // Le stampanti impostate in cassa (Gestionale → Stampanti). La pagina le chiede ogni 2 secondi:
  // si rileggono al massimo ogni 30, senza far aspettare la pagina.
  aggiornaStampanti() {
    const a = this.agente;
    if (!a?.base || this.fase !== 'attivo' || Date.now() - this.stampantiLette < 30000) return;
    this.stampantiLette = Date.now();
    a.fs(`${a.base}/impostazioni/stampanti`).catch((e) => (e.status === 404 ? {} : null)).then((d) => {
      if (!d || this.agente !== a) return;
      const f = d.fields || {};
      this.stampanti = {
        metodo: f.metodo?.stringValue || 'qz',
        elenco: elencoStampanti(f),
      };
    });
  }

  async stampaDiProva(indirizzo, nome = '') {
    const [ip, porta] = String(indirizzo || '').trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '').split(':');
    if (!/^[0-9A-Za-z.-]{1,100}$/.test(ip || '')) throw new Error('Indirizzo non valido: scrivilo come 192.168.1.50');
    const p = parseInt(porta) || 9100;
    const testo = scontrinoDiProva({ nome, ip, porta: p, locale: this.config.nomeLocale || this.agente?.locale || this.config.locale, agente: this.config.nome || os.hostname() });
    try { await this.stampaSuStampante(ip, p, Buffer.from(testo, 'latin1'), 5000); }
    catch (e) { this.registra(`❌ Stampa di prova su ${nome || ip}: ${e.message}`); throw new Error(`La stampante ${ip} ${e.message}`); }
    this.registra(`🧾 Stampa di prova inviata a ${nome ? nome + ' ' : ''}${ip}:${p}`);
  }

  // ---------- Aggiornamento automatico (solo AgenteStampa.exe su Windows) ----------
  async controlloPeriodico() {
    let attesa = 6 * 3600000;
    try { if ((await this.controllaAggiornamento()) === 'occupato') attesa = 30 * 60000; }
    catch (e) { this.registra(`⚠️  Controllo aggiornamenti non riuscito: ${e.message}`); }
    this.dopo(attesa, () => this.controlloPeriodico());
  }

  async controllaAggiornamento() {
    if (!this.pacchetto || this.piattaforma !== 'win32' || !this.urlAggiornamenti) return 'no';
    const r = await fetch(this.urlAggiornamenti, { cache: 'no-store', signal: AbortSignal.timeout(20000) });
    if (!r.ok) return 'no';
    const info = await r.json();
    if (!/^\d+\.\d+\.\d+$/.test(info.versione || '') || !versioneMaggiore(info.versione, VERSIONE) || !/^[a-f0-9]{64}$/.test(info.sha256 || '')) return 'no';
    const url = new URL(info.file || 'AgenteStampa-Setup.exe', this.urlAggiornamenti);
    if (url.origin !== new URL(this.urlAggiornamenti).origin) return 'no';
    // Non durante il servizio: se ha stampato negli ultimi 10 minuti riprova più tardi
    if (this.agente?.ultimaStampa && Date.now() - this.agente.ultimaStampa < 10 * 60000) return 'occupato';
    this.registra(`⬇️  È uscita la versione ${info.versione}: la scarico.`);
    const dati = Buffer.from(await (await fetch(url, { signal: AbortSignal.timeout(300000) })).arrayBuffer());
    if (crypto.createHash('sha256').update(dati).digest('hex') !== info.sha256) { this.registra('⚠️  Aggiornamento scaricato male: riprovo più tardi.'); return 'no'; }
    const file = path.join(os.tmpdir(), `AgenteStampa-Setup-${info.versione}.exe`);
    fs.writeFileSync(file, dati);
    this.registra(`🔄 Installo la versione ${info.versione}: l'agente si riavvia da solo tra pochi secondi.`);
    // Finisce la comanda in stampa, poi l'installazione chiude e riapre il programma
    const a = this.agente;
    this.agente = null;
    if (a) await a.ferma();
    this.fase = 'aggiornamento';
    this.messaggio = `Installo la versione ${info.versione}...`;
    this.eseguiInstallatore(file);
    // Se l'installazione non parte (antivirus...), dopo un po' si torna a stampare con questa versione
    this.dopo(this.attesaInstallazioneMs, () => {
      if (this.fase !== 'aggiornamento') return;
      this.registra("⚠️  L'aggiornamento non è partito: continuo con questa versione.");
      this.avviaAgente();
    });
    return 'installato';
  }

  // ---------- Pagina ----------
  async rispondi(req, res) {
    // Solo dal browser di questo PC e solo con il nome giusto (niente "DNS rebinding")
    const host = String(req.headers.host || '');
    if (host !== `127.0.0.1:${this.porta}` && host !== `localhost:${this.porta}`) return manda(res, 403, { errore: 'Non consentito' });
    const { pathname } = new URL(req.url, 'http://127.0.0.1');
    if (req.method === 'GET' && pathname === '/ping') return manda(res, 200, { agente: 'agente-stampa', versione: VERSIONE });
    if (req.method === 'GET' && pathname === '/icona.svg') return manda(res, 200, ICONA_SVG, 'image/svg+xml');
    if (req.method === 'GET' && pathname === '/') return manda(res, 200, paginaHtml({ chiave: this.chiave, versione: VERSIONE }), 'text/html; charset=utf-8');

    // Tutto il resto solo con la chiave della pagina
    const chiave = String(req.headers['x-chiave'] || '');
    if (chiave.length !== this.chiave.length || !crypto.timingSafeEqual(Buffer.from(chiave), Buffer.from(this.chiave))) return manda(res, 403, { errore: 'Non consentito' });
    if (req.method === 'GET' && pathname === '/stato') return manda(res, 200, await this.stato());
    if (req.method !== 'POST') return manda(res, 404, { errore: 'Non trovato' });
    const dati = await leggiCorpo(req);
    try {
      if (pathname === '/collega') return manda(res, 200, await this.collega(dati));
      if (pathname === '/scollega') { await this.scollega(); return manda(res, 200, { ok: true }); }
      if (pathname === '/prova') { await this.stampaDiProva(dati.indirizzo, dati.nome); return manda(res, 200, { ok: true }); }
      if (pathname === '/cerca') {
        const trovate = await cercaStampanti({ ...this.ricerca });
        this.registra(`🔎 Ricerca stampanti: ${trovate.length ? trovate.join(', ') : 'nessuna trovata'}`);
        return manda(res, 200, { trovate });
      }
    } catch (e) { return manda(res, 400, { errore: e.message }); }
    return manda(res, 404, { errore: 'Non trovato' });
  }

  async stato() {
    const a = this.agente;
    this.aggiornaStampanti();
    return {
      versione: VERSIONE, fase: this.fase, messaggio: this.messaggio,
      email: this.config.email || '', nome: this.config.nome || '', nomePc: os.hostname(), locale: this.config.nomeLocale || a?.locale || this.config.locale || '',
      stampate: a?.stampate || 0, ultimoErrore: a?.ultimoErrore || '',
      stampanti: this.fase === 'attivo' ? this.stampanti : null,
      registro: this.righe.slice(-60),
    };
  }
}

function manda(res, codice, corpo, tipo = 'application/json; charset=utf-8') {
  res.writeHead(codice, { 'Content-Type': tipo, 'Cache-Control': 'no-store', 'X-Frame-Options': 'DENY', 'Content-Security-Policy': "frame-ancestors 'none'", 'X-Content-Type-Options': 'nosniff' });
  res.end(typeof corpo === 'string' ? corpo : JSON.stringify(corpo));
}

function leggiCorpo(req) {
  return new Promise((ok, ko) => {
    let testo = '';
    req.setEncoding('utf8');
    req.on('data', (c) => { testo += c; if (testo.length > 10000) { req.destroy(); ko(new Error('Richiesta troppo grande')); } });
    req.on('end', () => { try { ok(testo ? JSON.parse(testo) : {}); } catch { ok({}); } });
    req.on('error', ko);
  });
}

export async function avviaProgramma(opzioni = {}) {
  const p = new Programma(opzioni);
  const acceso = await p.avvia();
  if (!acceso) return null;
  process.on('SIGINT', async () => { await p.chiudi(); process.exit(0); });
  return p;
}

// node programma.mjs  (prove fuori da Windows; con gli emulatori usa il loro progetto)
if (import.meta.url && process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const opzioniAgente = process.env.FIRESTORE_EMULATOR_HOST && process.env.GCLOUD_PROJECT ? { projectId: process.env.GCLOUD_PROJECT } : {};
  avviaProgramma({ opzioniAgente, avvioAutomatico: process.argv.includes('--avvio') })
    .then((p) => { if (!p) process.exit(0); })
    .catch((e) => { console.error('❌', e.message); process.exit(1); });
}
