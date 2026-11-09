---
'livelocale': minor
---

When the Studio cannot connect to the app, it now says what the app answered before the usual causes: nothing listening at the app's address, the HTTP status of the page (such as "The app answered 500 at /en") or of `/api/livelocale`, a redirect to a sign-in page, a header that forbids framing, or a page that loaded without starting the LiveLocale client. **Check again** asks once more. `npx livelocale studio` answers this through a new same-origin endpoint that only probes the app origin it was started with; a share-link Studio reads the page's status itself.
