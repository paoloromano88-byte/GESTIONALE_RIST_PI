// Controlla quali file l'Hosting pubblica sul sito: la radice del repository è la cartella
// pubblicata, quindi ciò che è privato deve stare in "hosting.ignore" di firebase.json.
// Usa la stessa funzione di firebase-tools che sceglie i file al deploy.
// Esecuzione (dalla cartella principale, dopo l'installazione di firebase-tools; niente emulatori):
//   node test/file-pubblicati.test.mjs
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const { listFiles } = require('firebase-tools/lib/listFiles.js');

const radice = new URL('..', import.meta.url).pathname;
const { hosting } = JSON.parse(readFileSync(new URL('../firebase.json', import.meta.url), 'utf8'));
const pubblicati = listFiles(radice, hosting.ignore);

let ok = 0, ko = 0;
function t(nome, condizione, dettaglio = '') {
    if (condizione) { ok++; console.log('  ✔', nome); }
    else { ko++; console.log('  ✘', nome, dettaglio ? `-> ${dettaglio}` : ''); }
}

// Privati: cartelle e file nascosti (.git con la copia del repository, .github, .env…),
// cartelle non pubblicate, configurazione, impostazioni dell'agente con il token e registri
// degli emulatori (firestore-debug.log…)
const CARTELLE_PRIVATE = ['docs', 'functions', 'test', 'agente-stampa', 'node_modules'];
const FILE_PRIVATI = ['CLAUDE.md', 'firebase.json', 'firestore.rules', 'agente-stampa.json'];
const privato = (f) => {
    const parti = f.split('/');
    return parti.some(p => p.startsWith('.'))
        || parti.some(p => CARTELLE_PRIVATE.includes(p))
        || FILE_PRIVATI.includes(parti[parti.length - 1])
        || f.endsWith('.log');
};

const trapelati = pubblicati.filter(privato);
t('nessun file privato pubblicato', trapelati.length === 0,
    `${trapelati.length}: ${trapelati.slice(0, 8).join(', ')}${trapelati.length > 8 ? ', …' : ''}`);

for (const f of ['index.html', 'cassa.html', 'cassa.js', 'cassa.css', 'delivery.html', 'superadmin.html',
                 'comande-escpos.js', 'zone-consegna.js', 'firebase-messaging-sw.js', 'logo.png', '404.html',
                 'gesti/index.html', 'gesti/icona.svg', 'gesti/img/cassa.png', 'gesti/img/app-clienti.png']) {
    t(`${f} pubblicato`, pubblicati.includes(f));
}

console.log(`\nRISULTATO: ${ok} ok, ${ko} falliti (${pubblicati.length} file pubblicati)`);
process.exit(ko ? 1 : 0);
