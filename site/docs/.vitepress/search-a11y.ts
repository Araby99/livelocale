// VitePress 1.6.4's local search, made to pass WCAG 2.2 AA (tests/site/a11y.spec.ts). Its markup
// is patched as the theme's .vue source loads, so the component, its script and its styles stay
// VitePress's own. A patch that no longer finds its text (a VitePress upgrade) fails the build.
import type { UserConfig } from 'vitepress';

// VitePress's own (nested) Vite plugin type, not the landing build's Vite 8.
type VitePlugin = NonNullable<NonNullable<UserConfig['vite']>['plugins']>[number];

/** Replace every `find` with `replace`; the source must hold exactly `count` (default 1). */
type Patch = [find: string, replace: string, count?: number];

const PATCHES: Record<string, Patch[]> = {
  // The button's aria-label "Search" left out its visible shortcut keys (label in name, 2.5.3).
  // Its name now comes from its text, "Search"; the keys are a hint for sighted keyboard users,
  // so they leave the accessible tree. Below 768px the text is hidden visually only (docs.css).
  'VPNavBarSearchButton.vue': [
    [
      `<button type="button" class="DocSearch DocSearch-Button" :aria-label="translate('button.buttonAriaLabel')">`,
      '<button type="button" class="DocSearch DocSearch-Button">',
    ],
    [
      '<span class="DocSearch-Button-Keys">',
      '<span class="DocSearch-Button-Keys" aria-hidden="true">',
    ],
  ],
  'VPLocalSearchBox.vue': [
    // The modal was a role="button" holding the input and the result links (nested
    // interactive, 4.1.2): it is a modal dialog named like the search button.
    [
      `      role="button"
      :aria-owns="results?.length ? 'localsearch-list' : undefined"
      aria-expanded="true"
      aria-haspopup="listbox"
      aria-labelledby="localsearch-label"
      class="VPLocalSearchBox"`,
      `      role="dialog"
      aria-modal="true"
      :aria-label="buttonText"
      class="VPLocalSearchBox"`,
    ],
    // Each option held a link (nested interactive): the link is the option, and the input's
    // aria-activedescendant points at it. Its name comes from the titles it shows, not from an
    // aria-label that leaves out the visible text (label in name, 2.5.3).
    [
      `            :id="'localsearch-item-' + index"
            :aria-selected="selectedIndex === index ? 'true' : 'false'"
            role="option"
          >`,
      `            role="none"
          >`,
    ],
    [
      `              :aria-label="[...p.titles, p.title].join(' > ')"`,
      `              :id="'localsearch-item-' + index"
              role="option"
              :aria-selected="selectedIndex === index ? 'true' : 'false'"`,
    ],
    // aria-label is not allowed on a <kbd> (it has no role): each key is an image of a key,
    // named by its label.
    ['<kbd :aria-label=', '<kbd role="img" :aria-label=', 4],
  ],
};

/** Applies the file's patches to `source`; throws when one does not match as often as expected. */
export function patchSearch(file: string, source: string): string {
  const src = source.replace(/\r\n/g, '\n');
  return PATCHES[file]!.reduce((out, [find, replace, count = 1]) => {
    const parts = out.split(find);
    if (parts.length - 1 !== count)
      throw new Error(`search-a11y: ${file} no longer matches ${JSON.stringify(find)} ${count}x`);
    return parts.join(replace);
  }, src);
}

/** The Vite plugin: patches VitePress's search components before the Vue compiler reads them. */
export function searchA11y(): VitePlugin {
  return {
    name: 'livelocale:search-a11y',
    enforce: 'pre',
    transform(code: string, id: string) {
      if (id.includes('?')) return null;
      const file = id.replace(/\\/g, '/').split('/').pop()!;
      if (!(file in PATCHES) || !id.includes('vitepress')) return null;
      return { code: patchSearch(file, code), map: null };
    },
  };
}
