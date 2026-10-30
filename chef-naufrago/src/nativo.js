// Funzioni del telefono tramite Capacitor: vibrazione, memoria permanente, tasto Indietro di Android.
// Nel browser (npm run dev) le stesse chiamate usano le versioni web dei plugin, o non fanno nulla.

import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { Preferences } from '@capacitor/preferences';
import { App } from '@capacitor/app';

const nativo = Capacitor.isNativePlatform();
let vibrazioneAttiva = true;

export function impostaVibrazione(si) {
  vibrazioneAttiva = si;
}

function senzaErrori(promessa) {
  promessa?.catch?.(() => {});
}

export const vibra = {
  leggera() {
    if (vibrazioneAttiva && nativo) senzaErrori(Haptics.impact({ style: ImpactStyle.Light }));
  },
  errore() {
    if (vibrazioneAttiva && nativo) senzaErrori(Haptics.notification({ type: NotificationType.Error }));
  },
  successo() {
    if (vibrazioneAttiva && nativo) senzaErrori(Haptics.notification({ type: NotificationType.Success }));
  },
};

export async function leggi(chiave, predefinito) {
  try {
    const { value } = await Preferences.get({ key: chiave });
    return value === null ? predefinito : JSON.parse(value);
  } catch {
    return predefinito;
  }
}

export function salva(chiave, valore) {
  senzaErrori(Preferences.set({ key: chiave, value: JSON.stringify(valore) }));
}

// Indietro su Android: chi lo gestisce restituisce true; altrimenti l'app va in secondo piano
export function suIndietro(gestore) {
  if (!nativo) return;
  senzaErrori(
    App.addListener('backButton', () => {
      if (!gestore()) senzaErrori(App.minimizeApp());
    }),
  );
}

// L'app va in secondo piano (chiamata in arrivo, schermo spento, cambio app)
export function suSecondoPiano(gestore) {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) gestore();
  });
  if (nativo) senzaErrori(App.addListener('pause', gestore));
}
