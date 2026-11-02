// The page shell's entry: brand styles first, then the section layout, then the island loaders.
// Each island's code is fetched only when its container nears the viewport.
import './styles/tokens.css';
import './styles/fonts.css';
import './styles/base.css';
import './styles/sections.css';
import { loadWhenNear } from './lib/islands';

const slider = document.querySelector<HTMLElement>('[data-island="slider"]');
if (slider) loadWhenNear(slider, () => import('./slider/mount').then((m) => m.mountSlider(slider)));
