import { getFirestore, collection as _collection, query, onSnapshot, doc as _doc, updateDoc, deleteDoc, addDoc, getDoc, getDocs, setDoc, orderBy, where, serverTimestamp, arrayUnion, increment, writeBatch } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getStorage, ref, uploadBytesResumable, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { verificaAccountLocale } from "./login-dispositivo.js";
import { calcolaConsegna } from "./zone-consegna.js";
import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";

// --- CONFIGURAZIONE PROGETTO FIREBASE ---
const firebaseConfig = {
    apiKey: "AIzaSyDjNba4HvtDZpcoDfnXTOWysn_i1UFwPWU", 
    authDomain: "gestionale-ristoranti-96c5b.firebaseapp.com",
    projectId: "gestionale-ristoranti-96c5b",
    storageBucket: "gestionale-ristoranti-96c5b.firebasestorage.app",
    messagingSenderId: "234695436534",
    appId: "1:234695436534:web:2d4cfc9ddbc1f1de9824d7"
};

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);
const auth = getAuth(app);

// --- ROUTER MULTI-TENANT AUTOMATICO (Isola ogni ristorante creato da SuperAdmin) ---
const _urlParams = new URLSearchParams(window.location.search);
if (_urlParams.has('locale')) {
    window.TENANT_ID = _urlParams.get('locale') || 'default';
    localStorage.setItem('saas_tenant_id', window.TENANT_ID);
} else {
    window.TENANT_ID = window.TENANT_ID || localStorage.getItem('saas_tenant_id') || 'default';
}

const collection = (database, ...pathSegments) => {
    if (window.TENANT_ID && window.TENANT_ID !== 'default' && pathSegments[0] !== 'ristoranti' && pathSegments[0] !== 'saas_clienti') {
        return _collection(database, 'ristoranti', window.TENANT_ID, ...pathSegments);
    }
    return _collection(database, ...pathSegments);
};

const doc = (database, ...pathSegments) => {
    if (window.TENANT_ID && window.TENANT_ID !== 'default' && pathSegments[0] !== 'ristoranti' && pathSegments[0] !== 'saas_clienti') {
        return _doc(database, 'ristoranti', window.TENANT_ID, ...pathSegments);
    }
    return _doc(database, ...pathSegments);
};

window.nomeLocaleCorrenteCassa = window.TENANT_ID === 'default'
    ? 'DA MIMMO'
    : window.TENANT_ID.replace(/-/g, ' ').toUpperCase();

// --- CONTROLLO STATO LICENZA E BLOCCO CASSA IN TEMPO REALE ---
function attivaControlloLicenzaCassa() {
    const licRef = doc(db, "impostazioni", "licenza");

    onSnapshot(licRef, (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            const btnTopKds = document.getElementById('btn-top-kds');
            const lockIcon = document.getElementById('kds-lock-icon');
            const kdsLockedUi = document.getElementById('kds-locked-ui');
            const kdsUnlockedUi = document.getElementById('kds-unlocked-ui');

            if (btnTopKds) btnTopKds.style.display = 'inline-block';
            if (data.kds_sbloccato === false || (data.moduli && data.moduli.kds === false)) {
                if (lockIcon) lockIcon.style.display = 'inline-block';
                if (kdsLockedUi) kdsLockedUi.style.display = 'block';
                if (kdsUnlockedUi) kdsUnlockedUi.style.display = 'none';
            } else {
                if (lockIcon) lockIcon.style.display = 'none';
                if (kdsLockedUi) kdsLockedUi.style.display = 'none';
                if (kdsUnlockedUi) kdsUnlockedUi.style.display = 'block';
            }

            if (data.attiva === false || (data.moduli && data.moduli.cassa === false)) {
                const msg = data.messaggio_blocco || "Abbonamento scaduto o licenza sospesa. Contatta l'assistenza per il rinnovo.";
                const contatto = data.contatto_assistenza || "Contatta l'amministratore";
                const lockOverlay = document.getElementById('cassa-license-lock');
                if (lockOverlay) {
                    document.getElementById('cassa-lock-msg').innerText = msg;
                    document.getElementById('cassa-lock-contact').innerText = `📞 Assistenza: ${contatto}`;
                    lockOverlay.style.display = 'flex';
                }
            }
        }
    });
}

attivaControlloLicenzaCassa();

// --- VARIABILI GLOBALI ---
let audioOn = true, printerOn = true, ordiniCache = [], activeListener = null, currentDateView = new Date();
window.ordiniFuturiCache = [];
window.prezzoCopertoLocale = 2.50;
window.supplementoConsegnaLocale = 2.00;
let PRINTER_CONFIG = { pizzeria: {ip:'', cats:[]}, cucina: {ip:'', cats:[]}, bar: {ip:'', cats:[]}, conto: {ip:''}, preconto: {ip:''} };
let printedViaCache = new Set();
let ALL_RIMOZIONI_CACHE = [];
window.notifiedMessages = new Set();

window.lastViaCalls = {}; 
window.currentPayOrderId = null;
window.currentPayTotal = 0;
window.activeDiscount = null; 
window.SCONTI_CACHE = [];

let tempAddList = new Set();
let tempRemList = new Set();
let stirataContext = ''; 
let printQueue = [];
let printingNow = false;
let initAvviato = false;

window.isPrintServer = localStorage.getItem('is_print_server') === 'true';
window.orariApertiTendina = new Set();
window.ordiniPerOrarioMap = {};

// ============================================================================
// FUNZIONI GLOBALI AGENDA -> CASSA (BADGE CARD, FOTO ALLEGATO E STAMPA 5 VOCI)
// ============================================================================
window.apriAllegatoAgendaInCassa = (base64Img, nomeCli) => {
    Swal.fire({
        title: `📎 Allegato - ${(nomeCli || 'Cliente').toUpperCase()}`,
        html: `<img src="${base64Img}" style="max-width:100%; max-height:70vh; border-radius:10px; box-shadow:0 4px 15px rgba(0,0,0,0.4);">`,
        background: '#1e1e1e',
        color: '#fff',
        confirmButtonColor: '#2962ff',
        confirmButtonText: 'Chiudi'
    });
};

window.generaBadgeAgendaPerCassa = (o) => {
    if (!o) return "";
    let badges = [];

    const serv = (o.preferenza_servizio || '').trim().toLowerCase();
    if (serv === 'giro pizza' || serv === 'giropizza') {
        badges.push(`<span style="background:#00c853; color:#000; padding:3px 8px; border-radius:6px; font-size:0.75em; font-weight:900;">🍕 GIRO PIZZA</span>`);
    } else if (serv === 'ristorante') {
        badges.push(`<span style="background:#0288d1; color:#fff; padding:3px 8px; border-radius:6px; font-size:0.75em; font-weight:900;">🍽️ RISTORANTE</span>`);
    } else if (serv === 'pizzeria') {
        badges.push(`<span style="background:#ff6d00; color:#fff; padding:3px 8px; border-radius:6px; font-size:0.75em; font-weight:900;">🔥 PIZZERIA</span>`);
    } else if (serv === 'misto') {
        badges.push(`<span style="background:#8e24aa; color:#fff; padding:3px 8px; border-radius:6px; font-size:0.75em; font-weight:900;">⚖️ MISTO</span>`);
    }

    if (o.area) {
        badges.push(`<span style="background:#334155; color:#fff; padding:3px 8px; border-radius:6px; font-size:0.75em; font-weight:800;">📍 ${o.area}</span>`);
    }

    if (Array.isArray(o.etichette) && o.etichette.length > 0) {
        o.etichette.forEach(t => {
            const low = String(t || '').toLowerCase();
            if (low.includes('senza glutine') || low.includes('glutine') || low.includes('celiac') || low.includes('gf')) {
                badges.push(`<span style="background:#ffea00; color:#b71c1c; border:1px solid #f44336; padding:3px 8px; border-radius:6px; font-size:0.75em; font-weight:900;">🌾 SENZA GLUTINE</span>`);
            } else {
                badges.push(`<span style="background:#475569; color:#fff; padding:3px 8px; border-radius:6px; font-size:0.73em; font-weight:700;">${t}</span>`);
            }
        });
    }

    if (o.allegato_base64) {
        const safeImg = o.allegato_base64.replace(/'/g, "\\'");
        const safeNome = (o.nome || 'Cliente').replace(/'/g, "\\'");
        badges.push(`
            <button onclick="event.stopPropagation(); window.apriAllegatoAgendaInCassa('${safeImg}', '${safeNome}')" 
                    style="background:#9333ea; color:#fff; border:none; padding:3px 9px; border-radius:6px; font-size:0.75em; font-weight:900; cursor:pointer; display:inline-flex; align-items:center; gap:4px;">
                <i class="fa fa-paperclip"></i> Foto
            </button>
        `);
    }

    return badges.length > 0 
        ? `<div class="cassa-agenda-badges" style="display:flex; flex-wrap:wrap; gap:5px; padding:6px 10px; background:#f1f5f9; border-bottom:1px solid #cbd5e1;">${badges.join('')}</div>` 
        : '';
};

window.getRigheStampaCucinaFiltrate = (o) => {
    if (!o) return "";
    let righe = [];
    const serv = (o.preferenza_servizio || '').trim().toLowerCase();
    if (serv === 'giro pizza' || serv === 'giropizza') righe.push("*** SERVIZIO: GIRO PIZZA ***");
    else if (serv === 'ristorante') righe.push("*** SERVIZIO: RISTORANTE ***");
    else if (serv === 'pizzeria') righe.push("*** SERVIZIO: PIZZERIA ***");
    else if (serv === 'misto') righe.push("*** SERVIZIO: MISTO ***");

    if (Array.isArray(o.etichette)) {
        const haSenzaGlutine = o.etichette.some(t => {
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
};

// --- SIDEBAR ORARI ASPORTO CON TENDINA COGNOMI E NUMERO PIZZE ---
window.generaSidebarOrari = () => {
    let orari = [];
    for (let h = 19; h <= 22; h++) {
        for (let m = 0; m < 60; m += 5) {
            if (h === 19 && m < 30) continue;
            if (h === 22 && m > 30) continue;
            orari.push(`${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`);
        }
    }

    let totPizzeAssolute = 0;
    let totPizzeInAttesa = 0;
    let orariMap = {};
    window.ordiniPerOrarioMap = {};

    orari.forEach(ora => {
        orariMap[ora] = 0;
        window.ordiniPerOrarioMap[ora] = [];
    });

    const categoriePizze = ['pizza', 'stirata', 'gf', 'speciale', 'calzone', 'focaccia', 'panino', 'covaccino'];

    ordiniCache.forEach(o => {
        if (o.stato !== 'Annullato' && o.tipo !== 'SALA' && !o.tavolo) {
            let pizzeInQuestoOrdine = 0;
            let listaPizzeCliente = [];

            (o.prodotti || []).forEach(p => {
                let cat = (p.cat || '').toLowerCase().trim();
                if (categoriePizze.includes(cat)) {
                    let q = parseFloat(p.qta || 1);
                    pizzeInQuestoOrdine += q;
                    listaPizzeCliente.push(`${q}x ${p.nome}`);
                }
            });

            if (pizzeInQuestoOrdine > 0) {
                totPizzeAssolute += pizzeInQuestoOrdine;

                if (o.stato !== 'Completato' && o.stato !== 'Consegnato') {
                    totPizzeInAttesa += pizzeInQuestoOrdine;
                    const oraOrd = o.orario || '--:--';

                    if (orariMap[oraOrd] === undefined) {
                        orari.push(oraOrd);
                        orariMap[oraOrd] = 0;
                        window.ordiniPerOrarioMap[oraOrd] = [];
                    }

                    orariMap[oraOrd] += pizzeInQuestoOrdine;
                    const cognomeNome = ((o.cognome || '') + ' ' + (o.nome || '')).trim() || (o.cliente?.nome || 'Cliente');
                    window.ordiniPerOrarioMap[oraOrd].push({
                        id: o.id,
                        cliente: cognomeNome,
                        pizze: Math.round(pizzeInQuestoOrdine),
                        dettaglioPizze: listaPizzeCliente.join(', '),
                        stato: o.stato
                    });
                }
            }
        }
    });

    orari.sort();

    let htmlSidebar = `
        <div style="background:#222; border: 1px solid #444; color:white; padding:15px; border-radius:10px; position:sticky; top:15px; max-height: 85vh; overflow-y: auto;">
            <h3 style="margin-top:0; text-align:center; border-bottom:1px solid #555; padding-bottom:10px; font-size:1.1em; color:#ffb300;">
                <i class="fa-solid fa-box"></i> PIZZE ASPORTO
            </h3>
            
            <div style="display:flex; gap:10px; margin-bottom:15px;">
                <div style="flex:1; text-align:center; background: #111; padding: 8px; border-radius: 8px; border: 1px solid var(--primary);">
                    <div style="font-size:0.7em; color:#aaa; font-weight:bold;">TOT. OGGI</div>
                    <div style="font-size:1.8em; font-weight:900; color:white;">${Math.round(totPizzeAssolute)}</div>
                </div>
                <div style="flex:1; text-align:center; background: var(--gold); padding: 8px; border-radius: 8px; box-shadow: 0 4px 10px rgba(255,234,0,0.2);">
                    <div style="font-size:0.7em; color:black; font-weight:bold;">DA FARE</div>
                    <div style="font-size:1.8em; font-weight:900; color:black;">${Math.round(totPizzeInAttesa)}</div>
                </div>
            </div>
    `;

    orari.forEach(ora => {
        let conteggioPizze = orariMap[ora] || 0;
        let clientiOra = window.ordiniPerOrarioMap[ora] || [];
        let isOpen = window.orariApertiTendina.has(ora);
        let safeId = ora.replace(/[^a-zA-Z0-9]/g, '_');
        
        let color = '#888';
        let bg = 'transparent';
        let border = '1px solid #333';
        
        if (conteggioPizze > 0) { color = '#fff'; bg = 'rgba(255,255,255,0.04)'; }
        if (conteggioPizze >= 5) { color = '#ff9800'; bg = 'rgba(255, 152, 0, 0.12)'; border = '1px solid rgba(255, 152, 0, 0.35)'; } 
        if (conteggioPizze >= 10) { color = '#f44336'; bg = 'rgba(244, 67, 54, 0.15)'; border = '1px solid rgba(244, 67, 54, 0.4)'; } 

        let tendinaHtml = '';
        if (clientiOra.length > 0) {
            tendinaHtml = `
                <div id="tendina-ora-${safeId}" style="display:${isOpen ? 'block' : 'none'}; background:#151515; border:1px solid #444; border-top:none; border-radius:0 0 6px 6px; padding:6px 8px; margin-top:-4px; margin-bottom:6px;">
                    ${clientiOra.map(c => `
                        <div onclick="window.apriModifica('${window.safeId(c.id)}')" title="${window.escapeHtml(c.dettaglioPizze)} (Clicca per aprire)" style="display:flex; justify-content:space-between; align-items:center; padding:5px 4px; border-bottom:1px dashed #333; font-size:0.85em; cursor:pointer; color:#eee;">
                            <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:135px;">👤 <b>${window.escapeHtml(c.cliente)}</b></span>
                            <span style="background:#ffb300; color:#000; font-weight:900; padding:1px 6px; border-radius:4px; font-size:0.85em;">${c.pizze} pz</span>
                        </div>
                    `).join('')}
                </div>
            `;
        }

        htmlSidebar += `
            <div onclick="window.toggleTendinaOrario('${ora}')" style="display:flex; justify-content:space-between; align-items:center; padding:10px 8px; border:${border}; background:${bg}; color:${color}; font-weight:${conteggioPizze > 0 ? 'bold' : 'normal'}; border-radius:4px; margin-bottom:4px; cursor:${conteggioPizze > 0 ? 'pointer' : 'default'}; user-select:none;">
                <span><i class="fa-regular fa-clock"></i> ${ora} ${conteggioPizze > 0 ? `<i id="arrow-ora-${safeId}" class="fa-solid fa-chevron-${isOpen ? 'up' : 'down'}" style="font-size:0.75em; margin-left:4px; color:#ffb300;"></i>` : ''}</span>
                <span style="font-size:1.1em;">${Math.round(conteggioPizze)} <i class="fa-solid fa-pizza-slice" style="font-size:0.8em; margin-left:3px;"></i></span>
            </div>
            ${tendinaHtml}
        `;
    });

    htmlSidebar += `</div>`;
    return htmlSidebar;
};

window.toggleTendinaOrario = (ora) => {
    const clientiOra = window.ordiniPerOrarioMap[ora] || [];
    if (clientiOra.length === 0) return;

    const safeId = ora.replace(/[^a-zA-Z0-9]/g, '_');
    const el = document.getElementById(`tendina-ora-${safeId}`);
    const arrow = document.getElementById(`arrow-ora-${safeId}`);

    if (window.orariApertiTendina.has(ora)) {
        window.orariApertiTendina.delete(ora);
        if (el) el.style.display = 'none';
        if (arrow) arrow.className = 'fa-solid fa-chevron-down';
    } else {
        window.orariApertiTendina.add(ora);
        if (el) el.style.display = 'block';
        if (arrow) arrow.className = 'fa-solid fa-chevron-up';
    }
};

document.addEventListener("DOMContentLoaded", () => {
    const btn = document.getElementById('switch-print-server');
    if(btn) btn.checked = window.isPrintServer;
});

window.togglePrintServer = (val) => {
    window.isPrintServer = val;
    localStorage.setItem('is_print_server', val);
    if(val) {
        Swal.fire("Server di Stampa ATTIVATO", "Questo PC stamperà automaticamente gli ordini dei camerieri.", "success");
    } else {
        Swal.fire("Server di Stampa DISATTIVATO", "Le stampe automatiche sono spente.", "info");
    }
};

const ALL_CATS = [ 'ant_pizzeria', 'ant_ristorante', 'pizza', 'speciale', 'stirata', 'gf', 'primo', 'secondo', 'contorno', 'pescato', 'dolce', 'bibita', 'bibita_lattina', 'bibita_bottiglia', 'birra', 'vino', 'amaro' ];
const CATEGORY_LABELS = { 'pizza': 'Pizze', 'stirata': 'Stirate', 'antipasto': 'Antipasti', 'gf': 'Gluten Free', 'bibita': 'Bibite', 'bibita_lattina': 'Lattine', 'bibita_bottiglia': 'Bottiglie', 'birra': 'Birre', 'speciale': 'Speciali', 'ant_pizzeria': 'Ant. Pizzeria', 'ant_ristorante': 'Ant. Ristorante', 'primo': 'Primi', 'secondo': 'Secondi', 'contorno': 'Contorni', 'pescato': 'Pescato', 'dolce': 'Dolci', 'vino': 'Vini', 'amaro': 'Amari/Caffè' };
let editingProdId = null, mappaProdotti = {}, prodottiPerCategoria = {};
let currentBackOfficeCat = 'pizza';
let editingRimozioneId = null; 
let mappaRimozioni = {}; 
let editingIngredientId = null; 
let mappaIngredienti = {}; 

let currentEditOrderId = null;
let currentEditProducts = [];
let newOrderType = 'asporto';
let tempNewOrderItems = []; 
let editingProductIndex = null; 
let tempItem = {}; 
window.modificationContext = ''; 

const ALLERGENI_DATA = [ { name: "Glutine", icon: "fa-wheat-awn" }, { name: "Latte", icon: "fa-cow" }, { name: "Uova", icon: "fa-egg" }, { name: "Pesce", icon: "fa-fish" }, { name: "Crostacei", icon: "fa-shrimp" }, { name: "Frutta a guscio", icon: "fa-cookie" }, { name: "Arachidi", icon: "fa-jar" }, { name: "Soia", icon: "fa-leaf" }, { name: "Sedano", icon: "fa-carrot" }, { name: "Senape", icon: "fa-bottle-droplet" }, { name: "Sesamo", icon: "fa-seedling" }, { name: "Solfiti", icon: "fa-wine-glass" }, { name: "Lupini", icon: "fa-circle-dot" }, { name: "Molluschi", icon: "fa-worm" }, { name: "Surgelato ❄️", icon: "fa-snowflake" }, { name: "Congelato 🧊", icon: "fa-icicles" } ];

const baseTables = Array.from({length: 50}, (_, i) => (i + 1).toString());
window.biGustoData = { h1: {id:null, name:'', price:0, extraPrice:0, details:[]}, h2: {id:null, name:'', price:0, extraPrice:0, details:[]} };

// --- LOGIN REALE E SICURO (Senza sovrascrivere il nome del locale) ---
window.checkLogin = async () => {
    const email = document.getElementById('email-input').value.trim();
    const password = document.getElementById('pin-input').value.trim();
    
    if(!email || !password) {
        return Swal.fire("Attenzione", "Inserisci email e password", "warning");
    }

    try {
        Swal.fire({ title: 'Autenticazione in corso...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        sessionStorage.removeItem('cassa_manual_logout');
        await signInWithEmailAndPassword(auth, email, password);
        
        document.getElementById('login-overlay').style.display = 'none';
        sessionStorage.setItem('operatore_corrente', 'ADMIN');
        if(document.getElementById('nome-locale-ui')) {
            document.getElementById('nome-locale-ui').innerText = `${window.nomeLocaleCorrenteCassa} - CASSA`;
        }
        
        if(typeof playSound === 'function') playSound(); 
        Swal.fire({icon:'success', title:'Benvenuto, ADMIN!', timer:1500, showConfirmButton:false, background:'#333', color:'white'});
        
        document.getElementById('email-input').value = "";
        document.getElementById('pin-input').value = "";
        
    } catch (error) {
        console.error(error);
        Swal.fire("Accesso Negato", "Email o Password errati.", "error");
    }
};

// --- CONTROLLO AUTOMATICO SESSIONE (Rispetta sempre il nome del ristorante selezionato) ---
onAuthStateChanged(auth, async (user) => {
    // Solo gli account email/password del personale (i clienti dell'App Clienti usano l'SMS)
    if (user && user.providerData.some(p => p.providerId === 'password')) {
        if (document.getElementById('login-overlay')) document.getElementById('login-overlay').style.display = 'none';
        // Account collegato a un locale dal Super Admin: apre il locale giusto o blocca se non abilitato
        if (!(await verificaAccountLocale(user))) return;
        sessionStorage.setItem('operatore_corrente', 'ADMIN');
        if(document.getElementById('nome-locale-ui')) {
            document.getElementById('nome-locale-ui').innerText = `${window.nomeLocaleCorrenteCassa} - CASSA`;
        }
        if (!initAvviato) init();
    } else {
        // Nessun accesso automatico: il dispositivo entra una volta con l'account del locale e Firebase lo ricorda
        if (document.getElementById('login-overlay')) document.getElementById('login-overlay').style.display = 'flex';
    }
});

// --- EFFETTI SONORI ---
function playSound() {
    if(!audioOn) return;
    const audio = document.getElementById('audio-ding');
    if(audio) {
        audio.currentTime = 0;
        audio.play().catch(e => console.log("Audio bloccato dal browser", e));
    }
}
window.triggerTabBlink = (tabName) => {
    const btn = document.querySelector(`.tab-${tabName}`);
    if(btn) {
        btn.classList.add('tab-blink');
        setTimeout(() => {
            btn.classList.remove('tab-blink');
        }, 5000); 
    }
};

function showToast(msg) {
    const t = document.getElementById('debug-toast');
    if (!t) return;
    t.innerText = msg;
    t.style.display = 'block';
    setTimeout(() => { t.style.display = 'none'; }, 3000);
}

async function init() {
    if (initAvviato) return;
    initAvviato = true;

    // --- INIZIALIZZAZIONE QZ TRAY CON TUA FIRMA DIGITALE ---
    if (typeof qz !== 'undefined') {
        qz.security.setCertificatePromise(function(resolve, reject) {
            resolve(`-----BEGIN CERTIFICATE-----
MIIEATCCAumgAwIBAgIUUOByLMo9aFRLSoWmvvr0daXnPkkwDQYJKoZIhvcNAQEL
BQAwgY8xCzAJBgNVBAYTAml0MREwDwYDVQQIDAhDYWxhYnJpYTEYMBYGA1UEBwwP
cmVnZ2lvIGNhbGFicmlhMSEwHwYDVQQKDBhJbnRlcm5ldCBXaWRnaXRzIFB0eSBM
dGQxMDAuBgNVBAMMJ3BpenplcmlhZGFtaW1tby1hc3BvcnRvLmZpcmViYXNlYXBw
LmNvbTAeFw0yNjAyMjMxNjI5MjVaFw0zNjAyMjExNjI5MjVaMIGPMQswCQYDVQQG
EwJpdDERMA8GA1UECAwIQ2FsYWJyaWExGDAWBgNVBAcMD3JlZ2dpbyBjYWxhYnJp
YTEhMB8GA1UECgwYSW50ZXJuZXQgV2lkZ2l0cyBQdHkgTHRkMTAwLgYDVQQDDCdw
aXp6ZXJpYWRhbWltbW8tYXNwb3J0by5maXJlYmFzZWFwcC5jb20wggEiMA0GCSqG
SIb3DQEBAQUAA4IBDwAwggEKAoIBAQCoyxhStRgBKClrbkEAU7GokYCFgXqIUZhe
ak21WA6aiP+80uFVu5bWzIYehsybqjdJ2SU5XWrI1iI9ZRHCrFBOJ3kdWiK+5g7/
rYK3+ftO8+PsviH2A0DjEcPmV/b/snF9ulMO8ixLnLPeF+noMysPdwCEGvZz3lSE
nWJlpVuRTe7IzzPHLQcqq4+KL3hwImlPdZIrEDMP66QMWh4J0bnpQKXjt7oIIPdq
ktYi1AntHm0mkArGYfTaa3SuRBtbxG6iWWhsuPVxWSiyOHaqLBayI/hrH2hSf2Sm
xcQmGGVGIbAv/LMQqTmNNNjhj/PXQsRNTQrYoY4kqsB5a3ob7yUFAgMBAAGjUzBR
MB0GA1UdDgQWBBT5QwZ9oVixcGbQHgGsZG4cd3kjYDAfBgNVHSMEGDAWgBT5QwZ9
oVixcGbQHgGsZG4cd3kjYDAPBgNVHRMBAf8EBTADAQH/MA0GCSqGSIb3DQEBCwUA
A4IBAQCQpy4AI78IPSFvzQ5ail+68ZAwMRvtxy3oD240RbKrJx8Q8OpD9pM9enxH
K2y8gWMEaYfOi0aPjWQIUlNlHiEv7HeJUIKmJETd9WdqQCR25zlTNXEJIrJZ+fW5
GnCNtJiEMXm4F0kWSmBlvfKz3bCjb18BIiIXDPxFGukOhBdaeilKoorEtISKhhNP
H6NA1NeQAhTb0ekRHify29+849xUpEDrpycQeoXtHeA/oklUILg728fA1XapBZi1
tXK3v8mkk/+Kz/KfD+pjJ1MvRtl9q8f1zAHOz0KYUBaCL+BCwG1ilPmEd4UYbr0J
wAF6dIvBSl2nsNTnt2DVKdDtp93R
-----END CERTIFICATE-----`); 
        });

        qz.security.setSignatureAlgorithm("SHA512");
        qz.security.setSignaturePromise(function(toSign) {
            return function(resolve, reject) {
                try {
                    var privateKey = `-----BEGIN PRIVATE KEY-----
MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQCoyxhStRgBKClr
bkEAU7GokYCFgXqIUZheak21WA6aiP+80uFVu5bWzIYehsybqjdJ2SU5XWrI1iI9
ZRHCrFBOJ3kdWiK+5g7/rYK3+ftO8+PsviH2A0DjEcPmV/b/snF9ulMO8ixLnLPe
F+noMysPdwCEGvZz3lSEnWJlpVuRTe7IzzPHLQcqq4+KL3hwImlPdZIrEDMP66QM
Wh4J0bnpQKXjt7oIIPdqktYi1AntHm0mkArGYfTaa3SuRBtbxG6iWWhsuPVxWSiy
OHaqLBayI/hrH2hSf2SmxcQmGGVGIbAv/LMQqTmNNNjhj/PXQsRNTQrYoY4kqsB5
a3ob7yUFAgMBAAECggEADkv9iGvcV6S+NWJGUS/FmYCRgT1hUpCOtliMsnJ98iru
dmDqQye7dAAo0Acc54Z4XmHtHDnEZLR2e/rGkVWlC6meQZUz4jV8Sb25l7mtxpcz
1Aaau8q0wUbs7+K9ghTsNfkFNfvfMpxYQ9SEtG05FXs/6PCbtV68i+sEvZVO9zSe
Y48w2uSLIFuZzFDxBwMWkJzm4K7Pn9xbGUD/YcbvXkGh7U8cU66ZQn8rNvYu6SXW
YJEqs3yrhe2ymi1DA1Cwpu/1C19qr99xpNbsHGNIN7Y+SnO9IkJE/HrOC2mHWbw0
WI/ymvN/QGotPIcB546chn9eFSoq0z6j9Js57XUI9QKBgQDbo6AFtEqT6l9D2Ok1
SHR2Syw59upqoatVQaJ8i+GlcbApkDdIcYPAuxmM6ebjCI8jg70+vDn5ykTiJIwS
wMzM+JFGIx1KmYZSowZUKU0TJL2XMzMnFed7eWm0VmCeJ5zaPfGpGOE/92W6mA9j
KSud+K4laXM4NAeibmtHm0SrqwKBgQDEvJvEsNHYzqFUaZ6P5a34AuGmKXZtxzaf
+isIzmYWt851pExkuySSdJuQm1LNLasGvx1bb5knQzFiuDY/0++/Mh/CNXq8ifh9
l6Hhardqt9ppfNJPQbGiHwbP1gJ0GFBB9tNpwl87Zj3ozdleP0qo1sUlsq+aupDM
ojZ0DPVCDwKBgHra0X2fVT/bjyHySLAHMS2h6sEZfhHbEG0F449q5vKV3wXAp0uc
Qygg/6+0ffNsLDSfUdGvk3ZHT7R24Or0cRoNx6TFq3K44UuD6NxWpcgZevsCJpCs
TejhBuFal3yfh7sDfxMo2YXgKkTvHVxIAR/BpBdFHq/HWqXewZ8yGH01AoGBAJ+7
atVFovteuQnqPz0iBB+rZz4bx/XVmvpEiZA61BR54/0MCqJ2d3kZh/zev1mrTILL
xLAqabTBD2XRnuovzyXzMmniNebCNqjx5hM5K/ZPk9u15qNG+Uxh2IwCfDd6Th9g
ocHqeJunpXhROb0Vsi5nQeYbsAv2kf4zbfbHVpHtAoGBAL9ByOu+6PROTsr2wEYG
NLg/qXlDavq+hN/q9BoFp6VP9e5sC0dBnMmT0WQLk7QppCI64qe3bUEYHGirnDsL
/4rbrKQVAE+GDUfYJWD3vo+TzjlAwT8H74m8r2H/fzGHLyCG3KDeUAUxXNmDwbC4
86ol13+Gs8pgSrAtWjLYlcB0
-----END PRIVATE KEY-----`;

                    var pk = KEYUTIL.getKey(privateKey);
                    var sig = new KJUR.crypto.Signature({"alg": "SHA512withRSA"});
                    sig.init(pk);
                    sig.updateString(toSign);
                    var hex = sig.sign();
                    
                    var str = '';
                    for (var i = 0; i < hex.length; i += 2) {
                        str += String.fromCharCode(parseInt(hex.substr(i, 2), 16));
                    }
                    resolve(btoa(str)); 
                } catch (err) {
                    console.error("Errore firma QZ:", err);
                    reject(err);
                }
            };
        });

        function avviaConnessioneQZ() {
            if (!qz.websocket.isActive()) {
                qz.websocket.connect().then(function() {
                    console.log("QZ Tray connesso e firmato con successo!");
                }).catch(function(err) {
                    console.error("Errore di connessione a QZ Tray:", err);
                });
            }
        }
        avviaConnessioneQZ();

        qz.websocket.setClosedCallbacks(function(evt) {
            console.log("QZ Tray disconnesso! Ritento la connessione...");
            setTimeout(avviaConnessioneQZ, 3000);
        });
    }

    ensurePalmareToggleInForm();

    // Generazione automatica QR Code nel pannello Impostazioni Locale
    const baseOrigin = window.location.origin;
    const tParam = (window.TENANT_ID && window.TENANT_ID !== 'default') ? `?locale=${window.TENANT_ID}` : '';
    const linkMenuQR = `${baseOrigin}/menu.html${tParam}`;
    const linkAppQR = `${baseOrigin}/index.html${tParam}`;
    if (document.getElementById('qr-menu-link')) document.getElementById('qr-menu-link').innerText = linkMenuQR;
    if (document.getElementById('qr-app-link')) document.getElementById('qr-app-link').innerText = linkAppQR;
    if (document.getElementById('qr-menu-img')) document.getElementById('qr-menu-img').src = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(linkMenuQR)}`;
    if (document.getElementById('qr-app-img')) document.getElementById('qr-app-img').src = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(linkAppQR)}`;

    const docSnap = await getDoc(doc(db, "impostazioni", "stampanti")); if(docSnap.exists()) PRINTER_CONFIG = docSnap.data();
    
    // Ascolto in tempo reale dei dati del ristorante selezionato
    onSnapshot(doc(db, "impostazioni", "negozio"), (docNegozio) => {
        if(docNegozio.exists()) {
            const dn = docNegozio.data();
            if (document.getElementById('day-closed')) document.getElementById('day-closed').value = dn.giorno_riposo || '';
            if (dn.nome) {
                window.nomeLocaleCorrenteCassa = dn.nome.toUpperCase();
                if (document.getElementById('nome-locale-ui')) document.getElementById('nome-locale-ui').innerText = `${window.nomeLocaleCorrenteCassa} - CASSA`;
                if (document.getElementById('setting-nome-locale')) document.getElementById('setting-nome-locale').value = dn.nome;
            }
            if (dn.slogan && document.getElementById('setting-slogan')) document.getElementById('setting-slogan').value = dn.slogan;
            if (dn.telefono_ordini && document.getElementById('setting-tel-ordini')) document.getElementById('setting-tel-ordini').value = dn.telefono_ordini;
            if (dn.prezzo_coperto !== undefined) {
                window.prezzoCopertoLocale = parseFloat(dn.prezzo_coperto) || 2.50;
                if (document.getElementById('setting-coperto')) document.getElementById('setting-coperto').value = dn.prezzo_coperto;
            }
            if (dn.supplemento_consegna !== undefined && !isNaN(parseFloat(dn.supplemento_consegna))) {
                window.supplementoConsegnaLocale = parseFloat(dn.supplemento_consegna);
            }
            window.configConsegna = dn;
            caricaEditorZone(dn);
            if (dn.piva && document.getElementById('setting-piva')) document.getElementById('setting-piva').value = dn.piva;
            if (dn.indirizzo && document.getElementById('setting-indirizzo')) document.getElementById('setting-indirizzo').value = dn.indirizzo;
            if (dn.logo_url && document.getElementById('setting-logo-preview')) document.getElementById('setting-logo-preview').src = dn.logo_url;
        } else {
            if (document.getElementById('nome-locale-ui')) {
                document.getElementById('nome-locale-ui').innerText = `${window.nomeLocaleCorrenteCassa} - CASSA`;
            }
        }
    });
    
    const docForno = await getDoc(doc(db, "impostazioni", "forno"));
    if(docForno.exists() && docForno.data().limite_pizze && document.getElementById('oven-limit')) {
        document.getElementById('oven-limit').value = docForno.data().limite_pizze;
    }
    const docApp = await getDoc(doc(db, "impostazioni", "app_cliente"));
    if(docApp.exists() && docApp.data().cross_sell_bibite !== undefined && document.getElementById('switch-cross-sell')) {
        document.getElementById('switch-cross-sell').checked = docApp.data().cross_sell_bibite;
    }

    const today = new Date().toISOString().split('T')[0];
    if (document.getElementById('stats-start')) document.getElementById('stats-start').value = today;
    if (document.getElementById('stats-end')) document.getElementById('stats-end').value = today;

    const boxAllergeni = document.getElementById('new-allergeni-box'); 
    if(boxAllergeni) {
        boxAllergeni.innerHTML = ""; 
        ALLERGENI_DATA.forEach(al => { boxAllergeni.innerHTML += `<label class="allergen-check"><input type="checkbox" value="${al.name}" name="allergeni"><i class="fa-solid ${al.icon} ico-all"></i> ${al.name}</label>`; });
    }

    onSnapshot(collection(db, "rimozioni"), (snap) => { 
        ALL_RIMOZIONI_CACHE = []; 
        snap.forEach(d => ALL_RIMOZIONI_CACHE.push({ ...d.data(), id: d.id })); 
        ALL_RIMOZIONI_CACHE.sort((a,b)=>a.nome.localeCompare(b.nome, undefined, { sensitivity: 'base' })); 
        window.RIMS = ALL_RIMOZIONI_CACHE; 
        renderGrigliaIngredienti([]); 
        if(document.getElementById('view-rimozioni')?.style.display === 'block') caricaRimozioni();
    });

    onSnapshot(collection(db, "ingredienti"), (snap) => { 
        window.INGS = []; 
        snap.forEach(d => window.INGS.push({ ...d.data(), id: d.id })); 
        window.INGS.sort((a,b)=>a.nome.localeCompare(b.nome, undefined, { sensitivity: 'base' })); 
        if(document.getElementById('view-ingredienti')?.style.display === 'block') caricaIngredienti();
    });
    
    onSnapshot(collection(db, "prodotti"), (s) => {
        window.MENU = s.docs.map(d => ({...d.data(), id: d.id}));
        const dl = document.getElementById('menu-suggestions');
        if(dl) {
            dl.innerHTML = "";
            window.MENU.forEach(p => {
                dl.innerHTML += `<option value="${p.nome}" data-price="${p.prezzo}">€${parseFloat(p.prezzo).toFixed(2)}</option>`;
            });
        }
        if(document.getElementById('waiter-screen')?.style.display === 'flex') {
            renderProds(window.currentCat);
        }
    });

    vaiOggi();
    setInterval(renderKDS, 30000); 
    window.ordiniFuturiCache = window.ordiniFuturiCache || [];

    let isFirstLoad = true;
    onSnapshot(query(collection(db, "ordini"), where("stato", "in", ["In attesa", "In forno", "Pronto", "Prenotato"])), (snapshot) => {
        window.tavoliOccupati = {}; 
        snapshot.forEach(d => { if(d.data().tavolo) window.tavoliOccupati[d.data().tavolo] = { id: d.id, ...d.data() }; });
        ordiniAttiviForno = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        pubblicaOccupazioneForno();
        
        if (!isFirstLoad) {
            snapshot.docChanges().forEach((change) => {
                const data = change.doc.data();
                const oid = change.doc.id;

                if (change.type === 'modified') {
                    const tavolo = data.tavolo;
                    if (data.messaggio_cucina && data.messaggio_cucina.includes("✅ PRONTO")) {
                        const msgKey = oid + "_" + data.messaggio_cucina;
                        if (!window.notifiedMessages.has(msgKey)) { window.notifiedMessages.add(msgKey); if (typeof notifyWaiter === 'function') notifyWaiter(`🍽️ Tavolo ${tavolo}`, data.messaggio_cucina); }
                    } else if (data.stato === "Pronto") {
                        const msgKey = oid + "_TUTTO_PRONTO";
                        if (!window.notifiedMessages.has(msgKey)) { window.notifiedMessages.add(msgKey); if (typeof notifyWaiter === 'function') notifyWaiter(`✅ Tavolo ${tavolo}`, "Tutto l'ordine è PRONTO in cucina!"); }
                    }
                }

                if (change.type === 'added') {
                    let isNuovoDavvero = false;
                    if (data.data_invio) {
                        let timeInvio = data.data_invio.toDate ? data.data_invio.toDate().getTime() : new Date(data.data_invio).getTime();
                        if (Date.now() - timeInvio < 120000) isNuovoDavvero = true; 
                    } else {
                        isNuovoDavvero = true;
                    }

                    const dataAttualeCassa = document.getElementById('timeline-date').value;
                    if (isNuovoDavvero && data.data_ritiro && data.data_ritiro !== dataAttualeCassa) {
                        window.ordiniFuturiCache.push({ id: oid, ...data });

                        if (printerOn && window.isPrintServer) {
                            setTimeout(() => {
                                if(typeof playSound === 'function') playSound();
                                if(typeof showToast === 'function') showToast("🖨️ Stampa ordine del: " + data.data_ritiro);
                                enquePrint(oid, 'PIZZERIA', 'ORDER'); 
                                enquePrint(oid, 'CUCINA', 'ORDER'); 
                                enquePrint(oid, 'BAR', 'ORDER'); 
                            }, 1000);
                        }
                    }
                }
            });
        }
        isFirstLoad = false;
        renderTables();
    });
}


window.caricaSconti = async () => {
    const snap = await getDocs(collection(db, "sconti"));
    window.SCONTI_CACHE = snap.docs.map(d => ({id:d.id, ...d.data()}));
    const l = document.getElementById('lista-sconti');
    if (!l) return;
    l.innerHTML = "";
    window.SCONTI_CACHE.forEach(s => {
        const nomeSc = s.nome || s.codice || 'Sconto';
        const valSc = s.val !== undefined ? s.val : s.valore;
        const simbolo = s.tipo === 'percent' ? '%' : '€';
        l.innerHTML += `<div class="db-item"><b>${nomeSc}</b> (${valSc}${simbolo}) <button onclick="eliminaDB('sconti','${s.id}')" style="background:red; color:white; border:none; border-radius:5px; padding:5px; cursor:pointer;"><i class="fa fa-trash"></i></button></div>`;
    });
};

window.creaSconto = async () => {
    const nome = document.getElementById('sconto-nome').value.trim();
    const val = parseFloat(document.getElementById('sconto-val').value);
    const tipo = document.getElementById('sconto-tipo').value;
    if(nome && !isNaN(val)) {
        await addDoc(collection(db, "sconti"), {
            nome: nome,
            codice: nome.toUpperCase(),
            val: val,
            valore: val,
            tipo: tipo
        });
        caricaSconti();
        document.getElementById('sconto-nome').value = "";
        document.getElementById('sconto-val').value = "";
    }
};

window.apriPagamento = (id) => {
    const o = ordiniCache.find(x => x.id === id) || window.ordiniFuturiCache.find(x => x.id === id);
    if(!o) return;
    
    window.divisoreConto = 1;
    if(document.getElementById('pay-divisore')) document.getElementById('pay-divisore').innerText = "1";
    if(document.getElementById('quota-singola')) document.getElementById('quota-singola').style.display = 'none';

    window.currentPayOrderId = id;
    window.currentPayTotal = parseFloat(o.totale || 0); 
    window.activeDiscount = null;

    document.getElementById('pay-total').innerText = "€ " + window.currentPayTotal.toFixed(2);
    document.getElementById('cash-given').value = "";
    document.getElementById('pay-resto').innerText = "€ 0.00";
    
    renderDiscountBar();
    document.getElementById('modal-payment').style.display = 'flex';
};

window.chiudiPagamento = () => {
    document.getElementById('modal-payment').style.display = 'none';
};

window.modificaTotaleManuale = async () => {
    if(!window.currentPayOrderId) return;
    
    const { value: nuovoTotale } = await Swal.fire({
        title: 'Modifica Totale',
        input: 'number',
        inputLabel: 'Inserisci il nuovo totale definitivo (€):',
        inputValue: window.currentPayTotal.toFixed(2),
        inputAttributes: { step: '0.50' },
        showCancelButton: true,
        confirmButtonColor: '#4caf50',
        confirmButtonText: 'Salva',
        cancelButtonText: 'Annulla'
    });

    if (nuovoTotale) {
        const totFormattato = parseFloat(nuovoTotale);
        window.currentPayTotal = totFormattato;
        document.getElementById('pay-total').innerText = "€ " + totFormattato.toFixed(2);
        await updateDoc(doc(db, "ordini", window.currentPayOrderId), { totale: totFormattato });
        window.calcolaResto();
        window.cambiaDivisione(0); 
        Swal.fire({toast: true, position: 'top-end', icon: 'success', title: 'Totale Aggiornato', showConfirmButton: false, timer: 1500});
    }
};

function renderDiscountBar() {
    const bar = document.getElementById('payment-discount-list');
    if (!bar) return;
    bar.innerHTML = `<div class="btn-discount ${window.activeDiscount===null?'active':''}" onclick="applicaSconto(null)">NESSUNO</div>`;
    
    if(window.SCONTI_CACHE.length === 0) caricaSconti(); 

    window.SCONTI_CACHE.forEach(s => {
        const isActive = (window.activeDiscount && window.activeDiscount.id === s.id) ? 'active' : '';
        const nomeSc = s.nome || s.codice || 'Sconto';
        const valSc = s.val !== undefined ? s.val : s.valore;
        const simb = s.tipo === 'percent' ? '%' : '€';
        bar.innerHTML += `<div class="btn-discount ${isActive}" onclick='applicaSconto(${JSON.stringify(s)})'>${nomeSc} -${valSc}${simb}</div>`;
    });
}

window.applicaSconto = (scontoObj) => {
    window.activeDiscount = scontoObj;
    let finalPrice = window.currentPayTotal;
    
    if(scontoObj) {
        const valSc = parseFloat(scontoObj.val !== undefined ? scontoObj.val : scontoObj.valore) || 0;
        if(scontoObj.tipo === 'percent') {
            finalPrice = finalPrice - (finalPrice * (valSc / 100));
        } else {
            finalPrice = finalPrice - valSc;
        }
    }
    if(finalPrice < 0) finalPrice = 0;
    
    document.getElementById('pay-total').innerText = "€ " + finalPrice.toFixed(2);
    renderDiscountBar();
    window.calcolaResto(); 
};

window.divisoreConto = 1;

window.cambiaDivisione = (val) => {
    let nuovoDivisore = window.divisoreConto + val;
    if (nuovoDivisore < 1) nuovoDivisore = 1;
    window.divisoreConto = nuovoDivisore;
    
    document.getElementById('pay-divisore').innerText = window.divisoreConto;
    const currentTot = parseFloat(document.getElementById('pay-total').innerText.replace('€ ',''));
    
    if(window.divisoreConto > 1) {
        const quota = currentTot / window.divisoreConto;
        document.getElementById('quota-singola').style.display = 'block';
        document.getElementById('pay-quota').innerText = "€ " + quota.toFixed(2);
    } else {
        document.getElementById('quota-singola').style.display = 'none';
    }
    window.calcolaResto();
};

window.calcolaResto = () => {
    const given = parseFloat(document.getElementById('cash-given').value || 0);
    const currentTot = parseFloat(document.getElementById('pay-total').innerText.replace('€ ',''));
    const importoDaPagare = window.divisoreConto > 1 ? (currentTot / window.divisoreConto) : currentTot;
    const resto = given - importoDaPagare;
    document.getElementById('pay-resto').innerText = "€ " + (resto > 0 ? resto.toFixed(2) : "0.00");
};

window.confermaPagamento = async (metodo) => {
    if(!window.currentPayOrderId) return;
    
    const finalPrice = parseFloat(document.getElementById('pay-total').innerText.replace('€ ',''));
    const idOrdine = window.currentPayOrderId; 
    
    Swal.fire({
        title: 'Pagamento OK',
        text: "Stampare ricevuta/preconto?",
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'Sì, stampa',
        cancelButtonText: 'No'
    }).then(async (result) => {
        const vuoleRicevuta = result.isConfirmed;

        const updateData = {
            stato: 'Consegnato', 
            totale: finalPrice, 
            metodo_pagamento: metodo,
            sconto_applicato: window.activeDiscount ? (window.activeDiscount.nome || window.activeDiscount.codice) : null,
            timestamp_chiusura: serverTimestamp(),
            data_chiusura: serverTimestamp()
        };

        await updateDoc(doc(db, "ordini", idOrdine), updateData);
        
        if(vuoleRicevuta) {
            enquePrint(idOrdine, 'CONTO', 'ORDER'); 
        }
        
        chiudiPagamento();
        Swal.fire({title:'Incasso Registrato!', icon:'success', timer:1500, showConfirmButton:false});
    });
};

window.currentMainTab = 'asporto';

window.setMainTab = (tab) => {
    window.currentMainTab = tab;
    
    document.querySelectorAll('.main-tab').forEach(b => b.classList.remove('active'));
    document.querySelector(`.tab-${tab}`)?.classList.add('active');

    document.getElementById('grid-asporto').style.display = 'none';
    document.getElementById('grid-tavoli').style.display = 'none';
    document.getElementById('grid-pronti').style.display = 'none';
    
    document.getElementById(`grid-${tab}`).style.display = 'grid';
};

function renderGrigliaIngredienti(selectedIngs = []) {
    const grid = document.getElementById('grid-ingredienti-pizza'); 
    if(!grid) return;
    grid.innerHTML = "";
    if(ALL_RIMOZIONI_CACHE.length === 0) { grid.innerHTML = "<small>Nessun ingrediente in 'Rimozioni'.</small>"; return; }
    ALL_RIMOZIONI_CACHE.forEach(r => { 
        if(r.attivo !== false) { 
            const isChecked = selectedIngs.includes(r.nome) ? 'checked' : ''; 
            grid.innerHTML += `<label class="ing-option"><input type="checkbox" name="prod_ing_check" value="${r.nome}" ${isChecked}><span>${r.nome}</span></label>`; 
        } 
    });
}

window.filtraOrdini = (text) => {
    text = (text || "").toLowerCase();
    const gridAsporto = document.getElementById('grid-asporto');
    const gridTavoli = document.getElementById('grid-tavoli');
    const gridPronti = document.getElementById('grid-pronti');
    
    gridAsporto.innerHTML = "";
    gridTavoli.innerHTML = "";
    gridPronti.innerHTML = "";
    
    gridAsporto.style.gridTemplateColumns = "240px 1fr";
    gridAsporto.style.alignItems = "start";
    gridAsporto.innerHTML = window.generaSidebarOrari();
    
    const containerOrdiniAsporto = document.createElement('div');
    containerOrdiniAsporto.style.display = 'grid';
    containerOrdiniAsporto.style.gridTemplateColumns = 'repeat(auto-fill, minmax(300px, 1fr))';
    containerOrdiniAsporto.style.gap = '15px';
    gridAsporto.appendChild(containerOrdiniAsporto);
    
    const filtered = ordiniCache.filter(o => {
        if (o.stato === 'Consegnato' || o.stato === 'Annullato') return false;
        const nomeCompleto = ((o.nome||'') + " " + (o.cognome||'') + " " + (o.cliente?.nome||'') + " " + (o.cliente?.cognome||'')).toLowerCase();
        const tavolo = (o.tavolo || "").toString().toLowerCase();
        return nomeCompleto.includes(text) || tavolo.includes(text);
    });

    if(filtered.length === 0) {
        containerOrdiniAsporto.innerHTML = "<div style='grid-column:1/-1; color:white; text-align:center; padding: 50px;'>Nessun ordine trovato.</div>";
    } else {
        filtered.forEach(o => {
            if (o.stato === 'Pronto') {
                renderOrdine(o, gridPronti);
            } else if (o.tipo === 'SALA') {
                renderOrdine(o, gridTavoli);
            } else {
                renderOrdine(o, containerOrdiniAsporto);
            }
        });
    }
};

window.caricaAllergeniBase = async () => {
    const allergeniComuni = ["Glutine", "Latte", "Uova", "Soia"];
    document.querySelectorAll('input[name="allergeni"]').forEach(cb => {
        cb.checked = allergeniComuni.includes(cb.value);
    });
    Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Allergeni base selezionati', showConfirmButton: false, timer: 1200 });
};

window.importaDaPizze = async () => {
    window.generarimozioniAuto();
};

window.copiaPizzeSuStirate = async () => {
    Swal.fire({title:'Copiare Pizze in Stirate (+2€)?', showCancelButton:true}).then(async (r)=>{
        if(r.isConfirmed) {
            const pizze = window.MENU.filter(p => p.cat === 'pizza');
            for (const p of pizze) {
                if (!window.MENU.some(x => x.cat === 'stirata' && x.nome === p.nome)) {
                    const { id, ...rest } = p;
                    await addDoc(collection(db, "prodotti"), { ...rest, cat: 'stirata', prezzo: parseFloat(p.prezzo) + 2 });
                }
            }
            Swal.fire('Completato!', 'Pizze copiate in Stirate.', 'success');
        }
    });
};

window.copiaPizzeSuGF = async () => {
    Swal.fire({title:'Copiare Pizze in GF (+2€)?', showCancelButton:true}).then(async (r)=>{
        if(r.isConfirmed) {
            const pizze = window.MENU.filter(p => p.cat === 'pizza');
            for (const p of pizze) {
                if (!window.MENU.some(x => x.cat === 'gf' && x.nome === p.nome)) {
                    const { id, ...rest } = p;
                    await addDoc(collection(db, "prodotti"), { ...rest, cat: 'gf', prezzo: parseFloat(p.prezzo) + 2 });
                }
            }
            Swal.fire('Completato!', 'Pizze copiate in Gluten Free.', 'success');
        }
    });
};

// --- OCCUPAZIONE FORNO PUBBLICA ---
// L'App Clienti non può più leggere gli ordini degli altri: legge solo il numero di pizze per fascia oraria
// da occupazione_forno/{data}. La cassa lo ricalcola dagli ordini reali (modifiche, annullamenti, nuovi ordini).
const CATEGORIE_FORNO = ['pizza', 'stirata', 'gf', 'speciale'];
let ordiniAttiviForno = [];
let ordiniCacheData = null;
const occupazioneScritta = {};
let timerOccupazione = null;

function contaPizzeOrdine(o) {
    return (o.prodotti || []).reduce((acc, p) => acc + (CATEGORIE_FORNO.includes(p.cat) ? (parseFloat(p.qta) || 0) : 0), 0);
}

function pubblicaOccupazioneForno() {
    clearTimeout(timerOccupazione);
    timerOccupazione = setTimeout(async () => {
        const ora = new Date();
        const oggi = `${ora.getFullYear()}-${String(ora.getMonth() + 1).padStart(2, '0')}-${String(ora.getDate()).padStart(2, '0')}`;
        const perData = {};
        const aggiungi = (o) => {
            if (!o.data_ritiro || o.data_ritiro < oggi || !o.orario || o.stato === 'Annullato' || o.tavolo) return;
            const pz = contaPizzeOrdine(o);
            if (pz <= 0) return;
            perData[o.data_ritiro] = perData[o.data_ritiro] || {};
            perData[o.data_ritiro][o.orario] = (perData[o.data_ritiro][o.orario] || 0) + pz;
        };
        // Per il giorno mostrato in cassa contano tutti gli ordini (anche già chiusi); per gli altri giorni quelli attivi
        ordiniAttiviForno.filter(o => o.data_ritiro !== ordiniCacheData).forEach(aggiungi);
        if (ordiniCacheData) ordiniCache.forEach(aggiungi);

        const date = new Set([...Object.keys(perData), ...Object.keys(occupazioneScritta), ...(ordiniCacheData && ordiniCacheData >= oggi ? [ordiniCacheData] : [])]);
        for (const data of date) {
            if (data < oggi) continue;
            const slot = perData[data] || {};
            const firma = JSON.stringify(slot);
            if (occupazioneScritta[data] === firma) continue;
            try {
                await setDoc(doc(db, "occupazione_forno", data), { slot, aggiornato: serverTimestamp() });
                occupazioneScritta[data] = firma;
            } catch (e) {
                console.warn("Aggiornamento occupazione forno:", e);
            }
        }
    }, 1500);
}

function caricaOrdiniPerData(dateObj) {
    const yyyy = dateObj.getFullYear(); const mm = String(dateObj.getMonth() + 1).padStart(2, '0'); const dd = String(dateObj.getDate()).padStart(2, '0');
    const dateStr = `${yyyy}-${mm}-${dd}`;
    document.getElementById('timeline-date').value = dateStr;
    
    if(activeListener) activeListener();
    
    let isFirstBatch = true;

    const q = query(collection(db, "ordini"), where("data_ritiro", "==", dateStr));
    activeListener = onSnapshot(q, (snapshot) => {
        document.getElementById('search-bar').value = "";
        
        const gridAsporto = document.getElementById('grid-asporto');
        const gridTavoli = document.getElementById('grid-tavoli');
        const gridPronti = document.getElementById('grid-pronti');
        
        gridAsporto.innerHTML = ""; 
        gridTavoli.innerHTML = ""; 
        gridPronti.innerHTML = ""; 
        
        let ordini = [];
        let listAsporto = [], listTavoli = [], listPronti = [];
        
        window.tavoliOccupati = {};
        snapshot.forEach(docSnap => { 
            const d = docSnap.data();
            
            if(d.stato !== 'Annullato') {
                const ordine = {...d, id: docSnap.id};
                ordini.push(ordine);
                if (d.tavolo) window.tavoliOccupati[d.tavolo] = { id: docSnap.id, ...d };
                
                if (d.stato !== 'Consegnato') {
                    if (d.stato === 'Pronto') {
                        listPronti.push(ordine);
                    } else if (d.tipo === 'SALA') {
                        listTavoli.push(ordine);
                    } else {
                        listAsporto.push(ordine);
                    }
                }
            }
        });
        
        ordini.sort((a,b) => (a.orario || "23:59").localeCompare(b.orario || "23:59")); 
        ordiniCache = ordini;
        ordiniCacheData = dateStr;
        pubblicaOccupazioneForno();

        listAsporto.sort((a, b) => (a.orario || "23:59").localeCompare(b.orario || "23:59"));
        listTavoli.sort((a, b) => (a.orario || "23:59").localeCompare(b.orario || "23:59"));
        listPronti.sort((a, b) => (a.orario || "23:59").localeCompare(b.orario || "23:59"));

        snapshot.docChanges().forEach((change) => {
            if (change.type === 'modified') { 
                const data = change.doc.data(); 
                const oid = change.doc.id; 
                
                if (data.messaggio_cucina && !printedViaCache.has(oid + data.messaggio_cucina)) { 
                    printedViaCache.add(oid + data.messaggio_cucina); 
                    playSound(); 

                    if (printerOn && window.isPrintServer) {
                        if (!data.messaggio_cucina.includes("RICHIESTA CONTO")) {
                            enquePrint(oid, 'PIZZERIA', 'VIA'); 
                            enquePrint(oid, 'CUCINA', 'VIA'); 
                            enquePrint(oid, 'BAR', 'VIA');
                        }
                    }
                } 
            }
            
            if (change.type === 'added') { 
                const data = change.doc.data(); 
                const oid = change.doc.id; 
                
                window.ordiniGiaStampati = window.ordiniGiaStampati || new Set();
                let isNuovoDavvero = false;
                
                if (data.data_invio) {
                    let timeInvio = data.data_invio.toDate ? data.data_invio.toDate().getTime() : new Date(data.data_invio).getTime();
                    if (Date.now() - timeInvio < 120000) isNuovoDavvero = true; 
                } else {
                    isNuovoDavvero = true;
                }

                if(!isFirstBatch && isNuovoDavvero && !window.ordiniGiaStampati.has(oid)) { 
                    window.ordiniGiaStampati.add(oid);
                    playSound(); 
                    
                    if (data.tipo === 'SALA') {
                        triggerTabBlink('tavoli');
                    } else {
                        triggerTabBlink('asporto');
                    }

                    if(printerOn && window.isPrintServer) {
                        enquePrint(oid, 'PIZZERIA', 'ORDER'); 
                        enquePrint(oid, 'CUCINA', 'ORDER'); 
                        enquePrint(oid, 'BAR', 'ORDER'); 
                    }
                } 
            }
        });

        document.getElementById('cnt-asporto').innerText = listAsporto.length;
        document.getElementById('cnt-tavoli').innerText = listTavoli.length;
        document.getElementById('cnt-pronti').innerText = listPronti.length;

        gridAsporto.style.gridTemplateColumns = "240px 1fr";
        gridAsporto.style.alignItems = "start";
        gridAsporto.innerHTML = window.generaSidebarOrari();

        const containerOrdiniAsporto = document.createElement('div');
        containerOrdiniAsporto.style.display = 'grid';
        containerOrdiniAsporto.style.gridTemplateColumns = 'repeat(auto-fill, minmax(300px, 1fr))';
        containerOrdiniAsporto.style.gap = '15px';
        gridAsporto.appendChild(containerOrdiniAsporto);

        if(listAsporto.length === 0) {
            containerOrdiniAsporto.innerHTML = `<div style='grid-column:1/-1;text-align:center;padding:50px;color:#888;'>Nessun ordine asporto.</div>`;
        } else {
            listAsporto.forEach(o => renderOrdine(o, containerOrdiniAsporto));
        }

        if(listTavoli.length === 0) gridTavoli.innerHTML = `<div style='grid-column:1/-1;text-align:center;padding:50px;color:#888;'>Nessun tavolo attivo.</div>`;
        else listTavoli.forEach(o => renderOrdine(o, gridTavoli));

        if(listPronti.length === 0) gridPronti.innerHTML = `<div style='grid-column:1/-1;text-align:center;padding:50px;color:#888;'>Nessun ordine pronto.</div>`;
        else listPronti.forEach(o => renderOrdine(o, gridPronti));

        isFirstBatch = false;
    });
}

function raggruppaProdotti(prodotti) {
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
window.raggruppaProdotti = raggruppaProdotti;

function renderOrdine(o, container) {
    try {
        const div = document.createElement('div'); div.className = 'order-card';
        const prodottiRaggruppati = raggruppaProdotti(o.prodotti || []);
        
        const itemsByTurn = {};
        prodottiRaggruppati.forEach(p => {
            const t = p.turno || 1;
            if(!itemsByTurn[t]) itemsByTurn[t] = [];
            itemsByTurn[t].push(p);
        });

        let itemsHtml = ""; 
        Object.keys(itemsByTurn).sort().forEach(turn => {
            const turnMsg = `VIA TURNO ${turn}`;
            const alreadyCalled = (o.turni_chiamati && o.turni_chiamati.includes(parseInt(turn)));
            const isCalled = o.messaggio_cucina === turnMsg || alreadyCalled;
            
            const btnAttr = isCalled ? 'disabled style="opacity:0.6; cursor:default; background:#bdbdbd; border-color:#9e9e9e; color:#555;"' : '';
            const btnLabel = isCalled ? '<i class="fa fa-check"></i> INVIATO' : '<i class="fa-solid fa-bell"></i> CHIAMA';

            itemsHtml += `<div class="turn-box">
                <div class="turn-header">
                    <span>TURNO ${turn}</span>
                    <button class="btn-via" onclick="inviaSegnaleVia('${window.safeId(o.id)}', '${turn}')" ${btnAttr}>${btnLabel}</button>
                </div>
                <ul class="order-list">`;
            itemsByTurn[turn].forEach(p => {
                const detHtml = p.dettagli ? `<br><small style="color:red; margin-left:20px;">${window.sanitizeHtml(p.dettagli)}</small>` : '';
                const qtaDisplay = p.qta % 1 === 0 ? p.qta : p.qta.toFixed(3);
                itemsHtml += `<li class="order-item"><b>${window.escapeHtml(qtaDisplay)}</b> x ${window.escapeHtml(p.nome)} ${detHtml}</li>`;
            });
            itemsHtml += `</ul></div>`;
        });

        let nomeCompleto = ((o.nome || o.cliente?.nome || '') + " " + (o.cognome || o.cliente?.cognome || '')).trim();
        if (nomeCompleto.toUpperCase().startsWith("TAVOLO")) {
            nomeCompleto = "Cliente in Sala";
        }

        let nomeCli = "";
        if (o.tavolo && o.tavolo.trim() !== "") {
            nomeCli = `<span style="background:#1976d2; color:white; padding:3px 8px; border-radius:5px; margin-right:8px; font-weight:900; letter-spacing:1px; font-size:0.85em;"><i class="fa fa-chair"></i> TAV. ${window.escapeHtml(o.tavolo)}</span><b style="font-size:1.1em;">${window.escapeHtml(nomeCompleto)}</b>`;
        } else {
            nomeCli = `<b style="font-size:1.1em;">${window.escapeHtml(nomeCompleto)}</b>`;
        }
        
        const telCli = o.cliente?.telefono || o.telefono || '';
        const totaleStr = o.totale ? parseFloat(o.totale).toFixed(2) : "0.00";
        const orarioPrenotazioneHtml = o.orario ? `<div style="margin-top:5px; color:#1976d2; font-size:0.9em;"><b><i class="fa fa-calendar-check"></i> Prenotato per le: ${window.escapeHtml(o.orario)}</b></div>` : '';
        const noteHtml = o.note_ordine ? `<div style="margin-top:10px; background:#fff8e1; border:1px solid #ffe0b2; color:#e65100; padding:8px; border-radius:5px; font-weight:bold;">NOTE: ${window.escapeHtml(o.note_ordine)}</div>` : '';
        // Segnalazione del server: i prezzi dell'ordine non tornano con il listino (vedi functions/ordini.js)
        const anomaliaHtml = (o.anomalia_prezzo && Array.isArray(o.anomalia_prezzo.motivi)) ? `<div style="margin-top:10px; background:#ffebee; border:2px solid #d32f2f; color:#b71c1c; padding:8px; border-radius:5px; font-weight:bold;">⚠️ PREZZI DA VERIFICARE<br><small style="font-weight:normal;">${o.anomalia_prezzo.motivi.map(m => window.escapeHtml(m)).join('<br>')}${o.anomalia_prezzo.totale_atteso !== undefined ? `<br>Totale atteso: € ${window.escapeHtml(Number(o.anomalia_prezzo.totale_atteso).toFixed(2))}` : ''}</small></div>` : '';

        let orarioDisplay = o.orario || "--:--"; 
        let iconaOrario = "fa-clock"; 
        let labelOrario = "RITIRO";
        let timerHtml = "";
        
        if (o.stato === 'Pronto') {
            timerHtml = `<div style="background:#00e676; color:black; font-size:0.5em; padding:3px 6px; border-radius:4px; margin-left:8px; vertical-align:middle; display:inline-block; font-weight:bold;"><i class="fa fa-check"></i> FATTO</div>`;
        } 
        else if (o.data_invio && o.tipo === 'SALA') {
            let timerRef = null;
            if(o.data_invio.toDate) timerRef = o.data_invio.toDate();
            else if(o.data_invio) timerRef = new Date(o.data_invio);

            if(timerRef) {
                if(o.timestamp_messaggio) { 
                    let msgRef = null;
                    if(o.timestamp_messaggio.toDate) msgRef = o.timestamp_messaggio.toDate();
                    else msgRef = new Date(o.timestamp_messaggio);
                    if(msgRef) { timerRef = msgRef; labelOrario = "DA CHIAMATA"; }
                } else { labelOrario = "ARRIVO"; }

                orarioDisplay = `${String(timerRef.getHours()).padStart(2,'0')}:${String(timerRef.getMinutes()).padStart(2,'0')}`;
                iconaOrario = "fa-stopwatch";
                const diff = Math.floor((new Date() - timerRef) / 60000);
                let color = "#4caf50"; if(diff > 10) color = "#ff9800"; if(diff > 20) color = "#f44336";
                timerHtml = `<div style="background:${color}; color:white; font-size:0.5em; padding:3px 6px; border-radius:4px; margin-left:8px; vertical-align:middle; display:inline-block;">${diff} min</div>`;
            }
        }

        let alertViaHtml = "";
        if (o.messaggio_cucina) {
            let viaTime = "";
            if(o.timestamp_messaggio) { 
                let dt = null;
                if(o.timestamp_messaggio.toDate) dt = o.timestamp_messaggio.toDate();
                else dt = new Date(o.timestamp_messaggio);
                if(dt) viaTime = dt.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}); 
            }
            alertViaHtml = `<div class="via-alert"><div><div class="via-text">🔔 ${window.escapeHtml(o.messaggio_cucina)}</div><small>Ore: ${viaTime}</small></div><button class="via-btn-ok" onclick="archiviaMessaggio('${window.safeId(o.id)}')">OK</button></div>`;
        }

        let copertiHtml = "";
        if(o.coperti && parseInt(o.coperti) > 0) {
            copertiHtml += `<span style="background:#333; color:white; padding:3px 8px; border-radius:10px; font-size:0.8em; margin-left:10px;" title="Coperti Totali"><i class="fa fa-user"></i> ${o.coperti}</span>`;
            if (o.bambini && parseInt(o.bambini) > 0) {
                copertiHtml += `<span style="background:#0288d1; color:white; padding:3px 8px; border-radius:10px; font-size:0.8em; margin-left:5px;" title="Bambini"><i class="fa fa-child"></i> ${o.bambini}</span>`;
            }
            if (o.seggioloni && parseInt(o.seggioloni) > 0) {
                copertiHtml += `<span style="background:#ffb300; color:black; padding:3px 8px; border-radius:10px; font-size:0.8em; margin-left:5px;" title="Seggioloni"><i class="fa fa-baby-carriage"></i> ${o.seggioloni}</span>`;
            }
        }

        const agendaBadgesHtml = typeof window.generaBadgeAgendaPerCassa === 'function' ? window.generaBadgeAgendaPerCassa(o) : '';

        div.innerHTML = `
            <div class="card-time-box">
                <span style="font-size:0.5em; margin-right:5px; flex-direction:column; display:flex; text-align:left;">
                    <span>${labelOrario}</span>
                    <span style="color:#aaa;">Op: ${window.escapeHtml(o.operatore || o.cameriere || 'Admin')}</span>
                </span>
                <span><i class="fa-regular ${iconaOrario}"></i> ${window.escapeHtml(orarioDisplay)} ${timerHtml}</span>
                <i class="fa fa-trash trash-btn" onclick="eliminaOrdine('${window.safeId(o.id)}')"></i>
            </div>
            <div class="card-client-box"><span class="client-name">${nomeCli} ${copertiHtml}</span><a href="tel:${String(telCli).replace(/[^\d+]/g, '')}" class="client-phone"><i class="fa fa-phone"></i> ${window.escapeHtml(telCli)}</a></div>
            ${agendaBadgesHtml}
            <div class="card-body">${alertViaHtml}${anomaliaHtml}${itemsHtml}${orarioPrenotazioneHtml}${noteHtml}<div class="card-total-box"><span>TOTALE</span><span>€ ${totaleStr}</span></div>
            <div class="status-row"><button class="status-btn ${o.stato.includes('Pronto')?'active-pronto':''}" onclick="cambiaStato('${window.safeId(o.id)}','Pronto')">PRONTO</button><button class="status-btn" style="background:#333; color:white;" onclick="apriPagamento('${window.safeId(o.id)}')">PAGA & CHIUDI</button></div>
            <div class="card-actions"><button class="action-btn" style="border-left:3px solid #2962ff; background:#e3f2fd; color:#1565c0;" onclick="apriModifica('${window.safeId(o.id)}')">✏️ MODIFICA</button><button class="action-btn" style="border-left:3px solid black;" onclick="chiediDivisioneEStampa('${window.safeId(o.id)}')">PRECONTO</button><button class="action-btn" style="border-left:3px solid #d32f2f;" onclick="stampa('${window.safeId(o.id)}', 'PIZZERIA')">PIZZA</button><button class="action-btn" style="border-left:3px solid #f57c00;" onclick="stampa('${window.safeId(o.id)}', 'CUCINA')">CUCINA</button><button class="action-btn" style="border-left:3px solid #1976d2;" onclick="stampa('${window.safeId(o.id)}', 'BAR')">BAR</button></div></div>`;
        container.appendChild(div);
    } catch(e) {
        console.error("Errore rendering ordine " + o.id, e);
        const divErr = document.createElement('div');
        divErr.className = 'order-card';
        divErr.style.border = "2px solid red";
        divErr.innerHTML = `<div style="padding:20px; color:red; text-align:center;"><b>ERRORE DATI ORDINE</b><br>${window.escapeHtml(o.nome)}<br><button onclick="eliminaOrdine('${window.safeId(o.id)}')">ELIMINA</button></div>`;
        container.appendChild(divErr);
    }
}

window.scalaScorte = async (prodottiOrdinati, segno = -1) => {
    if (!prodottiOrdinati || prodottiOrdinati.length === 0) return;
    try {
        const batch = writeBatch(db);
        let ciSonoModifiche = false;
        
        prodottiOrdinati.forEach(p => {
            let itemsToScale = [];
            if (p.componenti && p.componenti.length > 0) {
                p.componenti.forEach(compId => {
                    const prodOriginale = window.MENU.find(m => m.id === compId);
                    if (prodOriginale) itemsToScale.push(prodOriginale);
                });
            } else {
                const prodOriginale = window.MENU.find(m => m.nome === p.nome);
                if (prodOriginale) itemsToScale.push(prodOriginale);
            }

            itemsToScale.forEach(prodOriginale => {
                if (prodOriginale && prodOriginale.scorta !== null && prodOriginale.scorta !== undefined && prodOriginale.scorta !== "") {
                    const prodRef = doc(db, "prodotti", prodOriginale.id);
                    let qtaDaScalare = parseFloat(p.qta) || 1;
                    if (p.componenti) qtaDaScalare = qtaDaScalare * 0.5;
                    batch.update(prodRef, { scorta: increment(qtaDaScalare * segno) });
                    ciSonoModifiche = true;
                }
            });
        });
        
        if (ciSonoModifiche) {
            await batch.commit();
        }
    } catch (e) {
        console.error("Errore aggiornamento scorte:", e);
    }
};

window.apriNuovoOrdine = () => {
    if(document.getElementById('quick-prod-cat')) document.getElementById('quick-prod-cat').value = ""; 
    document.getElementById('new-ord-nome').value = "";
    document.getElementById('new-ord-cognome').value = "";
    document.getElementById('new-ord-tel').value = "";
    document.getElementById('new-ord-tavolo').value = "";
    document.getElementById('new-ord-coperti').value = "2";
    document.getElementById('new-ord-note').value = "";
    document.getElementById('new-ord-indirizzo').value = "";
    document.getElementById('new-ord-citofono').value = "";
    document.getElementById('new-ord-zona').value = "";
    document.getElementById('new-ord-cap').value = "";

    let defaultDate = document.getElementById('timeline-date').value;
    if(!defaultDate) defaultDate = new Date().toISOString().split('T')[0];
    document.getElementById('new-ord-date').value = defaultDate;

    const now = new Date();
    now.setMinutes(now.getMinutes() + 20);
    document.getElementById('new-ord-ora').value = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
    
    tempNewOrderItems = [];
    renderNewOrderPreview();

    toggleTipoOrdine('asporto'); 
    document.getElementById('modal-new-order').style.display = 'flex';
};

window.toggleTipoOrdine = (type) => {
    const tipoPrecedente = newOrderType;
    newOrderType = type;
    document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(`btn-type-${type}`).classList.add('active');
    
    const fieldTavolo = document.getElementById('field-tavolo');
    if (type === 'tavolo') {
        fieldTavolo.classList.remove('hidden-field');
        fieldTavolo.style.display = 'flex';
        document.getElementById('new-ord-tel').style.display = 'none';
    } else {
        fieldTavolo.classList.add('hidden-field');
        fieldTavolo.style.display = 'none';
        document.getElementById('new-ord-tel').style.display = 'block';
    }

    const fieldDom = document.getElementById('field-domicilio');
    if (fieldDom) fieldDom.style.display = (type === 'domicilio') ? 'block' : 'none';
    const inpSupp = document.getElementById('new-ord-supplemento');
    if (type === 'domicilio' && tipoPrecedente !== 'domicilio' && inpSupp) {
        inpSupp.value = (window.supplementoConsegnaLocale || 0).toFixed(2);
    }
    renderNewOrderPreview(); 
};

window.setQuickTime = (minutes) => {
    const now = new Date();
    if (minutes !== 0) {
        now.setMinutes(now.getMinutes() + minutes);
    }
    document.getElementById('new-ord-ora').value = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
};

window.autoFillPriceCreation = (input) => {
    const val = input.value;
    const opts = document.getElementById('menu-suggestions').childNodes;
    for (let i = 0; i < opts.length; i++) {
        if (opts[i].value === val) {
            document.getElementById('quick-prod-price').value = opts[i].getAttribute('data-price');
            break;
        }
    }
};

window.addToNewOrderList = () => {
    const name = document.getElementById('quick-prod-search').value.trim();
    const price = parseFloat(document.getElementById('quick-prod-price').value);
    const qty = parseFloat(document.getElementById('quick-prod-qty').value);
    const catManuale = document.getElementById('quick-prod-cat').value;

    if (name && !isNaN(price) && qty > 0) {
        let foundCat = 'varie';
        if (catManuale !== "") {
            foundCat = catManuale;
        } else {
            const menuItem = window.MENU.find(m => m.nome.toLowerCase() === name.toLowerCase());
            if (menuItem) {
                foundCat = menuItem.cat;
            } else {
                const n = name.toLowerCase();
                if (n.includes('pizza') || n.includes('calz') || n.includes('focac') || n.includes('stira')) foundCat = 'pizza';
                else if (n.includes('primo') || n.includes('secondo') || n.includes('pasta') || n.includes('patat') || n.includes('fritt')) foundCat = 'primo';
                else if (n.includes('bibita') || n.includes('birra') || n.includes('caff') || n.includes('acqua') || n.includes('vino')) foundCat = 'bibita';
            }
        }

        const turnoSelezionato = parseInt(document.getElementById('quick-prod-turn').value) || 1;
        
        tempNewOrderItems.push({
            nome: name,
            prezzo: price,
            qta: qty,
            dettagli: 'Normale',
            cat: foundCat,
            turno: turnoSelezionato
        });
        
        document.getElementById('quick-prod-search').value = "";
        document.getElementById('quick-prod-price').value = "";
        document.getElementById('quick-prod-qty').value = "1";
        document.getElementById('quick-prod-cat').value = "";
        
        renderNewOrderPreview();
    } else {
        Swal.fire('Compila nome, prezzo e quantità.');
    }
};

window.renderNewOrderPreview = () => {
    const list = document.getElementById('new-order-preview-list');
    list.innerHTML = "";
    let total = 0;

    if (tempNewOrderItems.length === 0) {
        list.innerHTML = `<div style="text-align:center; color:#888; font-size:0.9em;">Nessun prodotto aggiunto</div>`;
    } else {
        tempNewOrderItems.forEach((p, index) => {
            total += p.prezzo * p.qta;
            let dettagliHtml = p.dettagli;
            if (dettagliHtml === 'Normale') dettagliHtml = ''; 
            const qtaDisplay = p.qta % 1 === 0 ? p.qta : p.qta.toFixed(3);

            const turniHtml = `
            <div class="turno-row" style="margin-top:8px;">
                ${[1, 2, 3, 4, 5].map(t => `<div class="turno-btn ${(p.turno || 1) == t ? 'active' : ''}" onclick="setNewOrderTurn(${index}, ${t})">${t}</div>`).join('')}
            </div>`;

            list.innerHTML += `
                <div style="border-bottom:1px solid #eee; padding:8px 5px; display:flex; flex-direction:column;">
                    <div style="display:flex; justify-content:space-between; align-items: center;">
                        <div>
                            <span style="display:flex; align-items:center; gap:8px;">
                                ${qtaDisplay}x <b style="font-size:1.1em;">${window.escapeHtml(p.nome)}</b>
                                <span style="background:#ffea00; color:black; padding:2px 8px; border-radius:5px; font-size:0.9em; font-weight:900; border: 1px solid #c8b900;">
                                    T${p.turno || 1}
                                </span>
                            </span>
                            <small style="color:gray; display:block; margin-top:3px;">${window.sanitizeHtml(dettagliHtml)}</small>
                        </div>
                        <div style="text-align:right;">
                            <span style="font-weight:bold;">€ ${(p.prezzo * p.qta).toFixed(2)}</span>
                            <i class="fa fa-pencil" style="color:orange; cursor:pointer; margin-left:10px; font-size:1.2em;" onclick="apriModificaProdottoNuovo(${index})"></i>
                            <i class="fa fa-trash" style="color:red; cursor:pointer; margin-left:10px; font-size:1.2em;" onclick="removeFromNewOrderList(${index})"></i>
                        </div>
                    </div>
                    ${turniHtml}
                </div>
            `;
        });
    }

    if (newOrderType === 'tavolo') {
        const coperti = parseInt(document.getElementById('new-ord-coperti').value || 0);
        if(coperti > 0) {
            const costoCoperto = coperti * (window.prezzoCopertoLocale || 2.50);
            total += costoCoperto;
            list.innerHTML += `
            <div style="display:flex; justify-content:space-between; border-top:1px dashed #ccc; padding:5px; align-items: center; margin-top:5px; color:#555;">
                <div><span>${coperti}x <b>COPERTO</b></span></div>
                <div style="text-align:right;"><span>€ ${costoCoperto.toFixed(2)}</span></div>
            </div>`;
        }
    }

    if (newOrderType === 'domicilio') {
        const supp = parseFloat(document.getElementById('new-ord-supplemento')?.value) || 0;
        if (supp > 0) {
            total += supp;
            list.innerHTML += `
            <div style="display:flex; justify-content:space-between; border-top:1px dashed #ccc; padding:5px; align-items: center; margin-top:5px; color:#555;">
                <div><span>🛵 <b>SUPPLEMENTO CONSEGNA</b></span></div>
                <div style="text-align:right;"><span>€ ${supp.toFixed(2)}</span></div>
            </div>`;
        }
    }

    document.getElementById('new-ord-totale-preview').innerText = "€ " + total.toFixed(2);
};

window.removeFromNewOrderList = (index) => {
    tempNewOrderItems.splice(index, 1);
    renderNewOrderPreview();
};

window.setNewOrderTurn = (index, newTurno) => {
    tempNewOrderItems[index].turno = newTurno;
    renderNewOrderPreview();
};

window.setEditOrderTurn = (index, newTurno) => {
    currentEditProducts[index].turno = newTurno;
    renderEditProdotti();
}; 

window.creaNuovoOrdine = async () => {
    const nome = document.getElementById('new-ord-nome').value.trim();
    const cognome = document.getElementById('new-ord-cognome').value.trim();
    const tel = document.getElementById('new-ord-tel').value;
    const tavolo = document.getElementById('new-ord-tavolo').value;
    const coperti = parseInt(document.getElementById('new-ord-coperti').value || 2);
    const orario = document.getElementById('new-ord-ora').value;
    const dataRitiro = document.getElementById('new-ord-date').value;
    const note = document.getElementById('new-ord-note').value;
    
    if (newOrderType === 'tavolo' && !tavolo) return Swal.fire("Inserisci il numero del tavolo!");
    if (newOrderType !== 'tavolo' && !nome) return Swal.fire("Inserisci il nome del cliente!");
    if (!dataRitiro) return Swal.fire("Inserisci la data!");

    const isDom = newOrderType === 'domicilio';
    const indirizzo = isDom ? document.getElementById('new-ord-indirizzo').value.trim() : '';
    const citofono = isDom ? document.getElementById('new-ord-citofono').value.trim() : '';
    const zona = isDom ? document.getElementById('new-ord-zona').value.trim() : '';
    const cap = isDom ? document.getElementById('new-ord-cap').value.trim() : '';
    const supplemento = isDom ? (parseFloat(document.getElementById('new-ord-supplemento').value) || 0) : 0;
    if (isDom && !indirizzo) return Swal.fire("Attenzione", "Inserisci l'indirizzo per la consegna a domicilio!", "warning");

    let totaleOrdine = 0;
    tempNewOrderItems.forEach(p => totaleOrdine += (p.prezzo * p.qta));

    if (newOrderType === 'tavolo' && coperti > 0) {
        totaleOrdine += (coperti * (window.prezzoCopertoLocale || 2.50));
    }
    totaleOrdine += supplemento;

    const op = sessionStorage.getItem('operatore_corrente') || 'Sconosciuto';

    const newOrderData = {
        data_ritiro: dataRitiro,
        data_invio: serverTimestamp(),
        nome: nome,
        cognome: cognome,
        telefono: tel,
        tavolo: (newOrderType === 'tavolo' ? tavolo : ""),
        coperti: (newOrderType === 'tavolo' ? coperti : ""),
        orario: orario,
        note_ordine: note,
        stato: (newOrderType === 'tavolo' ? 'In forno' : 'In attesa'), 
        tipo: (newOrderType === 'tavolo' ? 'SALA' : (isDom ? 'DOMICILIO' : 'ASPORTO')),
        prodotti: tempNewOrderItems,
        totale: totaleOrdine,
        operatore: op
    };
    if (isDom) {
        Object.assign(newOrderData, { indirizzo, citofono, zona, cap, supplemento_consegna: supplemento });
    }

    try {
        await addDoc(collection(db, "ordini"), newOrderData);
        await window.scalaScorte(tempNewOrderItems, -1);
        
        if(tel) {
            updateClienteCRM(nome + " " + cognome, tel, totaleOrdine, dataRitiro).catch(err => console.log("Err CRM", err));
        }

        document.getElementById('modal-new-order').style.display = 'none';
        Swal.fire({icon:'success', title:'Ordine Creato!', timer:1000, showConfirmButton:false});
        
        if (dataRitiro !== document.getElementById('timeline-date').value) {
            cambiaDataManuale(dataRitiro);
        }
    } catch (e) {
        console.error(e);
        Swal.fire("Errore creazione ordine: " + e.message);
    }
};
// ============================================================================
// CASSA.JS - PARTE 3 DI 4
// Modifica Ordine, Stirata Bi-Gusto, Carrello Sala e Stampe Termiche QZ Tray
// ============================================================================

window.apriModifica = (id) => {
    const o = ordiniCache.find(x => x.id === id) || window.ordiniFuturiCache.find(x => x.id === id);
    if(!o) return;
    currentEditOrderId = id;
    currentEditProducts = JSON.parse(JSON.stringify(o.prodotti || [])); 
    
    document.getElementById('edit-tavolo').value = o.tavolo || '';
    document.getElementById('edit-coperti').value = o.coperti || 0; 
    document.getElementById('edit-nome').value = o.nome || o.cliente?.nome || '';
    document.getElementById('edit-cognome').value = o.cognome || o.cliente?.cognome || '';
    document.getElementById('edit-tel').value = o.telefono || o.cliente?.telefono || '';
    document.getElementById('edit-ora').value = o.orario || '';
    document.getElementById('edit-note').value = o.note_ordine || '';

    const isDom = o.tipo === 'DOMICILIO' || Boolean(o.indirizzo && String(o.indirizzo).trim() !== '');
    document.getElementById('edit-is-domicilio').checked = isDom;
    document.getElementById('edit-indirizzo').value = o.indirizzo || '';
    document.getElementById('edit-citofono').value = o.citofono || '';
    document.getElementById('edit-zona').value = o.zona || '';
    document.getElementById('edit-cap').value = o.cap || o.cliente?.cap || '';
    const suppSalvato = parseFloat(o.supplemento_consegna);
    document.getElementById('edit-supplemento').value = (isDom && !isNaN(suppSalvato) ? suppSalvato : (window.supplementoConsegnaLocale || 0)).toFixed(2);
    document.getElementById('edit-domicilio-fields').style.display = isDom ? 'block' : 'none';
    
    document.getElementById('manual-name').value = "";
    document.getElementById('manual-price').value = "";

    renderEditProdotti();
    ricalcolaTotaleEditLive(); 

    document.getElementById('modal-edit-order').style.display = 'flex';
};

window.chiudiModifica = () => {
    document.getElementById('modal-edit-order').style.display = 'none';
    currentEditOrderId = null;
};

window.autoFillPrice = (input) => {
    const val = input.value;
    const opts = document.getElementById('menu-suggestions').childNodes;
    for (let i = 0; i < opts.length; i++) {
        if (opts[i].value === val) {
            document.getElementById('manual-price').value = opts[i].getAttribute('data-price');
            break;
        }
    }
};

// Zona e supplemento proposti dal CAP (stesso calcolo dell'App Clienti); il supplemento resta modificabile
function applicaZonaDaCap(prefisso, prodotti) {
    const totaleProdotti = (prodotti || []).reduce((t, p) => t + (parseFloat(p.prezzo) || 0) * (parseFloat(p.qta) || 0), 0);
    const c = calcolaConsegna(window.configConsegna, document.getElementById(`${prefisso}-cap`).value, totaleProdotti);
    if (!c.zoneConfigurate || !c.capValido) return;
    document.getElementById(`${prefisso}-zona`).value = c.zona;
    document.getElementById(`${prefisso}-supplemento`).value = c.supplemento.toFixed(2);
}

window.zonaDaCapNuovoOrdine = () => {
    applicaZonaDaCap('new-ord', tempNewOrderItems);
    renderNewOrderPreview();
};

window.zonaDaCapModifica = () => {
    applicaZonaDaCap('edit', currentEditProducts);
    ricalcolaTotaleEditLive();
};

function getSupplementoEdit() {
    if (!document.getElementById('edit-is-domicilio')?.checked) return 0;
    return parseFloat(document.getElementById('edit-supplemento')?.value) || 0;
}

window.toggleEditDomicilioFields = (attivo) => {
    document.getElementById('edit-domicilio-fields').style.display = attivo ? 'block' : 'none';
    ricalcolaTotaleEditLive();
};

window.ricalcolaTotaleEditLive = () => {
    let t = 0;
    currentEditProducts.forEach(p => t += parseFloat(p.prezzo) * parseFloat(p.qta));
    
    const nCop = parseInt(document.getElementById('edit-coperti').value || 0);
    if(nCop > 0) t += (nCop * (window.prezzoCopertoLocale || 2.50));
    t += getSupplementoEdit();

    document.getElementById('edit-total-display').textContent = "€ " + t.toFixed(2);
};

window.renderEditProdotti = () => {
    const container = document.getElementById('edit-list-container');
    container.innerHTML = "";
    
    currentEditProducts.forEach((p, idx) => {
        let dettagliHtml = p.dettagli;
        if (dettagliHtml === 'Normale') dettagliHtml = ''; 
        const qtaDisplay = p.qta % 1 === 0 ? p.qta : p.qta.toFixed(3);

        const turniHtml = `
        <div class="turno-row" style="margin-top:8px;">
            ${[1, 2, 3, 4, 5].map(t => `<div class="turno-btn ${(p.turno || 1) == t ? 'active' : ''}" onclick="setEditOrderTurn(${idx}, ${t})">${t}</div>`).join('')}
        </div>`;

        container.innerHTML += `
            <div class="edit-prod-row" style="flex-direction:column; align-items:stretch; gap:5px;">
                <div style="display:flex; justify-content:space-between; align-items:center; width:100%;">
                    <div style="flex:2;">
                        <div style="display:flex; align-items:center; gap:5px; margin-bottom:5px;">
                            <input type="text" class="input-std" value="${window.escapeHtml(p.nome)}" oninput="updateEditField(${idx}, 'nome', this.value)" style="font-weight:bold; width:100%;">
                            <span style="background:#ffea00; color:black; padding:6px 10px; border-radius:5px; font-size:0.9em; font-weight:900; border: 1px solid #c8b900;">
                                T${p.turno || 1}
                            </span>
                        </div>
                        <small style="display:block; color:#666;">${window.sanitizeHtml(dettagliHtml)}</small>
                    </div>
                    <div style="flex:1; text-align:center;">
                        <button class="btn-qta" onclick="cambiaQtaModifica(${idx}, -1)">-</button>
                        <span style="margin:0 5px; font-weight:bold;">${qtaDisplay}</span>
                        <button class="btn-qta" onclick="cambiaQtaModifica(${idx}, 1)">+</button>
                    </div>
                    <div style="flex:1; text-align:right;">
                        <input type="number" class="input-std" value="${parseFloat(p.prezzo).toFixed(2)}" step="0.50" oninput="updateEditField(${idx}, 'prezzo', this.value)" style="width:70px; text-align:right; margin-bottom:5px;">
                        <br>
                        <button class="btn-edit-item" onclick="apriModificaProdotto(${idx})"><i class="fa fa-pencil"></i></button>
                        <button class="btn-del-item" onclick="rimuoviRigaModifica(${idx})"><i class="fa fa-trash"></i></button>
                    </div>
                </div>
                ${turniHtml}
            </div>
        `;
    });
    
    ricalcolaTotaleEditLive();
};

window.updateEditField = (idx, field, value) => {
    if(field === 'prezzo') currentEditProducts[idx].prezzo = parseFloat(value) || 0;
    else if(field === 'nome') currentEditProducts[idx].nome = value;
    ricalcolaTotaleEditLive();
};

window.apriModificaProdotto = (index) => {
    const item = currentEditProducts[index];
    if (item.biGustoRaw) {
        openStirataEditMode(item, index, 'EDIT_ORDER');
    } else {
        editingProductIndex = index;
        window.modificationContext = 'EDIT_ORDER'; 
        tempItem = { ...item }; 
        prepareModalForEdit(tempItem);
    }
};

window.apriModificaProdottoNuovo = (index) => {
    const item = tempNewOrderItems[index];
    if (item.biGustoRaw) {
        openStirataEditMode(item, index, 'NEW_ORDER');
    } else {
        editingProductIndex = index;
        window.modificationContext = 'NEW_ORDER'; 
        tempItem = { ...item }; 
        prepareModalForEdit(tempItem);
    }
};

window.openStirataEditMode = (item, index, context) => {
    window.stirataContext = context;
    window.modificationContext = context; 
    
    if(context === 'NEW_ORDER') window.editingProductIndex = index;
    else if(context === 'CART_EDIT') window.editingCartIndex = index;
    else if(context === 'EDIT_ORDER') window.editingProductIndex = index;

    window.biGustoData = JSON.parse(JSON.stringify(item.biGustoRaw));

    const ps = window.MENU.filter(p => p.cat === 'stirata');
    ps.sort((a,b)=>a.nome.localeCompare(b.nome));
    const options = `<option value="">-- Seleziona Gusto --</option>` + ps.map(p => `<option value="${p.id}">${p.nome} (€${parseFloat(p.prezzo).toFixed(2)})</option>`).join('');
    
    const sel1 = document.getElementById('bg-select-1');
    const sel2 = document.getElementById('bg-select-2');
    
    sel1.innerHTML = options;
    sel2.innerHTML = options;

    sel1.value = window.biGustoData.h1.id || "";
    sel2.value = window.biGustoData.h2.id || "";

    document.getElementById('bg-mods-1').innerHTML = window.biGustoData.h1.details.join(' ');
    document.getElementById('bg-mods-2').innerHTML = window.biGustoData.h2.details.join(' ');
    document.getElementById('bg-main-note').value = window.biGustoData.note || "";

    document.getElementById('btn-mod-1').disabled = !window.biGustoData.h1.id;
    document.getElementById('btn-mod-2').disabled = !window.biGustoData.h2.id;

    updateBiGustoPrice();
    document.getElementById('modal-stirata').style.display = 'flex';
};

function prepareModalForEdit(item) {
    const menuItem = window.MENU.find(m => m.nome === item.nome);
    if (menuItem && !item.cat) {
        item.cat = menuItem.cat; 
    }

    document.getElementById('m-nome').innerText = "Modifica: " + item.nome;
    document.getElementById('ing-search').value = "";
    
    tempAddList.clear();
    tempRemList.clear();
    
    const currentDetails = item.dettagli || "";
    window.INGS.forEach(i => { if(currentDetails.includes(`+${i.nome}`)) tempAddList.add(i.nome); });
    window.RIMS.forEach(r => { if(currentDetails.includes(`-${r.nome}`)) tempRemList.add(r.nome); });
    
    const noIngCats = ['bibita', 'bibita_lattina', 'bibita_bottiglia', 'birra', 'vino', 'amaro', 'dolce', 'caffe'];
    const hide = noIngCats.includes(item.cat);

    document.getElementById('ing-search').style.display = hide ? 'none' : 'block';
    document.getElementById('m-ings-add').style.display = hide ? 'none' : 'grid';
    document.getElementById('m-ings-add').previousElementSibling.style.display = hide ? 'none' : 'block'; 
    document.getElementById('m-ings-rem').style.display = hide ? 'none' : 'grid';
    document.getElementById('m-ings-rem').previousElementSibling.style.display = hide ? 'none' : 'block'; 

    renderIngredientsModal();
    document.getElementById('m-extra').value = ""; 
    document.getElementById('modal-item').style.display = 'flex';
}

window.closeItemModal = () => {
    document.getElementById('modal-item').style.display = 'none';
    editingProductIndex = null;
};

window.filterIngredients = (val) => {
    renderIngredientsModal(val.toLowerCase());
};

window.toggleIngSelection = (name, type) => {
    if (type === 'add') {
        if (tempAddList.has(name)) tempAddList.delete(name);
        else tempAddList.add(name);
    } else {
        if (tempRemList.has(name)) tempRemList.delete(name);
        else tempRemList.add(name);
    }
    const currentSearch = document.getElementById('ing-search').value;
    renderIngredientsModal(currentSearch);
};

window.renderIngredientsModal = (filter = "") => {
    const addContainer = document.getElementById('m-ings-add'); 
    const remContainer = document.getElementById('m-ings-rem');
    filter = filter.toLowerCase();

    const filteredIngs = window.INGS.filter(i => i.nome.toLowerCase().includes(filter));
    filteredIngs.sort((a, b) => a.nome.localeCompare(b.nome, undefined, { sensitivity: 'base' }));

    addContainer.innerHTML = filteredIngs.map(i => {
        const isActive = tempAddList.has(i.nome);
        return `<div class="ing-btn ${isActive ? 'active-add' : ''}" onclick="toggleIngSelection('${i.nome.replace(/'/g, "\\'")}', 'add')">${i.nome}</div>`;
    }).join('');
    
    let sourceRemovals = window.RIMS; 
    const filteredRims = sourceRemovals.filter(r => r.nome.toLowerCase().includes(filter));
    filteredRims.sort((a, b) => a.nome.localeCompare(b.nome, undefined, { sensitivity: 'base' }));

    remContainer.innerHTML = filteredRims.map(r => {
        const isActive = tempRemList.has(r.nome);
        return `<div class="ing-btn ${isActive ? 'active-rem' : ''}" onclick="toggleIngSelection('${r.nome.replace(/'/g, "\\'")}', 'rem')">${r.nome}</div>`;
    }).join('');
};

window.saveCustomItem = () => {
    let det = []; 
    let extra = 0;
    
    if(tempItem.cat === 'gf') det.push('<span class="tag-gf">❌🌾 GLUTEN FREE</span>');
    
    tempAddList.forEach(name => {
        det.push(`<span class="tag-add">+${name}</span>`);
        const ing = window.INGS.find(x => x.nome.trim().toLowerCase() === name.trim().toLowerCase());
        if(ing) extra += parseFloat(ing.prezzo || 0);
    });
    
    tempRemList.forEach(name => {
        det.push(`<span class="tag-rem">-${name}</span>`);
        let rim = window.RIMS.find(r => r.nome.trim().toLowerCase() === name.trim().toLowerCase());
        if (!rim) rim = window.INGS.find(i => i.nome.trim().toLowerCase() === name.trim().toLowerCase());
        if(rim) extra -= Math.abs(parseFloat(rim.prezzo || 0));
    });
    
    const note = document.getElementById('m-extra').value;
    if(note) det.push(note);
    
    const dettagliString = det.length > 0 ? det.join(" ") : "Normale";
    const originalMenuItem = window.MENU.find(m => m.nome === tempItem.nome);
    const basePrice = originalMenuItem ? parseFloat(originalMenuItem.prezzo) : parseFloat(tempItem.prezzo); 
    const finalPrice = basePrice + extra;
    
    if (window.modificationContext === 'NEW_ORDER') {
        if (editingProductIndex !== null) {
            tempNewOrderItems[editingProductIndex].dettagli = dettagliString;
            tempNewOrderItems[editingProductIndex].prezzo = finalPrice;
            renderNewOrderPreview();
        }
    } else if (window.modificationContext === 'EDIT_ORDER') {
        if (editingProductIndex !== null) {
            currentEditProducts[editingProductIndex].dettagli = dettagliString;
            currentEditProducts[editingProductIndex].prezzo = finalPrice;
            renderEditProdotti();
        }
    } else if (window.modificationContext === 'CART_EDIT') {
        if (window.editingCartIndex !== null) {
            window.carrello[window.editingCartIndex].dettagli = dettagliString;
            window.carrello[window.editingCartIndex].prezzo = finalPrice;
            updateCartUI();
        }
    } else if (window.modificationContext === 'CART') {
        const newItem = { ...tempItem, qta: 1, dettagli: dettagliString, prezzo: finalPrice, turno: 1 };
        window.carrello.push(newItem);
        updateCartUI();
    } else if (window.modificationContext === 'BG_1') {
        window.biGustoData.h1.extraPrice = extra;
        window.biGustoData.h1.details = det; 
        document.getElementById('bg-mods-1').innerHTML = det.join(' ');
        updateBiGustoPrice();
        document.getElementById('modal-item').style.display = 'none'; 
        document.getElementById('modal-stirata').style.display = 'flex'; 
    } else if (window.modificationContext === 'BG_2') {
        window.biGustoData.h2.extraPrice = extra;
        window.biGustoData.h2.details = det;
        document.getElementById('bg-mods-2').innerHTML = det.join(' ');
        updateBiGustoPrice();
        document.getElementById('modal-item').style.display = 'none'; 
        document.getElementById('modal-stirata').style.display = 'flex'; 
    }

    closeItemModal();
};

window.cambiaQtaModifica = (idx, delta) => {
    if(currentEditProducts[idx].qta + delta > 0) {
        currentEditProducts[idx].qta += delta;
        renderEditProdotti();
    }
};

window.rimuoviRigaModifica = (idx) => {
    Swal.fire({ title: 'Rimuovere prodotto?', icon: 'warning', showCancelButton: true }).then((result) => {
        if (result.isConfirmed) {
            currentEditProducts.splice(idx, 1);
            renderEditProdotti();
        }
    });
};

window.aggiungiVoceManuale = () => {
    const nomeInput = document.getElementById('manual-name');
    const prezzoInput = document.getElementById('manual-price');
    const catInput = document.getElementById('manual-cat');
    const turnoInput = document.getElementById('manual-turn');

    if (!nomeInput || !prezzoInput) return;

    const nome = nomeInput.value.trim();
    const prezzo = parseFloat(prezzoInput.value);
    const catSelezionata = catInput ? catInput.value : "";
    const turnoSelezionato = turnoInput ? (parseInt(turnoInput.value) || 1) : 1;

    if (nome && !isNaN(prezzo)) {
        let foundCat = 'varie'; 
        if (catSelezionata && catSelezionata !== "") {
            foundCat = catSelezionata;
        } else {
            const menuItem = window.MENU.find(m => m.nome.toLowerCase() === nome.toLowerCase());
            if (menuItem) foundCat = menuItem.cat;
        }

        currentEditProducts.push({
            nome: nome,
            prezzo: prezzo,
            qta: 1,
            dettagli: 'Normale',
            cat: foundCat, 
            turno: turnoSelezionato
        });

        renderEditProdotti(); 
        nomeInput.value = "";
        prezzoInput.value = "";
        if(catInput) catInput.value = "";
    } else {
        Swal.fire("Inserisci nome e prezzo validi.");
    }
};

window.salvaModificheOrdine = async () => {
    if(!currentEditOrderId) return;
    let newTotal = 0;
    
    currentEditProducts.forEach(p => {
        p.prezzo = parseFloat(p.prezzo);
        p.qta = parseFloat(p.qta);
        newTotal += (p.prezzo * p.qta);
        if(p.cat) p.cat = p.cat.toLowerCase();
    });
    
    const nuoviCoperti = parseInt(document.getElementById('edit-coperti').value || 0);
    if(nuoviCoperti > 0) newTotal += (nuoviCoperti * (window.prezzoCopertoLocale || 2.50));

    const isDom = document.getElementById('edit-is-domicilio').checked;
    const indirizzoEdit = document.getElementById('edit-indirizzo').value.trim();
    if (isDom && !indirizzoEdit) return Swal.fire("Attenzione", "Inserisci l'indirizzo per la consegna a domicilio!", "warning");
    const supplementoEdit = getSupplementoEdit();
    newTotal += supplementoEdit;

    const oldOrder = ordiniCache.find(x => x.id === currentEditOrderId) || window.ordiniFuturiCache.find(x => x.id === currentEditOrderId);
    let messaggioTesto = null;
    let oggettiAggiunti = []; 
    let oggettiRimossi = [];

    if (oldOrder && oldOrder.prodotti) {
        const oldGrouped = raggruppaProdotti(oldOrder.prodotti);
        const newGrouped = raggruppaProdotti(currentEditProducts);

        let storniTxt = [];
        let aggiunteTxt = [];

        oldGrouped.forEach(oldItem => {
            const newItem = newGrouped.find(n => n._groupKey === oldItem._groupKey);
            const newQty = newItem ? newItem.qta : 0;
            if (newQty < oldItem.qta) {
                const diff = oldItem.qta - newQty;
                oggettiRimossi.push({ ...oldItem, qta: diff });
                const qtyDisplay = diff % 1 === 0 ? diff : diff.toFixed(3);
                storniTxt.push(`${qtyDisplay}x ${oldItem.nome}`);
            }
        });

        newGrouped.forEach(newItem => {
            const oldItem = oldGrouped.find(o => o._groupKey === newItem._groupKey);
            const oldQty = oldItem ? oldItem.qta : 0;
            if (newItem.qta > oldQty) {
                const diff = newItem.qta - oldQty;
                oggettiAggiunti.push({ ...newItem, qta: diff });
                const qtyDisplay = diff % 1 === 0 ? diff : diff.toFixed(3);
                aggiunteTxt.push(`${qtyDisplay}x ${newItem.nome}`);
            }
        });

        let msgParts = [];
        if (storniTxt.length > 0) msgParts.push("[-] STORNO: " + storniTxt.join(" | "));
        if (aggiunteTxt.length > 0) msgParts.push("[+] AGGIUNTA: " + aggiunteTxt.join(" | "));
        if (msgParts.length > 0) messaggioTesto = msgParts.join(" | ");
    }

    const updateData = {
        tavolo: document.getElementById('edit-tavolo').value,
        coperti: nuoviCoperti,
        nome: document.getElementById('edit-nome').value, 
        cognome: document.getElementById('edit-cognome').value,
        telefono: document.getElementById('edit-tel').value,
        orario: document.getElementById('edit-ora').value,
        note_ordine: document.getElementById('edit-note').value,
        prodotti: currentEditProducts,
        totale: newTotal,
        indirizzo: isDom ? indirizzoEdit : "",
        citofono: isDom ? document.getElementById('edit-citofono').value.trim() : "",
        zona: isDom ? document.getElementById('edit-zona').value.trim() : "",
        cap: isDom ? document.getElementById('edit-cap').value.trim() : "",
        supplemento_consegna: supplementoEdit
    };
    if (isDom) {
        updateData.tipo = 'DOMICILIO';
    } else if (oldOrder && oldOrder.tipo === 'DOMICILIO') {
        updateData.tipo = updateData.tavolo ? 'SALA' : 'ASPORTO';
    }

    if (messaggioTesto) {
        updateData.messaggio_cucina = messaggioTesto;
        updateData.timestamp_messaggio = serverTimestamp();
        updateData.ultime_aggiunte_real = oggettiAggiunti; 
        updateData.ultimi_storni_real = oggettiRimossi;
    }

    await updateDoc(doc(db, "ordini", currentEditOrderId), updateData);

    if (oggettiAggiunti.length > 0 && window.scalaScorte) await window.scalaScorte(oggettiAggiunti, -1);
    if (oggettiRimossi.length > 0 && window.scalaScorte) await window.scalaScorte(oggettiRimossi, 1);

    Swal.fire({title:"Salvato!", icon:'success', timer:800, showConfirmButton:false});
    chiudiModifica();
};

window.inviaSegnaleVia = async (id, turno) => {
    Swal.fire({
        title: `📢 Chiamare TURNO ${turno}?`,
        showCancelButton: true,
        confirmButtonText: 'Sì, chiama'
    }).then(async (result) => {
        if(result.isConfirmed) {
            await updateDoc(doc(db, "ordini", id), {
                messaggio_cucina: `VIA TURNO ${turno}`,
                timestamp_messaggio: serverTimestamp(),
                turni_chiamati: arrayUnion(parseInt(turno)) 
            });
        }
    });
};

function enquePrint(id, reparto, type) {
    printQueue.push({id, reparto, type});
    processPrintQueue();
}

function processPrintQueue() {
    if(printingNow || printQueue.length === 0) return;
    printingNow = true;
    const job = printQueue.shift();
    
    if(job.type === 'VIA') {
        stampaVia(job.id, null, null, job.reparto); 
    } else {
        stampa(job.id, job.reparto);
    }

    setTimeout(() => {
        printingNow = false;
        processPrintQueue();
    }, 1000); 
}

// --- GESTIONE CHIAMATA TURNI (Campanello) CON STAMPA ETICHETTE CUCINA ---
function gestisciChiamataTurno(o, rep, printerIp) {
    const messaggio = o.messaggio_cucina;
    console.log(`Gestione Chiamata ${rep}:`, messaggio); 

    const match = messaggio.match(/TURNO\s*(\d+)/i) || messaggio.match(/VIA\s*(\d+)/i);
    const targetTurn = match ? parseInt(match[1]) : null;
    
    if(!targetTurn) {
        console.warn("Nessun numero turno trovato nel messaggio:", messaggio);
        return; 
    }

    const tuttiProdottiTurno = (o.prodotti || []).filter(p => parseInt(p.turno || 1) === targetTurn);
    if(tuttiProdottiTurno.length === 0) return;

    const hasPizza = tuttiProdottiTurno.some(p => {
        let c = (p.cat||'').toLowerCase();
        return c === 'pizza' || c === 'stirata' || c === 'gf' || c === 'speciale' || c === 'calzone' || c.includes('focac');
    });
    
    const hasCucina = tuttiProdottiTurno.some(p => {
        let c = (p.cat||'').toLowerCase();
        return c === 'primo' || c === 'secondo' || c === 'contorno' || c === 'ant_ristorante' || c.includes('cuc') || c.includes('frit');
    });

    let mixMsg = "";
    if (rep === 'pizzeria' && hasCucina) mixMsg = "*** CON CUCINA ***";
    if (rep === 'cucina' && hasPizza) mixMsg = "*** CON PIZZERIA ***";

    const itemsToPrint = tuttiProdottiTurno.filter(p => {
        let cat = (p.cat || 'varie').toLowerCase();
        let gruppo = 'altro';
        
        if (cat === 'pizza' || cat.includes('piz') || cat==='stirata' || cat==='gf' || cat==='speciale' || cat.includes('ant_pizz') || cat.includes('calz') || cat.includes('foc')) {
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

    if(itemsToPrint.length === 0) return;

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
    const infoServizio = window.getRigheStampaCucinaFiltrate(o);
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

    d.push(`\n\n\x1B\x61\x01${new Date().toLocaleDateString('it-IT')} ${new Date().toLocaleTimeString('it-IT')}\n\x1B\x64\x08\x1D\x56\x01`);
    qz.print(qz.configs.create({ host: printerIp, port: 9100 }), d).catch(err => console.error("Errore QZ:", err));
}

window.stampaVia = (id, _u1, _u2, reparto) => {
    if (!printerOn) return;
    const o = ordiniCache.find(x => x.id === id);
    if(!o || !o.messaggio_cucina) return; 

    const repKey = reparto.toLowerCase().trim();
    const messaggio = o.messaggio_cucina;
    let printerIp = '192.168.1.131'; 
    if (PRINTER_CONFIG[repKey] && PRINTER_CONFIG[repKey].ip) printerIp = PRINTER_CONFIG[repKey].ip;

    if (messaggio.includes("VIA") && !messaggio.includes("SPOSTAMENTO") && !messaggio.includes("AGGIUNTA") && !messaggio.includes("STORNO")) {
        if (messaggio.includes("TURNO")) { gestisciChiamataTurno(o, repKey, printerIp); return; }
    }

    if (!messaggio.includes("AGGIUNTA") && !messaggio.includes("STORNO") && !messaggio.includes("SPOSTAMENTO")) return;

    const aggiunte = o.ultime_aggiunte_real || [];
    const storni = o.ultimi_storni_real || [];
    const spostamenti = o.ultimi_spostamenti_real || [];

    const getGruppo = (cat) => {
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

    if (aggiunteFiltrate.length === 0 && storniFiltrati.length === 0 && spostamentiFiltrati.length === 0) return;

    var data = [];
    data.push('\x1B\x40\x1B\x61\x01'); 
    data.push('*** AGGIORNAMENTO ***\n'); 
    let headTav = o.tavolo ? 'TAVOLO ' + o.tavolo : (o.nome || 'ASPORTO');
    if (o.tavolo && o.coperti > 0) headTav += ` (Cop: ${o.coperti})`;
    data.push('\x1D\x21\x11' + headTav + '\n\x1D\x21\x00');

    const infoServizio = window.getRigheStampaCucinaFiltrate(o);
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

    data.push(`\n\n\x1B\x61\x01${new Date().toLocaleDateString('it-IT')} ${new Date().toLocaleTimeString('it-IT')}\n\x1B\x64\x08\x1D\x56\x01`); 
    qz.print(qz.configs.create({ host: printerIp, port: 9100 }, { encoding: 'windows-1252' }), data).catch(e => console.error(e));
};

window.chiudiTavolo = async (id) => {
    Swal.fire({
        title: 'Chiudere il tavolo?',
        text: "Sparirà dalla griglia ma resterà nelle statistiche.",
        icon: 'question',
        showCancelButton: true
    }).then(async (result) => {
        if (result.isConfirmed) {
            await updateDoc(doc(db, "ordini", id), { stato: 'Consegnato' });
        }
    });
};

window.archiviaMessaggio = (id) => updateDoc(doc(db, "ordini", id), { messaggio_cucina: null });

window.vaiOggi = () => { 
    let d = new Date();
    currentDateView = d; 
    caricaOrdiniPerData(currentDateView); 
};

window.spostaData = (giorni) => { currentDateView.setDate(currentDateView.getDate() + giorni); caricaOrdiniPerData(currentDateView); };
window.cambiaDataManuale = (val) => { if(!val) return; currentDateView = new Date(val); caricaOrdiniPerData(currentDateView); };
window.cambiaStato = (id, s) => updateDoc(doc(db, "ordini", id), {stato:s});

window.eliminaOrdine = (id) => { 
    Swal.fire({
        title: 'Annullare Ordine?',
        text: "L'ordine finirà nel Cestino e potrai ripristinarlo se necessario.",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d32f2f',
        cancelButtonColor: '#3085d6',
        confirmButtonText: 'Sì, annulla!'
    }).then(async (result) => {
        if (result.isConfirmed) {
            const ord = ordiniCache.find(x => x.id === id);
            await updateDoc(doc(db, "ordini", id), { 
                stato: "Annullato",
                data_annullamento: serverTimestamp()
            });
            if (ord && ord.prodotti) await window.scalaScorte(ord.prodotti, 1);
            Swal.fire({title:'Annullato!', icon:'success', timer:1000, showConfirmButton:false});
        }
    });
};

window.toggleAudio = (val) => { audioOn = val; }; 

window.togglePrinter = (val) => { 
    printerOn = val; 
    if (val) {
        Swal.fire({toast: true, position: 'top-end', icon: 'success', title: '🖨️ Stampanti ATTIVATE', showConfirmButton: false, timer: 1500});
    } else {
        Swal.fire({toast: true, position: 'top-end', icon: 'error', title: '🖨️ Stampanti DISATTIVATE', showConfirmButton: false, timer: 1500});
    }
};

window.salvaChiusura = async (val) => { await setDoc(doc(db, "impostazioni", "negozio"), { giorno_riposo: val }, { merge: true }); };

window.updateOvenLimit = async (val) => {
    await setDoc(doc(db, "impostazioni", "forno"), { limite_pizze: parseInt(val), ultima_modifica: serverTimestamp() }, { merge: true });
    showToast("Limite forno aggiornato a " + val + " pizze ogni 15 minuti.");
};

window.toggleCrossSell = async (val) => {
    await setDoc(doc(db, "impostazioni", "app_cliente"), { cross_sell_bibite: val }, { merge: true });
    showToast(val ? "Cross-Selling Bibite ATTIVATO sull'App" : "Cross-Selling DISATTIVATO");
};

window.esciDalGestionale = () => {
    Swal.fire({
        title: 'Uscire dal gestionale?',
        text: "Dovrai reinserire la password per accedere.",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d32f2f',
        cancelButtonColor: '#444',
        confirmButtonText: 'Sì, esci',
        cancelButtonText: 'Annulla'
    }).then(async (result) => {
        if (result.isConfirmed) {
            sessionStorage.setItem('cassa_manual_logout', 'true');
            await signOut(auth);
            window.location.reload();
        }
    });
};

window.renderTables = () => {};

window.callCourseFromMap = async (docId, tavolo, msg) => { 
    event.stopPropagation(); 
    Swal.fire({title:`Dare il ${msg} al TAVOLO ${tavolo}?`, showCancelButton:true}).then(async (r)=>{
        if(r.isConfirmed) {
            await updateDoc(doc(db, "ordini", docId), { messaggio_cucina: msg, timestamp_messaggio: serverTimestamp() });
        }
    });
};

window.openOrder = (n) => {
    window.selT = n; const occ = window.tavoliOccupati[n];
    window.currentDocId = occ ? occ.id : null;
    window.carrello = occ && occ.prodotti ? JSON.parse(JSON.stringify(occ.prodotti)) : [];
    window.prodottiOriginali = occ && occ.prodotti ? JSON.parse(JSON.stringify(occ.prodotti)) : [];
    window.currentCoperti = occ ? (occ.coperti || 2) : 2;
    document.getElementById('screen-title').innerText = `TAVOLO ${n}`;
    document.getElementById('num-coperti').innerText = window.currentCoperti;
    renderCats();
    document.getElementById('waiter-screen').style.display = 'flex';
    toggleMobileCart(false);
    updateCartUI();
};

window.toggleMobileCart = (show) => {
    const panel = document.getElementById('cart-panel');
    if (panel) panel.style.display = show ? 'flex' : (window.innerWidth >= 768 ? 'flex' : 'none');
};

window.renderProds = (c, search = "") => {
    const container = document.getElementById('prod-list');
    if (!container) return;
    container.innerHTML = "";
    let items = search ? window.MENU.filter(p => p.nome.toLowerCase().includes(search.toLowerCase())) : window.MENU.filter(p => p.cat === c);
    items.sort((a,b) => parseFloat(a.prezzo) - parseFloat(b.prezzo));
    items.forEach(p => {
        const div = document.createElement('div');
        const isEsaurito = p.scorta !== null && p.scorta !== undefined && p.scorta <= 0;
        div.className = isEsaurito ? 'prod-card disabled' : 'prod-card';
        const badgeEsaurito = isEsaurito ? '<span class="tag-sold-out">ESAURITO</span>' : '';
        const scortaText = (p.scorta !== null && p.scorta !== undefined && p.scorta > 0) ? `(Rimanenti: ${p.scorta})` : '';
        const actionClick = isEsaurito ? '' : `onclick="quickAdd('${p.id}')"`;
        const infoClick = isEsaurito ? '' : `onclick="openItemModal('${p.id}')"`;
        div.innerHTML = `<div class="prod-info" ${infoClick}><b>${p.nome} ${badgeEsaurito}</b><small>€${parseFloat(p.prezzo).toFixed(2)} ${p.isPeso?'/Kg':''} <span style="color:#ff9800">${scortaText}</span></small></div><div class="prod-add-btn" ${actionClick}>+</div>`;
        container.appendChild(div);
    });
};

window.quickAdd = async (id) => { 
    const p = window.MENU.find(x => x.id === id); 
    let details = 'Normale'; 
    if(p.cat === 'gf') details = '<span class="tag-gf">❌🌾 GLUTEN FREE</span>';
    let quantita = 1;
    let notePeso = "";

    if (p.isPeso) {
        const { value: grammi } = await Swal.fire({
            title: `Peso per ${p.nome}`,
            input: 'number',
            inputLabel: 'Inserisci peso in GRAMMI (es. 450 per 0.45kg)',
            inputPlaceholder: 'es. 500',
            showCancelButton: true,
            confirmButtonText: 'Conferma Peso',
            inputValidator: (value) => { if (!value || value <= 0) return 'Inserisci un peso valido!'; }
        });

        if (grammi) {
            quantita = parseFloat(grammi) / 1000;
            notePeso = `(${grammi}g)`;
            if(details === 'Normale') details = notePeso;
            else details += " " + notePeso;
        } else {
            return; 
        }
    }

    window.carrello.push({...p, qta: quantita, dettagli: details, turno:1}); 
    updateCartUI(); 
};

window.openItemModal = (id) => {
    const p = window.MENU.find(x => x.id === id); 
    window.tempItem = { ...p };
    window.modificationContext = 'CART'; 
    window.editingCartIndex = null;
    
    const noIngCats = ['bibita', 'bibita_lattina', 'bibita_bottiglia', 'birra', 'vino', 'amaro', 'dolce', 'caffe'];
    const hide = noIngCats.includes(p.cat);
    
    document.getElementById('ing-search').style.display = hide ? 'none' : 'block';
    document.getElementById('m-ings-add').style.display = hide ? 'none' : 'grid';
    document.getElementById('m-ings-add').previousElementSibling.style.display = hide ? 'none' : 'block';
    document.getElementById('m-ings-rem').style.display = hide ? 'none' : 'grid';
    document.getElementById('m-ings-rem').previousElementSibling.style.display = hide ? 'none' : 'block';

    document.getElementById('m-nome').innerText = p.nome;
    document.getElementById('ing-search').value = ""; 
    renderIngredientsModal(); 
    document.getElementById('m-extra').value = "";
    document.getElementById('modal-item').style.display = 'flex';
};

window.editGroupItem = (groupIndex) => {
    const groupItem = window.groupedCartView[groupIndex];
    let realIndex = -1;
    for (let i = window.carrello.length - 1; i >= 0; i--) {
        const c = window.carrello[i];
        if (c.id === groupItem.id && c.dettagli === groupItem.dettagli && c.turno === groupItem.turno) {
            realIndex = i;
            break;
        }
    }
    if (realIndex > -1) editCartItem(realIndex);
};

window.editCartItem = (index) => {
    const item = window.carrello[index];
    window.editingCartIndex = index;

    if(item.cat === 'stirata' && item.biGustoRaw) {
        window.biGustoData = JSON.parse(JSON.stringify(item.biGustoRaw));
        const ps = window.MENU.filter(p => p.cat === 'stirata');
        ps.sort((a,b)=>a.nome.localeCompare(b.nome));
        const options = `<option value="">-- Seleziona Gusto --</option>` + ps.map(p => `<option value="${p.id}">${p.nome} (€${parseFloat(p.prezzo).toFixed(2)})</option>`).join('');
        document.getElementById('bg-select-1').innerHTML = options;
        document.getElementById('bg-select-2').innerHTML = options;
        document.getElementById('bg-select-1').value = window.biGustoData.h1.id || "";
        document.getElementById('bg-select-2').value = window.biGustoData.h2.id || "";
        document.getElementById('bg-mods-1').innerHTML = window.biGustoData.h1.details.join(' ');
        document.getElementById('bg-mods-2').innerHTML = window.biGustoData.h2.details.join(' ');
        document.getElementById('bg-main-note').value = "";
        document.getElementById('btn-mod-1').disabled = !window.biGustoData.h1.id;
        document.getElementById('btn-mod-2').disabled = !window.biGustoData.h2.id;
        updateBiGustoPrice();
        document.getElementById('modal-stirata').style.display = 'flex';
    } else {
        const originalProd = window.MENU.find(p => p.nome === item.nome);
        if(originalProd) {
            window.tempItem = { ...originalProd };
            if(item.cat) window.tempItem.cat = item.cat; 
            window.modificationContext = 'CART_EDIT';
            prepareModalForEdit(window.tempItem);
        }
    }
};

window.openStirataModal = () => {
    window.stirataContext = 'CART'; 
    window.biGustoData = { h1: {id:null, price:0, extraPrice:0, details:[], manual:false}, h2: {id:null, price:0, extraPrice:0, details:[], manual:false} };
    window.editingCartIndex = null;
    
    const ps = window.MENU.filter(p => p.cat === 'stirata'); ps.sort((a,b)=>a.nome.localeCompare(b.nome));
    const options = `<option value="">-- Seleziona Gusto --</option>` + ps.map(p => `<option value="${p.id}">${p.nome} (€${parseFloat(p.prezzo).toFixed(2)})</option>`).join('');
    document.getElementById('bg-select-1').innerHTML = options; document.getElementById('bg-select-2').innerHTML = options;
    
    document.getElementById('man-gusto-1').value = ""; document.getElementById('price-gusto-1').value = "";
    document.getElementById('man-gusto-2').value = ""; document.getElementById('price-gusto-2').value = "";
    window.toggleStirataManual(1, false); window.toggleStirataManual(2, false);
    
    document.getElementById('bg-mods-1').innerHTML = ""; document.getElementById('bg-mods-2').innerHTML = "";
    document.getElementById('bg-main-note').value = "";
    document.getElementById('btn-mod-1').disabled = true; document.getElementById('btn-mod-2').disabled = true;
    document.getElementById('bg-tot-price').innerText = "0.00";
    document.getElementById('btn-confirm-stirata').disabled = true; document.getElementById('btn-confirm-stirata').style.opacity = 0.5;
    document.getElementById('modal-stirata').style.display = 'flex';
};

window.openStirataForNewOrder = () => {
    window.openStirataModal(); 
    window.stirataContext = 'NEW_ORDER'; 
    window.modificationContext = 'NEW_ORDER';
    window.editingProductIndex = null;
};

window.toggleStirataManual = (half, forceState) => {
    const state = forceState !== undefined ? forceState : !window.biGustoData['h'+half].manual;
    window.biGustoData['h'+half].manual = state;
    
    const btn = document.getElementById(`btn-man-${half}`); 
    const sel = document.getElementById(`bg-select-${half}`); 
    const divMan = document.getElementById(`div-man-${half}`);
    
    if (state) { 
        if(btn) { btn.style.background = '#ffea00'; btn.style.color = 'black'; btn.style.borderColor = '#ffea00'; }
        if(sel) sel.style.display = 'none'; 
        if(divMan) divMan.style.display = 'flex'; 
    } else { 
        if(btn) { btn.style.background = 'transparent'; btn.style.color = '#666'; btn.style.borderColor = '#999'; }
        if(sel) sel.style.display = 'block'; 
        if(divMan) divMan.style.display = 'none'; 
    }
    
    window.biGustoData['h'+half].details = []; 
    window.biGustoData['h'+half].extraPrice = 0; 
    const mods = document.getElementById(`bg-mods-${half}`);
    if(mods) mods.innerHTML = ""; 
    
    window.updateBiGustoHalf(half);
};

window.updateBiGustoHalf = (halfNum) => {
    const isManual = window.biGustoData['h'+halfNum].manual;
    const btnMod = document.getElementById(`btn-mod-${halfNum}`);
    const halfKey = 'h'+halfNum;

    if (isManual) {
        window.biGustoData[halfKey].id = 'MANUAL_TEMP'; 
        window.biGustoData[halfKey].name = document.getElementById(`man-gusto-${halfNum}`).value || ''; 
        window.biGustoData[halfKey].price = parseFloat(document.getElementById(`price-gusto-${halfNum}`).value) || 0; 
        btnMod.disabled = false;
    } else {
        const select = document.getElementById(`bg-select-${halfNum}`);
        const id = select.value;
        if (id) {
            const p = window.MENU.find(x => x.id === id);
            if (p) {
                window.biGustoData[halfKey].id = p.id; 
                window.biGustoData[halfKey].name = p.nome; 
                window.biGustoData[halfKey].price = parseFloat(p.prezzo); 
                btnMod.disabled = false;
            }
        } else {
            window.biGustoData[halfKey].id = null; 
            window.biGustoData[halfKey].price = 0; 
            btnMod.disabled = true;
        }
    }
    window.updateBiGustoPrice();
};

window.updateBiGustoPrice = () => {
    const d = window.biGustoData;
    const h1Price = d.h1 && d.h1.price ? d.h1.price : 0;
    const h2Price = d.h2 && d.h2.price ? d.h2.price : 0;
    const h1Extra = d.h1 && d.h1.extraPrice ? d.h1.extraPrice : 0;
    const h2Extra = d.h2 && d.h2.extraPrice ? d.h2.extraPrice : 0;

    const basePrice = Math.max(h1Price, h2Price);
    const totalExtra = h1Extra + h2Extra;
    document.getElementById('bg-tot-price').innerText = (basePrice + totalExtra).toFixed(2);
    
    const ready = d.h1 && d.h1.id && d.h2 && d.h2.id;
    const btn = document.getElementById('btn-confirm-stirata');
    if(btn) {
        btn.disabled = !ready;
        btn.style.opacity = ready ? 1 : 0.5;
        btn.style.cursor = ready ? 'pointer' : 'not-allowed';
    }
};

window.editHalf = (halfNum) => {
    const halfData = window.biGustoData['h'+halfNum]; if(!halfData.id) return;
    const p = window.MENU.find(x => x.id === halfData.id) || { nome: halfData.name, prezzo: halfData.price, cat: 'stirata' };
    window.tempItem = { ...p }; window.modificationContext = 'BG_' + halfNum; 
    document.getElementById('m-nome').innerText = "Modifica Metà: " + p.nome;
    document.getElementById('ing-search').value = ""; renderIngredientsModal(); 
    document.getElementById('m-extra').value = ""; 
    document.getElementById('modal-stirata').style.display = 'none';
    document.getElementById('modal-item').style.display = 'flex';
};

window.confirmStirata = () => {
    const d = window.biGustoData;
    const finalPrice = parseFloat(document.getElementById('bg-tot-price').innerText);
    const mainNote = document.getElementById('bg-main-note').value;
    d.note = mainNote; 

    let desc = `<b>1/2</b> ${d.h1.name}`; if(d.h1.details.length > 0) desc += ` <br>${d.h1.details.join(' ')}`;
    desc += `<br><b>1/2</b> ${d.h2.name}`; if(d.h2.details.length > 0) desc += ` <br>${d.h2.details.join(' ')}`;
    if(mainNote) desc += `<br><b>Note:</b> ${window.escapeHtml(mainNote)}`;

    const componentiScorta = [];
    if (!d.h1.manual && d.h1.id) componentiScorta.push(d.h1.id);
    if (!d.h2.manual && d.h2.id) componentiScorta.push(d.h2.id);

    const newItem = {
        nome: "STIRATA BI-GUSTO",
        prezzo: finalPrice,
        qta: 1,
        cat: 'stirata',
        turno: 1,
        dettagli: desc,
        biGustoRaw: JSON.parse(JSON.stringify(d)),
        isPeso: false,
        componenti: componentiScorta
    };
    
    if (window.stirataContext === 'NEW_ORDER') {
        if(window.editingProductIndex !== null) {
            tempNewOrderItems[window.editingProductIndex] = newItem;
            window.editingProductIndex = null;
        } else {
            tempNewOrderItems.push(newItem);
        }
        renderNewOrderPreview();
    } else if (window.stirataContext === 'EDIT_ORDER') {
        if(window.editingProductIndex !== null) {
            currentEditProducts[window.editingProductIndex] = newItem;
            window.editingProductIndex = null;
        }
        renderEditProdotti();
    } else {
        if(window.editingCartIndex !== null) { 
            newItem.turno = window.carrello[window.editingCartIndex].turno; 
            window.carrello[window.editingCartIndex] = newItem; 
            window.editingCartIndex = null; 
        } 
        else { window.carrello.push(newItem); }
        updateCartUI();
    }
    
    document.getElementById('modal-stirata').style.display = 'none'; 
};

window.updateCartUI = () => {
    const list = document.getElementById('cart-list-ui');
    if (!list) return;
    list.innerHTML = "";
    let tot = 0;

    window.carrello.sort((a,b) => (a.turno || 1) - (b.turno || 1));

    window.groupedCartView = [];
    window.carrello.forEach((item) => {
        tot += (item.prezzo * item.qta);
        let existingGroup = window.groupedCartView.find(g => g.id === item.id && g.dettagli === item.dettagli && g.turno === item.turno);
        if (existingGroup) {
            existingGroup.displayQty = parseFloat(existingGroup.displayQty) + parseFloat(item.qta || 1);
        } else {
            existingGroup = { ...item, displayQty: parseFloat(item.qta || 1) };
            window.groupedCartView.push(existingGroup);
        }
    });

    const copertiCost = (window.currentCoperti || 0) * (window.prezzoCopertoLocale || 2.50);
    const totalWithCoperto = tot + copertiCost;

    document.getElementById('cart-total-display').innerText = `€ ${totalWithCoperto.toFixed(2)}`;
    const itemCount = window.carrello.reduce((s, i) => s + i.qta, 0);
    
    if(document.getElementById('mob-cart-count')) {
        document.getElementById('mob-cart-count').innerText = itemCount;
        document.getElementById('mob-cart-total').innerText = `€ ${totalWithCoperto.toFixed(2)}`;
    }

    const colors = ["", "#1e88e5", "#fdd835", "#8e24aa", "#43a047", "#fb8c00"];
    
    list.innerHTML += `<div class="cart-item" style="border-left:4px solid #aaa; background:#eee;">
        <div class="cart-row-top">
            <div class="cart-prod-name">COPERTO x ${window.currentCoperti}</div>
            <div class="cart-controls"><b style="color:#333; font-size:13px;">€${copertiCost.toFixed(2)}</b></div>
        </div>
    </div>`;

    window.groupedCartView.forEach((groupItem, idx) => {
        const turnoColor = colors[groupItem.turno] || colors[1];
        const displayQta = groupItem.isPeso ? groupItem.displayQty.toFixed(3) : groupItem.displayQty;
        
        list.innerHTML += `
        <div class="cart-item" style="border-left-color:${turnoColor}">
            <div class="cart-row-top">
                <div class="cart-prod-name">${window.escapeHtml(groupItem.nome)}</div>
                <div class="cart-controls">
                    <div class="qty-box">
                        <button class="btn-qty" onclick="changeGroupQty(${idx}, -1)">-</button>
                        <span class="qty-val" style="font-size:11px;">${displayQta}${groupItem.isPeso?'kg':''}</span>
                        <button class="btn-qty" onclick="changeGroupQty(${idx}, 1)">+</button>
                    </div>
                    <b style="color:var(--gold); font-size:13px; margin-right:5px;">€${parseFloat(groupItem.prezzo * groupItem.displayQty).toFixed(2)}</b>
                    <i class="fa fa-pencil btn-edit-cart" onclick="editGroupItem(${idx})"></i>
                    <i class="fa fa-trash btn-trash" onclick="removeGroup(${idx})"></i>
                </div>
            </div>
            <div style="font-size:11px; margin-bottom:8px; line-height:1.3; color:#ccc;">${window.sanitizeHtml(groupItem.dettagli || '')}</div>
            <div class="turno-row">${[1,2,3,4,5].map(t => `<div class="turno-btn ${groupItem.turno==t?'active':''}" onclick="setGroupTurno(${idx},${t})">${t}</div>`).join('')}</div>
        </div>`;
    });
};

window.changeGroupQty = (groupIndex, delta) => {
    const groupItem = window.groupedCartView[groupIndex];
    if(groupItem.isPeso) {
        Swal.fire("Per modificare il peso, rimuovi la riga e reinserisci o usa la matita.");
        return;
    }
    if (delta > 0) {
        const newItem = { ...groupItem, qta: 1 }; delete newItem.displayQty; window.carrello.push(newItem);
    } else {
        const indexToRemove = window.carrello.findIndex(c => c.id === groupItem.id && c.dettagli === groupItem.dettagli && c.turno === groupItem.turno);
        if (indexToRemove > -1) { window.carrello.splice(indexToRemove, 1); }
    }
    updateCartUI();
};

window.removeGroup = (groupIndex) => {
    const item = window.groupedCartView[groupIndex];
    if (!item) return;

    Swal.fire({
        title: 'Eliminare ' + item.nome + '?',
        text: "Rimuoverà tutti i prodotti di questa riga",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        confirmButtonText: 'Sì, elimina',
        cancelButtonText: 'Annulla'
    }).then((result) => {
        if (result.isConfirmed) {
            window.carrello = window.carrello.filter(prodotto => {
                const stessoNome = prodotto.nome === item.nome;
                let d1 = prodotto.dettagli || ''; if(d1=='Normale') d1='';
                let d2 = item.dettagli || ''; if(d2=='Normale') d2='';
                const stessoDettaglio = d1 === d2;
                const stessoTurno = parseInt(prodotto.turno||1) === parseInt(item.turno||1);
                return !(stessoNome && stessoDettaglio && stessoTurno);
            });
            updateCartUI();
        }
    });
};

window.setGroupTurno = (groupIndex, newTurno) => {
    const groupItem = window.groupedCartView[groupIndex];
    window.carrello.forEach(c => { 
        let d1 = c.dettagli || ''; if(d1=='Normale') d1='';
        let d2 = groupItem.dettagli || ''; if(d2=='Normale') d2='';
        if (c.nome === groupItem.nome && d1 === d2 && parseInt(c.turno||1) === parseInt(groupItem.turno||1)) {
            c.turno = newTurno;
        }
    });
    updateCartUI();
};

window.saveOrder = async () => { 
    if(!window.carrello.length) return Swal.fire("Carrello vuoto!");
    
    const btnConfirm = document.querySelector('.btn-confirm-order');
    if(btnConfirm) { btnConfirm.disabled = true; btnConfirm.innerText = "INVIO IN CORSO..."; }
    
    try {
        const now = new Date();
        const dataLocale = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0') + '-' + String(now.getDate()).padStart(2,'0');
        
        window.carrello.forEach(p => { if(p.cat) p.cat = p.cat.toLowerCase(); });
        window.carrello.sort((a,b) => (a.turno || 1) - (b.turno || 1));

        const totProdotti = window.carrello.reduce((s,i) => s + (i.prezzo*i.qta), 0);
        const totCoperti = window.currentCoperti * (window.prezzoCopertoLocale || 2.50);
        const totaleFinale = totProdotti + totCoperti;

        // Mantiene tutti i dati ed etichette dell'Agenda
        const occ = window.tavoliOccupati[window.selT] || {};
        const commonData = { 
            tavolo: window.selT, 
            coperti: window.currentCoperti, 
            prodotti: window.carrello, 
            tipo: 'SALA', 
            totale: totaleFinale, 
            stato: "In forno", 
            cucina_completa: false, 
            data_ritiro: occ.data_ritiro || dataLocale, 
            nome: occ.nome || ("TAVOLO " + window.selT),
            cognome: occ.cognome || "",
            telefono: occ.telefono || "",
            orario: occ.orario || "",
            note_ordine: occ.note_ordine || "",
            adulti: occ.adulti || 0,
            bambini: occ.bambini || 0,
            seggioloni: occ.seggioloni || 0,
            etichette: Array.isArray(occ.etichette) ? occ.etichette : [],
            preferenza_servizio: occ.preferenza_servizio || "",
            area: occ.area || "",
            allegato_base64: occ.allegato_base64 || null,
            operatore: window.currentWaiterName || sessionStorage.getItem('operatore_corrente') || 'Cassa'
        };

        const isFirstOrder = (!window.prodottiOriginali || window.prodottiOriginali.length === 0);

        if (window.currentDocId && !isFirstOrder) {
            const docRef = doc(db, "ordini", window.currentDocId);
            const oldGrouped = raggruppaProdotti(window.prodottiOriginali || []);
            const newGrouped = raggruppaProdotti(window.carrello);
            
            let tempRemoves = [];
            let tempAdds = [];

            oldGrouped.forEach(oldItem => {
                const newItem = newGrouped.find(n => n._groupKey === oldItem._groupKey);
                const newQty = newItem ? newItem.qta : 0;
                if (newQty < oldItem.qta) tempRemoves.push({ ...oldItem, qta: oldItem.qta - newQty });
            });
            newGrouped.forEach(newItem => {
                const oldItem = oldGrouped.find(o => o._groupKey === newItem._groupKey);
                const oldQty = oldItem ? oldItem.qta : 0;
                if (newItem.qta > oldQty) tempAdds.push({ ...newItem, qta: newItem.qta - oldQty });
            });

            let movesObj = [];
            let movesStr = [];
            for (let r of tempRemoves) {
                const match = tempAdds.find(a => a.qta > 0 && a.nome === r.nome && a.dettagli === r.dettagli && a.prezzo === r.prezzo);
                if(match) {
                    const movedQty = Math.min(r.qta, match.qta);
                    movesObj.push({ ...r, qta: movedQty, oldTurn: r.turno, newTurn: match.turno });
                    movesStr.push(`${movedQty}x ${r.nome} (T${r.turno}->T${match.turno})`);
                    r.qta -= movedQty; match.qta -= movedQty;
                }
            }

            let storniStr = [], storniObj = [], aggiunteStr = [], aggiunteObj = [];
            tempRemoves.forEach(r => { if(r.qta > 0) { storniStr.push(`${r.qta}x ${r.nome}`); storniObj.push(r); } });
            tempAdds.forEach(a => { if(a.qta > 0) { aggiunteStr.push(`${a.qta}x ${a.nome}`); aggiunteObj.push(a); } });

            let finalMsgParts = [];
            if (storniStr.length > 0) finalMsgParts.push("STORNO: " + storniStr.join(", "));
            if (aggiunteStr.length > 0) finalMsgParts.push("AGGIUNTA: " + aggiunteStr.join(", "));
            if (movesStr.length > 0) finalMsgParts.push("CAMBIO TURNO: " + movesStr.join(", "));

            if (finalMsgParts.length > 0) {
                commonData.messaggio_cucina = finalMsgParts.join(" | ");
                commonData.timestamp_messaggio = serverTimestamp();
                commonData.ultime_aggiunte_real = aggiunteObj;
                commonData.ultimi_storni_real = storniObj;
                commonData.ultimi_spostamenti_real = movesObj;
            }

            await updateDoc(docRef, commonData);
            if (tempAdds.length > 0 && window.scalaScorte) await window.scalaScorte(tempAdds, -1);
            if (tempRemoves.length > 0 && window.scalaScorte) await window.scalaScorte(tempRemoves, 1);
        } else {
            commonData.data_invio = serverTimestamp();
            if (window.currentDocId && isFirstOrder) {
                await updateDoc(doc(db, "ordini", window.currentDocId), commonData);
            } else {
                await addDoc(collection(db, "ordini"), commonData);
            }
            if (window.scalaScorte) await window.scalaScorte(window.carrello, -1);
        }

        closeWaiter();
        Swal.fire({icon:'success', title:'Inviato!', timer:1000, showConfirmButton:false});
    } catch(e) { 
        console.error("Errore salvataggio:", e); 
        alert("ERRORE: " + e.message); 
    } finally { 
        if(btnConfirm) { btnConfirm.disabled = false; btnConfirm.innerText = "INVIA ORDINE"; } 
    }
};

window.closeWaiter = () => document.getElementById('waiter-screen').style.display = 'none';

window.liberaTavolo = async () => { 
    if(window.currentDocId) {
        Swal.fire({title:'Liberare tavolo?', showCancelButton:true}).then(async (r)=>{
            if(r.isConfirmed) {
                await updateDoc(doc(db, "ordini", window.currentDocId), { stato: "Consegnato" }); 
                closeWaiter(); 
            }
        });
    }
};

window.changeCoperti = (v) => { 
    window.currentCoperti = Math.max(1, window.currentCoperti+v); 
    document.getElementById('num-coperti').innerText = window.currentCoperti;
    updateCartUI(); 
};

window.setCat = (c) => { window.currentCat = c; renderCats(); renderProds(c); };
window.createNewTable = () => { const n = prompt("Tavolo:"); if(n) window.openOrder(n.toUpperCase()); };
window.filterTables = (v) => { document.querySelectorAll('.table').forEach(t => { const n = t.querySelector('.t-main').innerText; t.style.display = (!v || n.includes(v.toUpperCase())) ? 'flex' : 'none'; }); };

function renderCats() { 
    const availableCats = new Set(window.MENU.map(p => p.cat));
    const container = document.getElementById('cat-list');
    if (!container) return;
    container.innerHTML = "";
    const CATEGORY_ORDER = ['pizza', 'stirata', 'antipasto', 'gf', 'bibita', 'bibita_lattina', 'bibita_bottiglia', 'birra', 'vino'];

    CATEGORY_ORDER.forEach(cat => {
        if (availableCats.has(cat)) {
            const label = CATEGORY_LABELS[cat] || cat.toUpperCase();
            const activeClass = window.currentCat === cat ? 'active' : '';
            container.innerHTML += `<div class="cat-pill ${activeClass}" onclick="setCat('${cat}')">${label}</div>`;
        }
    });
    availableCats.forEach(cat => {
        if (!CATEGORY_ORDER.includes(cat)) {
            const activeClass = window.currentCat === cat ? 'active' : '';
            container.innerHTML += `<div class="cat-pill ${activeClass}" onclick="setCat('${cat}')">${cat.toUpperCase()}</div>`;
        }
    });
}

window.chiediDivisioneEStampa = async (id) => {
    const o = ordiniCache.find(x => x.id === id) || window.ordiniFuturiCache.find(x => x.id === id);
    const defaultPersone = (o && o.coperti > 1) ? o.coperti : 1;
    const currentTot = o ? parseFloat(o.totale || 0).toFixed(2) : "0.00";

    const { value: formValues, isDismissed } = await Swal.fire({
        title: 'Stampa Preconto',
        html: `
            <div style="text-align:left; margin-bottom:5px; font-weight:bold; color:#aaa;">In quanti pagano? (Divisione)</div>
            <input type="number" id="swal-divisore" class="swal2-input" value="${defaultPersone}" min="1" style="margin-top:0; margin-bottom:15px; width: 100%; box-sizing: border-box;">
            <div style="text-align:left; margin-bottom:5px; font-weight:bold; color:#aaa;">Totale Scontrino (€):</div>
            <input type="number" id="swal-totale-preconto" class="swal2-input" value="${currentTot}" step="0.50" style="margin-top:0; width: 100%; box-sizing: border-box; color: #4caf50; font-weight: bold; font-size: 1.5em;">
        `,
        showCancelButton: true,
        confirmButtonColor: '#333',
        confirmButtonText: '<i class="fa fa-print"></i> Stampa',
        cancelButtonText: 'Annulla',
        preConfirm: () => {
            return {
                divisore: document.getElementById('swal-divisore').value,
                nuovoTotale: document.getElementById('swal-totale-preconto').value
            }
        }
    });
    
    if (isDismissed) return; 
    window.divisoreTemp = parseInt(formValues.divisore) || 1;
    
    if (formValues.nuovoTotale && parseFloat(formValues.nuovoTotale) !== parseFloat(currentTot)) {
        const nuovoTotFloat = parseFloat(formValues.nuovoTotale);
        await updateDoc(doc(db, "ordini", id), { totale: nuovoTotFloat });
        o.totale = nuovoTotFloat;
    }

    stampa(id, 'PRECONTO');
};

window.stampa = (id, reparto) => {
    if (!printerOn) {
        Swal.fire({toast: true, position: 'top-end', icon: 'warning', title: 'Stampanti spente!', showConfirmButton: false, timer: 1500});
        return;
    }

    const o = ordiniCache.find(x => x.id === id) || window.ordiniFuturiCache.find(x => x.id === id);
    if(!o) return;
    
    const repKey = reparto.toLowerCase().trim(); 
    const isConto = (repKey === 'conto' || repKey === 'preconto');

    let printerIp = PRINTER_CONFIG[repKey]?.ip;
    if (!printerIp || printerIp.trim() === '') return;

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

    if(itemsToPrint.length === 0 && !isConto) return; 

    var data = [];
    data.push('\x1B\x40\x1B\x61\x01'); 
    let headerTitle = repKey === 'preconto' ? "PRECONTO" : (repKey === 'conto' ? "RICEVUTA" : reparto.toUpperCase());
    data.push('\x1D\x21\x11\x1B\x45\x01' + headerTitle + '\n\x1D\x21\x00\x1B\x45\x00'); 
    if (!o.tavolo) {
        const oggiTopStr = new Date().toISOString().split('T')[0];
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
        const infoServizio = window.getRigheStampaCucinaFiltrate(o);
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
        const copertoUnit = window.prezzoCopertoLocale || 2.50;
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
        
        let nomeSconto = o.sconto_applicato;
        if (!nomeSconto && window.currentPayOrderId === o.id && window.activeDiscount) {
            nomeSconto = window.activeDiscount.nome || window.activeDiscount.codice;
        }
        
        if (diffSconto > 0.01 || nomeSconto) {
            let labelSconto = nomeSconto ? nomeSconto.toUpperCase() : "MANUALE / ARROTOND.";
            if (diffSconto < 0) diffSconto = 0;
            data.push(`\x1B\x61\x01\x1D\x21\x01* SCONTO: ${labelSconto} *\n`);
            if (diffSconto > 0) data.push(`(- E ${diffSconto.toFixed(2)})\n`);
            data.push(`\x1D\x21\x00\x1B\x61\x00------------------------------------------\n`);
        }

        let tot = o.totale; 
        data.push(`\x1B\x61\x01\x1B\x45\x01\x1D\x21\x11TOTALE: E ${parseFloat(tot).toFixed(2)}\n\x1D\x21\x00\x1B\x45\x00`);
        
        if (window.divisoreTemp && window.divisoreTemp > 1) {
            let quota = (parseFloat(tot) / window.divisoreTemp).toFixed(2);
            data.push(`\n\x1B\x61\x01\x1D\x21\x01\x1B\x45\x01Diviso in ${window.divisoreTemp}: E ${quota} a persona\n\x1B\x45\x00\x1D\x21\x00`);
        }
        window.divisoreTemp = 1;
    }

    if(o.note_ordine) data.push(`\n\x1B\x45\x01NOTE: ${o.note_ordine}\n\x1B\x45\x00`);

    if (o.tavolo) {
        let strCoperti = (o.coperti && o.coperti > 0) ? ` (Cop: ${o.coperti})` : '';
        data.push(`\x1B\x61\x01\n\x1D\x21\x11\x1B\x45\x01TAVOLO ${o.tavolo}${strCoperti}\n\x1B\x45\x00\x1D\x21\x00\x1B\x61\x00\n`);
    } else {
        data.push('--------------------------------\n');
        data.push(`\x1D\x21\x11${(o.nome + ' ' + (o.cognome || '')).trim()}\n\x1D\x21\x00`);
        const oggiBotStr = new Date().toISOString().split('T')[0];
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
    data.push(`\x1B\x61\x01\n${new Date().toLocaleDateString('it-IT')} ${new Date().toLocaleTimeString('it-IT')}\n\x1B\x64\x08\x1D\x56\x01`); 
    qz.print(qz.configs.create({ host: printerIp, port: 9100 }), data).catch(e => console.error(e));
};
// ============================================================================
// CASSA.JS - PARTE 4 DI 4
// Back-Office, Prodotti, Backup JSON, Statistiche/Z, CRM, Mappa Sala e Storico
// ============================================================================

// --- COMPRESSIONE IMMAGINI E LOGO SOTTO 1MB ---
function comprimiImmagineBase64(file, maxSize = 350) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let w = img.width, h = img.height;
                if (w > h) { if (w > maxSize) { h *= maxSize / w; w = maxSize; } }
                else { if (h > maxSize) { w *= maxSize / h; h = maxSize; } }
                canvas.width = w;
                canvas.height = h;
                const ctx = canvas.getContext('2d');
                ctx.clearRect(0, 0, w, h);
                ctx.drawImage(img, 0, 0, w, h);
                let out = canvas.toDataURL('image/webp', 0.82);
                if (out.length > 500000) out = canvas.toDataURL('image/jpeg', 0.78);
                resolve(out);
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
}

let tempLogoBase64 = null;
window.anteprimaLogoLocale = async (input) => {
    const file = input.files?.[0];
    if (!file) return;
    tempLogoBase64 = await comprimiImmagineBase64(file, 300);
    const preview = document.getElementById('setting-logo-preview');
    if (preview) preview.src = tempLogoBase64;
};

window.salvaImpostazioniLocale = async () => {
    const payload = {};
    if (document.getElementById('setting-nome-locale')) payload.nome = document.getElementById('setting-nome-locale').value.trim();
    if (document.getElementById('setting-slogan')) payload.slogan = document.getElementById('setting-slogan').value.trim();
    if (document.getElementById('setting-tel-ordini')) payload.telefono_ordini = document.getElementById('setting-tel-ordini').value.trim();
    if (document.getElementById('setting-coperto')) {
        payload.prezzo_coperto = parseFloat(document.getElementById('setting-coperto').value) || 0;
        window.prezzoCopertoLocale = payload.prezzo_coperto;
    }
    if (document.getElementById('setting-piva')) payload.piva = document.getElementById('setting-piva').value.trim();
    if (document.getElementById('setting-indirizzo')) payload.indirizzo = document.getElementById('setting-indirizzo').value.trim();
    if (tempLogoBase64) payload.logo_url = tempLogoBase64;

    await setDoc(doc(db, "impostazioni", "negozio"), payload, { merge: true });
    if (payload.nome && document.getElementById('nome-locale-ui')) {
        document.getElementById('nome-locale-ui').innerText = `${payload.nome.toUpperCase()} - CASSA`;
    }
    Swal.fire({ icon: 'success', title: 'Dati Locale Aggiornati!', timer: 1500, showConfirmButton: false });
};

// --- ZONE DI CONSEGNA (impostazioni/negozio: zone_consegna, supplemento_fuori_zona) ---
window.configConsegna = {};
let zoneEditor = [];
let zoneModificate = false;

function caricaEditorZone(dn) {
    if (zoneModificate) return;   // non sovrascrivere modifiche non ancora salvate
    zoneEditor = (Array.isArray(dn.zone_consegna) ? dn.zone_consegna : []).map(z => ({ ...z }));
    const base = document.getElementById('setting-supp-base');
    const fuori = document.getElementById('setting-supp-fuori-zona');
    if (base && dn.supplemento_consegna !== undefined) base.value = parseFloat(dn.supplemento_consegna) || 0;
    if (fuori && dn.supplemento_fuori_zona !== undefined) fuori.value = parseFloat(dn.supplemento_fuori_zona) || 0;
    renderZoneConsegna();
}

function renderZoneConsegna() {
    const box = document.getElementById('lista-zone-consegna');
    if (!box) return;
    if (zoneEditor.length === 0) {
        box.innerHTML = `<div style="color:#8d6e63; font-size:0.85em;">Nessuna zona: tutti i clienti pagano il supplemento base.</div>`;
        return;
    }
    const esc = window.escapeHtml;
    const campo = (i, chiave, etichetta, tipo, extra = '') => `
        <label style="display:flex; flex-direction:column; font-size:0.72em; font-weight:bold; color:#6d4c41; ${extra}">${etichetta}
            <input type="${tipo}" class="input-std" style="margin:2px 0 0 0;" ${tipo === 'number' ? 'step="0.50" min="0"' : ''}
                value="${esc(zoneEditor[i][chiave] ?? '')}" oninput="aggiornaZonaConsegna(${i}, '${chiave}', this.value)">
        </label>`;
    box.innerHTML = zoneEditor.map((z, i) => `
        <div style="background:white; border:1px solid #ffcc80; border-radius:8px; padding:10px; display:flex; gap:8px; flex-wrap:wrap; align-items:flex-end; ${z.attiva === false ? 'opacity:0.55;' : ''}">
            ${campo(i, 'nome', 'Nome zona', 'text', 'flex:1; min-width:120px;')}
            ${campo(i, 'cap', 'CAP', 'text', 'flex:2; min-width:160px;')}
            ${campo(i, 'supplemento', 'Supplemento €', 'number', 'width:95px;')}
            ${campo(i, 'ordine_minimo', 'Minimo €', 'number', 'width:85px;')}
            ${campo(i, 'gratis_sopra', 'Gratis sopra €', 'number', 'width:95px;')}
            <label style="display:flex; align-items:center; gap:5px; font-size:0.8em; font-weight:bold; padding-bottom:8px;">
                <input type="checkbox" ${z.attiva === false ? '' : 'checked'} onchange="aggiornaZonaConsegna(${i}, 'attiva', this.checked)"> Attiva
            </label>
            <button onclick="rimuoviZonaConsegna(${i})" style="background:#ef5350; color:white; border:none; padding:9px 11px; border-radius:5px; cursor:pointer; margin-bottom:5px;"><i class="fa fa-trash"></i></button>
        </div>`).join('');
}

window.aggiornaZonaConsegna = (i, chiave, valore) => {
    zoneEditor[i][chiave] = valore;
    zoneModificate = true;
    if (chiave === 'attiva') renderZoneConsegna();
};

window.aggiungiZonaConsegna = () => {
    zoneEditor.push({ nome: '', cap: '', supplemento: parseFloat(document.getElementById('setting-supp-base')?.value) || 0, ordine_minimo: 0, gratis_sopra: 0, attiva: true });
    zoneModificate = true;
    renderZoneConsegna();
};

window.rimuoviZonaConsegna = (i) => {
    zoneEditor.splice(i, 1);
    zoneModificate = true;
    renderZoneConsegna();
};

window.salvaZoneConsegna = async () => {
    const num = (v) => Math.max(0, parseFloat(v) || 0);
    const zone = [];
    for (const z of zoneEditor) {
        const nome = String(z.nome || '').trim();
        const cap = String(z.cap || '').trim();
        if (!nome || !cap) return Swal.fire("Attenzione", "Ogni zona deve avere un nome e almeno un CAP.", "warning");
        const vociNonValide = cap.split(/[,;\s]+/).filter(v => v && !/^\d{5}(-\d{5})?$/.test(v.replace(/\s/g, '')));
        if (vociNonValide.length) return Swal.fire("CAP non valido", `Zona "${nome}": controlla ${vociNonValide.join(', ')} (5 cifre, intervalli come 89121-89135).`, "warning");
        zone.push({ nome, cap, supplemento: num(z.supplemento), ordine_minimo: num(z.ordine_minimo), gratis_sopra: num(z.gratis_sopra), attiva: z.attiva !== false && z.attiva !== 'false' });
    }
    const payload = {
        zone_consegna: zone,
        supplemento_consegna: num(document.getElementById('setting-supp-base')?.value),
        supplemento_fuori_zona: num(document.getElementById('setting-supp-fuori-zona')?.value)
    };
    await setDoc(doc(db, "impostazioni", "negozio"), payload, { merge: true });
    zoneModificate = false;
    Swal.fire({ icon: 'success', title: 'Zone di consegna salvate!', timer: 1500, showConfirmButton: false });
};

// --- GESTIONALE E PRODOTTI CON DOPPIO SWITCH (MENU QR + PALMARE SALA) ---
function ensurePalmareToggleInForm() {
    if (document.getElementById('new-disp-palmare') || document.getElementById('new-disponibile-palmare')) return;
    const qrCheckbox = document.getElementById('new-mostra-tavolo');
    if (qrCheckbox && qrCheckbox.parentElement) {
        const wrapper = document.createElement('label');
        wrapper.style.cssText = 'display:inline-flex; align-items:center; gap:6px; margin-left:10px; padding:5px 10px; background:rgba(41, 98, 255, 0.1); border:1px solid #2962ff; border-radius:5px; font-weight:bold; color:#2962ff; cursor:pointer;';
        wrapper.innerHTML = `<input type="checkbox" id="new-disponibile-palmare" checked style="width:18px; height:18px; cursor:pointer;"> 📱 Palmare`;
        qrCheckbox.parentElement.insertAdjacentElement('afterend', wrapper);
    }
}

function getPalmareCheckboxEl() {
    return document.getElementById('new-disp-palmare') || document.getElementById('new-disponibile-palmare');
}

window.apriGestionale = () => {
    ensurePalmareToggleInForm();
    const modal = document.getElementById('modal-gestionale');
    if(modal) {
        modal.style.display = 'flex';
        window.cambiaTab('prodotti');
    }
};

window.chiudiGestionale = () => {
    const modal = document.getElementById('modal-gestionale');
    if(modal) modal.style.display = 'none';
};

window.cambiaTab = (tab) => { 
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active')); 
    document.querySelectorAll('[id^="view-"]').forEach(v => v.style.display='none'); 
    const clickedTab = document.querySelector(`.tab[onclick*="'${tab}'"]`);
    if(clickedTab) clickedTab.classList.add('active');
    const viewEl = document.getElementById('view-'+tab);
    if (viewEl) viewEl.style.display='block'; 
    if(tab === 'prodotti') { ensurePalmareToggleInForm(); caricaProdotti(); }
    if(tab === 'stats') window.calcolaStats(); 
    if(tab === 'ingredienti') caricaIngredienti(); 
    if(tab === 'rimozioni') caricaRimozioni(); 
    if(tab === 'stampanti') renderizzaConfigStampanti(); 
    if(tab === 'sconti') caricaSconti(); 
    if(tab === 'crm') caricaCRM(); 
    if(tab === 'dipendenti') window.caricaDipendenti();
    if(tab === 'cestino') window.caricaCestino();
    if(tab === 'kdsconfig') window.renderizzaConfigKDS();
};

function caricaProdotti() {
    const f = document.getElementById('cat-filters-container');
    if (!f) return;
    mappaProdotti = {};
    prodottiPerCategoria = {};
    
    onSnapshot(collection(db, "prodotti"), (s) => {
        prodottiPerCategoria = {};
        s.forEach(d => {
            let p = d.data();
            p.id = d.id;
            mappaProdotti[d.id] = p;
            if (!prodottiPerCategoria[p.cat]) prodottiPerCategoria[p.cat] = [];
            prodottiPerCategoria[p.cat].push(p);
        });
        
        f.innerHTML = "";
        const oc = ['ant_pizzeria', 'ant_ristorante', 'pizza', 'speciale', 'stirata', 'gf', 'primo', 'secondo', 'contorno', 'pescato', 'dolce', 'bibita', 'bibita_lattina', 'bibita_bottiglia', 'birra', 'vino', 'amaro'];
        oc.forEach(cat => {
            if (prodottiPerCategoria[cat]) {
                const lb = CATEGORY_LABELS[cat] || cat.toUpperCase();
                f.innerHTML += `<button class="cat-filter-btn ${currentBackOfficeCat === cat ? 'active' : ''}" onclick="window.mostraCat('${cat}')">${lb}</button>`;
            }
        });
        
        if (!currentBackOfficeCat || !prodottiPerCategoria[currentBackOfficeCat]) {
            const fk = oc.find(c => prodottiPerCategoria[c]);
            if (fk) currentBackOfficeCat = fk;
        }
        renderCategoria(currentBackOfficeCat);
    });
}

window.mostraCat = (c) => {
    currentBackOfficeCat = c;
    document.querySelectorAll('.cat-filter-btn').forEach(b => b.classList.remove('active'));
    renderCategoria(c);
};

function renderCategoria(cat) {
    const l = document.getElementById('lista-prodotti');
    if (!l) return;
    l.innerHTML = "";
    const ps = prodottiPerCategoria[cat];
    if (!ps) return;
    ps.sort((a, b) => parseFloat(a.prezzo) - parseFloat(b.prezzo));
    
    ps.forEach(p => {
        const isAttivoApp = p.attivo !== false ? 'checked' : '';
        const isPalmare = p.disponibile_palmare !== false ? 'checked' : '';
        const isMenuTavolo = (p.mostra_al_tavolo !== false && p.disponibile_menu_qr !== false) ? 'checked' : '';

        l.innerHTML += `
        <div class="db-item">
            <div style="display:flex; align-items:center; gap: 14px; flex-wrap:wrap;">
                
                <div style="display:flex; flex-direction:column; align-items:center; gap:3px;">
                    <small style="font-size:0.65em; color:#888; font-weight:bold;">APP/CASSA</small>
                    <label class="switch">
                        <input type="checkbox" ${isAttivoApp} onchange="toggleProdotto('${p.id}',this.checked)">
                        <span class="slider"></span>
                    </label>
                </div>

                <div style="display:flex; flex-direction:column; align-items:center; gap:3px;">
                    <small style="font-size:0.65em; color:#2962ff; font-weight:bold;">PALMARE SALA</small>
                    <label class="switch">
                        <input type="checkbox" ${isPalmare} onchange="toggleVisibilitaPalmare('${p.id}',this.checked)">
                        <span class="slider"></span>
                    </label>
                </div>

                <div style="display:flex; flex-direction:column; align-items:center; gap:3px;">
                    <small style="font-size:0.65em; color:#b28900; font-weight:bold;">MENU QR</small>
                    <label class="switch">
                        <input type="checkbox" ${isMenuTavolo} onchange="toggleVisibilitaTavolo('${p.id}',this.checked)">
                        <span class="slider"></span>
                    </label>
                </div>

                <div style="margin-left:10px;">
                    <b>${p.nome}</b> ${p.isPeso ? '<span style="color:#0277bd;font-weight:bold;font-size:0.8em;">(AL KG)</span>' : ''}
                    ${p.scorta !== null && p.scorta !== undefined && p.scorta !== "" ? `<span style="color:#d32f2f; font-weight:bold; font-size:0.8em; margin-left:10px;">(Scorta: ${p.scorta})</span>` : ''}
                    <br>
                    <small>€ ${parseFloat(p.prezzo).toFixed(2)}</small>
                </div>
            </div>
            <div>
                <button onclick="preparaModifica('${p.id}')" class="btn-edit">✏️</button>
                <button onclick="eliminaDB('prodotti','${p.id}')" style="background:red;color:white;border:none;border-radius:5px;padding:5px 10px;cursor:pointer;"><i class="fa fa-trash"></i></button>
            </div>
        </div>`;
    });
}

window.toggleProdotto = (id, s) => updateDoc(doc(db, "prodotti", id), { attivo: s });
window.toggleVisibilitaPalmare = (id, s) => updateDoc(doc(db, "prodotti", id), { disponibile_palmare: s });
window.toggleVisibilitaTavolo = (id, s) => updateDoc(doc(db, "prodotti", id), { mostra_al_tavolo: s, disponibile_menu_qr: s });

window.preparaModifica = (id) => {
    ensurePalmareToggleInForm();
    const p = mappaProdotti[id];
    if (!p) return;
    editingProdId = id;
    document.getElementById('new-cat').value = p.cat;
    document.getElementById('new-nome').value = p.nome;
    document.getElementById('new-desc').value = p.desc || "";
    document.getElementById('new-prezzo').value = p.prezzo;
    document.getElementById('new-scorta').value = p.scorta !== undefined && p.scorta !== null ? p.scorta : "";
    document.getElementById('new-is-peso').checked = p.isPeso === true;
    
    if(document.getElementById('new-mostra-tavolo')) {
        document.getElementById('new-mostra-tavolo').checked = (p.mostra_al_tavolo !== false && p.disponibile_menu_qr !== false);
    }
    const palmEl = getPalmareCheckboxEl();
    if(palmEl) {
        palmEl.checked = p.disponibile_palmare !== false;
    }

    document.getElementById('new-foto').value = "";
    if (document.getElementById('btn-delete-foto')) {
        document.getElementById('btn-delete-foto').style.display = (p.immagine_url || p.foto) ? 'block' : 'none';
    }
    renderGrigliaIngredienti(p.ingredienti || []);

    document.querySelectorAll('input[name="allergeni"]').forEach(cb => {
        cb.checked = Array.isArray(p.allergeni) && p.allergeni.includes(cb.value);
    });
    
    const b = document.getElementById('btn-save-prod');
    b.textContent = "SALVA MODIFICHE";
    b.style.background = "#ff9800";
    document.getElementById('btn-cancel-prod').style.display = "inline-block";
};

window.resetFormProdotti = () => {
    editingProdId = null;
    document.getElementById('new-nome').value = "";
    document.getElementById('new-desc').value = "";
    document.getElementById('new-prezzo').value = "";
    document.getElementById('new-scorta').value = "";
    document.getElementById('new-is-peso').checked = false;
    
    if(document.getElementById('new-mostra-tavolo')) document.getElementById('new-mostra-tavolo').checked = true;
    const palmEl = getPalmareCheckboxEl();
    if(palmEl) palmEl.checked = true;

    document.getElementById('new-foto').value = ""; 
    if (document.getElementById('btn-delete-foto')) document.getElementById('btn-delete-foto').style.display = 'none';
    renderGrigliaIngredienti([]);
    document.querySelectorAll('input[name="allergeni"]').forEach(cb => cb.checked = false);
    
    const b = document.getElementById('btn-save-prod');
    b.textContent = "AGGIUNGI";
    b.style.background = "#2e7d32";
    document.getElementById('btn-cancel-prod').style.display = "none";
};

window.salvaProdotto = async () => { 
    ensurePalmareToggleInForm();
    const nome = document.getElementById('new-nome').value.trim(); 
    const cat = document.getElementById('new-cat').value; 
    const desc = document.getElementById('new-desc').value; 
    const prezzo = parseFloat(document.getElementById('new-prezzo').value); 
    const isPeso = document.getElementById('new-is-peso').checked; 
    const scortaInput = document.getElementById('new-scorta').value;
    const scorta = scortaInput === "" ? null : parseInt(scortaInput);
    
    const mostraMenuQR = document.getElementById('new-mostra-tavolo') ? document.getElementById('new-mostra-tavolo').checked : true;
    const palmEl = getPalmareCheckboxEl();
    const dispPalmare = palmEl ? palmEl.checked : true;

    const fotoInput = document.getElementById('new-foto');
    const file = fotoInput?.files?.[0];
    let immagine_url = null; 
    
    const ingredientiArr = []; 
    document.querySelectorAll('input[name="prod_ing_check"]:checked').forEach(cb => ingredientiArr.push(cb.value)); 
    
    const checkedAllergeni = []; 
    document.querySelectorAll('input[name="allergeni"]:checked').forEach(cb => checkedAllergeni.push(cb.value)); 
    
    if(!nome || isNaN(prezzo)) return Swal.fire("Inserisci Nome e Prezzo!"); 
    
    try {
        Swal.fire({title: 'Salvataggio in corso...', didOpen: () => { Swal.showLoading() }});

        if (file) {
            immagine_url = await comprimiImmagineBase64(file, 400);
        } else if (editingProdId && (mappaProdotti[editingProdId]?.immagine_url || mappaProdotti[editingProdId]?.foto)) {
            immagine_url = mappaProdotti[editingProdId].immagine_url || mappaProdotti[editingProdId].foto;
        }

        const data = { 
            nome, 
            cat, 
            desc, 
            prezzo, 
            scorta: scorta, 
            attivo: true, 
            mostra_al_tavolo: mostraMenuQR,
            disponibile_menu_qr: mostraMenuQR,
            disponibile_palmare: dispPalmare,
            allergeni: checkedAllergeni, 
            ingredienti: ingredientiArr, 
            isPeso: isPeso,
            immagine_url: immagine_url,
            foto: immagine_url
        }; 
        
        if (editingProdId) { 
            await updateDoc(doc(db, "prodotti", editingProdId), data); 
            resetFormProdotti(); 
        } else { 
            await addDoc(collection(db, "prodotti"), data); 
            resetFormProdotti(); 
        } 
        
        Swal.fire({icon: 'success', title: 'Prodotto Salvato!', timer: 1500, showConfirmButton: false});

    } catch (error) {
        console.error("Errore salvataggio:", error);
        Swal.fire("Errore!", error.message, "error");
    }
};

// --- BACKUP E RIPRISTINO MENU IN JSON ---
window.backupMenu = async () => {
    try {
        const snap = await getDocs(collection(db, "prodotti"));
        const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `backup_menu_${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    } catch (e) {
        Swal.fire("Errore Backup", e.message, "error");
    }
};

window.ripristinaMenuDaBackup = () => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = '.json';
    inp.onchange = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            const text = await file.text();
            const items = JSON.parse(text);
            if (!Array.isArray(items)) throw new Error("Formato file JSON non valido.");
            Swal.fire({ title: 'Importazione in corso...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
            for (const item of items) {
                const { id, ...rest } = item;
                if (id) await setDoc(doc(db, "prodotti", id), rest, { merge: true });
                else await addDoc(collection(db, "prodotti"), rest);
            }
            Swal.fire("Completato!", `Importati ${items.length} prodotti nel menu.`, "success");
        } catch (err) {
            Swal.fire("Errore Importazione", err.message, "error");
        }
    };
    inp.click();
};

// --- STAMPA CHIUSURA SERATA / RIEPILOGO Z ---
window.stampaChiusuraZ = async (modalita = 'oggi') => {
    let printerIp = PRINTER_CONFIG['conto']?.ip || PRINTER_CONFIG['preconto']?.ip;
    if (!printerIp) return Swal.fire("Attenzione", "Configura l'IP della stampante CASSA o PRECONTO nel Gestionale.", "warning");

    let dStart = document.getElementById('timeline-date')?.value || new Date().toISOString().split('T')[0];
    let dEnd = dStart;
    if (modalita === 'periodo') {
        dStart = document.getElementById('stats-start')?.value || dStart;
        dEnd = document.getElementById('stats-end')?.value || dEnd;
    }

    try {
        const q = query(collection(db, "ordini"), where("data_ritiro", ">=", dStart), where("data_ritiro", "<=", dEnd));
        const snap = await getDocs(q);
        let totGen = 0, totContanti = 0, totCarta = 0, totAsporto = 0, totSala = 0, numOrd = 0, numCop = 0;

        snap.forEach(d => {
            const o = d.data();
            if (o.stato !== 'Annullato') {
                const imp = parseFloat(o.totale || 0);
                totGen += imp;
                numOrd++;
                numCop += parseInt(o.coperti || 0);
                if (o.tipo === 'SALA') totSala += imp; else totAsporto += imp;
                if (o.metodo_pagamento === 'CARTA') totCarta += imp; else totContanti += imp;
            }
        });

        let data = [];
        data.push('\x1B\x40\x1B\x61\x01');
        data.push('\x1D\x21\x11\x1B\x45\x01REPORT CHIUSURA Z\n\x1D\x21\x00\x1B\x45\x00');
        data.push(`Periodo: ${dStart} -> ${dEnd}\n`);
        data.push('--------------------------------\n\x1B\x61\x00');
        data.push(`Ordini Totali:       ${numOrd}\n`);
        data.push(`Coperti Sala:        ${numCop}\n`);
        data.push('--------------------------------\n');
        data.push(`Incasso ASPORTO:     E ${totAsporto.toFixed(2)}\n`);
        data.push(`Incasso SALA:        E ${totSala.toFixed(2)}\n`);
        data.push('--------------------------------\n');
        data.push(`Totale CONTANTI:     E ${totContanti.toFixed(2)}\n`);
        data.push(`Totale CARTA:        E ${totCarta.toFixed(2)}\n`);
        data.push('================================\n');
        data.push(`\x1B\x61\x01\x1D\x21\x11\x1B\x45\x01TOTALE: E ${totGen.toFixed(2)}\n\x1D\x21\x00\x1B\x45\x00`);
        data.push(`\n${new Date().toLocaleString('it-IT')}\n\x1B\x64\x08\x1D\x56\x01`);

        await qz.print(qz.configs.create({ host: printerIp, port: 9100 }), data);
        Swal.fire({ icon: 'success', title: 'Report Z inviato in stampa!', timer: 1500, showConfirmButton: false });
    } catch (e) {
        Swal.fire("Errore Stampa Z", e.message, "error");
    }
};

window.compraModuloKDS = () => {
    Swal.fire("Modulo KDS", "Contatta l'amministratore o usa la SaaS Master Console per abilitare il Monitor Cucina KDS.", "info");
};

window.apriPortaleStripe = () => {
    Swal.fire("Gestione Abbonamento", "Per aggiornare il metodo di pagamento o visualizzare le fatture contatta l'assistenza.", "info");
};

window.setPeriodo = (tipo) => {
    const today = new Date();
    const startInp = document.getElementById('stats-start');
    const endInp = document.getElementById('stats-end');
    
    if(tipo === 'oggi') {
        const s = today.toISOString().split('T')[0];
        startInp.value = s; endInp.value = s;
    } else if(tipo === 'settimana') {
        const day = today.getDay() || 7; 
        if(day !== 1) today.setHours(-24 * (day - 1)); 
        startInp.value = today.toISOString().split('T')[0];
        const end = new Date(today); end.setDate(end.getDate() + 6);
        endInp.value = end.toISOString().split('T')[0];
    } else if(tipo === 'mese') {
        const y = today.getFullYear(), m = today.getMonth();
        startInp.value = new Date(y, m, 1).toISOString().split('T')[0];
        const lastDay = new Date(y, m + 1, 0);
        lastDay.setMinutes(lastDay.getMinutes() - lastDay.getTimezoneOffset());
        endInp.value = lastDay.toISOString().split('T')[0];
    } else if(tipo === 'anno') {
        startInp.value = `${today.getFullYear()}-01-01`;
        endInp.value = `${today.getFullYear()}-12-31`;
    }
    window.calcolaStats();
};

window.calcolaStats = async () => { 
    const dStart = document.getElementById('stats-start').value; 
    const dEnd = document.getElementById('stats-end').value;
    if(!dStart || !dEnd) return Swal.fire("Seleziona un periodo.");
    const q = query(collection(db, "ordini"), where("data_ritiro", ">=", dStart), where("data_ritiro", "<=", dEnd)); 
    try { 
        const snap = await getDocs(q); 
        let tot = { inc: 0, piz: 0, ord: 0, cop: 0 }; 
        let asp = { inc: 0, piz: 0, ord: 0, cop: 0 };
        let sala = { inc: 0, piz: 0, ord: 0, cop: 0 };
        let statsPerCat = {}; 

        snap.forEach(docSnap => { 
            const d = docSnap.data(); 
            if(d.stato !== 'Annullato') { 
                const importo = parseFloat(d.totale||0);
                const nCop = parseInt(d.coperti || 0);
                let pizzeOrdine = 0;

                if(d.prodotti) d.prodotti.forEach(p => { 
                    let qta = parseFloat(p.qta||1); 
                    if(['pizza','stirata','gf','speciale'].includes(p.cat)) pizzeOrdine += qta; 
                    let catKey = p.cat || 'altro';
                    let prodName = p.nome;
                    if(!statsPerCat[catKey]) statsPerCat[catKey] = {};
                    if(!statsPerCat[catKey][prodName]) statsPerCat[catKey][prodName] = 0;
                    statsPerCat[catKey][prodName] += qta;
                }); 

                tot.inc += importo; tot.ord++; tot.piz += pizzeOrdine; tot.cop += nCop;
                if (d.tipo === 'SALA') {
                    sala.inc += importo; sala.ord++; sala.piz += pizzeOrdine; sala.cop += nCop;
                } else {
                    asp.inc += importo; asp.ord++; asp.piz += pizzeOrdine; asp.cop += nCop;
                }
            } 
        }); 

        document.getElementById('st-incasso').innerText = "€ " + tot.inc.toFixed(2); 
        document.getElementById('st-pizze').innerText = Math.round(tot.piz); 
        document.getElementById('st-ordini').innerText = tot.ord; 
        document.getElementById('st-coperti').innerText = tot.cop;

        document.getElementById('st-incasso-asp').innerText = "€ " + asp.inc.toFixed(2); 
        document.getElementById('st-pizze-asp').innerText = Math.round(asp.piz); 
        document.getElementById('st-ordini-asp').innerText = asp.ord; 
        if (document.getElementById('st-coperti-asp')) document.getElementById('st-coperti-asp').innerText = asp.cop;

        document.getElementById('st-incasso-sala').innerText = "€ " + sala.inc.toFixed(2); 
        document.getElementById('st-pizze-sala').innerText = Math.round(sala.piz); 
        document.getElementById('st-ordini-sala').innerText = sala.ord; 
        document.getElementById('st-coperti-sala').innerText = sala.cop;

        const rankingContainer = document.getElementById('ranking-container');
        if (!rankingContainer) return;
        rankingContainer.innerHTML = ""; 

        const sortOrder = ['pizza', 'speciale', 'stirata', 'gf', 'ant_pizzeria', 'ant_ristorante', 'primo', 'secondo', 'contorno', 'pescato', 'dolce', 'bibita', 'bibita_lattina', 'bibita_bottiglia', 'birra', 'vino', 'amaro'];
        let foundCats = Object.keys(statsPerCat);
        foundCats.sort((a,b) => {
            let ia = sortOrder.indexOf(a);
            let ib = sortOrder.indexOf(b);
            if(ia === -1 && ib === -1) return 0;
            if(ia === -1) return 1;
            if(ib === -1) return -1;
            return ia - ib;
        });

        if(foundCats.length === 0) {
            rankingContainer.innerHTML = "<div style='padding:20px; text-align:center;'>Nessun prodotto venduto nel periodo.</div>";
        } else {
            foundCats.forEach(cat => {
                let products = Object.entries(statsPerCat[cat]).sort((a,b) => b[1] - a[1]);
                let catLabel = CATEGORY_LABELS[cat] || cat.toUpperCase();
                let html = `<div class="cat-rank-title">${catLabel}</div><table class="ranking-table"><tbody>`;
                products.forEach((prod, index) => {
                    let qtyDisplay = prod[1] % 1 === 0 ? prod[1] : prod[1].toFixed(3);
                    html += `<tr><td style="width:30px;">${index+1}</td><td>${prod[0]}</td><td style="width:50px; text-align:right;"><b>${qtyDisplay}</b></td></tr>`;
                });
                html += `</tbody></table>`;
                rankingContainer.innerHTML += html;
            });
        }
    } catch(e) { console.log(e); Swal.fire("Errore statistiche: " + e.message); } 
};

window.azzeraStatistiche = async () => {
    const dStart = document.getElementById('stats-start').value;
    const dEnd = document.getElementById('stats-end').value;
    if(!dStart || !dEnd) return Swal.fire("Seleziona prima le date (Dal/Al).");

    Swal.fire({
        title: 'ATTENZIONE: CANCELLAZIONE',
        text: `Stai per eliminare TUTTI gli ordini dal ${dStart} al ${dEnd}. L'operazione è IRREVERSIBILE.`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d32f2f',
        cancelButtonColor: '#3085d6',
        confirmButtonText: 'Sì, procedi',
        cancelButtonText: 'Annulla'
    }).then(async (result) => {
        if(result.isConfirmed) {
            Swal.fire({title: 'Cancellazione in corso...', didOpen: () => { Swal.showLoading() }});
            const q = query(collection(db, "ordini"), where("data_ritiro", ">=", dStart), where("data_ritiro", "<=", dEnd));
            try {
                const snap = await getDocs(q);
                if(snap.empty) return Swal.fire({icon: 'info', title: 'Nessun ordine trovato'});
                const batch = writeBatch(db); 
                let count = 0;
                snap.forEach(d => { batch.delete(d.ref); count++; });
                await batch.commit();
                Swal.fire({icon: 'success', title: 'Fatto!', text: `Cancellati ${count} ordini.`});
                calcolaStats(); 
            } catch (e) {
                Swal.fire({icon: 'error', title: 'Errore', text: e.message});
            }
        }
    });
};

window.caricaCestino = async () => {
    const list = document.getElementById('lista-cestino');
    if (!list) return;
    list.innerHTML = "<div style='text-align:center;'>Caricamento...</div>";
    const dateStr = document.getElementById('timeline-date').value;
    
    const q = query(collection(db, "ordini"), where("data_ritiro", "==", dateStr));
    try {
        const snap = await getDocs(q);
        list.innerHTML = "";
        let count = 0;
        const docs = snap.docs.map(d => ({id:d.id, ...d.data()}));
        
        docs.forEach(d => {
            if(d.stato === "Annullato") {
                count++;
                const nomeCli = d.tavolo ? `TAVOLO ${d.tavolo}` : (d.nome + " " + (d.cognome || ''));
                const totale = d.totale ? parseFloat(d.totale).toFixed(2) : "0.00";
                let prodottiHtml = "";
                if(d.prodotti && Array.isArray(d.prodotti)){
                    prodottiHtml = d.prodotti.map(prod => `<div>${window.escapeHtml(prod.qta)}x ${window.escapeHtml(prod.nome)} <small>(${window.sanitizeHtml(prod.dettagli||'')})</small></div>`).join('');
                }

                list.innerHTML += `
                    <div style="background:white; border:1px solid #ddd; border-left:5px solid #d32f2f; padding:10px; margin-bottom:10px; border-radius:4px; color:#222;">
                        <div style="display:flex; justify-content:space-between; margin-bottom:5px;">
                            <span style="font-weight:bold; font-size:1.1em;">${window.escapeHtml(d.orario)} | ${window.escapeHtml(nomeCli)}</span>
                            <span style="color:#d32f2f; font-weight:bold;">ANNULLATO</span>
                        </div>
                        <div style="color:#555; font-size:0.9em; margin-bottom:8px; padding-left:10px; border-left:2px solid #eee;">
                            ${prodottiHtml}
                        </div>
                        <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid #eee; padding-top:5px;">
                            <b>Tot: € ${totale}</b>
                            <div>
                                <button onclick="ripristinaOrdine('${d.id}', '${d.tipo}')" style="background:#2e7d32; color:white; border:none; padding:5px 10px; border-radius:4px; cursor:pointer;">
                                    <i class="fa fa-undo"></i> RIPRISTINA
                                </button>
                            </div>
                        </div>
                    </div>
                `;
            }
        });
        
        if(count === 0) {
            list.innerHTML = "<div style='padding:20px; text-align:center; color:#777;'>Nessun ordine annullato trovato per la data selezionata (" + dateStr + ").</div>";
        }
    } catch(e) {
        list.innerHTML = "<div style='color:red;'>Errore: " + e.message + "</div>";
    }
};

window.ripristinaOrdine = async (id, tipo) => {
    try {
        const nuovoStato = tipo === 'SALA' ? 'In forno' : 'In attesa'; 
        await updateDoc(doc(db, "ordini", id), { stato: nuovoStato, data_annullamento: null });
        Swal.fire({title:'Ordine Ripristinato!', icon:'success', timer:1500, showConfirmButton:false});
        window.caricaCestino(); 
    } catch (e) {
        Swal.fire("Errore durante il ripristino: " + e.message);
    }
};

window.exportToCSV = () => {
    if(ordiniCache.length === 0) return Swal.fire('Nessun ordine da esportare.');
    let csvContent = "data:text/csv;charset=utf-8,Data,Ora,Tipo,Tavolo/Cliente,Totale,Stato,Operatore\r\n";
    ordiniCache.forEach(o => {
        const operatoreNome = o.operatore || o.cameriere || '';
        const row = `${o.data_ritiro},${o.orario},${o.tipo},"${o.nome}",${o.totale},${o.stato},${operatoreNome}`;
        csvContent += row + "\r\n";
    });
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "report_vendite.csv");
    document.body.appendChild(link);
    link.click();
};

// --- ELIMINAZIONE SICURA DB ---
window.eliminaDB = async (coll, id) => {
    Swal.fire({title:'Eliminare elemento?', showCancelButton:true}).then(async (r)=>{
        if(r.isConfirmed) {
            try { 
                const docRef = doc(db, coll, id);
                const snap = await getDoc(docRef);
                if (snap.exists()) {
                    await deleteDoc(docRef);
                }
                if(coll === 'dipendenti') window.caricaDipendenti();
                if(coll === 'sconti') window.caricaSconti();
                if(coll === 'rimozioni') window.caricaRimozioni();
                if(coll === 'ingredienti') window.caricaIngredienti();
                if(coll === 'prodotti') window.caricaProdotti();
            } catch(e) { 
                Swal.fire("Errore: " + e.message); 
            }
        }
    });
};
window.eliminaProdotto = (id) => window.eliminaDB('prodotti', id);

window.caricaIngredienti = () => {
    const l = document.getElementById('lista-ingredienti');
    if (!l) return;
    l.innerHTML = "";
    window.INGS.sort((a,b) => a.nome.localeCompare(b.nome));
    
    window.INGS.forEach(i => {
        l.innerHTML += `
        <div class="db-item">
            <span><b>${i.nome}</b> (€ ${parseFloat(i.prezzo).toFixed(2)})</span>
            <div>
                <button onclick="preparaModificaIngrediente('${i.id}')" class="btn-edit" style="background:#ffb74d; color:black;"><i class="fa fa-pencil"></i></button>
                <button onclick="eliminaDB('ingredienti','${i.id}')" style="background:#ef5350; color:white; border:none; padding:5px 10px; border-radius:5px; cursor:pointer; margin-left:5px;"><i class="fa fa-trash"></i></button>
            </div>
        </div>`;
    });
};

window.preparaModificaIngrediente = (id) => {
    const ing = window.INGS.find(x => x.id === id);
    if (!ing) return;
    editingIngredientId = id;
    document.getElementById('ing-nome').value = ing.nome;
    document.getElementById('ing-prezzo').value = ing.prezzo;
    const btnSave = document.getElementById('btn-save-ing');
    btnSave.textContent = "SALVA MODIFICA";
    btnSave.style.background = "#ff9800";
    document.getElementById('btn-cancel-ing').style.display = "inline-block";
};

window.salvaIngrediente = async () => {
    const nome = document.getElementById('ing-nome').value.trim();
    const prezzo = parseFloat(document.getElementById('ing-prezzo').value);
    if (!nome || isNaN(prezzo)) return Swal.fire("Compila nome e prezzo.");

    if (editingIngredientId) {
        await updateDoc(doc(db, "ingredienti", editingIngredientId), { nome, prezzo });
        Swal.fire("Ingrediente modificato!");
    } else {
        await addDoc(collection(db, "ingredienti"), { nome, prezzo });
    }
    resetFormIngredienti();
};

window.resetFormIngredienti = () => {
    editingIngredientId = null;
    document.getElementById('ing-nome').value = "";
    document.getElementById('ing-prezzo').value = "";
    const btnSave = document.getElementById('btn-save-ing');
    btnSave.textContent = "AGGIUNGI";
    btnSave.style.background = "#2e7d32";
    document.getElementById('btn-cancel-ing').style.display = "none";
};

window.caricaRimozioni = () => {
    const l = document.getElementById('lista-rimozioni');
    if (!l) return;
    l.innerHTML = "";
    window.RIMS.sort((a,b) => a.nome.localeCompare(b.nome));

    window.RIMS.forEach(r => {
        const p = r.prezzo ? parseFloat(r.prezzo).toFixed(2) : "0.00";
        const opacity = r.attivo === false ? '0.5' : '1'; 
        l.innerHTML += `
        <div class="db-item" style="opacity:${opacity}">
            <span><b>${r.nome}</b> (Var: € ${p})</span>
            <div>
                <button onclick="preparaModificaRimozione('${r.id}')" class="btn-edit" style="background:#ffb74d; color:black;"><i class="fa fa-pencil"></i></button>
                <button onclick="eliminaDB('rimozioni','${r.id}')" style="background:#ef5350; color:white; border:none; padding:5px 10px; border-radius:5px; cursor:pointer; margin-left:5px;"><i class="fa fa-trash"></i></button>
            </div>
        </div>`;
    });
};

window.preparaModificaRimozione = (id) => {
    const rim = window.RIMS.find(x => x.id === id);
    if (!rim) return;
    editingRimozioneId = id;
    document.getElementById('rim-nome').value = rim.nome;
    document.getElementById('rim-prezzo').value = rim.prezzo || 0;
    const btnSave = document.getElementById('btn-save-rim');
    btnSave.textContent = "SALVA MODIFICA";
    btnSave.style.background = "#ff9800";
    document.getElementById('btn-cancel-rim').style.display = "inline-block";
};

window.salvaRimozione = async () => {
    const nome = document.getElementById('rim-nome').value.trim();
    const prezzo = parseFloat(document.getElementById('rim-prezzo').value || 0);
    if (!nome) return Swal.fire("Compila il nome.");

    if (editingRimozioneId) {
        await updateDoc(doc(db, "rimozioni", editingRimozioneId), { nome, prezzo });
        Swal.fire("Rimozione modificata!");
    } else {
        await addDoc(collection(db, "rimozioni"), { nome, prezzo, attivo: true });
    }
    resetFormRimozioni();
};

window.resetFormRimozioni = () => {
    editingRimozioneId = null;
    document.getElementById('rim-nome').value = "";
    document.getElementById('rim-prezzo').value = "";
    const btnSave = document.getElementById('btn-save-rim');
    btnSave.textContent = "AGGIUNGI";
    btnSave.style.background = "#2e7d32";
    document.getElementById('btn-cancel-rim').style.display = "none";
};

window.generarimozioniAuto = async () => {
    Swal.fire({title:'Analizzare menu per creare rimozioni?', showCancelButton:true}).then(async (r)=>{
        if(!r.isConfirmed) return;
        const uniqueIngs = new Set();
        window.MENU.forEach(p => {
            if(p.ingredienti && Array.isArray(p.ingredienti)) {
                p.ingredienti.forEach(ing => uniqueIngs.add(ing.trim()));
            }
        });
        const existingNames = new Set(window.RIMS.map(r => r.nome));
        let count = 0;
        const batchPromises = [];
        uniqueIngs.forEach(ing => {
            if(!existingNames.has(ing) && ing.length > 2) {
                batchPromises.push(addDoc(collection(db, "rimozioni"), { nome: ing, prezzo: 0, attivo: true }));
                count++;
            }
        });
        await Promise.all(batchPromises);
        Swal.fire(`Generate ${count} nuove rimozioni!`);
    });
};

window.renderizzaConfigStampanti = () => {
    document.getElementById('ip-conto').value = PRINTER_CONFIG.conto?.ip || '';
    document.getElementById('ip-pizzeria').value = PRINTER_CONFIG.pizzeria?.ip || '';
    document.getElementById('ip-cucina').value = PRINTER_CONFIG.cucina?.ip || '';
    document.getElementById('ip-bar').value = PRINTER_CONFIG.bar?.ip || '';
    if(document.getElementById('ip-preconto')) document.getElementById('ip-preconto').value = PRINTER_CONFIG.preconto?.ip || '';

    const renderCats = (targetId, configCats) => {
        const container = document.getElementById(targetId);
        if (!container) return;
        container.innerHTML = "";
        ALL_CATS.forEach(cat => {
            const isChecked = configCats && configCats.includes(cat) ? 'checked' : '';
            const label = CATEGORY_LABELS[cat] || cat;
            container.innerHTML += `<label class="cat-check"><input type="checkbox" value="${cat}" ${isChecked}> ${label}</label>`;
        });
    };
    renderCats('cats-pizzeria', PRINTER_CONFIG.pizzeria?.cats || []);
    renderCats('cats-cucina', PRINTER_CONFIG.cucina?.cats || []);
    renderCats('cats-bar', PRINTER_CONFIG.bar?.cats || []);
};

window.salvaConfigStampanti = async () => {
    const getCats = (containerId) => {
        const arr = [];
        document.querySelectorAll(`#${containerId} input:checked`).forEach(c => arr.push(c.value));
        return arr;
    };
    const newConfig = {
        conto: { ip: document.getElementById('ip-conto').value.trim() },
        preconto: { ip: document.getElementById('ip-preconto') ? document.getElementById('ip-preconto').value.trim() : '' },
        pizzeria: { ip: document.getElementById('ip-pizzeria').value.trim(), cats: getCats('cats-pizzeria') },
        cucina: { ip: document.getElementById('ip-cucina').value.trim(), cats: getCats('cats-cucina') },
        bar: { ip: document.getElementById('ip-bar').value.trim(), cats: getCats('cats-bar') }
    };
    try {
        await setDoc(doc(db, "impostazioni", "stampanti"), newConfig);
        PRINTER_CONFIG = newConfig; 
        Swal.fire("Configurazione salvata!");
    } catch(e) {
        Swal.fire("Errore salvataggio: " + e.message);
    }
};

// --- LOGICA KDS ---
let KDS_CONFIG = { pizzeria: [], cucina: [], dolci: [], bar: [] };
getDoc(doc(db, "impostazioni", "kds")).then(docSnap => {
    if(docSnap.exists()) KDS_CONFIG = docSnap.data();
});

window.renderizzaConfigKDS = () => {
    const renderCats = (targetId, configCats) => {
        const container = document.getElementById(targetId);
        if (!container) return;
        container.innerHTML = "";
        ALL_CATS.forEach(cat => {
            const isChecked = configCats && configCats.includes(cat) ? 'checked' : '';
            const label = CATEGORY_LABELS[cat] || cat;
            container.innerHTML += `<label class="cat-check"><input type="checkbox" value="${cat}" ${isChecked}> ${label}</label>`;
        });
    };
    renderCats('kds-cats-pizzeria', KDS_CONFIG.pizzeria || []);
    renderCats('kds-cats-cucina', KDS_CONFIG.cucina || []);
    renderCats('kds-cats-dolci', KDS_CONFIG.dolci || []);
    renderCats('kds-cats-bar', KDS_CONFIG.bar || []);
};

window.salvaConfigKDS = async () => {
    const getCats = (containerId) => {
        const arr = [];
        document.querySelectorAll(`#${containerId} input:checked`).forEach(c => arr.push(c.value));
        return arr;
    };
    const newConfig = {
        pizzeria: getCats('kds-cats-pizzeria'),
        cucina: getCats('kds-cats-cucina'),
        dolci: getCats('kds-cats-dolci'),
        bar: getCats('kds-cats-bar')
    };
    try {
        await setDoc(doc(db, "impostazioni", "kds"), newConfig);
        KDS_CONFIG = newConfig; 
        Swal.fire({title:'Salvato!', icon:'success', timer:1000, showConfirmButton:false});
    } catch(e) {
        Swal.fire("Errore salvataggio KDS: " + e.message);
    }
};

// --- CRM E FIDELITY ---
window.CRM_CACHE = [];
window.FIDELITY_CONFIG = { attiva: true, soglia: 10, premio: 'Omaggio' };

getDoc(doc(db, "impostazioni", "fidelity")).then(snap => {
    if(snap.exists()) {
        window.FIDELITY_CONFIG = snap.data();
        if(document.getElementById('fid-attiva')) {
            document.getElementById('fid-attiva').checked = window.FIDELITY_CONFIG.attiva;
            document.getElementById('fid-soglia').value = window.FIDELITY_CONFIG.soglia || 10;
            document.getElementById('fid-premio').value = window.FIDELITY_CONFIG.premio || '';
        }
    }
});

window.salvaConfigFidelity = async () => {
    const attiva = document.getElementById('fid-attiva').checked;
    const soglia = parseInt(document.getElementById('fid-soglia').value) || 10;
    const premio = document.getElementById('fid-premio').value.trim();
    const newConfig = { attiva, soglia, premio };
    try {
        await setDoc(doc(db, "impostazioni", "fidelity"), newConfig);
        window.FIDELITY_CONFIG = newConfig;
        showToast("Impostazioni fedeltà salvate!");
        window.caricaCRM();
    } catch(e) {
        Swal.fire("Errore salvataggio fedeltà: " + e.message);
    }
};

window.caricaCRM = async () => {
    const list = document.getElementById('crm-list-container');
    if (!list) return;
    list.innerHTML = '<div style="padding:20px; text-align:center;">Caricamento clienti...</div>';
    const snap = await getDocs(collection(db, "clienti"));
    window.CRM_CACHE = snap.docs.map(d => ({id: d.id, ...d.data()}));
    window.CRM_CACHE.sort((a,b) => (b.totaleSpeso || 0) - (a.totaleSpeso || 0));
    renderCRM(window.CRM_CACHE);
};

window.renderCRM = (clienti) => {
    const list = document.getElementById('crm-list-container');
    if (!list) return;
    list.innerHTML = "";
    
    if(clienti.length === 0) {
        list.innerHTML = '<div style="padding:20px; text-align:center;">Nessun cliente trovato. Premi "Importa da Ordini".</div>';
        return;
    }

    clienti.forEach(c => {
        const firstLetter = c.nome ? c.nome.charAt(0).toUpperCase() : '?';
        const tot = parseFloat(c.totaleSpeso || 0).toFixed(2);
        let tags = "";
        if(c.totaleSpeso > 200) tags += '<span class="crm-tag tag-vip">VIP 👑</span>';
        if(c.numOrdini === 1) tags += '<span class="crm-tag tag-new">NEW</span>';

        const ordiniTotali = c.numOrdini || 0;
        let barraFidelity = "";

        if (window.FIDELITY_CONFIG && window.FIDELITY_CONFIG.attiva) {
            const soglia = parseInt(window.FIDELITY_CONFIG.soglia) || 10;
            const premioTxt = window.FIDELITY_CONFIG.premio || 'Omaggio';
            let puntiFedelta = ordiniTotali % soglia;
            let premioSbloccato = false;
            if (ordiniTotali > 0 && puntiFedelta === 0) { premioSbloccato = true; puntiFedelta = soglia; }
            const percentuale = (puntiFedelta / soglia) * 100;
            const barColor = premioSbloccato ? "#4caf50" : ""; 
            const labelColor = premioSbloccato ? "color:#2e7d32; font-size: 0.9em; animation: blink 1.5s infinite;" : "";
            const labelText = premioSbloccato ? `🎁 SBLOCCATO: ${premioTxt}` : `${puntiFedelta}/${soglia} Ordini`;

            barraFidelity = `
                <div title="Premio: ${premioTxt}" style="margin-top:5px;">
                    <div class="fidelity-bar-bg"><div class="fidelity-bar-fill" style="width: ${percentuale}%; background: ${barColor}"></div></div>
                    <span class="fidelity-label" style="${labelColor}">${labelText}</span>
                </div>
            `;
        }

        list.innerHTML += `
        <div class="crm-card">
            <div style="display:flex; align-items:center; flex:1;">
                <div class="crm-avatar">${window.escapeHtml(firstLetter)}</div>
                <div class="crm-info">
                    <h4>${window.escapeHtml(c.nome)} ${tags}</h4>
                    <small><i class="fa fa-phone"></i> ${window.escapeHtml(c.telefono)}</small>
                    ${barraFidelity}
                </div>
            </div>
            <div class="crm-stats">
                <div><b>€ ${tot}</b> tot.</div>
                <div style="color:#777; font-size:0.85em;">${c.numOrdini} ordini</div>
            </div>
            <div class="crm-actions">
                <a href="whatsapp://send?phone=39${String(c.telefono||'').replace(/[^\d]/g,'')}" class="btn-crm-action" style="background:#25D366;"><i class="fa-brands fa-whatsapp"></i></a>
            </div>
            <div class="crm-actions">
                <button class="btn-crm-action btn-crm-edit" onclick="window.apriModificaCliente('${window.safeId(c.id)}')"><i class="fa fa-pencil"></i></button>
                <button class="btn-crm-action btn-crm-del" onclick="window.eliminaCliente('${c.id}')"><i class="fa fa-trash"></i></button>
            </div>
        </div>`;
    });
};

window.filterCRM = (val) => {
    val = val.toLowerCase();
    const filtered = window.CRM_CACHE.filter(c => (c.nome && c.nome.toLowerCase().includes(val)) || (c.telefono && c.telefono.includes(val)));
    window.renderCRM(filtered);
};

window.analizzaOrdiniEImporta = async () => {
    Swal.fire({ title: 'Analizzare TUTTI gli ordini?', text: "Potrebbe richiedere qualche secondo.", showCancelButton: true }).then(async (r)=>{
        if(!r.isConfirmed) return;
        const snap = await getDocs(collection(db, "ordini"));
        let tempMap = {};
        snap.forEach(d => {
            const o = d.data();
            let tel = o.telefono || (o.cliente ? o.cliente.telefono : "");
            let nome = o.nome || (o.cliente ? o.cliente.nome : "Sconosciuto");
            let totale = parseFloat(o.totale || 0);
            let dataOrd = o.data_ritiro;

            if(tel) {
                tel = tel.replace(/\s+/g, '').replace('+39','');
                if(!tempMap[tel]) tempMap[tel] = { nome: nome, telefono: tel, totaleSpeso: 0, numOrdini: 0, ultimaData: "" };
                tempMap[tel].totaleSpeso += totale;
                tempMap[tel].numOrdini += 1;
                if(nome.length > tempMap[tel].nome.length) tempMap[tel].nome = nome; 
                if(dataOrd > tempMap[tel].ultimaData) tempMap[tel].ultimaData = dataOrd;
            }
        });

        const promises = [];
        Object.keys(tempMap).forEach(key => {
            promises.push(setDoc(doc(db, "clienti", key), tempMap[key], { merge: true }));
        });
        await Promise.all(promises);
        Swal.fire(`Analisi completata! ${promises.length} clienti aggiornati.`);
        window.caricaCRM();
    });
};

window.updateClienteCRM = async (nome, tel, totale, data) => {
    if(!tel) return;
    tel = tel.replace(/\s+/g, '').replace('+39','');
    const ref = doc(db, "clienti", tel);
    const snap = await getDoc(ref);
    if(snap.exists()) {
        const c = snap.data();
        await updateDoc(ref, { totaleSpeso: (c.totaleSpeso || 0) + totale, numOrdini: (c.numOrdini || 0) + 1, ultimaData: data, nome: nome });
    } else {
        await setDoc(ref, { nome: nome, telefono: tel, totaleSpeso: totale, numOrdini: 1, ultimaData: data });
    }
};

window.apriModificaCliente = (id) => {
    const c = window.CRM_CACHE.find(x => String(x.id) === String(id));
    if(!c) return Swal.fire("Errore", "Impossibile trovare i dati di questo cliente.", "error");
    document.getElementById('edit-cli-old-id').value = c.id; 
    document.getElementById('edit-cli-nome').value = c.nome || "";
    document.getElementById('edit-cli-tel').value = c.telefono || "";
    document.getElementById('modal-edit-client').style.display = 'flex';
};

window.salvaModificaCliente = async () => {
    const oldId = document.getElementById('edit-cli-old-id').value;
    const nuovoNome = document.getElementById('edit-cli-nome').value.trim();
    let nuovoTel = document.getElementById('edit-cli-tel').value.trim();
    if (!nuovoNome || !nuovoTel) return Swal.fire("Attenzione", "Nome e Telefono sono obbligatori.", "warning");
    nuovoTel = nuovoTel.replace(/\s+/g, '').replace('+39','');

    try {
        Swal.fire({title: 'Salvataggio...', didOpen: () => { Swal.showLoading() }});
        if (oldId === nuovoTel) {
            await updateDoc(doc(db, "clienti", oldId), { nome: nuovoNome });
        } else {
            const vecchiDati = window.CRM_CACHE.find(c => c.id === oldId);
            const checkSnap = await getDoc(doc(db, "clienti", nuovoTel));
            if(checkSnap.exists()) return Swal.fire("Errore", "Un cliente con questo nuovo numero esiste già.", "error");
            await setDoc(doc(db, "clienti", nuovoTel), {
                nome: nuovoNome, telefono: nuovoTel,
                totaleSpeso: vecchiDati ? vecchiDati.totaleSpeso : 0,
                numOrdini: vecchiDati ? vecchiDati.numOrdini : 0,
                ultimaData: vecchiDati ? vecchiDati.ultimaData : new Date().toISOString().split('T')[0]
            });
            await deleteDoc(doc(db, "clienti", oldId));
        }
        document.getElementById('modal-edit-client').style.display = 'none';
        Swal.fire({title: 'Cliente Aggiornato!', icon: 'success', timer: 1500, showConfirmButton: false});
        window.caricaCRM(); 
    } catch (e) {
        Swal.fire("Errore nel salvataggio", e.message, "error");
    }
};

window.apriNuovoCliente = () => {
    document.getElementById('new-cli-nome').value = "";
    document.getElementById('new-cli-tel').value = "";
    document.getElementById('modal-new-client').style.display = 'flex';
};

window.salvaNuovoCliente = async () => {
    const nome = document.getElementById('new-cli-nome').value.trim();
    const tel = document.getElementById('new-cli-tel').value.trim();
    if (!nome || !tel) return Swal.fire("Attenzione", "Compila sia il Nome che il Telefono.", "warning");
    const docId = tel.replace(/\s+/g, '').replace('+39','');

    try {
        const docRef = doc(db, "clienti", docId);
        const snap = await getDoc(docRef);
        if (snap.exists()) return Swal.fire("Errore", "Un cliente con questo numero esiste già!", "error");
        await setDoc(docRef, { nome: nome, telefono: tel, totaleSpeso: 0, numOrdini: 0, ultimaData: new Date().toISOString().split('T')[0] });
        document.getElementById('modal-new-client').style.display = 'none';
        Swal.fire({title: 'Cliente Aggiunto!', icon: 'success', timer: 1500, showConfirmButton: false});
        caricaCRM(); 
    } catch (e) {
        Swal.fire("Errore salvataggio", e.message, "error");
    }
};

window.eliminaCliente = async (id) => {
    Swal.fire({title:'Eliminare cliente?', showCancelButton:true}).then(async (r)=>{
        if(r.isConfirmed) {
            try { await deleteDoc(doc(db, "clienti", id)); caricaCRM(); } catch(e) { Swal.fire("Errore: " + e.message); }
        }
    });
};

window.caricaDipendenti = async () => {
    const snap = await getDocs(collection(db, "dipendenti"));
    const l = document.getElementById('lista-dipendenti');
    if (!l) return;
    l.innerHTML = "";
    snap.forEach(d => {
        const dip = d.data();
        const badgeRuolo = dip.ruolo === 'rider'
            ? `<span style="background:#f59e0b; color:#000; padding:2px 8px; border-radius:10px; font-size:0.8em; font-weight:bold; margin-left:6px;">🛵 RIDER</span>`
            : `<span style="background:#e0e0e0; color:#333; padding:2px 8px; border-radius:10px; font-size:0.8em; font-weight:bold; margin-left:6px;">CAMERIERE</span>`;
        l.innerHTML += `<div class="db-item"><span><b>${window.escapeHtml(dip.nome)}</b> (PIN: ${window.escapeHtml(dip.pin)}) ${badgeRuolo}</span><button onclick="eliminaDB('dipendenti','${window.safeId(d.id)}')" style="background:#ef5350; color:white; border:none; padding:8px 12px; border-radius:5px; cursor:pointer;"><i class="fa fa-trash"></i></button></div>`;
    });
};

window.salvaDipendente = async () => {
    const nome = document.getElementById('dip-nome').value.trim();
    const pin = document.getElementById('dip-pin').value.trim();
    const ruolo = document.getElementById('dip-ruolo')?.value === 'rider' ? 'rider' : 'cameriere';
    if(nome && /^\d{4}$/.test(pin)) {
        const snap = await getDocs(query(collection(db, "dipendenti")));
        let foundDuplicate = false;
        snap.forEach(d => { if (String(d.data().pin).trim() === pin) foundDuplicate = true; });
        if (foundDuplicate || pin === "0000") {
            return Swal.fire({icon:'error', title:'Errore', text:'Questo PIN è già in uso o non è valido!'});
        }
        await addDoc(collection(db, "dipendenti"), {nome, pin, ruolo});
        document.getElementById('dip-nome').value = "";
        document.getElementById('dip-pin').value = "";
        window.caricaDipendenti();
        Swal.fire({icon:'success', title:'Operatore Aggiunto!', timer:1500, showConfirmButton:false});
    } else {
        Swal.fire('Inserisci Nome e PIN di 4 cifre.');
    }
};

window.apriMonitorCucina = () => {
    document.getElementById('kds-screen').style.display = 'block';
    if(window.renderKDS) window.renderKDS();
};

window.renderKDS = () => {
    if(!document.getElementById('kds-screen') || document.getElementById('kds-screen').style.display === 'none') return;
    const grid = document.getElementById('kds-grid');
    grid.innerHTML = "";
    const attivi = ordiniCache.filter(o => o.stato !== 'Consegnato' && o.stato !== 'Pronto');
    attivi.sort((a,b) => (a.orario || "23:59").localeCompare(b.orario || "23:59"));

    attivi.forEach(o => {
        let borderColor = "#4caf50";
        const now = new Date();
        const [h, m] = (o.orario || "00:00").split(':');
        const target = new Date(); target.setHours(h, m, 0);
        const diff = (target - now) / 60000;
        if(diff < 15) borderColor = "#ff9800";
        if(diff < 5) borderColor = "#f44336";

        const itemsCucina = (o.prodotti || []).filter(p => !['bibita','birra','vino','bibita_lattina','bibita_bottiglia'].includes(p.cat));
        if(itemsCucina.length === 0) return;

        let itemsHtml = itemsCucina.map(p => {
            const qtaDisplay = p.qta % 1 === 0 ? p.qta : p.qta.toFixed(3);
            return `<div class="kds-item"><b>${window.escapeHtml(qtaDisplay)}</b> x ${window.escapeHtml(p.nome)}${p.dettagli ? `<span class="kds-note">${window.sanitizeHtml(p.dettagli)}</span>` : ''}</div>`;
        }).join('');

        grid.innerHTML += `
            <div class="kds-card" style="border-color:${borderColor}">
                <div class="kds-header" style="background:${borderColor}">${window.escapeHtml(o.orario)} - ${o.tavolo ? 'TAV '+window.escapeHtml(o.tavolo) : 'ASPORTO'}</div>
                <div style="padding:10px;">
                    <div style="font-size:1.2em; font-weight:bold; margin-bottom:10px; color:#ddd;">${window.escapeHtml(o.nome)}</div>
                    ${itemsHtml}
                </div>
                <button onclick="cambiaStato('${window.safeId(o.id)}', 'Pronto')" style="width:100%; padding:15px; background:#333; color:white; border:none; font-size:1.2em; cursor:pointer; margin-top:10px;">PRONTO</button>
            </div>
        `;
    });
};

// --- MAPPA TAVOLI E PRENOTAZIONI ---
window.NUMERO_TAVOLI_LOCALE = 30;

window.apriMappa = () => {
    document.getElementById('modal-mappa').style.display = 'flex';
    if (window.renderMappa) window.renderMappa();
};

window.chiudiMappa = () => {
    document.getElementById('modal-mappa').style.display = 'none';
};

window.renderMappa = () => {
    const grid = document.getElementById('mappa-grid');
    if(!grid) return;
    grid.innerHTML = "";
    
    let tavoliDaMostrare = [];
    for (let i = 1; i <= window.NUMERO_TAVOLI_LOCALE; i++) tavoliDaMostrare.push(i.toString());

    ordiniCache.forEach(o => {
        if(o.tavolo && (o.stato === 'In forno' || o.stato === 'Pronto' || o.stato === 'In attesa' || o.stato === 'Prenotato')) {
            if(!tavoliDaMostrare.includes(o.tavolo)) tavoliDaMostrare.push(o.tavolo);
        }
    });

    tavoliDaMostrare.forEach(tavoloNum => {
        let ordiniAttivi = ordiniCache.filter(o => o.tavolo === tavoloNum && (o.stato === 'In forno' || o.stato === 'Pronto' || o.stato === 'In attesa'));
        let prenotazioni = ordiniCache.filter(o => o.tavolo === tavoloNum && o.stato === 'Prenotato').sort((a,b) => (a.orario || "00:00").localeCompare(b.orario || "00:00"));
        
        let ordineAttivo = ordiniAttivi[0] || null;
        let prenotazione = prenotazioni[0] || null;
        let totTurni = ordiniAttivi.length + prenotazioni.length;
        let multiBadge = totTurni > 1 ? ` <span style="background:#2962ff; color:#fff; padding:1px 5px; border-radius:4px; font-size:0.75em;">+${totTurni - 1}</span>` : '';

        let div = document.createElement('div');
        let fontSize = tavoloNum.length > 3 ? '1.2em' : '2.5em';
        
        if (ordineAttivo) {
            let tot = parseFloat(ordineAttivo.totale||0).toFixed(2);
            div.className = 'table-box occupied';
            let nomeCliente = (ordineAttivo.nome || ordineAttivo.cliente?.nome || "").trim();
            if (!nomeCliente || nomeCliente.startsWith("TAVOLO")) nomeCliente = "Occupato";
            let nomeBreve = nomeCliente.split(" ")[0].toUpperCase();
            div.innerHTML = `<span class="table-num" style="font-size: ${fontSize};">${tavoloNum}</span><div class="table-info" style="line-height: 1.2; padding-top: 3px;"><b style="font-size: 1.1em; color: #fff;">${window.escapeHtml(nomeBreve)}${multiBadge}</b><br><small style="color: #ffcccc;">€ ${tot}</small></div>`;
            div.onclick = () => { window.chiudiMappa(); window.apriModifica(ordineAttivo.id); }; 
        } else if (prenotazione) {
            div.className = 'table-box reserved';
            div.innerHTML = `<span class="table-num" style="font-size: ${fontSize};">${tavoloNum}</span><div class="table-info">${window.escapeHtml(prenotazione.orario || '')}${multiBadge}<br>${window.escapeHtml(prenotazione.nome || '')}</div>`;
            div.onclick = () => window.gestisciPrenotazione(prenotazione);
        } else {
            div.className = 'table-box';
            div.innerHTML = `<span class="table-num" style="font-size: ${fontSize};">${tavoloNum}</span><div class="table-info">Libero</div>`;
            div.onclick = () => window.chiediAzioneTavolo(tavoloNum);
        }
        grid.appendChild(div);
    });
};

window.chiediTavoloManuale = async () => {
    const { value: nomeTavolo } = await Swal.fire({
        title: 'Aggiungi Tavolo Extra',
        input: 'text',
        inputLabel: 'Inserisci il numero o nome (es. 40, 12B, Esterno)',
        inputPlaceholder: 'Nome tavolo...',
        showCancelButton: true,
        confirmButtonColor: '#2196f3',
        confirmButtonText: 'Avanti',
        cancelButtonText: 'Annulla'
    });
    if (nomeTavolo && nomeTavolo.trim() !== '') window.chiediAzioneTavolo(nomeTavolo.trim().toUpperCase());
};

window.chiediAzioneTavolo = (numTavolo) => {
    Swal.fire({
        title: `Tavolo ${numTavolo}`,
        text: "Cosa vuoi fare?",
        showCancelButton: true,
        showDenyButton: true,
        confirmButtonColor: '#4caf50',
        denyButtonColor: '#ffb300',
        confirmButtonText: '📝 Apri Ordine',
        denyButtonText: '📅 Aggiungi Prenotazione',
        cancelButtonText: 'Annulla'
    }).then((result) => {
        if (result.isConfirmed) {
            window.chiudiMappa();
            document.getElementById('new-ord-tavolo').value = numTavolo;
            window.toggleTipoOrdine('tavolo');
            document.getElementById('modal-new-order').style.display = 'flex';
        } else if (result.isDenied) {
            window.aggiungiPrenotazioneRapida(numTavolo);
        }
    });
};

window.aggiungiPrenotazioneRapida = async (tavolo) => {
    const { value: formValues } = await Swal.fire({
        title: `Prenotazione Tavolo ${tavolo}`,
        html:
            `<input id="swal-nome" class="swal2-input" placeholder="Nome Cliente (Obbligatorio)">` +
            `<input id="swal-ora" type="time" class="swal2-input">` +
            `<input id="swal-coperti" type="number" class="swal2-input" placeholder="Numero Coperti (Es. 4)">` +
            `<input id="swal-tel" type="tel" class="swal2-input" placeholder="Telefono (Opzionale)">`,
        focusConfirm: false,
        showCancelButton: true,
        confirmButtonText: 'Salva Prenotazione',
        preConfirm: () => {
            return {
                nome: document.getElementById('swal-nome').value,
                ora: document.getElementById('swal-ora').value,
                coperti: document.getElementById('swal-coperti').value,
                tel: document.getElementById('swal-tel').value
            }
        }
    });

    if (formValues && formValues.nome && formValues.ora) {
        const dataRitiro = document.getElementById('timeline-date').value || new Date().toISOString().split('T')[0];
        const op = sessionStorage.getItem('operatore_corrente') || 'Cassa';
        const newOrderData = {
            data_ritiro: dataRitiro, data_invio: serverTimestamp(),
            nome: formValues.nome, telefono: formValues.tel,
            tavolo: tavolo, coperti: parseInt(formValues.coperti || 2),
            orario: formValues.ora, stato: 'Prenotato', tipo: 'SALA',
            prodotti: [], totale: 0, operatore: op
        };
        await addDoc(collection(db, "ordini"), newOrderData);
        Swal.fire({icon: 'success', title: 'Prenotato!', timer:1000, showConfirmButton:false});
        window.renderMappa(); 
    } else if (formValues) {
        Swal.fire("Errore", "Inserisci almeno Nome e Orario!", "error");
    }
};

window.gestisciPrenotazione = (prenotazione) => {
    Swal.fire({
        title: `Prenotazione: ${window.escapeHtml(prenotazione.nome)}`,
        html: `Ore: <b>${window.escapeHtml(prenotazione.orario)}</b><br>Coperti: <b>${window.escapeHtml(prenotazione.coperti)}</b><br>Tel: ${window.escapeHtml(prenotazione.telefono || 'Non inserito')}`,
        icon: 'info',
        showCancelButton: true,
        showDenyButton: true,
        confirmButtonColor: '#4caf50',
        denyButtonColor: '#d32f2f',
        confirmButtonText: '✅ Cliente Arrivato (Apri Tavolo)',
        denyButtonText: '🗑️ Annulla Prenotazione',
        cancelButtonText: 'Chiudi'
    }).then(async (result) => {
        if (result.isConfirmed) {
            await updateDoc(doc(db, "ordini", prenotazione.id), { stato: 'In forno', data_invio: serverTimestamp() });
            window.chiudiMappa();
            window.apriModifica(prenotazione.id); 
        } else if (result.isDenied) {
            await updateDoc(doc(db, "ordini", prenotazione.id), { stato: 'Annullato' });
            window.renderMappa();
        }
    });
};

setInterval(() => {
    if (document.getElementById('modal-mappa') && document.getElementById('modal-mappa').style.display === 'flex') {
        window.renderMappa();
    }
}, 3000);

// --- MOTORE DI INVIO ALLA CASSA OLIVETTI ---
async function inviaFiscaleOlivetti(xmlData, id, importoPagato, o, metodoPagamento, isQuota) {
    let printerIpRaw = PRINTER_CONFIG['conto'] ? PRINTER_CONFIG['conto'].ip : '';
    if (!printerIpRaw) return Swal.fire('Errore', 'Inserisci l\'IP della Cassa nel Gestionale', 'error');

    let printerIp = printerIpRaw.replace('http://', '').replace('https://', '').split(':')[0];
    let url = `http://${printerIp}/oli_webservice.cgi`;

    try {
        Swal.fire({ title: 'Emissione...', text: 'Comunicazione con la cassa in corso...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        let cleanXml = xmlData.replace(/\n|\r/g, '').replace(/>\s+</g, '><');
        const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/xml' }, body: cleanXml });
        const responseText = await response.text();

        if (response.ok && !responseText.toLowerCase().includes('error')) {
            let totaleOrdine = Number(o.totale) || 0;
            let pagatoAttuale = Number(o.pagato_finora) || 0;
            let importoDaAggiungere = Number(importoPagato) || 0;
            let nuovoPagato = pagatoAttuale + importoDaAggiungere;
            let nuovoRimanente = totaleOrdine - nuovoPagato;

            if (!isQuota || nuovoRimanente <= 0.05) {
                await updateDoc(doc(db, "ordini", id), { stato: 'Consegnato', pagato_finora: totaleOrdine, metodo_pagamento: isQuota ? 'MISTO' : (metodoPagamento || 'CONTANTI') });
                Swal.fire('Emesso!', 'Scontrino stampato correttamente.', 'success');
                window.chiudiPagamento();
            } else {
                await updateDoc(doc(db, "ordini", id), { pagato_finora: nuovoPagato });
                Swal.fire('Quota Emessa!', `Rimangono da pagare €${nuovoRimanente.toFixed(2)}`, 'success');
                window.apriPagamento(id); 
            }
        } else {
            Swal.fire('Rifiutato', 'La cassa ha risposto: ' + responseText.substring(0, 100), 'error');
        }
    } catch (e) {
        Swal.fire('Impossibile Connettersi', 'Assicurati di aver sbloccato i "Contenuti non sicuri" nel lucchetto di Chrome!', 'error');
    }
}

window.emettiScontrinoFiscale = async (metodoPagamento) => {
    const id = window.currentPayOrderId;
    const o = ordiniCache.find(x => x.id === id);
    if(!o) return;

    let righe = ["ANNULLO", "CHIAVE|1"];
    (o.prodotti || []).forEach(p => {
        let prezzo = parseFloat(p.prezzo).toFixed(2).replace('.', ',');
        let qta = parseInt(p.qta);
        let nome = p.nome.substring(0, 15).toUpperCase().replace(/[^A-Z0-9 ]/g, "");
        let reparto = (['bibita', 'birra', 'acqua', 'bar', 'vino'].some(k => (p.cat || '').toLowerCase().includes(k))) ? "24" : "22";
        righe.push(`VEND|${reparto}|${qta}|${prezzo}|${nome}`);
    });

    const copPrice = (window.prezzoCopertoLocale || 2.50).toFixed(2).replace('.', ',');
    if(o.coperti > 0) righe.push(`VEND|22|${o.coperti}|${copPrice}|COPERTO`);

    let totaleVal = parseFloat(document.getElementById('pay-total').innerText.replace('€ ','').replace(',', '.'));
    let tipoPag = (metodoPagamento === 'CONTANTI') ? "1" : "2"; 
    righe.push(`CHIUSURA|${tipoPag}|${totaleVal.toFixed(2).replace('.', ',')}`);

    const testoFinale = righe.join("\r\n") + "\r\n";

    try {
        Swal.fire({ title: 'Invio alla cassa...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        const percorsoDesktop = "C:/Users/paolo/OneDrive/Desktop/SwInstallato/Olivetti/ElaExecute/IN/";
        const nomeFile = `sc${Math.floor(Math.random() * 9000)}.txt`;
        const config = qz.configs.create({ file: percorsoDesktop + nomeFile });
        await qz.print(config, [ { type: 'raw', format: 'plain', data: testoFinale } ]);

        await updateDoc(doc(db, "ordini", id), { stato: 'Consegnato', pagato_finora: totaleVal, metodo_pagamento: metodoPagamento });
        Swal.fire('Inviato!', 'Scontrino in stampa.', 'success');
        window.chiudiPagamento();
    } catch (e) {
        Swal.fire('Errore', "Controlla il percorso: " + e.message, 'error');
    }
};

// --- LOGICA STATISTICHE E GRAFICI ---
window.chartAndamentoInstance = null;
window.chartProdottiInstance = null;

window.apriStatistiche = () => {
    document.getElementById('modal-stats').style.display = 'flex';
    if (window.calcolaStatistiche) window.calcolaStatistiche();
};
window.chiudiStatistiche = () => {
    document.getElementById('modal-stats').style.display = 'none';
};

window.calcolaStatistiche = () => {
    let incassoTotale = 0, ordiniCompletati = 0, copertiTotali = 0;
    let prodottiVenduti = {}, incassoOrario = {};

    ordiniCache.forEach(o => {
        if (o.stato === 'Consegnato' || o.pagato_finora > 0) {
            let totaleOrdine = parseFloat(o.totale || 0);
            incassoTotale += totaleOrdine;
            ordiniCompletati++;
            copertiTotali += parseInt(o.coperti || 0);

            let orario = o.orario || "19:00"; 
            if (orario && orario.includes(':')) {
                let ora = orario.split(':')[0] + ":00";
                incassoOrario[ora] = (incassoOrario[ora] || 0) + totaleOrdine;
            }

            if (o.prodotti && Array.isArray(o.prodotti)) {
                o.prodotti.forEach(p => {
                    if(p.cat === 'variazione') return;
                    let qta = parseFloat(p.qta || 1);
                    prodottiVenduti[p.nome] = (prodottiVenduti[p.nome] || 0) + qta;
                });
            }
        }
    });

    document.getElementById('stat-incasso').innerText = '€ ' + incassoTotale.toFixed(2);
    document.getElementById('stat-ordini').innerText = ordiniCompletati;
    document.getElementById('stat-coperti').innerText = copertiTotali;

    window.disegnaGrafici(incassoOrario, prodottiVenduti);
};

window.disegnaGrafici = (datiOrari, datiProdotti) => {
    const ctxAndamento = document.getElementById('chartAndamento')?.getContext('2d');
    if (ctxAndamento) {
        let labelOre = Object.keys(datiOrari).sort();
        let valoriOre = labelOre.map(ora => datiOrari[ora]);
        if (window.chartAndamentoInstance) window.chartAndamentoInstance.destroy();
        window.chartAndamentoInstance = new Chart(ctxAndamento, {
            type: 'line',
            data: {
                labels: labelOre.length > 0 ? labelOre : ['In attesa di ordini'],
                datasets: [{
                    label: 'Incasso in €',
                    data: valoriOre.length > 0 ? valoriOre : [0],
                    borderColor: '#9c27b0',
                    backgroundColor: 'rgba(156, 39, 176, 0.2)',
                    borderWidth: 3, pointBackgroundColor: '#fff', pointRadius: 5, fill: true, tension: 0.4
                }]
            },
            options: { responsive: true, color: '#fff', scales: { x: { ticks: { color: '#aaa' }, grid: { color: '#333' } }, y: { ticks: { color: '#aaa', callback: function(val) { return '€ ' + val; } }, grid: { color: '#333' } } } }
        });
    }

    const ctxProdotti = document.getElementById('chartProdotti')?.getContext('2d');
    if (ctxProdotti) {
        let arrayProdotti = Object.keys(datiProdotti).map(nome => ({ nome, qta: datiProdotti[nome] }));
        arrayProdotti.sort((a, b) => b.qta - a.qta);
        let top5 = arrayProdotti.slice(0, 5);
        if (window.chartProdottiInstance) window.chartProdottiInstance.destroy();
        window.chartProdottiInstance = new Chart(ctxProdotti, {
            type: 'doughnut',
            data: {
                labels: top5.length > 0 ? top5.map(p => p.nome) : ['Nessun dato'],
                datasets: [{
                    data: top5.length > 0 ? top5.map(p => p.qta) : [1],
                    backgroundColor: ['#ff6384', '#36a2eb', '#ffce56', '#4bc0c0', '#9966ff'],
                    borderWidth: 2, borderColor: '#111'
                }]
            },
            options: { responsive: true, color: '#fff', plugins: { legend: { position: 'bottom', labels: { color: '#ccc', padding: 15 } } } }
        });
    }
};

// --- STORICO ORDINI CHIUSI ---
window.apriStorico = () => {
    document.getElementById('modal-storico').style.display = 'flex';
    const dateInput = document.getElementById('storico-date');
    const dataScelta = document.getElementById('timeline-date') ? document.getElementById('timeline-date').value : new Date().toISOString().split('T')[0];
    dateInput.value = dataScelta;
    window.caricaStoricoData();
};

window.caricaStoricoData = async () => {
    const lista = document.getElementById('lista-storico');
    lista.innerHTML = "<div style='text-align:center; padding:30px; color:#aaa;'><i class='fa fa-spinner fa-spin fa-2x'></i><br>Ricerca ordini...</div>";
    const dataScelta = document.getElementById('storico-date').value;

    try {
        const q = query(collection(db, "ordini"), where("data_ritiro", "==", dataScelta));
        const snap = await getDocs(q);
        let ordini = [];
        snap.forEach(d => {
            const data = d.data();
            if (data.stato === "Consegnato" || data.stato === "Pagato") {
                ordini.push({id: d.id, ...data});
            }
        });
        
        if(ordini.length === 0) {
            const dataFormattata = dataScelta.split('-').reverse().join('/');
            lista.innerHTML = `<div style='text-align:center; color:#888; padding:30px;'>Nessun ordine chiuso trovato per il <b>${dataFormattata}</b>.</div>`;
            return;
        }

        ordini.sort((a,b) => {
            const timeA = a.data_chiusura?.toMillis ? a.data_chiusura.toMillis() : (a.timestamp_chiusura?.toMillis ? a.timestamp_chiusura.toMillis() : 0);
            const timeB = b.data_chiusura?.toMillis ? b.data_chiusura.toMillis() : (b.timestamp_chiusura?.toMillis ? b.timestamp_chiusura.toMillis() : 0);
            return timeB - timeA;
        });

        let html = "";
        ordini.forEach(o => {
            const identificativo = o.tavolo ? `TAVOLO ${o.tavolo}` : (o.nome || 'Asporto');
            const icona = o.tipo === 'SALA' ? 'fa-utensils' : 'fa-bag-shopping';
            html += `
            <div style="background:#222; padding:15px; border-radius:8px; margin-bottom:10px; border-left:5px solid #607d8b; display:flex; justify-content:space-between; align-items:center;">
                <div>
                    <b style="font-size:1.2em; color:var(--gold);"><i class="fa ${icona}"></i> ${identificativo}</b><br>
                    <small style="color:#aaa;">Orario: ${o.orario || '--:--'} | Totale: €${parseFloat(o.totale || 0).toFixed(2)}</small>
                </div>
                <div>
                    <button onclick="vediDettagliStorico('${window.safeId(o.id)}')" style="background:#2196f3; color:white; border:none; padding:10px 15px; border-radius:5px; font-weight:bold; cursor:pointer; box-shadow: 0 2px 4px rgba(0,0,0,0.3);">
                        <i class="fa fa-eye"></i> VEDI ORDINE
                    </button>
                </div>
            </div>`;
        });
        lista.innerHTML = html;
    } catch (e) {
        lista.innerHTML = `<div style="color:red; padding:20px;">Errore di connessione: ${e.message}</div>`;
    }
};

window.vediDettagliStorico = async (id) => {
    try {
        const docSnap = await getDoc(doc(db, "ordini", id));
        if (!docSnap.exists()) return Swal.fire("Errore", "Ordine non trovato.", "error");
        const o = docSnap.data();
        
        let prodHtml = '<div style="text-align:left; background:#222; padding:10px; border-radius:8px; max-height:250px; overflow-y:auto; margin-bottom:15px; border:1px solid #444;">';
        if (o.prodotti && o.prodotti.length > 0) {
            o.prodotti.forEach(p => {
                let det = (p.dettagli && p.dettagli !== 'Normale') ? `<br><small style="color:#aaa;">${window.sanitizeHtml(p.dettagli)}</small>` : '';
                prodHtml += `<div style="border-bottom:1px solid #333; padding:8px 0; color:white;"><div style="display:flex; justify-content:space-between;"><b>${window.escapeHtml(p.qta)}x ${window.escapeHtml(p.nome)}</b><span style="color:#ffea00;">€${(p.prezzo * p.qta).toFixed(2)}</span></div>${det}</div>`;
            });
        } else {
            prodHtml += `<div style="color:#888;">Nessun prodotto registrato.</div>`;
        }
        prodHtml += '</div>';

        Swal.fire({
            title: `Dettagli Ordine`,
            html: `
                <div style="color:#aaa; font-size:1em; margin-bottom:15px; padding-bottom:10px; border-bottom:1px dashed #555;">
                    ${window.escapeHtml(o.tavolo ? 'TAVOLO ' + o.tavolo : (o.nome || 'Asporto'))} | Ore: ${window.escapeHtml(o.orario || '--:--')} <br>
                    <b style="font-size:1.2em; color:white;">Totale Pagato: €${parseFloat(o.totale || 0).toFixed(2)}</b>
                </div>
                ${prodHtml}
            `,
            background: '#111', color: '#fff', width: 500,
            showCancelButton: true, showDenyButton: true,
            confirmButtonColor: '#ff9800', cancelButtonColor: '#444', denyButtonColor: '#d32f2f',
            confirmButtonText: '<i class="fa fa-print"></i> Ristampa Preconto',
            cancelButtonText: 'Chiudi',
            denyButtonText: '<i class="fa fa-unlock"></i> Riapri in Cassa'
        }).then(async (result) => {
            if (result.isConfirmed) {
                if (typeof window.stampa === 'function') {
                    window.stampa(id, 'PRECONTO');
                    Swal.fire({icon: 'success', title: 'Stampa inviata!', timer: 1000, showConfirmButton: false});
                }
            } else if (result.isDenied) {
                window.riapriOrdine(id);
            }
        });
    } catch (e) {
        Swal.fire("Errore", e.message, "error");
    }
};

window.riapriOrdine = async (id) => {
    Swal.fire({
        title: 'Forzare la riapertura?',
        text: "Questo sposterà l'ordine di nuovo nei 'DA PAGARE / PRONTI' per essere modificato.",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d32f2f',
        cancelButtonColor: '#444',
        confirmButtonText: 'Sì, sbloccalo'
    }).then(async (result) => {
        if (result.isConfirmed) {
            try {
                await updateDoc(doc(db, "ordini", id), { stato: "Pronto" });
                Swal.fire({icon: 'success', title: 'Sbloccato!', timer: 1000, showConfirmButton: false});
                window.caricaStoricoData(); 
            } catch(e) {
                Swal.fire("Errore", e.message, "error");
            }
        }
    });
};

window.eliminaFotoProdotto = async () => {
    if (!editingProdId) return; 
    const p = mappaProdotti[editingProdId];
    if (!p || (!p.immagine_url && !p.foto)) return;

    Swal.fire({
        title: 'Vuoi eliminare la foto?',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d32f2f',
        cancelButtonColor: '#444',
        confirmButtonText: 'Sì, elimina',
        cancelButtonText: 'Annulla'
    }).then(async (result) => {
        if (result.isConfirmed) {
            try {
                Swal.fire({title: 'Eliminazione in corso...', didOpen: () => { Swal.showLoading() }});
                if (p.immagine_url && p.immagine_url.startsWith('http')) {
                    try {
                        const fileRef = ref(storage, p.immagine_url);
                        await deleteObject(fileRef);
                    } catch (e) {}
                }
                await updateDoc(doc(db, "prodotti", editingProdId), { immagine_url: null, foto: null });
                document.getElementById('new-foto').value = "";
                if (document.getElementById('btn-delete-foto')) document.getElementById('btn-delete-foto').style.display = 'none';
                Swal.fire({icon: 'success', title: 'Eliminata!', timer: 1500, showConfirmButton: false});
            } catch (error) {
                Swal.fire("Errore", "Impossibile eliminare l'immagine.", "error");
            }
        }
    });
};