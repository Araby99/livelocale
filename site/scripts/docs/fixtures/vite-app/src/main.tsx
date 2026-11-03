import 'livelocale/client';
import { wrapTranslationEngine } from 'livelocale/client';
import React from 'react';
import { createRoot } from 'react-dom/client';
import en from '../locales/en.json';
import ar from '../locales/ar.json';

const MESSAGES: Record<string, Record<string, Record<string, string>>> = { en, ar };
const locale = new URLSearchParams(window.location.search).get('locale') === 'ar' ? 'ar' : 'en';

function translate(key: string): string {
  const [group, name] = key.split('.');
  return MESSAGES[locale]?.[group ?? '']?.[name ?? ''] ?? key;
}

const t = wrapTranslationEngine(translate);

function App() {
  return (
    <main lang={locale} dir={locale === 'ar' ? 'rtl' : 'ltr'}>
      <h1>{t('home.title')}</h1>
      <p>{t('home.welcome')}</p>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
