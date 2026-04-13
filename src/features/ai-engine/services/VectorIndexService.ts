/**
 * VectorIndexService — orchestrates the full pipeline:
 *
 *   WorldEntry[] / WritingNode[]
 *     → worldBibleTransformer  (plain text)
 *     → ChunkingService        (512-token segments, 50-token overlap)
 *     → VectorService          (384-dim embeddings)
 *     → VectorStore            (Orama in-memory index)
 *
 * Typical call sequence on app startup:
 *
 *   const idx = VectorIndexService.getInstance();
 *   await idx.indexWorldEntries(entries, sections, onProgress);
 *   const results = await idx.searchSimilar('glowing ancient rune', 5);
 *
 * Re-indexing a single entry after an edit:
 *
 *   await idx.reindexEntry(updatedEntry, sections);
 */

import { VectorService, type ProgressCallback } from './VectorService';
import { VectorStore, type SearchResult } from './VectorStore';
import { chunkText, estimateTokenCount } from './ChunkingService';
import {
  worldEntriesToIndexable,
  writingNodeToText,
} from '../transformers/worldBibleTransformer';
import type { WorldEntry, WorldSection, WritingNode } from '../../../types';

// ---------------------------------------------------------------------------
// Progress types
// ---------------------------------------------------------------------------

export interface IndexProgress {
  phase: 'model' | 'embedding' | 'storing';
  completed: number;
  total: number;
  label?: string;
}

export type IndexProgressCallback = (progress: IndexProgress) => void;

// ---------------------------------------------------------------------------
// VectorIndexService
// ---------------------------------------------------------------------------

export class VectorIndexService {
  private static _instance: VectorIndexService | null = null;

  private readonly _vectorService = VectorService.getInstance();
  private readonly _store = new VectorStore();
  private _initialised = false;

  private constructor() {}

  static getInstance(): VectorIndexService {
    if (!VectorIndexService._instance) {
      VectorIndexService._instance = new VectorIndexService();
    }
    return VectorIndexService._instance;
  }

  /** The underlying VectorStore — exposed for serialisation / inspection. */
  get store(): VectorStore {
    return this._store;
  }

  /** True once initialize() has been called. */
  get isInitialised(): boolean {
    return this._initialised;
  }

  /**
   * Prepare the store and ensure the embedding model is downloaded.
   * Must be called once before indexing or searching.
   *
   * @param onModelProgress  Optional callback forwarded to Transformers.js
   *                         download events.
   */
  async initialize(onModelProgress?: ProgressCallback): Promise<void> {
    await this._store.initialize();
    await this._vectorService.load(onModelProgress);
    this._initialised = true;
  }

  // -------------------------------------------------------------------------
  // Indexing
  // -------------------------------------------------------------------------

  /**
   * Embed and index all World Bible entries for a book.
   *
   * Long entries (> 512 tokens) are chunked automatically; short entries
   * are stored as a single document. Each chunk gets a unique Orama id of
   * the form `<entryId>:<chunkIndex>`.
   *
   * @param entries     WorldEntry[] from Dexie.
   * @param sections    WorldSection[] for the same book.
   * @param onProgress  Optional progress callback.
   */
  async indexWorldEntries(
    entries: WorldEntry[],
    sections: WorldSection[],
    onProgress?: IndexProgressCallback,
  ): Promise<void> {
    const indexable = worldEntriesToIndexable(entries, sections);
    const docsToInsert: Parameters<VectorStore['addMany']>[0] = [];

    for (let i = 0; i < indexable.length; i++) {
      const item = indexable[i];

      onProgress?.({
        phase: 'embedding',
        completed: i,
        total: indexable.length,
        label: item.title,
      });

      const chunks =
        estimateTokenCount(item.text) > 512
          ? chunkText(item.text, 512, 50)
          : [{ chunkIndex: 0, text: item.text, startTokenApprox: 0, endTokenApprox: 0 }];

      for (const chunk of chunks) {
        const embedding = await this._vectorService.embed(chunk.text);
        docsToInsert.push({
          id: `${item.id}:${chunk.chunkIndex}`,
          text: chunk.text,
          embedding,
          sourceId: item.id,
          sourceType: 'worldEntry',
          title: item.title,
          sectionName: item.sectionName,
          chunkIndex: chunk.chunkIndex,
          tags: item.tags.join(' '),
        });
      }
    }

    onProgress?.({ phase: 'storing', completed: 0, total: 1 });
    await this._store.addMany(docsToInsert);
    onProgress?.({ phase: 'storing', completed: 1, total: 1 });
  }

  /**
   * Embed and index a set of WritingNodes (chapters / scenes).
   * Nodes with content > 512 tokens are chunked before embedding.
   */
  async indexWritingNodes(
    nodes: WritingNode[],
    onProgress?: IndexProgressCallback,
  ): Promise<void> {
    const docsToInsert: Parameters<VectorStore['addMany']>[0] = [];

    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];

      onProgress?.({
        phase: 'embedding',
        completed: i,
        total: nodes.length,
        label: node.title || node.type,
      });

      const text = writingNodeToText(node);
      if (!text.trim()) continue;

      const chunks =
        estimateTokenCount(text) > 512
          ? chunkText(text, 512, 50)
          : [{ chunkIndex: 0, text, startTokenApprox: 0, endTokenApprox: 0 }];

      for (const chunk of chunks) {
        const embedding = await this._vectorService.embed(chunk.text);
        docsToInsert.push({
          id: `${node.id}:${chunk.chunkIndex}`,
          text: chunk.text,
          embedding,
          sourceId: node.id,
          sourceType: 'writingNode',
          title: node.title || `Untitled ${node.type}`,
          sectionName: node.type,
          chunkIndex: chunk.chunkIndex,
          tags: '',
        });
      }
    }

    await this._store.addMany(docsToInsert);
  }

  /**
   * Re-index a single WorldEntry after it has been edited.
   * Removes all previous chunks for the entry then re-embeds.
   */
  async reindexEntry(entry: WorldEntry, sections: WorldSection[]): Promise<void> {
    await this._store.deleteBySourceId(entry.id);
    await this.indexWorldEntries([entry], sections);
  }

  /**
   * Remove all indexed chunks for a single entry (e.g. after deletion).
   * No-op if the index is not initialised.
   */
  async removeEntry(entryId: string): Promise<void> {
    if (!this._initialised) return;
    await this._store.deleteBySourceId(entryId);
  }

  // -------------------------------------------------------------------------
  // Search
  // -------------------------------------------------------------------------

  /**
   * Find the most semantically similar lore entries / manuscript passages
   * for a plain-text query.
   *
   * @param query     Natural-language search string.
   * @param topK      Maximum results to return (default 5).
   * @param minScore  Minimum cosine similarity threshold, 0–1 (default 0.3).
   */
  async searchSimilar(
    query: string,
    topK = 5,
    minScore = 0.3,
  ): Promise<SearchResult[]> {
    const queryVector = await this._vectorService.embed(query);
    return this._store.search(queryVector, topK, minScore);
  }

  /** Clear and rebuild the entire index from scratch. */
  async clearIndex(): Promise<void> {
    await this._store.clear();
  }
}
