import { wrapTranslationEngine } from 'livelocale/client';

declare function translate(key: string): string;

const t = wrapTranslationEngine(translate);

export function Home() {
  return (
    <main>
      <h1>{t('home.title')}</h1>
      <p>{t('home.welcome')}</p>
      <a href="/signup">{t('home.cta')}</a>
    </main>
  );
}
