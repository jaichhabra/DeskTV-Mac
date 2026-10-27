import { BrowserWindow, screen, type Display } from 'electron';
import type { DisplayInfo, DisplayState } from '../shared/types';
import { log } from './log';

/**
 * Which screens macOS has and which one DeskTV is on, measured and reported; the layout decides what to do with
 * it (shared/layout). Screens coming and going are settled for half a second before DeskTV moves, so a projector or
 * TV that flickers while it starts doesn't throw the window around.
 */
const FALLBACK: DisplayInfo = {
  id: -1,
  label: 'Unknown screen',
  primary: true,
  width: 1920,
  height: 1080,
  workWidth: 1920,
  workHeight: 1080,
  scaleFactor: 1,
  physicalWidth: 1920,
  physicalHeight: 1080,
  refreshRate: 60,
  internal: false
};

export function describe(d: Display, primaryId: number): DisplayInfo {
  return {
    id: d.id,
    label: d.label || `Screen ${d.id}`,
    primary: d.id === primaryId,
    width: d.bounds.width,
    height: d.bounds.height,
    workWidth: d.workArea.width,
    workHeight: d.workArea.height,
    scaleFactor: d.scaleFactor,
    physicalWidth: Math.round(d.bounds.width * d.scaleFactor),
    physicalHeight: Math.round(d.bounds.height * d.scaleFactor),
    refreshRate: d.displayFrequency || 60,
    internal: d.internal
  };
}

export function displayState(win: BrowserWindow | null): DisplayState {
  try {
    const primary = screen.getPrimaryDisplay();
    const all = screen.getAllDisplays().map((d) => describe(d, primary.id));
    const on = win && !win.isDestroyed() ? screen.getDisplayMatching(win.getBounds()) : primary;
    return {
      displays: all,
      current: describe(on, primary.id),
      fallback: false,
      fullscreen: !!win && !win.isDestroyed() && win.isFullScreen()
    };
  } catch (e) {
    log('warn', 'Could not read the screens, using 1920 × 1080', e);
    return { displays: [FALLBACK], current: FALLBACK, fallback: true, fullscreen: !!win?.isFullScreen() };
  }
}

/** The screen DeskTV belongs on: the chosen one while it's connected, else the main one. */
export function targetDisplay(preferredId: number | null): Display {
  const all = screen.getAllDisplays();
  return all.find((d) => d.id === preferredId) ?? screen.getPrimaryDisplay();
}

/** Puts the window on a screen, full screen in TV mode or as a centered window otherwise. */
export function place(win: BrowserWindow, preferredId: number | null, tv: boolean): void {
  const d = targetDisplay(preferredId);
  const current = screen.getDisplayMatching(win.getBounds());
  const moving = current.id !== d.id;
  if (moving && win.isFullScreen()) win.setFullScreen(false);
  if (moving || !tv) {
    const w = Math.min(1600, Math.round(d.workArea.width * 0.8));
    const h = Math.min(900, Math.round(d.workArea.height * 0.8));
    win.setBounds({
      x: d.workArea.x + Math.round((d.workArea.width - w) / 2),
      y: d.workArea.y + Math.round((d.workArea.height - h) / 2),
      width: w,
      height: h
    });
  }
  if (tv !== win.isFullScreen()) win.setFullScreen(tv);
  log('info', `On ${d.label || d.id} (${d.bounds.width}×${d.bounds.height} @${d.scaleFactor}x), ${tv ? 'TV mode' : 'windowed'}`);
}

export function watchDisplays(onSettled: () => void): void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const settle = (why: string) => () => {
    log('info', `Screens changed: ${why}`);
    if (timer) clearTimeout(timer);
    timer = setTimeout(onSettled, 500);
  };
  screen.on('display-added', settle('added'));
  screen.on('display-removed', settle('removed'));
  screen.on('display-metrics-changed', settle('resized or rescaled'));
}
