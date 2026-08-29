/**
 * OllamaService — low-level HTTP client for a locally running Ollama instance.
 *
 * Communicates with the Ollama REST API (default: http://localhost:11434).
 * Uses the /api/chat endpoint so that system and user messages are kept
 * as separate roles rather than concatenated into a single prompt string.
 *
 * Streaming: Ollama returns NDJSON — each response token arrives as one
 * complete JSON object on its own line.  The reader buffers incomplete lines
 * between ReadableStream chunks to guarantee no token is split mid-parse.
 *
 * Cancellation: pass an AbortSignal (from AbortController) to stop streaming
 * mid-flight.  An aborted request resolves normally (onDone is NOT called),
 * so callers can distinguish cancellation from completion.
 *
 * Tauri desktop mode:
 *   When running inside a Tauri desktop app (__TAURI_INTERNALS__ is present),
 *   all HTTP requests are routed through @tauri-apps/plugin-http, which uses
 *   Rust's reqwest under the hood.  This completely bypasses browser CORS — no
 *   OLLAMA_ORIGINS configuration is required.  In browser/PWA mode the service
 *   falls back to standard window.fetch with a two-phase CORS/network probe.
 */

// ---------------------------------------------------------------------------
// Tauri fetch adapter
// ---------------------------------------------------------------------------

/** True when running inside a Tauri desktop app. */
export const IS_TAURI =
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

/**
 * Lazy singleton — resolves to the right `fetch` implementation:
 * - Tauri context  → @tauri-apps/plugin-http fetch (CORS-free, Rust reqwest)
 * - Browser/PWA    → window.fetch
 */
let _fetchPromise: Promise<typeof fetch> | null = null;

function getHttpFetch(): Promise<typeof fetch> {
  if (_fetchPromise) return _fetchPromise;
  if (IS_TAURI) {
    _fetchPromise = import('@tauri-apps/plugin-http').then(
      m => m.fetch as unknown as typeof fetch,
      () => window.fetch.bind(window), // graceful fallback if plugin missing
    );
  } else {
    _fetchPromise = Promise.resolve(window.fetch.bind(window));
  }
  return _fetchPromise;
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface OllamaMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface OllamaModel {
  name: string;
  size: number;
  digest: string;
  modified_at: string;
}

/** Options passed to OllamaService.chat() */
export interface OllamaChatOptions {
  /** Model tag, e.g. "llama3.2", "mistral", "phi3". */
  model: string;
  /** Ordered message array — must include at least one 'user' turn. */
  messages: OllamaMessage[];
  /**
   * Called for each streaming token as it arrives.
   * The token is the raw text fragment, not accumulated text.
   */
  onToken: (token: string) => void;
  /**
   * Called once when the stream ends cleanly.
   * Receives the full concatenated response text.
   */
  onDone: (fullText: string) => void;
  /** AbortSignal — set on AbortController to cancel in-flight streaming. */
  signal?: AbortSignal;
  /** Sampling temperature, 0–2 (default 0.7). */
  temperature?: number;
  /** Maximum tokens to generate (maps to Ollama num_predict). Omit for model default. */
  maxTokens?: number;
  /** Context window to send back (enables multi-turn context retention). */
  context?: number[];
}

// Internal shapes returned by Ollama /api/chat stream
interface OlamaChatStreamChunk {
  model: string;
  created_at: string;
  message: { role: string; content: string };
  done: boolean;
}

// Internal shape returned by Ollama /api/tags
interface OllamaTagsResponse {
  models: OllamaModel[];
}

// ---------------------------------------------------------------------------
// OllamaService
// ---------------------------------------------------------------------------

export const OLLAMA_DEFAULT_URL = 'http://localhost:11434';
export const OLLAMA_DEFAULT_MODEL = 'qwen3:8b';

/** All Ollama models Meyvn supports, in order of display. */
export const OLLAMA_CHAT_MODELS = [
  {
    tag: 'qwen3:8b',
    label: 'Qwen3 8B',
    vram: '~6 GB',
    recommended: true,
    description: 'Best balance of quality and speed',
    pullCmd: 'ollama pull qwen3:8b',
  },
  {
    tag: 'qwen3:14b',
    label: 'Qwen3 14B',
    vram: '~10 GB',
    recommended: false,
    description: 'Higher reasoning quality, needs 16 GB+ VRAM',
    pullCmd: 'ollama pull qwen3:14b',
  },
  {
    tag: 'qwen3:32b',
    label: 'Qwen3 32B',
    vram: '~20 GB',
    recommended: false,
    description: 'Maximum quality, needs 24 GB+ VRAM or CPU offload',
    pullCmd: 'ollama pull qwen3:32b',
  },
] as const;

/** Candidate base URLs tried in order when auto-detecting a working host. */
const OLLAMA_FALLBACK_URLS = [
  'http://localhost:11434',
  'http://127.0.0.1:11434',
];

export class OllamaService {
  private readonly baseUrl: string;

  /** The raw error message from the last failed checkHealth() call, or null. */
  lastError: string | null = null;

  /**
   * Distinguishes why checkHealth() returned false:
   * - 'cors'    — Ollama IS running but the browser's CORS policy blocked it.
   *               Fix: restart Ollama with OLLAMA_ORIGINS set to the app origin.
   *               (Never set in Tauri — Tauri fetch is always CORS-free.)
   * - 'network' — Ollama is not reachable (not running, wrong port, firewall).
   * - null      — no failure recorded yet.
   */
  lastErrorKind: 'cors' | 'network' | null = null;

  constructor(baseUrl: string = OLLAMA_DEFAULT_URL) {
    // Strip trailing slash for consistent URL construction
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  // -------------------------------------------------------------------------
  // Health & discovery
  // -------------------------------------------------------------------------

  /**
   * Ping Ollama to confirm it is running and reachable.
   * Populates `lastError` and `lastErrorKind` on failure.
   * Returns false instead of throwing so callers can handle it gracefully.
   *
   * Browser mode — two-phase check:
   *   1. CORS fetch  — succeeds when Ollama is up and CORS is configured.
   *   2. no-cors probe — if (1) fails, determines whether Ollama is up but
   *      CORS-blocked ('cors') or truly unreachable ('network').
   *
   * Tauri mode — single-phase check (no CORS enforcement):
   *   All failures are network failures; lastErrorKind is always 'network'.
   */
  async checkHealth(signal?: AbortSignal): Promise<boolean> {
    this.lastError = null;
    this.lastErrorKind = null;
    const fetchFn = await getHttpFetch();

    try {
      const init: RequestInit = { method: 'GET', signal };
      if (!IS_TAURI) init.mode = 'cors';
      const res = await fetchFn(`${this.baseUrl}/api/tags`, init);
      if (!res.ok) {
        this.lastError = `Ollama returned HTTP ${res.status}`;
        this.lastErrorKind = 'network';
      }
      return res.ok;
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') throw err;
      this.lastError = err instanceof Error ? err.message : String(err);
      if (IS_TAURI) {
        // Tauri fetch is CORS-free — any failure is a pure network error
        this.lastErrorKind = 'network';
      } else {
        // Browser: probe without CORS to distinguish blocked vs unreachable
        const reachable = await OllamaService._probeReachable(this.baseUrl);
        this.lastErrorKind = reachable ? 'cors' : 'network';
      }
      return false;
    }
  }

  /**
   * Browser-only no-cors probe.
   * Resolves true if the server answered (opaque response), false if unreachable.
   */
  private static async _probeReachable(baseUrl: string): Promise<boolean> {
    try {
      await fetch(`${baseUrl}/api/tags`, { method: 'GET', mode: 'no-cors' });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Try each URL in OLLAMA_FALLBACK_URLS in order.
   * Returns:
   *  - `{ url, hasCorsIssue: false }` — a URL works with full access.
   *  - `{ url: null, hasCorsIssue: true }` — Ollama running but CORS blocks.
   *    (Never returned in Tauri — CORS is not applicable.)
   *  - `{ url: null, hasCorsIssue: false }` — Ollama not reachable at all.
   */
  static async findWorkingUrl(): Promise<{ url: string | null; hasCorsIssue: boolean }> {
    const fetchFn = await getHttpFetch();

    // Phase 1 — try each URL
    for (const url of OLLAMA_FALLBACK_URLS) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 3_000);
        const init: RequestInit = { method: 'GET', signal: controller.signal };
        if (!IS_TAURI) init.mode = 'cors';
        const res = await fetchFn(`${url}/api/tags`, init);
        clearTimeout(timer);
        if (res.ok) return { url, hasCorsIssue: false };
      } catch {
        // Try the next candidate
      }
    }

    // Phase 2 (browser only) — no-cors probe to distinguish CORS from network
    if (!IS_TAURI) {
      for (const url of OLLAMA_FALLBACK_URLS) {
        try {
          await fetch(`${url}/api/tags`, { method: 'GET', mode: 'no-cors' });
          return { url: null, hasCorsIssue: true };
        } catch {
          // Not reachable at this address
        }
      }
    }

    return { url: null, hasCorsIssue: false };
  }

  /**
   * Fetch the list of models installed in the local Ollama instance.
   * Throws an OllamaError if Ollama is unreachable.
   */
  async listModels(signal?: AbortSignal): Promise<OllamaModel[]> {
    const res = await this.fetchOrThrow(`${this.baseUrl}/api/tags`, {
      method: 'GET',
      signal,
    });
    const data: OllamaTagsResponse = await res.json();
    return data.models ?? [];
  }

  // -------------------------------------------------------------------------
  // Streaming chat completion
  // -------------------------------------------------------------------------

  /**
   * Send a chat request and stream the response token by token.
   *
   * Resolves when the stream ends (done) or the signal is aborted.
   * Rejects with an OllamaError for HTTP errors or malformed responses.
   *
   * Token accumulation is handled internally — `onDone` always receives
   * the complete response string.
   */
  async chat(opts: OllamaChatOptions): Promise<void> {
    const {
      model,
      messages,
      onToken,
      onDone,
      signal,
      temperature = 0.7,
      maxTokens,
    } = opts;

    const body = JSON.stringify({
      model,
      messages,
      stream: true,
      options: {
        temperature,
        ...(maxTokens !== undefined ? { num_predict: maxTokens } : {}),
      },
    });

    const res = await this.fetchOrThrow(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal,
    });

    if (!res.body) {
      throw new OllamaError('Ollama returned a response with no body', 'NO_BODY');
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let lineBuffer = '';
    let accumulated = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        lineBuffer += decoder.decode(value, { stream: true });

        // Split on newlines; the last element may be an incomplete line
        const lines = lineBuffer.split('\n');
        lineBuffer = lines.pop() ?? ''; // hold the trailing partial line

        for (const rawLine of lines) {
          const line = rawLine.trim();
          if (!line) continue;

          let chunk: OlamaChatStreamChunk;
          try {
            chunk = JSON.parse(line);
          } catch {
            // Skip non-JSON lines (e.g. empty keep-alive pings)
            continue;
          }

          const token = chunk.message?.content ?? '';
          if (token) {
            accumulated += token;
            onToken(token);
          }

          if (chunk.done) {
            onDone(accumulated);
            return;
          }
        }
      }
    } catch (err) {
      // AbortError is expected when the consumer cancels — resolve silently
      if (err instanceof Error && err.name === 'AbortError') return;
      throw err;
    } finally {
      reader.releaseLock();
    }
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  private async fetchOrThrow(url: string, init: RequestInit): Promise<Response> {
    const fetchFn = await getHttpFetch();
    let res: Response;
    try {
      // In Tauri, mode:'cors' is irrelevant — Rust reqwest has no CORS enforcement
      const options = IS_TAURI ? { ...init } : { ...init, mode: 'cors' as RequestMode };
      res = await fetchFn(url, options);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') throw err;
      throw new OllamaError(
        `Cannot reach Ollama at ${this.baseUrl}. Is it running? (ollama serve)`,
        'UNREACHABLE',
        err instanceof Error ? err : undefined,
      );
    }

    if (!res.ok) {
      let detail = '';
      try {
        const body = await res.json();
        detail = body.error ?? '';
      } catch { /* ignore */ }
      throw new OllamaError(
        detail || `Ollama returned HTTP ${res.status}`,
        `HTTP_${res.status}`,
      );
    }

    return res;
  }
}

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

export class OllamaError extends Error {
  readonly code: string;
  readonly cause: Error | undefined;

  constructor(message: string, code: string, cause?: Error) {
    super(message);
    this.name = 'OllamaError';
    this.code = code;
    this.cause = cause;
  }
}
