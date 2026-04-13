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
 */

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
export const OLLAMA_DEFAULT_MODEL = 'llama3.2';

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
   * - 'cors'    — Ollama IS running but the browser's CORS policy blocked the request.
   *               Fix: restart Ollama with OLLAMA_ORIGINS set to the app's origin.
   * - 'network' — Ollama is not reachable (not running, wrong port, firewall, etc.)
   * - null      — no failure recorded yet
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
   * Two-phase check:
   *  1. CORS fetch  — succeeds when Ollama is running and CORS is configured.
   *  2. no-cors probe — if CORS fetch fails, a second fetch with mode:'no-cors'
   *     tells us whether the server is actually up (opaque response = it is up,
   *     throw = truly unreachable).  This lets us show the right fix in the UI.
   */
  async checkHealth(signal?: AbortSignal): Promise<boolean> {
    this.lastError = null;
    this.lastErrorKind = null;
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`, {
        method: 'GET',
        mode: 'cors',
        signal,
      });
      if (!res.ok) {
        this.lastError = `Ollama returned HTTP ${res.status}`;
        this.lastErrorKind = 'network';
      }
      return res.ok;
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') throw err;
      this.lastError = err instanceof Error ? err.message : String(err);
      // Phase 2: probe without CORS to distinguish "blocked" from "unreachable"
      const reachable = await OllamaService._probeReachable(this.baseUrl);
      this.lastErrorKind = reachable ? 'cors' : 'network';
      return false;
    }
  }

  /**
   * no-cors probe — resolves true if the server answered (even with an opaque
   * response), false if the request threw (server unreachable).
   * This ignores CORS headers entirely, so it works even when OLLAMA_ORIGINS
   * is not set.
   */
  private static async _probeReachable(baseUrl: string): Promise<boolean> {
    try {
      await fetch(`${baseUrl}/api/tags`, { method: 'GET', mode: 'no-cors' });
      return true; // Opaque response received — server is up
    } catch {
      return false;
    }
  }

  /**
   * Try each URL in OLLAMA_FALLBACK_URLS in order.
   * Returns:
   *  - `{ url, hasCorsIssue: false }` when a URL works with full CORS access.
   *  - `{ url: null, hasCorsIssue: true }` when Ollama is reachable but CORS
   *    blocks the request (so changing the URL won't help).
   *  - `{ url: null, hasCorsIssue: false }` when Ollama is not reachable at all.
   *
   * Used to automatically resolve localhost → 127.0.0.1 mismatches (e.g. when
   * the OS routes localhost to IPv6 but Ollama is only bound to IPv4).
   */
  static async findWorkingUrl(): Promise<{ url: string | null; hasCorsIssue: boolean }> {
    // Phase 1 — try each URL with full CORS access
    for (const url of OLLAMA_FALLBACK_URLS) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 3_000);
        const res = await fetch(`${url}/api/tags`, {
          method: 'GET',
          mode: 'cors',
          signal: controller.signal,
        });
        clearTimeout(timer);
        if (res.ok) return { url, hasCorsIssue: false };
      } catch {
        // Try the next candidate
      }
    }
    // Phase 2 — CORS failed everywhere; probe without CORS to check reachability
    for (const url of OLLAMA_FALLBACK_URLS) {
      try {
        await fetch(`${url}/api/tags`, { method: 'GET', mode: 'no-cors' });
        // Got an opaque response — server is up but CORS is the blocker
        return { url: null, hasCorsIssue: true };
      } catch {
        // Not reachable at this address
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
    } = opts;

    const body = JSON.stringify({
      model,
      messages,
      stream: true,
      options: { temperature },
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
    let res: Response;
    try {
      res = await fetch(url, { ...init, mode: 'cors' });
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
