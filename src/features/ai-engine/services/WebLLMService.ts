/**
 * WebLLMService — runs SmolLM2-1.7B in the browser via WebGPU using MLC/WebLLM.
 *
 * The engine is a module-level singleton so model weights are downloaded once
 * and reused across renders. Dynamic import() keeps WebLLM out of the main
 * bundle until the user explicitly activates the WebGPU provider.
 *
 * Usage:
 *   if (!WebLLMService.isWebGPUSupported()) { ... }
 *   const unsubscribe = WebLLMService.onProgress(p => setProgress(p));
 *   await WebLLMService.load();
 *   await WebLLMService.chat({ messages, onToken, onDone });
 */

import type { OllamaMessage } from './OllamaService';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type WebLLMStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface WebLLMProgress {
  /** 0–1 fraction complete (WebLLM reports this during weight download). */
  progress: number;
  /** Human-readable status line, e.g. "Loading model weights [3/10]". */
  text: string;
}

// ---------------------------------------------------------------------------
// Module-level singleton state — survives React re-renders
// ---------------------------------------------------------------------------

export const WEB_LLM_MODEL = 'SmolLM2-1.7B-Instruct-q4f16_1-MLC';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _engine: any = null;
let _status: WebLLMStatus = 'idle';
let _loadPromise: Promise<void> | null = null;
let _progressListeners: Array<(p: WebLLMProgress) => void> = [];
let _lastError: string | null = null;

function _notifyProgress(p: WebLLMProgress) {
  for (const fn of _progressListeners) fn(p);
}

// ---------------------------------------------------------------------------
// Service object
// ---------------------------------------------------------------------------

export const WebLLMService = {
  /** Current engine lifecycle status. */
  get status(): WebLLMStatus { return _status; },

  /** Last error message if status === 'error'. */
  get lastError(): string | null { return _lastError; },

  /** True when the browser exposes navigator.gpu (WebGPU API). */
  isWebGPUSupported(): boolean {
    return typeof navigator !== 'undefined' && 'gpu' in navigator;
  },

  /**
   * Subscribe to load-progress events. Returns an unsubscribe function.
   * Useful for driving a progress bar in the UI.
   */
  onProgress(fn: (p: WebLLMProgress) => void): () => void {
    _progressListeners = [..._progressListeners, fn];
    return () => {
      _progressListeners = _progressListeners.filter((f) => f !== fn);
    };
  },

  /**
   * Download and initialise the SmolLM2-1.7B engine.
   * Safe to call multiple times — subsequent calls return the same promise.
   * Model weights are cached in the browser's Cache API by WebLLM.
   */
  async load(): Promise<void> {
    if (_status === 'ready') return;
    if (_loadPromise) return _loadPromise;

    _status = 'loading';
    _lastError = null;
    _loadPromise = (async () => {
      try {
        const { CreateMLCEngine } = await import('@mlc-ai/web-llm');
        _engine = await CreateMLCEngine(WEB_LLM_MODEL, {
          initProgressCallback: (report: { progress: number; text: string }) => {
            _notifyProgress({ progress: report.progress, text: report.text });
          },
        });
        _status = 'ready';
        _notifyProgress({ progress: 1, text: 'SmolLM2-1.7B ready' });
      } catch (err) {
        _status = 'error';
        _lastError = err instanceof Error ? err.message : String(err);
        _loadPromise = null; // allow retry
        throw err;
      }
    })();
    return _loadPromise;
  },

  /**
   * Stream a chat completion through SmolLM2. Calls `onToken` for each
   * streamed piece and `onDone` once with the full accumulated response.
   * Respects `signal.aborted` to interrupt mid-stream.
   */
  async chat(opts: {
    messages: OllamaMessage[];
    temperature?: number;
    onToken: (token: string) => void;
    onDone: (full: string) => void;
    signal?: AbortSignal;
  }): Promise<void> {
    if (!_engine) throw new Error('WebLLM engine not loaded. Call load() first.');

    const stream = await _engine.chat.completions.create({
      messages: opts.messages as { role: 'system' | 'user' | 'assistant'; content: string }[],
      stream: true,
      temperature: opts.temperature ?? 0.7,
    });

    let full = '';
    for await (const chunk of stream) {
      if (opts.signal?.aborted) break;
      const token = (chunk.choices[0]?.delta?.content as string) ?? '';
      if (token) {
        full += token;
        opts.onToken(token);
      }
    }
    opts.onDone(full);
  },
};
