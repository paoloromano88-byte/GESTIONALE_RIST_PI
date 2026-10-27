// Pagina di controllo del programma per Windows (programma.mjs), aperta nel browser del PC su
// http://127.0.0.1:<porta>/. Ogni richiesta porta la "chiave" scritta qui dentro: un altro sito
// aperto nel browser non può leggerla, quindi non può comandare l'agente.

export const ICONA_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#1565c0"/><rect x="18" y="10" width="28" height="14" rx="2" fill="#fff"/><rect x="10" y="22" width="44" height="22" rx="5" fill="#fff"/><rect x="18" y="36" width="28" height="18" rx="2" fill="#fff" stroke="#1565c0" stroke-width="3"/><path d="M23 43h18M23 49h12" stroke="#1565c0" stroke-width="3" stroke-linecap="round"/><circle cx="46" cy="29" r="3" fill="#2e7d32"/></svg>`;

export function paginaHtml({ chiave, versione }) {
  return `<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Agente di stampa</title>
<link rel="icon" href="/icona.svg">
<style>
  :root { --blu: #1565c0; --verde: #2e7d32; --rosso: #c62828; --giallo: #f9a825; --sfondo: #f4f6f8; --testo: #1f2328; --tenue: #5f6b76; --bordo: #dde3e9; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: "Segoe UI", system-ui, Roboto, Arial, sans-serif; background: var(--sfondo); color: var(--testo); line-height: 1.45; }
  main { max-width: 720px; margin: 0 auto; padding: 22px 16px 48px; }
  header { display: flex; align-items: center; gap: 12px; }
  header img { width: 42px; height: 42px; }
  h1 { font-size: 1.45em; margin: 0; }
  h2 { font-size: 1.08em; margin: 0 0 10px; }
  .tenue { color: var(--tenue); font-size: .9em; }
  .scheda { background: #fff; border: 1px solid var(--bordo); border-radius: 12px; padding: 16px; margin-top: 14px; }
  .stato { display: flex; gap: 12px; align-items: flex-start; }
  .pallino { width: 16px; height: 16px; border-radius: 50%; flex: none; margin-top: 5px; background: #9e9e9e; }
  .pallino.ok { background: var(--verde); box-shadow: 0 0 0 4px #c8e6c9; }
  .pallino.attesa { background: var(--giallo); box-shadow: 0 0 0 4px #fff3c4; }
  .pallino.errore { background: var(--rosso); box-shadow: 0 0 0 4px #ffcdd2; }
  .titolo-stato { font-size: 1.15em; font-weight: 700; }
  .errore { color: var(--rosso); }
  .avviso { background: #fff8e1; border: 1px solid #ffe082; border-radius: 8px; padding: 10px 12px; margin-top: 12px; }
  label { display: block; font-weight: 600; margin: 10px 0 4px; }
  input { width: 100%; padding: 10px; font-size: 1em; border: 1px solid #b0bec5; border-radius: 8px; }
  button { font: inherit; font-weight: 600; border: 0; border-radius: 8px; padding: 9px 14px; cursor: pointer; background: #e3eaf2; color: var(--testo); }
  button.primario { background: var(--blu); color: #fff; padding: 11px 18px; margin-top: 14px; }
  button:disabled { opacity: .55; cursor: default; }
  .riga { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 9px 0; border-top: 1px solid #eef1f4; flex-wrap: wrap; }
  .riga:first-child { border-top: 0; }
  .riga b { min-width: 92px; display: inline-block; }
  .esito { font-size: .9em; width: 100%; }
  .esito:empty { display: none; }
  .ok-testo { color: var(--verde); }
  .in-linea { display: flex; gap: 8px; margin-top: 10px; }
  .in-linea input { flex: 1; }
  details summary { cursor: pointer; font-weight: 600; }
  pre { white-space: pre-wrap; word-break: break-word; font-size: .82em; background: #f6f8fa; border-radius: 8px; padding: 10px; max-height: 320px; overflow: auto; }
  .nascosto { display: none; }
  footer { margin-top: 18px; }
</style>
</head>
<body>
<main>
  <header>
    <img src="/icona.svg" alt="">
    <div><h1>Agente di stampa</h1><div class="tenue">Versione ${versione} · manda alle stampanti del locale le comande della cassa</div></div>
  </header>

  <section class="scheda">
    <div class="stato"><span id="pallino" class="pallino"></span><div><div id="titolo-stato" class="titolo-stato">Un momento...</div><div id="dettaglio-stato" class="tenue"></div></div></div>
    <div id="avviso-metodo" class="avviso nascosto">⚠️ In cassa le stampe arrivano ancora con <b>QZ Tray</b>. Apri la cassa: <b>Gestionale → Stampanti</b>, in «Come arrivano le stampe» scegli <b>Agente di stampa</b> e premi Salva.</div>
  </section>

  <section id="sezione-collega" class="scheda nascosto">
    <h2>Collega questo PC al locale</h2>
    <p class="tenue">Usa l'email e la password del locale, le stesse con cui apri la cassa. La password non resta salvata sul PC.</p>
    <form id="modulo-collega" autocomplete="on">
      <label for="email">Email del locale</label>
      <input id="email" type="email" autocomplete="username" required>
      <label for="password">Password</label>
      <input id="password" type="password" autocomplete="current-password" required>
      <label for="nome">Nome di questo PC (lo vedi in cassa)</label>
      <input id="nome" maxlength="40" placeholder="Es. PC cassa">
      <button id="btn-collega" class="primario" type="submit">Collega</button>
      <div id="esito-collega" class="esito"></div>
    </form>
  </section>

  <section id="sezione-stampanti" class="scheda nascosto">
    <h2>Stampanti impostate in cassa</h2>
    <div id="elenco-stampanti"></div>
    <p class="tenue">Gli indirizzi si cambiano in cassa: Gestionale → Stampanti.</p>
  </section>

  <section id="sezione-cerca" class="scheda nascosto">
    <h2>Trova le stampanti in rete</h2>
    <p class="tenue">Cerca le stampanti accese collegate allo stesso router di questo PC. Con «Prova» esce un foglietto: così capisci qual è ognuna e scrivi il suo indirizzo in cassa.</p>
    <button id="btn-cerca" type="button">🔎 Cerca stampanti</button>
    <div id="esito-cerca" class="esito"></div>
    <div id="elenco-trovate"></div>
    <div class="in-linea"><input id="indirizzo-prova" placeholder="Prova un indirizzo, es. 192.168.1.50"><button id="btn-prova-indirizzo" type="button">Prova</button></div>
    <div id="esito-prova-indirizzo" class="esito"></div>
  </section>

  <section id="sezione-altro" class="scheda nascosto">
    <details>
      <summary>Registro (per l'assistenza)</summary>
      <pre id="registro"></pre>
    </details>
    <div style="margin-top:12px;"><button id="btn-scollega" type="button">Scollega questo PC</button></div>
  </section>

  <footer class="tenue">
    Puoi chiudere questa pagina: l'agente continua a lavorare e parte da solo quando accendi il PC.
    Durante il servizio il PC deve restare acceso, senza andare in sospensione.
    Per riaprire questa pagina: icona <b>Agente di stampa</b> sul desktop o nel menu Start.
  </footer>
</main>
<script>
const CHIAVE = ${JSON.stringify(chiave)};
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const mostra = (id, si) => $(id).classList.toggle('nascosto', !si);
let ultimo = null, disegnoStampanti = '';

async function chiama(percorso, dati) {
  let r;
  try {
    r = await fetch(percorso, { method: dati === undefined ? 'GET' : 'POST', headers: { 'X-Chiave': CHIAVE, 'Content-Type': 'application/json' }, body: dati === undefined ? undefined : JSON.stringify(dati) });
  } catch {
    throw Object.assign(new Error("L'Agente di stampa è chiuso: riaprilo dall'icona sul desktop o dal menu Start."), { spento: true });
  }
  // Agente riavviato (per esempio dopo un aggiornamento): la chiave è cambiata, si ricarica la pagina
  if (r.status === 403) { setTimeout(() => location.reload(), 1500); throw new Error("L'agente si è riavviato: ricarico la pagina..."); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.errore || 'Errore ' + r.status);
  return j;
}

function esito(id, testo, ok) { const el = $(id); el.className = 'esito ' + (ok ? 'ok-testo' : 'errore'); el.textContent = testo; }

async function prova(indirizzo, nome, idEsito) {
  esito(idEsito, 'Invio la stampa di prova...', true);
  try { await chiama('/prova', { indirizzo, nome }); esito(idEsito, '✅ Inviata: controlla che esca il foglietto «PROVA DI STAMPA».', true); }
  catch (e) { esito(idEsito, '❌ ' + e.message, false); }
}

function disegna(s) {
  const fasi = {
    attivo: ['ok', 'In funzione', 'Collegato al locale «' + (s.locale || '') + '» come «' + (s.nome || '') + '» · stampe da quando è acceso: ' + (s.stampate || 0)],
    avvio: ['attesa', 'Mi collego...', s.messaggio || ''],
    attesa_rete: ['attesa', 'In attesa di internet', s.messaggio || ''],
    aggiornamento: ['attesa', 'Aggiornamento in corso', s.messaggio || ''],
    da_collegare: ['errore', 'Da collegare al locale', s.messaggio || 'Inserisci qui sotto email e password del locale.'],
  };
  const [classe, titolo, dettaglio] = fasi[s.fase] || ['errore', s.fase, s.messaggio || ''];
  $('pallino').className = 'pallino ' + classe;
  $('titolo-stato').textContent = titolo;
  $('dettaglio-stato').innerHTML = esc(dettaglio) + (s.fase === 'attivo' && s.ultimoErrore ? '<br><span class="errore">Ultimo problema: ' + esc(s.ultimoErrore) + '</span>' : '');

  const collegato = s.fase !== 'da_collegare';
  mostra('sezione-collega', !collegato);
  mostra('sezione-stampanti', s.fase === 'attivo' && !!s.stampanti);
  mostra('sezione-cerca', collegato);
  mostra('sezione-altro', collegato);
  mostra('avviso-metodo', s.fase === 'attivo' && s.stampanti && s.stampanti.metodo !== 'agente');
  if (!collegato && !$('email').value && s.email) $('email').value = s.email;
  if (!$('nome').value) $('nome').value = s.nome || s.nomePc || '';

  // Le righe delle stampanti si ridisegnano solo se cambiano (non si perde l'esito di una prova)
  const elenco = (s.stampanti && s.stampanti.elenco) || [];
  const firma = JSON.stringify(elenco);
  if (firma !== disegnoStampanti) {
    disegnoStampanti = firma;
    $('elenco-stampanti').innerHTML = elenco.map((p, i) => '<div class="riga"><span><b>' + esc(p.nome) + '</b> ' + (p.ip ? esc(p.ip) : '<span class="tenue">non impostata</span>') + '</span>'
      + (p.ip ? '<button type="button" data-prova="' + i + '">Prova</button>' : '') + '<div id="esito-stampante-' + i + '" class="esito"></div></div>').join('');
    $('elenco-stampanti').querySelectorAll('[data-prova]').forEach((b) => { const p = elenco[b.dataset.prova]; b.onclick = () => prova(p.ip, p.nome, 'esito-stampante-' + b.dataset.prova); });
  }
  const reg = (s.registro || []).join('\\n');
  if ($('registro').textContent !== reg) $('registro').textContent = reg;
}

async function aggiorna() {
  try { ultimo = await chiama('/stato'); disegna(ultimo); }
  catch (e) { $('pallino').className = 'pallino errore'; $('titolo-stato').textContent = e.spento ? 'Agente chiuso' : 'Un momento...'; $('dettaglio-stato').textContent = e.message; }
}

$('modulo-collega').onsubmit = async (ev) => {
  ev.preventDefault();
  $('btn-collega').disabled = true;
  esito('esito-collega', 'Collegamento in corso...', true);
  try {
    const r = await chiama('/collega', { email: $('email').value, password: $('password').value, nome: $('nome').value });
    $('password').value = '';
    esito('esito-collega', '✅ Collegato al locale «' + r.locale + '».', true);
    await aggiorna();
  } catch (e) { esito('esito-collega', '❌ ' + e.message, false); }
  finally { $('btn-collega').disabled = false; }
};

$('btn-cerca').onclick = async () => {
  $('btn-cerca').disabled = true;
  $('elenco-trovate').innerHTML = '';
  esito('esito-cerca', 'Cerco le stampanti nella rete di questo PC (qualche secondo)...', true);
  try {
    const r = await chiama('/cerca', {});
    const note = Object.fromEntries(((ultimo && ultimo.stampanti && ultimo.stampanti.elenco) || []).filter((p) => p.ip).map((p) => [p.ip.split(':')[0], p.nome]));
    if (!r.trovate.length) esito('esito-cerca', 'Nessuna stampante trovata. Controlla che siano accese e collegate con il cavo di rete allo stesso router di questo PC.', false);
    else esito('esito-cerca', 'Trovate: ' + r.trovate.length + '.', true);
    $('elenco-trovate').innerHTML = r.trovate.map((ip, i) => '<div class="riga"><span><b>' + esc(ip) + '</b> ' + (note[ip] ? '<span class="tenue">in cassa: ' + esc(note[ip]) + '</span>' : '<span class="tenue">non usata in cassa</span>') + '</span>'
      + '<button type="button" data-ip="' + esc(ip) + '">Prova</button><div id="esito-trovata-' + i + '" class="esito"></div></div>').join('');
    $('elenco-trovate').querySelectorAll('[data-ip]').forEach((b, i) => { b.onclick = () => prova(b.dataset.ip, note[b.dataset.ip] || '', 'esito-trovata-' + i); });
  } catch (e) { esito('esito-cerca', '❌ ' + e.message, false); }
  finally { $('btn-cerca').disabled = false; }
};

$('btn-prova-indirizzo').onclick = () => { const ip = $('indirizzo-prova').value.trim(); if (ip) prova(ip, '', 'esito-prova-indirizzo'); };

$('btn-scollega').onclick = async () => {
  if (!confirm('Scollegare questo PC dal locale? Smetterà di stampare finché non lo ricolleghi.')) return;
  try { await chiama('/scollega', {}); await aggiorna(); } catch (e) { alert(e.message); }
};

aggiorna();
setInterval(aggiorna, 2000);
</script>
</body>
</html>`;
}
