/**
 * Moves a localStorage value saved under a pre-rename (Thyme) key to its Timmie key, once.
 * Never overwrites an existing value. Safe on the server and when storage is unavailable.
 */
export function migrateLegacyStorageKey(oldKey: string, newKey: string): void {
  if (typeof window === 'undefined') return;
  try {
    const storage = window.localStorage;
    const value = storage.getItem(oldKey);
    if (value === null) return;
    // Keep a value already under the new key; either way the old key goes, so it can't come back
    if (storage.getItem(newKey) === null) storage.setItem(newKey, value);
    storage.removeItem(oldKey);
  } catch {
    // Storage can be unavailable or full (e.g. private browsing)
  }
}
