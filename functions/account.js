// ============================================================================
// ACCOUNT DEI LOCALI: CAMBIO PASSWORD DAL SUPER ADMIN
// Dal browser non si può cambiare la password di un altro account: serve l'Admin SDK.
// Il Super Admin scrive una richiesta in utenti/{uid}/cambio_password/{id} = { password, creato }.
// Le regole di Firestore permettono di scrivere lì SOLO al Super Admin (nessun'altra regola
// copre le sottoraccolte di utenti). Il trigger cambia la password, toglie subito la password
// dalla richiesta e scrive l'esito: { stato: 'fatto' | 'errore', errore?, completato }.
// Solo per gli account del personale (ruolo 'locale'), mai per il Super Admin.
// Cambiare la password chiude le sessioni aperte: i dispositivi rifanno l'accesso.
// ============================================================================
import { FieldValue } from 'firebase-admin/firestore';

export const MIN_PASSWORD = 6;   // minimo di Firebase Authentication
const MAX_PASSWORD = 128;

export function passwordValida(p) {
    return typeof p === 'string' && p.length >= MIN_PASSWORD && p.length <= MAX_PASSWORD;
}

const MESSAGGI = {
    'auth/user-not-found': "L'account non esiste più in Authentication.",
    'auth/invalid-password': `Password non valida (almeno ${MIN_PASSWORD} caratteri).`,
};

export async function eseguiCambioPassword(db, auth, uid, ref) {
    // Presa in carico atomica: la password esce subito dal database e, se il trigger riparte
    // o due esecuzioni arrivano insieme, solo una la usa
    const presa = await db.runTransaction(async (tx) => {
        const r = (await tx.get(ref)).data();
        if (!r || !('password' in r)) return null;   // già eseguita: niente da fare
        tx.update(ref, { password: FieldValue.delete(), stato: 'in_corso' });
        return { password: r.password };
    });
    if (!presa) return null;

    const esito = (stato, errore) => ref.update({
        stato, ...(errore ? { errore } : {}),
        completato: FieldValue.serverTimestamp(),
    }).then(() => ({ stato, errore }));

    const profilo = (await db.doc(`utenti/${uid}`).get()).data();
    if (!profilo || profilo.ruolo !== 'locale') {
        return esito('errore', 'Si può cambiare solo la password di un account collegato a un locale.');
    }
    if (!passwordValida(presa.password)) {
        return esito('errore', `Password non valida (da ${MIN_PASSWORD} a ${MAX_PASSWORD} caratteri).`);
    }
    try {
        await auth.updateUser(uid, { password: presa.password });
    } catch (e) {
        return esito('errore', MESSAGGI[e.code] || `Password non cambiata: ${e.message}`);
    }
    return esito('fatto');
}
