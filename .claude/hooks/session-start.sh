#!/bin/bash
# Avvio delle sessioni cloud di Claude Code: prepara i test con gli emulatori Firebase
# (vedi "Comandi" in CLAUDE.md e .github/workflows/test-emulatori.yml, che usano le stesse versioni).
# Le installazioni ripartono solo se è cambiato qualcosa che decide cosa installare.
set -euo pipefail

# Solo nelle sessioni cloud: sul proprio computer non si tocca niente
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-.}"

# 1. Strumenti dei test alla radice (senza package.json: --no-save non crea file nel repository);
#    sweetalert2 serve alle prove nel browser (test/browser), al posto di quella da CDN.
#    Le versioni sono scritte qui sotto, quindi basta l'impronta di questo script.
impronta=node_modules/.session-start.sha256
if ! sha256sum --check --status "$impronta" 2>/dev/null; then
  rm -f "$impronta"
  npm install --no-save --no-audit --no-fund \
    firebase-tools@13.29.1 @firebase/rules-unit-testing@3.0.4 firebase@10.7.1 sweetalert2@11.26.25
  sha256sum .claude/hooks/session-start.sh > "$impronta"
fi

# 2. Dipendenze delle Cloud Functions, come in CI (npm ci: non modifica package-lock.json)
impronta=functions/node_modules/.session-start.sha256
if ! sha256sum --check --status "$impronta" 2>/dev/null; then
  rm -f "$impronta"
  (cd functions && npm ci --no-audit --no-fund)
  sha256sum .claude/hooks/session-start.sh functions/package.json functions/package-lock.json > "$impronta"
fi

# 3. Emulatore Firestore (file .jar in ~/.cache/firebase): si scarica solo se manca
if ! ls "$HOME"/.cache/firebase/emulators/cloud-firestore-emulator-*.jar >/dev/null 2>&1; then
  npx firebase setup:emulators:firestore
fi

# 4. A ogni avvio: copie dei moduli condivisi usate dalle Cloud Functions (ignorate da git)
cp zone-consegna.js comande-escpos.js functions/

# Gli emulatori di Firestore e Auth richiedono Java
if ! command -v java >/dev/null 2>&1; then
  echo "Attenzione: Java non è installato, i test con gli emulatori non partiranno." >&2
fi
