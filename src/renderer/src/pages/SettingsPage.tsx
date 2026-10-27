import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Config, Motion } from '../../../shared/types';
import { desk, report } from '../api';
import { pushBack, useDeskContext } from '../context';
import { focusScope } from '../focus';
import { Glyph } from '../components/Icon';

type Screen = 'main' | 'home' | 'shelf' | 'saver' | 'library' | 'screen' | 'desktv';

const TITLES: Record<Screen, string> = {
  main: '',
  home: 'Home Settings',
  shelf: 'Shelf',
  saver: 'Screensaver',
  library: 'Library',
  screen: 'Screen and TV Mode',
  desktv: 'DeskTV'
};

const IDLE = [1, 2, 5, 10, 15, 30, 60];
const SCALES: Config['display']['scale'][] = ['auto', 0.8, 0.9, 1, 1.1, 1.2, 1.35, 1.5];
const SAFE = [0, 2.5, 5, 7.5, 10];
const COINS = ['BTC', 'ETH', 'SOL', 'XRP', 'DOGE'];
const COIN_NAMES: Record<string, string> = { BTC: 'Bitcoin', ETH: 'Ethereum', SOL: 'Solana', XRP: 'XRP', DOGE: 'Dogecoin' };

function step<T>(all: readonly T[], v: T, dir: 1 | -1): T {
  const i = all.findIndex((x) => JSON.stringify(x) === JSON.stringify(v));
  return all[(Math.max(0, i) + dir + all.length) % all.length];
}

/** One line of the list: its name, its value on the right, › when it opens more. OK or ← → change it. */
function Row({
  label,
  value,
  open,
  run,
  change,
  k,
  danger,
  hint
}: {
  label: string;
  value?: ReactNode;
  open?: boolean;
  run?(): void;
  change?(dir: 1 | -1): void;
  k: string;
  danger?: boolean;
  hint?: string;
}) {
  return (
    <div data-row>
      <button
        className={`set-row${danger ? ' danger' : ''}`}
        data-item
        data-key={k}
        onClick={() => (run ? run() : change?.(1))}
        onKeyDown={(e) => {
          if (change && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
            e.preventDefault();
            change(e.key === 'ArrowRight' ? 1 : -1);
          }
        }}
      >
        <span className="set-label">
          {label}
          {hint && <span className="set-hint">{hint}</span>}
        </span>
        {value !== undefined && <span className="set-value">{value}</span>}
        {open && <Glyph name="chevron" size="calc(34 * var(--k))" />}
      </button>
    </div>
  );
}

function Heading({ children }: { children: ReactNode }) {
  return <div className="set-heading">{children}</div>;
}

const onOff = (b: boolean): string => (b ? 'On' : 'Off');

/** A row whose value is typed: OK opens the field, OK again saves it. */
function TextRow({ label, value, placeholder, save, k }: { label: string; value: string; placeholder: string; save(v: string): void; k: string }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (editing) input.current?.focus();
  }, [editing]);
  if (!editing) return <Row k={k} label={label} value={value || placeholder} run={() => (setText(value), setEditing(true))} />;
  return (
    <div data-row>
      <label className="set-row editing">
        <span className="set-label">{label}</span>
        <input
          ref={input}
          data-item
          data-key={k}
          className="set-input"
          value={text}
          maxLength={80}
          placeholder={placeholder}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              save(text.trim());
              setEditing(false);
            } else if (e.key === 'Escape') {
              e.preventDefault();
              e.stopPropagation();
              setEditing(false);
            }
          }}
          onBlur={() => setEditing(false)}
        />
      </label>
    </div>
  );
}

/** SundarTV's settings: the brand on the left, the list in frosted glass on the right, over a slow gradient. */
export function SettingsPage() {
  const d = useDeskContext();
  const c = d.config;
  const [stack, setStack] = useState<Screen[]>(['main']);
  const screen = stack[stack.length - 1];
  const panel = useRef<HTMLDivElement>(null);
  const set = (fn: (x: Config) => void): void =>
    void d.save((x) => {
      fn(x);
      return x;
    });
  const open = (s: Screen) => () => setStack([...stack, s]);

  // Back closes a sub-screen first.
  useEffect(() => (stack.length > 1 ? pushBack(() => setStack((s) => s.slice(0, -1))) : undefined), [stack.length]);
  useEffect(() => {
    panel.current?.scrollTo({ top: 0 });
    requestAnimationFrame(() => focusScope());
  }, [screen]);

  const displays = d.display?.displays ?? [];
  const cur = d.display?.current;

  let rows: ReactNode;
  switch (screen) {
    case 'main':
      rows = (
        <>
          <Row k="m:tv" label="TV Mode" value={onOff(!!d.display?.fullscreen)} change={() => void desk.setTvMode(!d.display?.fullscreen)} />
          <Row k="m:saver" label="Screensaver" value="Preview" run={d.startSaver} />
          <Row k="m:home" label="Home Settings" open run={open('home')} />
          <Row k="m:shelf" label="Shelf" open run={open('shelf')} />
          <Row k="m:sv" label="Screensaver Settings" open run={open('saver')} />
          <Row k="m:lib" label="Library" open run={open('library')} />
          <Row k="m:screen" label="Screen and TV Mode" open run={open('screen')} />
          <Row k="m:desktv" label="DeskTV" open run={open('desktv')} />
          <Heading>Leave DeskTV</Heading>
          <Row k="m:min" label="Show the Desktop" hint="⌃⌥⌘T brings DeskTV back" run={() => void desk.minimize()} />
          <Row k="m:quit" label="Quit" run={() => void desk.quit()} />
        </>
      );
      break;
    case 'home':
      rows = (
        <>
          <Row k="h:temp" label="Temperature" value={c.weather.fahrenheit ? '°F' : '°C'} change={() => set((x) => void (x.weather.fahrenheit = !x.weather.fahrenheit))} />
          <Row k="h:weather" label="Weather widget" value={onOff(c.widgets.weather)} change={() => set((x) => void (x.widgets.weather = !x.widgets.weather))} />
          <TextRow
            k="h:city"
            label="City"
            value={c.weather.city}
            placeholder="Choose…"
            save={(v) => {
              set((x) => {
                x.weather.city = v;
                x.weather.lat = null;
                x.weather.lon = null;
              });
              setTimeout(() => void desk.refreshFeeds().catch(report), 300);
            }}
          />
          <Row k="h:clock" label="Clock" value={onOff(c.widgets.clock)} change={() => set((x) => void (x.widgets.clock = !x.widgets.clock))} />
          <Row k="h:net" label="Network name" value={onOff(c.widgets.network)} change={() => set((x) => void (x.widgets.network = !x.widgets.network))} />
          <Row k="h:prices" label="Prices widget" value={onOff(c.widgets.crypto)} change={() => set((x) => void (x.widgets.crypto = !x.widgets.crypto))} />
          {c.widgets.crypto &&
            COINS.map((coin) => (
              <Row
                key={coin}
                k={`h:coin:${coin}`}
                label={COIN_NAMES[coin]}
                value={onOff(c.crypto.coins.includes(coin))}
                change={() =>
                  set((x) => {
                    const on = x.crypto.coins.includes(coin);
                    x.crypto.coins = on ? x.crypto.coins.filter((y) => y !== coin) : COINS.filter((y) => y === coin || x.crypto.coins.includes(y));
                  })
                }
              />
            ))}
          <Row k="h:sounds" label="Navigation sounds" value={onOff(c.appearance.sounds)} change={() => set((x) => void (x.appearance.sounds = !x.appearance.sounds))} />
          <Row
            k="h:motion"
            label="Motion"
            value={{ full: 'Full', reduced: 'Reduced', off: 'Off' }[c.appearance.motion]}
            change={(s) => set((x) => void (x.appearance.motion = step<Motion>(['full', 'reduced', 'off'], x.appearance.motion, s)))}
          />
          <Row
            k="h:bg"
            label="Background"
            value={c.hero.image ? 'Picture' : 'Weather sky'}
            run={() =>
              c.hero.image
                ? set((x) => void (x.hero.image = null))
                : desk.pickImage().then((p) => p && set((x) => void (x.hero.image = p)), report)
            }
          />
        </>
      );
      break;
    case 'shelf':
      rows = (
        <>
          {c.apps.map((a) => (
            <Row
              key={a.id}
              k={`s:${a.id}`}
              label={a.name}
              value={a.pinned ? <Glyph name="check" size="1.1em" /> : ''}
              change={() => set((x) => void (x.apps = x.apps.map((y) => (y.id === a.id ? { ...y, pinned: !y.pinned, hidden: false } : y))))}
            />
          ))}
          <Heading>More</Heading>
          <Row k="s:add" label="Add an App" open run={() => d.editApp(null)} />
          <Row k="s:all" label="All Apps" hint="Hold OK on an app there to move or edit it" open run={() => d.go('apps')} />
        </>
      );
      break;
    case 'saver':
      rows = (
        <>
          <Row k="v:on" label="Screensaver" value={onOff(c.screensaver.enabled)} change={() => set((x) => void (x.screensaver.enabled = !x.screensaver.enabled))} />
          <Row k="v:preview" label="Preview" run={d.startSaver} />
          <Row k="v:idle" label="Starts after" value={`${c.screensaver.idleMinutes} min`} change={(s) => set((x) => void (x.screensaver.idleMinutes = step(IDLE, x.screensaver.idleMinutes, s)))} />
          <Row k="v:quotes" label="Quotes" value={onOff(c.screensaver.quotes)} change={() => set((x) => void (x.screensaver.quotes = !x.screensaver.quotes))} />
          <Row k="v:weather" label="Weather" value={onOff(c.screensaver.weather)} change={() => set((x) => void (x.screensaver.weather = !x.screensaver.weather))} />
          <Row
            k="v:photos"
            label="Photos"
            value={c.screensaver.photoFolder ? (c.screensaver.photoFolder.split(/[\\/]/).pop() ?? 'Folder') : 'Off'}
            run={() =>
              c.screensaver.photoFolder
                ? set((x) => void (x.screensaver.photoFolder = null))
                : desk.pickFolder().then((p) => p && set((x) => void (x.screensaver.photoFolder = p)), report)
            }
          />
        </>
      );
      break;
    case 'library':
      rows = (
        <>
          {c.library.folders.map((f) => (
            <Row
              key={f.path}
              k={`l:${f.path}`}
              label={f.path.split(/[\\/]/).pop() || f.path}
              hint={f.path}
              value="Remove"
              run={() => {
                set((x) => void (x.library.folders = x.library.folders.filter((y) => y.path !== f.path)));
                setTimeout(() => void desk.rescanLibrary().catch(report), 300);
              }}
            />
          ))}
          <Row k="l:open" label="Add Folders" open run={() => d.go('library')} />
          <Row k="l:player" label="Play files with" value={c.library.player === 'vlc' ? 'VLC' : 'Mac default'} change={() => set((x) => void (x.library.player = x.library.player === 'vlc' ? 'system' : 'vlc'))} />
          <Row k="l:rescan" label="Rescan" value={d.library.scanning ? 'Scanning…' : `${d.library.items.length} files`} run={() => void desk.rescanLibrary().catch(report)} />
        </>
      );
      break;
    case 'screen':
      rows = (
        <>
          <Row k="d:tv" label="TV Mode" hint="Full screen. ⌃⌘F switches it too." value={onOff(!!d.display?.fullscreen)} change={() => void desk.setTvMode(!d.display?.fullscreen)} />
          <Row k="d:start" label="Open in TV Mode" value={onOff(c.tv.startInTvMode)} change={() => set((x) => void (x.tv.startInTvMode = !x.tv.startInTvMode))} />
          <Row k="d:login" label="Open at Login" value={onOff(c.tv.startWithWindows)} change={() => set((x) => void (x.tv.startWithWindows = !x.tv.startWithWindows))} />
          <Row
            k="d:display"
            label="Screen"
            value={c.display.preferredDisplayId === null ? 'Main screen' : (displays.find((x) => x.id === c.display.preferredDisplayId)?.label ?? 'Not connected')}
            change={(s) => set((x) => void (x.display.preferredDisplayId = step([null, ...displays.map((y) => y.id)], x.display.preferredDisplayId, s)))}
          />
          <Row
            k="d:scale"
            label="Size"
            value={c.display.scale === 'auto' ? 'Automatic' : `${Math.round(c.display.scale * 100)}%`}
            change={(s) => set((x) => void (x.display.scale = step(SCALES, x.display.scale, s)))}
          />
          <Row k="d:safe" label="Edge margin" hint="For TVs that cut off the edges" value={`${c.display.safeArea}%`} change={(s) => set((x) => void (x.display.safeArea = step(SAFE, x.display.safeArea, s)))} />
          {cur && (
            <>
              <Heading>This Screen</Heading>
              <div className="set-info">
                <span>{cur.label}</span>
                <span>
                  {cur.physicalWidth} × {cur.physicalHeight}
                </span>
              </div>
              <div className="set-info">
                <span>Display scaling</span>
                <span>{Math.round(cur.scaleFactor * 100)}%</span>
              </div>
              <div className="set-info">
                <span>Refresh rate</span>
                <span>{cur.refreshRate} Hz</span>
              </div>
              <div className="set-info">
                <span>Layout</span>
                <span>
                  {d.layout.shape} · {Math.round(d.layout.k * 100)}%{d.display?.fallback ? ' · estimated' : ''}
                </span>
              </div>
            </>
          )}
        </>
      );
      break;
    case 'desktv':
      rows = (
        <>
          <Row k="x:export" label="Export Settings" run={() => desk.exportConfig().then((ok) => ok && d.toast('Settings exported'), report)} />
          <Row k="x:import" label="Import Settings" run={() => desk.importConfig().then((cfg) => cfg && d.toast('Settings imported'), report)} />
          <Row
            k="x:reset"
            label="Reset Settings"
            danger
            run={() =>
              d.menu('Reset all settings?', [
                { label: 'Reset', danger: true, run: () => void desk.resetConfig().then(() => d.toast('Settings reset'), report) },
                { label: 'Cancel', run: () => undefined }
              ])
            }
          />
          <Heading>Notices</Heading>
          <div className="set-note">Weather from Open-Meteo. Prices from Binance. The log is in ~/Library/Application Support/DeskTV/logs.</div>
        </>
      );
      break;
  }

  return (
    <div className="settings" data-scope="settings">
      <div className="settings-bg" aria-hidden="true">
        <span className="sb a" />
        <span className="sb b" />
        <span className="sb c" />
      </div>
      <div className="settings-brand glass">
        <Glyph name="sparkles" size="calc(150 * var(--k))" />
        <div className="brand-name">DeskTV</div>
        <div className="brand-sub">Your Mac's TV home screen</div>
        <div className="brand-ver">DeskTV {d.version}</div>
      </div>
      <div className="settings-panel glass">
        {screen !== 'main' && <h2 className="set-title">{TITLES[screen]}</h2>}
        <div className="set-list" data-scroller ref={panel} key={screen}>
          {rows}
        </div>
        {screen !== 'main' && <div className="set-foot">OK or the arrows change the value.</div>}
      </div>
    </div>
  );
}
