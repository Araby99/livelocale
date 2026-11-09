---
title: studio
description: The livelocale studio command. Starts the local Studio server on port 3010 and points it at your running app.
---

# studio

`studio` starts the Studio, a small local web server that serves the editing interface. Run it beside your app's dev server, then open the Studio URL it prints.

```bash
npx livelocale studio [--port <number>] [--app <url>]
```

The Studio is served from the installed package. If something already answers on the port, `studio` stops with code 1 and asks you to pick another one. Press Ctrl+C to stop it.

## Flags

### `--port`

`--port <number>`, default: `3010`.

The port the Studio itself listens on, at `http://localhost:<port>`. Anything but a whole number from 1 to 65535 exits with code 2.

### `--app`

`--app <url>`, default: `http://localhost:3000`.

The app being edited. It must be an http or https URL such as `http://localhost:3001`; anything else exits with code 2. The Studio trusts its origin; a path, such as `http://localhost:4321/ar/`, is the page the preview opens first. You can also change it at run time with `?app=<url>` on the Studio URL.
