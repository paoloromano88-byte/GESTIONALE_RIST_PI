// ============================================================================
// AVVISO AL RIDER: ORDINE PRONTO (notifica push, anche con l'App Rider chiusa)
// L'App Rider iscrive il telefono in notifiche_rider/{token} quando il rider attiva le
// notifiche, e lo cancella a fine turno. Quando la cucina segna "Pronto" un ordine a
// domicilio di oggi, il server manda la notifica:
//   - al rider che l'ha già preso in carico, se c'è;
//   - altrimenti a tutti i rider del locale con le notifiche attive.
// ============================================================================
import { getMessaging } from 'firebase-admin/messaging';

export const URL_APP_RIDER = 'https://gestionale-ristoranti-96c5b.web.app/delivery.html';
// Telefoni che non ricevono più (app disinstallata, notifiche revocate): si tolgono dall'elenco
const TOKEN_SCADUTI = ['messaging/registration-token-not-registered', 'messaging/invalid-registration-token'];

const oggiRoma = (adesso) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' }).format(adesso);

// Come l'App Rider: avvisa solo gli ordini a domicilio di oggi appena diventati "Pronto"
export function diventatoPronto(prima, dopo, adesso = new Date()) {
    return !!dopo && dopo.tipo === 'DOMICILIO' && dopo.stato === 'Pronto' && prima?.stato !== 'Pronto'
        && dopo.stato_consegna !== 'Consegnato' && dopo.data_ritiro === oggiRoma(adesso);
}

// Il rider dell'ordine, oppure tutti se nessuno l'ha ancora preso
export function destinatari(iscritti, ordine) {
    if (ordine.fattorino_id) return iscritti.filter(i => i.rider_id === ordine.fattorino_id);
    if (ordine.fattorino) return iscritti.filter(i => i.rider_nome === ordine.fattorino);
    return iscritti;
}

// Solo dati: la notifica la compone il service worker del telefono (firebase-messaging-sw.js),
// che ci mette il logo del locale (il messaggio FCM non può contenere l'immagine, max 4 KB)
export function notificaPronto(ordine, ordineId, locale) {
    const nome = `${ordine.cognome || ''} ${ordine.nome || ''}`.trim() || 'Cliente';
    return {
        webpush: {
            headers: { Urgency: 'high', TTL: '1800' },
            data: {
                titolo: '🍕 Pronto da ritirare',
                testo: `${nome}${ordine.orario ? ' · ore ' + ordine.orario : ''}`,
                tag: `pronto-${ordineId}`,
                link: URL_APP_RIDER + (locale !== 'default' ? `?locale=${encodeURIComponent(locale)}` : ''),
                locale,
            },
        },
    };
}

const inviaFcm = (messaggio) => getMessaging().sendEachForMulticast(messaggio);

// Restituisce quante notifiche sono partite. invia() è sostituibile nei test.
export async function avvisaRiderPronto(base, locale, ordineId, prima, dopo, { adesso = new Date(), invia = inviaFcm } = {}) {
    if (!diventatoPronto(prima, dopo, adesso)) return 0;
    const snap = await base.collection('notifiche_rider').get();
    const iscritti = destinatari(snap.docs.map(d => ({ ref: d.ref, ...d.data() })).filter(i => i.token), dopo);
    if (!iscritti.length) return 0;
    const esito = await invia({ ...notificaPronto(dopo, ordineId, locale), tokens: iscritti.map(i => i.token) });
    await Promise.all(esito.responses.map((r, i) => (!r.success && TOKEN_SCADUTI.includes(r.error?.code)) ? iscritti[i].ref.delete() : null));
    return esito.responses.filter(r => r.success).length;
}

// Trigger su ogni modifica di un ordine
export function avvisoDaEvento(base, locale, event, opzioni) {
    const prima = event.data?.before?.exists ? event.data.before.data() : null;
    const dopo = event.data?.after?.exists ? event.data.after.data() : null;
    return avvisaRiderPronto(base, locale, event.params.ordineId, prima, dopo, opzioni);
}
