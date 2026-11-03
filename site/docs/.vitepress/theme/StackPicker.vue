<script setup lang="ts">
// The docs front door's stack picker: one link card per getting-started path. The cards are plain
// <a href> links rendered at build time, so they work with JavaScript off.
defineProps<{ stacks: { title: string; text: string; href: string }[] }>();
</script>

<template>
  <ul class="stack-picker">
    <li v-for="stack in stacks" :key="stack.href">
      <a class="stack" :href="stack.href">
        <span class="stack-title">{{ stack.title }}</span>
        <span class="stack-text">{{ stack.text }}</span>
      </a>
    </li>
  </ul>
</template>

<style scoped>
.stack-picker {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 200px), 1fr));
  gap: 16px;
  margin: 24px 0;
  padding: 0;
  list-style: none;
}
.stack-picker li {
  margin: 0;
}
.vp-doc .stack {
  display: flex;
  flex-direction: column;
  gap: 8px;
  height: 100%;
  padding: 20px;
  border: 1px solid var(--rule);
  border-radius: 10px;
  background: var(--surface);
  text-decoration: none;
}
.vp-doc .stack:hover {
  border-color: var(--edge);
}
.stack-title {
  font-family: var(--font-display);
  font-size: 15px;
  line-height: 1.4;
  color: var(--hunk);
  text-decoration-line: underline;
  text-decoration-thickness: 1px;
  text-decoration-color: color-mix(in srgb, var(--hunk) 45%, transparent);
  text-underline-offset: 0.22em;
}
.vp-doc .stack:hover .stack-title {
  text-decoration-color: var(--hunk);
  text-decoration-thickness: 2px;
}
.stack-text {
  font-weight: 400;
  font-size: 14px;
  line-height: 1.6;
  color: var(--comment);
}
</style>
