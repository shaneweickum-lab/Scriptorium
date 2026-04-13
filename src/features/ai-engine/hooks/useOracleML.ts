/**
 * useOracleML — React hook that runs OracleMLService analysis whenever the
 * author's writing nodes change (debounced to avoid thrashing during edits).
 *
 * The resulting OracleProfile is:
 *   • Stored in React state (for UI display)
 *   • Persisted to localStorage via OracleProfileStore (across reloads)
 *   • Returned for injection into the Maven system prompt via RagService
 *
 * Usage
 * ─────
 *   const { oracleProfile, isAnalyzing, analyzeNow } = useOracleML(book.id);
 *
 * The hook will NOT analyze when:
 *   • bookId is undefined
 *   • There are fewer than 5 writing nodes with content
 *   • An analysis is already in progress
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useWritingStore } from '../../../store/writingStore';
import { OracleMLService, type OracleProfile } from '../services/OracleMLService';
import { OracleProfileStore } from '../services/OracleProfileStore';

/** Minimum time between analyses (ms). Prevents hammering during rapid edits. */
const DEBOUNCE_MS = 8_000; // 8 seconds

/** Minimum number of prose nodes before we bother analysing. */
const MIN_NODES = 3;

export interface UseOracleMLReturn {
  /** The most recent oracle profile, or null if not yet analysed. */
  oracleProfile: OracleProfile | null;
  /** True while an analysis pass is running. */
  isAnalyzing: boolean;
  /** Force an immediate analysis run (bypasses the debounce). */
  analyzeNow: () => void;
  /** Remove the oracle profile from state and localStorage. */
  clearProfile: () => void;
}

export function useOracleML(bookId: string | undefined): UseOracleMLReturn {
  const nodes = useWritingStore((s) => s.nodes);
  const [oracleProfile, setOracleProfile] = useState<OracleProfile | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastBookIdRef = useRef<string | undefined>(undefined);

  // ── Load persisted profile when bookId changes ─────────────────────────────
  useEffect(() => {
    if (!bookId) {
      setOracleProfile(null);
      return;
    }

    if (lastBookIdRef.current !== bookId) {
      lastBookIdRef.current = bookId;
      const saved = OracleProfileStore.load(bookId);
      setOracleProfile(saved);
    }
  }, [bookId]);

  // ── Core analysis function ─────────────────────────────────────────────────
  const runAnalysis = useCallback(
    (currentBookId: string) => {
      const proseNodes = nodes.filter((n) => n.content && n.type !== 'part');
      if (proseNodes.length < MIN_NODES) return;

      setIsAnalyzing(true);
      // Run synchronously but yield first so the UI can update
      setTimeout(() => {
        try {
          const profile = OracleMLService.analyze(nodes, currentBookId);
          setOracleProfile(profile);
          OracleProfileStore.save(currentBookId, profile);
        } catch {
          // Analysis failure is non-fatal — keep previous profile
        } finally {
          setIsAnalyzing(false);
        }
      }, 0);
    },
    [nodes],
  );

  // ── Debounced re-analysis whenever nodes change ────────────────────────────
  useEffect(() => {
    if (!bookId) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      runAnalysis(bookId);
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId, nodes.length]); // re-arm on node count change (add/delete)

  // ── Immediate analysis (skip debounce) ────────────────────────────────────
  const analyzeNow = useCallback(() => {
    if (!bookId || isAnalyzing) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    runAnalysis(bookId);
  }, [bookId, isAnalyzing, runAnalysis]);

  // ── Clear ──────────────────────────────────────────────────────────────────
  const clearProfile = useCallback(() => {
    setOracleProfile(null);
    if (bookId) OracleProfileStore.clear(bookId);
  }, [bookId]);

  return { oracleProfile, isAnalyzing, analyzeNow, clearProfile };
}
