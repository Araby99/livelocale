<script setup lang="ts">
// A docs screenshot from site/media/docs/ (made by site/scripts/record-docs.mjs from the real
// Studio). An unknown name or an empty alt fails the build. `lead` marks the shot that opens a
// page, in the first screen: it loads at once instead of lazily. A portrait shot (a phone) shows
// at phone size instead of the column's full width.
import type { ShotName } from '../../../scripts/docs/media.mjs';
import { MEDIA, mediaUrl } from './docs-media';

const props = defineProps<{ name: ShotName; alt: string; caption?: string; lead?: boolean }>();

const shot = MEDIA.shots[props.name];
if (!shot)
  throw new Error(`DocShot: no shot named "${props.name}" in site/media/docs/manifest.json`);
if (!props.alt.trim()) throw new Error(`DocShot "${props.name}" needs a non-empty alt`);
const src = mediaUrl(shot.file);
const portrait = shot.height > shot.width;
</script>

<template>
  <figure
    class="doc-shot"
    :data-lead="lead ? '' : undefined"
    :data-portrait="portrait ? '' : undefined"
  >
    <img
      :src="src"
      :width="shot.width"
      :height="shot.height"
      :alt="alt"
      :loading="lead ? 'eager' : 'lazy'"
      :fetchpriority="lead ? 'high' : undefined"
      decoding="async"
    />
    <figcaption v-if="caption">{{ caption }}</figcaption>
  </figure>
</template>

<style scoped>
.doc-shot {
  margin: 24px 0;
}
.doc-shot img {
  display: block;
  width: 100%;
  height: auto;
  border: 1px solid var(--rule);
  border-radius: 10px;
}
.doc-shot[data-portrait] img {
  max-width: 320px;
  margin: 0 auto;
}
.doc-shot[data-portrait] figcaption {
  text-align: center;
}
.doc-shot figcaption {
  margin-top: 8px;
  color: var(--comment);
  font-size: 14px;
  line-height: 1.5;
}
</style>
