// Test end-to-end del trigger con emulatori Functions + Firestore:
//   npx firebase emulators:exec --only functions,firestore --project demo-gestionale "node functions/test/trigger.test.mjs"
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
initializeApp({ projectId: 'demo-gestionale' });
const db = getFirestore();
const attendi = (ms) => new Promise(r => setTimeout(r, ms));
for (const base of [db, db.doc('ristoranti/pizzeria-trig')]) {
  await base.collection('prodotti').doc('marg').set({ nome: 'Margherita', prezzo: 6, scorta: 10, cat: 'pizza' });
  const ref = await base.collection('ordini').add({ nome: 'Anna', cognome: 'B', telefono: '3331112222', prodotti: [{ nome: 'Margherita', prezzo: 6, qta: 2, cat: 'pizza', dettagli: 'Normale' }], totale: 12, orario: '20:00', data_ritiro: '2026-10-28', tipo: 'ASPORTO', supplemento_consegna: 0, stato: 'In attesa', user_agent: 'test' });
  let ord; for (let i = 0; i < 40; i++) { await attendi(500); ord = (await ref.get()).data(); if (ord.elaborato_server) break; }
  const scorta = (await base.collection('prodotti').doc('marg').get()).data().scorta;
  console.log(`TRIGGER ${base.path || '(principale)'}: elaborato=${!!ord.elaborato_server} scorta=${scorta}`);
}
process.exit(0);
