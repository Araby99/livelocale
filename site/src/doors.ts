// The two-door switch: native radios (arrow keys come free), the chosen door kept in the hash so
// each story is linkable. The head script already picked the door from the hash before paint; this
// keeps the radios, the hash and <html data-door> in step afterwards.

/** Long enough for the last step's entrance (see sections.css) to finish. */
const ENTER_MS = 1100;

export type Door = 'developer' | 'fixer';

/** The door a hash names; anything else is the developer's. */
export function doorFromHash(hash: string): Door {
  return hash === '#fixer' ? 'fixer' : 'developer';
}

export function startDoors(doc: Document = document): void {
  const radios = [...doc.querySelectorAll<HTMLInputElement>('input[name="door"]')];
  if (radios.length === 0) return;
  const html = doc.documentElement;
  let entering: ReturnType<typeof setTimeout> | undefined;

  const show = (door: Door, animate: boolean) => {
    const before = html.dataset.door;
    html.dataset.door = door;
    for (const r of radios) r.checked = r.value === door;
    const story = doc.getElementById(door);
    if (!animate || before === door || !story) return;
    story.classList.remove('is-entering');
    void story.offsetWidth; // restart the entrance when the visitor switches back and forth
    story.classList.add('is-entering');
    clearTimeout(entering);
    entering = setTimeout(() => story.classList.remove('is-entering'), ENTER_MS);
  };

  show(doorFromHash(location.hash), false);

  for (const r of radios) {
    r.addEventListener('change', () => {
      if (!r.checked) return;
      const door = doorFromHash(`#${r.value}`);
      show(door, true);
      // replaceState, not location.hash: the switch must not jump the page to the story.
      history.replaceState(null, '', `#${door}`);
    });
  }
  window.addEventListener('hashchange', () => show(doorFromHash(location.hash), true));
}
