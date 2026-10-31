import { DEMO_STORAGE_PREFIX, isDemoMode } from './demoMode';

const DEMO_KEY_PREFIX = `${DEMO_STORAGE_PREFIX}:`;

/**
 * A Storage over this tab's sessionStorage, with every key prefixed, so the demo's
 * settings, timer and favourites live and die with the demo (see clearDemoState).
 */
class DemoScopedStorage implements Storage {
  constructor(private readonly backing: Storage) {}

  private ownKeys(): string[] {
    const keys: string[] = [];
    for (let i = 0; i < this.backing.length; i++) {
      const key = this.backing.key(i);
      if (key?.startsWith(DEMO_KEY_PREFIX)) keys.push(key);
    }
    return keys;
  }

  get length(): number {
    return this.ownKeys().length;
  }

  key(index: number): string | null {
    return this.ownKeys()[index]?.slice(DEMO_KEY_PREFIX.length) ?? null;
  }

  getItem(key: string): string | null {
    return this.backing.getItem(DEMO_KEY_PREFIX + key);
  }

  setItem(key: string, value: string): void {
    this.backing.setItem(DEMO_KEY_PREFIX + key, value);
  }

  removeItem(key: string): void {
    this.backing.removeItem(DEMO_KEY_PREFIX + key);
  }

  clear(): void {
    this.ownKeys().forEach((key) => this.backing.removeItem(key));
  }
}

let demoStorage: { backing: Storage; storage: Storage } | null = null;

/**
 * Where Timmie keeps its browser-side preferences (company selection, settings, timer,
 * favourites): localStorage, or in the demo a part of this tab's sessionStorage, so the
 * demo never changes what a real session finds. Throws where there's no window (the
 * server render), as localStorage itself would.
 */
export function appStorage(): Storage {
  if (!isDemoMode()) return window.localStorage;
  const backing = window.sessionStorage;
  if (demoStorage?.backing !== backing) {
    demoStorage = { backing, storage: new DemoScopedStorage(backing) };
  }
  return demoStorage.storage;
}
