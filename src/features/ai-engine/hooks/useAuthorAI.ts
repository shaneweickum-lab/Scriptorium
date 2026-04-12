/**
 * useAuthorAI — React hook for the Ollama-backed, RAG + style-aware writing assistant.
 *
 * Full pipeline on each `suggest()` call:
 *
 *   1. RETRIEVING  — embed the prompt, query VectorIndexService for the top-3
 *                    most relevant World Bible entries (skipped when index not
 *                    initialised; model still answers with style context only).
 *
 *   2. GENERATING  — build the RAG + style system prompt, assemble messages,
 *                    and stream the Ollama response token by token.
 *                    Each token is appended to `streamedText` so the UI can
 *                    render it incrementally (e.g. pipe into TipTap).
 *
 *   3. DONE / ERROR — terminal states.
 *
 * Style analysis:
 *   Call `refreshStyleProfile(plainText)` at any time (typically when the
 *   author pauses typing) to analyse recent writing and update the style
 *   constraints injected into every subsequent `suggest()` call.
 *   The profile is persisted to localStorage keyed by `bookId`.
 *
 * Usage
 * ─────
 *   const ai = useAuthorAI({ model: 'llama3.2', bookId: book.id });
 *
 *   // Analyse recent writing to capture the author's voice
 *   ai.refreshStyleProfile(extractLast2000Words(allPlainText));
 *
 *   // Stream a lore-grounded, style-matched suggestion
 *   await ai.suggest('Describe what Aelindra sees when she enters the marshes.');
 *
 *   // Render tokens in real-time
 *   <pre>{ai.streamedText}</pre>
 *
 *   // Show which lore entries were used
 *   {ai.retrievedEntries.map(e => <span key={e.id}>{e.title}</span>)}
 *
 *   // Show active style profile
 *   {ai.styleProfile && <StyleBadge profile={ai.styleProfile} />}
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  OllamaService,
  OllamaError,
  OLLAMA_DEFAULT_MODEL,
  OLLAMA_DEFAULT_URL,
  type OllamaMessage,
} from '../services/OllamaService';
import { RagService } from '../services/RagService';
import { VectorIndexService } from '../services/VectorIndexService';
import {
  analyzeStyle,
  extractLast2000Words,
  type StyleProfile,
} from '../services/StyleAnalyzer';
import { StyleProfileStore } from '../services/StyleProfileStore';
import type { SearchResult } from '../services/VectorStore';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type AIStatus =
  | 'idle'
  | 'retrieving'   // running vector search
  | 'generating'   // streaming tokens from Ollama
  | 'done'         // stream finished cleanly
  | 'error';       // terminal error — see `error` field

export interface UseAuthorAIOptions {
  /** Ollama model tag. Default: 'llama3.2' */
  model?: string;
  /** Base URL of the Ollama server. Default: 'http://localhost:11434' */
  ollamaUrl?: string;
  /** Number of World Bible entries to retrieve per query. Default: 3 */
  topK?: number;
  /** Minimum vector similarity score to include an entry (0–1). Default: 0.3 */
  minScore?: number;
  /** Sampling temperature for Ollama (0–2). Default: 0.7 */
  temperature?: number;
  /**
   * Active book ID — used as the localStorage key for style profile persistence.
   * When omitted, style profiles are not persisted across page reloads.
   */
  bookId?: string;
}

export interface UseAuthorAIReturn {
  // ── Streaming state ────────────────────────────────────────────────────────
  /** Current pipeline status. */
  status: AIStatus;
  /** Accumulated response text (grows token by token during 'generating'). */
  streamedText: string;
  /**
   * World Bible entries retrieved and injected into the system prompt.
   * Empty when the index is not initialised or no entries passed `minScore`.
   */
  retrievedEntries: SearchResult[];
  /** Human-readable error when status === 'error'. Null otherwise. */
  error: string | null;
  /** True while status is 'retrieving' or 'generating'. */
  isStreaming: boolean;

  // ── Model ──────────────────────────────────────────────────────────────────
  /** Currently selected Ollama model tag. */
  model: string;
  /** Change the model for subsequent suggest() calls. */
  setModel: (model: string) => void;

  // ── Style profile ──────────────────────────────────────────────────────────
  /**
   * The active style profile, or null if none has been generated yet.
   * Automatically loaded from localStorage (using bookId) on first render.
   */
  styleProfile: StyleProfile | null;
  /**
   * Analyse `plainText` (call extractLast2000Words first for large corpora),
   * update the active style profile, and persist it to localStorage.
   *
   * The returned StyleProfile is also immediately available via `styleProfile`.
   *
   * @param plainText  Raw prose — NOT TipTap JSON. Strip markup before passing.
   */
  refreshStyleProfile: (plainText: string) => StyleProfile;
  /** Remove the active style profile from state and localStorage. */
  clearStyleProfile: () => void;

  // ── Conversation ───────────────────────────────────────────────────────────
  /** Full conversation history (user + assistant turns). Grows across suggest() calls. */
  history: OllamaMessage[];
  /** Start a new conversation thread (clears history but keeps style profile). */
  clearHistory: () => void;

  // ── Actions ────────────────────────────────────────────────────────────────
  /**
   * Run the full RAG → style → Ollama pipeline for `userPrompt`.
   * Resolves when the stream ends or is cancelled.
   * Safe to call while already streaming — cancels the in-flight request first.
   */
  suggest: (userPrompt: string) => Promise<void>;
  /** Abort any in-flight request and reset status to 'idle'. */
  cancel: () => void;
  /** Clear streamed output and reset status to 'idle' without touching history. */
  reset: () => void;
}

// Re-export for convenience so consumers don't need a separate import
export { extractLast2000Words };

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useAuthorAI(options: UseAuthorAIOptions = {}): UseAuthorAIReturn {
  const {
    ollamaUrl = OLLAMA_DEFAULT_URL,
    topK = 3,
    minScore = 0.3,
    temperature = 0.7,
    bookId,
  } = options;

  // ── State ──────────────────────────────────────────────────────────────────
  const [status, setStatus] = useState<AIStatus>('idle');
  const [streamedText, setStreamedText] = useState('');
  const [retrievedEntries, setRetrievedEntries] = useState<SearchResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [model, setModel] = useState(options.model ?? OLLAMA_DEFAULT_MODEL);
  const [history, setHistory] = useState<OllamaMessage[]>([]);
  const [styleProfile, setStyleProfile] = useState<StyleProfile | null>(null);

  // ── Load persisted style profile on mount / bookId change ──────────────────
  useEffect(() => {
    if (!bookId) return;
    const saved = StyleProfileStore.load(bookId);
    if (saved) setStyleProfile(saved);
  }, [bookId]);

  // ── Refs (stable across renders, mutable without triggering re-renders) ─────
  const abortRef = useRef<AbortController | null>(null);
  const historyRef = useRef<OllamaMessage[]>([]);
  historyRef.current = history;
  const styleProfileRef = useRef<StyleProfile | null>(null);
  styleProfileRef.current = styleProfile;

  // OllamaService instance — recreated only when the base URL changes
  const ollamaRef = useRef<OllamaService | null>(null);
  if (!ollamaRef.current) {
    ollamaRef.current = new OllamaService(ollamaUrl);
  }
  // Track URL changes without introducing a hook dependency cycle
  const prevUrlRef = useRef(ollamaUrl);
  if (prevUrlRef.current !== ollamaUrl) {
    prevUrlRef.current = ollamaUrl;
    ollamaRef.current = new OllamaService(ollamaUrl);
  }

  // ── Style profile actions ───────────────────────────────────────────────────
  const refreshStyleProfile = useCallback(
    (plainText: string): StyleProfile => {
      const extracted = extractLast2000Words(plainText);
      const profile = analyzeStyle(extracted);
      setStyleProfile(profile);
      if (bookId) StyleProfileStore.save(bookId, profile);
      return profile;
    },
    [bookId],
  );

  const clearStyleProfile = useCallback(() => {
    setStyleProfile(null);
    if (bookId) StyleProfileStore.clear(bookId);
  }, [bookId]);

  // ── cancel ──────────────────────────────────────────────────────────────────
  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStatus('idle');
  }, []);

  // ── suggest ─────────────────────────────────────────────────────────────────
  const suggest = useCallback(
    async (userPrompt: string) => {
      // Cancel any in-flight request before starting a new one
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const { signal } = controller;

      // Reset per-request output state
      setStreamedText('');
      setRetrievedEntries([]);
      setError(null);

      // ── Step 1: Retrieval + prompt construction ───────────────────────────
      setStatus('retrieving');

      let context: Awaited<ReturnType<typeof RagService.buildContext>>;
      try {
        context = await RagService.buildContext(
          userPrompt,
          VectorIndexService.getInstance(),
          topK,
          minScore,
          styleProfileRef.current ?? undefined,
        );
      } catch {
        // RAG failure is non-fatal — use bare prompt with style if available
        context = {
          entries: [],
          systemPrompt: RagService.buildSystemPrompt(
            [],
            styleProfileRef.current ?? undefined,
          ),
          loreInjected: false,
          styleInjected: !!styleProfileRef.current,
        };
      }

      if (signal.aborted) return;
      setRetrievedEntries(context.entries);

      // ── Step 2: Assemble message array ────────────────────────────────────
      const messages = RagService.buildMessages(
        userPrompt,
        context,
        historyRef.current,
      );

      // ── Step 3: Stream from Ollama ────────────────────────────────────────
      setStatus('generating');

      try {
        await ollamaRef.current!.chat({
          model,
          messages,
          signal,
          temperature,
          onToken: (token) => {
            setStreamedText((prev) => prev + token);
          },
          onDone: (fullText) => {
            if (signal.aborted) return;
            // Persist this turn to conversation history for multi-turn use
            const userTurn: OllamaMessage = { role: 'user', content: userPrompt };
            const assistantTurn: OllamaMessage = {
              role: 'assistant',
              content: fullText,
            };
            setHistory((prev) => [...prev, userTurn, assistantTurn]);
            setStatus('done');
          },
        });
      } catch (err) {
        if (signal.aborted) return; // Cancelled — not an error

        const message =
          err instanceof OllamaError
            ? err.message
            : err instanceof Error
            ? err.message
            : 'An unexpected error occurred';

        setError(message);
        setStatus('error');
      }
    },
    // model / topK / minScore / temperature are options — rebuild when they change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [model, topK, minScore, temperature],
  );

  // ── Utilities ───────────────────────────────────────────────────────────────
  const clearHistory = useCallback(() => setHistory([]), []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStreamedText('');
    setRetrievedEntries([]);
    setError(null);
    setStatus('idle');
  }, []);

  return {
    status,
    streamedText,
    retrievedEntries,
    error,
    isStreaming: status === 'retrieving' || status === 'generating',
    model,
    setModel,
    styleProfile,
    refreshStyleProfile,
    clearStyleProfile,
    history,
    clearHistory,
    suggest,
    cancel,
    reset,
  };
}
