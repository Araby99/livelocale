import { createRoot } from 'react-dom/client';
import { LanguageSlider } from './LanguageSlider';
import './slider.css';

/** Replaces the slider's static markup with the live island (React clears the container). */
export function mountSlider(root: HTMLElement): void {
  createRoot(root).render(<LanguageSlider />);
}
