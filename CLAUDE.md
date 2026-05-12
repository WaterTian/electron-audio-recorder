# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm start` — run the Electron app locally (macOS for real audio capture).
- `npm run lint` — syntax-check main-process scripts only (`node --check` on `main.js` + `preload.js`). There is no test suite, no bundler, and no renderer linter.
- `npm run pack` — unpacked `electron-builder` build into `dist/mac-*/` (x64 + arm64), no installer. Use for quick local smoke tests.
- `npm run dist` — full unsigned DMG + zip for both archs. CI runs this with `CSC_IDENTITY_AUTO_DISCOVERY=false`.

There is no build/transform step for the renderer — `src/renderer/*.{html,js,css}` are loaded directly.

## Architecture

### Two surfaces share one renderer

`src/renderer/` is the source of truth for both:
- the **Electron app** (`src/renderer/index.html` loaded by `BrowserWindow.loadFile`), and
- the **GitHub Pages web demo** (`web/index.html`), which is assembled by `.github/workflows/pages.yml`. That workflow copies `src/renderer/{app,recording,library,player}.js` + `styles.css` into `_site/` alongside `web/{index.html,mock-api.js,web.css,samples/}`.

When editing `src/renderer/*.js`, assume both runtimes will load it. Anything Electron-specific must go through `window.recorderAPI`, which `web/mock-api.js` overrides with a fake (`list` returns canned samples, `save` throws "Mac-only", `reveal` flashes a notice). `mock-api.js` also monkey-patches `RecordingPage.start` after load to show a friendly "install the Mac app" message instead of attempting capture.

Do **not** re-vendor renderer JS into `web/` — that duplication was deliberately removed (commit `06f2281`). CI is the only thing that should put renderer files next to `web/index.html`.

### System-audio capture (the non-obvious part)

macOS system audio is captured via screen-sharing loopback, wired up in `src/main/main.js`:
1. `session.defaultSession.setDisplayMediaRequestHandler` calls `desktopCapturer.getSources({ types: ['screen'] })` and responds with `{ video: sources[0], audio: 'loopback' }`. The `'loopback'` audio source is what makes system audio capture work — without it the renderer would only get tab/window audio.
2. The renderer calls `navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })`, then immediately `stop()`s the video tracks and records only the audio stream into a WebM/Opus blob via `MediaRecorder`.
3. The user must still pick "Entire Screen" with "Share audio" ticked the first time — this is enforced by macOS/Chromium, not by us.

Entitlements in `entitlements.mac.plist` include both `audio-input` and `camera` because Chromium requires them for `getDisplayMedia` even when only audio is captured. Don't remove either.

### Storage + custom protocol

- Recordings live in `app.getPath('userData') + '/recordings/'`, indexed by `recordings.json` (atomic write via tmp + rename). On `recordings:list`, entries whose file no longer exists are pruned.
- The renderer never sees disk paths. It loads audio via a custom `rec://recording/<filename>` URL handled by `protocol.handle('rec', ...)` in `main.js`. The scheme is registered as privileged + standard + secure + supportFetchAPI + stream **before** `app.whenReady()` — this is required for `<audio>` and `fetch` to treat `rec:` URLs normally.
- Filenames are strictly validated against `/^recording-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}(?:-\d+)?\.webm$/` in every IPC handler and in the protocol handler. Don't loosen this — it's the only guard against path traversal in `delete`/`reveal`/`rec:`. The `-N` suffix supports `uniqueFilename` collision handling.
- `webPreferences`: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: false`, `webSecurity: true`. The preload (`src/main/preload.js`) exposes only `window.recorderAPI = { save, list, delete, reveal, dir, fileUrl }`. `fileUrl` is sync — it just builds the `rec://` URL.
- CSP in `index.html` allows `media-src 'self' rec: blob:`. Any new resource scheme must be added here too.

### Renderer module pattern

Each page is a singleton IIFE that registers itself on `window` (e.g. `window.RecordingPage`, `window.LibraryPage`) with `mount(container)` / `unmount()`. `app.js` is a hash-router (`#/recording`, `#/library`) that calls `unmount` on the outgoing page and `mount` on the incoming one. `<template>` elements in `index.html` hold the page DOM.

`window.Player` is global and initialized once on `DOMContentLoaded` — it persists across page navigation (the player bar is a footer outside `#view`). Pages communicate with the player via custom events:
- `recording-saved` (dispatched by recording.js, listened to by library.js to refresh)
- `player:track-change`, `player:state-change` (dispatched by player.js, listened to by library.js to highlight the active row)

## CI

Two workflows on push to `main`:
- `build-mac.yml` — builds unsigned mac DMG + zip on `macos-latest`, uploads as artifact, and auto-creates a GitHub Release tagged `build-<runNumber>-<sha7>`. Note: every push creates a release.
- `pages.yml` — assembles the static web demo (see "Two surfaces" above) and deploys to GitHub Pages. `enablement: true` on `configure-pages` auto-turns-on Pages for the repo. The workflow has no ffmpeg / build step — sample audio is committed under `web/samples/`.

## Project-local tooling

`.cc-bot/` and `.claude/settings.local.json` are local agent/IM-bot config; they are gitignored except for things you deliberately commit. Don't ship code that depends on either.
