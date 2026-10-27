// ============================================================================
// ORDINI.JS - Elaborazione lato server degli ordini dell'App Clienti
// Al posto del telefono del cliente (che non può più scrivere su questi dati):
//   - scala le scorte dei prodotti
//   - aggiorna la scheda del cliente nella rubrica (clienti/{telefono})
//   - ricalcola i contatori per fascia oraria (occupazione_forno/{data}): pizze e consegne a domicilio
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
    const perId = new Map(prodotti.map(p => [p.id, p]));
    // Le copie Gluten Free hanno lo stesso nome della pizza normale: si cerca per nome e categoria,
    // e solo per nome quando il nome è di un prodotto soltanto
    const perNomeCat = new Map(prodotti.map(p => [`${chiave(p.nome)}|${chiave(p.cat)}`, p]));
    const perNome = new Map();
    prodotti.forEach(p => perNome.set(chiave(p.nome), perNome.has(chiave(p.nome)) ? null : p));
    const trova = (item) => perNomeCat.get(`${chiave(item.nome)}|${chiave(item.cat)}`) || perNome.get(chiave(item.nome)) || undefined;
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
        if (!item || typeof item !== 'object') { anomalie.push('Riga dell\'ordine non valida'); continue; }
        const nome = String(item.nome ?? '');
        const base = trova(item);
        const componenti = Array.isArray(item.componenti) && item.componenti.length > 0 ? item.componenti : null;
        // Il prezzo al kg lo decide la cassa: vale solo per i prodotti a peso del listino
        const aPeso = item.isPeso === true && base?.isPeso === true;
        if (item.isPeso === true && !aPeso) anomalie.push(`${nome}: prodotto a peso non previsto dal listino`);

        // Quantità: numero positivo, intero tranne che per i prodotti a peso
        const qta = Number(item.qta);
        if (!Number.isFinite(qta) || qta <= 0 || qta > 100 || (!aPeso && !Number.isInteger(qta))) {
            anomalie.push(`${nome}: quantità non valida (${String(item.qta)})`);
            continue;
        }
        if (CATEGORIE_FORNO.includes(item.cat)) pizze += qta;

        if (componenti) {
            // Stirata Bi-Gusto: mezza porzione per ogni gusto
            componenti.forEach(id => scala(perId.get(id), qta * 0.5));
        } else {
            scala(base, qta);
        }

        if (aPeso) continue;
        const prezzo = num(item.prezzo);
        totaleRighe += prezzo * qta;

        // Prezzo atteso dal listino
        let atteso;
        if (componenti) {
            // Bi-Gusto: costa almeno quanto il gusto più caro (le aggiunte sono nei dettagli in HTML)
            const gusti = componenti.map(id => perId.get(id));
            if (gusti.some(g => !g)) { anomalie.push(`${nome}: gusto non presente nel listino`); continue; }
            atteso = Math.max(...gusti.map(g => num(g.prezzo)));
        } else {
            // Prezzo promozionale fisso del suggerimento bibite dell'App Clienti
            if (nome === 'Coca Cola Lattina' && Math.abs(prezzo - 2) < TOLLERANZA) continue;
            if (!base) { anomalie.push(`${nome}: prodotto non presente nel listino`); continue; }
            const { aggiunte, rimozioni: tolte } = variazioni(item.dettagli);
            atteso = num(base.prezzo)
                + aggiunte.reduce((t, n) => t + (ingredienti.get(chiave(n)) ?? 0), 0)
                - tolte.reduce((t, n) => t + (rimozioni.get(chiave(n)) ?? Math.abs(ingredienti.get(chiave(n)) ?? 0)), 0);
        }
        if (prezzo + TOLLERANZA < tondo(atteso)) {
            anomalie.push(`${nome}: € ${prezzo.toFixed(2)} invece di € ${tondo(atteso).toFixed(2)}`);
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

/**
 * Pizze e consegne per fascia oraria di un giorno, dagli ordini di quel giorno.
 * Stesso calcolo della cassa (cassa.js, pubblicaOccupazioneForno): così chi scrive per ultimo
 * scrive comunque il valore giusto, senza contare due volte lo stesso ordine.
 */
export function occupazioneGiorno(ordini) {
    const slot = {}, consegne = {};
    for (const o of ordini) {
        if (!o.orario || o.stato === 'Annullato' || o.tavolo) continue;
        const pz = (o.prodotti || []).reduce((t, p) => t + (CATEGORIE_FORNO.includes(p.cat) ? (parseFloat(p.qta) || 0) : 0), 0);
        if (pz > 0) slot[o.orario] = (slot[o.orario] || 0) + pz;
        if (o.tipo === 'DOMICILIO') consegne[o.orario] = (consegne[o.orario] || 0) + 1;
    }
    return { slot, consegne };
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
        // Ordini dello stesso giorno, per ricalcolare il contatore del forno
        const ordiniGiorno = ordine.data_ritiro && ordine.orario
            ? await tx.get(col('ordini').where('data_ritiro', '==', ordine.data_ritiro))
            : { docs: [] };

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

        if (ordine.data_ritiro && ordine.orario) {
            tx.set(col('occupazione_forno').doc(ordine.data_ritiro),
                { ...occupazioneGiorno(ordiniGiorno.docs.map(d => d.data())), aggiornato: FieldValue.serverTimestamp() });
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
