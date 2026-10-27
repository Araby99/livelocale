import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import studioConfig from '../../src/studio/vite.config.js';

describe('Studio static build', () => {
  it('builds with a relative base', () =>
    expect((studioConfig as any)({ command: 'build', mode: 'production' }).base).toBe('./'));

  it('loads no remote fonts and is noindex', () => {
    const html = fs.readFileSync('src/studio/index.html', 'utf-8');
    expect(html).not.toMatch(/fonts\.(googleapis|gstatic)\.com/);
    expect(html).toContain('<meta name="robots" content="noindex, nofollow" />');
  });

  it('imports the latin font files', () => {
    const main = fs.readFileSync('src/studio/main.tsx', 'utf-8');
    for (const w of [300, 400, 500, 600, 700])
      expect(main).toContain(`import '@fontsource/inter/latin-${w}.css';`);
    for (const w of [400, 500, 600, 700])
      expect(main).toContain(`import '@fontsource/outfit/latin-${w}.css';`);
  });
});
