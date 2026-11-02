// ============================================================================
// RUOLI-DIPENDENTI.JS - Chi entra col proprio PIN in Palmare Sala, Agenda e App Rider
// I dipendenti si creano in Cassa > Gestionale > Dipendenti (raccolta "dipendenti": nome, pin, ruolo).
//   cameriere    (anche i dipendenti creati prima dei ruoli): Palmare Sala e Agenda
//   rider        solo App Rider
//   responsabile tutte e tre (ed entra in Sala da più dispositivi insieme: accesso d'emergenza)
// ============================================================================

export const NOMI_APP = { sala: 'Palmare Sala', agenda: 'Agenda', rider: 'App Rider' };
const CON_ARTICOLO = { sala: 'il Palmare Sala', agenda: "l'Agenda", rider: "l'App Rider" };
export const NOMI_RUOLI = { cameriere: 'Cameriere', rider: 'Rider', responsabile: 'Responsabile' };

const ACCESSI = {
    sala: ['cameriere', 'responsabile'],
    agenda: ['cameriere', 'responsabile'],
    rider: ['rider', 'responsabile'],
};

export const ruoloDipendente = (dip) => (['rider', 'responsabile'].includes(dip?.ruolo) ? dip.ruolo : 'cameriere');

export const puoEntrare = (dip, app) => (ACCESSI[app] || []).includes(ruoloDipendente(dip));

// Cerca il PIN tra i dipendenti per un'app:
//   { dipendente }  PIN giusto e ruolo abilitato (se due dipendenti hanno lo stesso PIN vince quello abilitato)
//   { negato }      PIN giusto ma ruolo non abilitato (negato = il ruolo, per il messaggio)
//   null            PIN non trovato
export function cercaPin(dipendenti, pin, app) {
    const p = String(pin ?? '').trim();
    if (!p) return null;
    const conPin = (dipendenti || []).filter(d => d && String(d.pin ?? '').trim() === p);
    if (!conPin.length) return null;
    const abilitato = conPin.find(d => puoEntrare(d, app));
    return abilitato ? { dipendente: abilitato } : { negato: ruoloDipendente(conPin[0]) };
}

// Messaggio per un PIN di un ruolo non abilitato (testo semplice)
export function testoPinNonAbilitato(ruolo, app) {
    const dove = Object.keys(ACCESSI).filter(a => ACCESSI[a].includes(ruolo)).map(a => CON_ARTICOLO[a]);
    const chi = ACCESSI[app].map(r => NOMI_RUOLI[r]).join(' o ');
    return `Questo PIN è da ${NOMI_RUOLI[ruolo]}: vale ${dove.length === 1 ? 'solo ' : ''}per ${dove.join(' e ')}. Per ${CON_ARTICOLO[app]} serve un PIN da ${chi} (Cassa → Gestionale → Dipendenti).`;
}
