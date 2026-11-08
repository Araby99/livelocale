// @vitest-environment node
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import { createRequire } from 'node:module';
import { CUTS, filterGraph } from '../../../site/scripts/hero-cuts.mjs';

const FFMPEG = createRequire(`${process.cwd()}/site/package.json`)('ffmpeg-static') as string;

/** Width and height of a still or video, read by ffmpeg. */
function size(file: string): [number, number] {
  const run = spawnSync(FFMPEG, ['-hide_banner', '-i', file], { encoding: 'utf8' });
  const m = /, (\d{2,5})x(\d{2,5})[, ]/.exec(run.stderr);
  if (!m) throw new Error(`no size for ${file}`);
  return [Number(m[1]), Number(m[2])];
}

it('cuts only the wide 2:1 version from the master; phones have their own take', () => {
  expect(Object.keys(CUTS)).toEqual(['wide']);
  const graph = filterGraph('wide');
  // the Send dialog, the pull request and its files: scaled down whole and set on Surface
  expect(graph.match(/pad=1600:800:160:0:color=0x16181D/g) ?? []).toHaveLength(3);
  expect(graph).toContain('concat=n=8:v=1:a=0[out]');
});

it('ships the phone take and its poster as a tall phone screen (390:844)', () => {
  const [w, h] = size('site/media/hero/hero-phone.mp4');
  expect(w / h).toBeCloseTo(390 / 844, 3);
  expect(size('site/media/hero/hero-phone.webm')).toEqual([w, h]);
  expect(size('site/media/hero/poster-phone.webp')).toEqual([w, h]);
});

it('records where the phone poster comes from', () => {
  const sidecar = JSON.parse(fs.readFileSync('site/media/hero/poster-phone.webp.json', 'utf8')) as {
    prompt: string;
  };
  expect(sidecar.prompt).toMatch(/^SOURCED, not generated\./);
  expect(sidecar.prompt).toContain('hero-phone.mp4');
  expect(sidecar.prompt).toContain('record-hero.mjs --phone');
});
