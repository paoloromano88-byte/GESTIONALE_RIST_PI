// Licenza del locale (impostazioni/licenza, la gestisce il Super Admin): se l'abbonamento è sospeso
// o il modulo di questa pagina è spento, la pagina si copre con un avviso e non si può usare.
// Un modulo spento ha moduli.<nome> === false; se nella licenza non c'è, vale acceso
// (i locali creati prima di un modulo nuovo restano con tutto acceso).
// Uso: onSnapshot(doc(db, "impostazioni", "licenza"), (snap) => mostraBloccoLicenza(snap.exists() ? snap.data() : null, { modulo: 'rider', nomeModulo: 'APP RIDER' }));

export function motivoBlocco(lic, modulo) {
    if (!lic) return null;
    if (lic.attiva === false) return 'sospesa';
    if (modulo && lic.moduli && lic.moduli[modulo] === false) return 'modulo';
    return null;
}

export function mostraBloccoLicenza(lic, { modulo = '', nomeModulo = '' } = {}) {
    const motivo = motivoBlocco(lic, modulo);
    let el = document.getElementById('licenza-blocco-overlay');
    if (!motivo) {
        if (el) el.style.display = 'none';
        return false;
    }
    if (!el) {
        el = document.createElement('div');
        el.id = 'licenza-blocco-overlay';
        el.style.cssText = 'position:fixed; inset:0; background:#121212; z-index:2147483000; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:12px; color:#fff; text-align:center; padding:30px; font-family:system-ui, sans-serif;';
        el.innerHTML = '<div style="font-size:3.5em;">🔒</div><h2 id="licenza-blocco-titolo" style="margin:0; color:#f0b429;"></h2><p id="licenza-blocco-testo" style="margin:0; color:#bbb; max-width:440px; line-height:1.5;"></p><p id="licenza-blocco-contatto" style="margin:0; color:#8ab4f8; font-weight:bold;"></p>';
        document.body.appendChild(el);
    }
    // Solo testo: i messaggi arrivano dal database
    el.querySelector('#licenza-blocco-titolo').textContent = motivo === 'sospesa' ? 'LICENZA SOSPESA O SCADUTA' : `MODULO ${nomeModulo} NON ABILITATO`;
    el.querySelector('#licenza-blocco-testo').textContent = motivo === 'sospesa'
        ? (lic.messaggio_blocco || "L'abbonamento al gestionale è scaduto o sospeso. Contatta l'assistenza per il rinnovo.")
        : `Il modulo ${nomeModulo} non è incluso nel piano di questo locale o è stato disattivato dall'amministratore.`;
    el.querySelector('#licenza-blocco-contatto').textContent = `📞 Assistenza: ${lic.contatto_assistenza || 'contatta il fornitore'}`;
    el.style.display = 'flex';
    return true;
}
