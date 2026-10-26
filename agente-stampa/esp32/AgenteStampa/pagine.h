// Pagine del portale di configurazione: le apre il telefono collegato alla rete Wi-Fi
// "AgenteStampa-XXXX" creata dall'ESP32 quando non è ancora configurato.
#pragma once

static const char PAGINA_INIZIO[] PROGMEM = R"HTML(<!doctype html>
<html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Agente di stampa</title>
<style>
body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#f4f4f4;margin:0;padding:16px;color:#222}
.box{max-width:420px;margin:0 auto;background:#fff;border-radius:14px;padding:18px;box-shadow:0 2px 10px rgba(0,0,0,.1)}
h1{font-size:1.3em;margin:0 0 6px}p{margin:6px 0 12px;color:#555;font-size:.95em}
label{display:block;font-weight:bold;margin:14px 0 4px}
input{width:100%;box-sizing:border-box;padding:12px;font-size:1em;border:1px solid #bbb;border-radius:8px}
button{width:100%;margin-top:20px;padding:14px;font-size:1.1em;font-weight:bold;border:0;border-radius:10px;background:#2e7d32;color:#fff}
.err{background:#ffebee;border:1px solid #ef9a9a;color:#b71c1c;border-radius:8px;padding:10px;margin:10px 0}
.nota{font-size:.85em;color:#777}
</style></head><body><div class="box">
<h1>🖨️ Agente di stampa</h1>
<p>Collega questo apparecchio al Wi-Fi del locale e all'account della cassa.</p>
)HTML";

static const char PAGINA_MODULO[] PROGMEM = R"HTML(
<form method="post" action="/salva">
<label>Rete Wi-Fi del locale</label>
<input name="ssid" list="reti" value="%SSID%" required autocomplete="off">
<datalist id="reti">%RETI%</datalist>
<div class="nota">Solo reti a 2,4 GHz (non 5 GHz). La stessa rete delle stampanti.</div>
<label>Password del Wi-Fi</label>
<input name="wpass" type="password" autocomplete="off">
<label>Email del locale</label>
<input name="email" type="email" value="%EMAIL%" required autocomplete="off">
<label>Password del locale</label>
<input name="pass" type="password" required autocomplete="off">
<div class="nota">Le stesse della cassa. La password serve solo per il primo accesso e non viene conservata.</div>
<label>Nome di questo agente</label>
<input name="nome" value="%NOME%" maxlength="40" placeholder="Es. ESP32 cucina">
<button type="submit">Salva e collega</button>
</form>
<p class="nota">Versione %VERSIONE% · %ID%</p>
</div></body></html>)HTML";

static const char PAGINA_SALVATO[] PROGMEM = R"HTML(
<h1>✅ Salvato</h1>
<p>L'agente si riavvia e si collega al Wi-Fi <b>%SSID%</b>.</p>
<p>Quando è pronto la lucina blu resta <b>accesa fissa</b> e in cassa compare <b>STAMPA OK</b>
(Gestionale → Stampanti, con «Agente di stampa» scelto).</p>
<p>Se la lucina lampeggia velocemente, c'è stato un problema: ricollegati alla rete
<b>%AP%</b> e riapri questa pagina per leggere l'errore.</p>
</div></body></html>)HTML";
