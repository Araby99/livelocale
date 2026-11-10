---
'livelocale': patch
---

Saving from the Studio in development or preview no longer damages locale files. A save that would replace a list, a group of translations or a key written with dots in its name (such as `"home.title"`) is now refused with a 409 and a plain message, and the file stays as it was; before, the save answered 200 and overwrote the data. In a project with one folder per language, a key whose namespace file (for example `nav.json`) exists in no language is refused too, with a message that names the file and the fix, instead of quietly creating a file the app never loads. A key that names a whole namespace file now answers 400 instead of 500. A key whose text is `null`, as some export tools write for an untranslated text, can still be saved, in the Studio and through a share link.
