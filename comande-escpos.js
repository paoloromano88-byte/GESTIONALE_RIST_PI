// ============================================================================
// COMANDE-ESCPOS.JS - Testo ESC/POS per le stampanti termiche da 80 mm:
// comande dei reparti, conto/preconto, chiamata dei turni e aggiornamenti (VIA,
// aggiunte, storni, cambi turno), blocco domicilio e QR della consegna.
// Usato dalla Cassa (browser) e dal server (functions/comande.js): una comanda esce
// identica sia dalla cassa sia dall'Agente di stampa quando la cassa è chiusa.
// Niente DOM: ciò che dipende dall'ambiente arriva nel contesto "ctx":
//   adesso, fuso       data e ora stampate in fondo (fuso: es. 'Europe/Rome' sul server)
//   oggiISO            data di oggi 'AAAA-MM-GG' (per "PER IL:" degli ordini futuri; se manca, quella di oggi nel fuso)
//   righeServizio(o)   righe operative (domicilio, servizio, senza glutine)
//   qrDati(o)          voci del QR della consegna; altrimenti qrcode + urlBase + locale
//   prezzoCoperto, divisore, nomeScontoAttivo   solo per conto e preconto
// Le voci di stampa sono stringhe (testo + comandi ESC/POS) o { type: 'raw', format:
// 'command', flavor: 'base64', data } per le immagini, come le vuole QZ Tray.
// ============================================================================

export const LARGHEZZA_CARTA = 42; // Standard 80mm
const SEPARATORE_DOPPIO = "=".repeat(LARGHEZZA_CARTA);
const SEPARATORE_TRATTO = "-".repeat(LARGHEZZA_CARTA);

// Converte il testo in ASCII puro: le stampanti termiche non gestiscono UTF-8,
// quindi accenti, € ed emoji uscirebbero come caratteri incomprensibili.
// I comandi ESC/POS usati sono tutti sotto 0x80 e restano intatti.
export function pulisciTestoESC(str) {
    if (!str) return "";
    return String(str)
        .replace(/[àáâãä]/g, "a'")
        .replace(/[èéêë]/g, "e'")
        .replace(/[ìíîï]/g, "i'")
        .replace(/[òóôõö]/g, "o'")
        .replace(/[ùúûü]/g, "u'")
        .replace(/[ÀÁÂÃÄ]/g, "A'")
        .replace(/[ÈÉÊË]/g, "E'")
        .replace(/[ÌÍÎÏ]/g, "I'")
        .replace(/[ÒÓÔÕÖ]/g, "O'")
        .replace(/[ÙÚÛÜ]/g, "U'")
        .replace(/€\s?/g, "EUR ")
        .replace(/[‘’´`]/g, "'")
        .replace(/[“”«»]/g, '"')
        .replace(/[–—]/g, "-")
        .replace(/…/g, "...")
        .replace(/[×]/g, "x")
        .replace(/°/g, "o")
        .replace(/ /g, " ")
        .normalize('NFD').replace(/[̀-ͯ]/g, "")
        .replace(/[^\x00-\x7F]+ ?/g, "");
}

export function wrapTestoTermica(testo, maxCols = LARGHEZZA_CARTA) {
    const pulito = pulisciTestoESC(testo).trim();
    if (pulito.length <= maxCols) return [pulito];

    const parole = pulito.split(/\s+/);
    const righe = [];
    let rigaCorrente = "";

    parole.forEach(parola => {
        if ((rigaCorrente + " " + parola).trim().length <= maxCols) {
            rigaCorrente = (rigaCorrente + " " + parola).trim();
        } else {
            if (rigaCorrente) righe.push(rigaCorrente);
            rigaCorrente = parola.slice(0, maxCols);
        }
    });
    if (rigaCorrente) righe.push(rigaCorrente);
    return righe;
}

export const isDomicilio = (ordine) => !!ordine && (ordine.tipo === 'DOMICILIO' || (ordine.indirizzo && String(ordine.indirizzo).trim() !== ''));

export function bloccoDomicilioESC(ordine, isCucina = false) {
    if (!ordine) return "";
    if (!isDomicilio(ordine)) return "";

    let righe = [];
    righe.push(SEPARATORE_DOPPIO);
    righe.push("      *** CONSEGNA A DOMICILIO ***      ".slice(0, LARGHEZZA_CARTA));
    righe.push(SEPARATORE_DOPPIO);

    const cliente = `${ordine.cognome || ''} ${ordine.nome || ''}`.trim().toUpperCase();
    if (cliente) {
        wrapTestoTermica(`CLIENTE: ${cliente}`).forEach(r => righe.push(r));
    }
    if (ordine.telefono) {
        righe.push(`TEL:     ${pulisciTestoESC(ordine.telefono)}`);
    }
    if (ordine.orario) {
        righe.push(`ORARIO:  ${pulisciTestoESC(ordine.orario)}`);
    }

    righe.push(SEPARATORE_TRATTO);

    if (ordine.indirizzo) {
        wrapTestoTermica(`INDIRIZZO: ${ordine.indirizzo.toUpperCase()}`).forEach(r => righe.push(r));
    }
    if (ordine.citofono) {
        wrapTestoTermica(`CITOFONO:  ${ordine.citofono.toUpperCase()}`).forEach(r => righe.push(r));
    }
    const capOrdine = ordine.cap || ordine.cliente?.cap || '';
    if (capOrdine) {
        righe.push(`CAP:       ${pulisciTestoESC(capOrdine)}`);
    }
    if (ordine.zona) {
        wrapTestoTermica(`ZONA:      ${ordine.zona.toUpperCase()}`).forEach(r => righe.push(r));
    }
    if (ordine.fattorino) {
        righe.push(`RIDER:     ${pulisciTestoESC(ordine.fattorino).toUpperCase()}`);
    }

    const supp = parseFloat(ordine.supplemento_consegna) || 0;
    if (!isCucina && supp > 0) {
        righe.push(SEPARATORE_TRATTO);
        righe.push(`SUPPLEMENTO CONSEGNA: EUR ${supp.toFixed(2)}`);
    }

    righe.push(SEPARATORE_DOPPIO);
    return righe.join("\n") + "\n";
}

// --- QR della consegna: il rider lo scansiona con l'App Rider per prendere in carico
// proprio l'ordine della busta che ha in mano (delivery.html?locale=...&ordine=ID) ---
export function urlQrConsegna(ordine, urlBase, locale) {
    return `${urlBase}delivery.html?locale=${encodeURIComponent(locale || 'default')}&ordine=${encodeURIComponent(ordine.id)}`;
}

// Codice breve stampato sotto il QR e mostrato nell'App Rider, per un controllo a occhio
export const codiceBreveOrdine = (id) => String(id || '').slice(-6).toUpperCase();

// QR come immagine raster ESC/POS (GS v 0): la stampano tutte le termiche, senza
// dipendere dal comando QR nativo. Restituisce i byte in base64 (QZ li invia così come sono).
// "qrcode" è la libreria qrcode-generator (window.qrcode nel browser, import sul server).
export function rasterQrBase64(testo, qrcode, modulo = 5, margine = 4) {
    if (typeof qrcode !== 'function') return null;
    const qr = qrcode(0, 'M');
    qr.addData(testo);
    qr.make();
    const n = qr.getModuleCount();
    const lato = (n + margine * 2) * modulo;
    const byteRiga = Math.ceil(lato / 8);
    const bytes = [0x1D, 0x76, 0x30, 0x00, byteRiga & 0xFF, byteRiga >> 8, lato & 0xFF, lato >> 8];
    for (let y = 0; y < lato; y++) {
        const r = Math.floor(y / modulo) - margine;
        for (let b = 0; b < byteRiga; b++) {
            let v = 0;
            for (let bit = 0; bit < 8; bit++) {
                const x = b * 8 + bit;
                const c = Math.floor(x / modulo) - margine;
                if (x < lato && r >= 0 && r < n && c >= 0 && c < n && qr.isDark(r, c)) v |= 0x80 >> bit;
            }
            bytes.push(v);
        }
    }
    let bin = '';
    for (const v of bytes) bin += String.fromCharCode(v);
    return btoa(bin);
}

export function datiQrConsegnaESC(ordine, ctx = {}) {
    if (!isDomicilio(ordine) || !ordine.id) return [];
    let raster = null;
    try { raster = rasterQrBase64(urlQrConsegna(ordine, ctx.urlBase, ctx.locale), ctx.qrcode); } catch (e) { console.error("QR consegna:", e); }
    if (!raster) return [];
    const cliente = `${ordine.cognome || ''} ${ordine.nome || ''}`.trim().toUpperCase();
    return [
        '\x1B\x61\x01' + SEPARATORE_TRATTO + '\n',
        '\x1B\x45\x01RIDER: SCANSIONA PER PRENDERE IN CARICO\x1B\x45\x00\n',
        { type: 'raw', format: 'command', flavor: 'base64', data: raster },
        '\x1B\x61\x01\x1D\x21\x01ORDINE #' + codiceBreveOrdine(ordine.id) + '\x1D\x21\x00\n'
            + (cliente ? cliente.slice(0, LARGHEZZA_CARTA) + '\n' : '')
    ];
}

// Voce di stampa con testo normale (non i byte in base64/hex di immagini come il QR)
export function isTestoSemplice(item) {
    return !!item && typeof item.data === 'string'
        && (!item.format || item.format === 'plain' || item.format === 'command')
        && (!item.flavor || item.flavor === 'plain');
}

// Se la stampa è di un ordine a domicilio e non lo dice già, aggiunge il blocco con
// indirizzo e citofono e trasforma ASPORTO/RITIRO in CONSEGNA A DOMICILIO/DOMICILIO
export function applicaBloccoDomicilio(data, ordineDom) {
    if (!Array.isArray(data) || !ordineDom) return data;
    const testoCompleto = data.map(item => (typeof item === 'string' ? item : (isTestoSemplice(item) ? item.data : ''))).join('\n');
    if (testoCompleto.includes('CONSEGNA A DOMICILIO')) return data;
    const bloccoESC = bloccoDomicilioESC(ordineDom, false);
    data = data.map(item => {
        if (typeof item === 'string') {
            return item
                .replace(/ASPORTO/gi, 'CONSEGNA A DOMICILIO')
                .replace(/RITIRO/gi, 'DOMICILIO');
        } else if (isTestoSemplice(item)) {
            item.data = item.data
                .replace(/ASPORTO/gi, 'CONSEGNA A DOMICILIO')
                .replace(/RITIRO/gi, 'DOMICILIO');
        }
        return item;
    });
    const indiceInserimento = data.length > 1 ? 1 : 0;
    data.splice(indiceInserimento, 0, bloccoESC);
    return data;
}

// Testo solo ASCII in tutte le voci (le immagini restano intatte)
export function pulisciDatiStampa(data) {
    if (!Array.isArray(data)) return data;
    return data.map(item => {
        if (typeof item === 'string') return pulisciTestoESC(item);
        if (isTestoSemplice(item)) {
            return { ...item, data: pulisciTestoESC(item.data) };
        }
        return item;
    });
}

// Voci di stampa -> byte da mandare alla stampante (dopo pulisciDatiStampa il testo è ASCII:
// un carattere = un byte; le immagini in base64 si decodificano)
export function byteDatiStampa(data) {
    const out = [];
    const testo = (s) => { for (const ch of String(s)) { const c = ch.codePointAt(0); out.push(c <= 0xFF ? c : (ch === '€' ? 0x80 : 0x3F)); } };
    for (const item of data) {
        if (typeof item === 'string') testo(item);
        else if (item && typeof item.data === 'string') {
            if (item.flavor === 'base64') { const bin = atob(item.data); for (let i = 0; i < bin.length; i++) out.push(bin.charCodeAt(i)); }
            else testo(item.data);
        }
    }
    return out;
}

export function base64Byte(bytes) {
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.slice(i, i + 0x8000));
    return btoa(bin);
}

// Righe operative per cucina e pizzeria: consegna a domicilio, tipo di servizio, senza glutine
export function righeServizioCucina(dati) {
    if (!dati) return "";
    let righe = [];

    if (isDomicilio(dati)) {
        righe.push("================================");
        righe.push("   *** CONSEGNA A DOMICILIO *** ");
        righe.push("================================");
        if (dati.indirizzo) righe.push(`IND: ${dati.indirizzo.toUpperCase()}`);
        if (dati.citofono)  righe.push(`CITOFONO: ${dati.citofono.toUpperCase()}`);
        if (dati.zona)      righe.push(`ZONA: ${dati.zona.toUpperCase()}`);
        if (dati.telefono)  righe.push(`TEL: ${dati.telefono}`);
        if (dati.fattorino) righe.push(`RIDER: ${dati.fattorino.toUpperCase()}`);
        if (parseFloat(dati.supplemento_consegna) > 0) {
            righe.push(`SUPPL. CONSEGNA: EUR ${parseFloat(dati.supplemento_consegna).toFixed(2)}`);
        }
        righe.push("================================");
    }

    const serv = (dati.preferenza_servizio || '').trim().toLowerCase();
    if (serv === 'giro pizza' || serv === 'giropizza') righe.push("*** SERVIZIO: GIRO PIZZA ***");
    else if (serv === 'ristorante') righe.push("*** SERVIZIO: RISTORANTE ***");
    else if (serv === 'pizzeria') righe.push("*** SERVIZIO: PIZZERIA ***");
    else if (serv === 'misto') righe.push("*** SERVIZIO: MISTO ***");

    if (Array.isArray(dati.etichette)) {
        const haSenzaGlutine = dati.etichette.some(t => {
            const low = String(t || '').toLowerCase();
            return low.includes('senza glutine') || low.includes('glutine') || low.includes('celiac') || low.includes('gf');
        });
        if (haSenzaGlutine) {
            righe.push("================================");
            righe.push("   ATTENZIONE: SENZA GLUTINE    ");
            righe.push("================================");
        }
    }
    return righe.length > 0 ? righe.join("\n") + "\n" : "";
}

export function raggruppaProdotti(prodotti) {
    const raggruppati = [];
    if(!prodotti) return [];
    prodotti.forEach(p => {
        let cleanDet = p.dettagli || '';
        if(cleanDet === 'Normale') cleanDet = '';

        const key = (p.nome || 'Unknown') + '|' + cleanDet + '|' + (p.turno || 1);

        const esistente = raggruppati.find(x => x._groupKey === key);
        if(esistente) {
            esistente.qta += parseFloat(p.qta || 1);
        } else {
            raggruppati.push({
                ...p,
                qta: parseFloat(p.qta || 1),
                dettagli: cleanDet,
                _groupKey: key,
                turno: p.turno || 1
            });
        }
    });
    return raggruppati;
}

// Descrizione breve per la coda di stampa e la cassa (es. "Tavolo 5", "Rossi 20:30")
// Sezioni del menu aggiunte dal locale (id "sez_...", vedi categorie-menu.js): il loro reparto è quello
// in cui sono spuntate nelle stampanti (ctx.stampanti = impostazioni/stampanti). Le categorie di sempre
// seguono le regole fisse qui sotto e non cambiano. Stessa regola di repartoSezione in categorie-menu.js
// (copiata qui perché questo file gira anche sul server da solo).
function repartoSezione(cat, stampanti) {
    if (typeof cat !== 'string' || !/^sez_[a-z0-9_]{1,40}$/.test(cat) || !stampanti) return null;
    return ['pizzeria', 'cucina', 'bar'].find(r => Array.isArray(stampanti[r]?.cats) && stampanti[r].cats.includes(cat)) || null;
}

export const descrizioneStampa = (o) => o ? (o.tavolo ? `Tavolo ${o.tavolo}` : `${o.cognome || o.nome || ''} ${o.orario || ''}`.trim()) : '';

// Data di oggi (AAAA-MM-GG) nel fuso del locale (o del dispositivo): con toISOString sarebbe in UTC,
// e tra mezzanotte e l'una/le due gli ordini di oggi risulterebbero "PER IL" giorno dopo
const oggiISO = (ctx) => ctx.oggiISO || new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', ...(ctx.fuso ? { timeZone: ctx.fuso } : {}) }).format(ctx.adesso || new Date());
const righeServizio = (o, ctx) => (ctx.righeServizio || righeServizioCucina)(o);
function dataOraStampa(ctx) {
    const d = ctx.adesso || new Date();
    const opz = ctx.fuso ? { timeZone: ctx.fuso } : undefined;
    return `${d.toLocaleDateString('it-IT', opz)} ${d.toLocaleTimeString('it-IT', opz)}`;
}

// Comanda di un reparto (pizzeria, cucina, bar...) oppure conto/preconto dell'ordine.
// Restituisce { data, titolo } oppure null se il reparto non ha niente da stampare.
export function datiOrdine(o, reparto, config, ctx = {}) {
    const repKey = reparto.toLowerCase().trim();
    const isConto = (repKey === 'conto' || repKey === 'preconto');
    const PRINTER_CONFIG = config || {};

    const categorieAbilitate = (PRINTER_CONFIG[repKey] && PRINTER_CONFIG[repKey].cats) ? PRINTER_CONFIG[repKey].cats : [];
    const catsPiz = PRINTER_CONFIG['pizzeria']?.cats || [];
    const catsCuc = PRINTER_CONFIG['cucina']?.cats || [];

    const itemsToPrint = (o.prodotti || []).filter(p => {
        if (isConto) return true;
        let prodCat = (p.cat || 'varie').toLowerCase().trim();
        const isAsporto = !o.tavolo;
        if (categorieAbilitate.includes(prodCat)) return true;
        if (repKey === 'pizzeria' && isAsporto) return true;
        return false;
    });

    if(itemsToPrint.length === 0 && !isConto) return null;

    var data = [];
    data.push('\x1B\x40\x1B\x61\x01');
    let headerTitle = repKey === 'preconto' ? "PRECONTO" : (repKey === 'conto' ? "CONTO" : reparto.toUpperCase());
    data.push('\x1D\x21\x11\x1B\x45\x01' + headerTitle + '\n\x1D\x21\x00\x1B\x45\x00');
    if (isConto) data.push('DOCUMENTO NON FISCALE\n');
    if (!o.tavolo) {
        const oggiTopStr = oggiISO(ctx);
        if (o.data_ritiro && o.data_ritiro !== oggiTopStr) {
            const [y, m, d] = o.data_ritiro.split('-');
            let oraRitiro = o.orario ? o.orario : "--:--";
            data.push(`\x1D\x21\x11\x1B\x45\x01PER IL: ${d}/${m}/${y}\nORE: ${oraRitiro}\n\x1B\x45\x00\x1D\x21\x00`);
        } else {
            data.push('\x1D\x21\x11ASPORTO\n\x1D\x21\x00');
        }
    }

    // Stampa le 5 indicazioni operative per la Cucina/Pizzeria (Giro Pizza, Senza Glutine, Ristorante, Pizzeria, Misto)
    if (!isConto) {
        const infoServizio = righeServizio(o, ctx);
        if (infoServizio) {
            data.push('\x1B\x45\x01' + infoServizio + '\x1B\x45\x00');
        }
    }

    data.push('Op: ' + (o.operatore || 'Admin') + '\n--------------------------------\n\x1B\x61\x00');

    const byTurn = {};
    itemsToPrint.forEach(p => {
        const t = p.turno || 1;
        if(!byTurn[t]) byTurn[t] = [];
        byTurn[t].push(p);
    });

    const stampaListaProdotti = (lista) => {
        const compressedItems = raggruppaProdotti(lista);
        compressedItems.forEach(p => {
            let det = p.dettagli || '';
            if(det === 'Normale' || det === 'Manuale') det = '';
            if(det) det = det.replace(/<br\s*\/?>/gi, '\n   >>> ').replace(/<[^>]*>?/gm, '');

            const qtaDisplay = p.qta % 1 === 0 ? p.qta : p.qta.toFixed(3);
            let riga = `${qtaDisplay} x ${p.nome}`;

            if(isConto) {
                let prezzoTot = (parseFloat(p.prezzo) * parseFloat(p.qta)).toFixed(2);
                let strPrezzo = " E " + prezzoTot;
                let maxChars = 42;
                let spazio = maxChars - riga.length - strPrezzo.length;
                if(spazio > 0) riga += ' '.repeat(spazio) + strPrezzo;
                else riga = riga.substring(0, maxChars - strPrezzo.length) + strPrezzo;
            } else {
                data.push('\x1D\x21\x01');
            }
            data.push(riga + '\n');
            if(!isConto) data.push('\x1D\x21\x00');

            if(det) {
                if(isConto) data.push('   >>> ' + det + '\n');
                else data.push('\x1D\x21\x01   >>> ' + det + '\n\x1D\x21\x00');
            }
        });
    };

    Object.keys(byTurn).sort().forEach(turn => {
        const itemsDelTurno = byTurn[turn];
        if(!isConto) data.push(`\x1B\x45\x01--- TURNO ${turn} ---\n\x1B\x45\x00`);

        const allItemsInTurn = (o.prodotti || []).filter(p => (p.turno || 1) == turn);
        const hasPizzas = allItemsInTurn.some(p => catsPiz.includes((p.cat || '').toLowerCase().trim()));
        const hasKitchen = allItemsInTurn.some(p => catsCuc.includes((p.cat || '').toLowerCase().trim()));

        let mixMsg = "";
        if (repKey === 'pizzeria' && hasPizzas && hasKitchen) mixMsg = "*** CON CUCINA ***";
        if (repKey === 'cucina' && hasKitchen && hasPizzas) mixMsg = "*** CON PIZZERIA ***";

        if(mixMsg && !isConto) data.push(`\x1D\x21\x11\x1B\x45\x01${mixMsg}\n\x1D\x21\x00\x1B\x45\x00\n`);

        if(isConto) {
            const listPizzeria = [], listCucina = [], listBar = [], rest = [];
            itemsDelTurno.forEach(p => {
                const c = (p.cat || '').toLowerCase().trim();
                if (catsPiz.includes(c)) listPizzeria.push(p);
                else if (catsCuc.includes(c)) listCucina.push(p);
                else if (PRINTER_CONFIG['bar']?.cats?.includes(c)) listBar.push(p);
                else rest.push(p);
            });

            if(listCucina.length > 0) { data.push("--- RISTORANTE ---\n"); stampaListaProdotti(listCucina); }
            if(listPizzeria.length > 0) { data.push("--- PIZZERIA ---\n"); stampaListaProdotti(listPizzeria); }
            if(listBar.length > 0) { data.push("--- BAR ---\n"); stampaListaProdotti(listBar); }
            if(rest.length > 0) { data.push("--- VARIE ---\n"); stampaListaProdotti(rest); }
        } else {
            if (repKey === 'pizzeria' && !o.tavolo) {
                const listPizzeria = itemsDelTurno.filter(p => catsPiz.includes((p.cat || '').toLowerCase().trim()));
                const listCucina = itemsDelTurno.filter(p => !catsPiz.includes((p.cat || '').toLowerCase().trim()));
                if (listPizzeria.length > 0) stampaListaProdotti(listPizzeria);
                if (listCucina.length > 0) {
                    if (listPizzeria.length > 0) data.push('\n--------------------------------\n\x1B\x45\x01--- CUCINA E ALTRO ---\x1B\x45\x00\n');
                    stampaListaProdotti(listCucina);
                }
            } else {
                stampaListaProdotti(itemsDelTurno);
            }
        }
        if(!isConto) data.push('\n');
    });

    if(isConto) {
        const copertoUnit = ctx.prezzoCoperto || 2.50;
        if(o.coperti > 0) {
            const copTot = o.coperti * copertoUnit;
            data.push('------------------------------------------\n');
            data.push(`${o.coperti} x COPERTO` + ' '.repeat(15) + 'E ' + copTot.toFixed(2) + '\n');
        }
        data.push('------------------------------------------\n');

        let calcTotProdotti = (o.prodotti || []).reduce((acc, p) => acc + (parseFloat(p.prezzo) * parseFloat(p.qta)), 0);
        let calcTotaleReale = calcTotProdotti + ((o.coperti || 0) * copertoUnit);
        let totaleAttuale = parseFloat(o.totale || 0);
        let diffSconto = calcTotaleReale - totaleAttuale;

        let nomeSconto = o.sconto_applicato || ctx.nomeScontoAttivo;

        if (diffSconto > 0.01 || nomeSconto) {
            let labelSconto = nomeSconto ? nomeSconto.toUpperCase() : "MANUALE / ARROTOND.";
            if (diffSconto < 0) diffSconto = 0;
            data.push(`\x1B\x61\x01\x1D\x21\x01* SCONTO: ${labelSconto} *\n`);
            if (diffSconto > 0) data.push(`(- E ${diffSconto.toFixed(2)})\n`);
            data.push(`\x1D\x21\x00\x1B\x61\x00------------------------------------------\n`);
        }

        let tot = o.totale;
        data.push(`\x1B\x61\x01\x1B\x45\x01\x1D\x21\x11TOTALE: E ${parseFloat(tot).toFixed(2)}\n\x1D\x21\x00\x1B\x45\x00`);

        if (ctx.divisore && ctx.divisore > 1) {
            let quota = (parseFloat(tot) / ctx.divisore).toFixed(2);
            data.push(`\n\x1B\x61\x01\x1D\x21\x01\x1B\x45\x01Diviso in ${ctx.divisore}: E ${quota} a persona\n\x1B\x45\x00\x1D\x21\x00`);
        }
    }

    if(o.note_ordine) data.push(`\n\x1B\x45\x01NOTE: ${o.note_ordine}\n\x1B\x45\x00`);

    if (o.tavolo) {
        let strCoperti = (o.coperti && o.coperti > 0) ? ` (Cop: ${o.coperti})` : '';
        data.push(`\x1B\x61\x01\n\x1D\x21\x11\x1B\x45\x01TAVOLO ${o.tavolo}${strCoperti}\n\x1B\x45\x00\x1D\x21\x00\x1B\x61\x00\n`);
    } else {
        data.push('--------------------------------\n');
        data.push(`\x1D\x21\x11${(o.nome + ' ' + (o.cognome || '')).trim()}\n\x1D\x21\x00`);
        const oggiBotStr = oggiISO(ctx);
        if (o.data_ritiro && o.data_ritiro !== oggiBotStr) {
            const [y, m, d] = o.data_ritiro.split('-');
            let oraRitiro = o.orario ? o.orario : "--:--";
            data.push(`\x1D\x21\x11\x1B\x45\x01DATA: ${d}/${m}/${y}\nORE: ${oraRitiro}\n\x1B\x45\x00\x1D\x21\x00`);
        } else if (o.orario) {
            data.push(`\x1D\x21\x11\x1B\x45\x01RITIRO: ${o.orario}\n\x1B\x45\x00\x1D\x21\x00`);
        }
        if (!isConto) {
            let totaleAsporto = parseFloat(o.totale || 0).toFixed(2);
            data.push(`\n\x1B\x61\x01\x1D\x21\x11\x1B\x45\x01TOTALE: E ${totaleAsporto}\n\x1B\x45\x00\x1D\x21\x00\x1B\x61\x00\n`);
        }
    }
    // Consegna a domicilio: QR dell'ordine, che il rider scansiona dall'App Rider per prenderlo in carico
    data.push(...(ctx.qrDati ? ctx.qrDati(o) : datiQrConsegnaESC(o, ctx)));
    data.push(`\x1B\x61\x01\n${dataOraStampa(ctx)}\n\x1B\x64\x08\x1D\x56\x01`);
    return { data, titolo: headerTitle };
}

// Chiamata del turno ("VIA TURNO 2") per un reparto: null se il reparto non ha piatti in quel turno
export function datiChiamataTurno(o, rep, ctx = {}) {
    const messaggio = o.messaggio_cucina;

    const match = messaggio.match(/TURNO\s*(\d+)/i) || messaggio.match(/VIA\s*(\d+)/i);
    const targetTurn = match ? parseInt(match[1]) : null;

    if(!targetTurn) return null;

    const tuttiProdottiTurno = (o.prodotti || []).filter(p => parseInt(p.turno || 1) === targetTurn);
    if(tuttiProdottiTurno.length === 0) return null;

    const sezione = (p) => repartoSezione(p.cat, ctx.stampanti);
    const hasPizza = tuttiProdottiTurno.some(p => {
        if (sezione(p)) return sezione(p) === 'pizzeria';
        let c = (p.cat||'').toLowerCase();
        return c === 'pizza' || c === 'stirata' || c === 'gf' || c === 'speciale' || c === 'calzone' || c.includes('focac');
    });

    const hasCucina = tuttiProdottiTurno.some(p => {
        if (sezione(p)) return sezione(p) === 'cucina';
        let c = (p.cat||'').toLowerCase();
        return c === 'primo' || c === 'secondo' || c === 'contorno' || c === 'ant_ristorante' || c.includes('cuc') || c.includes('frit');
    });

    let mixMsg = "";
    if (rep === 'pizzeria' && hasCucina) mixMsg = "*** CON CUCINA ***";
    if (rep === 'cucina' && hasPizza) mixMsg = "*** CON PIZZERIA ***";

    const itemsToPrint = tuttiProdottiTurno.filter(p => {
        let cat = (p.cat || 'varie').toLowerCase();
        let gruppo = 'altro';
        if (sezione(p)) gruppo = sezione(p);
        else if (cat === 'pizza' || cat.includes('piz') || cat==='stirata' || cat==='gf' || cat==='speciale' || cat.includes('ant_pizz') || cat.includes('calz') || cat.includes('foc')) {
            gruppo = 'pizzeria';
        }
        else if (cat === 'primo' || cat.includes('prim') || cat.includes('sec') || cat.includes('cont') || cat.includes('dolc') || cat.includes('cuc') || cat.includes('ant_rist')) {
            gruppo = 'cucina';
        }
        else if (cat === 'bibita' || cat.includes('bib') || cat.includes('bar') || cat.includes('vin') || cat.includes('bir') || cat.includes('caf') || cat.includes('ama')) {
            gruppo = 'bar';
        }

        if (rep === 'pizzeria') return gruppo === 'pizzeria';
        if (rep === 'cucina') return gruppo === 'cucina';
        if (rep === 'bar') return gruppo === 'bar';
        return false;
    });

    if(itemsToPrint.length === 0) return null;

    let d = [];
    d.push('\x1B\x40');
    d.push('\x1B\x61\x01');
    d.push(rep.toUpperCase() + ' - CHIAMATA\n\n');

    d.push('\x1D\x21\x11');
    d.push('VAI COL ' + targetTurn + '\n\n');
    d.push('\x1D\x21\x00');

    if(mixMsg) {
        d.push('\x1D\x21\x11\x1B\x45\x01');
        d.push(mixMsg + '\n');
        d.push('\x1D\x21\x00\x1B\x45\x00');
    }

    // Stampa diciture operative Agenda (Giro Pizza, Senza Glutine, Ristorante, Pizzeria, Misto)
    const infoServizio = righeServizio(o, ctx);
    if (infoServizio) {
        d.push('\x1B\x45\x01' + infoServizio + '\x1B\x45\x00');
    }

    d.push('\n');
    d.push('\x1D\x21\x11');
    d.push('\x1B\x45\x01');
    let nomeTav = o.tavolo ? 'TAVOLO ' + o.tavolo : o.nome;
    if (o.tavolo && o.coperti > 0) nomeTav += ` (Cop: ${o.coperti})`;
    d.push(nomeTav + '\n');
    d.push('\x1B\x45\x00');
    d.push('\x1D\x21\x00');
    d.push('----------------\n\n\n\n');
    d.push('\x1B\x61\x00');

    let compressed = [];
    itemsToPrint.forEach(p => {
        let ex = compressed.find(c => c.nome === p.nome && c.dettagli === p.dettagli);
        if(ex) ex.qta += parseFloat(p.qta); else compressed.push({...p, qta: parseFloat(p.qta)});
    });

    compressed.forEach(p => {
        const qDisplay = p.qta % 1 === 0 ? p.qta : p.qta.toFixed(3);
        d.push(`\x1D\x21\x01${qDisplay} x ${p.nome}\n\n\x1D\x21\x00`);
        if(p.dettagli && p.dettagli!=='Normale') {
            d.push(`   > ${p.dettagli.replace(/<br\s*\/?>/gi, '\n   > ').replace(/<[^>]*>?/gm, '')}\n`);
        }
        d.push('\n');
    });

    d.push(`\n\n\x1B\x61\x01${dataOraStampa(ctx)}\n\x1B\x64\x08\x1D\x56\x01`);
    return d;
}

// Aggiornamento del tavolo per un reparto: storni, cambi turno e nuove aggiunte.
// null se non c'è niente per questo reparto.
export function datiAggiornamento(o, repKey, ctx = {}) {
    const aggiunte = o.ultime_aggiunte_real || [];
    const storni = o.ultimi_storni_real || [];
    const spostamenti = o.ultimi_spostamenti_real || [];

    const getGruppo = (cat) => {
        const rs = repartoSezione(cat, ctx.stampanti);
        if (rs) return rs.toUpperCase();
        cat = (cat || '').toLowerCase().trim();
        const catBar = ['bibita', 'birra', 'vino', 'caffe', 'amaro', 'liquore', 'bibita_lattina', 'bibita_bottiglia', 'acqua', 'bar'];
        if (catBar.includes(cat) || cat.includes('bar') || cat.includes('bib')) return 'BAR';
        if (cat === 'ant_pizzeria' || cat.includes('antipasto') || cat.includes('ant_')) return 'CUCINA';
        const catPizzeria = ['pizza', 'stirata', 'gf', 'speciale', 'calzone', 'focaccia', 'covaccino', 'panino'];
        if (catPizzeria.includes(cat) || cat.includes('piz') || cat.includes('stira')) return 'PIZZERIA';
        return 'CUCINA';
    };

    const deveStampare = (p) => {
        const gruppoProdotto = getGruppo(p.cat);
        const isAsporto = !o.tavolo;
        const isGF = (p.cat === 'gf');

        if (repKey === 'pizzeria') {
            if (gruppoProdotto === 'PIZZERIA') return true;
            if (isAsporto && (gruppoProdotto === 'CUCINA' || gruppoProdotto === 'BAR')) return true;
            return false;
        }
        if (repKey === 'cucina') {
            if (isGF) return true;
            if (gruppoProdotto === 'CUCINA') return true;
            return false;
        }
        if (repKey === 'bar' && gruppoProdotto === 'BAR') return true;
        return false;
    };

    const aggiunteFiltrate = aggiunte.filter(deveStampare);
    const storniFiltrati = storni.filter(deveStampare);
    const spostamentiFiltrati = spostamenti.filter(deveStampare);

    if (aggiunteFiltrate.length === 0 && storniFiltrati.length === 0 && spostamentiFiltrati.length === 0) return null;

    var data = [];
    data.push('\x1B\x40\x1B\x61\x01');
    data.push('*** AGGIORNAMENTO ***\n');
    let headTav = o.tavolo ? 'TAVOLO ' + o.tavolo : (o.nome || 'ASPORTO');
    if (o.tavolo && o.coperti > 0) headTav += ` (Cop: ${o.coperti})`;
    data.push('\x1D\x21\x11' + headTav + '\n\x1D\x21\x00');

    const infoServizio = righeServizio(o, ctx);
    if (infoServizio) {
        data.push('\x1B\x45\x01' + infoServizio + '\x1B\x45\x00');
    }

    data.push('Op: ' + (o.operatore || 'Cameriere') + '\n--------------------------------\n\x1B\x61\x00');

    const stampaRiga = (p, extraInfo = "") => {
        let det = p.dettagli || '';
        if(det === 'Normale' || det === 'Manuale') det = '';
        if(det) det = det.replace(/<br\s*\/?>/gi, '\n   >>> ').replace(/<[^>]*>?/gm, '');
        const q = p.qta % 1 === 0 ? p.qta : p.qta.toFixed(3);
        data.push(`\x1D\x21\x01${q} x ${p.nome}${extraInfo}\n\x1D\x21\x00`);
        if(det) data.push(`   >>> ${det}\n`);
    };

    if (storniFiltrati.length > 0) {
        data.push('\x1B\x61\x01\x1B\x45\x01\n!!! STORNO (ANNULLARE) !!!\n\x1B\x45\x00\x1B\x61\x00--------------------------------\n');
        storniFiltrati.forEach(p => stampaRiga(p));
    }

    if (spostamentiFiltrati.length > 0) {
        if (storniFiltrati.length > 0) data.push('\n');
        data.push('\x1B\x61\x01\x1B\x45\x01\n<<< CAMBIO TURNO >>>\n\x1B\x45\x00\x1B\x61\x00--------------------------------\n');
        spostamentiFiltrati.forEach(p => { stampaRiga(p, ` (DA T${p.oldTurn} A T${p.newTurn})`); });
    }

    if (aggiunteFiltrate.length > 0) {
        if (storniFiltrati.length > 0 || spostamentiFiltrati.length > 0) data.push('\n');
        data.push('\x1B\x61\x01\x1B\x45\x01\n+++ NUOVE AGGIUNTE +++\n\x1B\x45\x00\x1B\x61\x00--------------------------------\n');

        const byTurn = {};
        aggiunteFiltrate.forEach(p => {
            const t = p.turno || 1;
            if(!byTurn[t]) byTurn[t] = [];
            byTurn[t].push(p);
        });

        const raggruppaLocal = (list) => {
            const ragg = [];
            list.forEach(p => {
                let cd = p.dettagli||''; if(cd==='Normale'||cd==='Manuale') cd='';
                const k = `${p.nome}|${cd}|${p.prezzo}|${p.turno}`;
                const ex = ragg.find(r=>`${r.nome}|${(r.dettagli||'').replace(/(Normale|Manuale)/g,'')}|${r.prezzo}|${r.turno}`===k);
                if(ex) ex.qta += parseFloat(p.qta); else ragg.push({...p, qta:parseFloat(p.qta)});
            });
            return ragg;
        };

        Object.keys(byTurn).sort().forEach(turn => {
            const itemsDelTurno = byTurn[turn];
            const allItemsInTurn = aggiunte.filter(p => (p.turno || 1) == turn);
            const hasPizzas = allItemsInTurn.some(p => getGruppo(p.cat) === 'PIZZERIA');
            const hasKitchen = allItemsInTurn.some(p => getGruppo(p.cat) === 'CUCINA');

            let mixMsg = "";
            if (repKey === 'pizzeria' && hasPizzas && hasKitchen) mixMsg = "*** CON CUCINA ***";
            if (repKey === 'cucina' && hasKitchen && hasPizzas) mixMsg = "*** CON PIZZERIA ***";

            if(Object.keys(byTurn).length > 1) data.push(`--- T${turn} ---\n`);
            if(mixMsg) data.push(`\x1D\x21\x11\x1B\x45\x01${mixMsg}\n\x1D\x21\x00\x1B\x45\x00\n`);

            if (repKey === 'pizzeria' && !o.tavolo) {
                const listPizze = itemsDelTurno.filter(p => getGruppo(p.cat) === 'PIZZERIA');
                const listCucina = itemsDelTurno.filter(p => getGruppo(p.cat) !== 'PIZZERIA');

                if (listPizze.length > 0) raggruppaLocal(listPizze).forEach(p => stampaRiga(p, ` [T${turn}]`));
                if (listCucina.length > 0) {
                    if (listPizze.length > 0) data.push('\n\x1B\x45\x01--- DA CUCINA ---\x1B\x45\x00\n');
                    raggruppaLocal(listCucina).forEach(p => stampaRiga(p, ` [T${turn}]`));
                }
            } else {
                raggruppaLocal(itemsDelTurno).forEach(p => stampaRiga(p, ` [T${turn}]`));
            }
        });
    }

    data.push(`\n\n\x1B\x61\x01${dataOraStampa(ctx)}\n\x1B\x64\x08\x1D\x56\x01`);
    return data;
}

// Messaggio alla cucina di un ordine (VIA TURNO, AGGIUNTA, STORNO, CAMBIO TURNO) per un reparto.
// Restituisce { data, encoding } oppure null se il reparto non deve stampare niente.
export function datiMessaggioCucina(o, repKey, ctx = {}) {
    const messaggio = o && o.messaggio_cucina;
    if (!messaggio) return null;
    // Sala e cassa scrivono "CAMBIO TURNO: ..." quando un piatto passa a un altro turno
    const aggiornamento = ["AGGIUNTA", "STORNO", "SPOSTAMENTO", "CAMBIO TURNO"].some(k => messaggio.includes(k));
    if (messaggio.includes("VIA") && !aggiornamento) {
        if (messaggio.includes("TURNO")) {
            const d = datiChiamataTurno(o, repKey, ctx);
            return d ? { data: d } : null;
        }
    }
    if (!aggiornamento) return null;
    const d = datiAggiornamento(o, repKey, ctx);
    return d ? { data: d, encoding: 'windows-1252' } : null;
}
