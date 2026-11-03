// @vitest-environment node
import * as fs from 'node:fs';
import { join } from 'node:path';
import { SHOTS, CLIPS, provenance, type DocsMedia } from '../../../site/scripts/docs/media.mjs';
import { webpSize } from '../../../site/scripts/docs/webp-size.mjs';

const MEDIA = 'site/media/docs';
const manifest = JSON.parse(fs.readFileSync(join(MEDIA, 'manifest.json'), 'utf8')) as DocsMedia;
const KB = 1024;

function docsPages(dir = 'site/docs'): string[] {
  return fs
    .readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter((f) => f.endsWith('.md') && !f.split(/[\\/]/).includes('node_modules'))
    .map((f) => join(dir, f));
}

it('ships every shot and clip in the manifest, at the size the manifest says', () => {
  expect(Object.keys(manifest.shots).sort()).toEqual(Object.keys(SHOTS).sort());
  expect(Object.keys(manifest.clips).sort()).toEqual(Object.keys(CLIPS).sort());
  for (const [name, shot] of Object.entries(manifest.shots)) {
    expect(shot.file, name).toBe(`${name}.webp`);
    expect(webpSize(fs.readFileSync(join(MEDIA, shot.file))), name).toEqual({
      width: shot.width,
      height: shot.height,
    });
  }
  for (const [name, clip] of Object.entries(manifest.clips)) {
    expect([clip.webm, clip.mp4, clip.poster], name).toEqual([
      `${name}.webm`,
      `${name}.mp4`,
      `${name}.poster.webp`,
    ]);
    for (const file of [clip.webm, clip.mp4]) {
      const { size } = fs.statSync(join(MEDIA, file));
      expect(size, file).toBeGreaterThan(10 * KB);
      expect(size, file).toBeLessThan(1.5 * KB * KB);
    }
    expect(webpSize(fs.readFileSync(join(MEDIA, clip.poster))), name).toEqual({
      width: clip.width,
      height: clip.height,
    });
    expect(clip.seconds, name).toBeGreaterThan(0);
    expect(clip.seconds, name).toBeLessThanOrEqual(CLIPS[name as keyof typeof CLIPS].seconds);
  }
});

it('gives every raster its provenance', () => {
  const rasters = fs.readdirSync(MEDIA).filter((f) => f.endsWith('.webp'));
  expect(rasters.length).toBe(Object.keys(SHOTS).length + Object.keys(CLIPS).length);
  for (const file of rasters) {
    const sidecar = JSON.parse(fs.readFileSync(join(MEDIA, `${file}.json`), 'utf8')) as {
      prompt: string;
      createdAt: string;
    };
    expect(sidecar.prompt, file).toMatch(/^SOURCED, not generated\./);
    expect(sidecar.prompt, file).toContain('site/scripts/record-docs.mjs');
    expect(Number.isNaN(Date.parse(sidecar.createdAt)), file).toBe(false);
  }
  expect(provenance('x', 'y').prompt).toMatch(/^SOURCED, not generated\./);
});

it('uses only media that exist, with alt text', () => {
  let used = 0;
  for (const page of docsPages()) {
    const md = fs.readFileSync(page, 'utf8');
    for (const [tag] of md.matchAll(/<DocShot\b[^>]*>/g)) {
      used++;
      expect(Object.keys(manifest.shots), `${page}: ${tag}`).toContain(
        /\bname="([^"]*)"/.exec(tag)?.[1]
      );
      expect(/\balt="([^"]*)"/.exec(tag)?.[1]?.trim(), `${page}: ${tag}`).toBeTruthy();
    }
    for (const [tag] of md.matchAll(/<DocClip\b[^>]*>/g)) {
      used++;
      expect(Object.keys(manifest.clips), `${page}: ${tag}`).toContain(
        /\bname="([^"]*)"/.exec(tag)?.[1]
      );
      expect(/\blabel="([^"]*)"/.exec(tag)?.[1]?.trim(), `${page}: ${tag}`).toBeTruthy();
    }
  }
  expect(used).toBeGreaterThan(0);
});

it('reads WebP sizes and rejects other files', () => {
  const shot = manifest.shots['next-studio-open']!;
  expect(webpSize(fs.readFileSync(join(MEDIA, shot.file)))).toEqual({
    width: 1200,
    height: shot.height,
  });
  expect(() => webpSize(new TextEncoder().encode('RIFF....WEBX'))).toThrow('Not a WebP');
});
