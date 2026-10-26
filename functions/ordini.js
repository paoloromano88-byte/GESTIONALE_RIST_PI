// ============================================================================
// ORDINI.JS - Elaborazione lato server degli ordini dell'App Clienti
// Al posto del telefono del cliente (che non può più scrivere su questi dati):
//   - scala le scorte dei prodotti
//   - aggiorna la scheda del cliente nella rubrica (clienti/{telefono})
//   - aggiorna il contatore pizze per fascia oraria (occupazione_forno/{data})
//   - ricalcola i prezzi dal listino e segnala in anomalia_prezzo se non tornano
// ============================================================================
import { FieldValue } from 'firebase-admin/firestore';
import { calcolaConsegna } from './zone-consegna.js';

export const CATEGORIE_FORNO = ['pizza', 'stirata', 'gf', 'speciale'];
const TOLLERANZA = 0.01;

const num = (v) => {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
};
const tondo = (n) => Math.round(n * 100) / 100;
const chiave = (s) => String(s ?? '').trim().toLowerCase();

// Solo gli ordini inviati dall'App Clienti hanno user_agent: quelli del personale
// (cassa, sala, telecomando) scalano già scorte e rubrica dal proprio dispositivo.
export const isOrdineApp = (ordine) => typeof ordine?.user_agent === 'string' && ordine.user_agent !== '';

export function applicaSconto(totale, sconto) {
    if (!sconto) return totale;
    const val = num(sconto.valore ?? sconto.val);
    if (sconto.tipo === 'euro' || sconto.tipo === 'fixed') return Math.max(0, totale - val);
    return Math.max(0, totale - (totale * val / 100));
}

// Dettagli scritti dall'App Clienti: "+Bufala,Salame|NO Mozzarella|nota"
function variazioni(dettagli) {
    const aggiunte = [], rimozioni = [];
    String(dettagli ?? '').split('|').map(s => s.trim()).forEach(parte => {
        if (parte.startsWith('+')) aggiunte.push(...parte.slice(1).split(',').map(s => s.trim()).filter(Boolean));
        else if (/^NO\s/i.test(parte)) rimozioni.push(...parte.slice(3).split(',').map(s => s.trim()).filter(Boolean));
    });
    return { aggiunte, rimozioni };
}

/**
 * Analisi pura dell'ordine (nessuna scrittura): scorte da scalare, pizze, controllo prezzi.
 * @param ordine        dati dell'ordine
 * @param listino       { prodotti, ingredienti, rimozioni, sconti } (array di documenti con id)
 * @param configNegozio impostazioni/negozio (zone di consegna)
 */
export function analizzaOrdine(ordine, listino, configNegozio) {
    const prodotti = listino.prodotti || [];
    const perNome = new Map(prodotti.map(p => [p.nome, p]));
    const perId = new Map(prodotti.map(p => [p.id, p]));
    const ingredienti = new Map((listino.ingredienti || []).map(i => [chiave(i.nome), num(i.prezzo)]));
    const rimozioni = new Map((listino.rimozioni || []).map(r => [chiave(r.nome), Math.abs(num(r.prezzo))]));

    const scorte = new Map();     // id prodotto -> quantità da scalare
    const anomalie = [];
    let pizze = 0;
    let totaleRighe = 0;

    const scala = (prodotto, quantita) => {
        if (!prodotto) return;
        const s = prodotto.scorta;
        if (s === null || s === undefined || s === '') return;   // prodotto senza gestione scorte
        scorte.set(prodotto.id, (scorte.get(prodotto.id) || 0) + quantita);
    };

    for (const item of ordine.prodotti || []) {
        const qta = num(item.qta) || 1;
        if (CATEGORIE_FORNO.includes(item.cat)) pizze += num(item.qta);

        if (Array.isArray(item.componenti) && item.componenti.length > 0) {
            // Stirata Bi-Gusto: mezza porzione per ogni gusto
            item.componenti.forEach(id => scala(perId.get(id), qta * 0.5));
        } else {
            scala(perNome.get(item.nome), qta);
        }

        if (item.isPeso) continue;   // prezzo al kg deciso in cassa
        const prezzo = num(item.prezzo);
        totaleRighe += prezzo * num(item.qta);

        // Prezzo atteso dal listino (la Bi-Gusto ha dettagli in HTML: verificata solo nel totale)
        const base = perNome.get(item.nome);
        if (!base || (Array.isArray(item.componenti) && item.componenti.length > 0)) continue;
        // Prezzo promozionale fisso del suggerimento bibite dell'App Clienti
        if (item.nome === 'Coca Cola Lattina' && Math.abs(prezzo - 2) < TOLLERANZA) continue;
        const { aggiunte, rimozioni: tolte } = variazioni(item.dettagli);
        const atteso = num(base.prezzo)
            + aggiunte.reduce((t, n) => t + (ingredienti.get(chiave(n)) ?? 0), 0)
            - tolte.reduce((t, n) => t + (rimozioni.get(chiave(n)) ?? Math.abs(ingredienti.get(chiave(n)) ?? 0)), 0);
        if (prezzo + TOLLERANZA < tondo(atteso)) {
            anomalie.push(`${item.nome}: € ${prezzo.toFixed(2)} invece di € ${tondo(atteso).toFixed(2)}`);
        }
    }

    // Sconto: il codice deve esistere
    const codice = String(ordine.codice_sconto || '').trim().toUpperCase();
    const sconto = codice ? (listino.sconti || []).find(s => String(s.codice || s.nome || '').toUpperCase() === codice) : null;
    if (codice && !sconto) anomalie.push(`Codice sconto inesistente: ${codice}`);

    // Consegna: supplemento della zona del CAP
    let supplementoAtteso = 0;
    if (ordine.tipo === 'DOMICILIO') {
        const c = calcolaConsegna(configNegozio, ordine.cliente?.cap || ordine.cap || '', totaleRighe);
        supplementoAtteso = c.supplemento;
        if (num(ordine.supplemento_consegna) + TOLLERANZA < supplementoAtteso) {
            anomalie.push(`Consegna € ${num(ordine.supplemento_consegna).toFixed(2)} invece di € ${supplementoAtteso.toFixed(2)}`);
        }
    }

    // Totale coerente con le righe dell'ordine
    const totaleAtteso = tondo(applicaSconto(totaleRighe, sconto) + supplementoAtteso);
    if (num(ordine.totale) + TOLLERANZA < totaleAtteso) {
        anomalie.push(`Totale € ${num(ordine.totale).toFixed(2)} invece di € ${totaleAtteso.toFixed(2)}`);
    }

    return { scorte, pizze, anomalie, totaleAtteso };
}

async function leggiTutti(ref) {
    const snap = await ref.get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/**
 * Elabora un ordine dell'App Clienti una sola volta (idempotente anche se la funzione viene ripetuta).
 * @param db       istanza Firestore (admin)
 * @param base     radice del locale: db per il locale principale, db.doc('ristoranti/{id}') per gli altri
 * @param ordineRef riferimento al documento dell'ordine
 */
export async function elaboraOrdineApp(db, base, ordineRef) {
    const col = (nome) => base.collection(nome);
    const [prodotti, ingredienti, rimozioni, sconti, negozioSnap] = await Promise.all([
        leggiTutti(col('prodotti')), leggiTutti(col('ingredienti')), leggiTutti(col('rimozioni')), leggiTutti(col('sconti')),
        col('impostazioni').doc('negozio').get()
    ]);
    const configNegozio = negozioSnap.exists ? negozioSnap.data() : {};

    return db.runTransaction(async (tx) => {
        const ordineSnap = await tx.get(ordineRef);
        if (!ordineSnap.exists) return { saltato: 'ordine inesistente' };
        const ordine = ordineSnap.data();
        if (!isOrdineApp(ordine)) return { saltato: 'ordine del personale' };
        if (ordine.elaborato_server) return { saltato: 'già elaborato' };

        const analisi = analizzaOrdine(ordine, { prodotti, ingredienti, rimozioni, sconti }, configNegozio);

        // Letture delle scorte attuali dentro la transazione (prima di qualsiasi scrittura)
        const refsScorte = [...analisi.scorte.keys()].map(id => col('prodotti').doc(id));
        const snapsScorte = await Promise.all(refsScorte.map(r => tx.get(r)));

        snapsScorte.forEach((snap, i) => {
            if (!snap.exists) return;
            const attuale = num(snap.data().scorta);
            const nuova = Math.max(0, tondo(attuale - analisi.scorte.get(snap.id)));
            tx.update(refsScorte[i], { scorta: nuova, attivo: nuova > 0 });
        });

        const tel = String(ordine.telefono || ordine.cliente?.telefono || '').trim();
        if (tel) {
            const scheda = {
                nome: `${ordine.nome || ''} ${ordine.cognome || ''}`.trim(),
                cognome: ordine.cognome || '',
                telefono: tel,
                totaleSpeso: FieldValue.increment(num(ordine.totale)),
                numOrdini: FieldValue.increment(1),
                ultimaData: ordine.data_ritiro || ''
            };
            if (ordine.tipo === 'DOMICILIO' && ordine.indirizzo) {
                Object.assign(scheda, {
                    indirizzo: ordine.indirizzo,
                    citofono: ordine.citofono || '',
                    zona: ordine.zona || '',
                    cap: ordine.cliente?.cap || ordine.cap || ''
                });
            }
            tx.set(col('clienti').doc(tel), scheda, { merge: true });
        }

        if (analisi.pizze > 0 && ordine.data_ritiro && ordine.orario) {
            tx.set(col('occupazione_forno').doc(ordine.data_ritiro),
                { slot: { [ordine.orario]: FieldValue.increment(analisi.pizze) } }, { merge: true });
        }

        tx.update(ordineRef, {
            elaborato_server: FieldValue.serverTimestamp(),
            anomalia_prezzo: analisi.anomalie.length
                ? { motivi: analisi.anomalie, totale_atteso: analisi.totaleAtteso }
                : FieldValue.delete()
        });
        return { scorte: Object.fromEntries(analisi.scorte), pizze: analisi.pizze, anomalie: analisi.anomalie };
    });
}
