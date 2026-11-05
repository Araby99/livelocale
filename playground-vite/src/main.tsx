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
  // Arabic leaves some keys out on purpose (the phone e2e walks them with Next missing);
  // the page shows the English text for those, as most i18n libraries do.
  const value = lookup(MESSAGES[locale], key);
  return (value === key ? lookup(en, key) : value).replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? vars[name] : match
  );
}

// An image-only link: a tap on it in Edit mode must do nothing.
const LOGO =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><rect width="48" height="48" rx="12" fill="#4fc3dc"/></svg>'
  );

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
          {t('home.about')}
        </a>{' '}
        <a id="logo-link" href="/about/" aria-label="About">
          <img src={LOGO} alt="" width={48} height={48} />
        </a>
      </nav>
      <p id="cta">{t('home.cta')}</p>
      {/* A closed menu: its text is on the page but not visible. */}
      <ul id="closed-menu" hidden>
        <li>{t('home.menu_item')}</li>
      </ul>
      <footer>{t('home.footer')}</footer>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
