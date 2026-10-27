// @vitest-environment node
import * as vm from 'node:vm';
import { afterEach, expect, it, vi } from 'vitest';
import { BROWSER_FLAG_GLOBAL, getLiveLocaleMode } from '../../src/core/env.js';
import { FLAG_SCRIPT, FLAG_SCRIPT_SIGNATURE } from '../../src/core/flag-script.js';

type FakeParent = 'self' | 'cross-origin' | { origin: string; pathname: string };

interface FakeWindow {
  location: { origin: string };
  __LIVELOCALE_FLAG__: string | undefined;
  parent?: unknown;
}

/** A window whose parent is itself, a cross-origin frame, or a readable same-or-other-origin page. */
function fakeWindow({
  self,
  parent,
  preset,
}: {
  self: string;
  parent: FakeParent;
  preset?: string;
}): FakeWindow {
  const win: FakeWindow = { location: { origin: self }, __LIVELOCALE_FLAG__: preset };
  if (parent === 'self') {
    win.parent = win;
  } else if (parent === 'cross-origin') {
    win.parent = {
      get location(): never {
        throw new DOMException('Blocked a frame', 'SecurityError');
      },
    };
  } else {
    win.parent = { location: { origin: parent.origin, pathname: parent.pathname } };
  }
  return win;
}

/** Runs FLAG_SCRIPT as a classic script whose `document.currentScript.src` is `src`. */
function runIn(win: FakeWindow, src: string | null): void {
  new Function('window', 'document', FLAG_SCRIPT)(win, {
    currentScript: src === null ? null : { src },
  });
}

function run({
  self,
  parent,
  src,
  preset,
}: {
  self: string;
  parent: FakeParent;
  src: string | null;
  preset?: string;
}): string | undefined {
  const win = fakeWindow({ self, parent, preset });
  runIn(win, src);
  return win.__LIVELOCALE_FLAG__;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const SITE = 'https://acme.com';

it('turns preview on when framed by the Studio', () => {
  for (const pathname of ['/livelocale/index.html', '/livelocale/'])
    expect(
      run({ self: SITE, parent: { origin: SITE, pathname }, src: `${SITE}/livelocale/flag.js` })
    ).toBe('preview');
});

it('works under a base path', () =>
  expect(
    run({
      self: 'https://u.github.io',
      parent: { origin: 'https://u.github.io', pathname: '/repo/livelocale/index.html' },
      src: 'https://u.github.io/repo/livelocale/flag.js',
    })
  ).toBe('preview'));

it('stays off when not framed', () =>
  expect(run({ self: SITE, parent: 'self', src: `${SITE}/livelocale/flag.js` })).toBeUndefined());

it('stays off and does not throw for a cross-origin parent', () =>
  expect(
    run({ self: SITE, parent: 'cross-origin', src: `${SITE}/livelocale/flag.js` })
  ).toBeUndefined());

it.each([
  '/',
  '/checkout',
  '/livelocale',
  '/livelocale-evil/index.html',
  '/docs/livelocale/',
  '/admin/preview.html',
])('stays off for a same-origin parent at %s', (pathname) =>
  expect(
    run({ self: SITE, parent: { origin: SITE, pathname }, src: `${SITE}/livelocale/flag.js` })
  ).toBeUndefined()
);

it('stays off for a readable parent on another origin, or when both are opaque', () => {
  expect(
    run({
      self: SITE,
      parent: { origin: 'https://evil.com', pathname: '/livelocale/index.html' },
      src: `${SITE}/livelocale/flag.js`,
    })
  ).toBeUndefined();
  expect(
    run({
      self: 'null',
      parent: { origin: 'null', pathname: '/livelocale/' },
      src: `${SITE}/livelocale/flag.js`,
    })
  ).toBeUndefined();
});

it('stays off without currentScript', () =>
  expect(
    run({ self: SITE, parent: { origin: SITE, pathname: '/livelocale/' }, src: null })
  ).toBeUndefined());

it('never overwrites a flag that is already set', () =>
  expect(
    run({
      self: SITE,
      parent: { origin: SITE, pathname: '/livelocale/' },
      src: `${SITE}/livelocale/flag.js`,
      preset: 'off',
    })
  ).toBe('off'));

it('sets exactly the global env.ts reads', () => {
  expect(FLAG_SCRIPT).toContain(`window.${BROWSER_FLAG_GLOBAL} = 'preview'`);
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('LIVELOCALE', '');
  vi.stubEnv('NEXT_PUBLIC_LIVELOCALE', '');
  const win = fakeWindow({ self: SITE, parent: { origin: SITE, pathname: '/livelocale/' } });
  vi.stubGlobal('window', win);
  runIn(win, `${SITE}/livelocale/flag.js`);
  expect(getLiveLocaleMode()).toBe('preview');
});

it('is a small ES5 classic script', () => {
  expect(FLAG_SCRIPT.startsWith(`${FLAG_SCRIPT_SIGNATURE}\n`)).toBe(true);
  expect(FLAG_SCRIPT.endsWith(')();\n')).toBe(true);
  expect(() => new vm.Script(FLAG_SCRIPT)).not.toThrow();
  expect(FLAG_SCRIPT).not.toMatch(/=>|\bconst\b|\blet\b|`|\bclass\b|\bimport\b|\bexport\b/);
  expect(Buffer.byteLength(FLAG_SCRIPT)).toBeLessThan(1024);
});
