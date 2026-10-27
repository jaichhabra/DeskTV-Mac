import { useEffect, useRef, useState, type CSSProperties, type FocusEvent } from 'react';
import { describeWeather } from '../../../shared/weather';
import type { CoinPrice } from '../../../shared/types';
import { desk, report } from '../api';
import { isAvailable, useDeskContext, type Page } from '../context';
import { useNow } from '../hooks';
import { Glyph, Symbol, weatherSymbol, type GlyphName } from '../components/Icon';
import { ActionTile, AppTile } from '../components/Tiles';

/**
 * SundarTV's home screen: the date, a large clock, the weather and prices on the left over the sky, round glass
 * buttons at the top right, the glass shelf of apps at the bottom. Down from the shelf, it rises and the drawer opens
 * below it: the library and shortcuts, then the weather and prices cards.
 */
export function Home() {
  const d = useDeskContext();
  const c = d.config;
  const [drawer, setDrawer] = useState(false);
  const shelf = c.apps.filter((a) => a.pinned && !a.hidden && isAvailable(c, a));

  // The drawer is open while focus is in it.
  const onFocus = (e: FocusEvent): void => setDrawer(!!(e.target as Element).closest('.drawer'));

  return (
    <div className={`home${drawer ? ' drawer-open' : ''}`} data-scope="home" onFocus={onFocus}>
      <TopButtons />
      <Hero />
      <section className="shelf-wrap" aria-label="Apps">
        <div className="shelf glass" data-row style={{ '--n': Math.max(1, shelf.length) } as CSSProperties}>
          {shelf.map((a, i) => (
            <AppTile key={a.id} app={a} list={shelf.map((x) => x.id)} autoFocus={i === 0} />
          ))}
          {!shelf.length && (
            <button className="shelf-empty" data-item data-key="shelf:empty" onClick={() => d.go('apps')}>
              Choose apps for the shelf
            </button>
          )}
        </div>
      </section>
      <Drawer />
    </div>
  );
}

const BUTTONS: { page: Page; glyph: GlyphName; label: string }[] = [
  { page: 'search', glyph: 'search', label: 'Search' },
  { page: 'library', glyph: 'library', label: 'Library' },
  { page: 'apps', glyph: 'apps', label: 'All Apps' }
];

function useNetworkName(): string | null {
  const [name, setName] = useState<string | null>(null);
  useEffect(() => {
    const load = (): void => void desk.networkName().then(setName, report);
    load();
    const t = setInterval(load, 60_000);
    window.addEventListener('online', load);
    window.addEventListener('offline', load);
    return () => {
      clearInterval(t);
      window.removeEventListener('online', load);
      window.removeEventListener('offline', load);
    };
  }, []);
  return name;
}

function TopButtons() {
  const d = useDeskContext();
  const net = useNetworkName();
  const online = navigator.onLine && d.feeds?.online !== false;
  return (
    <nav className="top-buttons" data-row aria-label="Menu">
      {d.config.widgets.network && (
        <button className="capsule" data-item data-key="top:network" onClick={() => void desk.openUri('x-apple.systempreferences:com.apple.preference.network')}>
          <Glyph name={!online ? 'offline' : net === 'Ethernet' ? 'ethernet' : 'wifi'} size="1.25em" />
          <span>{online ? (net ?? 'Connected') : 'Offline'}</span>
        </button>
      )}
      {BUTTONS.map((b) => (
        <button key={b.page} className="round" data-item data-key={`top:${b.page}`} aria-label={b.label} onClick={() => d.go(b.page)}>
          <Glyph name={b.glyph} size="1.2em" />
          <span className="tip">{b.label}</span>
        </button>
      ))}
      <button className="round" data-item data-key="top:settings" aria-label="Settings" onClick={() => d.go('settings')}>
        <Glyph name="settings" size="1.2em" />
        <span className="tip">Settings</span>
      </button>
      <button className="round" data-item data-key="top:power" aria-label="Exit or minimize" onClick={d.power}>
        <Glyph name="power" size="1.2em" />
        <span className="tip">Power</span>
      </button>
    </nav>
  );
}

/** The clock without AM/PM, as SundarTV's ("5:03"). */
const clockParts = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
export function clockText(d: Date): string {
  return clockParts
    .formatToParts(d)
    .filter((p) => p.type !== 'dayPeriod')
    .map((p) => p.value)
    .join('')
    .trim();
}
const dateFormat = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

function Hero() {
  const d = useDeskContext();
  const now = useNow();
  const w = d.config.widgets.weather ? d.feeds?.weather : null;
  const coins = d.config.widgets.crypto ? (d.feeds?.coins ?? []) : [];
  return (
    <section className="hero" aria-label="Today">
      <div className="hero-date">{dateFormat.format(now)}</div>
      {d.config.widgets.clock && <div className="hero-clock">{clockText(now)}</div>}
      {w && (
        <div className="hero-weather">
          <Symbol name={weatherSymbol(w.code, w.isDay)} size="1.3em" />
          <span>{w.temperature}°</span>
          <span>{describeWeather(w.code).text}</span>
          <span className="gap">H:{w.high}°</span>
          <span>L:{w.low}°</span>
        </div>
      )}
      {coins.length > 0 && (
        <div className="hero-quotes">
          {coins.map((q) => (
            <span key={q.symbol}>
              <CoinMark symbol={q.symbol} />
              {short(q.price)}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}

/** Three figures, as SundarTV's prices row: 81.6k, 2.40k, 104. */
export function short(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toPrecision(3)}M`;
  if (n >= 1000) return `${(n / 1000).toPrecision(3)}k`;
  if (n >= 1) return n.toPrecision(3).replace(/\.0+$/, '');
  return n.toPrecision(2);
}

/** Small marks for the coins, drawn to match SundarTV's. */
export function CoinMark({ symbol }: { symbol: string }) {
  if (symbol === 'BTC') return <span className="coin-mark btc">₿</span>;
  if (symbol === 'ETH') {
    return (
      <svg className="coin-mark" viewBox="0 0 16 24" aria-hidden="true">
        <path d="M8 0L0 12.2 8 17l8-4.8z" fill="currentColor" />
        <path d="M8 18.6L0 13.8 8 24l8-10.2z" fill="currentColor" />
      </svg>
    );
  }
  if (symbol === 'SOL') {
    return (
      <svg className="coin-mark" viewBox="0 0 24 20" aria-hidden="true">
        <path d="M4 1h19l-3 4H1zM1 8h19l3 4H4zM4 15h19l-3 4H1z" fill="currentColor" />
      </svg>
    );
  }
  return <span className="coin-mark">{symbol}</span>;
}

const NAMES: Record<string, string> = { BTC: 'Bitcoin', ETH: 'Ethereum', SOL: 'Solana', XRP: 'XRP', DOGE: 'Dogecoin' };

function Drawer() {
  const d = useDeskContext();
  const lib = d.library.items;
  const counts = (k: string): number => lib.filter((m) => m.kind === k).length;
  const ref = useRef<HTMLDivElement>(null);
  const w = d.config.widgets.weather ? d.feeds?.weather : null;
  const coins = d.config.widgets.crypto ? (d.feeds?.coins ?? []) : [];
  return (
    <section className="drawer" ref={ref} aria-label="More">
      <div className="drawer-row" data-row>
        <div className="drawer-group">
          <h2 className="drawer-title">Library</h2>
          <div className="drawer-tiles">
            <ActionTile variant="drawer" keyName="dr:movies" glyph="movie" label={counts('movies') ? `Movies · ${counts('movies')}` : 'Movies'} onClick={() => d.go('library', 'movies')} />
            <ActionTile variant="drawer" keyName="dr:shows" glyph="tv" label="TV Shows" onClick={() => d.go('library', 'shows')} />
            <ActionTile variant="drawer" keyName="dr:music" glyph="music" label="Music" onClick={() => d.go('library', 'music')} />
            <ActionTile variant="drawer" keyName="dr:photos" glyph="photo" label="Photos" onClick={() => d.go('library', 'photos')} />
          </div>
        </div>
        <div className="drawer-group">
          <h2 className="drawer-title">Shortcuts</h2>
          <div className="drawer-tiles">
            <ActionTile variant="drawer" keyName="dr:apps" glyph="apps" label="All Apps" onClick={() => d.go('apps')} />
            <ActionTile variant="drawer" keyName="dr:settings" glyph="settings" label="Home Settings" onClick={() => d.go('settings')} />
            <ActionTile variant="drawer" keyName="dr:mac" glyph="desktop" label="Mac Settings" onClick={() => void desk.openUri('x-apple.systempreferences:')} />
          </div>
        </div>
      </div>
      {(w || coins.length > 0) && (
        <div className="drawer-cards">
          {w && (
            <div className="card glass weather-card">
              <div className="wc-now">
                <div className="card-title">{w.city}</div>
                <div className="wc-temp">
                  <Symbol name={weatherSymbol(w.code, w.isDay)} size="0.62em" />
                  {w.temperature}°
                </div>
                <div className="wc-desc">{describeWeather(w.code).text}</div>
                <div className="wc-hl">
                  H:{w.high}° <span>L:{w.low}°</span>
                </div>
              </div>
              <div className="wc-hours">
                <div className="wc-hour-row">
                  {w.hourly.map((h) => (
                    <div className="wc-hour" key={h.at}>
                      <span className="wc-h">{new Date(h.at).toLocaleTimeString(undefined, { hour: 'numeric' })}</span>
                      <Symbol name={weatherSymbol(h.code, h.isDay)} size="1.45em" />
                      <span className="wc-t">{h.temperature}°</span>
                    </div>
                  ))}
                </div>
                {w.sunrise && w.sunset && (
                  <div className="wc-sun">
                    <span>
                      <Symbol name="sunrise" size="1.1em" /> Sunrise {new Date(w.sunrise).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                    </span>
                    <span>
                      <Symbol name="sunset" size="1.1em" /> Sunset {new Date(w.sunset).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
          {coins.length > 0 && <CryptoCard coins={coins} />}
        </div>
      )}
    </section>
  );
}

function CryptoCard({ coins }: { coins: CoinPrice[] }) {
  return (
    <div className="card glass crypto-card">
      <div className="cc-head">
        <span className="card-title">Crypto</span>
        <span className="card-dim">24h change</span>
      </div>
      {coins.slice(0, 4).map((q) => (
        <div className="cc-row" key={q.symbol}>
          <CoinMark symbol={q.symbol} />
          <span className="cc-name">{NAMES[q.symbol] ?? q.symbol}</span>
          <span className="cc-price">
            ${q.price.toLocaleString(undefined, { maximumFractionDigits: q.price < 10 ? 4 : 2, minimumFractionDigits: q.price < 1000 ? 2 : 0 })}
          </span>
          <span className={`cc-change ${Math.abs(q.change) < 0.05 ? 'flat' : q.change > 0 ? 'up' : 'down'}`}>
            {q.change > 0.05 ? '+' : q.change < -0.05 ? '−' : ''}
            {Math.abs(q.change).toFixed(1)}%
          </span>
        </div>
      ))}
    </div>
  );
}
