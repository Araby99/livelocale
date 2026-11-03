<script setup lang="ts">
// The docs header title: the landing header's mark and wordmark, linking back to the landing page.
// VitePress's VPNavBarTitle is aliased to this file in config.ts.
import { useData } from 'vitepress';

const { theme } = useData();

// The landing header's SVG byte for byte (tests/unit/site/header-mark.test.ts compares them).
// It is set with v-html so the browser parses the same text the landing page carries, whitespace
// included, and both pages serialise to the same outerHTML.
const MARK = `<svg
            viewBox="0 0 64 64"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
            focusable="false"
          >
            <g fill="#E8E4D9">
              <rect x="6" y="11" width="20" height="8" rx="4" />
              <rect x="29" y="11" width="29" height="8" rx="4" />
              <rect x="6" y="28" width="14" height="8" rx="4" />
              <rect x="25" y="31" width="29" height="2" rx="1" opacity=".5" />
              <rect x="6" y="45" width="23" height="8" rx="4" />
              <rect x="32" y="45" width="12" height="8" rx="4" />
            </g>
            <g transform="rotate(-7 39 32)">
              <rect x="24.5" y="24.5" width="30" height="15" rx="4.5" fill="#8A5600" />
              <rect x="23" y="23" width="30" height="15" rx="4.5" fill="#FFB224" />
            </g>
          </svg>`;
</script>

<template>
  <div class="VPNavBarTitle">
    <!-- target="_self" keeps the docs router from handling a page outside the docs base. -->
    <a class="brand" :href="theme.logoLink" target="_self" aria-label="livelocale home">
      <span class="mark" v-html="MARK" />
      <span class="brand-name">livelocale</span>
    </a>
  </div>
</template>

<style scoped>
.VPNavBarTitle {
  display: flex;
  align-items: center;
  height: var(--vp-nav-height);
}

.brand {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  color: var(--paper);
  text-decoration: none;
}

.mark {
  display: contents;
}

.brand :deep(svg) {
  display: block;
  width: 30px;
  height: 30px;
  flex: none;
}

.brand-name {
  font-family: var(--font-display);
  font-size: 1.25rem;
  font-weight: 500;
  letter-spacing: -0.02em;
  line-height: 1;
}
</style>
