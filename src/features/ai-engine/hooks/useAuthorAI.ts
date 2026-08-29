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
import {
  WebLLMService,
  WEB_LLM_DEFAULT_MODEL,
  type WebLLMStatus,
  type WebLLMProgress,
} from '../services/WebLLMService';
import { RagService, type SceneContext } from '../services/RagService';
import { VectorIndexService } from '../services/VectorIndexService';
import {
  analyzeStyle,
  extractLast2000Words,
  type StyleProfile,
} from '../services/StyleAnalyzer';
import { StyleProfileStore } from '../services/StyleProfileStore';
import type { OracleProfile } from '../services/OracleMLService';
import type { SearchResult } from '../services/VectorStore';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type AIStatus =
  | 'idle'
  | 'retrieving'   // running vector search
  | 'generating'   // streaming tokens from Ollama or WebLLM
  | 'done'         // stream finished cleanly
  | 'error';       // terminal error — see `error` field

export type AIProvider = 'ollama' | 'webgpu';

export type { WebLLMStatus, WebLLMProgress };

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
  /**
   * Live plain-text content of the scene the author is currently writing.
   * When provided, Meyvn sees what is on the page and can make contextually
   * grounded suggestions without the author having to paste it in manually.
   * Updated from editorStore on every debounced save (~500 ms).
   */
  sceneText?: string;
  /** Title of the active writing node — shown in the scene context fence. */
  sceneTitle?: string;
  /**
   * OracleML corpus profile for this book. When provided, Meyvn's system
   * prompt is enriched with the author's full craft signature so her
   * suggestions feel increasingly native to their voice over time.
   */
  oracleProfile?: OracleProfile;
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
  suggest: (userPrompt: string, opts?: { maxTokens?: number }) => Promise<void>;
  /** Abort any in-flight request and reset status to 'idle'. */
  cancel: () => void;
  /** Clear streamed output and reset status to 'idle' without touching history. */
  reset: () => void;
  /**
   * Ping the Ollama server to confirm it is reachable.
   * Automatically tries 127.0.0.1 if localhost fails.
   * Returns false (never throws) — safe to call speculatively.
   */
  checkHealth: () => Promise<boolean>;
  /** Raw error string from the last failed health check, or null. */
  connectionError: string | null;
  /**
   * Why the health check failed:
   * - 'cors'    — Ollama is running but CORS is blocking browser access.
   *               Show the OLLAMA_ORIGINS restart command.
   * - 'network' — Ollama is not reachable (not running, wrong port, firewall).
   *               Show the `ollama serve` startup command.
   * - null      — no failure recorded (connected or not yet checked).
   */
  connectionErrorKind: 'cors' | 'network' | null;

  // ── Provider selection ─────────────────────────────────────────────────────
  /** Active inference provider: 'ollama' (default) or 'webgpu'. */
  provider: AIProvider;
  /** Switch between Ollama and WebGPU providers. */
  setProvider: (p: AIProvider) => void;
  /** Whether navigator.gpu is available in this browser. */
  isWebGPUSupported: boolean;
  /** Currently selected WebLLM model ID. */
  webllmModel: string;
  /** Switch the WebGPU model (triggers a reload when loading next). */
  setWebllmModel: (id: string) => void;
  /** Lifecycle status of the WebLLM engine (idle → loading → ready | error). */
  webllmStatus: WebLLMStatus;
  /** Download/init progress for WebLLM (0–1 fraction + status text). */
  webllmProgress: WebLLMProgress | null;
  /** Load the selected WebLLM model into the browser. Safe to call multiple times. */
  loadWebLLM: () => Promise<void>;

  // ── Lore Sentinel ──────────────────────────────────────────────────────────
  /**
   * Scan the current scene for lore-changing events and propose World Bible
   * updates.  Requires a scene to be open (sceneText must be non-empty).
   * Results are stored in `loreProposals` and `loreScanSummary`.
   */
  scanForLoreChanges: () => Promise<void>;
  /** Plain-English summary Meyvn wrote describing detected lore changes. */
  loreScanSummary: string;
  /** Structured update proposals parsed from Meyvn's sentinel response. */
  loreProposals: LoreProposal[];
  /** Clear sentinel results without resetting the main chat state. */
  clearLoreProposals: () => void;
  /** True while the sentinel scan is in progress. */
  isScanning: boolean;
}

// ---------------------------------------------------------------------------
// Lore Sentinel types
// ---------------------------------------------------------------------------

export interface LoreProposal {
  /** Unique ID generated by the hook (for React keys and status tracking). */
  id: string;
  /** The WorldEntry.id to update (= SearchResult.sourceId). Empty for create_entry. */
  entryId: string;
  /** Human-readable title shown in the proposal card. */
  entryTitle: string;
  /** How to apply the change. */
  changeType: 'append_content' | 'add_tag' | 'create_entry';
  /** One-sentence explanation of what changed. */
  description: string;
  /** The exact text / tag to add, or full content for a new entry. */
  proposed: string;
  /** For create_entry: the suggested section name (e.g. "Characters"). */
  sectionTitle?: string;
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
    sceneText,
    sceneTitle,
    oracleProfile,
  } = options;

  // ── State ──────────────────────────────────────────────────────────────────
  const [status, setStatus] = useState<AIStatus>('idle');
  const [streamedText, setStreamedText] = useState('');
  const [retrievedEntries, setRetrievedEntries] = useState<SearchResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [model, setModel] = useState(options.model ?? OLLAMA_DEFAULT_MODEL);
  const [history, setHistory] = useState<OllamaMessage[]>([]);
  // Track whether we should persist history (false during initial load to avoid overwriting)
  const shouldPersistHistoryRef = useRef(false);
  const [styleProfile, setStyleProfile] = useState<StyleProfile | null>(null);
  const [loreProposals, setLoreProposals] = useState<LoreProposal[]>([]);
  const [loreScanSummary, setLoreScanSummary] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [provider, setProvider] = useState<AIProvider>(() => {
    try {
      const saved = localStorage.getItem('meyvn_provider');
      return (saved === 'ollama' || saved === 'webgpu') ? saved : 'ollama';
    } catch { return 'ollama'; }
  });
  const [webllmModel, setWebllmModel] = useState<string>(() => {
    try {
      return localStorage.getItem('meyvn_webllm_model') ?? WEB_LLM_DEFAULT_MODEL;
    } catch { return WEB_LLM_DEFAULT_MODEL; }
  });
  const [webllmStatus, setWebllmStatus] = useState<WebLLMStatus>(() => WebLLMService.status);
  const [webllmProgress, setWebllmProgress] = useState<WebLLMProgress | null>(null);

  // ── Load persisted style profile on mount / bookId change ──────────────────
  useEffect(() => {
    if (!bookId) return;
    const saved = StyleProfileStore.load(bookId);
    if (saved) setStyleProfile(saved);
  }, [bookId]);

  // ── Load persisted chat history on mount / bookId change ───────────────────
  useEffect(() => {
    shouldPersistHistoryRef.current = false;
    try {
      const key = `meyvn_hist_${bookId ?? 'lib'}`;
      const stored = localStorage.getItem(key);
      if (stored) {
        const parsed: OllamaMessage[] = JSON.parse(stored);
        // Only restore user+assistant messages, filter out any system prompt leakage
        setHistory(parsed.filter((m) => m.role === 'user' || m.role === 'assistant'));
      } else {
        setHistory([]);
      }
    } catch { setHistory([]); }
    // Allow persistence after the state settles
    setTimeout(() => { shouldPersistHistoryRef.current = true; }, 0);
  }, [bookId]);

  // ── Persist history to localStorage whenever it grows ──────────────────────
  useEffect(() => {
    if (!shouldPersistHistoryRef.current) return;
    try {
      const key = `meyvn_hist_${bookId ?? 'lib'}`;
      if (history.length === 0) {
        localStorage.removeItem(key);
      } else {
        // Store only last 40 messages to cap storage usage
        const toStore = history.filter((m) => m.role !== 'system').slice(-40);
        localStorage.setItem(key, JSON.stringify(toStore));
      }
    } catch { /* storage full or unavailable — ignore */ }
  }, [history, bookId]);

  // ── WebLLM progress subscription ───────────────────────────────────────────
  useEffect(() => {
    const unsub = WebLLMService.onProgress((p) => {
      setWebllmProgress(p);
      setWebllmStatus(WebLLMService.status);
    });
    // Sync status in case the engine was already loaded before this render
    setWebllmStatus(WebLLMService.status);
    return unsub;
  }, []);

  // ── Refs (stable across renders, mutable without triggering re-renders) ─────
  const abortRef = useRef<AbortController | null>(null);
  const historyRef = useRef<OllamaMessage[]>([]);
  historyRef.current = history;
  const styleProfileRef = useRef<StyleProfile | null>(null);
  styleProfileRef.current = styleProfile;
  const sceneContextRef = useRef<SceneContext | undefined>(undefined);
  sceneContextRef.current =
    sceneText?.trim() ? { text: sceneText, title: sceneTitle ?? '' } : undefined;

  const oracleProfileRef = useRef<OracleProfile | undefined>(undefined);
  oracleProfileRef.current = oracleProfile;

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

  // ── WebLLM loader ──────────────────────────────────────────────────────────
  const webllmModelRef = useRef<string>(WEB_LLM_DEFAULT_MODEL);
  webllmModelRef.current = webllmModel;

  const loadWebLLM = useCallback(async () => {
    setWebllmStatus('loading');
    try {
      await WebLLMService.load(webllmModelRef.current);
      setWebllmStatus('ready');
    } catch {
      setWebllmStatus('error');
    }
  }, []);

  // ── Unified LLM caller — routes to Ollama or WebLLM based on provider ──────
  const providerRef = useRef<AIProvider>('ollama');
  providerRef.current = provider;

  const callLLM = useCallback((opts: {
    messages: OllamaMessage[];
    temperature: number;
    maxTokens?: number;
    signal: AbortSignal;
    onToken: (t: string) => void;
    onDone: (full: string) => void;
  }) => {
    if (providerRef.current === 'webgpu') {
      return WebLLMService.chat({
        messages: opts.messages,
        temperature: opts.temperature,
        maxTokens: opts.maxTokens,
        signal: opts.signal,
        onToken: opts.onToken,
        onDone: opts.onDone,
      });
    }
    return ollamaRef.current!.chat({
      model,
      messages: opts.messages,
      temperature: opts.temperature,
      maxTokens: opts.maxTokens,
      signal: opts.signal,
      onToken: opts.onToken,
      onDone: opts.onDone,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model]);

  // ── cancel ──────────────────────────────────────────────────────────────────
  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStatus('idle');
  }, []);

  // ── suggest ─────────────────────────────────────────────────────────────────
  const suggest = useCallback(
    async (userPrompt: string, opts?: { maxTokens?: number }) => {
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
          sceneContextRef.current,
          oracleProfileRef.current,
        );
      } catch {
        // RAG failure is non-fatal — use bare prompt with style/scene/oracle if available
        context = {
          entries: [],
          systemPrompt: RagService.buildSystemPrompt(
            [],
            styleProfileRef.current ?? undefined,
            sceneContextRef.current,
            oracleProfileRef.current,
          ),
          loreInjected: false,
          styleInjected: !!styleProfileRef.current,
          sceneInjected: !!sceneContextRef.current,
          oracleInjected: !!oracleProfileRef.current,
        };
      }

      if (signal.aborted) return;
      setRetrievedEntries(context.entries);

      // ── Step 2: Assemble message array ────────────────────────────────────
      // Limit context to the last 8 messages (4 turns) so small models
      // don't run out of context window on long conversations
      const messages = RagService.buildMessages(
        userPrompt,
        context,
        historyRef.current.slice(-8),
      );

      // ── Step 3: Stream from Ollama ────────────────────────────────────────
      setStatus('generating');

      try {
        await callLLM({
          messages,
          signal,
          temperature,
          maxTokens: opts?.maxTokens,
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

            // Parse any lore-proposals blocks the model emitted in its response
            const { rawProposals } = RagService.parseSentinelResponse(fullText);
            if (rawProposals.length > 0) {
              const proposals: LoreProposal[] = rawProposals.map((p) => ({
                ...p,
                id: crypto.randomUUID(),
              }));
              setLoreProposals((prev) => [...prev, ...proposals]);
            }

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

  // ── Lore Sentinel ───────────────────────────────────────────────────────────
  const clearLoreProposals = useCallback(() => {
    setLoreProposals([]);
    setLoreScanSummary('');
  }, []);

  const scanForLoreChanges = useCallback(async () => {
    const scene = sceneContextRef.current;
    if (!scene?.text?.trim()) return;

    // Cancel any in-flight request and start a fresh one
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const { signal } = controller;

    setIsScanning(true);
    setLoreProposals([]);
    setLoreScanSummary('');

    try {
      // Retrieve the most relevant World Bible entries for this scene
      const entries = await RagService.retrieveEntries(
        scene.text.split(/\s+/).slice(0, 120).join(' '), // first ~120 words as query
        VectorIndexService.getInstance(),
        8,    // cast a wider net than normal RAG
        0.2,  // lower threshold — we want candidates, not just top matches
      );

      if (signal.aborted) return;

      const messages = RagService.buildSentinelMessages(entries, scene);

      let fullText = '';
      await callLLM({
        messages,
        signal,
        temperature: 0.2, // deterministic output for structured JSON
        onToken: (token) => { fullText += token; },
        onDone: (text) => {
          if (signal.aborted) return;
          const { summary, rawProposals } = RagService.parseSentinelResponse(text);
          setLoreScanSummary(summary);
          setLoreProposals(
            rawProposals.map((p) => ({ ...p, id: crypto.randomUUID() })),
          );
        },
      });
    } catch (err) {
      if (signal.aborted) return;
      const msg =
        err instanceof OllamaError ? err.message
        : err instanceof Error ? err.message
        : 'Scan failed unexpectedly';
      setLoreScanSummary(`Something went awry in the seeing: ${msg}`);
    } finally {
      if (!signal.aborted) setIsScanning(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callLLM]);

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

  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [connectionErrorKind, setConnectionErrorKind] = useState<'cors' | 'network' | null>(null);

  const checkHealth = useCallback(async (): Promise<boolean> => {
    const ok = await ollamaRef.current!.checkHealth();
    if (ok) {
      setConnectionError(null);
      setConnectionErrorKind(null);
      return true;
    }

    const kind = ollamaRef.current!.lastErrorKind;

    // If CORS is blocking, a different URL won't help — skip the fallback loop
    if (kind === 'cors') {
      setConnectionError(ollamaRef.current!.lastError ?? 'CORS policy blocked the request');
      setConnectionErrorKind('cors');
      return false;
    }

    // Network failure — try alternate hosts (localhost → 127.0.0.1, etc.)
    const { url: workingUrl, hasCorsIssue } = await OllamaService.findWorkingUrl();
    if (workingUrl) {
      ollamaRef.current = new OllamaService(workingUrl);
      setConnectionError(null);
      setConnectionErrorKind(null);
      return true;
    }
    if (hasCorsIssue) {
      setConnectionError('Ollama is running but CORS is blocking browser access');
      setConnectionErrorKind('cors');
      return false;
    }
    setConnectionError(ollamaRef.current!.lastError ?? 'Unknown error');
    setConnectionErrorKind('network');
    return false;
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
    checkHealth,
    connectionError,
    connectionErrorKind,
    scanForLoreChanges,
    loreScanSummary,
    loreProposals,
    clearLoreProposals,
    isScanning,
    provider,
    setProvider: (p: AIProvider) => {
      try { localStorage.setItem('meyvn_provider', p); } catch { /* ignore */ }
      setProvider(p);
    },
    isWebGPUSupported: WebLLMService.isWebGPUSupported(),
    webllmModel,
    setWebllmModel: (id: string) => {
      try { localStorage.setItem('meyvn_webllm_model', id); } catch { /* ignore */ }
      setWebllmModel(id);
    },
    webllmStatus,
    webllmProgress,
    loadWebLLM,
  };
}
