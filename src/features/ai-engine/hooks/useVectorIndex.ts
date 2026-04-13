/**
 * useVectorIndex — initialises the RAG vector index for the active book.
 *
 * Called once from AppShell so the index is ready before the author opens
 * Maven for the first time.
 *
 * Lifecycle:
 *   idle          → bookId becomes available + entries load from DB
 *   loading-model → VectorService downloads/restores the 22 MB MiniLM model
 *   indexing      → entries are chunked, embedded, and stored in Orama
 *   ready         → searches enabled; Maven can retrieve lore
 *   error         → non-fatal; Maven falls back to bare-prompt mode
 *
 * Incremental updates (add / edit / delete entries) are handled separately
 * by worldStore calling VectorIndexService.reindexEntry() / removeEntry()
 * after each write, so this hook only runs a full rebuild when the active
 * book changes.
 */

import { useEffect, useState } from 'react';
import { useWorldStore } from '../../../store/worldStore';
import { useWritingStore } from '../../../store/writingStore';
import { VectorIndexService, type IndexProgress } from '../services/VectorIndexService';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type VectorIndexStatus =
  | 'idle'           // not yet started (no book open or no entries)
  | 'loading-model'  // downloading / restoring the embedding model
  | 'indexing'       // embedding entries and writing to the Orama store
  | 'ready'          // index populated; searches enabled
  | 'error';         // initialisation failed — Maven degrades gracefully

export interface UseVectorIndexReturn {
  /** Current phase of the indexing pipeline. */
  indexStatus: VectorIndexStatus;
  /** Progress detail for the current phase (null when idle/ready/error). */
  indexProgress: IndexProgress | null;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useVectorIndex(bookId: string | undefined): UseVectorIndexReturn {
  const entries        = useWorldStore((s) => s.entries);
  const sections       = useWorldStore((s) => s.sections);
  const linkedEntries  = useWorldStore((s) => s.linkedEntries);
  const linkedSections = useWorldStore((s) => s.linkedSections);
  const nodes          = useWritingStore((s) => s.nodes);

  const [indexStatus, setIndexStatus]   = useState<VectorIndexStatus>('idle');
  const [indexProgress, setIndexProgress] = useState<IndexProgress | null>(null);

  // Only trigger when the book changes OR when the first batch of entries
  // arrives (i.e. loadWorld() has just completed for this book).
  const hasEntries = entries.length > 0;

  useEffect(() => {
    if (!bookId) {
      setIndexStatus('idle');
      return;
    }
    if (!hasEntries) return; // wait for loadWorld() to populate entries

    let cancelled = false;

    (async () => {
      const indexService = VectorIndexService.getInstance();

      try {
        // ── Step 1: load the embedding model ────────────────────────────────
        if (!indexService.isInitialised) {
          setIndexStatus('loading-model');
          setIndexProgress({ phase: 'model', completed: 0, total: 100 });

          await indexService.initialize(
            // Transformers.js progress events — only 'progress' events carry a %
            (prog: { status: string; progress?: number }) => {
              if (cancelled || prog.status !== 'progress') return;
              setIndexProgress({
                phase: 'model',
                completed: Math.round(prog.progress ?? 0),
                total: 100,
              });
            },
          );
        }

        if (cancelled) return;

        // ── Step 2: embed and store all world entries ────────────────────────
        const allEntries  = [...entries, ...linkedEntries];
        const allSections = [...sections, ...linkedSections];

        setIndexStatus('indexing');
        setIndexProgress({ phase: 'embedding', completed: 0, total: allEntries.length });

        await indexService.clearIndex();

        if (allEntries.length > 0) {
          await indexService.indexWorldEntries(allEntries, allSections, (p) => {
            if (!cancelled) setIndexProgress(p);
          });
        }

        if (cancelled) return;

        // ── Step 3: embed writing nodes (scenes/chapters with prose) ─────────
        // VectorIndexService already skips nodes with empty text.
        if (nodes.length > 0) {
          await indexService.indexWritingNodes(nodes, (p) => {
            if (!cancelled) setIndexProgress(p);
          });
        }

        if (!cancelled) {
          setIndexStatus('ready');
          setIndexProgress(null);
        }
      } catch (err) {
        if (!cancelled) {
          console.error('[VectorIndex] Initialisation failed:', err);
          setIndexStatus('error');
          setIndexProgress(null);
        }
      }
    })();

    return () => { cancelled = true; };
  // Re-run when the active book changes, or when entries first load.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId, hasEntries]);

  return { indexStatus, indexProgress };
}
