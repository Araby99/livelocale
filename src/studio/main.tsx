import React from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource/martian-mono/latin-500.css';
import '@fontsource/martian-mono/latin-700.css';
import '@fontsource/ibm-plex-sans/latin-400.css';
import '@fontsource/ibm-plex-sans/latin-500.css';
import '@fontsource/ibm-plex-sans/latin-600.css';
import '@fontsource/ibm-plex-mono/latin-400.css';
import '@fontsource/ibm-plex-mono/latin-500.css';
import '@fontsource/ibm-plex-mono/latin-600.css';
import '@fontsource/ibm-plex-sans-arabic/arabic-400.css';
import '@fontsource/ibm-plex-sans-arabic/arabic-500.css';
import '@fontsource/ibm-plex-sans-arabic/arabic-600.css';
import '@fontsource/ibm-plex-sans-arabic/arabic-700.css';
import './index.css';
import App from './app.js';
import { startStudio } from './bootstrap.js';
import { initialThemeChoice, storedThemeChoice } from './preferences.js';
import { isShareStudio } from './runtime.js';
import { applyTheme, prefersDark, resolveTheme } from './theme.js';

// The Studio kind is unknown until startStudio settles, so follow the system meanwhile.
applyTheme(document.documentElement, resolveTheme(storedThemeChoice() ?? 'system', prefersDark()));

// Decide between the HTTP API and a static share folder before the first render.
startStudio({
  href: location.href,
  search: location.search,
  injected: window.__LIVELOCALE_CONFIG__?.appOrigin,
  injectedUrl: window.__LIVELOCALE_CONFIG__?.appUrl,
  buildTime: (import.meta as any).env?.VITE_APP_ORIGIN,
  fetch: window.fetch.bind(window),
  indexedDB: window.indexedDB,
})
  .catch(console.error)
  .finally(() => {
    applyTheme(
      document.documentElement,
      resolveTheme(
        initialThemeChoice({ stored: storedThemeChoice(), isShareStudio: isShareStudio() }),
        prefersDark()
      )
    );
    ReactDOM.createRoot(document.getElementById('root')!).render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
  });
