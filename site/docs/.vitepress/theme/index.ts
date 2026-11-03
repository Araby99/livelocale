// The docs theme: VitePress's default theme without its bundled Inter, dressed in the landing
// page's fonts and hunk tokens (docs.css maps VitePress's variables onto them).
import DefaultTheme from 'vitepress/theme-without-fonts';
import '../../../src/styles/fonts.css';
import '../../../src/styles/tokens.css';
import './docs.css';

export default DefaultTheme;
