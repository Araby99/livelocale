---
title: Zero-width watermarking
description: How livelocale hides each translation key in invisible characters, and how Alt+Click in the Studio finds the key behind any text.
---

# Zero-width watermarking

In development, every translated string carries its key in characters you cannot see. The page renders as usual; the Studio reads those characters back to know which key a piece of text came from. That is how Alt+Click finds the key without any `data-` attributes in your markup.

## The encoding

`wrapTranslationEngine`, `wrapNextIntl` and `createTranslations` wrap your translation function or dictionary. While livelocale is on, every string they return starts with a watermark:

1. A delimiter, U+200C (zero-width non-joiner).
2. The key's UTF-8 bytes, 8 bits per byte, most significant bit first: U+200B (zero-width space) for a 0, U+200D (zero-width joiner) for a 1.
3. The delimiter again, U+200C.
4. The visible text.

So `t('home.title')` returns the watermark for `home.title` followed by the title. The key `a` (byte `0x61`, bits `01100001`) encodes as:

```txt
U+200C  U+200B U+200D U+200D U+200B U+200B U+200B U+200B U+200D  U+200C  visible text
```

Two choices keep the text intact:

- **The watermark comes first.** Code that cuts text from the right, such as `text.substring(0, 40)`, keeps the key.
- **The delimiters are non-joining.** The delimiters touch the visible text, and a zero-width joiner there would make the first Arabic letter take its connected form, as if a hidden letter came before it. The joiner only appears between other zero-width characters, never next to a letter.

## How Alt+Click finds the key

`LiveLocaleProvider` loads the in-page client in the browser while livelocale is on, and the client starts only when the page is framed, inside the Studio. Then:

1. **It scans the page.** It walks every text node, decodes a watermark at the start of one, and sets `data-i18n-key` (and `data-i18n-template`, the visible text) on the text's parent element. A `MutationObserver` does the same for text rendered later, so client navigation and streamed content are picked up.
2. **It leaves the text alone.** The text nodes keep their watermark, because changing them would break React's hydration.
3. **It outlines what you point at.** Hovering a marked element shows a dashed outline labelled `Alt+Click to edit` with the key; holding Alt makes the outline solid.
4. **Alt+Click selects it.** A click with Alt held on a marked element, or inside one, is stopped before your app sees it, and the key and its current text go to the Studio, which opens the key in the editor. A click without Alt reaches your app as usual, so links and buttons keep working.

The client talks to the Studio with `postMessage`, sends only to the Studio's origin, and ignores messages from any other origin.

## Keeping the characters out of your data

The client also stops watermarks leaking out of the page:

- **Copy.** When the selection holds a watermark, the clipboard gets the text without it.
- **Paste.** A pasted watermark is removed before it reaches an `input` or `textarea`.
- **Inputs.** Reading `value` from an `input` or `textarea` returns it without watermarks, and setting it drops them.
- **Forms.** On submit, the form's inputs and textareas are cleaned.

These remove only complete watermarks. Persian and Urdu use U+200C inside words and Thai uses U+200B, so other zero-width characters in your text are kept.

Custom components that keep their own state can still end up holding a watermark; [when the watermark bites](./watermark-pitfalls.md) lists the fixes.

## When livelocale is off

In a production build, or with the [kill switch](./safety-switches.md#kill-switch) set, `wrapTranslationEngine` hands back your engine unchanged, so strings have no watermark, and `LiveLocaleProvider` never loads the client. There are no listeners, no scanner and no patched inputs.
