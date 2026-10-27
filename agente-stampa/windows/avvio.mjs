// Punto di partenza di AgenteStampa.exe, il programma per Windows (vedi ../programma.mjs e README.md).
// "--avvio": acceso da Windows all'accensione del PC; la pagina si apre solo se c'è da collegarlo.
import fs from 'node:fs';
import path from 'node:path';
import { avviaProgramma, cartellaPredefinita } from '../programma.mjs';

// Un errore imprevisto non deve fermare le stampe fino al prossimo riavvio del PC: lo si scrive nel registro e si va avanti
function annota(e) {
  try {
    fs.mkdirSync(cartellaPredefinita(), { recursive: true });
    fs.appendFileSync(path.join(cartellaPredefinita(), 'registro.txt'), `${new Date().toLocaleString('it-IT')}  ❌ ${e?.stack || e}\n`);
  } catch { /* niente */ }
}
process.on('uncaughtException', annota);
process.on('unhandledRejection', annota);

avviaProgramma({ pacchetto: true, avvioAutomatico: process.argv.includes('--avvio') })
  .then((p) => { if (!p) process.exit(0); })
  .catch((e) => { annota(e); process.exit(1); });
