import { app, shell } from 'electron';
import { spawn } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import { checkAppId, checkTarget, findStartApp } from '../shared/launch';
import type { AppEntry, InstalledApp, LaunchResult, LaunchTarget } from '../shared/types';
import { JsonFile } from './store';
import { log } from './log';

/**
 * Finds the Mac's installed apps where macOS keeps them (the Applications folders, and one folder deep inside them)
 * and opens them with `open -a`, as Finder does. An app's id is its .app path. The list is cached, so the home
 * screen never waits for the disk.
 */
let installed: InstalledApp[] = [];
let loading: Promise<InstalledApp[]> | null = null;
let cache: JsonFile<InstalledApp[]>;

const APP_DIRS = ['/Applications', '/Applications/Utilities', '/System/Applications', '/System/Applications/Utilities', join(homedir(), 'Applications')];

export function initInstalled(): void {
  cache = new JsonFile(join(app.getPath('userData'), 'installed-apps.json'));
  const raw = cache.read();
  if (Array.isArray(raw)) installed = raw.filter(isInstalledApp);
}

function isInstalledApp(v: unknown): v is InstalledApp {
  const a = v as InstalledApp;
  return !!a && typeof a.name === 'string' && typeof a.appId === 'string';
}

/** Kept for the Windows edition's interface: macOS draws app icons from the .app itself. */
export function refreshLogos(): Promise<void> {
  return Promise.resolve();
}

/** Where an app's own icon is: its .app bundle (macOS draws its icon). Null when it isn't installed. */
export function iconSource(entry: AppEntry): { kind: 'image' | 'exe'; path: string } | null {
  for (const t of entry.launch) {
    if (t.kind === 'exe' && existsSync(t.path)) return { kind: 'exe', path: t.path };
    if (t.kind !== 'startApp') continue;
    const found = findStartApp(installed, t.match);
    if (found && existsSync(found.appId)) return { kind: 'exe', path: found.appId };
  }
  return null;
}

async function appsIn(dir: string, depth: number): Promise<InstalledApp[]> {
  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    return [];
  }
  const out: InstalledApp[] = [];
  for (const n of names) {
    if (n.startsWith('.')) continue;
    const path = join(dir, n);
    if (n.toLowerCase().endsWith('.app')) out.push({ name: basename(n, '.app'), appId: path });
    // Apps in a folder of their own (Setapp, Adobe and others).
    else if (depth > 0 && !APP_DIRS.includes(path)) out.push(...(await appsIn(path, depth - 1)));
  }
  return out;
}

export function installedApps(refresh = false): Promise<InstalledApp[]> {
  if (process.platform !== 'darwin') return Promise.resolve([]);
  if (!refresh && installed.length) return Promise.resolve(installed);
  if (loading) return loading;
  loading = (async () => {
    try {
      const found = (await Promise.all(APP_DIRS.map((d) => appsIn(d, 1)))).flat().filter((a) => checkAppId(a.appId) === null);
      // The first of two same-named apps wins: /Applications before the system's own.
      const seen = new Set<string>();
      installed = found.filter((a) => !seen.has(a.name.toLowerCase()) && seen.add(a.name.toLowerCase()));
      void cache.write(installed);
      log('info', `Found ${installed.length} installed apps`);
    } catch (e) {
      log('warn', 'Reading the Applications folders failed', e);
    } finally {
      loading = null;
    }
    return installed;
  })();
  return loading;
}

/** Whether any of an app's ways to open can work on this Mac. */
export function available(entry: AppEntry): boolean {
  return entry.launch.some((t) => {
    if (t.kind === 'startApp') return !!findStartApp(installed, t.match);
    if (t.kind === 'exe') return existsSync(t.path);
    return true;
  });
}

export async function launch(entry: AppEntry): Promise<LaunchResult> {
  const errors: string[] = [];
  for (const t of entry.launch) {
    const problem = checkTarget(t);
    if (problem) {
      errors.push(problem);
      continue;
    }
    try {
      if (await open(t)) {
        log('info', `Opened ${entry.name} via ${t.kind}`);
        return { ok: true, via: t.kind };
      }
    } catch (e) {
      log('warn', `Couldn't open ${entry.name} via ${t.kind}`, e);
      errors.push(e instanceof Error ? e.message : String(e));
    }
  }
  return { ok: false, error: errors[0] ?? `${entry.name} isn't installed on this Mac` };
}

/** Opens one target; false when it doesn't apply here (say, the app isn't installed), so the next one is tried. */
async function open(t: LaunchTarget): Promise<boolean> {
  switch (t.kind) {
    case 'startApp': {
      const found = findStartApp(installed, t.match);
      if (!found || !existsSync(found.appId)) return false;
      openApp(found.appId);
      return true;
    }
    case 'exe': {
      if (!existsSync(t.path) || !statSync(t.path).isDirectory()) return false;
      openApp(t.path, t.args);
      return true;
    }
    case 'uri':
    case 'url':
      await shell.openExternal(t.kind === 'url' ? t.url : t.uri);
      return true;
  }
}

/** Opens an .app (and files in it) with macOS's `open`, without a shell, so DeskTV closing never takes it along. */
export function openApp(appPath: string, files: string[] = []): void {
  const child = spawn('/usr/bin/open', ['-a', appPath, ...files], { detached: true, stdio: 'ignore', shell: false });
  child.on('error', (e) => log('warn', `Couldn't open ${appPath}`, e));
  child.unref();
}

/** VLC, for playing local files with it. */
export function findVlc(): string | null {
  for (const p of ['/Applications/VLC.app', join(homedir(), 'Applications', 'VLC.app')]) if (existsSync(p)) return p;
  return null;
}
