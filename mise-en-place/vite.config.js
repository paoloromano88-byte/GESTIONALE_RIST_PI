import { defineConfig } from 'vite';

export default defineConfig({
  // Percorsi relativi: la stessa build funziona dentro l'app (Capacitor) e in una sottocartella del web
  base: './',
  build: {
    outDir: 'dist',
    // WebView di Android 7+ aggiornata e Safari di iOS 14+
    target: ['chrome87', 'safari14'],
  },
});
