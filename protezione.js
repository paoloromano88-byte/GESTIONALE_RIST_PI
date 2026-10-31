// Protezione di base del codice delle pagine: blocca il tasto destro (fuori dai campi di testo) e le
// scorciatoie per vedere il codice o salvare la pagina (F12, Ctrl+U, Ctrl+S, Ctrl+Shift+I/J/C/K e le
// stesse con Cmd/Opzione sul Mac).
// È solo un deterrente: il browser scarica comunque il codice e chi sa farlo può leggerlo (menu del
// browser, view-source:, strumenti esterni). La sicurezza vera è nelle regole di Firestore e nel server:
// nel codice delle pagine non ci sono chiavi segrete.
(function () {
    const campoDiTesto = (el) => !!(el && el.closest && el.closest('input, textarea, select, [contenteditable="true"]'));

    document.addEventListener('contextmenu', (e) => {
        if (!campoDiTesto(e.target)) e.preventDefault();
    }, true);

    document.addEventListener('keydown', (e) => {
        const tasto = (e.key || '').toLowerCase();
        const comando = e.ctrlKey || e.metaKey;
        const bloccato =
            e.key === 'F12' ||
            (comando && !e.shiftKey && !e.altKey && (tasto === 'u' || tasto === 's')) ||   // codice sorgente, salva pagina
            (comando && (e.shiftKey || e.altKey) && ['i', 'j', 'c', 'k', 'u'].includes(tasto)); // strumenti per sviluppatori
        if (bloccato) {
            e.preventDefault();
            e.stopPropagation();
        }
    }, true);

    // Niente trascinamento di immagini e logo fuori dalla pagina
    document.addEventListener('dragstart', (e) => {
        if (e.target && e.target.tagName === 'IMG') e.preventDefault();
    }, true);
})();
