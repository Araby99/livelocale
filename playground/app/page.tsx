import React from 'react';
import { createTranslations } from 'livelocale/server';

const SUPPORTED_LOCALES = ['en', 'ar', 'es', 'fr', 'de'];

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ locale?: string }>;
}) {
  const { locale = 'en' } = await searchParams;
  const t = createTranslations(locale, { supportedLocales: SUPPORTED_LOCALES });

  return (
    <div style={{ padding: 40, fontFamily: 'sans-serif', maxWidth: 600 }}>
      <h1>{t.home?.title}</h1>
      <p>{t.home?.welcome_msg}</p>

      <div style={{ marginTop: 20 }}>
        <a href={`/?locale=${locale}`}>{t.nav?.home}</a>
      </div>
    </div>
  );
}

export const dynamic = 'force-dynamic';
