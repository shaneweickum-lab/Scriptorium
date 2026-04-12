/**
 * useAuthorAI — React hook for the Ollama-backed, RAG-enhanced writing assistant.
 *
 * Full pipeline on each `suggest()` call:
 *
 *   1. RETRIEVING  — embed the user prompt and query VectorIndexService
 *                    for the top-3 most relevant World Bible entries.
 *                    (Skipped if the vector index has not been initialised;
 *                    the model still answers but without lore context.)
 *
 *   2. GENERATING  — build the RAG system prompt, assemble the message array,
 *                    and stream the response from Ollama token by token.
 *                    Each token is appended to `streamedText` so the UI can
 *                    render it incrementally (e.g. feed it into TipTap).
 *
 *   3. DONE / ERROR — terminal states.
 *
 * Cancellation: call `cancel()` at any time.  The in-flight fetch is aborted
 * and status resets to 'idle'.
 *
 * Multi-turn: `history` accumulates (user, assistant) pairs across calls.
 * Call `clearHistory()` to start a new conversation thread.
 *
 * Usage
 * ─────
 *   const ai = useAuthorAI({ model: 'llama3.2' });
 *
 *   // Trigger a RAG suggestion and stream it into local state
 *   await ai.suggest('Describe what Aelindra sees when she enters the marshes.');
 *
 *   // Render tokens as they arrive
 *   <div>{ai.streamedText}</div>
 *
 *   // Show which lore was used
 *   {ai.retrievedEntries.map(e => <LoreChip key={e.id} entry={e} />)}
 *
 *   // Cancel mid-stream
 *   <button onClick={ai.cancel}>Stop</button>
 */

import { useCallback, useRef, useState } from 'react';
import {
  OllamaService,
  OllamaError,
  OLLAMA_DEFAULT_MODEL,
  OLLAMA_DEFAULT_URL,
  type OllamaMessage,
} from '../services/OllamaService';
import { RagService } from '../services/RagService';
import { VectorIndexService } from '../services/VectorIndexService';
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
}

export interface UseAuthorAIReturn {
  // ── State ──────────────────────────────────────────────────────────────────
  /** Current pipeline status. */
  status: AIStatus;
  /** Accumulated response text (grows token by token during 'generating'). */
  streamedText: string;
  /**
   * World Bible entries that were retrieved and injected into the system prompt.
   * Empty when the vector index is not initialised or no matches exceeded minScore.
   */
  retrievedEntries: SearchResult[];
  /** Human-readable error message when status === 'error'. Null otherwise. */
  error: string | null;
  /** Currently selected Ollama model. */
  model: string;
  /** True while status is 'retrieving' or 'generating'. */
  isStreaming: boolean;
  /** Conversation history (user + assistant turns). Grows across suggest() calls. */
  history: OllamaMessage[];

  // ── Actions ────────────────────────────────────────────────────────────────
  /**
   * Run the full RAG → Ollama pipeline for `userPrompt`.
   * Resolves when the stream ends or is cancelled.
   * Safe to call while already streaming — cancels the current request first.
   */
  suggest: (userPrompt: string) => Promise<void>;
  /** Abort any in-flight request and reset status to 'idle'. */
  cancel: () => void;
  /** Change the Ollama model for subsequent suggest() calls. */
  setModel: (model: string) => void;
  /** Clear conversation history (start a fresh thread). */
  clearHistory: () => void;
  /** Discard accumulated streamedText and reset to 'idle' without clearing history. */
  reset: () => void;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useAuthorAI(options: UseAuthorAIOptions = {}): UseAuthorAIReturn {
  const {
    ollamaUrl = OLLAMA_DEFAULT_URL,
    topK = 3,
    minScore = 0.3,
    temperature = 0.7,
  } = options;

  // ── State ──────────────────────────────────────────────────────────────────
  const [status, setStatus] = useState<AIStatus>('idle');
  const [streamedText, setStreamedText] = useState('');
  const [retrievedEntries, setRetrievedEntries] = useState<SearchResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [model, setModel] = useState(options.model ?? OLLAMA_DEFAULT_MODEL);
  const [history, setHistory] = useState<OllamaMessage[]>([]);

  // ── Refs (stable across renders, no re-render needed) ──────────────────────
  const abortRef = useRef<AbortController | null>(null);
  // Keep history in a ref so the suggest callback always sees the latest value
  // without needing to be re-created every time history changes.
  const historyRef = useRef<OllamaMessage[]>([]);
  historyRef.current = history;

  // Memoised OllamaService — recreated only if the URL changes
  const ollamaRef = useRef<OllamaService | null>(null);
  if (!ollamaRef.current || ollamaRef.current['baseUrl' as never] !== ollamaUrl) {
    ollamaRef.current = new OllamaService(ollamaUrl);
  }

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

      // Reset per-request state
      setStreamedText('');
      setRetrievedEntries([]);
      setError(null);

      // ── Step 1: Retrieval ─────────────────────────────────────────────────
      setStatus('retrieving');

      let context: Awaited<ReturnType<typeof RagService.buildContext>>;
      try {
        context = await RagService.buildContext(
          userPrompt,
          VectorIndexService.getInstance(),
          topK,
          minScore,
        );
      } catch (err) {
        // RAG failure is non-fatal — fall through with empty context
        context = {
          entries: [],
          systemPrompt: '',   // RagService.buildSystemPrompt([]) will be used below
          loreInjected: false,
        };
        // Rebuild with empty entries to get the bare prompt
        context.systemPrompt = RagService.buildSystemPrompt([]);
      }

      if (signal.aborted) return;
      setRetrievedEntries(context.entries);

      // ── Step 2: Build messages ────────────────────────────────────────────
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

            // Persist this turn to conversation history
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
    model,
    isStreaming: status === 'retrieving' || status === 'generating',
    history,
    suggest,
    cancel,
    setModel,
    clearHistory,
    reset,
  };
}
