// @vitest-environment node
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  extractKeyReferences,
  extractKeys,
  resolveCodeKeys,
  type LocaleKeyIndex,
} from '../../src/server/key-scanner.js';

const index = (leaves: string[], namespaces: string[] = []): LocaleKeyIndex => ({
  kind: (key) =>
    leaves.includes(key)
      ? 'leaf'
      : leaves.some((leaf) => leaf.startsWith(`${key}.`))
        ? 'branch'
        : undefined,
  namespaces: new Set(namespaces),
});

describe('extractKeys — react-i18next <Trans>', () => {
  it('reads the i18nKey of a <Trans> in any quote style', () => {
    const keys = extractKeys(`
      <Trans i18nKey="home.terms">By continuing you accept our <a>terms</a>.</Trans>
      <Trans i18nKey={'home.privacy'} />
      <Trans i18nKey={\`home.cookies\`}>x</Trans>
    `);
    expect(keys).toEqual(['home.cookies', 'home.privacy', 'home.terms']);
  });

  it('reads a <Trans> whose attributes hold JSX and braces', () => {
    const keys = extractKeys(`
      <Trans
        components={{ link: <a href="/terms" /> }}
        values={{ name }}
        i18nKey="home.terms"
      />
    `);
    expect(keys).toEqual(['home.terms']);
  });

  it('puts the ns prop in front of the key', () => {
    const refs = extractKeyReferences(`<Trans ns="legal" i18nKey="terms.body" />`);
    expect(refs.calls).toEqual(['legal.terms.body']);
  });

  it('uses the namespace of the t passed as a prop', () => {
    const refs = extractKeyReferences(`
      const { t } = useTranslation('legal');
      return <Trans t={t} i18nKey="terms.body" />;
    `);
    expect(refs.calls).toEqual(['legal.terms.body']);
  });

  it('finds a <Trans> key with no namespace under the namespace that has it', () => {
    const refs = extractKeyReferences(`<Trans i18nKey="home.terms">text</Trans>`);
    expect(resolveCodeKeys(refs, index(['common.home.terms'], ['common']))).toEqual([
      'common.home.terms',
    ]);
  });

  it('ignores a dynamic i18nKey and other components', () => {
    expect(
      extractKeys(`
        <Trans i18nKey={key} />
        <Trans i18nKey={\`home.\${name}\`} />
        <Translate i18nKey="not.this" />
      `)
    ).toEqual([]);
  });
});

/**
 * A regex that names the same group twice needs ES2025 (Node 23+). On Node 18 to 22,
 * `new RegExp` throws for it, so this stand-in throws the same way on every Node.
 */
class StrictRegExp extends RegExp {
  constructor(pattern: string | RegExp, flags?: string) {
    const source = typeof pattern === 'string' ? pattern : pattern.source;
    const names = [...source.matchAll(/\(\?<([A-Za-z_$][\w$]*)>/g)].map((m) => m[1]!);
    const duplicate = names.find((name, i) => names.indexOf(name) !== i);
    if (duplicate) throw new SyntaxError(`Duplicate capture group name: ${duplicate}`);
    super(pattern, flags);
  }
}

describe('extractKeyReferences — older Node versions', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('builds no regex that names a group twice', () => {
    vi.stubGlobal('RegExp', StrictRegExp);
    const refs = extractKeyReferences(`
      const { t } = useTranslation('legal');
      t('page.title');
      <Trans i18nKey={'terms.body'} />
      <Trans ns="legal" i18nKey="terms.footer" />
      <Trans i18nKey={key} />
    `);
    expect(refs.calls).toEqual(['legal.page.title', 'legal.terms.footer']);
    expect(refs.props).toContain('terms.body');
  });
});

describe('KeyScanner.scanSourceKeys — a file that fails to scan', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does not drop the error silently', async () => {
    const fs = await import('fs');
    const os = await import('os');
    const path = await import('path');
    const { KeyScanner } = await import('../../src/server/key-scanner.js');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'livelocale-scan-throw-'));
    try {
      fs.writeFileSync(path.join(dir, 'page.tsx'), `t('home.title')`);
      class ThrowingRegExp extends RegExp {
        constructor(pattern: string | RegExp, flags?: string) {
          if (typeof pattern === 'string' && pattern.includes('(?<s1>')) {
            throw new SyntaxError('Invalid regular expression');
          }
          super(pattern, flags);
        }
      }
      vi.stubGlobal('RegExp', ThrowingRegExp);
      await expect(new KeyScanner({ requireEnabled: false }).scanSourceKeys(dir)).rejects.toThrow(
        'Invalid regular expression'
      );
    } finally {
      vi.unstubAllGlobals();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('extractKeys — key grammar', () => {
  it('reads natural-language and non-Latin keys', () => {
    expect(extractKeys(`t('Hello world'); t('home.überschrift')`)).toEqual([
      'Hello world',
      'home.überschrift',
    ]);
  });
});

describe('KeyScanner.scanLocalesKeys — byte-order mark', () => {
  it('reads locale files that start with a BOM', async () => {
    const fs = await import('fs');
    const os = await import('os');
    const path = await import('path');
    const { KeyScanner } = await import('../../src/server/key-scanner.js');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'livelocale-scan-bom-'));
    try {
      fs.writeFileSync(path.join(dir, 'en.json'), '\uFEFF{"home":{"title":"Hi"}}');
      fs.mkdirSync(path.join(dir, 'ar'));
      fs.writeFileSync(path.join(dir, 'ar', 'common.json'), '\uFEFF{"cta":"x"}');
      const keys = await new KeyScanner({ requireEnabled: false }).scanLocalesKeys(
        dir,
        async () => ['en', 'ar']
      );
      expect(keys).toEqual(['common.cta', 'home.title']);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
