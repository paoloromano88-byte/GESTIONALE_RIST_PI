// Rende AgenteStampa.exe un programma senza finestra (sottosistema "Windows GUI" invece di "console"):
// quando parte con il PC non compare la finestra nera del prompt dei comandi.
// Uso: node sottosistema-gui.mjs AgenteStampa.exe
import fs from 'node:fs';

const file = process.argv[2];
const b = fs.readFileSync(file);
if (b.toString('latin1', 0, 2) !== 'MZ') throw new Error(`${file} non è un programma Windows`);
const pe = b.readUInt32LE(0x3c);
if (b.toString('latin1', pe, pe + 4) !== 'PE\0\0') throw new Error('Intestazione PE mancante');
const opzionale = pe + 24;
if (![0x10b, 0x20b].includes(b.readUInt16LE(opzionale))) throw new Error('Intestazione opzionale sconosciuta');
const sottosistema = opzionale + 68;  // stessa posizione per PE32 e PE32+
const prima = b.readUInt16LE(sottosistema);
b.writeUInt16LE(2, sottosistema);     // 2 = IMAGE_SUBSYSTEM_WINDOWS_GUI (3 = console)
fs.writeFileSync(file, b);
console.log(`Sottosistema di ${file}: ${prima} -> 2 (senza finestra)`);
