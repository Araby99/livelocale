<script setup lang="ts">
// A docs screenshot from site/media/docs/ (made by site/scripts/record-docs.mjs from the real
// Studio). An unknown name or an empty alt fails the build.
import { MEDIA, mediaUrl } from './docs-media';

const props = defineProps<{ name: string; alt: string; caption?: string }>();

const shot = MEDIA.shots[props.name];
if (!shot)
  throw new Error(`DocShot: no shot named "${props.name}" in site/media/docs/manifest.json`);
if (!props.alt.trim()) throw new Error(`DocShot "${props.name}" needs a non-empty alt`);
const src = mediaUrl(shot.file);
</script>

<template>
  <figure class="doc-shot">
    <img
      :src="src"
      :width="shot.width"
      :height="shot.height"
      :alt="alt"
      loading="lazy"
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
.doc-shot figcaption {
  margin-top: 8px;
  color: var(--comment);
  font-size: 14px;
  line-height: 1.5;
}
</style>
