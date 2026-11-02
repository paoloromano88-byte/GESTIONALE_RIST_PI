// ============================================================================
// TIMER-ATTESA.JS - Timer di attesa sulle schede ordine di Cassa e App Rider
//   ⏱ conto alla rovescia all'orario (asporto: l'orario di ritiro; domicilio: la fine della
//     fascia «Arrivo previsto» = orario + margine_consegna), poi «in ritardo di N min»
//   🍕 pronto da N min    (da pronto_alle, scritto da Cassa e Monitor Cucina quando segnano «Pronto»)
//   🛵 in consegna da N min (da timestamp_consegna_avvio, scritto dall'App Rider alla presa in carico)
// Livelli: ok (verde), vicino (arancione), ritardo (rosso). Niente DOM: le pagine mettono
// l'HTML di htmlTimer() nei segnaposto e lo rifanno ogni 30 secondi.
// I tavoli (tipo SALA) hanno già il loro timer in Cassa: qui non ne hanno.
// ============================================================================

export const SOGLIE = {
    orario: 10,          // ultimi 10 minuti prima dell'orario: arancione
    pronto: [5, 10],     // pronto da 5 min arancione, da 10 rosso
    consegna: [20, 30],  // in consegna da 20 min arancione, da 30 rosso
    ritardoMax: 180,     // oltre 3 ore di ritardo il timer sparisce (ordine dimenticato aperto)
};

const formatoRoma = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

// Data e minuto dell'orologio italiano: { data: 'YYYY-MM-DD', minuto: minuti "di calendario" }
function orologioRoma(adesso) {
    const p = Object.fromEntries(formatoRoma.formatToParts(new Date(adesso)).map(x => [x.type, x.value]));
    return { data: `${p.year}-${p.month}-${p.day}`, minuto: Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) / 60000 };
}

function minutoOrario(data, orario) {
    const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(data ?? ''));
    const o = /^(\d{1,2}):(\d{2})$/.exec(String(orario ?? '').trim());
    if (!d || !o || +o[1] > 23 || +o[2] > 59) return null;
    return Date.UTC(+d[1], +d[2] - 1, +d[3], +o[1], +o[2]) / 60000;
}

// Timestamp di Firestore, Date, millisecondi o { seconds } -> millisecondi (null se manca)
export function millisDi(v) {
    if (v == null) return null;
    if (typeof v.toMillis === 'function') return v.toMillis();
    if (typeof v.toDate === 'function') return v.toDate().getTime();
    if (typeof v.getTime === 'function') return v.getTime();   // Date (anche di un'altra finestra)
    if (typeof v === 'number') return v;
    if (typeof v.seconds === 'number') return v.seconds * 1000;
    return null;
}

export function testoDurata(min) {
    if (min < 1) return 'meno di 1 min';
    if (min < 60) return `${min} min`;
    const h = Math.floor(min / 60), m = min % 60;
    return m ? `${h} h ${m} min` : `${h} h`;
}

// Come la Cassa: a domicilio se il tipo lo dice o se c'è un indirizzo (i tavoli mai)
export const isDomicilio = (o) => o?.tipo === 'DOMICILIO' || (o?.tipo !== 'SALA' && String(o?.indirizzo || '').trim() !== '');

const livello = (min, [arancione, rosso]) => (min >= rosso ? 'ritardo' : min >= arancione ? 'vicino' : 'ok');

export function timerOrario(o, adesso, margine = 0) {
    if (!o || o.tipo === 'SALA' || o.stato === 'Annullato' || o.stato === 'Prenotato') return null;
    const dom = isDomicilio(o);
    // A domicilio conta la consegna del rider (la cassa può chiudere il conto prima che parta)
    if (dom ? o.stato_consegna === 'Consegnato' : o.stato === 'Consegnato') return null;
    const ora = orologioRoma(adesso);
    if (o.data_ritiro && o.data_ritiro !== ora.data) return null;
    const inizio = minutoOrario(ora.data, o.orario);
    if (inizio === null) return null;
    const extra = dom ? Math.min(Math.max(parseInt(margine, 10) || 0, 0), 120) : 0;
    const mancano = inizio + extra - ora.minuto;
    if (mancano < -SOGLIE.ritardoMax) return null;
    if (mancano < 0) return { tipo: 'orario', livello: 'ritardo', minuti: mancano, testo: `⚠️ In ritardo di ${testoDurata(-mancano)}` };
    return {
        tipo: 'orario',
        livello: mancano <= SOGLIE.orario ? 'vicino' : 'ok',
        minuti: mancano,
        testo: dom ? `⏱ Consegna entro ${testoDurata(mancano)}` : `⏱ Ritiro tra ${testoDurata(mancano)}`,
    };
}

const minutiDa = (v, adesso) => {
    const t = millisDi(v);
    return t === null ? null : Math.max(0, Math.floor((new Date(adesso).getTime() - t) / 60000));
};

export function timerPronto(o, adesso) {
    if (!o || o.tipo === 'SALA' || o.stato !== 'Pronto' || o.stato_consegna) return null;
    const min = minutiDa(o.pronto_alle, adesso);
    if (min === null) return null;
    return { tipo: 'pronto', livello: livello(min, SOGLIE.pronto), minuti: min, testo: `🍕 Pronto da ${testoDurata(min)}` };
}

export function timerConsegna(o, adesso) {
    if (o?.stato_consegna !== 'In consegna') return null;
    const min = minutiDa(o.timestamp_consegna_avvio, adesso);
    if (min === null) return null;
    return { tipo: 'consegna', livello: livello(min, SOGLIE.consegna), minuti: min, testo: `🛵 In consegna da ${testoDurata(min)}` };
}

export const timerOrdine = (o, adesso, margine = 0) =>
    [timerOrario(o, adesso, margine), timerPronto(o, adesso), timerConsegna(o, adesso)].filter(Boolean);

const SFONDI = { ok: '#2e7d32', vicino: '#ef6c00', ritardo: '#d32f2f' };

// I testi sono solo quelli scritti qui sopra (niente dati dei clienti): nessun escape necessario
export const htmlTimer = (timers) => (timers || []).map(x =>
    `<span class="timer-badge timer-${x.livello}" style="background:${SFONDI[x.livello]}; color:#fff; border-radius:6px; padding:3px 8px; font-weight:bold; font-size:0.85em; white-space:nowrap;">${x.testo}</span>`
).join('');
