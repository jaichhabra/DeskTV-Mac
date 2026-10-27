# DeskTV for Mac

A cinematic, full-screen home screen for a Mac on a TV, monitor or projector: what an Apple TV would feel like if it
lived inside your Mac. Your streaming apps, your own movies and music, the time and weather, and a quote
screensaver, all driven by a keyboard, mouse, remote or controller.

It looks and feels like [SundarTV](https://github.com/jaichhabra/sundartv), the ad-free Android TV home screen: the
same weather sky (ported from SundarTV's `WeatherSky`: clear, cloudy, fog, rain on the glass, snow and storms, by
day, at dusk and at night), the date, the large clock, the weather and prices on the left, round glass buttons at the
top right, the glass shelf of apps that rises to open the drawer, SundarTV's settings and its quote screensaver.
Everything is laid out on SundarTV's 1920 × 1080 stage and scaled to the screen, as a TV would.

This is the Mac edition of [DeskTV](https://github.com/jaichhabra/DeskTV), which is for Windows.

Made by JC.

![DeskTV's home screen at dusk](docs/screenshots/home-dusk.png)

## What it does

- **Home screen.** The date, a large clock, the weather and prices over a live weather sky, round glass buttons
  (network, search, library, all apps, settings, power), and the glass shelf of apps. Down from the shelf opens the
  drawer: the library, shortcuts, an hourly weather card and a prices card. Soft navigation sounds.
- **Opens the real apps.** Netflix, Prime Video, YouTube, Spotify, YouTube Music, Apple TV, JioHotstar, Plex, VLC,
  a browser, Steam and Xbox come set up. Each opens its Mac app when Applications has one (the Mac's TV app, Prime
  Video, Spotify, Plex, VLC, Steam), and otherwise its official website in your default browser. Netflix and
  JioHotstar have no Mac app, so they open in the browser. Add any website or app, rename apps, change their picture
  and color, pin, hide and reorder them.
- **Logos.** Bundled art for the built-in services; the app's own Mac icon for apps you add; any tile can use a
  picture you choose.
- **Your library.** Only the folders you add (movies, TV shows, music, photos), read in the background, with the
  Mac's own Quick Look thumbnails. Files play in VLC or the Mac's default app.
- **Search** across apps, the library and recently opened.
- **Widgets, all optional:** the clock, weather (Open-Meteo, no account), crypto prices (Binance's public prices),
  the network's name.
- **Screensaver** after a delay you choose: the frosted sky or your photos, the time, the weather and a quote every
  45 seconds. It only starts while DeskTV is in front, never over a film in another app.
- **TV mode.** Full screen on the screen you pick, optionally when you log in.
- **Works offline.** Nothing waits for the network; weather and prices show their last values.

## Using it

| | Keyboard / remote | Controller |
| --- | --- | --- |
| Move | Arrow keys | D-pad or left stick |
| Open | Return | A |
| Menu for an app (pin, move, edit, hide) | Hold Return | Hold A, or Y |
| Back | Esc or Delete | B |
| Open the drawer | ↓ from the shelf | ↓ |
| Search | `/` or ⌘F | |
| TV mode on or off | ⌃⌘F | |
| Bring DeskTV back from any app | ⌃⌥⌘T | |

The mouse and trackpad work too: pointing focuses, clicking opens, right-click opens an app's menu.

**Getting out:** Esc on the home screen (or the power button at the top right) offers *Show the Desktop*, *Leave TV
Mode* and *Quit*; ⌘Q and ⌘Tab always work. If it ever misbehaves, start it windowed:
`open -a DeskTV --args --windowed`.

**The network capsule** shows your Wi-Fi's name where macOS allows it. Recent macOS versions keep the name private
from apps without Location access; then it says *Connected*.

## Install

GitHub Actions builds the app on a Mac on every push: **Actions → Build → artifact *DeskTV-mac*** holds
`DeskTV-<version>-arm64.dmg` (Apple Silicon: M1 and later) and `DeskTV-<version>-x64.dmg` (Intel Macs).

1. Open the DMG and drag DeskTV to Applications.
2. The first time, **right-click DeskTV in Applications and choose Open**, then Open again. DeskTV isn't signed with
   an Apple Developer ID yet (it's signed ad hoc), so macOS asks once. If macOS says it can't be opened, go to
   System Settings → Privacy & Security and choose *Open Anyway*.

### From the source

Needs a Mac with [Node.js](https://nodejs.org) 22.

```bash
npm install
npm run dev        # live-reloading app
npm test           # unit tests (Vitest)
npm run typecheck
npm run dist       # typecheck, test, build and make the DMGs in dist/
```

## How it's built

Electron + React + TypeScript + Vite (electron-vite), packaged by electron-builder.

- `src/main/`: the system side. `launcher.ts` finds apps in /Applications, /System/Applications and
  ~/Applications and opens them with `open -a`; websites go to the default browser. `network.ts` asks
  `networksetup` for the Wi-Fi's name. `display.ts` measures the screens and moves the window when they change.
  `library.ts` walks the added folders a few files at a time. `feeds.ts` fetches weather and prices only while a
  widget needs them. `store.ts` saves settings atomically with a backup. `files.ts` serves pictures to the screen
  through the `dtv:` scheme, never as paths.
- `src/preload/`: the screen's only door to the system, a typed list of calls.
- `src/renderer/`: the screen. `sky.ts` is SundarTV's weather sky; `focus.ts` and `input.ts` are the remote-style
  focus and the keyboard, mouse and Gamepad input.
- `src/shared/`: what both sides use, and what the tests cover: settings and their validation, the screen-aware
  layout, launch rules, file names to titles and episodes, focus movement.
- `build/afterPack.cjs` signs each built app ad hoc, which Apple Silicon needs to run it.

**Security.** Context isolation, a sandboxed screen without Node, a strict Content Security Policy (no network from
the screen), validated IPC from the one window only, navigation and new windows refused, all permissions denied, only
https/http websites and a short list of documented app links, only `.app` apps the person picked, and settings
re-validated on every load and import.

**Settings and logs:** `~/Library/Application Support/DeskTV/`: `config.json` (with a backup), the library index,
cached weather and prices, thumbnails, and `logs/desktv.log`. Settings exported from DeskTV for Windows import here.

## License

MIT (see `LICENSE`). Inter is under the SIL Open Font License; Material Symbols under the Apache License 2.0; brand
marks come from Simple Icons (CC0) and belong to their owners; see `NOTICE.md`.
