import { describe, expect, it } from 'vitest';
import { defaultConfig, newAppId, sanitizeConfig, CONFIG_VERSION } from '../src/shared/config';

describe('settings', () => {
  it('starts with the requested services, each opening an installed app or an official https site', () => {
    const c = defaultConfig();
    const names = c.apps.map((a) => a.name);
    for (const n of ['Netflix', 'Prime Video', 'YouTube', 'Spotify', 'YouTube Music', 'Apple TV', 'JioHotstar', 'Plex', 'VLC', 'Browser']) {
      expect(names).toContain(n);
    }
    for (const a of c.apps) {
      for (const t of a.launch) if (t.kind === 'url') expect(t.url).toMatch(/^https:\/\//);
    }
  });

  it('survives garbage: a damaged file still opens with defaults', () => {
    for (const bad of [null, 42, 'x', [], { apps: 'no', rows: {}, display: { scale: 'huge', safeArea: 99 } }]) {
      const c = sanitizeConfig(bad);
      expect(c.version).toBe(CONFIG_VERSION);
      expect(c.apps.length).toBeGreaterThan(5);
      expect(c.rows).toHaveLength(8);
    }
    expect(sanitizeConfig({ display: { scale: 99, safeArea: 99 } }).display).toEqual({ preferredDisplayId: null, scale: 1.6, safeArea: 10 });
  });

  it('drops unsafe launch targets and the apps left with none', () => {
    const c = sanitizeConfig({
      apps: [
        { id: 'evil', name: 'Evil', launch: [{ kind: 'url', url: 'javascript:alert(1)' }] },
        { id: 'cmd', name: 'Cmd', launch: [{ kind: 'uri', uri: 'ms-msdt:/id PCWDiagnostic' }] },
        { id: 'ok', name: 'Ok', launch: [{ kind: 'url', url: 'file:///C:/x' }, { kind: 'url', url: 'https://example.com' }] }
      ]
    });
    expect(c.apps.find((a) => a.id === 'evil')).toBeUndefined();
    expect(c.apps.find((a) => a.id === 'cmd')).toBeUndefined();
    expect(c.apps.find((a) => a.id === 'ok')?.launch).toEqual([{ kind: 'url', url: 'https://example.com' }]);
  });

  it('adds built-in services missing from older settings, unpinned', () => {
    const c = sanitizeConfig({ apps: [{ id: 'mine', name: 'Mine', launch: [{ kind: 'url', url: 'https://a.b' }], pinned: true }] });
    expect(c.apps[0].id).toBe('mine');
    expect(c.apps.find((a) => a.id === 'netflix')?.pinned).toBe(false);
  });

  it("moves version 1 settings to SundarTV's shelf, keeping added apps", () => {
    const old = { version: 1, apps: [...defaultConfig().apps].reverse().map((a) => ({ ...a, pinned: true })), weather: { city: 'Delhi' } };
    old.apps.push({ ...old.apps[0], id: 'mine', name: 'Mine', builtin: false, launch: [{ kind: 'url', url: 'https://a.b' }] });
    const c = sanitizeConfig(old);
    expect(c.apps.filter((a) => a.pinned).map((a) => a.id)).toEqual(['netflix', 'youtube', 'prime', 'spotify', 'hotstar', 'mine']);
    expect(c.apps.at(-1)?.id).toBe('mine');
    expect(c.weather.city).toBe('Delhi');
  });

  it('gives built-in services saved on Windows the ways the Mac opens them', () => {
    const c = sanitizeConfig({ version: 2, apps: [{ id: 'appletv', name: 'Apple TV', builtin: true, launch: [{ kind: 'startApp', match: 'Apple TV' }] }] });
    expect(c.apps.find((a) => a.id === 'appletv')?.launch).toContainEqual({ kind: 'startApp', match: 'TV' });
  });

  it('keeps row order and fills in missing rows', () => {
    const c = sanitizeConfig({ rows: [{ kind: 'games', visible: false }, { kind: 'games', visible: true }, { kind: 'nope' }] });
    expect(c.rows[0]).toEqual({ kind: 'games', visible: false });
    expect(c.rows).toHaveLength(8);
  });

  it('makes unique ids for added apps', () => {
    expect(newAppId('My App!', new Set())).toBe('my-app');
    expect(newAppId('My App', new Set(['my-app']))).toBe('my-app-2');
    expect(newAppId('???', new Set())).toBe('app');
  });
});
