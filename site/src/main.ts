// The page shell's entry: brand styles first, then the section layout, then the island loaders.
// The pile opens the page, so it starts at once; every other island's code is fetched only when
// its container nears the viewport.
import './styles/tokens.css';
import './styles/fonts.css';
import './styles/base.css';
import './styles/sections.css';
import './pile/pile.css';
import { loadWhenNear } from './lib/islands';
import { startPile } from './pile/pile';

const slider = document.querySelector<HTMLElement>('[data-island="slider"]');
if (slider) loadWhenNear(slider, () => import('./slider/mount').then((m) => m.mountSlider(slider)));

const hero = document.querySelector<HTMLElement>('[data-island="hero"]');
if (hero) loadWhenNear(hero, () => import('./hero/mount').then((m) => m.mountHero(hero)));

const pile = document.getElementById('pile');
if (pile) startPile(pile, window);
