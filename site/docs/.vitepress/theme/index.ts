// The docs theme: VitePress's default theme without its bundled Inter, dressed in the landing
// page's fonts and hunk tokens (docs.css maps VitePress's variables onto them), with the docs-only
// media blocks DocShot and DocClip registered for every page. terminal.css colours the `cli`
// blocks (cli-fence.ts) as the landing page colours its CI excerpt.
import type { Theme } from 'vitepress';
import DefaultTheme from 'vitepress/theme-without-fonts';
import DocClip from './DocClip.vue';
import DocShot from './DocShot.vue';
import '../../../src/styles/fonts.css';
import '../../../src/styles/tokens.css';
import '../../../src/styles/terminal.css';
import './docs.css';

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component('DocShot', DocShot);
    app.component('DocClip', DocClip);
  },
} satisfies Theme;
