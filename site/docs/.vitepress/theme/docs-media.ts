// The docs media DocShot.vue and DocClip.vue render: the manifest record-docs.mjs writes (sizes)
// and one glob over site/media/docs/, so Vite hashes every file under <base>docs/assets/.
import type { DocsMedia } from '../../../scripts/docs/media.mjs';
import manifest from '../../../media/docs/manifest.json';

const FILES = import.meta.glob<string>('../../../media/docs/*.{webp,webm,mp4}', {
  eager: true,
  query: '?url',
  import: 'default',
});

export const MEDIA: DocsMedia = manifest;

/** The built URL of one file in site/media/docs/; throws at build when it is not there. */
export function mediaUrl(file: string): string {
  const url = FILES[`../../../media/docs/${file}`];
  if (!url)
    throw new Error(`site/media/docs/${file} is missing: run node site/scripts/record-docs.mjs`);
  return url;
}
