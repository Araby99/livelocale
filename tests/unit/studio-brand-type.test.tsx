// @vitest-environment jsdom
import React from 'react';
import { readFileSync } from 'node:fs';
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { BrandMark } from '../../src/studio/features/dashboard/components/BrandMark.js';
import { studioFiles } from './helpers/studio-files.js';

const css = readFileSync('src/studio/index.css', 'utf8');
const main = readFileSync('src/studio/main.tsx', 'utf8');
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const fontVar = (name: string) => css.match(new RegExp(`--font-${name}:\\s*([^;]+);`))?.[1];

describe('Studio brand type', () => {
  afterEach(cleanup);

  it('stacks each Latin face before its Arabic face', () => {
    expect(fontVar('heading')).toMatch(/^'Martian Mono', 'IBM Plex Sans Arabic',/);
    expect(fontVar('sans')).toMatch(/^'IBM Plex Sans', 'IBM Plex Sans Arabic',/);
    expect(fontVar('mono')).toMatch(/^'IBM Plex Mono', 'IBM Plex Sans Arabic',/);
    expect(css).toMatch(/body\s*\{[^}]*font-family:\s*var\(--font-sans\);/);
  });

  it('bundles the brand faces from Fontsource and nothing from Google', () => {
    for (const f of [
      '@fontsource/martian-mono/latin-500.css',
      '@fontsource/martian-mono/latin-700.css',
      '@fontsource/ibm-plex-sans/latin-400.css',
      '@fontsource/ibm-plex-mono/latin-400.css',
      '@fontsource/ibm-plex-sans-arabic/arabic-400.css',
    ])
      expect(main).toContain(`import '${f}';`);
    for (const p of ['inter', 'bricolage-grotesque', 'jetbrains-mono', 'readex-pro', 'outfit']) {
      expect(main).not.toContain(`@fontsource/${p}`);
      expect(pkg.devDependencies[`@fontsource/${p}`], p).toBeUndefined();
    }
    for (const p of ['martian-mono', 'ibm-plex-sans', 'ibm-plex-mono', 'ibm-plex-sans-arabic'])
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
