// Una comanda letta da "coda_stampa". Sta in un file a parte perché l'IDE Arduino
// genera le dichiarazioni delle funzioni in cima al programma, prima delle struct.
#pragma once
#include <Arduino.h>
#include <ArduinoJson.h>
#include <time.h>

struct Comanda {
  String nome, id, aggiornato, ip, stampante, descrizione;
  int porta = 9100, tentativi = 0;
  time_t creato = 0;
  JsonVariantConst dati;  // base64 dei byte ESC/POS (resta nel documento JSON letto)
};
