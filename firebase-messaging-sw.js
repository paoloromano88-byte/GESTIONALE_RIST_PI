// Service worker delle notifiche push dell'App Rider (Firebase Cloud Messaging).
// Mostra l'avviso "Pronto da ritirare" mandato dal server (functions/avvisi-rider.js) anche con
// l'app chiusa, con il logo del locale; toccandolo si apre l'App Rider. Lo registra la libreria
// di Firebase in delivery.html. Con l'app aperta sullo schermo l'avviso lo dà l'app stessa.
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

firebase.initializeApp({
    apiKey: "AIzaSyDjNba4HvtDZpcoDfnXTOWysn_i1UFwPWU",
    authDomain: "gestionale-ristoranti-96c5b.firebaseapp.com",
    projectId: "gestionale-ristoranti-96c5b",
    storageBucket: "gestionale-ristoranti-96c5b.firebasestorage.app",
    messagingSenderId: "234695436534",
    appId: "1:234695436534:web:2d4cfc9ddbc1f1de9824d7"
});

const FIRESTORE = 'https://firestore.googleapis.com/v1/projects/gestionale-ristoranti-96c5b/databases/(default)/documents/';
const LOGO_PREDEFINITO = '/logo.png';

// Logo caricato dal locale in Cassa > Gestionale > Impostazioni (impostazioni/negozio è leggibile da tutti)
async function logoLocale(locale) {
    const percorso = (locale && locale !== 'default' ? `ristoranti/${encodeURIComponent(locale)}/` : '') + 'impostazioni/negozio';
    const annulla = new AbortController();
    const timer = setTimeout(() => annulla.abort(), 3000);
    try {
        const risposta = await fetch(`${FIRESTORE}${percorso}?mask.fieldPaths=logo_url`, { signal: annulla.signal });
        const logo = (await risposta.json()).fields?.logo_url?.stringValue || '';
        return /^(data:image\/|https:\/\/)/.test(logo) ? logo : LOGO_PREDEFINITO;
    } catch (e) {
        return LOGO_PREDEFINITO;
    } finally {
        clearTimeout(timer);
    }
}

firebase.messaging().onBackgroundMessage(async (messaggio) => {
    const d = messaggio.data || {};
    await self.registration.showNotification(d.titolo || '🍕 Pronto da ritirare', {
        body: d.testo || '',
        tag: d.tag,
        icon: await logoLocale(d.locale),
        vibrate: [300, 120, 300, 120, 300],
        data: { link: d.link || '/delivery.html' },
    });
});

// Tocco sulla notifica: torna all'App Rider se è già aperta, altrimenti la apre
self.addEventListener('notificationclick', (event) => {
    const link = event.notification.data?.link;
    if (!link) return;
    event.notification.close();
    event.waitUntil((async () => {
        const finestre = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        const app = finestre.find(f => new URL(f.url).pathname.endsWith('/delivery.html'));
        return app ? app.focus() : self.clients.openWindow(link);
    })());
});
