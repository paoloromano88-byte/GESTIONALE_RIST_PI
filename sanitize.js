// ============================================================================
// SANITIZE.JS - Protezione dall'iniezione di HTML nei dati inseriti dai clienti
// Da includere (script classico, non module) prima degli script della pagina.
// ============================================================================

// Testo semplice: nome, cognome, telefono, indirizzo, citofono, zona, note...
window.escapeHtml = (value) => {
    if (value === null || value === undefined) return '';
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
};

// Testo con formattazione voluta (es. dettagli prodotto: "<b>1/2</b> Margherita<br>...")
// Mantiene solo i tag di formattazione innocui e l'attributo class; tutto il resto diventa testo.
(() => {
    const TAG_PERMESSI = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'BR', 'SMALL', 'SPAN']);

    const pulisciNodo = (nodo) => {
        Array.from(nodo.childNodes).forEach(figlio => {
            if (figlio.nodeType === Node.TEXT_NODE) return;
            if (figlio.nodeType === Node.ELEMENT_NODE && TAG_PERMESSI.has(figlio.tagName)) {
                Array.from(figlio.attributes).forEach(attr => {
                    if (attr.name !== 'class') figlio.removeAttribute(attr.name);
                });
                pulisciNodo(figlio);
                return;
            }
            if (figlio.nodeType === Node.ELEMENT_NODE) {
                nodo.replaceChild(document.createTextNode(figlio.textContent || ''), figlio);
                return;
            }
            nodo.removeChild(figlio);
        });
    };

    window.sanitizeHtml = (value) => {
        if (value === null || value === undefined) return '';
        // DOMParser non esegue script né carica immagini durante il parsing
        const parsed = new DOMParser().parseFromString(`<body>${String(value)}</body>`, 'text/html');
        pulisciNodo(parsed.body);
        return parsed.body.innerHTML;
    };
})();

// ID documento da inserire negli attributi onclick="fn('...')": solo caratteri sicuri
window.safeId = (value) => String(value ?? '').replace(/[^A-Za-z0-9_-]/g, '');
