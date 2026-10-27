import React from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource/inter/latin-300.css';
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/inter/latin-700.css';
import '@fontsource/outfit/latin-400.css';
import '@fontsource/outfit/latin-500.css';
import '@fontsource/outfit/latin-600.css';
import '@fontsource/outfit/latin-700.css';
import './index.css';
import App from './app.js';
import { startStudio } from './bootstrap.js';

// Decide between the HTTP API and a static share folder before the first render.
startStudio({
  href: location.href,
  search: location.search,
  injected: window.__LIVELOCALE_CONFIG__?.appOrigin,
  buildTime: (import.meta as any).env?.VITE_APP_ORIGIN,
  fetch: window.fetch.bind(window),
  indexedDB: window.indexedDB,
})
  .catch(console.error)
  .finally(() => {
    ReactDOM.createRoot(document.getElementById('root')!).render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
  });
