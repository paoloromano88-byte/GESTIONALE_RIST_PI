// ============================================================================
// LOGIN-DISPOSITIVO.JS - Accesso del dispositivo con l'account del locale
// Sostituisce le credenziali scritte nel codice: se il dispositivo non è
// collegato mostra una schermata email/password. Firebase ricorda l'accesso,
// quindi la schermata compare solo la prima volta (o dopo un logout).
// Ogni account è collegato a un locale dal Super Admin (documento utenti/{uid}):
// dopo l'accesso il dispositivo si apre da solo sul locale dell'account.
// Uso (dentro uno <script type="module">, dopo initializeApp):
//   import { assicuraLoginDispositivo } from "./login-dispositivo.js";
//   await assicuraLoginDispositivo();
// ============================================================================
import { getApps } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const MESSAGGI_ERRORE = {
    'auth/invalid-credential': 'Email o password errati.',
    'auth/invalid-email': 'Email non valida.',
    'auth/user-disabled': 'Questo account è stato disattivato.',
    'auth/too-many-requests': 'Troppi tentativi. Riprova tra qualche minuto.',
    'auth/network-request-failed': 'Connessione assente. Controlla internet e riprova.'
};

function creaOverlay(titolo, onAccedi) {
    const overlay = document.createElement('div');
    overlay.id = 'login-dispositivo-overlay';
    overlay.style.cssText = 'position:fixed; inset:0; z-index:2147483000; display:flex; align-items:center; justify-content:center; padding:20px; background:linear-gradient(135deg, #0f2027 0%, #203a43 50%, #2c5364 100%); font-family:-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;';
    overlay.innerHTML = `
        <form style="background:rgba(0,0,0,0.45); border:1px solid rgba(255,255,255,0.15); border-radius:16px; padding:28px 22px; width:100%; max-width:360px; box-sizing:border-box; text-align:center; color:#fff; box-shadow:0 10px 30px rgba(0,0,0,0.5);">
            <div style="font-size:2.4em; margin-bottom:6px;">🔐</div>
            <h2 data-titolo style="margin:0 0 6px 0; font-size:1.25em;"></h2>
            <p style="margin:0 0 18px 0; color:#cbd5e1; font-size:0.9em;">Accedi con l'account del locale.<br>Serve solo la prima volta su questo dispositivo.</p>
            <input type="email" name="email" placeholder="Email del locale" autocomplete="username" required style="width:100%; box-sizing:border-box; padding:14px; margin-bottom:10px; border-radius:10px; border:1px solid #475569; background:rgba(0,0,0,0.35); color:#fff; font-size:1em;">
            <input type="password" name="password" placeholder="Password" autocomplete="current-password" required style="width:100%; box-sizing:border-box; padding:14px; margin-bottom:14px; border-radius:10px; border:1px solid #475569; background:rgba(0,0,0,0.35); color:#fff; font-size:1em;">
            <div data-errore style="display:none; margin-bottom:12px; color:#fca5a5; font-size:0.9em; font-weight:bold;"></div>
            <button type="submit" style="width:100%; padding:14px; border:none; border-radius:10px; background:#2563eb; color:#fff; font-weight:900; font-size:1.05em; cursor:pointer;">ACCEDI</button>
        </form>`;
    overlay.querySelector('[data-titolo]').textContent = titolo;

    const form = overlay.querySelector('form');
    const errore = overlay.querySelector('[data-errore]');
    const bottone = form.querySelector('button');
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        errore.style.display = 'none';
        bottone.disabled = true;
        bottone.textContent = 'ACCESSO IN CORSO...';
        try {
            await onAccedi(form.email.value.trim(), form.password.value);
        } catch (err) {
            errore.textContent = MESSAGGI_ERRORE[err?.code] || 'Accesso non riuscito. Riprova.';
            errore.style.display = 'block';
            form.password.value = '';
        } finally {
            bottone.disabled = false;
            bottone.textContent = 'ACCEDI';
        }
    });
    return overlay;
}

// Solo gli account email/password sono account del personale (i clienti dell'App usano l'SMS)
function isAccountPersonale(user) {
    return !!user && (user.providerData || []).some(p => p.providerId === 'password');
}

function mostraAccountNonAbilitato(user) {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed; inset:0; z-index:2147483000; display:flex; align-items:center; justify-content:center; padding:20px; background:#0f172a; color:#fff; font-family:-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; text-align:center;';
    overlay.innerHTML = `
        <div style="max-width:380px;">
            <div style="font-size:2.4em; margin-bottom:8px;">⛔</div>
            <h2 style="margin:0 0 10px 0; font-size:1.2em;">Account non abilitato</h2>
            <p style="color:#cbd5e1; font-size:0.95em; margin:0 0 12px 0;">L'account <b data-email></b> non è collegato a nessun locale. Contatta l'assistenza indicando questo codice:</p>
            <code data-uid style="display:block; margin:0 0 18px 0; padding:10px; background:#1e293b; border-radius:8px; word-break:break-all; color:#fbbf24; user-select:all;"></code>
            <button type="button" style="padding:12px 22px; border:none; border-radius:10px; background:#2563eb; color:#fff; font-weight:900; cursor:pointer;">ESCI E USA UN ALTRO ACCOUNT</button>
        </div>`;
    overlay.querySelector('[data-email]').textContent = user.email || user.uid;
    overlay.querySelector('[data-uid]').textContent = user.uid;
    overlay.querySelector('button').addEventListener('click', async () => {
        await signOut(getAuth(getApps()[0]));
        location.reload();
    });
    document.body.appendChild(overlay);
}

// Legge il profilo dell'account (utenti/{uid}) e apre il locale giusto.
// Restituisce il profilo, oppure null se l'account non è abilitato (in quel caso mostra il blocco).
export async function verificaAccountLocale(user) {
    let profilo = null;
    try {
        const snap = await getDoc(doc(getFirestore(getApps()[0]), 'utenti', user.uid));
        profilo = snap.exists() ? snap.data() : null;
    } catch (e) {
        console.warn("Lettura profilo account non riuscita:", e);
    }
    if (!profilo || !['locale', 'superadmin'].includes(profilo.ruolo)) {
        mostraAccountNonAbilitato(user);
        return null;
    }
    if (profilo.ruolo === 'locale') {
        const localeAttuale = window.TENANT_ID || 'default';
        if (profilo.locale && profilo.locale !== localeAttuale) {
            // Il dispositivo era su un altro locale: passa a quello dell'account
            localStorage.setItem('saas_tenant_id', profilo.locale);
            const url = new URL(location.href);
            url.searchParams.set('locale', profilo.locale);
            location.replace(url.toString());
            await new Promise(() => {});
        }
    }
    return profilo;
}

// Restituisce l'utente collegato; se nessuno è collegato mostra la schermata di accesso e attende.
// Con verificaLocale (predefinito) controlla anche che l'account sia abilitato e apre il suo locale.
export function assicuraLoginDispositivo({ titolo = 'Accesso dispositivo', verificaLocale = true } = {}) {
    const auth = getAuth(getApps()[0]);
    const attesaLogin = new Promise((resolve) => {
        let overlay = null;
        let stop = null;
        let collegato = false;
        stop = onAuthStateChanged(auth, (user) => {
            if (isAccountPersonale(user)) {
                if (overlay) overlay.remove();
                collegato = true;
                if (stop) stop();
                resolve(user);
                return;
            }
            if (!overlay) {
                overlay = creaOverlay(titolo, (email, password) => signInWithEmailAndPassword(auth, email, password));
                document.body.appendChild(overlay);
                overlay.querySelector('input[name="email"]').focus();
            }
        });
        if (collegato) stop();
    });
    if (!verificaLocale) return attesaLogin;
    return attesaLogin.then(async (user) => {
        const profilo = await verificaAccountLocale(user);
        if (!profilo) await new Promise(() => {});   // account non abilitato: la pagina resta bloccata
        return user;
    });
}

// Attende che il dispositivo sia collegato, senza mostrare nulla (per script secondari
// di pagine che hanno già una propria schermata di accesso, es. la cassa).
export function attendiUtenteCollegato() {
    const auth = getAuth(getApps()[0]);
    return new Promise((resolve) => {
        let stop = null;
        let collegato = false;
        stop = onAuthStateChanged(auth, (user) => {
            if (!isAccountPersonale(user)) return;
            collegato = true;
            if (stop) stop();
            resolve(user);
        });
        if (collegato) stop();
    });
}
