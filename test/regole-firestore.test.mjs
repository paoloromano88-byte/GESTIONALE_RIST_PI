// Test delle regole Firestore (firestore.rules) con l'emulatore.
// Esecuzione (serve Java):
//   npm i -D firebase-tools@13.29.1 @firebase/rules-unit-testing@3.0.4 firebase@10.7.1
//   npx firebase emulators:exec --only firestore --project demo-gestionale "node test/regole-firestore.test.mjs"
// L'emulatore deve usare la porta 8085 (vedi "emulators" in firebase.json).
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';
import { doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc, collection, query, where, serverTimestamp, increment, writeBatch } from 'firebase/firestore';

const env = await initializeTestEnvironment({ projectId: 'demo-gestionale', firestore: { rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8085 } });

await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  for (const base of ['', 'ristoranti/pizzeria-test/']) {
    await setDoc(doc(db, base + 'prodotti/margherita'), { nome: 'Margherita', prezzo: 6, scorta: 10, attivo: true, cat: 'pizza' });
    await setDoc(doc(db, base + 'prodotti/bufala'), { nome: 'Bufala', prezzo: 8, scorta: '5', attivo: true, cat: 'pizza' });
    await setDoc(doc(db, base + 'impostazioni/negozio'), { nome: 'Test', supplemento_consegna: 2 });
    await setDoc(doc(db, base + 'impostazioni/stampanti'), { ip: '192.168.1.50' });
    await setDoc(doc(db, base + 'dipendenti/d1'), { nome: 'Giulia', pin: '2222' });
    await setDoc(doc(db, base + 'ordini/o1'), { nome: 'Mario', telefono: '3331112222', data_ritiro: '2026-10-26', stato: 'In attesa', totale: 10, cliente: { telefono: '3331112222' } });
    await setDoc(doc(db, base + 'ordini/o2'), { nome: 'Anna', telefono: '3339998888', data_ritiro: '2026-10-26', stato: 'In attesa', totale: 12, cliente: { telefono: '3339998888' } });
    await setDoc(doc(db, base + 'occupazione_forno/2026-10-27'), { slot: { '20:00': 4 }, aggiornato: new Date() });
    await setDoc(doc(db, base + 'clienti/3339998888'), { nome: 'Anna', telefono: '3339998888', numOrdini: 3, totaleSpeso: 40, tag: 'VIP' });
  }
});

const staff = env.authenticatedContext('staff1', { firebase: { sign_in_provider: 'password' }, email: 'staff@locale.it' }).firestore();
const anon = env.unauthenticatedContext().firestore();
const mario = env.authenticatedContext('uidMario', { phone_number: '+393331112222', firebase: { sign_in_provider: 'phone' } }).firestore();

const ordine = (extra = {}) => ({
  cliente: { nome: 'Luca', cognome: 'Verdi', telefono: '3334445555', indirizzo: '', citofono: '', zona: '' },
  nome: 'Luca', cognome: 'Verdi', telefono: '3334445555',
  prodotti: [{ nome: 'Margherita', prezzo: 6, qta: 2, cat: 'pizza', dettagli: 'Normale' }],
  totale: 12, orario: '20:30', data_ritiro: '2026-10-26', note_ordine: '', codice_sconto: '', sconto_applicato: null,
  tipo: 'ASPORTO', indirizzo: '', citofono: '', zona: '', supplemento_consegna: 0, stato: 'In attesa',
  data_invio: serverTimestamp(), user_agent: 'Mozilla/5.0', ...extra
});

let ok = 0, ko = 0;
async function t(nome, atteso, fn) {
  try { await (atteso ? assertSucceeds(fn()) : assertFails(fn())); ok++; console.log('  ✔', nome); }
  catch (e) { ko++; console.log('  ✘', nome, '->', e.message.split('\n')[0]); }
}

for (const base of ['', 'ristoranti/pizzeria-test/']) {
  console.log(`\n== ${base || '(locale principale)'}`);
  const c = (db, p) => collection(db, base + p);
  const d = (db, p) => doc(db, base + p);

  // Personale
  await t('staff legge dipendenti', true, () => getDocs(c(staff, 'dipendenti')));
  await t('staff elenca tutti gli ordini', true, () => getDocs(c(staff, 'ordini')));
  await t('staff modifica ordine', true, () => updateDoc(d(staff, 'ordini/o2'), { stato: 'Pronto' }));
  await t('staff legge impostazioni stampanti', true, () => getDoc(d(staff, 'impostazioni/stampanti')));

  // Cliente anonimo: letture
  await t('anonimo legge menu prodotti', true, () => getDocs(c(anon, 'prodotti')));
  await t('anonimo legge impostazioni negozio', true, () => getDoc(d(anon, 'impostazioni/negozio')));
  await t('anonimo NON legge impostazioni stampanti', false, () => getDoc(d(anon, 'impostazioni/stampanti')));
  await t('anonimo NON legge dipendenti/PIN', false, () => getDocs(c(anon, 'dipendenti')));
  await t('anonimo NON elenca ordini del giorno', false, () => getDocs(query(c(anon, 'ordini'), where('data_ritiro', '==', '2026-10-26'))));
  await t('anonimo NON elenca ordini di un telefono', false, () => getDocs(query(c(anon, 'ordini'), where('telefono', '==', '3339998888'))));
  await t('anonimo segue ordine con ID', true, () => getDoc(d(anon, 'ordini/o1')));
  await t('anonimo NON legge rubrica cliente', false, () => getDoc(d(anon, 'clienti/3339998888')));
  await t('anonimo legge occupazione forno', true, () => getDoc(d(anon, 'occupazione_forno/2026-10-26')));

  // Cliente anonimo: ordine
  await t('anonimo invia ordine asporto valido', true, () => addDoc(c(anon, 'ordini'), ordine()));
  await t('anonimo invia ordine domicilio valido', true, () => addDoc(c(anon, 'ordini'), ordine({ tipo: 'DOMICILIO', indirizzo: "Via dell'Orto 3", citofono: 'Verdi', supplemento_consegna: 2, totale: 14 })));
  await t('ordine domicilio senza indirizzo rifiutato', false, () => addDoc(c(anon, 'ordini'), ordine({ tipo: 'DOMICILIO' })));
  await t('ordine già "Consegnato" rifiutato', false, () => addDoc(c(anon, 'ordini'), ordine({ stato: 'Consegnato' })));
  await t('ordine da 1000 euro rifiutato', false, () => addDoc(c(anon, 'ordini'), ordine({ totale: 1000 })));
  await t('ordine con campo extra rifiutato', false, () => addDoc(c(anon, 'ordini'), ordine({ pagato: true })));
  await t('ordine con telefono non valido rifiutato', false, () => addDoc(c(anon, 'ordini'), ordine({ telefono: '<img>' })));
  await t('anonimo NON modifica un ordine', false, () => updateDoc(d(anon, 'ordini/o1'), { totale: 0 }));
  await t('anonimo NON cancella un ordine', false, () => deleteDoc(d(anon, 'ordini/o1')));

  // Batch scorte + CRM come fa l'App Clienti
  await t('batch ordine: scala scorte + nuovo cliente CRM', true, () => {
    const b = writeBatch(anon);
    b.update(d(anon, 'prodotti/margherita'), { scorta: 8, attivo: true });
    b.update(d(anon, 'prodotti/bufala'), { scorta: 3, attivo: true });
    b.set(d(anon, 'clienti/3334445555'), { nome: 'Luca Verdi', cognome: 'Verdi', telefono: '3334445555', totaleSpeso: increment(12), numOrdini: increment(1), ultimaData: '2026-10-26' }, { merge: true });
    return b.commit();
  });
  await t('batch ordine: cliente CRM esistente +1 ordine', true, () => {
    const b = writeBatch(anon);
    b.set(d(anon, 'clienti/3339998888'), { nome: 'Anna', cognome: '', telefono: '3339998888', totaleSpeso: increment(20), numOrdini: increment(1), ultimaData: '2026-10-26', indirizzo: 'Via Roma 1', citofono: 'A', zona: 'Centro' }, { merge: true });
    return b.commit();
  });
  await t('CRM: +5 ordini in un colpo rifiutato', false, () => setDoc(d(anon, 'clienti/3339998888'), { numOrdini: increment(5), totaleSpeso: increment(1), telefono: '3339998888' }, { merge: true }));
  await t('CRM: modifica tag VIP rifiutata', false, () => setDoc(d(anon, 'clienti/3339998888'), { tag: 'NO' }, { merge: true }));
  await t('anonimo NON cambia il prezzo di un prodotto', false, () => updateDoc(d(anon, 'prodotti/margherita'), { prezzo: 0.1 }));
  await t('anonimo NON aumenta le scorte', false, () => updateDoc(d(anon, 'prodotti/margherita'), { scorta: 999, attivo: true }));
  await t('occupazione forno: incremento slot', true, () => setDoc(d(anon, 'occupazione_forno/2026-10-26'), { slot: { '20:30': increment(2) } }, { merge: true }));
  await t('occupazione forno: incremento dopo aggiornamento cassa', true, () => setDoc(d(anon, 'occupazione_forno/2026-10-27'), { slot: { '20:00': increment(2) } }, { merge: true }));
  await t('occupazione forno: cliente NON tocca aggiornato', false, () => setDoc(d(anon, 'occupazione_forno/2026-10-27'), { aggiornato: 'x' }, { merge: true }));
  await t('occupazione forno: id non-data rifiutato', false, () => setDoc(d(anon, 'occupazione_forno/hack'), { slot: {} }));

  // Cliente verificato via SMS (Mario)
  await t('Mario elenca i SUOI ordini (telefono)', true, () => getDocs(query(c(mario, 'ordini'), where('telefono', '==', '3331112222'))));
  await t('Mario elenca i SUOI ordini (cliente.telefono)', true, () => getDocs(query(c(mario, 'ordini'), where('cliente.telefono', '==', '3331112222'))));
  await t('Mario fidelity: suoi ordini consegnati', true, () => getDocs(query(c(mario, 'ordini'), where('telefono', '==', '3331112222'), where('stato', '==', 'Consegnato'))));
  await t('Mario NON elenca ordini di Anna', false, () => getDocs(query(c(mario, 'ordini'), where('telefono', '==', '3339998888'))));
  await t('Mario legge la sua scheda clienti', true, () => getDoc(d(mario, 'clienti/3331112222')));
  await t('Mario NON legge la scheda di Anna', false, () => getDoc(d(mario, 'clienti/3339998888')));
  await t('Mario salva il suo profilo registrato', true, () => setDoc(d(mario, 'clienti_registrati/uidMario'), { nome: 'Mario', cognome: 'Rossi', telefono: '3331112222', data_reg: serverTimestamp() }));
  await t('Mario aggiorna nome nella rubrica', true, () => setDoc(d(mario, 'clienti/3331112222'), { nome: 'Mario Rossi', cognome: 'Rossi', telefono: '3331112222', ultimaData: '2026-10-26' }, { merge: true }));
  await t('Mario NON legge dipendenti', false, () => getDocs(c(mario, 'dipendenti')));
}

// Super Admin e locali
await t('anonimo NON legge saas_clienti', false, () => getDocs(collection(anon, 'saas_clienti')));
await t('staff gestisce saas_clienti', true, () => setDoc(doc(staff, 'saas_clienti/x'), { nome: 'x' }));

console.log(`\nRISULTATO: ${ok} ok, ${ko} falliti`);
await env.cleanup();
process.exit(ko ? 1 : 0);
