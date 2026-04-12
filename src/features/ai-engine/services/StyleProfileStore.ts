/**
 * StyleProfileStore — localStorage persistence for StyleProfile objects.
 *
 * Key format:  scriptorium:style:<bookId>
 * Value:       JSON-serialised StyleProfile
 *
 * This is intentionally a thin wrapper — it does no analysis itself,
 * only serialises/deserialises what StyleAnalyzer produces.
 *
 * All methods are static and safe to call server-side (they no-op when
 * localStorage is unavailable, e.g. in Node.js test scripts).
 */

import type { StyleProfile } from './StyleAnalyzer';

const KEY_PREFIX = 'scriptorium:style:';

function storageKey(bookId: string): string {
  return `${KEY_PREFIX}${bookId}`;
}

function isStorageAvailable(): boolean {
  try {
    const test = '__scriptorium_test__';
    localStorage.setItem(test, '1');
    localStorage.removeItem(test);
    return true;
  } catch {
    return false;
  }
}

export const StyleProfileStore = {
  /**
   * Persist a StyleProfile for the given book.
   * Silently no-ops if localStorage is unavailable (private browsing, Node.js).
   */
  save(bookId: string, profile: StyleProfile): void {
    if (!isStorageAvailable()) return;
    try {
      localStorage.setItem(storageKey(bookId), JSON.stringify(profile));
    } catch {
      // Quota exceeded or serialisation error — fail silently
    }
  },

  /**
   * Load a previously saved StyleProfile.
   * Returns null if none exists or the stored value is corrupt.
   */
  load(bookId: string): StyleProfile | null {
    if (!isStorageAvailable()) return null;
    try {
      const raw = localStorage.getItem(storageKey(bookId));
      if (!raw) return null;
      const parsed = JSON.parse(raw) as StyleProfile;
      // Basic sanity check — ensure required top-level fields are present
      if (
        typeof parsed.analyzedAt !== 'number' ||
        typeof parsed.styleConstraints !== 'string'
      ) {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  },

  /**
   * Remove the stored profile for a book.
   * Safe to call when no profile exists.
   */
  clear(bookId: string): void {
    if (!isStorageAvailable()) return;
    try {
      localStorage.removeItem(storageKey(bookId));
    } catch { /* ignore */ }
  },

  /**
   * List all book IDs that have a stored style profile.
   * Useful for debugging / admin panels.
   */
  listBookIds(): string[] {
    if (!isStorageAvailable()) return [];
    const ids: string[] = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith(KEY_PREFIX)) {
          ids.push(key.slice(KEY_PREFIX.length));
        }
      }
    } catch { /* ignore */ }
    return ids;
  },
};
