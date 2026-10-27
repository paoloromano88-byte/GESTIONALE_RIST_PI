// ============================================================================
// ZONE-CONSEGNA.JS - Zone di consegna a domicilio riconosciute dal CAP
// Configurazione in impostazioni/negozio (modificabile da Cassa > Impostazioni):
//   supplemento_consegna    supplemento base (usato se non ci sono zone)
//   supplemento_fuori_zona  supplemento per i CAP che non rientrano in nessuna zona
//   zone_consegna: [{ nome, cap: "00100, 00118-00199", supplemento,
//                     ordine_minimo, gratis_sopra, attiva }]
// Usato dall'App Clienti e dalla Cassa, così il calcolo è identico ovunque.
// ============================================================================

export const SUPPLEMENTO_PREDEFINITO = 2;

function numero(valore, predefinito) {
    const n = parseFloat(valore);
    return Number.isFinite(n) && n >= 0 ? n : predefinito;
}

const arrotonda = (n) => Math.round(n * 100) / 100;

export function normalizzaCap(cap) {
    const cifre = String(cap ?? '').replace(/\D/g, '');
    return cifre.length === 5 ? cifre : '';
}

// "00100, 00118-00199" (o un array) -> verifica se il CAP è compreso
function capInZona(capZona, cap) {
    const voci = Array.isArray(capZona) ? capZona : String(capZona ?? '').split(/[,;\s]+/);
    return voci.some(voce => {
        const intervallo = String(voce).trim().match(/^(\d{5})\s*-\s*(\d{5})$/);
        if (intervallo) return cap >= intervallo[1] && cap <= intervallo[2];
        return normalizzaCap(voce) === cap;
    });
}

export function zoneAttive(config) {
    const zone = Array.isArray(config?.zone_consegna) ? config.zone_consegna : [];
    return zone.filter(z => z && z.attiva !== false && String(z.cap ?? '').trim() !== '');
}

// Calcola zona, supplemento e minimo d'ordine per un CAP e un totale prodotti
export function calcolaConsegna(config, cap, totaleProdotti = 0) {
    const base = numero(config?.supplemento_consegna, SUPPLEMENTO_PREDEFINITO);
    const zone = zoneAttive(config);
    const capNorm = normalizzaCap(cap);
    const totale = numero(totaleProdotti, 0);

    const risultato = {
        zoneConfigurate: zone.length > 0,
        cap: capNorm,
        capValido: zone.length === 0 || capNorm !== '',
        zona: '',
        fuoriZona: false,
        supplementoPieno: base,
        supplemento: base,
        minimo: 0,
        gratisSopra: 0,
        gratuita: false,
        mancanoPerMinimo: 0
    };

    // Nessuna zona configurata: supplemento unico, come prima
    if (zone.length === 0) return risultato;

    // CAP non ancora inserito: mostra il supplemento più basso ("da € ...")
    if (!capNorm) {
        const minimoSupp = Math.min(...zone.map(z => numero(z.supplemento, base)));
        return { ...risultato, supplementoPieno: minimoSupp, supplemento: minimoSupp };
    }

    const zona = zone.find(z => capInZona(z.cap, capNorm));
    if (!zona) {
        const suppFuori = numero(config?.supplemento_fuori_zona, base);
        return { ...risultato, zona: 'Fuori zona', fuoriZona: true, supplementoPieno: suppFuori, supplemento: suppFuori };
    }

    const supplementoPieno = numero(zona.supplemento, base);
    const minimo = numero(zona.ordine_minimo, 0);
    const gratisSopra = numero(zona.gratis_sopra, 0);
    const gratuita = gratisSopra > 0 && totale >= gratisSopra;
    return {
        ...risultato,
        zona: String(zona.nome || 'Zona').trim(),
        supplementoPieno,
        supplemento: gratuita ? 0 : supplementoPieno,
        minimo,
        gratisSopra,
        gratuita,
        mancanoPerMinimo: minimo > totale ? arrotonda(minimo - totale) : 0
    };
}
