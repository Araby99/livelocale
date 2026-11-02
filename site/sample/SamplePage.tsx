// The slider's sample page. Two strings are left broken on purpose, so the build-time
// `check --hardcoded` run finds them: `plans.upgrade` keeps its English text in ar.json, and the
// trial button's text is written straight into the JSX.
import { useTranslation } from 'react-i18next';
import type { SampleFindings } from '../src/slider/report';

export function SamplePage({ findings }: { findings: SampleFindings }) {
  const { t, i18n } = useTranslation();
  const outlined = (key: string) =>
    i18n.language === 'ar' && findings.keys.includes(key) ? 'is-untranslated' : undefined;

  return (
    <div className="sample-page">
      <nav className="sample-nav">
        <span data-key="nav.pricing" className={outlined('nav.pricing')}>
          {t('nav.pricing')}
        </span>
        <span data-key="nav.docs" className={outlined('nav.docs')}>
          {t('nav.docs')}
        </span>
      </nav>
      <h3 data-key="plans.title" className={outlined('plans.title')}>
        {t('plans.title')}
      </h3>
      <p>
        <span data-key="plans.start" className={outlined('plans.start')}>
          {t('plans.start')}
        </span>{' '}
        <span data-key="plans.upgrade" className={outlined('plans.upgrade')}>
          {t('plans.upgrade')}
        </span>
      </p>
      <button type="button" className="sample-cta">
        Start free trial
      </button>
    </div>
  );
}
