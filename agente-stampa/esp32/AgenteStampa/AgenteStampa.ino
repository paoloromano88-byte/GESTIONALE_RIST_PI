// =============================================================================
// AGENTE DI STAMPA per ESP32-C3 (SuperMini) - Gestionale Ristoranti
//
// Prende le stampe che la cassa mette in "coda_stampa" del locale (Firebase) e le manda
// alle stampanti termiche di rete (IP:9100, ESC/POS) della stessa rete Wi-Fi.
// Stesso protocollo dell'agente per PC (../../agente.mjs), descritto in ../../README.md.
//
// Primo avvio (o dopo il ripristino): crea la rete Wi-Fi "AgenteStampa-XXXX". Dal telefono
// ci si collega e si inseriscono Wi-Fi del locale, email e password del locale e un nome.
// La password del locale serve solo per il primo accesso: poi resta un token di rinnovo.
//
// Lucina blu (GPIO 8):
//   lampeggio veloce   = da configurare (rete "AgenteStampa-XXXX" attiva)
//   accesa fissa       = tutto a posto, in attesa di stampe
//   lampeggio lento    = problema (Wi-Fi, internet o account): vedi il registro sulla USB
//   tre lampi rapidi   = comanda stampata
// Tasto BOOT (GPIO 9) premuto per 5 secondi = cancella le impostazioni e torna al primo avvio.
//
// Compilazione: Arduino core esp32 3.0.7, scheda "ESP32C3 Dev Module", USB CDC On Boot
// abilitato, libreria ArduinoJson 7. Lo fa da solo GitHub (.github/workflows/firmware-esp32.yml).
// =============================================================================
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <WebServer.h>
#include <DNSServer.h>
#include <Preferences.h>
#include <ArduinoJson.h>
#include <map>
#include <vector>
#include <algorithm>
#include <time.h>
#include "mbedtls/base64.h"
#include "certificati.h"
#include "pagine.h"
#include "comanda.h"

#define VERSIONE "1.0.0"

void avviaPortale();
void tornaAllaConfigurazioneSenzaRiavvio(const String &motivo);

// Configurazione pubblica del progetto Firebase (la stessa delle pagine web)
static const char *API_KEY = "AIzaSyDjNba4HvtDZpcoDfnXTOWysn_i1UFwPWU";
static const char *PROGETTO = "gestionale-ristoranti-96c5b";

static const int PIN_LED = 8;    // LED blu della SuperMini: acceso con LOW
static const int PIN_BOOT = 9;   // tasto BOOT: premuto = LOW

static const unsigned long ATTESA_MS = 2000;           // ogni quanto controlla la coda
static const unsigned long BATTITO_MS = 30000;         // ogni quanto dice alla cassa "sono acceso"
static const int TIMEOUT_STAMPANTE_MS = 5000;
static const int TENTATIVI_MASSIMI = 5;
static const long SCADENZA_S = 15 * 60;                 // comande più vecchie: "scaduta"
static const int COMANDE_PER_GIRO = 3;                  // memoria limitata: poche alla volta

// ---------- Impostazioni salvate (memoria flash) ----------
Preferences prefs;
struct Impostazioni {
  String ssid, wpass, email, passTemp, uid, refresh, nome, erroreSetup;
} imp;

void caricaImpostazioni() {
  prefs.begin("agente", true);
  imp.ssid = prefs.getString("ssid", "");
  imp.wpass = prefs.getString("wpass", "");
  imp.email = prefs.getString("email", "");
  imp.passTemp = prefs.getString("passtemp", "");
  imp.uid = prefs.getString("uid", "");
  imp.refresh = prefs.getString("refresh", "");
  imp.nome = prefs.getString("nome", "");
  imp.erroreSetup = prefs.getString("errore", "");
  prefs.end();
}

void salvaImpostazioni() {
  prefs.begin("agente", false);
  prefs.putString("ssid", imp.ssid);
  prefs.putString("wpass", imp.wpass);
  prefs.putString("email", imp.email);
  prefs.putString("passtemp", imp.passTemp);
  prefs.putString("uid", imp.uid);
  prefs.putString("refresh", imp.refresh);
  prefs.putString("nome", imp.nome);
  prefs.putString("errore", imp.erroreSetup);
  prefs.end();
}

// Torna al portale di configurazione mostrando il motivo
void tornaAllaConfigurazione(const String &motivo, bool dimenticaAccesso) {
  imp.erroreSetup = motivo;
  if (dimenticaAccesso) { imp.refresh = ""; imp.uid = ""; imp.passTemp = ""; }
  salvaImpostazioni();
  Serial.printf("[agente] Torno alla configurazione: %s\n", motivo.c_str());
  delay(500);
  ESP.restart();
}

// ---------- Stato ----------
enum Modo { MODO_PORTALE, MODO_LAVORO };
Modo modo = MODO_LAVORO;
enum StatoLed { LED_SETUP, LED_OK, LED_PROBLEMA };
StatoLed statoLed = LED_PROBLEMA;
unsigned long lampiFinoA = 0;

String idAgente, idToken, locale, base, ultimoErrore;
unsigned long scadenzaTokenMs = 0, ultimoBattito = 0, ultimoControllo = 0, ultimoTentativoWiFi = 0, ultimoTentativoOra = 0;
bool primoBattito = true, accessoRevocato = false, oraSincronizzata = false;
int stampate = 0;
std::map<String, unsigned long> prossimoTentativo;  // id comanda -> quando riprovare

const String radice() { return String("projects/") + PROGETTO + "/databases/(default)/documents"; }

void registro(const String &msg) {
  Serial.printf("[%lu s] %s\n", millis() / 1000, msg.c_str());
}

void aggiornaLed() {
  unsigned long t = millis();
  bool acceso;
  if (t < lampiFinoA) acceso = ((lampiFinoA - t) / 100) % 2;
  else if (statoLed == LED_SETUP) acceso = (t / 150) % 2;
  else if (statoLed == LED_OK) acceso = true;
  else acceso = (t / 1000) % 2;
  digitalWrite(PIN_LED, acceso ? LOW : HIGH);
}

// Tasto BOOT tenuto per 5 secondi: cancella tutto
void controllaTastoRipristino() {
  static unsigned long premutoDa = 0;
  if (digitalRead(PIN_BOOT) == LOW) {
    if (!premutoDa) premutoDa = millis();
    if (millis() - premutoDa > 5000) {
      registro("Ripristino: cancello le impostazioni");
      prefs.begin("agente", false); prefs.clear(); prefs.end();
      for (int i = 0; i < 10; i++) { digitalWrite(PIN_LED, i % 2 ? LOW : HIGH); delay(80); }
      ESP.restart();
    }
  } else premutoDa = 0;
}

String macCorto() {
  uint8_t m[6];
  WiFi.macAddress(m);
  char s[13];
  snprintf(s, sizeof(s), "%02x%02x%02x%02x%02x%02x", m[0], m[1], m[2], m[3], m[4], m[5]);
  return String(s);
}

String codificaUrl(const String &s) {
  String out;
  const char *hex = "0123456789ABCDEF";
  for (size_t i = 0; i < s.length(); i++) {
    char c = s[i];
    if (isalnum((unsigned char)c) || c == '-' || c == '_' || c == '.' || c == '~') out += c;
    else { out += '%'; out += hex[(c >> 4) & 0xF]; out += hex[c & 0xF]; }
  }
  return out;
}

String escapeHtml(const String &s) {
  String out;
  for (size_t i = 0; i < s.length(); i++) {
    char c = s[i];
    if (c == '<') out += "&lt;"; else if (c == '>') out += "&gt;"; else if (c == '&') out += "&amp;";
    else if (c == '"') out += "&quot;"; else if (c == '\'') out += "&#39;"; else out += c;
  }
  return out;
}

// ---------- Wi-Fi e ora ----------
bool collegaWiFi(unsigned long attesaMs) {
  if (WiFi.status() == WL_CONNECTED) return true;
  registro("Collegamento al Wi-Fi \"" + imp.ssid + "\"...");
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.begin(imp.ssid.c_str(), imp.wpass.c_str());
  unsigned long inizio = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - inizio < attesaMs) {
    aggiornaLed();
    controllaTastoRipristino();
    delay(50);
  }
  if (WiFi.status() == WL_CONNECTED) {
    registro("Wi-Fi collegato, indirizzo " + WiFi.localIP().toString() + ", segnale " + String(WiFi.RSSI()) + " dBm");
    return true;
  }
  registro("Wi-Fi non raggiungibile");
  return false;
}

void sincronizzaOra() {
  configTime(0, 0, "time.google.com", "pool.ntp.org");
  unsigned long inizio = millis();
  while (time(nullptr) < 1700000000 && millis() - inizio < 10000) { aggiornaLed(); delay(100); }
  oraSincronizzata = time(nullptr) > 1700000000;
  registro(oraSincronizzata ? "Ora sincronizzata" : "Ora non sincronizzata (le comande non scadranno)");
}

// "2026-10-26T17:40:00.123456Z" -> secondi (UTC)
time_t leggiOra(const char *s) {
  if (!s) return 0;
  struct tm t = {};
  if (sscanf(s, "%d-%d-%dT%d:%d:%d", &t.tm_year, &t.tm_mon, &t.tm_mday, &t.tm_hour, &t.tm_min, &t.tm_sec) != 6) return 0;
  t.tm_year -= 1900; t.tm_mon -= 1;
  return mktime(&t);  // configTime(0, 0) imposta il fuso UTC
}

// ---------- HTTPS ----------
WiFiClientSecure tlsFirestore;
HTTPClient httpFirestore;

void preparaTls(WiFiClientSecure &tls) {
  tls.setCACert(CERTIFICATI_RADICE);
}

// Richiesta senza token (accesso e rinnovo): connessione a parte, chiusa subito
int richiestaAuth(const String &url, const String &tipo, const String &corpo, String &risposta) {
  httpFirestore.end();
  tlsFirestore.stop();  // libera la memoria della connessione a Firestore
  WiFiClientSecure tls;
  preparaTls(tls);
  HTTPClient http;
  http.setTimeout(15000);
  if (!http.begin(tls, url)) { risposta = "indirizzo non valido"; return -1; }
  http.addHeader("Content-Type", tipo);
  int codice = http.POST(corpo);
  risposta = codice > 0 ? http.getString() : HTTPClient::errorToString(codice);
  http.end();
  return codice;
}

// Primo accesso con email e password del locale: resta solo il token di rinnovo
bool accedi(String &errore) {
  JsonDocument d;
  d["email"] = imp.email;
  d["password"] = imp.passTemp;
  d["returnSecureToken"] = true;
  String corpo, risposta;
  serializeJson(d, corpo);
  int codice = richiestaAuth(String("https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=") + API_KEY,
                             "application/json", corpo, risposta);
  if (codice != 200) {
    if (codice > 0 && (risposta.indexOf("INVALID") >= 0 || risposta.indexOf("EMAIL_NOT_FOUND") >= 0)) errore = "Email o password del locale sbagliate.";
    else if (codice > 0 && risposta.indexOf("USER_DISABLED") >= 0) errore = "Questo account è disattivato.";
    else if (codice > 0 && risposta.indexOf("TOO_MANY_ATTEMPTS") >= 0) errore = "Troppi tentativi: riprova tra qualche minuto.";
    else errore = "Internet non raggiungibile dal Wi-Fi del locale (" + String(codice) + ").";
    registro("Accesso non riuscito: " + risposta.substring(0, 200));
    return false;
  }
  JsonDocument r;
  deserializeJson(r, risposta);
  imp.uid = r["localId"].as<String>();
  imp.refresh = r["refreshToken"].as<String>();
  idToken = r["idToken"].as<String>();
  scadenzaTokenMs = millis() + (r["expiresIn"].as<String>().toInt() - 300) * 1000UL;
  registro("Accesso riuscito come " + imp.email);
  return imp.uid.length() && imp.refresh.length();
}

bool rinnovaToken() {
  String risposta;
  int codice = richiestaAuth(String("https://securetoken.googleapis.com/v1/token?key=") + API_KEY,
                             "application/x-www-form-urlencoded",
                             "grant_type=refresh_token&refresh_token=" + codificaUrl(imp.refresh), risposta);
  if (codice != 200) {
    if (codice == 400 && (risposta.indexOf("TOKEN_EXPIRED") >= 0 || risposta.indexOf("INVALID_REFRESH_TOKEN") >= 0 ||
                          risposta.indexOf("USER_DISABLED") >= 0 || risposta.indexOf("USER_NOT_FOUND") >= 0)) accessoRevocato = true;
    ultimoErrore = "Rinnovo accesso: " + String(codice);
    registro("Rinnovo del token non riuscito: " + risposta.substring(0, 200));
    return false;
  }
  JsonDocument r;
  deserializeJson(r, risposta);
  idToken = r["id_token"].as<String>();
  String nuovo = r["refresh_token"].as<String>();
  if (nuovo.length() && nuovo != imp.refresh) { imp.refresh = nuovo; salvaImpostazioni(); }
  scadenzaTokenMs = millis() + (r["expires_in"].as<String>().toInt() - 300) * 1000UL;
  return true;
}

// Richiesta a Firestore con il token dell'account del locale. Restituisce il codice HTTP (< 0 = rete).
int firestore(const char *metodo, const String &percorso, const String &corpo, String &risposta) {
  if (!idToken.length() || (long)(millis() - scadenzaTokenMs) > 0) {
    if (!rinnovaToken()) { risposta = "accesso"; return -100; }
  }
  if (!httpFirestore.begin(tlsFirestore, "https://firestore.googleapis.com/v1/" + percorso)) { risposta = "indirizzo non valido"; return -1; }
  httpFirestore.addHeader("Authorization", "Bearer " + idToken);
  if (corpo.length()) httpFirestore.addHeader("Content-Type", "application/json");
  int codice = httpFirestore.sendRequest(metodo, corpo);
  risposta = codice > 0 ? httpFirestore.getString() : HTTPClient::errorToString(codice);
  httpFirestore.end();
  if (codice == 401) idToken = "";  // token scaduto: al prossimo giro si rinnova
  return codice;
}

// Il locale si legge dalla scheda dell'account (utenti/{uid}), come fanno le pagine web
bool leggiLocale(String &errore) {
  String risposta;
  int codice = firestore("GET", radice() + "/utenti/" + imp.uid, "", risposta);
  if (codice != 200) {
    errore = codice == 403 || codice == 404 ? "Questo account non è collegato a un locale: usa l'email e la password del locale."
                                            : "Firebase non raggiungibile (" + String(codice) + ").";
    return false;
  }
  JsonDocument d;
  deserializeJson(d, risposta);
  String ruolo = d["fields"]["ruolo"]["stringValue"] | "";
  String loc = d["fields"]["locale"]["stringValue"] | "";
  bool valido = loc.length() > 0;
  for (size_t i = 0; i < loc.length(); i++) {
    char c = loc[i];
    if (!(islower((unsigned char)c) || isdigit((unsigned char)c) || c == '-')) valido = false;
  }
  if (ruolo != "locale" || !valido) {
    errore = "Questo account non è collegato a un locale: usa l'email e la password del locale.";
    return false;
  }
  locale = loc;
  base = locale == "default" ? radice() : radice() + "/ristoranti/" + locale;
  registro("Collegato al locale \"" + locale + "\". In attesa di stampe...");
  return true;
}

// ---------- Battito: "sono acceso" (e controllo di "Scollega" dalla cassa) ----------
void battito() {
  ultimoBattito = millis();
  String nomeDoc = base + "/agenti_stampa/" + idAgente, risposta;
  if (!primoBattito) {
    int codice = firestore("GET", nomeDoc, "", risposta);
    if (codice == 200) {
      JsonDocument d;
      deserializeJson(d, risposta);
      if (d["fields"]["disattivato"]["booleanValue"] | false) {
        tornaAllaConfigurazione("Questo agente è stato scollegato dalla cassa: ricollegalo con l'account del locale.", true);
      }
    } else if (codice != 404) {
      statoLed = LED_PROBLEMA;
      return;
    }
  }
  JsonDocument w;
  JsonObject scrittura = w["writes"].add<JsonObject>();
  scrittura["update"]["name"] = nomeDoc;
  JsonObject campi = scrittura["update"]["fields"].to<JsonObject>();
  JsonArray maschera = scrittura["updateMask"]["fieldPaths"].to<JsonArray>();
  auto testo = [&](const char *k, const String &v) { campi[k]["stringValue"] = v; maschera.add(k); };
  auto intero = [&](const char *k, long v) { campi[k]["integerValue"] = String(v); maschera.add(k); };
  testo("nome", imp.nome.length() ? imp.nome : idAgente);
  testo("tipo", "esp32");
  testo("versione", VERSIONE);
  testo("ip_locale", WiFi.localIP().toString());
  intero("stampate", stampate);
  intero("segnale", WiFi.RSSI());
  testo("ultimo_errore", ultimoErrore);
  JsonObject trasforma = scrittura["updateTransforms"].add<JsonObject>();
  trasforma["fieldPath"] = "ultimo_contatto";
  trasforma["setToServerValue"] = "REQUEST_TIME";
  if (primoBattito) {
    JsonObject avvio = scrittura["updateTransforms"].add<JsonObject>();
    avvio["fieldPath"] = "avviato";
    avvio["setToServerValue"] = "REQUEST_TIME";
  }
  String corpo;
  serializeJson(w, corpo);
  int codice = firestore("POST", radice() + ":commit", corpo, risposta);
  if (codice == 200) primoBattito = false;
  else registro("Battito non riuscito (" + String(codice) + "): " + risposta.substring(0, 150));
}

// ---------- Coda di stampa ----------
// Cambia stato alla comanda solo se nessuno l'ha toccata (commit con currentDocument.updateTime).
// 1 = fatto, 0 = presa da un altro agente o già tolta, -1 = errore di rete
int aggiornaComanda(Comanda &c, const char *stato, int tentativi, const String &errore, bool conAgente) {
  JsonDocument w;
  JsonObject scrittura = w["writes"].add<JsonObject>();
  scrittura["update"]["name"] = c.nome;
  JsonObject campi = scrittura["update"]["fields"].to<JsonObject>();
  JsonArray maschera = scrittura["updateMask"]["fieldPaths"].to<JsonArray>();
  campi["stato"]["stringValue"] = stato; maschera.add("stato");
  if (tentativi >= 0) { campi["tentativi"]["integerValue"] = String(tentativi); maschera.add("tentativi"); }
  if (conAgente) { campi["agente"]["stringValue"] = idAgente; maschera.add("agente"); }
  if (errore.length()) { campi["errore"]["stringValue"] = errore; maschera.add("errore"); }
  scrittura["currentDocument"]["updateTime"] = c.aggiornato;
  String corpo, risposta;
  serializeJson(w, corpo);
  int codice = firestore("POST", radice() + ":commit", corpo, risposta);
  if (codice == 200) {
    JsonDocument r;
    deserializeJson(r, risposta);
    String t = r["writeResults"][0]["updateTime"] | "";
    if (t.length()) c.aggiornato = t;
    return 1;
  }
  if (codice == 404 || codice == 409 || (codice == 400 && (risposta.indexOf("FAILED_PRECONDITION") >= 0 || risposta.indexOf("does not match") >= 0))) return 0;
  registro("Aggiornamento comanda non riuscito (" + String(codice) + "): " + risposta.substring(0, 150));
  return -1;
}

// Manda i byte alla stampante (porta 9100, "RAW"): funziona con qualunque marca
bool inviaAllaStampante(const String &ip, int porta, const char *base64, String &errore) {
  size_t lunghezza = strlen(base64), uscita = 0;
  mbedtls_base64_decode(nullptr, 0, &uscita, (const unsigned char *)base64, lunghezza);
  uint8_t *byteDati = (uint8_t *)malloc(uscita + 1);
  if (!byteDati) { errore = "memoria insufficiente"; return false; }
  if (mbedtls_base64_decode(byteDati, uscita + 1, &uscita, (const unsigned char *)base64, lunghezza) != 0) {
    free(byteDati); errore = "dati della comanda non validi"; return false;
  }
  WiFiClient stampante;
  if (!stampante.connect(ip.c_str(), porta, TIMEOUT_STAMPANTE_MS)) {
    free(byteDati); errore = "non raggiungibile (spenta o indirizzo sbagliato?)"; return false;
  }
  size_t inviati = 0;
  while (inviati < uscita) {
    size_t n = stampante.write(byteDati + inviati, std::min((size_t)1024, uscita - inviati));
    if (n == 0) break;
    inviati += n;
  }
  delay(100);  // lascia partire gli ultimi byte prima di chiudere
  stampante.stop();
  free(byteDati);
  if (inviati < uscita) { errore = "collegamento interrotto durante la stampa"; return false; }
  return true;
}

// true se la comanda è stata lavorata (stampata, fallita o scaduta); false se in attesa o presa da altri
bool gestisci(Comanda &c) {
  auto attesa = prossimoTentativo.find(c.id);
  if (attesa != prossimoTentativo.end() && (long)(millis() - attesa->second) < 0) return false;
  if (oraSincronizzata && c.creato > 0 && time(nullptr) - c.creato > SCADENZA_S) {
    if (aggiornaComanda(c, "scaduta", -1, "Non stampata entro 15 minuti", false) != 1) return false;
    registro("Scaduta: " + c.descrizione);
    return true;
  }
  int tentativo = c.tentativi + 1;
  if (aggiornaComanda(c, "in_stampa", tentativo, "", true) != 1) return false;  // presa da un altro agente
  String errore, risposta;
  const char *dati = c.dati.as<const char *>();
  bool ok = c.ip.length() && dati && inviaAllaStampante(c.ip, c.porta, dati, errore);
  if (!c.ip.length()) errore = "indirizzo IP della stampante mancante";
  if (ok) {
    firestore("DELETE", c.nome, "", risposta);
    prossimoTentativo.erase(c.id);
    stampate++;
    ultimoErrore = "";
    lampiFinoA = millis() + 600;
    registro("Stampata: " + c.descrizione + " -> " + c.ip);
  } else {
    bool finale = tentativo >= TENTATIVI_MASSIMI;
    String messaggio = "Stampante " + c.stampante + " (" + c.ip + "): " + errore;
    ultimoErrore = messaggio;
    prossimoTentativo[c.id] = millis() + std::min(2000UL << (tentativo - 1), 30000UL);
    aggiornaComanda(c, finale ? "errore" : "da_stampare", -1, messaggio, false);
    registro(messaggio + (finale ? String(" (la cassa avvisa)") : " - riprovo (" + String(tentativo) + "/" + String(TENTATIVI_MASSIMI) + ")"));
  }
  return true;
}

// Restituisce quante comande ha lavorato: se sono COMANDE_PER_GIRO forse ce ne sono altre
int controllaCoda() {
  JsonDocument q;
  JsonObject sq = q["structuredQuery"].to<JsonObject>();
  sq["from"][0]["collectionId"] = "coda_stampa";
  JsonObject filtro = sq["where"]["fieldFilter"].to<JsonObject>();
  filtro["field"]["fieldPath"] = "stato";
  filtro["op"] = "EQUAL";
  filtro["value"]["stringValue"] = "da_stampare";
  sq["limit"] = COMANDE_PER_GIRO;
  String corpo, risposta;
  serializeJson(q, corpo);
  int codice = firestore("POST", base + ":runQuery", corpo, risposta);
  if (codice != 200) {
    statoLed = LED_PROBLEMA;
    ultimoErrore = "Coda di stampa non raggiungibile (" + String(codice) + ")";
    registro(ultimoErrore + ": " + risposta.substring(0, 150));
    if (codice == 403) accessoRevocato = true;
    return 0;
  }
  statoLed = LED_OK;
  JsonDocument d;
  DeserializationError e = deserializeJson(d, risposta);
  risposta = String();  // libera memoria
  if (e) { registro(String("Risposta della coda illeggibile: ") + e.c_str()); return 0; }
  std::vector<Comanda> comande;
  for (JsonVariantConst r : d.as<JsonArrayConst>()) {
    JsonVariantConst doc = r["document"];
    if (doc.isNull()) continue;
    JsonVariantConst f = doc["fields"];
    Comanda c;
    c.nome = doc["name"].as<String>();
    c.id = c.nome.substring(c.nome.lastIndexOf('/') + 1);
    c.aggiornato = doc["updateTime"].as<String>();
    c.ip = f["ip"]["stringValue"] | "";
    c.porta = String(f["porta"]["integerValue"] | "9100").toInt();
    c.stampante = f["stampante"]["stringValue"] | "";
    c.descrizione = f["descrizione"]["stringValue"] | c.id.c_str();
    c.tentativi = String(f["tentativi"]["integerValue"] | "0").toInt();
    c.creato = leggiOra(f["creato"]["timestampValue"] | "");
    c.dati = f["dati"]["stringValue"];
    comande.push_back(c);
  }
  std::sort(comande.begin(), comande.end(), [](const Comanda &a, const Comanda &b) { return a.creato < b.creato; });
  int lavorate = 0;
  for (Comanda &c : comande) {
    if (gestisci(c)) lavorate++;
    aggiornaLed();
  }
  return lavorate;
}

// ---------- Portale di configurazione ----------
WebServer server(80);
DNSServer dns;
String reti, nomeRete;

void paginaImpostazioni() {
  String p = FPSTR(PAGINA_INIZIO);
  if (imp.erroreSetup.length()) p += "<div class=\"err\">⚠️ " + escapeHtml(imp.erroreSetup) + "</div>";
  String modulo = FPSTR(PAGINA_MODULO);
  modulo.replace("%SSID%", escapeHtml(imp.ssid));
  modulo.replace("%RETI%", reti);
  modulo.replace("%EMAIL%", escapeHtml(imp.email));
  modulo.replace("%NOME%", escapeHtml(imp.nome));
  modulo.replace("%VERSIONE%", VERSIONE);
  modulo.replace("%ID%", idAgente);
  server.send(200, "text/html; charset=utf-8", p + modulo);
}

void salvaDalPortale() {
  imp.ssid = server.arg("ssid"); imp.ssid.trim();
  imp.wpass = server.arg("wpass");
  imp.email = server.arg("email"); imp.email.trim();
  imp.passTemp = server.arg("pass");
  imp.nome = server.arg("nome"); imp.nome.trim();
  imp.uid = ""; imp.refresh = ""; imp.erroreSetup = "";
  if (!imp.ssid.length() || !imp.email.length() || !imp.passTemp.length()) {
    imp.erroreSetup = "Compila Wi-Fi, email e password.";
    paginaImpostazioni();
    return;
  }
  salvaImpostazioni();
  String p = String(FPSTR(PAGINA_INIZIO)) + FPSTR(PAGINA_SALVATO);
  p.replace("%SSID%", escapeHtml(imp.ssid));
  p.replace("%AP%", nomeRete);
  server.send(200, "text/html; charset=utf-8", p);
  delay(1500);
  ESP.restart();
}

// I telefoni controllano queste pagine per capire se c'è internet: si apre il portale
void vaiAlPortale() {
  server.sendHeader("Location", "http://192.168.4.1/", true);
  server.send(302, "text/plain", "");
}

void avviaPortale() {
  modo = MODO_PORTALE;
  statoLed = LED_SETUP;
  WiFi.mode(WIFI_AP_STA);
  int n = WiFi.scanNetworks();
  reti = "";
  for (int i = 0; i < n; i++) reti += "<option value=\"" + escapeHtml(WiFi.SSID(i)) + "\">";
  nomeRete = "AgenteStampa-" + idAgente.substring(idAgente.length() - 4);
  WiFi.softAP(nomeRete.c_str());
  delay(200);
  dns.start(53, "*", WiFi.softAPIP());
  server.on("/", HTTP_GET, paginaImpostazioni);
  server.on("/salva", HTTP_POST, salvaDalPortale);
  for (const char *p : {"/generate_204", "/gen_204", "/hotspot-detect.html", "/connecttest.txt", "/ncsi.txt", "/fwlink"}) server.on(p, vaiAlPortale);
  server.onNotFound(vaiAlPortale);
  server.begin();
  registro("Da configurare: collegati con il telefono alla rete Wi-Fi \"" + nomeRete + "\" e apri http://192.168.4.1");
  if (imp.erroreSetup.length()) registro("Ultimo errore: " + imp.erroreSetup);
}

// ---------- Avvio ----------
void setup() {
  Serial.begin(115200);
  pinMode(PIN_LED, OUTPUT);
  pinMode(PIN_BOOT, INPUT_PULLUP);
  digitalWrite(PIN_LED, HIGH);
  delay(800);
  WiFi.mode(WIFI_STA);
  idAgente = "esp32-" + macCorto();
  registro("Agente di stampa " VERSIONE " (" + idAgente + ")");
  caricaImpostazioni();
  preparaTls(tlsFirestore);
  httpFirestore.setReuse(true);
  httpFirestore.setTimeout(15000);

  if (!imp.ssid.length() || (!imp.refresh.length() && !imp.passTemp.length())) { avviaPortale(); return; }

  if (!collegaWiFi(30000)) {
    // Primo collegamento mai riuscito: probabilmente nome o password del Wi-Fi sbagliati
    if (!imp.refresh.length()) tornaAllaConfigurazioneSenzaRiavvio("Il Wi-Fi \"" + imp.ssid + "\" non risponde: controlla nome e password (solo reti a 2,4 GHz).");
    return;  // già configurato: riprova da solo nel ciclo (router spento, corrente...)
  }
  sincronizzaOra();
  if (!imp.refresh.length()) {
    String errore;
    if (!accedi(errore)) {
      tornaAllaConfigurazioneSenzaRiavvio(errore);
      return;
    }
    imp.passTemp = "";  // la password non resta salvata
    imp.erroreSetup = "";
    salvaImpostazioni();
  }
}

// Mostra il portale con l'errore senza riavviare (evita un ciclo di riavvii)
void tornaAllaConfigurazioneSenzaRiavvio(const String &motivo) {
  imp.erroreSetup = motivo;
  imp.passTemp = "";
  salvaImpostazioni();
  registro("Configurazione da rifare: " + motivo);
  WiFi.disconnect(true);
  avviaPortale();
}

// ---------- Ciclo ----------
void loop() {
  aggiornaLed();
  controllaTastoRipristino();
  if (modo == MODO_PORTALE) {
    dns.processNextRequest();
    server.handleClient();
    return;
  }
  if (WiFi.status() != WL_CONNECTED) {
    statoLed = LED_PROBLEMA;
    if (millis() - ultimoTentativoWiFi > 15000) { ultimoTentativoWiFi = millis(); collegaWiFi(10000); }
    return;
  }
  if (!oraSincronizzata && millis() - ultimoTentativoOra > 60000) { ultimoTentativoOra = millis(); sincronizzaOra(); }
  if (accessoRevocato) {
    tornaAllaConfigurazione("Accesso non più valido (password del locale cambiata o account disattivato): ricollega l'agente.", true);
  }
  if (!locale.length()) {
    if (millis() - ultimoControllo < 5000 && ultimoControllo) return;
    ultimoControllo = millis();
    String errore;
    if (!leggiLocale(errore)) {
      statoLed = LED_PROBLEMA;
      registro(errore);
      if (errore.startsWith("Questo account")) tornaAllaConfigurazione(errore, true);
    }
    return;
  }
  if (primoBattito || millis() - ultimoBattito >= BATTITO_MS) battito();
  if (millis() - ultimoControllo >= ATTESA_MS) {
    ultimoControllo = millis();
    // Se la coda era piena ricontrolla subito: più comande dello stesso ordine escono insieme
    for (int giro = 0; giro < 5 && controllaCoda() == COMANDE_PER_GIRO && !accessoRevocato; giro++) aggiornaLed();
  }
}
