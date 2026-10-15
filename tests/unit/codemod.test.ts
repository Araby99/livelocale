import { describe, it, expect, beforeAll } from 'vitest';
import { transformReactI18next, loadTypeScript } from '../../src/codemod/transform.js';

describe('codemod transformReactI18next', () => {
  // The first dynamic import of `typescript` is slow on cold disks; warm it up
  // once so individual tests keep the default timeout.
  beforeAll(async () => {
    await loadTypeScript();
  }, 30_000);

  it('should not modify a file that does not import useTranslation from react-i18next', async () => {
    const code = `
      import React from 'react';
      export function Component() {
        return <div>Hello</div>;
      }
    `;
    const result = await transformReactI18next(code, 'component.tsx');
    expect(result.modified).toBe(false);
    expect(result.code).toBe(code);
  });

  it('should wrap basic Object Destructuring useTranslation with string namespace', async () => {
    const code = `import { useTranslation } from 'react-i18next';
export function Component() {
  const { t } = useTranslation('home');
  return <div>{t('title')}</div>;
}`;
    const result = await transformReactI18next(code, 'component.tsx');
    expect(result.modified).toBe(true);
    expect(result.code).toContain("import { wrapTranslationEngine } from 'next-i18n-lens/client';");
    expect(result.code).toContain("const { t: rawT } = useTranslation('home');");
    expect(result.code).toContain("const t = wrapTranslationEngine(rawT, { keyPrefix: 'home' });");
  });

  it('should handle Object Destructuring with multiple keys (e.g. t and i18n)', async () => {
    const code = `import { useTranslation } from 'react-i18next';
export function Component() {
  const { t, i18n } = useTranslation('nav');
  return <div>{t('title')}</div>;
}`;
    const result = await transformReactI18next(code, 'component.tsx');
    expect(result.modified).toBe(true);
    expect(result.code).toContain("const { t: rawT, i18n } = useTranslation('nav');");
    expect(result.code).toContain("const t = wrapTranslationEngine(rawT, { keyPrefix: 'nav' });");
  });

  it('should handle Object Destructuring with custom local variable renaming (t: customName)', async () => {
    const code = `import { useTranslation } from 'react-i18next';
export function Component() {
  const { t: myT } = useTranslation('common');
  return <div>{myT('title')}</div>;
}`;
    const result = await transformReactI18next(code, 'component.tsx');
    expect(result.modified).toBe(true);
    expect(result.code).toContain("const { t: rawMyT } = useTranslation('common');");
    expect(result.code).toContain(
      "const myT = wrapTranslationEngine(rawMyT, { keyPrefix: 'common' });"
    );
  });

  it('should handle Array Destructuring', async () => {
    const code = `import { useTranslation } from 'react-i18next';
export function Component() {
  const [t] = useTranslation('dashboard');
  return <div>{t('title')}</div>;
}`;
    const result = await transformReactI18next(code, 'component.tsx');
    expect(result.modified).toBe(true);
    expect(result.code).toContain("const [rawT] = useTranslation('dashboard');");
    expect(result.code).toContain(
      "const t = wrapTranslationEngine(rawT, { keyPrefix: 'dashboard' });"
    );
  });

  it('should handle Array Destructuring with other variables', async () => {
    const code = `import { useTranslation } from 'react-i18next';
export function Component() {
  const [t, i18nInstance] = useTranslation('dashboard');
  return <div>{t('title')}</div>;
}`;
    const result = await transformReactI18next(code, 'component.tsx');
    expect(result.modified).toBe(true);
    expect(result.code).toContain("const [rawT, i18nInstance] = useTranslation('dashboard');");
    expect(result.code).toContain(
      "const t = wrapTranslationEngine(rawT, { keyPrefix: 'dashboard' });"
    );
  });

  it('should handle Simple Assignment (no destructuring)', async () => {
    const code = `import { useTranslation } from 'react-i18next';
export function Component() {
  const translation = useTranslation('footer');
  return <div>{translation.t('title')}</div>;
}`;
    const result = await transformReactI18next(code, 'component.tsx');
    expect(result.modified).toBe(true);
    expect(result.code).toContain("const rawTranslation = useTranslation('footer');");
    expect(result.code).toContain(
      "const translation = { ...rawTranslation, t: wrapTranslationEngine(rawTranslation.t, { keyPrefix: 'footer' }) };"
    );
  });

  it('should handle no namespace arguments', async () => {
    const code = `import { useTranslation } from 'react-i18next';
export function Component() {
  const { t } = useTranslation();
  return <div>{t('title')}</div>;
}`;
    const result = await transformReactI18next(code, 'component.tsx');
    expect(result.modified).toBe(true);
    expect(result.code).toContain('const { t: rawT } = useTranslation();');
    expect(result.code).toContain('const t = wrapTranslationEngine(rawT);');
  });

  it('should handle array namespaces and use the first elements prefix', async () => {
    const code = `import { useTranslation } from 'react-i18next';
export function Component() {
  const { t } = useTranslation(['auth', 'common']);
  return <div>{t('title')}</div>;
}`;
    const result = await transformReactI18next(code, 'component.tsx');
    expect(result.modified).toBe(true);
    expect(result.code).toContain("const { t: rawT } = useTranslation(['auth', 'common']);");
    expect(result.code).toContain("const t = wrapTranslationEngine(rawT, { keyPrefix: 'auth' });");
  });

  it('should handle variable/dynamic namespace arguments', async () => {
    const code = `import { useTranslation } from 'react-i18next';
export function Component(props: { ns: string }) {
  const { t } = useTranslation(props.ns);
  return <div>{t('title')}</div>;
}`;
    const result = await transformReactI18next(code, 'component.tsx');
    expect(result.modified).toBe(true);
    expect(result.code).toContain('const { t: rawT } = useTranslation(props.ns);');
    expect(result.code).toContain(
      'const t = wrapTranslationEngine(rawT, { keyPrefix: props.ns });'
    );
  });

  it('should preserve use client directive at the top when inserting import', async () => {
    const code = `'use client';
import { useTranslation } from 'react-i18next';
export function Component() {
  const { t } = useTranslation('home');
  return <div>{t('title')}</div>;
}`;
    const result = await transformReactI18next(code, 'component.tsx');
    expect(result.modified).toBe(true);
    expect(result.code.startsWith("'use client';")).toBe(true);
    expect(result.code).toContain("import { wrapTranslationEngine } from 'next-i18n-lens/client';");
  });

  it('should handle aliased hook import (useTranslation as useTrans)', async () => {
    const code = `import { useTranslation as useTrans } from 'react-i18next';
export function Component() {
  const { t } = useTrans('home');
  return <div>{t('title')}</div>;
}`;
    const result = await transformReactI18next(code, 'component.tsx');
    expect(result.modified).toBe(true);
    expect(result.code).toContain("const { t: rawT } = useTrans('home');");
    expect(result.code).toContain("const t = wrapTranslationEngine(rawT, { keyPrefix: 'home' });");
  });

  it('should preserve original indentation and formatting', async () => {
    const code = `import { useTranslation } from 'react-i18next';

export function Component() {
      const { t } = useTranslation('home');
      return <div>{t('title')}</div>;
}`;
    const result = await transformReactI18next(code, 'component.tsx');
    expect(result.modified).toBe(true);
    expect(result.code).toContain(
      "      const { t: rawT } = useTranslation('home');\n      const t = wrapTranslationEngine(rawT, { keyPrefix: 'home' });"
    );
  });

  it('should not duplicate imports or wrap if already wrapped/imported', async () => {
    const code = `import { useTranslation } from 'react-i18next';
import { wrapTranslationEngine } from 'next-i18n-lens/client';
export function Component() {
  const { t: rawT } = useTranslation('home');
  const t = wrapTranslationEngine(rawT, { keyPrefix: 'home' });
  return <div>{t('title')}</div>;
}`;
    const result = await transformReactI18next(code, 'component.tsx');
    expect(result.modified).toBe(false);
    expect(result.code).toBe(code);
  });
});
