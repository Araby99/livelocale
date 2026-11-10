// Tidewell: a fictional invoicing product's pricing page, the stage the hero video is recorded on.
// Every visible string goes through t(), wrapped with wrapTranslationEngine so the packed share
// Studio can edit it by Alt+Click. The headline typo and the one Arabic button with no translation
// (hero.cta is missing from ar.json, so i18next falls back to English) are deliberate: the video
// fixes both. The footer's {year} and the Studio plan's seat plural are ICU, so the demo shows the
// Studio's placeholder chip and plural editor; icu.ts formats them.
import '@fontsource/plus-jakarta-sans/400.css';
import '@fontsource/plus-jakarta-sans/500.css';
import '@fontsource/plus-jakarta-sans/600.css';
import '@fontsource/plus-jakarta-sans/700.css';
import '@fontsource/plus-jakarta-sans/800.css';
import '@fontsource/noto-sans-arabic/400.css';
import '@fontsource/noto-sans-arabic/500.css';
import '@fontsource/noto-sans-arabic/600.css';
import '@fontsource/noto-sans-arabic/700.css';
import './styles.css';
import { wrapTranslationEngine } from 'livelocale/client';
import i18next from 'i18next';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { initReactI18next, useTranslation } from 'react-i18next';
import { icuFormat } from './icu';
import en from './locales/en.json';
import ar from './locales/ar.json';

const RESOURCES = { en: { translation: en }, ar: { translation: ar } };
const requested = new URLSearchParams(window.location.search).get('locale') ?? 'en';
const locale = requested in RESOURCES ? requested : 'en';
const dir = locale === 'ar' ? 'rtl' : 'ltr';
document.documentElement.lang = locale;
document.documentElement.dir = dir;

void i18next
  .use(initReactI18next)
  .use(icuFormat)
  .init({
    resources: RESOURCES,
    lng: locale,
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
  });

type T = (key: string, values?: Record<string, unknown>) => string;

/** Fixed, so the hero video and the docs shots do not change on New Year's Day. */
const YEAR = 2026;

function Logo({ t }: { t: T }) {
  return (
    <a className="logo" href="#">
      <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true">
        <rect width="28" height="28" rx="8" fill="#0E5E55" />
        <path
          d="M5 16c2.4 0 2.4-3 4.8-3s2.4 3 4.8 3 2.4-3 4.8-3 2.4 3 3.6 3"
          fill="none"
          stroke="#F3E9D2"
          strokeWidth="2.2"
          strokeLinecap="round"
        />
        <path
          d="M5 20.5c2.4 0 2.4-3 4.8-3s2.4 3 4.8 3 2.4-3 4.8-3 2.4 3 3.6 3"
          fill="none"
          stroke="#7FC4B4"
          strokeWidth="2.2"
          strokeLinecap="round"
          opacity=".9"
        />
      </svg>
      <span>{t('brand')}</span>
    </a>
  );
}

function Check() {
  return (
    <svg className="check" width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <circle cx="9" cy="9" r="9" fill="currentColor" opacity=".14" />
      <path
        d="M5.2 9.3l2.4 2.4 5.2-5.3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Plan({
  t,
  id,
  featured,
  seats,
}: {
  t: T;
  id: string;
  featured?: boolean;
  seats?: number;
}) {
  const k = (s: string) => `plans.${id}.${s}`;
  // The seat count fills the plural in the plan's f2; the other lines have no {count} to fill.
  const values = seats === undefined ? undefined : { count: seats };
  return (
    <article className={featured ? 'plan plan--featured' : 'plan'}>
      <header className="plan__head">
        <h3>{t(k('name'))}</h3>
        {featured && <span className="badge">{t(k('badge'))}</span>}
      </header>
      <p className="plan__price">
        <strong>{t(k('price'))}</strong>
        <span>{t(k('period'))}</span>
      </p>
      <p className="plan__blurb">{t(k('blurb'))}</p>
      <ul>
        {['f1', 'f2', 'f3', 'f4'].map((f) => (
          <li key={f}>
            <Check />
            <span>{t(k(f), values)}</span>
          </li>
        ))}
      </ul>
      <a className={featured ? 'btn btn--light' : 'btn btn--outline'} href="#">
        {t(k('cta'))}
      </a>
    </article>
  );
}

function Pricing() {
  const { t: rawT } = useTranslation();
  // Watermarks only while the share Studio frames the page; a plain visit gets rawT back.
  const t = wrapTranslationEngine(rawT) as T;
  return (
    <div className="page">
      <nav className="nav">
        <Logo t={t} />
        <div className="nav__links">
          <a href="#">{t('nav.product')}</a>
          <a href="#" aria-current="page">
            {t('nav.pricing')}
          </a>
          <a href="#">{t('nav.customers')}</a>
          <a href="#">{t('nav.changelog')}</a>
        </div>
        <div className="nav__actions">
          <a href="#">{t('nav.signIn')}</a>
          <a className="btn btn--ink btn--sm" href="#">
            {t('nav.getStarted')}
          </a>
        </div>
      </nav>

      <main>
        <section className="hero">
          <p className="eyebrow">{t('hero.eyebrow')}</p>
          <h1>{t('hero.title')}</h1>
          <p className="lede">{t('hero.lede')}</p>
          <div className="hero__actions">
            <a className="btn btn--primary" href="#">
              {t('hero.cta')}
            </a>
            <a className="btn btn--ghost" href="#">
              {t('hero.secondary')}
            </a>
          </div>
          <p className="note">{t('hero.note')}</p>
        </section>

        <div className="toggle" role="group">
          <span className="toggle__on">{t('billing.monthly')}</span>
          <span>{t('billing.yearly')}</span>
          <span className="toggle__save">{t('billing.save')}</span>
        </div>

        <section className="plans">
          <Plan t={t} id="solo" />
          <Plan t={t} id="studio" featured seats={5} />
          <Plan t={t} id="agency" />
        </section>

        <section className="faq">
          <h2>{t('faq.title')}</h2>
          <div className="faq__row">
            {['1', '2', '3'].map((n) => (
              <div key={n} className="faq__item">
                <h4>{t(`faq.q${n}`)}</h4>
                <p>{t(`faq.a${n}`)}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="footer">
        <div>
          <Logo t={t} />
          <p>{t('footer.tagline')}</p>
        </div>
        <div className="footer__links">
          <a href="#">{t('footer.privacy')}</a>
          <a href="#">{t('footer.terms')}</a>
          <a href="#">{t('footer.status')}</a>
          <span>{t('footer.copyright', { year: YEAR })}</span>
        </div>
      </footer>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Pricing />
  </StrictMode>
);
