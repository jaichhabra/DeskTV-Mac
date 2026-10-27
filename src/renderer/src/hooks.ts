import { useCallback, useEffect, useRef, useState } from 'react';
import { computeLayout, sanitizeViewport, Settler, type Layout, type Viewport } from '../../shared/layout';
import type { Config, DisplayState, Feeds, LibraryState } from '../../shared/types';
import { desk, report, type LiveConfig } from './api';

/** Settings, library, feeds and screens from the main process, kept current through its events. */
export function useDesk() {
  const [config, setConfig] = useState<LiveConfig | null>(null);
  const [library, setLibrary] = useState<LibraryState>({ items: [], scanning: false, scannedAt: null, error: null });
  const [feeds, setFeeds] = useState<Feeds | null>(null);
  const [display, setDisplay] = useState<DisplayState | null>(null);

  useEffect(() => {
    desk.getConfig().then(setConfig, report);
    desk.library().then(setLibrary, report);
    desk.feeds().then(setFeeds, report);
    desk.display().then(setDisplay, report);
    const off = [desk.onConfig(setConfig), desk.onLibrary(setLibrary), desk.onFeeds(setFeeds), desk.onDisplay(setDisplay)];
    return () => off.forEach((f) => f());
  }, []);

  const configRef = useRef(config);
  configRef.current = config;

  /** Changes settings from the latest copy; the main process cleans and saves them, then sends them back. */
  const save = useCallback(async (fn: (c: Config) => Config): Promise<void> => {
    const c = configRef.current;
    if (!c) return;
    try {
      const next = await desk.setConfig(fn(structuredClone(c)));
      setConfig(next);
    } catch (e) {
      report(e);
    }
  }, []);

  return { config, setConfig, library, feeds, setFeeds, display, save };
}

/**
 * The layout for the window's real size, re-measured when it's resized, moved to another screen or the display's
 * scaling changes, and settled first so it doesn't jump (shared/layout). Writes the sizes into CSS variables.
 */
export function useLayout(opts: Pick<Config['display'], 'scale' | 'safeArea'> & { tileSize: Config['appearance']['tileSize'] }): Layout {
  const measure = (): Viewport => sanitizeViewport({ width: window.innerWidth, height: window.innerHeight, dpr: window.devicePixelRatio });
  const [viewport, setViewport] = useState<Viewport>(measure);

  useEffect(() => {
    const settler = new Settler(measure(), setViewport);
    const onResize = (): void => settler.offer(measure());
    window.addEventListener('resize', onResize);
    let mq = matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    const onDpr = (): void => {
      onResize();
      mq.removeEventListener('change', onDpr);
      mq = matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
      mq.addEventListener('change', onDpr);
    };
    mq.addEventListener('change', onDpr);
    return () => {
      settler.dispose();
      window.removeEventListener('resize', onResize);
      mq.removeEventListener('change', onDpr);
    };
  }, []);

  const layout = computeLayout(viewport, { scale: opts.scale, safeArea: opts.safeArea, tileSize: opts.tileSize });

  useEffect(() => {
    const s = document.documentElement.style;
    s.setProperty('--k', `${layout.k}px`);
    s.setProperty('--inset-x', `${layout.insetX}px`);
    s.setProperty('--inset-y', `${layout.insetY}px`);
    s.setProperty('--columns', String(layout.columns));
    s.fontSize = `${16 * layout.k}px`;
    document.documentElement.dataset.shape = layout.shape;
  }, [layout.k, layout.insetX, layout.insetY, layout.columns, layout.shape]);

  return layout;
}

/** The time, updated on the minute (or second), not every frame. */
export function useNow(everySecond = false): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const tick = (): void => {
      const d = new Date();
      setNow(d);
      const wait = everySecond ? 1000 - d.getMilliseconds() : 60_000 - d.getSeconds() * 1000 - d.getMilliseconds();
      t = setTimeout(tick, wait + 20);
    };
    tick();
    return () => clearTimeout(t);
  }, [everySecond]);
  return now;
}

export function useOnline(): boolean {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const on = (): void => setOnline(true);
    const off = (): void => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

export const timeFormat = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
export const dateFormat = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

export function ago(at: number | null, now = Date.now()): string {
  if (!at) return 'never';
  const m = Math.round((now - at) / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} h ago` : `${Math.round(h / 24)} d ago`;
}
