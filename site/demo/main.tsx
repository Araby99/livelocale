// The packed demo: the hero's copy, mistakes included, rendered with react-i18next and wrapped
// with wrapTranslationEngine (README Option B), so the real share Studio can edit it by Alt+Click.
import { wrapTranslationEngine } from 'livelocale/client';
import i18next from 'i18next';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { initReactI18next, useTranslation } from 'react-i18next';
import en from './locales/en.json';
import ar from './locales/ar.json';

const RESOURCES = { en: { translation: en }, ar: { translation: ar } };
const requested = new URLSearchParams(window.location.search).get('locale') ?? 'en';
const locale = requested in RESOURCES ? requested : 'en';

void i18next.use(initReactI18next).init({
  resources: RESOURCES,
  lng: locale,
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

function Hero() {
  const { t: rawT } = useTranslation();
  // Watermarks only while the share Studio frames the page; a plain visit gets rawT back.
  const t = wrapTranslationEngine(rawT);
  return (
    <main lang={locale} dir={locale === 'ar' ? 'rtl' : 'ltr'}>
      <h1>{t('hero.title')}</h1>
      <p>{t('hero.lede')}</p>
      <p>{t('hero.ci')}</p>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Hero />
  </StrictMode>
);
