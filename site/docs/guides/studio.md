---
title: The Studio
description: Edit your site's text in the Studio, review and commit locale files, edit plural forms safely, and edit right-to-left sites such as Arabic.
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

Hold Alt and click any translated text in the preview to open its key in the editor, or pick the key from the **Locale Directory**, which searches keys and values and can show only the keys on the current page. The editor shows the key, the reference text and the translation. A key picked from the directory also scrolls the preview to its text and outlines it. If the text is in a closed menu or not on this page, the editor says so, and you can still edit it. Type the fix and press **Save Changes**. The **Locale** menu in the editor picks the language you edit.

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

## Go to a page

The address field in the preview bar shows the page you are on, relative to the site's base path, and it follows client-side navigation too. Type a path such as `/pricing` and press Enter to open it in the language the preview shows. A full URL works when it is on the previewed site; any other address is refused with "Only pages on this site can open here".

When you focus or type in the field, it suggests up to 8 pages that match what you typed:

- **Recent pages** are the pages you opened in the preview, most recent first. The Studio remembers up to 20 per site in this browser.
- **Site pages**, on a share link only, are every page of the deployed site, from the list [`pack`](../reference/cli/pack.md#pages-in-the-manifest) writes into the manifest. They reach pages no link leads to.

Down or Up, with or without Alt, opens the suggestions, the arrow keys move through them, and Enter opens the one picked. Escape closes the list; a second Escape puts back the page you are on. The reload button beside the field reloads the page you are on.

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

## Right-to-left sites

The Studio's interface is in English. The **Locale** menu in the editor picks the locale you edit. On a share link the preview then shows the site in that locale, so an Arabic or Hebrew site that lays itself out right to left flips under the Studio, while the Studio around it stays left to right. The editing fields use `dir="auto"`, so right-to-left text reads and types correctly in them.

<DocClip name="rtl-site" label="The English Studio on the Tidewell demo site: the Locale menu is set to Arabic and the site under it flips right to left." caption="Pick the Arabic locale and the site under the Studio flips right to left." />

<DocShot name="studio-rtl-site" alt="The English Studio over the Arabic Tidewell demo site, laid out right to left, with the editor open on the Alt+Clicked headline hero.title." caption="Editing the Arabic site, right to left, in the English Studio." />

## Keyboard

Every control works by keyboard, with a visible focus ring, and the Studio announces saves, sends and errors to screen readers.

| Keys                                     | What they do                                                                                        |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Tab and Shift+Tab                        | Move between controls. Inside a dialog the focus stays in the dialog.                               |
| Enter or Space on a Locale Directory row | Opens the key in the editor and moves the focus into its field, so you can type the fix right away. |
| Ctrl+Enter (Cmd+Enter on a Mac)          | In the editor's field, saves exactly as **Save Changes** does. **Save anyway** has no shortcut.     |
| Escape                                   | Closes the open dialog, or an open drawer on a narrow screen.                                       |
| Down or Up in the address field          | Opens the page suggestions. Enter opens the one picked; Escape closes them.                         |

To find a key without the mouse, type in the Locale Directory's search field, Tab to the row and press Enter.

<DocShot name="studio-keyboard" alt="The Locale Directory searched for trial: two keys match, hero.cta is picked, and the editor is open on hero.cta with the focus ring on its field." caption="Search, Tab, Enter: the key is open and the field has the focus." />

On a phone or a tablet there is no Alt key: the Studio switches to tapping, as the next section shows.

## On a phone

A share link opened on a phone shows the site on almost the whole screen. A thin bar at the top holds the language, **Send · N** (the changes not sent yet) and a **⋯** menu with the rest. A switch at the bottom picks what a tap does:

- **Edit**, where the Studio opens: text you can fix is outlined, and tapping it opens the editor. The site is frozen, so a tap on a link or a button selects its text instead of following it. Text that is not in your locale files says so when tapped, and a tap on an image or empty space does nothing. Scrolling works as usual.
- **Browse**: the site works as it does without the Studio. Use it to open a menu or go to another page, then switch back to **Edit**. The switch keeps your choice from page to page.

The editor slides up from the bottom as a sheet, with the key, the reference text and the field. The page changes as you type, and the sheet stays above the phone's keyboard. **Next missing** moves to the next text on the page that has no translation in the locale you edit. When none are left on screen, it says how many more are in parts of the page you cannot see, such as a closed menu.

**Send · N** opens the same change list as on a desktop. **Share link…** opens the phone's own share menu, so the link goes out by WhatsApp, Slack, email or any other app; **Copy link** is always there too.

<DocShot name="studio-phone" alt="A share link on a phone: the Tidewell headline tapped in Edit, and the editor sheet open over the page on hero.title with the typo fixed, Save Changes and Next missing under the field." caption="Tap the text, fix it in the sheet that slides up." />

Drafts are kept in the phone's browser, which loses them more easily than a desktop: a private tab forgets them when it closes, and iOS clears the data of sites you have not opened for a while. Send your changes when you are done.

On a tablet the Studio keeps its usual layout, with the same **Edit** and **Browse** switch for tapping. A desktop with a mouse never shows the switch.
