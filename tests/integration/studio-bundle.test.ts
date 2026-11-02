import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { spawnSync } from 'child_process';

function dirBytes(dir: string): number {
  let total = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    total += entry.isDirectory() ? dirBytes(full) : fs.statSync(full).size;
  }
  return total;
}

describe.skipIf(!fs.existsSync('dist/studio/index.html'))('built Studio bundle', () => {
  it('ships a relocatable, private, self-contained Studio', () => {
    const html = fs.readFileSync('dist/studio/index.html', 'utf-8');
    expect(html).toContain('src="./assets/');
    expect(html).not.toContain('src="/assets/');
    expect(html).not.toMatch(/fonts\.(googleapis|gstatic)\.com/);
    expect(html).toContain('name="robots" content="noindex, nofollow"');
    expect(fs.readdirSync('dist/studio/assets').some((f) => f.endsWith('.woff2'))).toBe(true);
    // The hunk faces (Martian Mono, IBM Plex Sans, Mono and Sans Arabic, woff2 plus woff) put the bundle near 0.97 MB.
    expect(dirBytes('dist/studio')).toBeLessThan(1_100_000);
  });

  it('ships only the hunk faces', () => {
    const woff2 = fs.readdirSync('dist/studio/assets').filter((f) => f.endsWith('.woff2'));
    for (const prefix of [
      'martian-mono-latin-',
      'ibm-plex-sans-latin-',
      'ibm-plex-mono-latin-',
      'ibm-plex-sans-arabic-arabic-',
    ])
      expect(
        woff2.some((f) => f.startsWith(prefix)),
        prefix
      ).toBe(true);
    expect(
      woff2.filter((f) =>
        /^(?:inter|bricolage-grotesque|jetbrains-mono|readex-pro|outfit)-/.test(f)
      )
    ).toEqual([]);
  });

  // The SIL OFL 1.1 requires each redistributed font to travel with its copyright notice and licence.
  const families = [
    ...new Set(
      [
        ...fs
          .readFileSync('src/studio/main.tsx', 'utf-8')
          .matchAll(/from\s+'@fontsource\/([^/']+)\/|import\s+'@fontsource\/([^/']+)\//g),
      ].map((m) => m[1] ?? m[2])
    ),
  ];

  it('ships the OFL licence of every bundled font family', () => {
    expect([...families].sort()).toEqual([
      'ibm-plex-mono',
      'ibm-plex-sans',
      'ibm-plex-sans-arabic',
      'martian-mono',
    ]);
    for (const family of families) {
      const shipped = path.join('dist/studio/fonts-licenses', `${family}.txt`);
      expect(fs.existsSync(shipped), shipped).toBe(true);
      const text = fs.readFileSync(shipped, 'utf-8');
      expect(text).toBe(
        fs.readFileSync(path.join('node_modules/@fontsource', family, 'LICENSE'), 'utf-8')
      );
      expect(text).toMatch(/^Copyright /);
      expect(text).toContain('SIL OPEN FONT LICENSE Version 1.1');
    }
  });

  it('puts the font licences in the npm tarball', () => {
    const result = spawnSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {
      encoding: 'utf-8',
      shell: process.platform === 'win32',
    });
    expect(result.status, result.stderr).toBe(0);
    const files: string[] = JSON.parse(result.stdout)[0].files.map((f: { path: string }) => f.path);
    for (const family of families)
      expect(files).toContain(`dist/studio/fonts-licenses/${family}.txt`);
  }, 60_000);
});
