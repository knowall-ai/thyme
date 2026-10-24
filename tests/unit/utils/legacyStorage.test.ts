import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { migrateLegacyStorageKey } from '@/utils/legacyStorage';

const oldKey = 'thyme-test-storage';
const newKey = 'timmie-test-storage';

describe('migrateLegacyStorageKey', () => {
  // The test setup mocks localStorage with no-ops, so give these tests a working one
  let store: Map<string, string>;
  beforeEach(() => {
    store = new Map();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('moves the old value to the new key', () => {
    localStorage.setItem(oldKey, '{"state":{"isRunning":true},"version":0}');
    migrateLegacyStorageKey(oldKey, newKey);
    expect(localStorage.getItem(newKey)).toBe('{"state":{"isRunning":true},"version":0}');
    expect(localStorage.getItem(oldKey)).toBeNull();
  });

  it('never overwrites a value already under the new key', () => {
    localStorage.setItem(oldKey, 'old');
    localStorage.setItem(newKey, 'new');
    migrateLegacyStorageKey(oldKey, newKey);
    expect(localStorage.getItem(newKey)).toBe('new');
    expect(localStorage.getItem(oldKey)).toBeNull();
  });

  it('does nothing when there is no old value', () => {
    migrateLegacyStorageKey(oldKey, newKey);
    expect(localStorage.getItem(newKey)).toBeNull();
  });

  it('survives storage that throws', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('Storage unavailable');
      },
    });
    expect(() => migrateLegacyStorageKey(oldKey, newKey)).not.toThrow();
  });
});
