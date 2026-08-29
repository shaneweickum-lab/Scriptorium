/**
 * cloudBackupService — serialize and sync books to Supabase.
 *
 * Backup format (stored as JSONB in books_backup.data):
 *   { book, writingNodes, worldSections, worldEntries, assembly }
 *
 * Restore: writes all records back into IndexedDB via the Dexie db instance.
 * The local book is NOT overwritten if it already exists — caller must confirm.
 */

import { db } from '../db/database';
import { supabase, type BookBackupRow, type BookBackupData } from '../lib/supabase';
import type { User } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BackupSummary {
  id: string;
  local_id: string;
  title: string;
  author: string | null;
  word_count: number;
  backed_up_at: string;
}

export type BackupResult =
  | { ok: true }
  | { ok: false; error: string };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function countWords(nodes: Record<string, unknown>[]): number {
  let total = 0;
  for (const node of nodes) {
    const content = node.content as string | undefined;
    if (!content) continue;
    try {
      const doc = JSON.parse(content);
      const text = extractText(doc);
      total += text.split(/\s+/).filter(Boolean).length;
    } catch {
      // not JSON — skip
    }
  }
  return total;
}

function extractText(node: { text?: string; content?: unknown[] }): string {
  if (node.text) return node.text;
  if (!node.content) return '';
  return (node.content as { text?: string; content?: unknown[] }[])
    .map(extractText)
    .join(' ');
}

// ---------------------------------------------------------------------------
// Backup
// ---------------------------------------------------------------------------

export async function backupBook(
  bookId: string,
  user: User,
): Promise<BackupResult> {
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  const book = await db.books.get(bookId);
  if (!book) return { ok: false, error: 'Book not found in local database.' };

  const [writingNodes, worldSections, worldEntries, assembly] = await Promise.all([
    db.writingNodes.where('bookId').equals(bookId).toArray(),
    db.worldSections.where('bookId').equals(bookId).toArray(),
    db.worldEntries.where('bookId').equals(bookId).toArray(),
    db.assemblies.where('bookId').equals(bookId).first(),
  ]);

  const data: BookBackupData = {
    book:         book as unknown as Record<string, unknown>,
    writingNodes: writingNodes as unknown as Record<string, unknown>[],
    worldSections: worldSections as unknown as Record<string, unknown>[],
    worldEntries: worldEntries as unknown as Record<string, unknown>[],
    assembly:     assembly as unknown as Record<string, unknown> | null ?? null,
  };

  const wordCount = countWords(writingNodes as unknown as Record<string, unknown>[]);

  const { error } = await supabase
    .from('books_backup')
    .upsert(
      {
        user_id:     user.id,
        local_id:    bookId,
        title:       book.title,
        author:      book.author ?? null,
        word_count:  wordCount,
        data,
        backed_up_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,local_id' },
    );

  if (error) return { ok: false, error: error.message };

  // Log analytics event
  await supabase.from('usage_events').insert({
    user_id: user.id,
    event:   'backup_created',
    data:    { book_title: book.title, word_count: wordCount },
  });

  return { ok: true };
}

// ---------------------------------------------------------------------------
// List backups
// ---------------------------------------------------------------------------

export async function listBackups(userId: string): Promise<BackupSummary[]> {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('books_backup')
    .select('id, local_id, title, author, word_count, backed_up_at')
    .eq('user_id', userId)
    .order('backed_up_at', { ascending: false });

  if (error || !data) return [];
  return data as BackupSummary[];
}

// ---------------------------------------------------------------------------
// Restore
// ---------------------------------------------------------------------------

export async function restoreBook(
  backupId: string,
): Promise<BackupResult> {
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  const { data, error } = await supabase
    .from('books_backup')
    .select('*')
    .eq('id', backupId)
    .single();

  if (error || !data) return { ok: false, error: error?.message ?? 'Backup not found.' };

  const row = data as BookBackupRow;
  const { book, writingNodes, worldSections, worldEntries, assembly } = row.data;

  // Use a Dexie transaction to restore everything atomically
  await db.transaction('rw', [
    db.books,
    db.writingNodes,
    db.worldSections,
    db.worldEntries,
    db.assemblies,
  ], async () => {
    await db.books.put(book as unknown as Parameters<typeof db.books.put>[0]);

    if (writingNodes.length > 0) {
      await db.writingNodes.bulkPut(
        writingNodes as unknown as Parameters<typeof db.writingNodes.bulkPut>[0],
      );
    }
    if (worldSections.length > 0) {
      await db.worldSections.bulkPut(
        worldSections as unknown as Parameters<typeof db.worldSections.bulkPut>[0],
      );
    }
    if (worldEntries.length > 0) {
      await db.worldEntries.bulkPut(
        worldEntries as unknown as Parameters<typeof db.worldEntries.bulkPut>[0],
      );
    }
    if (assembly) {
      await db.assemblies.put(
        assembly as unknown as Parameters<typeof db.assemblies.put>[0],
      );
    }
  });

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Track usage event (fire and forget)
// ---------------------------------------------------------------------------

export function trackEvent(
  userId: string,
  event: string,
  data?: Record<string, unknown>,
): void {
  if (!supabase) return;
  supabase.from('usage_events').insert({ user_id: userId, event, data }).then();
}
