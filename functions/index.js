// ============================================================================
// CLOUD FUNCTIONS - Gestionale Ristoranti
// Regione uguale al database Firestore (europe-west12), richiesto dai trigger Firestore.
// ============================================================================
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { setGlobalOptions } from 'firebase-functions/v2';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions';
import { elaboraOrdineApp, isOrdineApp } from './ordini.js';

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
