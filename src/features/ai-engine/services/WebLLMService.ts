/**
 * WebLLMService — runs small LLMs in the browser via WebGPU using MLC/WebLLM.
 *
 * Supports SmolLM2-1.7B, Qwen2.5-0.5B (mobile), and Qwen2.5-3B. The engine
 * is a module-level singleton so weights are downloaded once per model and
 * cached by the browser's Cache API. Dynamic import() keeps the WebLLM bundle
 * out of the main chunk until the user explicitly activates the WebGPU
 * provider.
 *
 * Switching models: call load(newModelId) — the engine resets and reloads.
 */

import type { OllamaMessage } from './OllamaService';

// ---------------------------------------------------------------------------
// Model catalogue
// ---------------------------------------------------------------------------

export interface WebLLMModelDef {
  id: string;
  label: string;
  vram: string;
  description: string;
}

export const WEB_LLM_MODELS: WebLLMModelDef[] = [
  {
    id: 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC',
    label: 'Qwen2.5 0.5B',
    vram: '~380 MB',
    description: 'Mobile-optimised — runs on phones and low-VRAM devices',
  },
  {
    id: 'SmolLM2-1.7B-Instruct-q4f16_1-MLC',
    label: 'SmolLM2 1.7B',
    vram: '~1.5 GB',
    description: 'Fast — works on most WebGPU-capable devices',
  },
  {
    id: 'Qwen2.5-3B-Instruct-q4f16_1-MLC',
    label: 'Qwen2.5 3B',
    vram: '~2.5 GB',
    description: 'Better quality — needs ≥4 GB VRAM',
  },
];

/** Default WebGPU model ID. */
export const WEB_LLM_DEFAULT_MODEL = WEB_LLM_MODELS[0].id;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type WebLLMStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface WebLLMProgress {
  /** 0–1 fraction complete. */
  progress: number;
  /** Human-readable status line. */
  text: string;
}

// ---------------------------------------------------------------------------
// Module-level singleton state
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _engine: any = null;
let _status: WebLLMStatus = 'idle';
let _loadPromise: Promise<void> | null = null;
let _loadedModelId: string | null = null;
let _progressListeners: Array<(p: WebLLMProgress) => void> = [];
let _lastError: string | null = null;

function _notifyProgress(p: WebLLMProgress) {
  for (const fn of _progressListeners) fn(p);
}

function _reset() {
  _engine = null;
  _status = 'idle';
  _loadPromise = null;
  _loadedModelId = null;
  _lastError = null;
}

// ---------------------------------------------------------------------------
// Service object
// ---------------------------------------------------------------------------

export const WebLLMService = {
  get status(): WebLLMStatus { return _status; },
  get lastError(): string | null { return _lastError; },
  get loadedModelId(): string | null { return _loadedModelId; },

  isWebGPUSupported(): boolean {
    return typeof navigator !== 'undefined' && 'gpu' in navigator;
  },

  onProgress(fn: (p: WebLLMProgress) => void): () => void {
    _progressListeners = [..._progressListeners, fn];
    return () => { _progressListeners = _progressListeners.filter((f) => f !== fn); };
  },

  /**
   * Load (or switch to) a model. If the same model is already loaded this is
   * a no-op. Switching to a different model resets the engine first.
   */
  async load(modelId: string = WEB_LLM_DEFAULT_MODEL): Promise<void> {
    if (_status === 'ready' && _loadedModelId === modelId) return;

    // Different model or prior error — reset before reloading
    if (_loadedModelId !== null && _loadedModelId !== modelId) _reset();
    if (_loadPromise) return _loadPromise;

    _status = 'loading';
    _lastError = null;
    _loadPromise = (async () => {
      try {
        const { CreateMLCEngine } = await import('@mlc-ai/web-llm');
        _engine = await CreateMLCEngine(modelId, {
          initProgressCallback: (report: { progress: number; text: string }) => {
            _notifyProgress({ progress: report.progress, text: report.text });
          },
        });
        _loadedModelId = modelId;
        _status = 'ready';
        const def = WEB_LLM_MODELS.find((m) => m.id === modelId);
        _notifyProgress({ progress: 1, text: `${def?.label ?? modelId} ready` });
      } catch (err) {
        _status = 'error';
        _lastError = err instanceof Error ? err.message : String(err);
        _loadPromise = null;
        throw err;
      }
    })();
    return _loadPromise;
  },

  async chat(opts: {
    messages: OllamaMessage[];
    temperature?: number;
    maxTokens?: number;
    onToken: (token: string) => void;
    onDone: (full: string) => void;
    signal?: AbortSignal;
  }): Promise<void> {
    if (!_engine) throw new Error('WebLLM engine not loaded. Call load() first.');

    const stream = await _engine.chat.completions.create({
      messages: opts.messages as { role: 'system' | 'user' | 'assistant'; content: string }[],
      stream: true,
      temperature: opts.temperature ?? 0.7,
      ...(opts.maxTokens !== undefined ? { max_tokens: opts.maxTokens } : {}),
    });

    let full = '';
    for await (const chunk of stream) {
      if (opts.signal?.aborted) break;
      const token = (chunk.choices[0]?.delta?.content as string) ?? '';
      if (token) { full += token; opts.onToken(token); }
    }
    opts.onDone(full);
  },
};
