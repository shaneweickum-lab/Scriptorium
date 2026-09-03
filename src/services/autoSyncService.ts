/**
 * autoSyncService — watches content stores and debounces uploads to Supabase.
 *
 * Call startAutoSync(user) after sign-in; stopAutoSync() on sign-out.
 * Components subscribe to sync state via subscribeToSyncStatus / getSyncState.
 */

import type { User } from '@supabase/supabase-js';
import { backupBook } from './cloudBackupService';
import { useWritingStore } from '../store/writingStore';
import { useWorldStore } from '../store/worldStore';
import { useAssemblyStore } from '../store/assemblyStore';
import { useLibraryStore } from '../store/libraryStore';
import { isSupabaseConfigured } from '../lib/supabase';

const DEBOUNCE_MS = 5_000;

export type SyncStatus = 'idle' | 'pending' | 'syncing' | 'synced' | 'error';

export interface SyncState {
  status: SyncStatus;
  lastSyncedAt: Date | null;
  error: string | null;
}

// ─── Module-level singleton state ──────────────────────────────────────────

let _user: User | null = null;
const _timers = new Map<string, ReturnType<typeof setTimeout>>();
const _unsubs: (() => void)[] = [];
const _listeners = new Set<(s: SyncState) => void>();
let _state: SyncState = { status: 'idle', lastSyncedAt: null, error: null };

// ─── Internal helpers ───────────────────────────────────────────────────────

function emit(patch: Partial<SyncState>) {
  _state = { ..._state, ...patch };
  _listeners.forEach((l) => l(_state));
}

function scheduleSync(bookId: string) {
  if (!_user || !isSupabaseConfigured) return;

  emit({ status: 'pending' });

  const prev = _timers.get(bookId);
  if (prev) clearTimeout(prev);

  const t = setTimeout(async () => {
    _timers.delete(bookId);
    if (!_user) return;
    emit({ status: 'syncing' });
    const result = await backupBook(bookId, _user);
    if (result.ok) {
      emit({ status: 'synced', lastSyncedAt: new Date(), error: null });
    } else {
      emit({ status: 'error', error: (result as { ok: false; error: string }).error });
    }
  }, DEBOUNCE_MS);

  _timers.set(bookId, t);
}

function onContentChange() {
  const bookId = useLibraryStore.getState().activeBook?.id;
  if (bookId) scheduleSync(bookId);
}

// ─── Public API ─────────────────────────────────────────────────────────────

export function startAutoSync(user: User) {
  // Tear down any previous session
  _user = null;
  _timers.forEach(clearTimeout);
  _timers.clear();
  _unsubs.splice(0).forEach((u) => u());

  _user = user;
  emit({ status: 'idle', error: null });

  _unsubs.push(
    useWritingStore.subscribe(onContentChange),
    useWorldStore.subscribe(onContentChange),
    useAssemblyStore.subscribe(onContentChange),
  );
}

export function stopAutoSync() {
  _user = null;
  _timers.forEach(clearTimeout);
  _timers.clear();
  _unsubs.splice(0).forEach((u) => u());
  emit({ status: 'idle', error: null });
}

/** Immediately sync the active book without waiting for the debounce. */
export async function flushSync(): Promise<void> {
  const bookId = useLibraryStore.getState().activeBook?.id;
  if (!bookId || !_user) return;

  const prev = _timers.get(bookId);
  if (prev) clearTimeout(prev);
  _timers.delete(bookId);

  emit({ status: 'syncing' });
  const result = await backupBook(bookId, _user);
  if (result.ok) {
    emit({ status: 'synced', lastSyncedAt: new Date(), error: null });
  } else {
    emit({ status: 'error', error: (result as { ok: false; error: string }).error });
  }
}

export function subscribeToSyncStatus(listener: (s: SyncState) => void): () => void {
  _listeners.add(listener);
  listener(_state);
  return () => _listeners.delete(listener);
}

export function getSyncState(): SyncState {
  return _state;
}
