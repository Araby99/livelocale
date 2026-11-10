---
'livelocale': patch
---

The Studio no longer moves you to the source language because a page shows untranslated text. When your Arabic file lacks some texts, the site shows the English ones in their place; the Studio now knows those texts can belong to the Arabic page too. So `/ar` or `?locale=ar` with only a few Arabic texts stays on Arabic, and clicking an untranslated text opens it in Arabic, ready to translate, instead of opening (and overwriting) the English text. While you have typed text that is not saved yet, the page never changes the language you edit: the Studio points out the other language instead, and switching asks first.
