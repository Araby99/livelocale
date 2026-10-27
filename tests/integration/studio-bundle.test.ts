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
    expect(dirBytes('dist/studio')).toBeLessThan(1_000_000);
  });
});
