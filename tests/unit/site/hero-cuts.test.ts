// @vitest-environment node
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { SEAM, filterGraph } from '../../../site/scripts/hero-cuts.mjs';

const FFMPEG = createRequire(`${process.cwd()}/site/package.json`)('ffmpeg-static') as string;
const PAGE_OUT = 280; // the page pane's height in the narrow cut, as hero-cuts.mjs sets it

it('pads a Surface seam under the page in every stacked shot of the narrow cut', () => {
  const graph = filterGraph('narrow');
  const seams = graph.match(/pad=720:286:0:0:color=0x16181D/g) ?? [];
  expect(SEAM).toBeGreaterThanOrEqual(4);
  expect(PAGE_OUT + SEAM).toBe(286);
  // full, edit, full-ar, edit and the loop seam's full: five stacked shots.
  expect(seams).toHaveLength(5);
  expect(graph).toContain(`crop=720:${900 - PAGE_OUT - SEAM}:0:0`);
});

it('shows that seam in the shipped narrow poster, between the page and the editor', () => {
  const run = spawnSync(
    FFMPEG,
    [
      '-v',
      'error',
      '-i',
      'site/media/hero/poster-narrow.webp',
      '-f',
      'rawvideo',
      '-pix_fmt',
      'rgb24',
      '-',
    ],
    { maxBuffer: 16 * 1024 * 1024 }
  );
  expect(run.status).toBe(0);
  const px = run.stdout;
  const width = 720;
  // Sample the middle rows of the seam across the width, clear of WebP's edge blur.
  for (const y of [PAGE_OUT + 2, PAGE_OUT + 3]) {
    for (let x = 20; x < width - 20; x += 50) {
      const i = (y * width + x) * 3;
      const [r, g, b] = [px[i]!, px[i + 1]!, px[i + 2]!];
      expect(Math.abs(r - 0x16) + Math.abs(g - 0x18) + Math.abs(b - 0x1d)).toBeLessThan(24);
    }
  }
});
