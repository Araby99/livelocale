---
title: The Studio
description: Edit your site's text in the Studio, review and commit the locale files, edit plural forms safely, and use it in light or dark, in Arabic and by keyboard.
---

# The Studio

The Studio is where text gets fixed: your running app in the middle, every translation key on one side, the editor on the other. You run the dev Studio beside your app's dev server; [share links](./share-links.md) put the Studio inside a deployed site instead. The first two sections are about the dev Studio; the rest applies to both, and the shots of the Tidewell demo site are taken on a share link.

<DocShot lead name="share-alt-click" alt="The Studio over the Tidewell demo site: the Locale Directory on the left, the live page in the middle, and the editor on the right open on the Alt+Clicked headline hero.title with the typo fixed." caption="Keys on one side, the running site in the middle, the editor on the other." />

## Edit

Start the Studio next to your app's dev server:

```bash
npx livelocale studio --port 3010 --app http://localhost:3000
```

Open `http://localhost:3010`. `--app` defaults to `http://localhost:3000`, and you can switch apps without restarting by opening `http://localhost:3010/?app=http://localhost:3001`. Every flag is on the [`studio` reference](../reference/cli/studio.md).

Hold Alt and click any translated text in the preview to open its key in the editor, or pick the key from the **Locale Directory**, which searches keys and values and can show only the keys on the current page. The editor shows the key, the reference text and the translation. Type the fix and press **Save Changes**. The **Locale** menu in the editor picks the language you edit.

## Review and commit

Every save writes to disk immediately. The **Changes** button in the Studio header opens a panel that keeps those writes reviewable:

- **Locale files** lists what git sees as modified, added or deleted under your locales folder, with the current branch and a diff on demand.
- **Commit** stages and commits only the locales folder with the message you type. Other work in your tree is never touched. Push when you are ready.
- **Discard** reverts the locales folder to the last commit, after a confirmation: tracked files are restored and new locale files removed.
- **This session** lists each edit you saved with its previous and new value. **Undo** writes the previous value back through the normal save path.

<DocShot name="next-saved-file" alt="The Changes panel after a save in the Next.js playground: playground/locales/en.json is listed as modified, its git diff shows the old welcome line struck and the new one added, and This session lists the edit with Undo." caption="After a save: the file, its diff and the edit you can undo." />

Rewrites keep your files diff-friendly: the existing indentation (tabs, 2 or 4 spaces) and the trailing newline are kept.

Git integration needs the `git` command on `PATH` and the locales folder inside a repository. It is on by default; turn it off per handler with `git: false`:

```ts
createLiveLocaleHandler({ localesPath: path.resolve('./locales'), git: false });
```

## Plural forms

When a message is a single ICU `plural`, `select` or `selectordinal` argument, with or without text around it, the editor replaces the text box with one field per branch.

- The fields are the branches already in the message (explicit cases such as `=0` included) plus the plural categories of the locale you edit, from `Intl.PluralRules`. English shows `one` and `other`; Arabic shows `zero`, `one`, `two`, `few`, `many` and `other`; Japanese shows `other` only. Required categories that are still empty are flagged.
- `#` stands for the number. The text before and after the argument is edited separately.
- Empty branches are dropped from the saved message, except `other`, which ICU requires.
- **Edit raw** switches back to the plain text box at any time.

<DocShot name="studio-plural" alt="The editor on cart.items in the Next.js playground: under Plural forms, one field for one with # item and one for other with # items, and the Edit raw switch." caption="One field per plural form, with # for the number." />

## Placeholder safety

A placeholder that goes missing in a copy edit breaks the page. The Studio and the API guard against it:

- The editor shows the placeholders of the reference text as chips. A chip turns red when your translation no longer contains it, and amber when you add one the reference lacks.
- On save, the server compares the placeholders of the reference and the new value; on a share link the Studio runs the same check itself. A mismatch answers `422 PLACEHOLDER_MISMATCH`, and the Studio shows the reason with **Save anyway** and **Keep editing**.
- A structurally broken ICU message (unbalanced braces, a `plural` or `select` without an `other` branch) answers `422 MESSAGE_SYNTAX`, with the same choice.

<DocShot name="studio-placeholder-warning" alt="home.greeting edited to Hello there! without its {name} placeholder: the {name} chip is struck through in red, and the editor warns that placeholders differ from the reference, with Save anyway and Keep editing." caption="A missing placeholder stops the save until you choose." />

The check knows ICU, next-intl and react-intl `{name}` and `{count, plural, …}` (with apostrophe quoting), i18next `{{name}}` and `$t(key)`, printf `%s` and `%1$s`, and rich-text tags such as `<b>` or `<0>`. The reference is the source-language value when you edit another locale, and the previous value when you edit the source language itself.

## Light and dark

The Studio comes in a light and a dark theme. The switch in the header has three choices: System, Light and Dark. The dev Studio starts dark until you pick one; a share link follows your system setting. The Studio remembers your choice in the browser.

<DocShot name="studio-light" alt="The Studio in its light theme over the Tidewell demo site, with the headline fix typed in the editor and the System, Light and Dark switch in the header." caption="The light theme." />

The Studio's fonts ship inside the package, so it loads nothing from Google.

## Arabic and right to left

The Studio speaks English and Arabic. The language switch is in the header and shows the other language's own name, **العربية** or **English**. In Arabic the whole Studio mirrors to right to left. A share link opened in an Arabic browser starts in Arabic; the dev Studio starts in English. Either way the Studio remembers your choice.

The Studio's language and the language you edit are separate: the **Locale** menu in the editor picks the locale. On a share link the preview then shows the site in that language, so an Arabic site that lays itself out right to left does so under the Studio.

<DocClip name="arabic-switch" label="Switch the Studio to Arabic on the Tidewell demo site: the Studio mirrors to right to left, then the Arabic locale is picked and the site under it flips right to left too." caption="The Studio mirrors, and the Arabic site under it flips." />

<DocShot name="studio-arabic" alt="The Studio in Arabic, laid out right to left, over the Arabic Tidewell demo site, with the editor open on the Alt+Clicked headline hero.title." caption="Editing the Arabic site in the Arabic Studio." />

## Keyboard

Every control works by keyboard, with a visible focus ring, and the Studio announces saves, sends and errors to screen readers.

| Keys                                     | What they do                                                                                        |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Tab and Shift+Tab                        | Move between controls. Inside a dialog the focus stays in the dialog.                               |
| Enter or Space on a Locale Directory row | Opens the key in the editor and moves the focus into its field, so you can type the fix right away. |
| Ctrl+Enter (Cmd+Enter on a Mac)          | In the editor's field, saves exactly as **Save Changes** does. **Save anyway** has no shortcut.     |
| Escape                                   | Closes the open dialog, or an open drawer on a narrow screen.                                       |

To find a key without the mouse, type in the Locale Directory's search field, Tab to the row and press Enter.

<DocShot name="studio-keyboard" alt="The Locale Directory searched for trial: two keys match, hero.cta is picked, and the editor is open on hero.cta with the focus ring on its field." caption="Search, Tab, Enter: the key is open and the field has the focus." />

Alt+Click needs a keyboard, so on phones and tablets a share link can only view the site.
