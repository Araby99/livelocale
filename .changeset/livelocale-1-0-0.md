---
'livelocale': major
---

1.0.0 is the first stable release. From here on livelocale follows semantic versioning: the documented imports, options, CLI commands and flags, environment variables, the files `init` writes, and the share-link formats (`lc1.` change links, `manifest.json` format 1, `flag.js`) change incompatibly only in a new major version. Change links already sent and share folders already deployed keep working. Nothing documented was removed or renamed to get here; upgrading from 0.12 needs no code changes. Exports that no docs page uses, such as `FileMutator`, `KeyScanner`, `createMutationRouter`, `IframeBridge`, `encodeKey` and `stripWatermark`, are now marked internal: they still work, but semver does not cover them. The [Versioning and stability](https://livelocale.js.org/docs/reference/stability.html) page lists what is covered, the deprecation policy, and the versions CI tests.
