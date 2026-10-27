#!/usr/bin/env node
// =============================================================================
// AGENTE DI STAMPA - Gestionale Ristoranti
//
// Gira su un PC (o Raspberry Pi) sempre acceso nel locale, sulla stessa rete delle
// stampanti termiche. Prende le stampe che la cassa mette nella raccolta "coda_stampa"
// del locale e le manda all'indirizzo IP della stampante (porta 9100, ESC/POS).
// Funziona con qualunque marca: la cassa prepara già i byte da stampare.
//
// È anche il modello del programma per ESP32: stesso protocollo, vedi README.md.
// Il programma per Windows (programma.mjs) è questo stesso agente con una pagina nel browser.
//
// Uso (serve Node.js 18 o più recente, nessun pacchetto da installare):
//   node agente.mjs            la prima volta chiede email e password del locale
//   node agente.mjs --collega  per collegarlo di nuovo (altro account o dopo "Scollega")
//
// La password non viene salvata: resta solo il "token di accesso" nel file agente-stampa.json.
// =============================================================================
import net from 'node:net';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

export const VERSIONE = '1.1.0';

// Configurazione pubblica del progetto Firebase (la stessa delle pagine web)
const FIREBASE = { apiKey: 'AIzaSyDjNba4HvtDZpcoDfnXTOWysn_i1UFwPWU', projectId: 'gestionale-ristoranti-96c5b' };

export const PREDEFINITI = {
  attesaMs: 2000,            // ogni quanto controlla la coda
  battitoMs: 30000,          // ogni quanto dice alla cassa "sono acceso"
  timeoutStampanteMs: 5000,  // attesa massima per collegarsi alla stampante
  tentativiMassimi: 5,       // poi la comanda va in "errore" e la cassa avvisa
  scadenzaMinuti: 15,        // comande più vecchie non si stampano più ("scaduta")
  ripresaMs: 2000,           // dopo un errore riprova tra 2, 4, 8... secondi (al massimo 30)
};

// Con gli emulatori di Firebase (test) si usano gli indirizzi locali standard
function indirizzi(projectId = FIREBASE.projectId) {
  const auth = process.env.FIREBASE_AUTH_EMULATOR_HOST;
  const fsHost = process.env.FIRESTORE_EMULATOR_HOST;
  return {
    auth: (p) => auth ? `http://${auth}/identitytoolkit.googleapis.com/v1/${p}` : `https://identitytoolkit.googleapis.com/v1/${p}`,
    token: auth ? `http://${auth}/securetoken.googleapis.com/v1/token` : 'https://securetoken.googleapis.com/v1/token',
    v1: fsHost ? `http://${fsHost}/v1` : 'https://firestore.googleapis.com/v1',
    radice: `projects/${projectId}/databases/(default)/documents`,
  };
}

async function richiesta(url, opzioni = {}) {
  const r = await fetch(url, opzioni);
  const testo = await r.text();
  let corpo = null;
  try { corpo = testo ? JSON.parse(testo) : null; } catch { corpo = testo; }
  if (!r.ok) {
    const err = (Array.isArray(corpo) ? corpo[0]?.error : corpo?.error) || {};  // runQuery risponde con un elenco
    const dove = new URL(url).pathname.split('/documents').pop() || new URL(url).pathname;
    const e = new Error(`${r.status} ${err.message || err.status || testo || r.statusText} (${dove})`);
    e.status = r.status; e.codice = err.status || err.message;
    throw e;
  }
  return corpo;
}

// ---------- Valori Firestore (formato REST) ----------
function daValore(v) {
  if (!v) return undefined;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('timestampValue' in v) return new Date(v.timestampValue);
  if ('nullValue' in v) return null;
  return undefined;
}
const leggiCampi = (fields = {}) => Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, daValore(v)]));
function aValore(x) {
  if (typeof x === 'string') return { stringValue: x };
  if (typeof x === 'boolean') return { booleanValue: x };
  if (Number.isInteger(x)) return { integerValue: String(x) };
  if (typeof x === 'number') return { doubleValue: x };
  if (x instanceof Date) return { timestampValue: x.toISOString() };
  return { nullValue: null };
}
const scriviCampi = (obj) => Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, aValore(v)]));

// ---------- Accesso con l'account del locale ----------
// Restituisce le credenziali da salvare: niente password, solo il token di rinnovo.
export async function accedi(email, password, { apiKey = FIREBASE.apiKey } = {}) {
  const url = indirizzi().auth(`accounts:signInWithPassword?key=${apiKey}`);
  const r = await richiesta(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, returnSecureToken: true }) });
  return { email, uid: r.localId, refreshToken: r.refreshToken, idToken: r.idToken, scadenza: Date.now() + Number(r.expiresIn || 3600) * 1000 };
}

export class Agente {
  // riattiva: appena collegato con email e password, toglie lo "Scollega" messo prima dalla cassa
  constructor({ credenziali, nome, idAgente, tipo = 'pc', riattiva = false, opzioni = {}, registro = console.log, stampaSuStampante = inviaAllaStampante }) {
    this.cred = { ...credenziali };
    this.nome = nome || os.hostname();
    this.idAgente = idAgente;
    this.tipo = tipo;
    this.riattiva = riattiva;
    this.o = { ...PREDEFINITI, ...opzioni };
    this.log = registro;
    this.stampaSuStampante = stampaSuStampante;
    this.url = indirizzi(this.o.projectId);
    this.apiKey = this.o.apiKey || FIREBASE.apiKey;
    this.attivo = false;
    this.prossimoTentativo = new Map(); // id comanda -> quando riprovare (dopo un errore)
    this.daTogliere = new Set();       // comande stampate da togliere ancora dalla coda (rete assente)
    this.stampate = 0;
    this.ultimoErrore = '';
    this.ultimoBattito = 0;
    this.onCredenziali = null;           // per salvare il token rinnovato
    this.onScollegato = null;
  }

  // Token valido per Firestore (si rinnova da solo ogni ora)
  async token() {
    if (this.cred.idToken && Date.now() < (this.cred.scadenza || 0) - 300000) return this.cred.idToken;
    const r = await richiesta(`${this.url.token}?key=${this.apiKey}`, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(this.cred.refreshToken)}`,
    });
    this.cred = { ...this.cred, idToken: r.id_token, refreshToken: r.refresh_token, uid: r.user_id, scadenza: Date.now() + Number(r.expires_in || 3600) * 1000 };
    if (this.onCredenziali) this.onCredenziali(this.cred);
    return this.cred.idToken;
  }

  async fs(percorso, opzioni = {}) {
    const headers = { Authorization: `Bearer ${await this.token()}`, 'Content-Type': 'application/json', ...(opzioni.headers || {}) };
    return richiesta(`${this.url.v1}/${percorso}`, { ...opzioni, headers });
  }

  // Il locale si legge dalla scheda dell'account (utenti/{uid}), come fanno le pagine web
  async leggiLocale() {
    await this.token();
    const doc = await this.fs(`${this.url.radice}/utenti/${this.cred.uid}`);
    const p = leggiCampi(doc.fields);
    if (p.ruolo !== 'locale' || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(p.locale || '')) {
      throw new Error("Questo account non è collegato a un locale: usa l'email e la password del locale.");
    }
    this.locale = p.locale;
    this.base = this.locale === 'default' ? this.url.radice : `${this.url.radice}/ristoranti/${this.locale}`;
    return this.locale;
  }

  async avvia() {
    if (!this.locale) await this.leggiLocale();
    this.attivo = true;
    this.avviato = new Date();
    this.log(`Agente "${this.nome}" collegato al locale "${this.locale}". In attesa di stampe...`);
    await this.battito(true);
    this.ciclo = (async () => {
      while (this.attivo) {
        try {
          if (Date.now() - this.ultimoBattito >= this.o.battitoMs) await this.battito();
          if (this.attivo) await this.controllaCoda();
        } catch (e) {
          this.ultimoErrore = `Collegamento: ${e.message}`;
          this.log(`⚠️  ${this.ultimoErrore}`);
        }
        if (this.attivo) await attendi(this.o.attesaMs);
      }
    })();
    return this.ciclo;
  }

  async ferma() {
    this.attivo = false;
    if (this.ciclo) await this.ciclo;
  }

  // "Sono acceso": la cassa mostra l'agente in verde. Se dalla cassa è stato scollegato, si ferma.
  async battito(primo = false) {
    this.ultimoBattito = Date.now();
    const nomeDoc = `${this.base}/agenti_stampa/${this.idAgente}`;
    if (!primo) {
      try {
        const d = await this.fs(nomeDoc);
        if (leggiCampi(d.fields).disattivato) {
          this.log('⛔ Questo agente è stato scollegato dalla cassa (Gestionale > Stampanti).');
          this.attivo = false;
          if (this.onScollegato) this.onScollegato();
          return;
        }
      } catch (e) { if (e.status !== 404) throw e; }
    }
    const campi = { nome: this.nome, tipo: this.tipo, versione: VERSIONE, ip_locale: ipLocale(), stampate: this.stampate, ultimo_errore: this.ultimoErrore };
    if (primo) campi.avviato = this.avviato;
    if (primo && this.riattiva) campi.disattivato = false;
    await this.fs(`${this.url.radice}:commit`, {
      method: 'POST',
      body: JSON.stringify({ writes: [{
        update: { name: nomeDoc, fields: scriviCampi(campi) },
        updateMask: { fieldPaths: Object.keys(campi) },
        updateTransforms: [{ fieldPath: 'ultimo_contatto', setToServerValue: 'REQUEST_TIME' }],
      }] }),
    });
    if (primo) this.riattiva = false;
  }

  async controllaCoda() {
    for (const nome of [...this.daTogliere]) await this.togliDallaCoda(nome);
    const risposta = await this.fs(`${this.base}:runQuery`, {
      method: 'POST',
      body: JSON.stringify({ structuredQuery: {
        from: [{ collectionId: 'coda_stampa' }],
        where: { fieldFilter: { field: { fieldPath: 'stato' }, op: 'EQUAL', value: { stringValue: 'da_stampare' } } },
        limit: 20,
      } }),
    });
    const comande = (risposta || []).filter(r => r.document).map(r => ({ nome: r.document.name, aggiornato: r.document.updateTime, ...leggiCampi(r.document.fields) }));
    comande.sort((a, b) => (a.creato || 0) - (b.creato || 0));
    for (const c of comande) {
      if (!this.attivo) break;
      await this.gestisci(c);
    }
  }

  // Modifica la comanda solo se nessun altro l'ha toccata nel frattempo (due agenti nello stesso locale):
  // commit con la condizione currentDocument.updateTime = versione letta.
  async aggiorna(c, campi) {
    try {
      const r = await this.fs(`${this.url.radice}:commit`, {
        method: 'POST',
        body: JSON.stringify({ writes: [{
          update: { name: c.nome, fields: scriviCampi(campi) },
          updateMask: { fieldPaths: Object.keys(campi) },
          currentDocument: { updateTime: c.aggiornato },
        }] }),
      });
      c.aggiornato = r?.writeResults?.[0]?.updateTime || c.aggiornato;
      return true;
    } catch (e) {
      if (['FAILED_PRECONDITION', 'NOT_FOUND', 'ABORTED'].includes(e.codice) || e.status === 404 || e.status === 409 || /does not match|precondition/i.test(e.message)) return false;
      throw e;
    }
  }

  async gestisci(c) {
    const id = c.nome.split('/').pop();
    if (Date.now() < (this.prossimoTentativo.get(id) || 0)) return;
    if (c.creato && Date.now() - c.creato.getTime() > this.o.scadenzaMinuti * 60000) {
      if (await this.aggiorna(c, { stato: 'scaduta', errore: `Non stampata entro ${this.o.scadenzaMinuti} minuti` })) this.log(`⌛ Scaduta: ${c.descrizione || id}`);
      return;
    }
    const tentativo = (c.tentativi || 0) + 1;
    if (!(await this.aggiorna(c, { stato: 'in_stampa', agente: this.idAgente, tentativi: tentativo }))) return; // presa da un altro agente
    try {
      if (!c.ip) throw new Error('Indirizzo IP della stampante mancante');
      await this.stampaSuStampante(c.ip, c.porta || 9100, Buffer.from(c.dati || '', 'base64'), this.o.timeoutStampanteMs);
    } catch (e) {
      const finale = tentativo >= this.o.tentativiMassimi;
      const errore = `Stampante ${c.stampante || ''} (${c.ip}): ${e.message}`.replace(/\s+/g, ' ');
      this.ultimoErrore = errore;
      this.prossimoTentativo.set(id, Date.now() + Math.min(this.o.ripresaMs * 2 ** (tentativo - 1), 30000));
      await this.aggiorna(c, { stato: finale ? 'errore' : 'da_stampare', errore });
      this.log(`${finale ? '❌' : '↻ '} ${errore}${finale ? ' (la cassa avvisa)' : ` - riprovo (${tentativo}/${this.o.tentativiMassimi})`}`);
      return;
    }
    // Stampata: non si ristampa più, anche se toglierla dalla coda non riesce subito
    this.prossimoTentativo.delete(id);
    this.stampate++;
    this.ultimaStampa = Date.now();
    this.ultimoErrore = '';
    this.log(`🖨️  Stampata: ${c.descrizione || id} -> ${c.ip}`);
    await this.togliDallaCoda(c.nome);
  }

  // Toglie dalla coda una comanda già stampata; se la rete non risponde ci riprova al giro dopo
  async togliDallaCoda(nome) {
    try {
      await this.fs(nome, { method: 'DELETE' });
      this.daTogliere.delete(nome);
    } catch (e) {
      if (e.status === 404) { this.daTogliere.delete(nome); return; }
      this.daTogliere.add(nome);
      this.log(`⚠️  Stampata ma non ancora tolta dalla coda (${e.message}): riprovo senza ristamparla`);
    }
  }
}

// Manda i byte alla stampante (porta 9100, "RAW"): così funziona con qualunque marca
export function inviaAllaStampante(ip, porta, byte, timeoutMs = 5000) {
  return new Promise((ok, ko) => {
    const s = net.connect({ host: ip, port: porta });
    const timer = setTimeout(() => { s.destroy(); ko(new Error('non raggiungibile (spenta o indirizzo sbagliato?)')); }, timeoutMs);
    s.on('error', (e) => { clearTimeout(timer); ko(new Error(e.code === 'ECONNREFUSED' ? 'rifiuta il collegamento' : e.message)); });
    s.on('connect', () => s.end(byte, () => { clearTimeout(timer); setTimeout(() => s.destroy(), 200); ok(); }));
  });
}

const attendi = (ms) => new Promise(r => setTimeout(r, ms));

export function ipLocale() {
  for (const reti of Object.values(os.networkInterfaces())) {
    for (const r of reti || []) if (r.family === 'IPv4' && !r.internal) return r.address;
  }
  return '';
}

// ---------- Uso da riga di comando ----------
async function principale() {
  const fileConfig = path.resolve(process.env.AGENTE_CONFIG || 'agente-stampa.json');
  let config = fs.existsSync(fileConfig) ? JSON.parse(fs.readFileSync(fileConfig, 'utf8')) : null;
  const salva = () => fs.writeFileSync(fileConfig, JSON.stringify(config, null, 2), { mode: 0o600 });

  const daCollegare = !config || !config.refreshToken || process.argv.includes('--collega');
  if (daCollegare) {
    // Le righe si leggono una alla volta (funziona anche se le risposte arrivano tutte insieme)
    const rl = readline.createInterface({ input: process.stdin });
    const righe = rl[Symbol.asyncIterator]();
    const chiedi = async (domanda) => { process.stdout.write(domanda); const { value } = await righe.next(); return String(value ?? '').trim(); };
    console.log("Collegamento dell'Agente di stampa: usa l'email e la password del locale (le stesse della cassa).");
    const email = await chiedi('Email del locale: ');
    const password = await chiedi('Password: ');
    const nome = (await chiedi(`Nome di questo agente [${os.hostname()}]: `)) || os.hostname();
    rl.close();
    const cred = await accedi(email, password);
    config = { email, uid: cred.uid, refreshToken: cred.refreshToken, nome, idAgente: config?.idAgente || crypto.randomBytes(5).toString('hex') };
    salva();
  }

  // Con gli emulatori (prove) si usa il loro progetto
  const opzioni = process.env.FIRESTORE_EMULATOR_HOST && process.env.GCLOUD_PROJECT ? { projectId: process.env.GCLOUD_PROJECT } : {};
  const agente = new Agente({ credenziali: { email: config.email, uid: config.uid, refreshToken: config.refreshToken }, nome: config.nome, idAgente: config.idAgente, riattiva: daCollegare, opzioni });
  agente.onCredenziali = (c) => { config.refreshToken = c.refreshToken; salva(); };
  agente.onScollegato = () => { delete config.refreshToken; salva(); console.log('Per usarlo di nuovo: node agente.mjs --collega'); };
  process.on('SIGINT', async () => { console.log('\nChiusura...'); await agente.ferma(); process.exit(0); });
  await agente.avvia();
}

// (import.meta.url manca quando il file è dentro AgenteStampa.exe: lì si parte da windows/avvio.mjs)
if (import.meta.url && process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  principale().catch((e) => { console.error('❌', e.message); process.exit(1); });
}
