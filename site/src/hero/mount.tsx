import { createRoot } from 'react-dom/client';
import { HeroIsland } from './HeroIsland';
import './hero.css';

/**
 * Replaces the hero's static markup with the live island. The shell's html.js rules already show
 * the same start state, so the h1 and the layout do not change when React takes over.
 */
export function mountHero(root: HTMLElement): void {
  createRoot(root).render(<HeroIsland base={import.meta.env.BASE_URL} />);
}
