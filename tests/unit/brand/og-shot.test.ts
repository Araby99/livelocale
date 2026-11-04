// @vitest-environment node
import * as fs from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';

const OG = fs.readFileSync('brand/src/og.html', 'utf8');
const PAGE = pathToFileURL(path.resolve('brand/src/og.html')).href;

/** The src the og template gives the product window for a ?shot= value. */
function shotSrc(shot: string): string {
  const dom = new JSDOM(OG, {
    url: `${PAGE}?shot=${encodeURIComponent(shot)}`,
    runScripts: 'dangerously',
  });
  const src = dom.window.document.getElementById('shot')!.getAttribute('src') ?? '';
  dom.window.close();
  return src;
}

it('shows a local PNG frame passed as a file URL', () => {
  const frame = pathToFileURL(path.resolve('site/media/hero/poster.png')).href;
  expect(shotSrc(frame)).toBe(frame);
});

it.each([
  'javascript:alert(1)',
  'data:image/svg+xml,<svg onload=alert(1)>',
  'https://example.com/shot.png',
  'file:///tmp/not-an-image.html',
])('ignores %s', (shot) => expect(shotSrc(shot)).toBe(''));
