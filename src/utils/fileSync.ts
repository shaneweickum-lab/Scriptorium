import { db } from '../db/database';
import { tiptapJsonToText, countWords } from './tiptapToHtml';

// ── IndexedDB meta store ───────────────────────────────────────────────────
const META_DB = 'scriptorium-meta';
const META_STORE = 'handles';
const HANDLE_KEY = 'syncDirHandle';

function openMetaDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(META_DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(META_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getSyncDirHandle(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const idb = await openMetaDb();
    return new Promise((resolve) => {
      const tx = idb.transaction(META_STORE, 'readonly');
      const req = tx.objectStore(META_STORE).get(HANDLE_KEY);
      req.onsuccess = () => resolve((req.result as FileSystemDirectoryHandle) ?? null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function setSyncDirHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  const idb = await openMetaDb();
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(META_STORE, 'readwrite');
    const req = tx.objectStore(META_STORE).put(handle, HANDLE_KEY);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function clearSyncDirHandle(): Promise<void> {
  try {
    const idb = await openMetaDb();
    await new Promise<void>((resolve) => {
      const tx = idb.transaction(META_STORE, 'readwrite');
      tx.objectStore(META_STORE).delete(HANDLE_KEY);
      tx.oncomplete = () => resolve();
    });
  } catch { /* ignore */ }
}

// ── Sync file types ────────────────────────────────────────────────────────
export interface SyncBook {
  id: string;
  title: string;
  author: string;
  synopsis: string;
  word_goal?: number;
  cover_color: string;
  world_bible_id?: string;
  created_at: number;
  updated_at: number;
}

export interface SyncNode {
  id: string;
  book_id: string;
  parent_id: string | null;
  type: string;
  title: string;
  order: number;
  content_text: string;
  content_raw: string;
  word_count: number;
}

export interface SyncWorldSection {
  id: string;
  book_id: string;
  name: string;
  order: number;
}

export interface SyncWorldEntry {
  id: string;
  book_id: string;
  section_id: string;
  section_name: string;
  title: string;
  content_text: string;
  tags: string[];
  custom_fields: Array<{ label: string; value: string }>;
  updated_at: number;
}

export interface SyncAssembly {
  id: string;
  book_id: string;
  items: Array<{ id: string; type: string; nodeId?: string; label?: string }>;
}

export interface PendingWrite {
  id: string;
  type: 'update_node_content';
  node_id: string;
  content_raw: string;
  content_text: string;
  written_at: string;
}

export interface ScriptoriumSync {
  version: 1;
  exported_at: string;
  books: SyncBook[];
  writing_nodes: SyncNode[];
  world_sections: SyncWorldSection[];
  world_entries: SyncWorldEntry[];
  assemblies: SyncAssembly[];
  pending_writes: PendingWrite[];
}

// ── File I/O ───────────────────────────────────────────────────────────────
async function readExistingSync(handle: FileSystemDirectoryHandle): Promise<ScriptoriumSync | null> {
  try {
    const fh = await handle.getFileHandle('scriptorium-sync.json');
    const file = await fh.getFile();
    return JSON.parse(await file.text()) as ScriptoriumSync;
  } catch {
    return null;
  }
}

async function writeFile(handle: FileSystemDirectoryHandle, payload: ScriptoriumSync): Promise<void> {
  const fh = await handle.getFileHandle('scriptorium-sync.json', { create: true });
  const writable = await (fh as FileSystemFileHandle & { createWritable(): Promise<FileSystemWritableFileStream> }).createWritable();
  await writable.write(JSON.stringify(payload, null, 2));
  await writable.close();
}

// ── Build payload ──────────────────────────────────────────────────────────
async function buildPayload(handle: FileSystemDirectoryHandle): Promise<ScriptoriumSync> {
  const [books, nodes, sections, entries, assemblies] = await Promise.all([
    db.books.toArray(),
    db.writingNodes.toArray(),
    db.worldSections.toArray(),
    db.worldEntries.toArray(),
    db.assemblies.toArray(),
  ]);

  const sectionNameMap = new Map(sections.map((s) => [s.id, s.name]));

  const existing = await readExistingSync(handle);
  const pendingWrites = existing?.pending_writes ?? [];

  const syncNodes: SyncNode[] = nodes.map((n) => {
    const text = n.content ? tiptapJsonToText(n.content) : '';
    return {
      id: n.id,
      book_id: n.bookId,
      parent_id: n.parentId ?? null,
      type: n.type,
      title: n.title,
      order: n.order,
      content_text: text,
      content_raw: n.content ?? '',
      word_count: countWords(text),
    };
  });

  const syncEntries: SyncWorldEntry[] = entries.map((e) => ({
    id: e.id,
    book_id: e.bookId,
    section_id: e.sectionId,
    section_name: sectionNameMap.get(e.sectionId) ?? '',
    title: e.title,
    content_text: e.content ? tiptapJsonToText(e.content) : '',
    tags: e.tags ?? [],
    custom_fields: (e.customFields ?? []).map((f) => ({
      label: f.label,
      value: typeof f.value === 'string' ? f.value : String(f.value),
    })),
    updated_at: typeof e.updatedAt === 'number' ? e.updatedAt : Date.now(),
  }));

  return {
    version: 1,
    exported_at: new Date().toISOString(),
    books: books.map((b) => ({
      id: b.id,
      title: b.title,
      author: b.author,
      synopsis: b.synopsis ?? '',
      word_goal: b.wordGoal,
      cover_color: b.coverColor,
      world_bible_id: b.worldBibleId,
      created_at: b.createdAt,
      updated_at: b.updatedAt,
    })),
    writing_nodes: syncNodes,
    world_sections: sections.map((s) => ({
      id: s.id,
      book_id: s.bookId,
      name: s.name,
      order: s.order,
    })),
    world_entries: syncEntries,
    assemblies: assemblies.map((a) => ({
      id: a.id,
      book_id: a.bookId,
      items: (a.items ?? []).map((i) => ({
        id: i.id,
        type: i.type,
        nodeId: (i as { nodeId?: string }).nodeId,
        label: (i as { label?: string }).label,
      })),
    })),
    pending_writes: pendingWrites,
  };
}

// ── Public API ─────────────────────────────────────────────────────────────
export async function syncToFile(handle: FileSystemDirectoryHandle): Promise<void> {
  const payload = await buildPayload(handle);
  await writeFile(handle, payload);
}

export async function applyPendingWrites(handle: FileSystemDirectoryHandle): Promise<number> {
  const existing = await readExistingSync(handle);
  if (!existing?.pending_writes?.length) return 0;

  let applied = 0;
  for (const pw of existing.pending_writes) {
    if (pw.type === 'update_node_content') {
      await db.writingNodes.update(pw.node_id, { content: pw.content_raw });
      applied++;
    }
  }

  if (applied > 0) {
    await writeFile(handle, { ...existing, pending_writes: [] });
  }

  return applied;
}

export const isFSASupported = (): boolean => 'showDirectoryPicker' in window;
