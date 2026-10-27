import { app, nativeImage, net, protocol } from 'electron';
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { IMAGE_EXT, extOf } from '../shared/media';
import { log } from './log';

/**
 * Pictures reach the screen through the dtv: scheme, never as file paths: the screen can only show a thumbnail
 * DeskTV made or a file the main process registered (a chosen tile or hero picture, a screensaver photo), so it
 * can't read anything else on the disk.
 */
const allowed = new Map<string, string>();
const tokens = new Map<string, string>();

export function registerScheme(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: 'dtv', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }
  ]);
}

export function thumbDir(): string {
  const dir = join(app.getPath('userData'), 'thumbs');
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function handleScheme(): void {
  protocol.handle('dtv', (req) => {
    const u = new URL(req.url);
    let file: string | undefined;
    if (u.host === 'thumb' && /^\/[a-z0-9-]{1,60}\.(jpg|png)$/.test(u.pathname)) file = join(thumbDir(), u.pathname.slice(1));
    else if (u.host === 'file') file = allowed.get(u.pathname.slice(1));
    if (!file || !existsSync(file)) return new Response('Not found', { status: 404 });
    return net.fetch(pathToFileURL(file).toString());
  });
}

/** A dtv: address for a picture on disk; only image files are accepted. */
export function exposeImage(path: string): string | null {
  if (!IMAGE_EXT.includes(extOf(path)) || !existsSync(path)) return null;
  let token = tokens.get(path);
  if (!token) {
    token = randomBytes(12).toString('hex');
    tokens.set(path, token);
    allowed.set(token, path);
  }
  return `dtv://file/${token}`;
}

/** macOS's own thumbnail for a file (Quick Look: video frames, album art, photos), cached as a JPEG. */
export async function makeThumbnail(id: string, path: string): Promise<string | null> {
  const out = join(thumbDir(), `${id}.jpg`);
  if (existsSync(out)) return `dtv://thumb/${id}.jpg`;
  try {
    const img = await nativeImage.createThumbnailFromPath(path, { width: 640, height: 360 });
    if (img.isEmpty()) return null;
    await writeFile(out, img.toJPEG(82));
    return `dtv://thumb/${id}.jpg`;
  } catch (e) {
    log('info', `No thumbnail for ${path}`, e);
    return null;
  }
}

/** An app's own icon, as macOS draws it at a large size, cached as a PNG (it keeps its transparency). */
export async function exeIcon(id: string, exe: string): Promise<string | null> {
  const name = `icon-${id}.png`;
  const out = join(thumbDir(), name);
  if (existsSync(out)) return `dtv://thumb/${name}`;
  try {
    const img = await nativeImage.createThumbnailFromPath(exe, { width: 256, height: 256 });
    if (img.isEmpty()) return null;
    await writeFile(out, img.toPNG());
    return `dtv://thumb/${name}`;
  } catch (e) {
    log('info', `No icon for ${exe}`, e);
    return null;
  }
}

export function mediaId(path: string): string {
  return createHash('sha1').update(path.toLowerCase()).digest('hex').slice(0, 16);
}
