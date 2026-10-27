import { app, BrowserWindow, dialog, globalShortcut, ipcMain, Menu, session, shell } from 'electron';
import { freemem, totalmem, uptime } from 'node:os';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { sanitizeConfig, defaultConfig } from '../shared/config';
import { checkExePath, checkTarget } from '../shared/launch';
import type { Channel } from '../shared/ipc';
import type { Config, MediaKind } from '../shared/types';
import { ConfigStore } from './store';
import { available, findVlc, iconSource, initInstalled, installedApps, launch, openApp, refreshLogos } from './launcher';
import { exeIcon, exposeImage, handleScheme, makeThumbnail, registerScheme } from './files';
import { Library, photosIn } from './library';
import { FeedService } from './feeds';
import { displayState, place, watchDisplays } from './display';
import { log } from './log';
import { networkName } from './network';

/** Brings DeskTV back from any app, as the remote's Home button would (Macs have no Home key). */
const HOME_SHORTCUT = 'Control+Option+Command+T';

// Safe mode: `open -a DeskTV --args --windowed` never goes full screen, whatever the settings say.
const SAFE_MODE = process.argv.includes('--windowed');

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  registerScheme();
  app.on('second-instance', () => bringBack());
  app.whenReady().then(start, (e) => log('error', 'Startup failed', e));
}

let win: BrowserWindow | null = null;
let store: ConfigStore;
let library: Library;
let feeds: FeedService;
let tvMode = false;
let crashes: number[] = [];

function send(channel: string, payload?: unknown): void {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

function start(): void {
  log('info', `DeskTV ${app.getVersion()} starting${SAFE_MODE ? ' in safe mode' : ''}`);
  // The Mac's own menu: ⌘Q, copy and paste in text fields, the window commands. Hidden in TV mode.
  Menu.setApplicationMenu(Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'editMenu' }, { role: 'viewMenu', submenu: [{ role: 'togglefullscreen' }] }, { role: 'windowMenu' }]));
  lockDownSessions();
  handleScheme();

  store = new ConfigStore();
  initInstalled();
  library = new Library((s) => send('library', s));
  feeds = new FeedService(
    () => store.get(),
    (lat, lon, city) => void store.update((c) => ({ ...c, weather: { ...c.weather, lat, lon, city } })),
    (f) => send('feeds', f)
  );
  store.onChange((c) => {
    send('config', withAvailability(c));
    applyStartup(c);
  });

  registerIpc();
  tvMode = !SAFE_MODE && store.get().tv.startInTvMode;
  createWindow();
  applyStartup(store.get());

  watchDisplays(() => {
    if (!win || win.isDestroyed()) return;
    place(win, store.get().display.preferredDisplayId, tvMode);
    send('display', displayState(win));
  });

  if (!globalShortcut.register(HOME_SHORTCUT, bringBack)) log('warn', `Couldn't claim ${HOME_SHORTCUT}`);

  // Slow work after the first frame: the Start menu list, the library and the feeds.
  setTimeout(() => {
    void installedApps(true)
      .then(() => send('config', withAvailability(store.get())))
      .then(refreshLogos)
      .then(() => send('icons'));
    void library.scan(store.get().library.folders);
    feeds.start();
  }, 1500);
}

function createWindow(): void {
  win = new BrowserWindow({
    width: 1600,
    height: 900,
    minWidth: 800,
    minHeight: 450,
    show: false,
    backgroundColor: '#050506',
    title: 'DeskTV',
    autoHideMenuBar: true,
    icon: join(__dirname, '../../build/icon.png'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      webviewTag: false
    }
  });

  place(win, store.get().display.preferredDisplayId, tvMode);
  win.once('ready-to-show', () => win?.show());

  // The screen never leaves DeskTV: links open in the browser, other navigation is refused.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (url !== win?.webContents.getURL()) e.preventDefault();
  });

  for (const ev of ['enter-full-screen', 'leave-full-screen', 'moved', 'resized'] as const) {
    win.on(ev as 'moved', () => send('display', displayState(win)));
  }
  win.on('focus', () => {
    feeds.setActive(true);
    send('return');
  });
  win.on('minimize', () => feeds.setActive(false));
  win.on('restore', () => feeds.setActive(true));

  // If the screen crashes, reload it; if it keeps crashing, leave full screen so the desktop is reachable.
  win.webContents.on('render-process-gone', (_e, details) => {
    log('error', `Screen process gone: ${details.reason}`);
    const now = Date.now();
    crashes = crashes.filter((t) => now - t < 60_000).concat(now);
    if (crashes.length <= 2) win?.webContents.reload();
    else {
      win?.setFullScreen(false);
      void dialog.showMessageBox({ type: 'error', message: 'DeskTV stopped working', detail: 'Its log is in ~/Library/Application Support/DeskTV/logs.' });
    }
  });
  win.webContents.on('unresponsive', () => log('warn', 'Screen not responding'));
  win.webContents.on('did-fail-load', (_e, code, desc) => {
    log('error', `Screen failed to load: ${code} ${desc}`);
    win?.setFullScreen(false);
  });

  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) void win.loadURL(process.env.ELECTRON_RENDERER_URL);
  else void win.loadFile(join(__dirname, '../renderer/index.html'));

  win.on('closed', () => {
    win = null;
  });
}

function bringBack(): void {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function lockDownSessions(): void {
  // No camera, microphone, location or notifications: a launcher needs none of them.
  session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
  app.on('web-contents-created', (_e, wc) => {
    wc.on('will-attach-webview', (e) => e.preventDefault());
  });
}

function applyStartup(c: Config): void {
  // Only the installed app opens at login, not a development copy.
  if (!app.isPackaged) return;
  app.setLoginItemSettings({ openAtLogin: c.tv.startWithWindows });
}

function setTv(on: boolean): void {
  tvMode = on && !SAFE_MODE;
  if (win) place(win, store.get().display.preferredDisplayId, tvMode);
}

async function recordRecent(kind: 'app' | 'media', id: string): Promise<void> {
  await store.update((c) => ({
    ...c,
    recent: [{ kind, id, at: Date.now() }, ...c.recent.filter((r) => !(r.kind === kind && r.id === id))].slice(0, 20)
  }));
}

/** Every request from the screen, each checked here: the screen is never trusted with paths or commands. */
function registerIpc(): void {
  const handle = (channel: Channel, fn: (...args: unknown[]) => unknown): void => {
    ipcMain.handle(channel, async (e, ...args) => {
      if (!win || e.sender !== win.webContents) throw new Error('Not allowed');
      return fn(...args);
    });
  };

  handle('config:get', () => withAvailability(store.get()));
  handle('config:set', async (next) => withAvailability(await store.set(next)));
  handle('config:reset', async () => withAvailability(await store.set(defaultConfig())));
  handle('config:export', async () => {
    if (!win) return false;
    const r = await dialog.showSaveDialog(win, {
      defaultPath: 'desktv-settings.json',
      filters: [{ name: 'DeskTV settings', extensions: ['json'] }]
    });
    if (r.canceled || !r.filePath) return false;
    await writeFile(r.filePath, JSON.stringify(store.get(), null, 2), 'utf8');
    return true;
  });
  handle('config:import', async () => {
    if (!win) return null;
    const r = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: [{ name: 'DeskTV settings', extensions: ['json'] }] });
    if (r.canceled || !r.filePaths[0]) return null;
    const raw: unknown = JSON.parse(await readFile(r.filePaths[0], 'utf8'));
    const next = await store.set(sanitizeConfig(raw));
    void library.scan(next.library.folders);
    return withAvailability(next);
  });

  handle('apps:installed', (refresh) => installedApps(refresh === true));
  handle('apps:icon', async (id) => {
    const entry = store.get().apps.find((a) => a.id === id);
    const src = entry ? iconSource(entry) : null;
    if (!entry || !src) return null;
    return src.kind === 'image' ? exposeImage(src.path) : exeIcon(entry.id, src.path);
  });
  handle('apps:launch', async (id) => {
    const entry = store.get().apps.find((a) => a.id === id);
    if (!entry) return { ok: false, error: 'Unknown app' };
    const r = await launch(entry);
    if (r.ok) await recordRecent('app', entry.id);
    return r;
  });
  handle('media:open', async (id) => {
    const item = typeof id === 'string' ? library.find(id) : undefined;
    if (!item) return { ok: false, error: 'This file is no longer in the library' };
    const vlc = store.get().library.player === 'vlc' ? findVlc() : null;
    if (vlc) openApp(vlc, [item.path]);
    else {
      const err = await shell.openPath(item.path);
      if (err) return { ok: false, error: err };
    }
    await recordRecent('media', item.id);
    return { ok: true, via: 'exe' };
  });

  handle('pick:exe', async () => {
    if (!win) return null;
    const r = await dialog.showOpenDialog(win, { defaultPath: '/Applications', properties: ['openFile'], filters: [{ name: 'Apps', extensions: ['app'] }] });
    const p = r.filePaths[0];
    return !r.canceled && p && checkExePath(p) === null ? p : null;
  });
  handle('pick:image', async () => {
    if (!win) return null;
    const r = await dialog.showOpenDialog(win, {
      properties: ['openFile'],
      filters: [{ name: 'Pictures', extensions: ['jpg', 'jpeg', 'png', 'webp'] }]
    });
    return r.canceled ? null : (r.filePaths[0] ?? null);
  });
  handle('pick:folder', async () => {
    if (!win) return null;
    const r = await dialog.showOpenDialog(win, { properties: ['openDirectory'] });
    return r.canceled ? null : (r.filePaths[0] ?? null);
  });

  handle('open:uri', async (uri) => {
    if (typeof uri !== 'string' || checkTarget({ kind: 'uri', uri }) !== null) return false;
    await shell.openExternal(uri);
    return true;
  });
  handle('network:name', () => networkName());
  handle('library:get', () => library.get());
  handle('library:rescan', () => void library.scan(store.get().library.folders));
  handle('library:add', async (path, kind) => {
    if (typeof path !== 'string' || !['movies', 'shows', 'music', 'photos'].includes(kind as string)) throw new Error('Bad folder');
    const next = await store.update((c) => ({
      ...c,
      library: { ...c.library, folders: [...c.library.folders.filter((f) => f.path !== path), { path, kind: kind as MediaKind }] }
    }));
    void library.scan(next.library.folders);
    return withAvailability(next);
  });
  handle('library:thumb', async (id) => {
    const item = typeof id === 'string' ? library.find(id) : undefined;
    return item ? makeThumbnail(item.id, item.path) : null;
  });
  handle('saver:photos', async () => {
    const dir = store.get().screensaver.photoFolder;
    if (!dir) return [];
    return (await photosIn(dir)).map(exposeImage).filter((u): u is string => !!u);
  });
  handle('image:url', (path) => {
    // Only pictures the settings point at: the hero picture or a tile's.
    const c = store.get();
    const known = path === c.hero.image || c.apps.some((a) => a.image === path);
    return known && typeof path === 'string' ? exposeImage(path) : null;
  });

  handle('feeds:get', () => feeds.get());
  handle('feeds:refresh', () => feeds.refresh());
  handle('system:info', () => ({
    appMemoryMb: Math.round(app.getAppMetrics().reduce((s, m) => s + m.memory.workingSetSize, 0) / 1024),
    freeMemoryMb: Math.round(freemem() / 1048576),
    totalMemoryMb: Math.round(totalmem() / 1048576),
    uptimeHours: Math.round(uptime() / 360) / 10,
    version: app.getVersion()
  }));

  handle('display:get', () => displayState(win));
  handle('window:tv', (on) => setTv(on === true));
  handle('window:minimize', () => win?.minimize());
  handle('app:quit', () => app.quit());

  ipcMain.on('log', (e, level, message) => {
    if (e.sender !== win?.webContents) return;
    if (['info', 'warn', 'error'].includes(level) && typeof message === 'string') log(level, `[screen] ${message.slice(0, 2000)}`);
  });
}

/** The settings plus which apps can open on this Mac, which the screen uses to hide the ones that can't. */
function withAvailability(c: Config): Config & { available: string[] } {
  return { ...c, available: c.apps.filter(available).map((a) => a.id) };
}

app.on('window-all-closed', () => app.quit());
app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  feeds?.stop();
});
process.on('uncaughtException', (e) => log('error', 'Uncaught', e));
process.on('unhandledRejection', (e) => log('error', 'Unhandled rejection', e));
