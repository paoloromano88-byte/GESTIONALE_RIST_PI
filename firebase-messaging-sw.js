// Service worker delle notifiche push dell'App Rider (Firebase Cloud Messaging).
// Mostra l'avviso "Pronto da ritirare" mandato dal server (functions/avvisi-rider.js) anche con
// l'app chiusa; toccandolo si apre l'App Rider. Lo registra la libreria di Firebase in delivery.html.
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

// Le notifiche con titolo e testo le mostra la libreria da sola quando l'app non è in primo piano
firebase.messaging();
