// ============================================================================
// COMANDE PREPARATE DAL SERVER (Agente di stampa)
// Con impostazioni/stampanti.metodo = 'agente' le comande automatiche le mette in coda
// il server, così escono anche con la cassa chiusa:
//   - ordine nuovo (cassa, sala, telecomando, App Clienti) -> pizzeria, cucina, bar
//   - nuovo messaggio alla cucina (VIA TURNO, AGGIUNTA, STORNO) -> stessi reparti
// Il testo è quello di comande-escpos.js, lo stesso che stampa la cassa.
// Con QZ Tray non fa niente: le stampa il PC con «QUESTO PC È LA CASSA».
// ============================================================================
import qrcode from 'qrcode-generator';
import { FieldValue } from 'firebase-admin/firestore';
import { datiOrdine, datiMessaggioCucina, repartiComande, nomeStampante, applicaBloccoDomicilio, pulisciDatiStampa, isDomicilio, byteDatiStampa, base64Byte, descrizioneStampa } from './comande-escpos.js';

// Indirizzo del sito per il QR della consegna (apre l'App Rider)
export const URL_SITO = 'https://gestionale-ristoranti-96c5b.web.app/';
export const REPARTI = ['pizzeria', 'cucina', 'bar']; // più le stampanti aggiunte dal locale (stm_...): repartiComande()
// Come la cassa: si stampano solo gli ordini appena arrivati (non quelli ripristinati da un backup)
const MS_ORDINE_NUOVO = 2 * 60 * 1000;

// Data di oggi in Italia (AAAA-MM-GG): il server lavora in UTC, tra mezzanotte e l'una/le due sarebbe ancora "ieri"
const giornoItalia = (adesso) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' }).format(adesso);

export function contestoServer(locale, adesso = new Date()) {
    return { adesso, fuso: 'Europe/Rome', oggiISO: giornoItalia(adesso), urlBase: URL_SITO, locale, qrcode };
}

// Voce di coda_stampa: stesso formato che scrive la cassa (byte ESC/POS in base64)
function voceCoda(ordine, reparto, ip, data, descrizione) {
    const pronti = pulisciDatiStampa(applicaBloccoDomicilio(data, isDomicilio(ordine) ? ordine : null));
    const [host, porta] = String(ip).trim().replace(/^https?:\/\//, '').split(':');
    return {
        stampante: reparto, descrizione: String(descrizione).slice(0, 80),
        ip: host, porta: parseInt(porta) || 9100, dati: base64Byte(byteDatiStampa(pronti)),
        stato: 'da_stampare', tentativi: 0, origine: 'server',
    };
}

const ipReparto = (config, reparto) => String(config?.[reparto]?.ip || '').trim();

// Comande di un ordine nuovo: una per ogni reparto che ha qualcosa da preparare
export function comandePerOrdine(ordine, config, ctx) {
    const voci = [];
    for (const reparto of repartiComande(config)) {
        const ip = ipReparto(config, reparto);
        if (!ip) continue;
        const stampa = datiOrdine(ordine, reparto.toUpperCase(), config, ctx);
        if (stampa) voci.push(voceCoda(ordine, reparto, ip, stampa.data, `${stampa.titolo} · ${descrizioneStampa(ordine)}`));
    }
    return voci;
}

// Comande per un messaggio alla cucina (chiamata del turno, aggiunte, storni)
export function comandePerMessaggio(ordine, config, ctx) {
    const voci = [];
    for (const reparto of repartiComande(config)) {
        const ip = ipReparto(config, reparto);
        if (!ip) continue;
        // stampanti: le sezioni aggiunte dal locale vanno nel reparto in cui sono spuntate
        const stampa = datiMessaggioCucina(ordine, reparto, { ...ctx, stampanti: config });
        if (stampa) voci.push(voceCoda(ordine, reparto, ip, stampa.data, `${nomeStampante(config, reparto).toUpperCase()} · ${descrizioneStampa(ordine)}`));
    }
    return voci;
}

async function configStampa(base) {
    const snap = await base.collection('impostazioni').doc('stampanti').get();
    return snap.exists ? snap.data() : null;
}

// Scrive le voci con un id fisso per evento: se la funzione viene ripetuta non stampa due volte
async function accoda(db, base, voci, chiave) {
    if (!voci.length) return 0;
    const batch = db.batch();
    for (const v of voci) batch.create(base.collection('coda_stampa').doc(`${chiave}_${v.stampante}`), { ...v, creato: FieldValue.serverTimestamp() });
    try {
        await batch.commit();
    } catch (e) {
        if (e.code === 6) return 0; // ALREADY_EXISTS: già messe in coda da un tentativo precedente
        throw e;
    }
    return voci.length;
}

const millis = (t) => (t && typeof t.toMillis === 'function') ? t.toMillis() : (t ? new Date(t).getTime() : null);

// Ordine appena creato. Restituisce quante comande ha messo in coda.
export async function comandeOrdineCreato(db, base, locale, ordineId, ordine, adesso = new Date()) {
    if (!ordine) return 0;
    const invio = millis(ordine.data_invio);
    if (invio && adesso.getTime() - invio > MS_ORDINE_NUOVO) return 0;
    const config = await configStampa(base);
    if (config?.metodo !== 'agente') return 0;
    const voci = comandePerOrdine({ id: ordineId, ...ordine }, config, contestoServer(locale, adesso));
    return accoda(db, base, voci, `ordine_${ordineId}`);
}

// Ordine modificato: stampa solo se è arrivato un messaggio nuovo per la cucina
// (ogni messaggio porta un nuovo timestamp_messaggio, anche se il testo è uguale al precedente)
export async function comandeMessaggio(db, base, locale, ordineId, prima, dopo, adesso = new Date()) {
    const messaggio = dopo?.messaggio_cucina;
    if (!messaggio || messaggio.includes('RICHIESTA CONTO')) return 0;
    const quando = millis(dopo.timestamp_messaggio);
    if (messaggio === prima?.messaggio_cucina && quando === millis(prima?.timestamp_messaggio)) return 0;
    const config = await configStampa(base);
    if (config?.metodo !== 'agente') return 0;
    const voci = comandePerMessaggio({ id: ordineId, ...dopo }, config, contestoServer(locale, adesso));
    return accoda(db, base, voci, `messaggio_${ordineId}_${quando || adesso.getTime()}`);
}

// Trigger su ogni scrittura di un ordine
export async function comandeDaEvento(db, base, locale, event) {
    const prima = event.data?.before?.exists ? event.data.before.data() : null;
    const dopo = event.data?.after?.exists ? event.data.after.data() : null;
    if (!dopo) return 0;
    const ordineId = event.params.ordineId;
    return prima ? comandeMessaggio(db, base, locale, ordineId, prima, dopo) : comandeOrdineCreato(db, base, locale, ordineId, dopo);
}
