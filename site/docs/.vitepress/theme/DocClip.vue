<script setup lang="ts">
// A short muted docs clip from site/media/docs/ (made by site/scripts/record-docs.mjs). startClip
// attaches its sources when it nears the screen, plays it while half visible, keeps it on its
// poster under reduced motion and wires the pause button. An unknown name fails the build.
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { startClip } from '../../../src/lib/clip';
import type { ClipName } from '../../../scripts/docs/media.mjs';
import { MEDIA, mediaUrl } from './docs-media';

const props = defineProps<{ name: ClipName; label: string; caption?: string }>();

const clip = MEDIA.clips[props.name];
if (!clip)
  throw new Error(`DocClip: no clip named "${props.name}" in site/media/docs/manifest.json`);
if (!props.label.trim()) throw new Error(`DocClip "${props.name}" needs a non-empty label`);
const webm = mediaUrl(clip.webm);
const mp4 = mediaUrl(clip.mp4);
const poster = mediaUrl(clip.poster);

const figure = ref<HTMLElement | null>(null);
let stop = () => {};
onMounted(() => {
  if (figure.value) stop = startClip(figure.value, window);
});
onBeforeUnmount(() => stop());
</script>

<template>
  <figure ref="figure" class="doc-clip">
    <div class="doc-clip-frame">
      <video
        muted
        loop
        playsinline
        preload="none"
        :poster="poster"
        :width="clip.width"
        :height="clip.height"
        :aria-label="label"
      >
        <source :data-src="webm" type="video/webm" />
        <source :data-src="mp4" type="video/mp4" />
      </video>
      <button type="button" class="clip-toggle" aria-label="Play clip">
        <svg class="icon-play" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M8 5.5v13l11-6.5z" />
        </svg>
        <svg class="icon-pause" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" />
        </svg>
      </button>
    </div>
    <figcaption v-if="caption">{{ caption }}</figcaption>
  </figure>
</template>

<style scoped>
.doc-clip {
  margin: 24px 0;
}
.doc-clip-frame {
  position: relative;
}
.doc-clip video {
  display: block;
  width: 100%;
  height: auto;
  border: 1px solid var(--rule);
  border-radius: 10px;
  background: var(--surface);
}
.clip-toggle {
  position: absolute;
  inset-block-end: 12px;
  inset-inline-end: 12px;
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border: 1px solid var(--rule);
  border-radius: 8px;
  background: var(--night);
  color: var(--paper);
  cursor: pointer;
}
.clip-toggle:hover {
  border-color: var(--edge);
}
.clip-toggle svg {
  width: 20px;
  height: 20px;
  fill: currentColor;
}
.clip-toggle .icon-pause,
.clip-toggle[data-state='playing'] .icon-play {
  display: none;
}
.clip-toggle[data-state='playing'] .icon-pause {
  display: block;
}
.doc-clip figcaption {
  margin-top: 8px;
  color: var(--comment);
  font-size: 14px;
  line-height: 1.5;
}
</style>
