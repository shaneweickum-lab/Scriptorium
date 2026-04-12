/**
 * VectorStore — in-memory vector index backed by Orama v3.
 *
 * Orama stores the index in memory and omits the raw embedding vector from
 * search results (it returns `null` for the embedding field), keeping the
 * response payload small.
 *
 * The index is rebuilt from Dexie on app load via VectorIndexService.
 * For persistence between sessions without re-embedding, serialise with
 * `serialize()` / `deserialize()` and store the blob in IndexedDB.
 *
 * Schema fields
 * ─────────────
 * id          — unique document id (sourceId + ':' + chunkIndex for chunks)
 * text        — the plain-text passage that was embedded
 * embedding   — 384-dim normalised float vector (omitted from results)
 * sourceId    — originating WorldEntry or WritingNode id
 * sourceType  — 'worldEntry' | 'writingNode'
 * title       — human-readable title for display in search results
 * sectionName — World Bible section name (or node type label)
 * chunkIndex  — 0-based chunk position within the source document
 * tags        — space-joined tag string for optional keyword pre-filter
 */

import {
  create,
  insert,
  insertMultiple,
  remove,
  searchVector,
  count,
  save,
  load,
  type AnyOrama,
} from '@orama/orama';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface VectorDocument {
  id: string;
  text: string;
  embedding: number[];
  sourceId: string;
  sourceType: 'worldEntry' | 'writingNode';
  title: string;
  sectionName: string;
  chunkIndex: number;
  tags: string; // space-joined for keyword pre-filter
}

export interface SearchResult {
  id: string;
  score: number;
  sourceId: string;
  sourceType: 'worldEntry' | 'writingNode';
  title: string;
  sectionName: string;
  chunkIndex: number;
  text: string;
  tags: string;
}

// The schema Orama uses internally (must match VectorDocument field types).
const SCHEMA = {
  id: 'string',
  text: 'string',
  // Orama encodes the vector dimension in the type string at runtime.
  // The template literal satisfies TypeScript while keeping the value dynamic.
  embedding: 'vector[384]' as 'vector[384]',
  sourceId: 'string',
  sourceType: 'string',
  title: 'string',
  sectionName: 'string',
  chunkIndex: 'number',
  tags: 'string',
} as const;

// ---------------------------------------------------------------------------
// VectorStore
// ---------------------------------------------------------------------------

export class VectorStore {
  private _db: AnyOrama | null = null;

  /**
   * Initialise (or re-initialise) the Orama index.
   * Must be called before any other method.
   */
  async initialize(): Promise<void> {
    this._db = await create({ schema: SCHEMA });
  }

  private get db(): AnyOrama {
    if (!this._db) throw new Error('VectorStore not initialised — call initialize() first');
    return this._db;
  }

  /** Number of documents currently in the index. */
  async size(): Promise<number> {
    return count(this.db);
  }

  /** Insert a single document. */
  async add(doc: VectorDocument): Promise<void> {
    await insert(this.db, doc);
  }

  /** Insert multiple documents in one batch (faster than repeated add()). */
  async addMany(docs: VectorDocument[]): Promise<void> {
    if (docs.length === 0) return;
    await insertMultiple(this.db, docs);
  }

  /** Remove a document by its Orama id. */
  async delete(id: string): Promise<void> {
    await remove(this.db, id);
  }

  /**
   * Remove all documents whose `sourceId` matches — used when re-indexing a
   * single WorldEntry or WritingNode without rebuilding the whole index.
   */
  async deleteBySourceId(sourceId: string): Promise<void> {
    const zero = new Array<number>(384).fill(0);
    const results = await searchVector(this.db, {
      mode: 'vector',
      vector: { value: zero, property: 'embedding' },
      limit: 10_000,
    });
    const toRemove = results.hits
      .filter((h) => (h.document as unknown as VectorDocument).sourceId === sourceId)
      .map((h) => h.id as string);
    for (const id of toRemove) {
      await remove(this.db, id);
    }
  }

  /**
   * Find the top-K most semantically similar documents to `queryVector`.
   *
   * @param queryVector  384-dimensional normalised embedding of the query.
   * @param topK         Maximum number of results to return (default 5).
   * @param minScore     Minimum cosine similarity score to include (0–1).
   */
  async search(
    queryVector: number[],
    topK = 5,
    minScore = 0.0,
  ): Promise<SearchResult[]> {
    const results = await searchVector(this.db, {
      mode: 'vector',
      vector: { value: queryVector, property: 'embedding' },
      limit: topK,
    });

    return results.hits
      .filter((h) => h.score >= minScore)
      .map((h) => {
        const doc = h.document as unknown as VectorDocument;
        return {
          id: h.id as string,
          score: h.score,
          sourceId: doc.sourceId,
          sourceType: doc.sourceType,
          title: doc.title,
          sectionName: doc.sectionName,
          chunkIndex: doc.chunkIndex,
          text: doc.text,
          tags: doc.tags,
        };
      });
  }

  /** Clear all documents from the index. */
  async clear(): Promise<void> {
    await this.initialize(); // Re-create an empty index
  }

  /**
   * Serialise the index to a JSON string for persistence
   * (e.g. store in IndexedDB as a blob between sessions).
   *
   * Restore with `deserialize()`.
   */
  async serialize(): Promise<string> {
    const raw = await save(this.db);
    return JSON.stringify(raw);
  }

  /**
   * Restore an index from a blob produced by `serialize()`.
   * Creates a fresh Orama database then loads the saved state into it.
   */
  async deserialize(serialized: string): Promise<void> {
    const raw = JSON.parse(serialized);
    // load() requires an existing orama instance to restore into.
    const fresh = await create({ schema: SCHEMA });
    load(fresh, raw);
    this._db = fresh;
  }
}
