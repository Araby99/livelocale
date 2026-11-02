// @vitest-environment jsdom
import React from 'react';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { BrandMark } from '../../src/studio/features/dashboard/components/BrandMark.js';

/** Every file under `dir` whose name matches `ext`, sorted, with forward slashes. */
const studioFiles = (dir: string, ext: RegExp): string[] =>
  readdirSync(dir)
    .flatMap((name) => {
      const file = join(dir, name).replace(/\\/g, '/');
      if (statSync(file).isDirectory()) return studioFiles(file, ext);
      return ext.test(file) ? [file] : [];
    })
    .sort();

const css = readFileSync('src/studio/index.css', 'utf8');
const main = readFileSync('src/studio/main.tsx', 'utf8');
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const fontVar = (name: string) => css.match(new RegExp(`--font-${name}:\\s*([^;]+);`))?.[1];

describe('Studio brand type', () => {
  afterEach(cleanup);

  it('stacks each Latin face before its Arabic face', () => {
    expect(fontVar('heading')).toMatch(/^'Bricolage Grotesque', 'Readex Pro',/);
    expect(fontVar('sans')).toMatch(/^'Inter', 'IBM Plex Sans Arabic',/);
    expect(fontVar('mono')).toMatch(/^'JetBrains Mono',/);
    expect(css).toMatch(/body\s*\{[^}]*font-family:\s*var\(--font-sans\);/);
  });

  it('enlarges Arabic text and opens its line height', () => {
    expect(css).toMatch(/html\[lang='ar'\]\s*\{[^}]*font-size:\s*108%;/);
    expect(css).toMatch(/html\[lang='ar'\] body\s*\{[^}]*line-height:\s*1\.7;/);
  });

  it('bundles the brand faces from Fontsource and nothing from Google', () => {
    for (const f of [
      '@fontsource/bricolage-grotesque/latin-800.css',
      '@fontsource/jetbrains-mono/latin-500.css',
      '@fontsource/readex-pro/arabic-700.css',
      '@fontsource/ibm-plex-sans-arabic/arabic-400.css',
      '@fontsource/inter/latin-400.css',
    ])
      expect(main).toContain(`import '${f}';`);
    expect(main).not.toContain('@fontsource/outfit');
    expect(pkg.devDependencies['@fontsource/outfit']).toBeUndefined();
    for (const p of ['bricolage-grotesque', 'jetbrains-mono', 'readex-pro', 'ibm-plex-sans-arabic'])
      expect(pkg.devDependencies[`@fontsource/${p}`], p).toBeDefined();
    expect(pkg.dependencies).toBeUndefined();
    const google = studioFiles('src/studio', /\.(tsx?|css|html)$/).filter((f) =>
      /fonts\.(googleapis|gstatic)\.com/.test(readFileSync(f, 'utf8'))
    );
    expect(google).toEqual([]);
  });

  it('uses only the brand font utilities', () => {
    const hits = studioFiles('src/studio', /\.tsx$/).flatMap((f) =>
      [
        ...readFileSync(f, 'utf8').matchAll(/(?<![\w-])font-(?:outfit|serif|\[[^\]]+\])(?![\w-])/g),
      ].map((m) => `${f}: ${m[0]}`)
    );
    expect(hits).toEqual([]);
  });

  it('draws the patch mark from the master geometry, coloured by tokens', () => {
    const { container } = render(<BrandMark />);
    const svg = container.querySelector('svg[data-testid="brand-mark"]')!;
    expect([svg.getAttribute('viewBox'), svg.getAttribute('aria-hidden')]).toEqual([
      '0 0 64 64',
      'true',
    ]);
    const box = (r: Element) =>
      ['x', 'y', 'width', 'height'].map((a) => r.getAttribute(a)).join(' ');
    expect([...svg.querySelectorAll('g.fill-logo-ink > rect')].map(box)).toEqual([
      '6 11 20 8',
      '29 11 29 8',
      '6 28 14 8',
      '25 31 29 2',
      '6 45 23 8',
      '32 45 12 8',
    ]);
    expect(svg.querySelector('g.fill-logo-ink > rect:nth-child(4)')!.getAttribute('opacity')).toBe(
      '.5'
    );
    const patch = svg.querySelector('g[transform="rotate(-7 39 32)"]')!;
    expect([...patch.children].map((r) => `${r.getAttribute('class')} ${box(r)}`)).toEqual([
      'fill-accent-shadow 24.5 24.5 30 15',
      'fill-accent 23 23 30 15',
    ]);
    expect(svg.outerHTML).not.toMatch(/#[0-9a-f]{3,8}/i);
  });
});
