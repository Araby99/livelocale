import { describe, it, expect } from 'vitest';
import {
  frameSrc,
  resolveAddress,
  toDisplayPath,
  withPageLocale,
  type AddressContext,
} from '../../src/studio/page-address.js';

const dev: AddressContext = {
  appOrigin: 'http://localhost:3000',
  base: '/',
  hideLocale: 'ar',
  shareDir: null,
};
const share: AddressContext = {
  appOrigin: 'http://localhost:3020',
  base: '/livelocale-demo/',
  hideLocale: null,
  shareDir: '/livelocale-demo/livelocale/',
};

/** Never a scheme and never another host. */
function isSafeOrRefused(result: string | null): boolean {
  return result === null || (result.startsWith('/') && !result.startsWith('//'));
}

describe('toDisplayPath', () => {
  it('drops the Studio parameters and strips the base', () => {
    expect(toDisplayPath('/?livelocale-origin=http%3A%2F%2Flocalhost%3A3010', dev)).toBe('/');
    expect(toDisplayPath('/pricing?locale=ar&tab=2#faq', dev)).toBe('/pricing?tab=2#faq');
    expect(toDisplayPath('/pricing?locale=fr', dev)).toBe('/pricing?locale=fr');
    expect(toDisplayPath('/?q=a%20b&livelocale-origin=x', dev)).toBe('/?q=a%20b');
    expect(toDisplayPath('/livelocale-demo/pricing', share)).toBe('/pricing');
    expect(toDisplayPath('/livelocale-demo/', share)).toBe('/');
    expect(toDisplayPath('/elsewhere/', share)).toBe('/elsewhere/');
  });

  it('shows non-ASCII paths decoded', () => {
    expect(toDisplayPath('/%D9%85%D8%AF%D9%88%D9%86%D8%A9/', dev)).toBe('/مدونة/');
    expect(toDisplayPath('/%E0%A4%A/', dev)).toBe('/%E0%A4%A/');
    expect(toDisplayPath('/50%25', dev)).toBe('/50%25');
  });
});

describe('resolveAddress', () => {
  it('accepts paths under the base, relative or absolute', () => {
    expect(resolveAddress('pricing', share)).toBe('/livelocale-demo/pricing');
    expect(resolveAddress('/blog/hello/?x=1#h', share)).toBe('/livelocale-demo/blog/hello/?x=1#h');
    expect(resolveAddress('', share)).toBe('/livelocale-demo/');
    expect(resolveAddress('?x=1', share)).toBe('/livelocale-demo/?x=1');
    expect(resolveAddress('http://localhost:3020/livelocale-demo/about/', share)).toBe(
      '/livelocale-demo/about/'
    );
    expect(resolveAddress('/مدونة/', dev)).toBe('/%D9%85%D8%AF%D9%88%D9%86%D8%A9/');
    expect(resolveAddress('/50%25', dev)).toBe('/50%25');
  });

  it('refuses inputs that resolve to another origin', () => {
    for (const input of [
      '//evil.example/',
      '/\\evil.example/',
      '\\\\evil.example',
      'http://localhost:3000.evil.example/',
      'https://localhost:3000/',
      'http://u:p@localhost:3000/',
      'javascript:alert(1)',
      'data:text/html,x',
      'mailto:a@b.c',
    ]) {
      expect(resolveAddress(input, dev), input).toBeNull();
    }
    for (const input of ['java\tscript:alert(1)', ' //evil.example/']) {
      expect(isSafeOrRefused(resolveAddress(input, dev)), input).toBe(true);
    }
  });

  it('refuses paths outside the base or into the share folder', () => {
    for (const input of [
      '/../other-site/',
      '/%2e%2e/other-site/',
      'http://localhost:3020/other-site/',
      '/livelocale/index.html',
      '/livelocale/',
    ]) {
      expect(resolveAddress(input, share), input).toBeNull();
    }
    expect(resolveAddress('http://localhost:3020/livelocale-demo', share)).toBe('/livelocale-demo');
    expect(resolveAddress('/livelocale/index.html', dev)).toBe('/livelocale/index.html');
  });

  it('refuses the share folder however it is spelled', () => {
    for (const input of [
      '/livelocale',
      '/livelocale?x=1',
      '/livelocale#top',
      '/%6civelocale/',
      '/%6C%69%76%65%6C%6F%63%61%6C%65/index.html',
      '/livelocale%2Findex.html',
      '/livelocale%5Cindex.html',
      '/LiveLocale/',
      '/LIVELOCALE',
      '/LIVE%4cOCALE/index.html',
      'http://localhost:3020/livelocale-demo/Livelocale',
      '/./livelocale/',
      '/x/../livelocale',
    ]) {
      expect(resolveAddress(input, share), input).toBeNull();
    }
    for (const input of ['/livelocale-docs/', '/livelocalex', '/about/livelocale/', '/%zz/']) {
      expect(resolveAddress(input, share), input).not.toBeNull();
    }
    expect(resolveAddress('/livelocale/index.html', dev)).toBe('/livelocale/index.html');
  });
});

describe('withPageLocale', () => {
  it('keeps the language the preview shows', () => {
    expect(withPageLocale('/about/', '/?locale=ar', 'ar', {})).toBe('/about/?locale=ar');
    expect(withPageLocale('/about/', '/', 'ar', {})).toBe('/about/');
    expect(withPageLocale('/fr/about', '/ar/', 'ar', {})).toBe('/fr/about');
    const o = { basePath: '/livelocale-demo/', locales: ['en', 'ar'] };
    expect(withPageLocale('/livelocale-demo/about/', '/livelocale-demo/ar/', 'ar', o)).toBe(
      '/livelocale-demo/about/?locale=ar'
    );
  });
});

describe('frameSrc', () => {
  it('sets the Studio origin on the app address', () => {
    expect(frameSrc('/about/?locale=ar', 'http://localhost:3020', 'http://localhost:3010')).toBe(
      'http://localhost:3020/about/?locale=ar&livelocale-origin=http%3A%2F%2Flocalhost%3A3010'
    );
  });
});
