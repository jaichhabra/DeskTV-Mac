import type {
  Config,
  DisplayState,
  Feeds,
  InstalledApp,
  LaunchResult,
  LibraryState,
  MediaKind,
  SystemInfo
} from './types';

/** What the screen may ask of the main process: the only bridge between them (see preload). */
export interface DeskApi {
  getConfig(): Promise<Config>;
  /** Saves new settings; the main process cleans them and returns what was saved. */
  setConfig(next: Config): Promise<Config>;
  resetConfig(): Promise<Config>;
  exportConfig(): Promise<boolean>;
  importConfig(): Promise<Config | null>;

  installedApps(refresh?: boolean): Promise<InstalledApp[]>;
  launchApp(appId: string): Promise<LaunchResult>;
  /** The app's own icon from macOS when it's installed, as a dtv: address. */
  appIcon(appId: string): Promise<string | null>;
  openMedia(mediaId: string): Promise<LaunchResult>;
  pickExecutable(): Promise<string | null>;
  pickImage(): Promise<string | null>;
  pickFolder(): Promise<string | null>;
  /** Opens a documented app link, such as x-apple.systempreferences: for the Mac's System Settings. */
  openUri(uri: string): Promise<boolean>;
  /** The Wi-Fi's name, "Ethernet", or null when offline. */
  networkName(): Promise<string | null>;

  library(): Promise<LibraryState>;
  rescanLibrary(): Promise<void>;
  addLibraryFolder(path: string, kind: MediaKind): Promise<Config>;
  /** A dtv: address for a file's thumbnail, made on first use. */
  thumbnail(mediaId: string): Promise<string | null>;
  /** dtv: addresses for pictures in the screensaver's photo folder. */
  saverPhotos(): Promise<string[]>;
  /** A dtv: address for the hero picture or a tile picture the person chose. */
  imageUrl(path: string): Promise<string | null>;

  feeds(): Promise<Feeds>;
  refreshFeeds(): Promise<Feeds>;
  systemInfo(): Promise<SystemInfo>;

  display(): Promise<DisplayState>;
  setTvMode(on: boolean): Promise<void>;
  minimize(): Promise<void>;
  quit(): Promise<void>;
  log(level: 'info' | 'warn' | 'error', message: string): void;

  onConfig(cb: (c: Config) => void): () => void;
  onDisplay(cb: (d: DisplayState) => void): () => void;
  onLibrary(cb: (l: LibraryState) => void): () => void;
  onFeeds(cb: (f: Feeds) => void): () => void;
  /** The window came back to the front (from another app or the hotkey). */
  onReturn(cb: () => void): () => void;
  /** Installed apps' icons were read again. */
  onIcons(cb: () => void): () => void;
}

export const CHANNELS = [
  'config:get',
  'config:set',
  'config:reset',
  'config:export',
  'config:import',
  'apps:installed',
  'apps:launch',
  'apps:icon',
  'media:open',
  'pick:exe',
  'pick:image',
  'pick:folder',
  'open:uri',
  'network:name',
  'library:get',
  'library:rescan',
  'library:add',
  'library:thumb',
  'saver:photos',
  'image:url',
  'feeds:get',
  'feeds:refresh',
  'system:info',
  'display:get',
  'window:tv',
  'window:minimize',
  'app:quit'
] as const;

export type Channel = (typeof CHANNELS)[number];

export const EVENTS = ['config', 'display', 'library', 'feeds', 'return', 'icons'] as const;
