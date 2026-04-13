/**
 * OracleProfileStore — localStorage persistence for OracleProfile objects.
 *
 * Key format:  scriptorium:oracle:<bookId>
 * Value:       JSON-serialised OracleProfile
 *
 * All methods are static and safe to call in any environment (they no-op when
 * localStorage is unavailable, e.g. in Node.js or private-browsing storage
 * that has been exhausted).
 */

import type { OracleProfile } from './OracleMLService';

const KEY_PREFIX = 'scriptorium:oracle:';

function storageKey(bookId: string): string {
  return `${KEY_PREFIX}${bookId}`;
}

function isStorageAvailable(): boolean {
  try {
    const test = '__scriptorium_oracle_test__';
    localStorage.setItem(test, '1');
    localStorage.removeItem(test);
    return true;
  } catch {
    return false;
  }
}

export const OracleProfileStore = {
  /**
   * Persist an OracleProfile for the given book.
   * Silently no-ops if localStorage is unavailable.
   */
  save(bookId: string, profile: OracleProfile): void {
    if (!isStorageAvailable()) return;
    try {
      localStorage.setItem(storageKey(bookId), JSON.stringify(profile));
    } catch {
      // Quota exceeded or serialisation error — fail silently
    }
  },

  /**
   * Load a previously saved OracleProfile.
   * Returns null if none exists or the stored value is corrupt.
   */
  load(bookId: string): OracleProfile | null {
    if (!isStorageAvailable()) return null;
    try {
      const raw = localStorage.getItem(storageKey(bookId));
      if (!raw) return null;
      const parsed = JSON.parse(raw) as OracleProfile;
      // Sanity check — required fields
      if (
        typeof parsed.bookId !== 'string' ||
        typeof parsed.wordsAnalyzed !== 'number' ||
        typeof parsed.oracleKnowledge !== 'string'
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
   * List all book IDs that have a stored oracle profile.
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
