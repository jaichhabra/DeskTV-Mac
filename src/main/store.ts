import { app } from 'electron';
import { existsSync, readFileSync } from 'node:fs';
import { rename, writeFile, copyFile } from 'node:fs/promises';
import { join } from 'node:path';
import { defaultConfig, sanitizeConfig } from '../shared/config';
import type { Config } from '../shared/types';
import { log } from './log';

/**
 * The settings, as versioned JSON in ~/Library/Application Support/DeskTV/config.json. Writes go to a temporary file that then replaces
 * the old one, and the last good copy stays as config.backup.json, so a power cut mid-write can't lose them.
 */
export class JsonFile<T> {
  private writing: Promise<void> = Promise.resolve();

  constructor(readonly path: string) {}

  read(): unknown {
    for (const p of [this.path, this.path.replace(/\.json$/, '.backup.json')]) {
      if (!existsSync(p)) continue;
      try {
        return JSON.parse(readFileSync(p, 'utf8'));
      } catch (e) {
        log('warn', `Couldn't read ${p}, trying the backup`, e);
      }
    }
    return null;
  }

  /** Writes are queued so two quick saves never interleave. */
  write(value: T): Promise<void> {
    this.writing = this.writing
      .then(async () => {
        const tmp = this.path + '.tmp';
        await writeFile(tmp, JSON.stringify(value, null, 2), 'utf8');
        if (existsSync(this.path)) await copyFile(this.path, this.path.replace(/\.json$/, '.backup.json'));
        await rename(tmp, this.path);
      })
      .catch((e) => log('error', `Couldn't save ${this.path}`, e));
    return this.writing;
  }
}

export class ConfigStore {
  private file = new JsonFile<Config>(join(app.getPath('userData'), 'config.json'));
  private value: Config;
  private listeners: ((c: Config) => void)[] = [];

  constructor() {
    const raw = this.file.read();
    this.value = raw ? sanitizeConfig(raw) : defaultConfig();
    if (!raw) void this.file.write(this.value);
  }

  get(): Config {
    return this.value;
  }

  async set(next: unknown): Promise<Config> {
    this.value = sanitizeConfig(next);
    await this.file.write(this.value);
    for (const l of this.listeners) l(this.value);
    return this.value;
  }

  update(fn: (c: Config) => Config): Promise<Config> {
    return this.set(fn(structuredClone(this.value)));
  }

  onChange(l: (c: Config) => void): void {
    this.listeners.push(l);
  }
}
