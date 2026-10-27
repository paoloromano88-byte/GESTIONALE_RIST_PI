// Logo del locale (impostazioni/negozio.logo_url, caricato in Cassa > Gestionale > Impostazioni):
// diventa l'icona della pagina nella scheda del browser e sulla schermata Home dell'iPhone.
// Senza logo (o dopo «Rimuovi logo») resta logo.png, l'icona di base uguale per tutti i locali.
export const LOGO_BASE = 'logo.png';
let logoApplicato = false;

export const logoValido = (logo) => typeof logo === 'string' && /^(data:image\/|https:\/\/)/.test(logo);

export function applicaLogoLocale(logo) {
    const valido = logoValido(logo);
    // Senza logo le icone scritte nella pagina vanno già bene: si toccano solo se c'era un logo da togliere
    if (!valido && !logoApplicato) return;
    logoApplicato = valido;
    for (const rel of ['icon', 'apple-touch-icon']) {
        document.querySelectorAll(`link[rel="${rel}"]`).forEach(l => l.remove());
        const link = document.createElement('link');
        link.rel = rel;
        link.href = valido ? logo : LOGO_BASE;
        document.head.appendChild(link);
    }
}
