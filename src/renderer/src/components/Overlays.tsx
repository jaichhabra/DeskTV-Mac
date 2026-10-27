import { useEffect, useRef, useState, type ReactNode } from 'react';
import { newAppId } from '../../../shared/config';
import { checkUrl } from '../../../shared/launch';
import type { AppEntry, Category, InstalledApp, LaunchTarget } from '../../../shared/types';
import { desk, report } from '../api';
import { useDeskContext, type MenuItem } from '../context';
import { focusScope } from '../focus';

/** A layer above the page with its own focus scope; it takes focus when it opens. */
export function Overlay({ scope, children, className = '' }: { scope: string; children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    focusScope(ref.current);
  }, []);
  return (
    <div className={`overlay ${className}`} data-scope={scope} ref={ref}>
      {children}
    </div>
  );
}

export function MenuOverlay({ title, items, close }: { title: string; items: MenuItem[]; close(): void }) {
  return (
    <Overlay scope="menu">
      <div className="menu-panel glass" role="menu" aria-label={title}>
        <div className="menu-title">{title}</div>
        {items.map((it, i) => (
          <div data-row key={it.label}>
            <button
              className={`menu-item${it.danger ? ' danger' : ''}`}
              data-item
              data-key={`menu:${i}`}
              role="menuitem"
              onClick={() => {
                close();
                it.run();
              }}
            >
              {it.label}
            </button>
          </div>
        ))}
      </div>
    </Overlay>
  );
}

const CATEGORIES: { value: Category; label: string }[] = [
  { value: 'streaming', label: 'Streaming' },
  { value: 'music', label: 'Music' },
  { value: 'apps', label: 'My Apps' },
  { value: 'games', label: 'Games' }
];
const COLORS = ['#3A3A3C', '#0A84FF', '#30B0C7', '#34C759', '#FF9F0A', '#FF453A', '#BF5AF2', '#8E8E93'];
type Kind = 'url' | 'exe' | 'startApp';

/** Adding or changing an app: its name, how it opens, its row, its picture and color. */
export function AppEditor({ app, close }: { app: AppEntry | null; close(): void }) {
  const d = useDeskContext();
  const first = app?.launch[0];
  const [name, setName] = useState(app?.name ?? '');
  const [category, setCategory] = useState<Category>(app?.category ?? 'apps');
  const [kind, setKind] = useState<Kind>(first?.kind === 'exe' ? 'exe' : first?.kind === 'startApp' ? 'startApp' : 'url');
  const [url, setUrl] = useState(first?.kind === 'url' ? first.url : 'https://');
  const [exe, setExe] = useState(first?.kind === 'exe' ? first.path : '');
  const [startApp, setStartApp] = useState(first?.kind === 'startApp' ? first.match : '');
  const [image, setImage] = useState<string | null>(app?.image ?? null);
  const [color, setColor] = useState(app?.color ?? COLORS[0]);
  const [error, setError] = useState('');
  const [picking, setPicking] = useState(false);

  const save = async (): Promise<void> => {
    const n = name.trim();
    if (!n) return setError('Give it a name.');
    let target: LaunchTarget;
    if (kind === 'url') {
      const problem = checkUrl(url.trim());
      if (problem) return setError(problem);
      target = { kind: 'url', url: url.trim() };
    } else if (kind === 'exe') {
      if (!exe) return setError('Pick the program.');
      target = { kind: 'exe', path: exe };
    } else {
      if (!startApp) return setError('Pick an installed app.');
      target = { kind: 'startApp', match: startApp };
    }
    // Built-in services keep their other ways to open after the one chosen here.
    const same = (t: LaunchTarget): boolean => JSON.stringify(t) === JSON.stringify(target);
    const launch = app?.builtin ? [target, ...app.launch.filter((t) => !same(t))] : [target];
    await d.save((c) => {
      if (app) {
        c.apps = c.apps.map((a) => (a.id === app.id ? { ...a, name: n, category, image, color, launch } : a));
      } else {
        const id = newAppId(n, new Set(c.apps.map((a) => a.id)));
        c.apps.push({ id, name: n, icon: null, image, color, category, launch, pinned: true, hidden: false, builtin: false });
      }
      return c;
    });
    close();
  };

  if (picking) return <InstalledPicker close={() => setPicking(false)} pick={(a) => { setStartApp(a.name); if (!name) setName(a.name); setPicking(false); }} />;

  const cycle = <T,>(all: T[], v: T, dir: 1 | -1): T => all[(all.indexOf(v) + dir + all.length) % all.length];
  return (
    <Overlay scope="editor">
      <div className="editor glass" role="dialog" aria-label={app ? `Edit ${app.name}` : 'Add an app'}>
        <div className="editor-head">
          <span className="editor-preview" style={{ background: color }}>
            {(name.trim() || '?').charAt(0).toUpperCase()}
          </span>
          <h2>{app ? `Edit ${app.name}` : 'Add an app'}</h2>
        </div>
        <Field label="Name">
          <input data-item data-key="name" data-autofocus value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Opens">
          <Cycler value={{ url: 'A website', exe: 'An app on this Mac', startApp: 'An installed app' }[kind]} onStep={(s) => setKind(cycle<Kind>(['url', 'exe', 'startApp'], kind, s))} k="kind" />
        </Field>
        {kind === 'url' && (
          <Field label="Website">
            <input data-item data-key="url" value={url} maxLength={2000} onChange={(e) => setUrl(e.target.value)} spellCheck={false} />
          </Field>
        )}
        {kind === 'exe' && (
          <Field label="Program">
            <button className="field-button" data-item data-key="exe" onClick={() => desk.pickExecutable().then((p) => p && setExe(p), report)}>
              {exe || 'Choose a program…'}
            </button>
          </Field>
        )}
        {kind === 'startApp' && (
          <Field label="App">
            <button className="field-button" data-item data-key="start" onClick={() => setPicking(true)}>
              {startApp || 'Choose an installed app…'}
            </button>
          </Field>
        )}
        <Field label="Row">
          <Cycler value={CATEGORIES.find((x) => x.value === category)?.label ?? ''} onStep={(s) => setCategory(cycle(CATEGORIES.map((x) => x.value), category, s))} k="cat" />
        </Field>
        <Field label="Color">
          <Cycler value={<span className="swatch" style={{ background: color }} />} onStep={(s) => setColor(cycle(COLORS, COLORS.includes(color) ? color : COLORS[0], s))} k="color" />
        </Field>
        <Field label="Picture">
          <button className="field-button" data-item data-key="image" onClick={() => desk.pickImage().then((p) => p && setImage(p), report)}>
            {image ? image.split(/[\\/]/).pop() : 'Choose a picture…'}
          </button>
          {image && (
            <button className="field-button small" data-item data-key="noimage" onClick={() => setImage(null)}>
              Remove
            </button>
          )}
        </Field>
        {error && <div className="editor-error" role="alert">{error}</div>}
        <div className="editor-actions" data-row>
          <button className="pill primary" data-item data-key="save" onClick={() => void save()}>
            Save
          </button>
          <button className="pill" data-item data-key="cancel" onClick={close}>
            Cancel
          </button>
        </div>
      </div>
    </Overlay>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="field" data-row>
      <span className="field-label">{label}</span>
      {children}
    </div>
  );
}

/** A value changed with left and right (or by clicking), as TV settings do. */
export function Cycler({ value, onStep, k }: { value: ReactNode; onStep(dir: 1 | -1): void; k: string }) {
  return (
    <button
      className="cycler"
      data-item
      data-key={k}
      onClick={() => onStep(1)}
      onKeyDown={(e) => {
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
          e.preventDefault();
          onStep(e.key === 'ArrowRight' ? 1 : -1);
        }
      }}
    >
      <span className="cycler-arrow">‹</span>
      <span className="cycler-value">{value}</span>
      <span className="cycler-arrow">›</span>
    </button>
  );
}

function InstalledPicker({ close, pick }: { close(): void; pick(a: InstalledApp): void }) {
  const [apps, setApps] = useState<InstalledApp[] | null>(null);
  useEffect(() => {
    desk.installedApps().then((list) => setApps([...list].sort((a, b) => a.name.localeCompare(b.name))), report);
  }, []);
  return (
    <Overlay scope="picker">
      <div className="editor glass picker" role="dialog" aria-label="Installed apps">
        <h2>Installed apps</h2>
        <div className="picker-list" data-scroller>
          {apps === null && <div className="card-note">Reading the Start menu…</div>}
          {apps?.length === 0 && <div className="card-note">No apps were found in Applications.</div>}
          {apps?.map((a) => (
            <div data-row key={a.appId}>
              <button className="menu-item" data-item data-key={`pick:${a.appId}`} onClick={() => pick(a)}>
                {a.name}
              </button>
            </div>
          ))}
        </div>
        <div data-row>
          <button className="pill" data-item data-key="close" onClick={close}>
            Cancel
          </button>
        </div>
      </div>
    </Overlay>
  );
}

export function Toast({ text }: { text: string }) {
  return (
    <div className="toast glass" role="status">
      {text}
    </div>
  );
}
