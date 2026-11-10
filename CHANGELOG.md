# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.3.0] - 2026-11-10

1.3.0 makes the Studio work for the person who just wants to fix text, and fixes what a whole-team review of 1.2.0 found. The desktop Studio uses plain words, opens a missing translation with an empty field, lists what a language still lacks, never loses typed text without asking, and previews plurals and placeholders as the page will show them. Saves no longer damage locale files, react-i18next plurals, contexts and namespaces edit the key i18next really used, a new `livelocale/wrap` entry works in Server Components, and `init`, `doctor` and `check` read Vite, next-intl and real-world locale folders correctly. Nothing documented changed incompatibly.

### Minor Changes

- **Added**
  - `init` and `doctor` now know a Vite app from a Next.js one.

    - `init` in a Vite app writes nothing and prints the plugin and provider steps, the way it already did for Astro. Before, it wrote a Next.js API route that broke `tsc -b` builds. In a folder with no Next.js, Vite or Astro app, `init` writes nothing, says what it looked for, and exits 2.
    - `init` no longer replaces a route file you changed. It says the file differs and leaves it alone; pass `--overwrite` (now accepted without `--share`) to replace it. A route file that differs only in line endings (git on Windows) counts as up to date.
    - `doctor` on a Vite app checks the `livelocale/vite` plugin in `vite.config` and the provider or `startLiveLocale()` in your entry file, instead of failing on missing Next.js files, and suggests port 5173 for live checks.
    - `doctor` on a next-intl app finds the provider in `app/[locale]/layout.tsx` (or a route group's layout), accepts a middleware matcher that already leaves out all of `/api`, and no longer prints a full replacement matcher that would break next-intl's routing.

  - New `livelocale/wrap` entry with `wrapTranslationEngine` and `wrapNextIntl`. It works in a Server Component, a Client Component and a shared component with no directive, which no import path did before: `livelocale/client` failed in a Server Component and `livelocale/server` failed in a client bundle. It also keeps the in-page client out of a production bundle: about 6.7 KB (2.7 KB gzip) instead of about 33 KB (11 KB gzip) from `livelocale/client`. The old import paths keep working.

    `LiveLocaleProvider` from `livelocale/react` now really loads the in-page client lazily. The published build had it inlined, so every production page downloaded about 35 KB (11.7 KB gzip) it never ran; now a page downloads about 2.8 KB (1.2 KB gzip) and the client loads only when LiveLocale is on.

    TypeScript projects that compile to CommonJS with `module: node16` can now import every entry: `require` now points at the CommonJS type declarations, so TypeScript no longer stops with TS1479.

### Patch Changes

- **Fixed**
  - `apply` (and the GitHub Action that runs it) refuses an edit whose key overlaps an earlier edit in the same language, such as `promo` and `promo.banner`, before writing anything. Before, a crafted or old change link like that could leave a locale file half-applied.
  - `apply` now says why. Each edit it did not apply shows its reason, such as "Placeholders differ from the reference: missing {name}" or "Changed on the target since the link was made", and an edit that needs `--force` says so. An applied edit shows its warnings (for example, a new web address), followed by a reminder to review them with `git diff`. `--dry-run` starts with "Dry run: nothing was written." and lists "would apply" lines. When a locale file cannot be written (read-only or locked), the other files are still written and the summary lists what was written and what failed. With `--source`, the note about the link's source locale no longer tells you to pass `--source`.
  - `check` no longer fails correct translations, and catches one it missed:

    - A locale file that starts with a byte-order mark (common for files saved on Windows) is read normally by `check`, `doctor` and the key scanner, instead of being reported as invalid JSON.
    - A file whose content is a list, `null` or a plain string is reported once as an invalid file, the way `doctor` reports it, instead of as a list of missing keys. A file that cannot be read no longer adds a "missing key" line for every key in it.
    - ICU plurals with an offset, such as `{n, plural, offset:1 ...}`, are no longer reported as broken syntax.
    - An i18next `_zero`, `_one` or `_two` form may write the number as a word (Arabic "عنصر واحد") without `{{count}}`, and a translation may keep `{{count}}` where the source writes the word; neither is a placeholder problem any more.
    - An i18next plural that has other forms but no `_other` form is now a warning (a problem with `--strict`): without it, most counts show the key or the fallback language.
    - A key used only through react-i18next's `<Trans i18nKey="...">` is no longer reported as unused.

  - `livelocale <command> --help` (or `livelocale help <command>`) now prints only that command's usage, options and exit codes, instead of the help for every command.
  - `check`, `doctor`, `apply`, `init`, `pack` and `build` now find the locales folder on their own when `--locales` is not given. They try `locales`, `messages` (the next-intl convention), `src/locales`, `public/locales`, `src/i18n/locales` and `src/messages`, and say which folder they picked. When none has locale files, the error lists the folders they looked in. Before, a stock next-intl project failed its first `check` with "Locales directory not found".
  - Preview editing through GitHub keeps working after the review pull request is merged and GitHub deletes its branch. The server used to remember that the branch existed, so every later save failed and the Studio showed no languages until the server restarted. It now creates the branch again from the base branch and carries on. When several requests, or several servers, find the branch missing at the same time, it is created once and none of them fails.
  - A locale file saved by a Windows editor now loads and saves like any other. A file that starts with a byte-order mark (BOM) used to fail with "not valid JSON" in the Studio, on save, in the share-link build and in the page's fallback text for Vite and Astro; it now loads, and a save keeps the mark. A save also keeps Windows line endings (CRLF) instead of rewriting every line, both on disk and on a GitHub branch. When a locale file is broken, the error now says it is not valid JSON instead of wrongly saying its root must be an object. Keys that look like numbers, such as `"404"`, still move to the front in ascending order on the first save: that is how JavaScript orders object keys.
  - Locale files named with an underscore or three parts, such as `pt_BR.json`, `en_US/` or `zh-Hant-TW.json`, are now read by `check`, `doctor`, `apply` and the save API. Before, they were skipped without a word, so `check` could pass in CI without ever reading them. In `check`, `doctor`, `apply`, the save API and the Studio, keys may now use letters from any language and single spaces between words, such as `home.überschrift` or i18next's `Hello world`. A JSON file or folder in the locales folder whose name is still not a locale code is now listed by `check` (a warning, a problem with `--strict`) and by `doctor`, instead of being ignored silently.
  - On a Next.js Pages Router app, saving from the Studio no longer spins forever. Next reads the request body before the `livelocale` route runs, so the route waited for a body that never came. It now uses the body Next already read, and still refuses a body over the size limit.
  - The live preview no longer shows a message's raw syntax while you type. Editing `{count, plural, one {# seat} other {# seats}}` or `© {year} Acme` used to put that text on the page as written; the page now shows it filled with the values it already showed, such as "5 seats" or "© 2026 Acme", with the plural form chosen for the page's language. A value the page does not show stays as written, such as `{name}`.
  - `LIVELOCALE=preview` (or `NEXT_PUBLIC_LIVELOCALE=preview`) no longer turns LiveLocale on when the hosting platform says the deploy is production: Vercel (`VERCEL_ENV=production`), Netlify (`CONTEXT=production`) and Railway (environment `production`). Set for every environment by mistake, it would have put invisible watermark characters into every string of the live site. LiveLocale stays off there and prints one warning. The warning and the reason name the setting that asked for preview, so you know which one to change. Preview and branch deploys work as before.
  - The Checks column of `apply` and the review page now flags more ways an edit can sneak in a script or a link when a project renders translations as HTML: an attribute added to a tag the source already has (such as `onmouseover` or `style`), also when it follows a quoted value that holds `<` or `>`; a changed `href`, `src` or `srcdoc`; an address that starts with `//`; and a `javascript:` link hidden with HTML character codes or tabs. A new address on its own line is flagged too. The same tag with the same link, written with other quotes or attribute order, and translated `title` or `alt` text are not flagged.
  - Saving from the Studio in development or preview no longer damages locale files. A save that would replace a list, a group of translations or a key written with dots in its name (such as `"home.title"`) is now refused with a 409 and a plain message, and the file stays as it was; before, the save answered 200 and overwrote the data. In a project with one folder per language, a key whose namespace file (for example `nav.json`) exists in no language is refused too, with a message that names the file and the fix, instead of quietly creating a file the app never loads. A key that names a whole namespace file now answers 400 instead of 500. A key whose text is `null`, as some export tools write for an untranslated text, can still be saved, in the Studio and through a share link.
  - The Edit / Browse switch now shows on computers too, for anyone who cannot or prefers not to use Alt+Click. In Edit, a plain click on any text opens it; in Browse, the site works as usual and Alt+Click still picks text. A share link starts in Edit. Your own Studio, with the app running locally, starts in Browse. The switch works with the keyboard.
  - On a share link, the empty "Your changes" list now says to click any text when Edit is on, and to tap any text on a phone, instead of always naming the Alt key.
  - With your app running locally, the Studio now follows the language your site shows. When the site switches language its own way (for example `?lng=ar`, a cookie, or i18next), the Studio edits that language, so clicking Arabic text no longer opens the English text. A language you pick in the editor's menu is kept: the Studio then only points out text that looks like another language, with a button to switch.
  - Text you typed but did not save is no longer lost without a warning. Switching the language in the editor, or pressing "Switch to …" in the header, now asks first, as picking another text already did. Reloading or closing the Studio tab while the field holds unsaved text makes the browser ask before it leaves.
  - The Studio names every language your browser knows, such as Dutch, Korean, Polish or Hebrew, instead of "Custom". When the source and the edited language share a name, the editor adds the code, as in "English (en)" above "English (en-GB)".
  - The Studio is easier to read. No text is smaller than 12px, the values you read and edit are 14px, and every text field has a border you can see in light and dark themes. Animations stop when your system asks for reduced motion, the site preview has a name for screen readers, and the phone's sheets have a Close button. In Edit mode on a phone, the outlines around tappable text and around the text you picked are two-toned, so they show on light and dark sites alike.
  - The Studio on a computer now helps you finish a language. The text list has a third choice, "Missing", with a count: it lists every text the language you edit still lacks, on every page. Clicking the Coverage meter in the header opens that list. The editor has a "Next missing" button beside Save: it goes to the next untranslated text on the page, then to the rest of the list, and says when every text is translated.
  - The Studio's desktop editor now uses the same plain words as the phone. The key list is "Texts", with "All texts" and "On this page"; the editor names the languages ("English" above, "Arabic" for your field) and shows the key as a small "Text ID". When nothing is picked, it says to hold Alt (Option on Mac) and click any text. Counts read "1 text" and "1 edit". The version chip no longer says BETA, a share link's Changes panel no longer shows a git branch, and the phone's language menu lists names, not only codes.

    Deleting a language now names it in the confirmation, and the source language has no delete button. The Send dialog says what to do with the link and what happens after you copy it, and on a share link the editor says that Save keeps the change in this browser until you press Send to developer.

  - A missing translation of a plural text now opens the plural forms editor, with one empty field for each form the language needs (six for Arabic), instead of an empty box that needed ICU syntax. Cases such as `=0` or the choices of a `select` message from the source text are offered too. "Edit raw" still switches to plain text.
  - A missing translation of a plural text such as "You have {n, plural, ...} in your cart" no longer starts with the English words "You have" and "in your cart" in its Before and After fields. Those fields start empty, like the plural forms, so no English is saved into your translation unnoticed. The source text stays in view above the editor.
  - On windows narrower than 1280px, the editor now opens on the left when the language you edit is written right to left (Arabic, Hebrew, Persian, Urdu, …). Those lines start on the right, so the text you are fixing stays in view while you type.
  - Studio fixes:

    - Picking another text and choosing Discard now also takes the discarded text off the page. Before, it stayed there until the selection was cleared.
    - When the Studio finds why your site does not open, the spinner and "Connecting to your site" give way to "Your site did not open here" above what it found.
    - Share links have a "How it works" button (in the phone menu too) that shows the first-visit tips again.
    - The texts in the Review table are 14px, like the editor's.

  - The built Studio now ships `THIRD-PARTY-NOTICES.txt` beside it, with the licence of every open source package compiled into it (React, react-dom, scheduler, Tailwind CSS and tw-animate-css). Minifying had stripped their copyright notices, which their MIT licences ask to keep with every copy. `pack` and `build` copy the file into your share folder with the rest of the Studio.
  - Translating a text that is still missing is simpler in the Studio. The field starts empty, with the source text shown above it, and Save turns on as soon as you type. Clicking such a text no longer suggests switching to the source language. Plural forms show which numbers each form is for in the language you edit (Arabic "few" is 3–10, 103–110, …). When a save fails, the message says in plain words whether your site could not be reached or answered with an error, and that your text is still there; a message the server gives is shown as it is.
  - In the Changes panel, an edit that added a translation the language did not have yet now says "not translated" as its old value. Its Undo button says what undo does: it leaves an empty text in the file, so the page shows nothing there until the developer removes it. On a preview build, a new translation is shown again correctly after a reload.
  - Alt+Click on text that is not connected to a translation (text written straight into the code, or content from a CMS) now shows a short note: "This text is not connected to a translation, so it cannot be edited here. Ask your developer." Before, nothing happened. Alt+Click no longer reaches the site either, so Chrome does not download a link you Alt+Click.
  - The Studio no longer moves you to the source language because a page shows untranslated text. When your Arabic file lacks some texts, the site shows the English ones in their place; the Studio now knows those texts can belong to the Arabic page too. So `/ar` or `?locale=ar` with only a few Arabic texts stays on Arabic, and clicking an untranslated text opens it in Arabic, ready to translate, instead of opening (and overwriting) the English text. While you have typed text that is not saved yet, the page never changes the language you edit: the Studio points out the other language instead, and switching asks first.
  - TypeScript 7, the default in a new create-vite app, has no JavaScript compiler API. `migrate` now says so in one line and exits 2 before touching any file, instead of failing on every file and asking you to fix them. `migrate` and `check --hardcoded` both name the fix: install TypeScript 5 or 6 as a dev dependency (`npm install -D typescript@5`). `migrate` now also uses the TypeScript your project has, like `check --hardcoded` does.
  - Edits now save to the key the text really came from. With react-i18next, a plural (`t('items', { count: 2 })` saves to `items_other`, and to the page language's plural form when the text came from the fallback language), a context, a per-call namespace (`{ ns: 'home' }` or `'home:title'`), a fallback key list and i18next's own `keyPrefix` used to save to a key nothing reads while the Studio said "Saved!". With next-intl, `t.raw('key')` and `t.markup('key')` no longer put `raw` or `markup` into the saved key.

## [1.2.0] - 2026-11-09

1.2.0 fixes what moving a real Astro site onto 1.1.0 turned up: text that does not start its text node can be picked, rich text previews as markup, `check` understands a `t` that holds one namespace, and a new `livelocale/strip` entry keeps `unwrap` out of the client bundle. Nothing documented changed incompatibly.

### Minor Changes

- **Added**
  - New `livelocale/strip` entry: `unwrap`, `sanitizeZeroWidth` and `removeWatermarks`, with no side effects. Importing `unwrap` from `livelocale/client` in browser code (a React island, a Vite app) pulled the whole in-page client into the production bundle, about 23 KB with the mode and hosting-platform checks, because that entry starts the client when it is imported. From `livelocale/strip` the same import adds about 1.4 KB. The package now lists the files that have side effects in `sideEffects`; every other entry behaves as before, and `livelocale/client` and `livelocale/server` still export these helpers.
  - `createTranslations` takes a `namespace` option that returns one namespace instead of the whole locale: `createTranslations(locale, { namespace: 'home', plain: true })` gives the object of `home.json`, filled from the fallback locale, with watermarks that still carry the full key path (`home.hero.title`). `livelocale check` reads `t.hero.title` on it as `home.hero.title`.
  - `liveLocaleVite` and the Astro integration take a `fallbackNamespaces` option. The default, `'all'`, still puts every locale's strings into every dev page. A list puts in only the namespaces whose keys the page's HTML shows, plus the ones listed, which cuts a 115 KB dictionary to 6–14 KB per page on a 29-namespace Astro site. Only `wrapTranslationEngine` reads in the browser use these strings, so list a namespace that only client-side code reads; a read of a namespace left out warns in the browser console instead of going blank without a word.

### Patch Changes

- **Fixed**
  - Text whose node did not start with the watermark could not be Alt+Clicked. Astro keeps template whitespace and literal text in the same text node as a translation, so a headline written on its own line (`<h1>\n  {t.hero.title}`), a breadcrumb (`<a>Home</a> / {t.crumb}`) and a footer (`© 2026 {t.copyright}`) were never keyed. The client now finds the first watermark anywhere in a node. The live preview, the text sent with a pick, the visible texts used for locale detection and the key jump all use only the text that watermark marks, so the literal `© 2026 ` or `/` stays on the page while you type, and a later translation in the same node is never touched.
  - The live preview garbled rich-text values rendered as HTML (Astro `set:html`, React `dangerouslySetInnerHTML`): `<strong>` showed as literal text and the old text after it stayed on the page. A value with markup now previews as markup in that element, parsed in an inert template and limited to inline tags (`strong`, `em`, `b`, `i`, `a` with a safe `href`, `br`, `span`, `code`, `small` and a few more) without scripts, styles or event handlers. Clearing the selection puts the original nodes back exactly. A value stored as plain text still previews as text, and nodes React or Vue render themselves (next-intl `t.rich`) are never taken out of the page.
  - The editor started from the page text when the edited locale lacked the key (the page showed the reference locale's fallback), which has no tags, so saving dropped the markup. It now starts from the reference value when that is what the page shows, even when the element also holds page decoration such as a cursor `<span>_</span>` or an arrow.
  - `?app=` with a path (`?app=http://localhost:4321/ar/`) opened the app's root. The Studio now opens that page; only the origin is trusted, as before. `livelocale studio --app` with a path does the same.
  - `livelocale check` understands a `t` that holds one namespace, as `createTranslations(locale, { plain: true })[ns]` or a helper around it gives. In a folder layout, `t.hero.title` is read as `home.hero.title`: in the namespace the file names (`i18n(Astro, 'home')`) when that namespace has `hero`, else in every namespace that has the key. Islands that get `t` or part of it as a prop, `const { t: common } = …` and `const t = common.footer` are read too. Property reads are also more precise: on a `t` that may be anything, a read whose first segment no locale knows (`t.getAttribute` on a DOM element) is no longer reported as missing, while on a `t` the file gets from a translation source (a `t` prop, `const { t } = i18n(…)`, `createTranslations(…)`) such a read is still reported. The `t.me` of a `https://t.me/…` link and usage examples in doc comments are not reads, a read past a value (`t.items.map`, `t.title.length`) counts as a read of that value, and `t.hero.titel` is still reported. Call keys (`t('key')`) are checked as before.
  - The development Proxy from `createTranslations` and `wrapTranslationEngine` now lists the keys only the fallback has. `Object.keys`, `Object.values`, `Object.entries`, spread, `in` and `JSON.stringify` see the same keys as the merged object production gets, so `Object.values(t.faq).find(Array.isArray)` finds a list that a half-translated locale takes from the fallback. Arrays stay arrays.
  - The Astro integration supports Astro 5 or later, not only Astro 7. It was checked on Astro 5.18 and 6.4: in `astro dev` the API answers, pages carry watermarked text, the mode flag, the fallback dictionary and the client script; `astro build` has none of it. The README, the Astro guide and the Versioning and stability page now say so.

## [1.1.0] - 2026-11-09

1.1.0 adds Astro support and two Studio improvements, and fixes missing translations rendering as `undefined` in production. Nothing documented changed incompatibly.

### Minor Changes

- **Added**
  - First-party Astro support without React: `liveLocale({ localesPath })` from the new `livelocale/astro` entry serves the Studio's API in `astro dev`, puts the mode flag and the fallback dictionary in every page, and loads the in-page client; a normal `astro build` gets none of it. `startLiveLocale()` in `livelocale/client` boots the client on any page without React, and `livelocale check` now reads `.astro` files for keys and for hardcoded text. `init` and `doctor` detect Astro projects.
  - `createTranslations` has a `plain: true` option that returns a plain object with every key filled in, safe to pass as props or `JSON.stringify`.
  - Picking a key from the Studio's Keys list now scrolls the page to its text and outlines it, or says when the text is hidden or not on this page.
  - When the Studio cannot connect to the app, it now says what the app answered before the usual causes: nothing listening at the app's address, the HTTP status of the page (such as "The app answered 500 at /en") or of `/api/livelocale`, a redirect to a sign-in page, a header that forbids framing, or a page that loaded without starting the LiveLocale client. **Check again** asks once more. `npx livelocale studio` answers this through a new same-origin endpoint that only probes the app origin it was started with; a share-link Studio reads the page's status itself.
- **Fixed**
  - `createTranslations` now fills keys missing from a locale with the `fallbackLocale` text in production too; they rendered as `undefined`. A locale's own arrays are kept whole. In development `fallbackLocale` now wins over the other locales, and the fallback the Vite plugin puts in the page prefers `sourceLocale`, whatever order the locale folders are listed in.

## [1.0.0] - 2026-11-08

1.0.0 is the first stable release. From here on livelocale follows semantic versioning: the documented imports, options, CLI commands, flags and exit codes, environment variables, the files `init` writes, and the share-link formats (`lc1.` change links, `manifest.json` format 1, `flag.js`) change incompatibly only in a new major version. Change links already sent and share folders already deployed keep working. Nothing documented was removed or renamed. The breaking changes below are about how the CLI treats a wrong command line and which exit code it returns, plus one type; a project whose scripts use only documented flags needs no change. Exports that no docs page uses, such as `FileMutator`, `KeyScanner`, `createMutationRouter`, `IframeBridge`, `encodeKey` and `stripWatermark`, are now marked internal: they still work, but semver does not cover them. The [Versioning and stability](https://livelocale.js.org/docs/reference/stability.html) page lists what is covered, the deprecation policy, and the versions CI tests.

### Major Changes

- **Breaking** (what to do when upgrading from 0.12)
  - Every command rejects an unknown flag with exit code 2 and names the closest known flag (`Unknown option --strictt for livelocale check. Did you mean --strict?`). Up to 0.12, `check`, `doctor`, `migrate`, `init` and `studio` ignored it, so a typo could turn a CI check off. Run your scripts and CI steps once and fix or remove any flag the error names. Write values after a space (`--dir app`, not `--dir=app`).
  - Flags that do not go together, a missing value, and an argument a command does not take exit 2: `apply --branches` without `--github-event`; `init --share my-app` (use `init --share --dir my-app`); `init --locales`, `--source`, `--branches` or `--overwrite` without `--share`; a folder given both as an argument and as `--dir`; a `studio --port` that is not a port number. Fix the command line the error names.
  - Usage errors that exited 1 now exit 2: an unknown or missing command (`livelocale` with no command still prints the help), a bad `--app` on `studio` or `doctor`, `apply` with no link, file, `-` or `--clipboard`, and the `pack`, `build` and `apply` command-line errors. A script that tests for exactly 1 should test for non-zero.
  - `livelocale check` exits 2 whenever it could not run: a missing project folder, a missing locales folder, an unknown `--source`, or a wrong command line (it was 1, the same as "found problems"; `--hardcoded` without TypeScript already exited 2). A locales folder that holds no locale files (no `{locale}.json` and no `*.json` inside a `{locale}/` folder) also exits 2 (`No locale files found in <dir>. Point --locales at the folder with en.json, ar.json, ...`, then any JSON files it skipped because their name is not a locale, such as `en_US.json`); it printed "Translations look good" and exited 0, so a wrong `--locales` passed CI. 1 still means "found problems" and 0 "clean". With `--json` it now prints a report with an `error` field instead of only a message on stderr. If your CI treats 1 and 2 differently, 2 means the check never ran.
  - `livelocale migrate` exits 1 when any file failed to convert (it exited 0). It still converts the other files and lists the failed ones.
  - `liveLocaleVite()` is typed as Vite's `Plugin`, not as its own object with every internal hook. `plugins: [liveLocaleVite(...)]` is unchanged. Code that calls the plugin's hooks by hand needs a cast.

### Minor Changes

- **Added**
  - Share links work on phones and tablets. A switch at the bottom picks **Edit** (tap any text to fix it; the site is frozen, so a tap on a link selects its text instead of following it) or **Browse** (the site works as usual). On a phone the Studio shows a thin top bar with the language and **Send · N**, the editor slides up from the bottom and stays above the keyboard, **Next missing** walks the untranslated text you can see on the page, and **Share link…** sends the change link through the phone's share menu. Desktop behaviour is unchanged.
  - `livelocale --version` (or `-v`). `--help` and `--version` stop at `--`, so `livelocale build -- next build -h` passes `-h` to your build, and are never read as a flag's value: `check -v` prints the version, `check --source -v` is a usage error (`--source needs a value.`). Node.js 18 stays the minimum, and CI now runs the built package on Node 18: the CLI and an import and a require of every entry point.
- **Changed**
  - The Studio's interface is English only. The Arabic translation of the Studio and its language switch in the header are removed. Arabic and other right-to-left sites still edit and preview right to left: pick their locale in the **Locale** menu and the site under the Studio flips.

## [0.12.1] - 2026-11-04

### Patch Changes

- **Fixed**
  - On a share link, the address field no longer shows the `?locale=` the Studio adds for the language you chose, and recent pages no longer list the same page once per language.

## [0.12.0] - 2026-11-04

### Minor Changes

- **Added**
  - The Studio's preview bar has an address field. It shows the page you are on, also after client-side navigation, relative to the site's base path. Type a path and press Enter to open it in the current language; only pages on the previewed site are accepted.
  - The address field suggests the pages you visited recently and, on a share link, every page of the deployed site: `livelocale pack` now lists them as `pages` in `manifest.json` (optional; older Studios ignore it, and the Studio works with older manifests).
- **Fixed**
  - Reload reloads the page you are on, not the first page the Studio opened.

## [0.11.0] - 2026-11-02

### Minor Changes

- **Added**
  - `livelocale check --hardcoded` finds JSX text that never went through translation, translations identical to the source locale, and translations in the wrong script, and fails CI on hardcoded text. It uses your project's own `typescript`; without it the other checks still run and the command exits with code 2. Without the flag, `check` behaves as before.
  - The Studio is available in Arabic with a right-to-left layout. Share links follow the browser language; the switch is in the header.
- **Changed**
  - The Studio has a new look with the LiveLocale brand (the "hunk" colours, Martian Mono and IBM Plex type, and the patch logo) in a light and a dark theme. Share links follow the system setting; the dev Studio starts dark until you choose System, Light or Dark in the header. The fonts ship inside the package with their OFL licences, so the Studio loads nothing from Google.
  - The Studio shows a visible keyboard focus ring, names every control, works fully by keyboard, announces saves, sends and errors, and meets WCAG AA contrast.
  - The Alt+hover outline on your site is now cyan instead of indigo.

## [0.10.1] - 2026-11-01

### Patch Changes

- **Fixed**
  - Studio:
    - Dialogs close on Escape and keep keyboard focus inside them, and the drawer stays open behind a dialog.
    - Alt+Click reopens the Review drawer and scrolls to the row; the row is found in the page language.
    - The language chosen in the share Studio is shown in the app preview and kept after a reload.
    - The reference text stays in the source locale while you switch languages.
    - A draft edited while a rebuild is reconciled is never dropped or overwritten.
    - The copied change block resets when another review opens.
    - The sent link and "Open on GitHub" stay on screen after sending.
    - "Download backup" is disabled until there is a change to back up, and the downloaded file is saved in every browser.
    - Borders and hover states render with Tailwind shades that exist.
  - CLI and pack:
    - `pack`, `build` and `init --share` name the wrong argument in their errors, and `--out` is refused for Next.js.
    - `pack` leaves HTML files without page markup, such as site verification files, untouched.
    - `init --share` keeps one `sourceLocale`, asks `origin` for its default branch and writes through linked folders.
    - Translation keys with an empty path segment (`x.`, `a..b`, `.a`) are rejected.
    - A new URL is flagged regardless of trailing punctuation or scheme and host case.
    - Invisible characters in source are written as `\u` escapes, and lint fails on raw zero-width or bidi characters.
  - apply and the Action:
    - `apply --pr` says the edits are not committed when it fails before its commit.
    - The Action keeps the real apply error when the error comment cannot be posted.
    - The Action honours a link made on the default branch outside `--branches` and ignores a comment event without an issue.
    - A later apply adds to the open fallback pull request of an issue, and a re-run suffixes the fallback branch.
  - Docs:
    - The README describes the Action's fallback branch and how a later apply adds to its open pull request, and finishes the `shareBase` row.

## [0.10.0] - 2026-10-29

### Minor Changes

- **Added**
  - `npx livelocale init --share`, which detects Vite, CRA/webpack, Next export or Next server, edits the build, and writes `.github/workflows/livelocale.yml`.
  - `apply --github-event`, with:
    - the trust gate;
    - one commit per batch on a `livelocale/issue-<n>` branch;
    - PR open or reuse, with the compare-link fallback;
    - check results and escaped tables;
    - `--branches` and closing the issue after merge.
  - "Create pull request" in Review mode.
  - "Open on GitHub" in Send, when `exposeRepo: true`.
  - Import change link in the local Studio.
  - "Live now" and "Changed by someone else" in Changes.
  - The `next` dist-tag prerelease path.
- **Changed**
  - The GitHub REST helpers are shared between the preview gateway and `apply`.

## [0.9.0] - 2026-10-27

### Minor Changes

- **Added**
  - The share link on any host: `liveLocaleVite({ share: true })`, `livelocale pack <outDir>` and `livelocale build [--preview] -- <cmd>` write `livelocale/` (the Studio, `manifest.json`, the locale files and `flag.js`) into the build.
  - A framed-only `flag.js`: visitors who open the site directly never get watermarks.
  - Static Studio mode: drafts kept in IndexedDB, re-applied after reloads, the language detected from the page text, Send to developer (Copy link, Download file), Download and Restore backup, and first-run tips.
  - Review mode for `lc1.` change links.
  - `npx livelocale apply "<link|file|->" [--pr] [--clipboard] [--force] [--dry-run]`.
  - `doctor --app <url>` share probes, which print the share link.
  - The client follows a Studio on the same site after full-page navigations.
  - The client reports visible texts.
- **Changed**
  - The Studio is built with a relative base and self-hosted fonts, and is `noindex`.
  - The Studio uses drawers below 1280px.
  - `FileMutator({ requireEnabled })`, with `FileMutatorOptions` exported from `livelocale/server`.
  - The router's write validation moved to `save-rules` with byte-identical responses.

## [0.8.1] - 2026-10-26

### Patch Changes

- **Fixed**
  - Arabic and Persian text shaped wrongly while LiveLocale was active: the first letter of every translated string was drawn in its connected form, as if a hidden letter came before it. The invisible watermark ended with a zero-width joiner, which is join-causing in Arabic shaping. Watermarks now start and end with the non-joining ZWNJ (bits use ZWSP and ZWJ, which never touch a letter); in a browser the watermarked text now renders pixel-identical to plain text.
  - Copy, paste, form submit and input values no longer delete every zero-width character, which removed the ZWNJ that Persian and Urdu words need (e.g. "می‌خواهم") and the ZWSP Thai uses. Only complete watermarks are removed, through the new exported `removeWatermarks()`.
  - After the embedded app navigated through its own links (for example a language switcher), clicks and locale changes no longer reached a Studio running anywhere other than `http://localhost:3010`: the app's links drop the `?livelocale-origin=` parameter and the client fell back to the default origin. The client now remembers the Studio origin for the browser tab (`resolveStudioOrigin`), accepts only http(s) origins, and still works when storage is blocked. Found while editing the Vercel preview of the demo app with the Studio on port 3011.

## [0.8.0] - 2026-10-26

### Minor Changes

- Renamed to LiveLocale. Same features as next-i18n-lens 0.7.0; every name changes and old names are not honoured.

  **Changed**
  - Package `next-i18n-lens` → `livelocale`, CLI `npx livelocale`.
  - `I18nLensProvider` → `LiveLocaleProvider`, `createI18nLensHandler` / `I18nLensHandler` → `createLiveLocaleHandler` / `LiveLocaleHandler`, `i18nLensVite` → `liveLocaleVite`, `getLensMode` / `isLensEnabled` / `LensMode` → `getLiveLocaleMode` / `isLiveLocaleEnabled` / `LiveLocaleMode`; the `ClientInitializer` alias is removed.
  - Route `/api/i18n-lens/mutate` → `/api/livelocale` (`app/api/livelocale/route.ts`, `pages/api/livelocale.ts`); `init` and `doctor` use the new paths.
  - Environment variables `I18N_LENS`, `NEXT_PUBLIC_I18N_LENS`, `I18N_LENS_TOKEN`, `I18N_LENS_ALLOWED_ORIGINS` → `LIVELOCALE`, `NEXT_PUBLIC_LIVELOCALE`, `LIVELOCALE_TOKEN`, `LIVELOCALE_ALLOWED_ORIGINS`.
  - Window globals, iframe query parameter (`livelocale-origin`), bridge message sources, session storage key and log prefix (`[livelocale]`) renamed.
  - The README's migration section lists the steps; it also now states that preview mode for Vite needs the Vite dev server (static builds are not supported yet).

  **Added**
  - `livelocale/package.json` is exported.
  - The publish workflow skips versions that are already on npm.

## [0.7.0] - 2026-10-26

### Minor Changes

- Milestone seven: a translation check for CI, and preview mode tested against a real deployment.

  **Added**
  - `npx next-i18n-lens check` reports invalid locale JSON, broken ICU syntax, keys used in code but missing from a locale, keys missing compared to the source locale (`--source`, default `en`), placeholder drift against the source locale, empty values, and keys nothing references. Exits 1 on problems; `--strict` promotes warnings, `--no-unused` skips the unused report, `--json` prints the full report. Runs in any `NODE_ENV`, so it works in CI.
  - i18next plural families (`items_one`, `items_other`, …) count as one key, and object access such as `t.home` covers every key under it.
  - `KeyScanner` accepts `{ requireEnabled: false }` and gains `scanSourceKeys(projectRoot)` for read-only tooling.

  **Added (preview mode)**
  - The GitHub gateway checks its own access (`checkAccess`): an empty or rejected token, an unknown repository, a missing base branch, and missing "Contents" or "Pull requests" write permission. Write permissions are probed with empty requests that GitHub rejects as invalid, so nothing is created. `GET ?action=info` returns the result as `problems`, the Studio shows it in a banner, and `GitGateway` gains an optional `checkAccess()`.
  - `doctor --token <token>` (or `I18N_LENS_TOKEN`) checks a preview deployment: server mode, git availability, and repository access problems. A 401 now explains that a token is needed.
  - After eight seconds on "Connecting", the Studio lists the usual causes (app not running, framing blocked, provider missing or off) and the `doctor` command to run.
  - `studio` refuses to start when something already answers on `localhost:<port>`; on Windows a second server could otherwise bind beside it and the browser would silently reach the other one.

  **Fixed**
  - Concurrent saves to one locale file in GitHub mode lost edits with `409`. Saves are now queued per file and a save that loses a race re-reads and retries, so two server instances can write the same file.
  - In preview mode a saved edit disappeared from the page as soon as it was saved, and on every reload, because the deployment still serves the old text. The Studio now keeps saved values on the page (`COMMIT_PREVIEW` bridge message) and re-applies the session's saves after reloads and navigation.
  - `doctor --app` blamed middleware when a hosting login wall (Vercel Deployment Protection) redirected the request; it now names the wall and how to turn it off.
  - `doctor` warned about frame-blocking headers even when `frame-ancestors` allowed the Studio origin.
  - `doctor --app` could crash Node on Windows on exit (`UV_HANDLE_CLOSING`), and `check --json` could truncate piped output; both now set `process.exitCode` instead of calling `process.exit()`.
  - GitHub permission errors say which token permission is missing.

## [0.6.0] - 2026-10-15

### Minor Changes

- Milestone six: accurate keys and plural forms.

  **Added**
  - **Plural forms editor** in the Studio: a message that is a single ICU `plural` / `select` / `selectordinal` argument is edited one branch per field, with the active locale's CLDR categories (via `Intl.PluralRules`) pre-populated and missing required categories flagged. "Edit raw" switches back to the textarea. `core/icu-plural` exports `parsePluralMessage`, `buildPluralMessage` and `pluralCategoriesFor`.
  - **Namespace-aware key scanning**: `extractKeys` resolves the namespace bound to each translator variable from `useTranslations('ns')`, `getTranslations('ns')`, `useTranslation('ns')`, `wrapNextIntl(…, 'ns')` and `wrapTranslationEngine(…, { keyPrefix })`, handles several translator variables per file, `t.rich`/`t.raw`/`t.markup`/`t.has`, and template-literal keys without expressions, while skipping dynamic keys and look-alike identifiers.
  - A playground plural key and an end-to-end test for the structured editor.

## [0.5.0] - 2026-10-15

### Minor Changes

- Milestone five: placeholder-safe editing.

  **Added**
  - **Placeholder safety.** The mutation API compares the placeholders of a new value with the `reference` sent by the client and rejects mismatches with `422 PLACEHOLDER_MISMATCH` (details list missing and extra tokens). Structurally broken ICU messages are rejected with `422 MESSAGE_SYNTAX`. `force: true` bypasses both.
  - The Studio editor shows placeholder chips (present, missing, extra) live, sends the reference with each save, and turns a 422 into a warning with **Save anyway** / **Keep editing**.
  - `core/placeholders` exports `extractPlaceholders`, `comparePlaceholders`, and `validateMessageSyntax` covering ICU/next-intl/react-intl, i18next, printf and rich-text tags.
  - Vite parity for preview mode: the Vite plugin mirrors `I18N_LENS` into the page as `window.__I18N_LENS_FLAG__`, which the client reads when no `NEXT_PUBLIC_` variable is inlined.

  **Changed**
  - The translation textarea, the reference box, and sidebar values use `dir="auto"`, so right-to-left text renders correctly.

## [0.4.0] - 2026-10-15

### Minor Changes

- Milestone four: preview mode for editing without a checkout.

  **Added**
  - **Preview mode.** `I18N_LENS=preview` (server) and `NEXT_PUBLIC_I18N_LENS=preview` (client) enable watermarking and the mutation API in a production build, so a deployed preview can be edited through the Studio. The deployed-platform guard does not apply in this mode; the kill switch still wins.
  - **Bearer-token authentication.** `authToken` (or `I18N_LENS_TOKEN`) makes every request require `Authorization: Bearer <token>`; preview mode refuses to serve without a token. The Studio asks for the token once per browser session and keeps it in sessionStorage.
  - **GitHub gateway.** `createI18nLensHandler({ github: { repo, branch, baseBranch, token } })` stores translations on a repository branch through the GitHub REST API: one commit per save, status and diff from the compare endpoint, **Open pull request** from the Changes panel, and **Reset branch** to discard.
  - `GET ?action=info` reports the server mode, whether a token is required, and whether git actions are available; the Studio shows a PREVIEW badge accordingly.

  **Changed**
  - `MutationGateway` gains `readLocale`; the router no longer reads the filesystem directly. Custom gateways must implement it.
  - Nested-key writing and JSON formatting helpers moved to `core/json-path` and are shared by both gateways.
  - All Studio HTTP calls go through `src/studio/api.ts`.

## [0.3.0] - 2026-10-15

### Minor Changes

- Milestone three: review-ready editing.

  **Added**
  - **Changes panel** in the Studio: git status of the locales directory with branch and on-demand diff, commit with a message (locales directory only), discard with confirmation, and a session history with per-edit **Undo**.
  - `GET ?action=git` and `POST action=commit|discard` on the mutation API behind an optional `GitGateway` port; `GitClient` implements it over the `git` CLI. Both adapters enable it by default; `git: false` turns it off.
  - Unit tests for the remaining Studio hooks (`useLocaleData`, `useLocaleActions`), the new hooks, and the Changes panel; an end-to-end test for the panel and undo.

  **Changed**
  - Locale file rewrites preserve the existing indentation unit (tabs, 2 or 4 spaces) and trailing newline, so Studio edits produce minimal diffs.
  - The first end-to-end test waits for the iframe bridge instead of a fixed timeout.

## [0.2.0] - 2026-10-15

### Minor Changes

- Milestone two: safety, speed, and self-diagnosis.

  **Added**
  - `I18N_LENS=off` kill switch (`NEXT_PUBLIC_I18N_LENS=off` in client bundles) and a deployed-platform guard: on Vercel preview/production, Netlify, Kubernetes, Render, Fly.io, Railway, or Heroku the tool stays off even when `NODE_ENV=development`, with a one-time warning. `I18N_LENS=force` overrides.
  - `npx next-i18n-lens doctor [--app <origin>]` checks the route handler, provider mount, middleware or proxy matcher, frame-blocking headers, and locale JSON, and probes the running app for a reachable mutation API and embeddable pages.
  - `unwrap(value)` deep-strips watermarks from strings, arrays, and objects for code that compares, measures, or serializes translated text.
  - Unit tests for the Studio hooks (`useKeySearch`, `useSelection`, `useConnection`).

  **Changed**
  - `createTranslations` caches parsed locale files by mtime and size; a server render costs one `stat` per file.
  - The key scanner is incremental (per-file mtime cache), honours the root `.gitignore`, skips `.d.ts` and files over 1 MB, and ignores next-intl helper properties.
  - Releases are managed with Changesets.

## [0.1.8] - 2026-10-15

### Added

- `wrapNextIntl` helper and FormatJS-style descriptor support (`t({ id })`) in `wrapTranslationEngine`.
- `init` detects `next-intl` / `react-i18next` and prints the matching next step.
- `studio --app <origin>` flag and `?app=<origin>` query parameter: the app origin is now resolved at run time instead of being baked into the Studio bundle.
- `I18N_LENS_ALLOWED_ORIGINS` environment variable for Studio origins outside localhost (Codespaces, Gitpod, custom hostnames).
- Packaged-CLI integration test that runs the built CLI from outside the repository.
- `ARCHITECTURE.md`, `SECURITY.md`, CODEOWNERS, Dependabot, CodeQL workflow, `.gitattributes`.
- README section on team and enterprise setups (CSP, auth middleware, monorepos, remote dev).

### Changed

- `next`, `react`, and `react-dom` are now optional peer dependencies.
- `typescript` is no longer a runtime dependency; `migrate` loads it lazily and fails with an install hint when absent.
- Coverage thresholds are enforced in CI.
- Studio header and CLI output use the "i18n Lens" product name.

### Fixed

- Pages Router support: `createI18nLensHandler` now accepts the `(req, res)` signature, so the file written by `init` for `pages/api` works.
- `init` and `studio` crashed in JavaScript-only projects because the CLI imported `typescript` eagerly.
- The Studio could only talk to `http://localhost:3000`.
- Studio static server returned a non-standard `550` status on read errors.

## [0.1.7] - 2026-05-29

### Added

- Prettier and ESLint configurations for consistent coding styles.
- GitHub Actions CI/CD workflows for automated builds, typechecking, and testing.
- Playwright E2E testing integration in CI workflow.
- Husky and lint-staged pre-commit hooks to automate styling validation.
- Repository health files (`.editorconfig`, `CONTRIBUTING.md`, PR/Issue Templates).

## [0.1.6] - 2026-05-20

### Added

- Zero-width unicode watermark validation and scanning.
- Integration tests for Vite plugin and DOM Interceptors.
- Fallback placeholders for missing localized strings.

## [0.1.0] - 2026-04-15

### Added

- Initial release of `next-i18n-lens`.
- Live visual translation studio and DOM highlighting listener.
- CLI migration tool for wrapping standard react-i18next hooks.
