/**
 * autoSyncService — two-way realtime sync between IndexedDB and Supabase.
 *
 * Push: watches content stores and debounces uploads per book (5 s of
 * inactivity). Pull: subscribes to Supabase Realtime on books_backup and
 * also polls periodically as a fallback; whenever a book's cloud copy is
 * newer than the local one (by content_updated_at) it's pulled down.
 *
 * Call startAutoSync(user) after sign-in; stopAutoSync() on sign-out.
 * Components subscribe to sync state via subscribeToSyncStatus / getSyncState.
 */

import type { RealtimeChannel, User } from '@supabase/supabase-js';
import {
  backupBook, listBackups, pullBookIfNewer, getLocalContentUpdatedAt,
  CLOCK_SKEW_GRACE_MS, type BackupSummary,
} from './cloudBackupService';
import { useWritingStore } from '../store/writingStore';
import { useWorldStore } from '../store/worldStore';
import { useAssemblyStore } from '../store/assemblyStore';
import { useLibraryStore } from '../store/libraryStore';
import { useUIStore } from '../store/uiStore';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

const DEBOUNCE_MS = 5_000;
const RECONCILE_INTERVAL_MS = 60_000;

export type SyncStatus = 'idle' | 'pending' | 'syncing' | 'synced' | 'error';

export interface SyncState {
  status: SyncStatus;
  lastSyncedAt: Date | null;
  error: string | null;
}

// ─── Module-level singleton state ──────────────────────────────────────────

let _user: User | null = null;
const _timers = new Map<string, ReturnType<typeof setTimeout>>();
// Books whose push is actually in flight (network request underway) — a
// wider window than _timers, which only covers "not fired yet".
const _pushingBooks = new Set<string>();
const _unsubs: (() => void)[] = [];
const _listeners = new Set<(s: SyncState) => void>();
let _state: SyncState = { status: 'idle', lastSyncedAt: null, error: null };
let _channel: RealtimeChannel | null = null;
let _reconcileInterval: ReturnType<typeof setInterval> | null = null;
let _reconciling = false;
// Last cloud content_updated_at we've already toasted about per book, so a
// stale-but-unchanged active book doesn't re-toast on every reconcile pass.
const _toastedAt = new Map<string, number>();
// Reference-equality snapshots so a pure UI-selection change (setActiveNode,
// setActiveEntry) doesn't schedule a needless cloud push.
let _lastNodes: unknown = null;
let _lastSections: unknown = null;
let _lastEntries: unknown = null;

// ─── Internal helpers — push ────────────────────────────────────────────────

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
    const user = _user;
    if (!user) return;

    _pushingBooks.add(bookId);
    emit({ status: 'syncing' });
    try {
      const result = await backupBook(bookId, user);
      // If we signed out (or a different user signed in) while this push
      // was in flight, don't report state for a session that no longer exists.
      if (_user !== user) return;
      if (result.ok) {
        emit({ status: 'synced', lastSyncedAt: new Date(), error: null });
      } else {
        emit({ status: 'error', error: (result as { ok: false; error: string }).error });
      }
    } finally {
      _pushingBooks.delete(bookId);
    }
  }, DEBOUNCE_MS);

  _timers.set(bookId, t);
}

function onWritingChange() {
  const { nodes } = useWritingStore.getState();
  if (nodes === _lastNodes) return; // only activeNodeId or similar UI state changed
  _lastNodes = nodes;
  const bookId = useLibraryStore.getState().activeBook?.id;
  if (bookId) scheduleSync(bookId);
}

function onWorldChange() {
  const { sections, entries } = useWorldStore.getState();
  if (sections === _lastSections && entries === _lastEntries) return;
  _lastSections = sections;
  _lastEntries = entries;
  const bookId = useLibraryStore.getState().activeBook?.id;
  if (bookId) scheduleSync(bookId);
}

function onAssemblyChange() {
  const bookId = useLibraryStore.getState().activeBook?.id;
  if (bookId) scheduleSync(bookId);
}

// ─── Internal helpers — pull ────────────────────────────────────────────────

async function reconcileBook(backup: BackupSummary) {
  // A push for this book is pending or actually in flight — never race it;
  // we'll catch up on the next reconcile pass once it settles.
  if (_timers.has(backup.local_id) || _pushingBooks.has(backup.local_id)) return;

  const activeBookId = useLibraryStore.getState().activeBook?.id;

  if (activeBookId === backup.local_id) {
    // Never mutate the book currently open for editing — restoring it here
    // would overwrite IndexedDB out from under the in-memory editor state.
    // Just check whether the cloud is ahead and let the user know.
    const localTimestamp = await getLocalContentUpdatedAt(backup.local_id);
    if (backup.content_updated_at > localTimestamp + CLOCK_SKEW_GRACE_MS) {
      if (_toastedAt.get(backup.local_id) !== backup.content_updated_at) {
        _toastedAt.set(backup.local_id, backup.content_updated_at);
        useUIStore.getState().addToast(
          `"${backup.title}" was updated on another device — reopen it to see the latest changes.`,
          'info',
        );
      }
    }
    return;
  }

  const outcome = await pullBookIfNewer(backup);
  if (outcome !== 'pulled') return;
  await useLibraryStore.getState().loadLibrary();
}

async function reconcileAllBooks() {
  if (!_user || !isSupabaseConfigured || _reconciling) return;
  _reconciling = true;
  try {
    const backups = await listBackups(_user.id);
    for (const backup of backups) {
      await reconcileBook(backup);
    }
  } finally {
    _reconciling = false;
  }
}

function subscribeRealtime(user: User): RealtimeChannel | null {
  if (!supabase) return null;
  return supabase
    .channel(`books_backup_${user.id}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'books_backup', filter: `user_id=eq.${user.id}` },
      () => { reconcileAllBooks(); },
    )
    .subscribe();
}

// ─── Public API ─────────────────────────────────────────────────────────────

export function startAutoSync(user: User) {
  stopAutoSync();
  _user = user;
  emit({ status: 'idle', error: null });

  // Seed the change-detection snapshots so the first subscribe callback
  // doesn't compare against `null` and misfire a sync with no real edit.
  _lastNodes = useWritingStore.getState().nodes;
  _lastSections = useWorldStore.getState().sections;
  _lastEntries = useWorldStore.getState().entries;

  _unsubs.push(
    useWritingStore.subscribe(onWritingChange),
    useWorldStore.subscribe(onWorldChange),
    useAssemblyStore.subscribe(onAssemblyChange),
  );

  reconcileAllBooks();
  _channel = subscribeRealtime(user);
  _reconcileInterval = setInterval(reconcileAllBooks, RECONCILE_INTERVAL_MS);
}

export function stopAutoSync() {
  _user = null;
  _timers.forEach(clearTimeout);
  _timers.clear();
  _toastedAt.clear();
  _unsubs.splice(0).forEach((u) => u());
  if (_channel) {
    supabase?.removeChannel(_channel);
    _channel = null;
  }
  if (_reconcileInterval) {
    clearInterval(_reconcileInterval);
    _reconcileInterval = null;
  }
  emit({ status: 'idle', error: null });
}

/** Immediately sync the active book without waiting for the debounce. */
export async function flushSync(): Promise<void> {
  const bookId = useLibraryStore.getState().activeBook?.id;
  const user = _user;
  if (!bookId || !user) return;

  const prev = _timers.get(bookId);
  if (prev) clearTimeout(prev);
  _timers.delete(bookId);

  _pushingBooks.add(bookId);
  emit({ status: 'syncing' });
  try {
    const result = await backupBook(bookId, user);
    if (_user !== user) return;
    if (result.ok) {
      emit({ status: 'synced', lastSyncedAt: new Date(), error: null });
    } else {
      emit({ status: 'error', error: (result as { ok: false; error: string }).error });
    }
  } finally {
    _pushingBooks.delete(bookId);
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
