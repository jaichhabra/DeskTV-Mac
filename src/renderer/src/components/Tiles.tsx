import { useEffect, useRef, useState } from 'react';
import type { AppEntry, MediaItem } from '../../../shared/types';
import { desk, report } from '../api';
import { isAvailable, useDeskContext } from '../context';
import { Banner } from './Banner';
import { Glyph, type GlyphName } from './Icon';

/** A picture the person chose for a tile, through the dtv: scheme. */
function useChosenImage(path: string | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    if (path) desk.imageUrl(path).then((u) => live && setUrl(u), report);
    else setUrl(null);
    return () => {
      live = false;
    };
  }, [path]);
  return url;
}

/** Bumped when the main process has read installed apps' icons again. */
let iconGeneration = 0;
const iconListeners = new Set<() => void>();
desk?.onIcons(() => {
  iconGeneration++;
  iconListeners.forEach((l) => l());
});

/** The app's own icon from macOS, for apps DeskTV has no art for. */
function useAppIcon(appId: string, wanted: boolean): string | null {
  const [url, setUrl] = useState<string | null>(null);
  const [gen, setGen] = useState(iconGeneration);
  useEffect(() => {
    const l = (): void => setGen(iconGeneration);
    iconListeners.add(l);
    return () => void iconListeners.delete(l);
  }, []);
  useEffect(() => {
    let live = true;
    if (wanted) desk.appIcon(appId).then((u) => live && setUrl(u), report);
    return () => {
      live = false;
    };
  }, [appId, wanted, gen]);
  return wanted ? url : null;
}

export function AppTile({
  app,
  list,
  variant = 'shelf',
  autoFocus = false
}: {
  app: AppEntry;
  /** The ids of the row it's in, for moving it. */
  list: string[];
  variant?: 'shelf' | 'grid';
  autoFocus?: boolean;
}) {
  const d = useDeskContext();
  const image = useChosenImage(app.image);
  const ready = isAvailable(d.config, app);
  const winIcon = useAppIcon(app.id, !app.image && !app.builtin);
  return (
    <button
      className={`tile ${variant}-tile${d.moving === app.id ? ' moving' : ''}${ready && !app.hidden ? '' : ' unavailable'}`}
      data-item
      data-key={`app:${app.id}`}
      data-autofocus={autoFocus || undefined}
      onClick={() => d.openApp(app)}
      onContextMenu={(e) => {
        e.preventDefault();
        d.appMenu(app, list);
      }}
      aria-label={ready ? app.name : `${app.name}, not installed`}
    >
      <span className="tile-face">
        <Banner app={app} image={image} winIcon={winIcon} />
      </span>
      {variant === 'grid' && <span className="tile-label">{ready ? app.name : `${app.name} · not installed`}</span>}
    </button>
  );
}

const KIND_GLYPH: Record<MediaItem['kind'], GlyphName> = { movies: 'movie', shows: 'tv', music: 'music', photos: 'photo' };

export function MediaTile({ item }: { item: MediaItem }) {
  const d = useDeskContext();
  const ref = useRef<HTMLButtonElement>(null);
  const [thumb, setThumb] = useState<string | null>(null);

  // Thumbnails only for tiles that come into view.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let live = true;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect();
          desk.thumbnail(item.id).then((u) => live && setThumb(u), report);
        }
      },
      { rootMargin: '50%' }
    );
    io.observe(el);
    return () => {
      live = false;
      io.disconnect();
    };
  }, [item.id]);

  const meta =
    item.kind === 'shows' && item.season !== null
      ? `Season ${item.season} · Episode ${item.episode}`
      : item.year
        ? String(item.year)
        : { movies: 'Movie', shows: 'Episode', music: 'Music', photos: 'Photo' }[item.kind];
  return (
    <button
      ref={ref}
      className="tile grid-tile media-tile"
      data-item
      data-key={`media:${item.id}`}
      onClick={() => d.openMedia(item)}
      aria-label={`${item.show ?? item.title}, ${meta}`}
    >
      <span className="tile-face">
        {thumb ? (
          <img className="banner-image" src={thumb} alt="" draggable={false} />
        ) : (
          <span className="banner poster">
            <Glyph name={KIND_GLYPH[item.kind]} size="34cqh" />
          </span>
        )}
      </span>
      <span className="tile-label">
        <span className="tile-title">{item.show ?? item.title}</span>
        <span className="tile-meta">{meta}</span>
      </span>
    </button>
  );
}

/** A plain glass tile with a symbol, for "Add app", "Add folder" and the drawer's shortcuts. */
export function ActionTile({
  label,
  glyph,
  onClick,
  keyName,
  variant = 'grid'
}: {
  label: string;
  glyph: GlyphName;
  onClick(): void;
  keyName: string;
  variant?: 'grid' | 'drawer';
}) {
  return (
    <button className={`tile ${variant}-tile action-tile`} data-item data-key={keyName} onClick={onClick}>
      <span className="tile-face glass-card">
        <Glyph name={glyph} size={variant === 'drawer' ? '30cqh' : '28cqh'} />
        {variant === 'drawer' && <span className="action-label">{label}</span>}
      </span>
      {variant === 'grid' && <span className="tile-label">{label}</span>}
    </button>
  );
}
