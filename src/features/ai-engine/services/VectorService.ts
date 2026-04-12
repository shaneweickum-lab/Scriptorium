/**
 * VectorService — local embedding generation via Transformers.js.
 *
 * Uses the `all-MiniLM-L6-v2` sentence-transformer model (22 MB) to produce
 * 384-dimensional normalised embeddings suitable for cosine similarity search.
 *
 * The model is downloaded from HuggingFace Hub on first use and cached in the
 * browser's Cache API (service-worker-accessible), so subsequent loads — and
 * all use after the first online session — are fully offline.
 *
 * Implemented as a singleton so the model pipeline is loaded once per page
 * session and shared by all callers.
 */

import { pipeline, env } from '@xenova/transformers';

// ---------------------------------------------------------------------------
// Environment configuration
// ---------------------------------------------------------------------------

const isBrowser = typeof window !== 'undefined' && typeof window.caches !== 'undefined';

if (isBrowser) {
  // Browser: use Cache API so the model survives offline (service-worker-accessible).
  env.useBrowserCache = true;
  env.allowLocalModels = false;
} else {
  // Node.js (test scripts, future SSR): fall back to filesystem cache.
  env.useBrowserCache = false;
  env.allowLocalModels = false; // still fetch from HuggingFace Hub
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ProgressStatus =
  | { status: 'initiate'; name: string; file: string }
  | { status: 'download'; name: string; file: string }
  | { status: 'progress'; name: string; file: string; progress: number; loaded: number; total: number }
  | { status: 'done'; name: string; file: string }
  | { status: 'ready' };

export type ProgressCallback = (event: ProgressStatus) => void;

// ---------------------------------------------------------------------------
// VectorService
// ---------------------------------------------------------------------------

export class VectorService {
  static readonly MODEL_ID = 'Xenova/all-MiniLM-L6-v2';
  static readonly DIMENSIONS = 384;

  // Singleton instance
  private static _instance: VectorService | null = null;

  // The HuggingFace feature-extraction pipeline (set after load())
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _pipe: any = null;

  // Serialise concurrent load() calls into a single Promise
  private _loadPromise: Promise<void> | null = null;

  private constructor() {}

  static getInstance(): VectorService {
    if (!VectorService._instance) {
      VectorService._instance = new VectorService();
    }
    return VectorService._instance;
  }

  /** True once the model pipeline is loaded and ready to embed. */
  get isReady(): boolean {
    return this._pipe !== null;
  }

  /**
   * Download (or load from cache) the embedding model.
   * Safe to call multiple times — subsequent calls wait on the same Promise.
   *
   * @param onProgress  Optional callback for download progress events.
   */
  async load(onProgress?: ProgressCallback): Promise<void> {
    if (this._pipe) return; // Already loaded

    if (!this._loadPromise) {
      this._loadPromise = (async () => {
        this._pipe = await pipeline(
          'feature-extraction',
          VectorService.MODEL_ID,
          { progress_callback: onProgress },
        );
      })();
    }

    await this._loadPromise;
  }

  /**
   * Embed a single text string into a 384-dimensional vector.
   * Automatically calls `load()` if the model isn't ready yet.
   *
   * @param text  Plain text (not HTML/TipTap JSON). Max ~512 tokens (~384 words).
   */
  async embed(text: string): Promise<number[]> {
    if (!this._pipe) await this.load();

    const output = await this._pipe(text.trim(), {
      pooling: 'mean',
      normalize: true,
    });

    // output.data is a Float32Array — convert to a plain number[]
    return Array.from(output.data as Float32Array);
  }

  /**
   * Embed multiple texts in sequence, calling an optional progress callback
   * after each one.  Batching is sequential to keep memory pressure low in
   * the browser main thread; move to a Web Worker for parallel throughput.
   *
   * @param texts       Array of plain-text strings to embed.
   * @param onProgress  Called after each embedding with (completed, total).
   */
  async embedBatch(
    texts: string[],
    onProgress?: (completed: number, total: number) => void,
  ): Promise<number[][]> {
    const results: number[][] = [];
    for (let i = 0; i < texts.length; i++) {
      results.push(await this.embed(texts[i]));
      onProgress?.(i + 1, texts.length);
    }
    return results;
  }

  /**
   * Compute cosine similarity between two normalised vectors.
   * Since `embed()` always returns normalised vectors, this is equivalent to
   * a dot product and is very cheap.
   */
  static cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) throw new Error('Vector dimension mismatch');
    let dot = 0;
    for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
    return dot; // Already normalised — dot product = cosine similarity
  }
}
