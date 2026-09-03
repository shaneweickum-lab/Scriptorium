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
import { backupBook, listBackups, pullBookIfNewer, type BackupSummary } from './cloudBackupService';
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
const _unsubs: (() => void)[] = [];
const _listeners = new Set<(s: SyncState) => void>();
let _state: SyncState = { status: 'idle', lastSyncedAt: null, error: null };
let _channel: RealtimeChannel | null = null;
let _reconcileInterval: ReturnType<typeof setInterval> | null = null;
let _reconciling = false;

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

// ─── Internal helpers — pull ────────────────────────────────────────────────

async function reconcileBook(backup: BackupSummary) {
  // A push for this book is in flight or about to fire — don't race it.
  if (_timers.has(backup.local_id)) return;

  const outcome = await pullBookIfNewer(backup);
  if (outcome !== 'pulled') return;

  await useLibraryStore.getState().loadLibrary();

  // Never silently swap out the book the user currently has open — the
  // in-memory editor state would go stale under them. Just tell them.
  const activeBookId = useLibraryStore.getState().activeBook?.id;
  if (activeBookId === backup.local_id) {
    useUIStore.getState().addToast(
      `"${backup.title}" was updated on another device — reopen it to see the latest changes.`,
      'info',
    );
  }
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

  _unsubs.push(
    useWritingStore.subscribe(onContentChange),
    useWorldStore.subscribe(onContentChange),
    useAssemblyStore.subscribe(onContentChange),
  );

  reconcileAllBooks();
  _channel = subscribeRealtime(user);
  _reconcileInterval = setInterval(reconcileAllBooks, RECONCILE_INTERVAL_MS);
}

export function stopAutoSync() {
  _user = null;
  _timers.forEach(clearTimeout);
  _timers.clear();
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
