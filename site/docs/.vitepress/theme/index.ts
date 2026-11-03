// The docs theme: VitePress's default theme without its bundled Inter, dressed in the landing
// page's fonts and hunk tokens (docs.css maps VitePress's variables onto them), with the docs-only
// media blocks DocShot and DocClip registered for every page.
import type { Theme } from 'vitepress';
import DefaultTheme from 'vitepress/theme-without-fonts';
import DocClip from './DocClip.vue';
import DocShot from './DocShot.vue';
import '../../../src/styles/fonts.css';
import '../../../src/styles/tokens.css';
import './docs.css';

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component('DocShot', DocShot);
    app.component('DocClip', DocClip);
  },
} satisfies Theme;
