// ============================================================================
// CATEGORIE-MENU.JS - Sezioni del menu aggiunte dal locale (oltre a pizze, stirate, bibite...)
// Si creano in Cassa > Gestionale > Menu > «Sezioni del menu» e stanno in impostazioni/categorie:
//   sezioni: [{ id: 'sez_panini', nome: 'Panini', reparto: 'pizzeria'|'cucina'|'bar'|'stm_...' (stampante aggiunta),
//               aggiunte: true|false   (si possono aggiungere/togliere ingredienti)
//               app_clienti: true|false (si ordina dall'App Clienti) }]
// L'id inizia sempre con "sez_": così non si confonde con le categorie di sempre.
// Il reparto decide stampante e Monitor Cucina: alla creazione la sezione viene spuntata
// nelle impostazioni delle stampanti e del KDS di quel reparto (poi si cambia da lì).
// Usato da Cassa, Sala, Telecomando, App Clienti e Menu QR.
// ============================================================================

export const MAX_SEZIONI = 30;
export const REPARTI_SEZIONE = ['pizzeria', 'cucina', 'bar'];
export const NOMI_REPARTI = { pizzeria: 'Pizzeria', cucina: 'Cucina', bar: 'Bar' };

// Categorie di sempre senza aggiunte/rimozioni di ingredienti (come prima in Cassa e Sala)
export const CATEGORIE_SENZA_AGGIUNTE = ['bibita', 'bibita_lattina', 'bibita_bottiglia', 'birra', 'vino', 'amaro', 'dolce', 'caffe'];

const FORMATO_ID = /^sez_[a-z0-9_]{1,40}$/;
// Reparto valido: uno dei tre di sempre o una stampante aggiunta dal locale (stm_..., vedi comande-escpos.js)
const repartoValido = (r) => REPARTI_SEZIONE.includes(r) || (typeof r === 'string' && /^stm_[a-z0-9_]{1,40}$/.test(r));
export const isSezione = (id) => typeof id === 'string' && FORMATO_ID.test(id);

// "Caffè & Gelati!" -> "sez_caffe_gelati" (unico rispetto agli id già usati)
export function nuovoIdSezione(nome, esistenti = []) {
    const base = String(nome ?? '')
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
        .slice(0, 34).replace(/_+$/, '') || 'sezione';
    const usati = new Set(esistenti);
    let id = `sez_${base}`;
    for (let n = 2; usati.has(id); n++) id = `sez_${base}_${n}`;
    return id;
}

// Dati del documento impostazioni/categorie -> elenco pulito (scarta voci rotte e doppioni)
export function sezioniValide(dati) {
    const voci = Array.isArray(dati?.sezioni) ? dati.sezioni : [];
    const visti = new Set();
    const out = [];
    for (const v of voci) {
        if (!v || typeof v !== 'object' || !isSezione(v.id) || visti.has(v.id)) continue;
        const nome = String(v.nome ?? '').trim().slice(0, 40);
        if (!nome) continue;
        visti.add(v.id);
        out.push({
            id: v.id,
            nome,
            reparto: repartoValido(v.reparto) ? v.reparto : 'cucina',
            aggiunte: v.aggiunte === true,
            app_clienti: v.app_clienti !== false,
        });
        if (out.length >= MAX_SEZIONI) break;
    }
    return out;
}

// Mette le sezioni in fondo all'ordine delle categorie di una pagina e i loro nomi nelle etichette.
// Toglie le sezioni eliminate. Modifica gli oggetti passati (le pagine li usano già così).
export function applicaSezioni(sezioni, ordine, etichette, { maiuscolo = false, filtro = null } = {}) {
    for (let i = ordine.length - 1; i >= 0; i--) if (isSezione(ordine[i])) ordine.splice(i, 1);
    Object.keys(etichette).forEach(k => { if (isSezione(k)) delete etichette[k]; });
    (sezioni || []).filter(s => !filtro || filtro(s)).forEach(s => {
        if (!ordine.includes(s.id)) ordine.push(s.id);
        etichette[s.id] = maiuscolo ? s.nome.toUpperCase() : s.nome;
    });
    return ordine;
}

// Nome leggibile se le impostazioni non sono ancora arrivate: "sez_pizze_fritte" -> "Pizze fritte"
export function etichettaDaId(id) {
    if (!isSezione(id)) return String(id ?? '').toUpperCase();
    const t = id.slice(4).replace(/_\d+$/, '').replace(/_/g, ' ').trim();
    return t.charAt(0).toUpperCase() + t.slice(1);
}

// Vero se ai prodotti della categoria non si aggiungono/tolgono ingredienti
export function senzaAggiunte(cat, sezioni = []) {
    if (isSezione(cat)) {
        const s = (sezioni || []).find(x => x.id === cat);
        return !(s && s.aggiunte);
    }
    return CATEGORIE_SENZA_AGGIUNTE.includes(cat);
}

// Reparto di una sezione secondo le stampanti (impostazioni/stampanti: pizzeria/cucina/bar.cats).
// null per le categorie di sempre o se la sezione non è spuntata in nessun reparto.
// (La stessa regola è in comande-escpos.js, che gira anche sul server.)
export function repartoSezione(cat, stampanti) {
    if (!isSezione(cat) || !stampanti) return null;
    return REPARTI_SEZIONE.find(r => Array.isArray(stampanti[r]?.cats) && stampanti[r].cats.includes(cat)) || null;
}
