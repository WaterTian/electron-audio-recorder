# Electron Audio Recorder

A small macOS desktop app for recording **system audio** (the audio coming
out of your speakers — not your microphone) and storing the recordings
locally on disk for later playback.

Built with Electron 33 and vanilla HTML/CSS/JS in the renderer.

## Features

- **Recording page** — single Start / Stop button, live mm:ss timer, pulsing
  red recording indicator. On stop the recording is saved automatically (no
  dialog), and the Library refreshes.
- **Library page** — newest-first list of all stored recordings showing
  filename, duration, size, and date. Click a row to open an in-app audio
  player with play/pause/seek. Per-row Reveal-in-Finder and Delete buttons.
- macOS-style typography and spacing, automatic dark mode (`prefers-color-scheme`).
- Hash-based routing between the two tabs.

## Important caveat — System audio on macOS

On macOS, capturing system audio requires the user to share their **entire
screen** via the standard macOS screen-share dialog with the **"Share audio"**
checkbox enabled. This is a Chromium / WebRTC requirement, not a bug in
this app:

- `navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })` is
  the only supported way to capture system audio in Chromium on macOS
  (Sonoma 14+ / Chromium 110+).
- If you decline the screen-share dialog, or forget to tick "Share audio",
  the app will surface an error explaining what to do.
- The video track from the screen share is stopped immediately — only the
  audio stream is recorded.
- Tools like BlackHole / Soundflower are **not** required and not used.

## Project layout

```
electron-audio-recorder/
├── package.json
├── README.md
├── entitlements.mac.plist
├── .gitignore
└── src/
    ├── main/
    │   ├── main.js          # app + BrowserWindow + IPC + custom protocol
    │   └── preload.js       # contextBridge: window.recorderAPI
    ├── renderer/
    │   ├── index.html
    │   ├── app.js           # routing
    │   ├── recording.js     # Recording page
    │   ├── library.js       # Library page
    │   └── styles.css
    └── shared/
        └── types.js         # JSDoc shared types
```

## Installing the prebuilt .dmg (unsigned)

Each push to `main` produces an unsigned macOS DMG on the
[Releases page](https://github.com/WaterTian/electron-audio-recorder/releases).
Because the build is not signed with an Apple Developer ID, macOS will show
**"Electron Audio Recorder.app is damaged and can't be opened"** the first
time you try to launch it. Right-click → Open *does not* bypass this on
macOS Sequoia.

**Before mounting the .dmg**, run this in Terminal:

```bash
xattr -d com.apple.quarantine ~/Downloads/Electron.Audio.Recorder-1.0.0-arm64.dmg
```

(Use the `-x64` filename for Intel Macs.) Then double-click the .dmg, drag
the app into Applications, and open it normally.

If you already copied the app into `/Applications` and hit the error, you
can fix it after the fact:

```bash
xattr -cr "/Applications/Electron Audio Recorder.app"
```

## Build + run from source

Requires **Node.js 20+** and macOS 14 (Sonoma) or newer for system-audio
capture. The repo can be installed and built on Windows/Linux too, but
runtime audio capture only works on Mac.

```bash
npm install
npm start
```

The first time you press Start, macOS will prompt you to:

1. Pick a screen to share (choose the whole screen, not a window).
2. Tick **"Share audio"** in the picker.
3. Grant Screen Recording permission to the app under
   *System Settings → Privacy & Security → Screen Recording*. After granting
   you may need to relaunch the app.

## Packaging

```bash
# Quick test build (no installer, output in dist/mac-*)
npm run pack

# Full DMG + zip for both Intel and Apple Silicon
npm run dist
```

`electron-builder` config lives inline in `package.json`. The hardened
runtime entitlements in `entitlements.mac.plist` include
`com.apple.security.device.audio-input` and `com.apple.security.device.camera`
because Chromium requires both for `getDisplayMedia` even when only audio
is captured.

## File storage

Recordings are saved to the per-user app data directory:

- macOS: `~/Library/Application Support/electron-audio-recorder/recordings/`

Filename format: `recording-YYYY-MM-DDTHH-mm-ss.webm` (Opus inside WebM).

A `recordings.json` index file in the same directory tracks
`{ filename, durationMs, sizeBytes, createdAt }` for each recording. The
Library page reads this index on mount. Entries whose backing file no longer
exists are pruned automatically.

The renderer reads recordings via a custom `rec://recording/<filename>`
protocol registered in the main process — `webSecurity` stays enabled and
`nodeIntegration` is off.

## Architecture notes

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: false`.
  The preload script exposes a small `window.recorderAPI` surface
  (`save`, `list`, `delete`, `reveal`, `dir`, `fileUrl`).
- All disk I/O happens in the main process via `ipcMain.handle`.
- The `rec:` scheme is registered as privileged + standard + secure +
  supportFetchAPI + stream, then handled in `app.whenReady()` via
  `protocol.handle('rec', ...)` using `net.fetch(pathToFileURL(...))`.
- Filename validation in the main process restricts `delete`/`reveal`/`rec:`
  requests to the strict `recording-...webm` pattern to prevent path
  traversal.

## Known limitations

- macOS only for actual recording. Windows would need
  `chromeMediaSource: 'desktop'` via `desktopCapturer`, which isn't wired up.
- No pause/resume during recording.
- No editing or trimming — recordings are saved as-is in WebM/Opus.
- No cloud sync, no telemetry, no analytics.
- If you navigate to the Library tab while a recording is in progress, the
  visible timer pauses but the recording itself continues.

## License

MIT.
