// The docs' screenshots and clips: what each one shows, which app record-docs.mjs films it on, and
// the provenance line every raster carries. record-docs.mjs writes the files and
// site/media/docs/manifest.json; DocShot.vue and DocClip.vue read the manifest.

/** The ports record-docs.mjs runs the dev apps and the Studio on, unless its environment moves them. */
export const DEFAULT_PORTS = { next: 3100, vite: 5180, astro: 4380, studio: 3110 };

/** The app each capture films, as its provenance names it, on the ports it was filmed on. */
const apps = (ports) => ({
  next: `the real dev Studio (\`livelocale studio\`, port ${ports.studio}) editing the Next.js playground (playground/, \`next dev -p ${ports.next}\`)`,
  vite: `the real dev Studio (\`livelocale studio\`, port ${ports.studio}) editing the Vite + React playground (playground-vite/, \`vite --port ${ports.vite}\` with \`liveLocaleVite\`)`,
  astro: `the real dev Studio (\`livelocale studio\`, port ${ports.studio}) editing the Astro playground (playground-astro/, \`astro dev --port ${ports.astro}\` with the \`livelocale/astro\` integration, no React)`,
  share:
    'the real share Studio that `livelocale pack` writes into the fictional Tidewell stage site (site/stage, packed with --expose-repo and served as tidewell.example)',
});

/**
 * The screenshots, by name: the app, the browser locale (en-US unless set), the
 * colour scheme (`light`, else dark), the device (`phone`, else a desktop) and the step it shows.
 */
export const SHOTS = {
  'next-studio-open': {
    app: 'next',
    use: 'the Studio open beside the running Next.js app: the Texts list, the live preview and the editor waiting for a pick',
  },
  'next-alt-click': {
    app: 'next',
    use: 'the welcome line Alt+Clicked in the Next.js preview, the editor open on home.welcome_msg with the fix typed',
  },
  'next-saved-file': {
    app: 'next',
    use: 'after Save: the preview shows the new line, Changes lists playground/locales/en.json as modified with its git diff',
  },
  'vite-studio-open': {
    app: 'vite',
    use: 'the Studio open beside the running Vite app: the Texts list, the live preview and the editor waiting for a pick',
  },
  'vite-alt-click': {
    app: 'vite',
    use: 'the headline Alt+Clicked in the Vite preview, the editor open on home.title with the fix typed',
  },
  'vite-saved-file': {
    app: 'vite',
    use: 'after Save: the preview shows the new headline, Changes lists playground-vite/locales/en.json as modified with its git diff',
  },
  'astro-studio-open': {
    app: 'astro',
    use: 'the Studio open beside the running Astro site: the Texts list, the live preview and the editor waiting for a pick',
  },
  'astro-alt-click': {
    app: 'astro',
    use: 'the headline Alt+Clicked in the Astro preview, the editor open on home.title with the fix typed',
  },
  'astro-saved-file': {
    app: 'astro',
    use: 'after Save: the preview shows the new headline, Changes lists playground-astro/locales/en/home.json as modified with its git diff',
  },
  'share-open-link': {
    app: 'share',
    use: 'a share link opened: the Studio over the Tidewell site, with the first-run tips and the name field',
  },
  'share-alt-click': {
    app: 'share',
    use: 'the Tidewell headline Alt+Clicked, the editor open on hero.title with the typo fixed',
  },
  'share-send-dialog': {
    app: 'share',
    use: 'the Send to developer dialog: the name, the change and the change link, with Open on GitHub',
  },
  'share-review-mode': {
    app: 'share',
    use: 'a change link opened in the Studio: review mode shows the fix on the page and lists each change with its check, Create pull request and the apply command',
  },
  'studio-plural': {
    app: 'next',
    use: 'the plural editor on cart.items: one field per plural form (one, other) under the ICU message',
  },
  'studio-placeholder-warning': {
    app: 'next',
    use: 'home.greeting saved without its {name} placeholder: the editor warns, with Save anyway and Keep editing',
  },
  'studio-rtl-site': {
    app: 'share',
    use: 'the English Studio on the Tidewell site with the Language menu set to Arabic: the site flips right to left under the Studio, the editor open on the Alt+Clicked headline',
  },
  'studio-light': {
    app: 'share',
    theme: 'light',
    use: 'the Studio in its light theme over the Tidewell site, the headline fix typed in the editor',
  },
  'studio-missing': {
    app: 'next',
    use: 'the Language menu set to ar: the Texts list marks the keys ar.json lacks as Missing, and the editor is open on home.greeting with no Arabic text yet',
  },
  'studio-keyboard': {
    app: 'share',
    use: 'a key found and picked from the Texts list with the keyboard (type, Tab, Enter): the editor open on hero.cta, the focus in its field',
  },
  'studio-phone': {
    app: 'share',
    device: 'phone',
    use: 'a share link on a phone: the Tidewell headline tapped in Edit, the editor sheet open over the page with the typo fixed',
  },
};

/** The clips, by name: the app, the longest they may run (seconds) and what they show. */
export const CLIPS = {
  'alt-click-edit': {
    app: 'share',
    seconds: 6,
    use: 'Alt+Click the Tidewell headline, fix the typo and save it',
  },
  'send-link': {
    app: 'share',
    seconds: 6,
    use: 'open Send to developer and get the change link for the fix',
  },
  'rtl-site': {
    app: 'share',
    seconds: 6,
    use: 'pick Arabic in the Language menu: the Tidewell site flips right to left under the Studio, which stays in English',
  },
};

/**
 * The provenance sidecar of one raster: `name` is the shot or clip it belongs to (its app is
 * named, with the `ports` it ran on), `what` says what the file is and what it shows.
 */
export function provenance(name, what, ports = DEFAULT_PORTS) {
  const entry = SHOTS[name] ?? CLIPS[name];
  const app = entry ? apps(ports)[entry.app] : 'the real livelocale Studio';
  return {
    prompt: `SOURCED, not generated. Captured by site/scripts/record-docs.mjs in headless Chromium from ${app}. Nothing is drawn, mocked or overlaid; everything on screen is the product. ${what}`,
    createdAt: new Date().toISOString(),
  };
}
