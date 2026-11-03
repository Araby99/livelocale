import React from 'react';
import { createTranslations } from 'livelocale/server';

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ locale?: string }>;
}) {
  const { locale = 'en' } = await searchParams;
  const t = createTranslations(locale, { supportedLocales: ['en', 'ar'], localesDir: './locales' });

  return (
    <main>
      <h1>{t.home?.title}</h1>
      <p>{t.home?.welcome}</p>
    </main>
  );
}
