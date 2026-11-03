// The 404 page's entry: the landing page's styles, and the address that was not found set into
// the removed line of its old/new pair.
import './styles/tokens.css';
import './styles/fonts.css';
import './styles/base.css';
import './styles/sections.css';

const missing = document.querySelector<HTMLElement>('[data-missing-path]');
if (missing) {
  try {
    missing.textContent = decodeURI(location.pathname);
  } catch {
    missing.textContent = location.pathname;
  }
}
