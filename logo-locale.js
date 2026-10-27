// Logo del locale (impostazioni/negozio.logo_url, caricato in Cassa > Gestionale > Impostazioni):
// diventa l'icona della pagina nella scheda del browser e sulla schermata Home dell'iPhone.
// Senza logo resta logo.png, l'icona neutra uguale per tutti i locali.
export function applicaLogoLocale(logo) {
    if (typeof logo !== 'string' || !/^(data:image\/|https:\/\/)/.test(logo)) return;
    for (const rel of ['icon', 'apple-touch-icon']) {
        document.querySelectorAll(`link[rel="${rel}"]`).forEach(l => l.remove());
        const link = document.createElement('link');
        link.rel = rel;
        link.href = logo;
        document.head.appendChild(link);
    }
}
