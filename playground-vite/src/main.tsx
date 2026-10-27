import 'livelocale/client';
import { wrapTranslationEngine } from 'livelocale/client';
import React from 'react';
import { createRoot } from 'react-dom/client';
import en from '../locales/en.json';
import ar from '../locales/ar.json';

type Messages = Record<string, unknown>;

const MESSAGES: Record<string, Messages> = { en, ar };

const requested = new URLSearchParams(window.location.search).get('locale') ?? 'en';
const locale = requested in MESSAGES ? requested : 'en';

function lookup(messages: Messages, key: string): string {
  let current: unknown = messages;
  for (const part of key.split('.')) {
    if (current === null || typeof current !== 'object') return key;
    current = (current as Record<string, unknown>)[part];
  }
  return typeof current === 'string' ? current : key;
}

function translate(key: string, vars: Record<string, string> = {}): string {
  return lookup(MESSAGES[locale], key).replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? vars[name] : match
  );
}

// Watermarks only while the share Studio frames the page; a plain visit gets `translate` back.
const t = wrapTranslationEngine(translate);

function App() {
  return (
    <main lang={locale} dir={locale === 'ar' ? 'rtl' : 'ltr'}>
      <h1>{t('home.title')}</h1>
      <p>{t('home.greet', { name: 'Sara' })}</p>
      <nav>
        <a id="lang-ar" href="?locale=ar">
          العربية
        </a>{' '}
        <a id="to-about" href="/about/">
          About
        </a>
      </nav>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
