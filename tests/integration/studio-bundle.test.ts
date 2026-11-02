import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

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
});
