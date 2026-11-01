// ============================================================================
// CLOUD FUNCTIONS - Gestionale Ristoranti
// Regione uguale al database Firestore (europe-west12), richiesto dai trigger Firestore.
// ============================================================================
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { setGlobalOptions } from 'firebase-functions/v2';
import { onDocumentCreated, onDocumentUpdated, onDocumentWritten } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions';
import { elaboraOrdineApp, isOrdineApp } from './ordini.js';
import { comandeDaEvento } from './comande.js';
import { avvisoDaEvento } from './avvisi-rider.js';
import { eseguiCambioPassword } from './account.js';

initializeApp();
setGlobalOptions({ region: 'europe-west12', maxInstances: 10 });
const db = getFirestore();

async function gestisci(event, base) {
    const ordine = event.data?.data();
    if (!isOrdineApp(ordine)) return;
    const esito = await elaboraOrdineApp(db, base, event.data.ref);
    if (esito?.anomalie?.length) logger.warn('Anomalia prezzo', { ordine: event.data.ref.path, anomalie: esito.anomalie });
}

// Locale principale (raccolte alla radice)
export const ordineAppPrincipale = onDocumentCreated('ordini/{ordineId}', (event) => gestisci(event, db));

// Locali creati dal Super Admin
export const ordineAppLocali = onDocumentCreated('ristoranti/{locale}/ordini/{ordineId}',
    (event) => gestisci(event, db.collection('ristoranti').doc(event.params.locale)));

// Comande per l'Agente di stampa (solo se il locale ha scelto "Agente di stampa"):
// ordini nuovi e messaggi alla cucina, anche con la cassa chiusa
export const comandePrincipale = onDocumentWritten('ordini/{ordineId}', (event) => comandeDaEvento(db, db, 'default', event));

export const comandeLocali = onDocumentWritten('ristoranti/{locale}/ordini/{ordineId}',
    (event) => comandeDaEvento(db, db.collection('ristoranti').doc(event.params.locale), event.params.locale, event));

// Notifica push al rider quando un ordine a domicilio diventa "Pronto" (anche con l'App Rider chiusa).
// Nell'emulatore non c'è FCM: le notifiche si scrivono in _push_emulatore per i test.
const opzioniAvviso = process.env.FUNCTIONS_EMULATOR === 'true' ? {
    invia: async (m) => {
        await db.collection('_push_emulatore').add({ ...m, creato: FieldValue.serverTimestamp() });
        return { responses: m.tokens.map(() => ({ success: true })) };
    },
} : {};

export const avvisoRiderPrincipale = onDocumentUpdated('ordini/{ordineId}', (event) => avvisoDaEvento(db, 'default', event, opzioniAvviso));

export const avvisoRiderLocali = onDocumentUpdated('ristoranti/{locale}/ordini/{ordineId}',
    (event) => avvisoDaEvento(db.collection('ristoranti').doc(event.params.locale), event.params.locale, event, opzioniAvviso));

// Cambio password di un account del locale chiesto dal Super Admin (solo lui può scrivere qui:
// vedi firestore.rules). La password viene tolta dalla richiesta appena usata.
export const cambioPasswordAccount = onDocumentCreated('utenti/{uid}/cambio_password/{richiestaId}',
    (event) => eseguiCambioPassword(db, getAuth(), event.params.uid, event.data.ref));
