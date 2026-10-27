import { app } from 'electron';
import { appendFileSync, mkdirSync, renameSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** A plain log in ~/Library/Application Support/DeskTV/logs, rolled over at 1 MB, for when something goes wrong on the TV. */
let file = '';

function path(): string {
  if (!file) {
    const dir = join(app.getPath('userData'), 'logs');
    mkdirSync(dir, { recursive: true });
    file = join(dir, 'desktv.log');
  }
  return file;
}

export function log(level: 'info' | 'warn' | 'error', message: string, err?: unknown): void {
  const detail = err instanceof Error ? ` ${err.message}` : err !== undefined ? ` ${String(err)}` : '';
  const line = `${new Date().toISOString()} ${level.toUpperCase()} ${message}${detail}\n`;
  if (!app.isPackaged) process.stdout.write(line);
  try {
    const p = path();
    try {
      if (statSync(p).size > 1_000_000) renameSync(p, p + '.1');
    } catch {
      // No log yet.
    }
    appendFileSync(p, line);
  } catch {
    // Logging must never break the app.
  }
}

export function logDir(): string {
  return join(app.getPath('userData'), 'logs');
}
