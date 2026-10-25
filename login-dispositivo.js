// ============================================================================
// LOGIN-DISPOSITIVO.JS - Accesso del dispositivo con l'account del locale
// Sostituisce le credenziali scritte nel codice: se il dispositivo non è
// collegato mostra una schermata email/password. Firebase ricorda l'accesso,
// quindi la schermata compare solo la prima volta (o dopo un logout).
// Uso (dentro uno <script type="module">, dopo initializeApp):
//   import { assicuraLoginDispositivo } from "./login-dispositivo.js";
//   await assicuraLoginDispositivo();
// ============================================================================
import { getApps } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

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

// Restituisce l'utente collegato; se nessuno è collegato mostra la schermata di accesso e attende.
export function assicuraLoginDispositivo({ titolo = 'Accesso dispositivo' } = {}) {
    const auth = getAuth(getApps()[0]);
    return new Promise((resolve) => {
        let overlay = null;
        let stop = null;
        let collegato = false;
        stop = onAuthStateChanged(auth, (user) => {
            if (user) {
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
}

// Attende che il dispositivo sia collegato, senza mostrare nulla (per script secondari
// di pagine che hanno già una propria schermata di accesso, es. la cassa).
export function attendiUtenteCollegato() {
    const auth = getAuth(getApps()[0]);
    return new Promise((resolve) => {
        let stop = null;
        let collegato = false;
        stop = onAuthStateChanged(auth, (user) => {
            if (!user) return;
            collegato = true;
            if (stop) stop();
            resolve(user);
        });
        if (collegato) stop();
    });
}
