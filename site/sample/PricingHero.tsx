// The CI sample: a cut of the Tidewell pricing hero. Two strings are left broken on purpose, so the
// build-time `check --hardcoded` run has something true to report: the demo button's text is
// written straight into the JSX, and hero.note was copied into ar.json without being translated.
import { useTranslation } from 'react-i18next';

export function PricingHero() {
  const { t } = useTranslation();
  return (
    <section>
      <h1>{t('hero.title')}</h1>
      <p>{t('hero.lede')}</p>
      <a href="/signup">{t('hero.cta')}</a>
      <a href="/demo">Book a demo</a>
      <p>{t('hero.note')}</p>
    </section>
  );
}
