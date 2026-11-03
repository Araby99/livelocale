---
title: studio
description: The livelocale studio command. Starts the local Studio server on port 3010 and points it at your running app.
---

# studio

`studio` starts the Studio, a small local web server that serves the editing interface. Run it beside your app's dev server, then open the Studio URL it prints.

```bash
npx livelocale studio [--port <number>] [--app <origin>]
```

The Studio is served from the installed package. If something already answers on the port, `studio` stops with code 1 and asks you to pick another one. Press Ctrl+C to stop it.

## Flags

### `--port`

`--port <number>`, default: `3010`.

The port the Studio itself listens on, at `http://localhost:<port>`.

### `--app`

`--app <origin>`, default: `http://localhost:3000`.

The origin of the app being edited. It must be an http or https origin such as `http://localhost:3001`; anything else exits with code 1. You can also change it at run time with `?app=<origin>` on the Studio URL.
