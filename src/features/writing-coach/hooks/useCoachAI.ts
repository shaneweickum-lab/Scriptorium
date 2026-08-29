/**
 * useCoachAI — thin hook powering the Writing Coach portal.
 *
 * Reads the active provider/model from localStorage (set by useAuthorAI)
 * so the coach always uses whatever model the user has already configured.
 * Routes to OllamaService or WebLLMService, streams tokens, and exposes
 * the same status/streamedText/suggest/cancel shape the portal UI needs.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  OllamaService,
  OllamaError,
  OLLAMA_DEFAULT_MODEL,
  OLLAMA_DEFAULT_URL,
  type OllamaMessage,
} from '../../ai-engine/services/OllamaService';
import {
  WebLLMService,
  WEB_LLM_DEFAULT_MODEL,
  type WebLLMStatus,
  type WebLLMProgress,
} from '../../ai-engine/services/WebLLMService';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CoachStatus = 'idle' | 'generating' | 'done' | 'error';
export type AIProvider = 'ollama' | 'webgpu';

export interface UseCoachAIReturn {
  status: CoachStatus;
  streamedText: string;
  error: string | null;
  isStreaming: boolean;

  // Provider info (read-only — controlled by useAuthorAI / MeyvnPanel)
  provider: AIProvider;
  webllmStatus: WebLLMStatus;
  webllmProgress: WebLLMProgress | null;
  loadWebLLM: () => Promise<void>;
  isWebGPUSupported: boolean;

  suggest: (messages: OllamaMessage[], opts?: { temperature?: number }) => Promise<void>;
  cancel: () => void;
  reset: () => void;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useCoachAI(): UseCoachAIReturn {
  const [status, setStatus] = useState<CoachStatus>('idle');
  const [streamedText, setStreamedText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [webllmStatus, setWebllmStatus] = useState<WebLLMStatus>(() => WebLLMService.status);
  const [webllmProgress, setWebllmProgress] = useState<WebLLMProgress | null>(null);

  const [provider] = useState<AIProvider>(() => {
    try {
      const saved = localStorage.getItem('meyvn_provider');
      return (saved === 'ollama' || saved === 'webgpu') ? saved : 'ollama';
    } catch { return 'ollama'; }
  });

  const [ollamaModel] = useState<string>(() => {
    try { return localStorage.getItem('meyvn_ollama_model') ?? OLLAMA_DEFAULT_MODEL; }
    catch { return OLLAMA_DEFAULT_MODEL; }
  });

  const [webllmModel] = useState<string>(() => {
    try { return localStorage.getItem('meyvn_webllm_model') ?? WEB_LLM_DEFAULT_MODEL; }
    catch { return WEB_LLM_DEFAULT_MODEL; }
  });

  const abortRef = useRef<AbortController | null>(null);
  const providerRef = useRef<AIProvider>(provider);
  providerRef.current = provider;
  const ollamaModelRef = useRef<string>(ollamaModel);
  ollamaModelRef.current = ollamaModel;
  const webllmModelRef = useRef<string>(webllmModel);
  webllmModelRef.current = webllmModel;

  const ollamaRef = useRef<OllamaService>(new OllamaService(OLLAMA_DEFAULT_URL));

  // Sync WebLLM progress
  useEffect(() => {
    const unsub = WebLLMService.onProgress((p) => {
      setWebllmProgress(p);
      setWebllmStatus(WebLLMService.status);
    });
    setWebllmStatus(WebLLMService.status);
    return unsub;
  }, []);

  const loadWebLLM = useCallback(async () => {
    setWebllmStatus('loading');
    try {
      await WebLLMService.load(webllmModelRef.current);
      setWebllmStatus('ready');
    } catch {
      setWebllmStatus('error');
    }
  }, []);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStatus('idle');
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStreamedText('');
    setError(null);
    setStatus('idle');
  }, []);

  const suggest = useCallback(
    async (messages: OllamaMessage[], opts?: { temperature?: number }) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const { signal } = controller;

      setStreamedText('');
      setError(null);
      setStatus('generating');

      const temperature = opts?.temperature ?? 0.7;

      try {
        if (providerRef.current === 'webgpu') {
          await WebLLMService.chat({
            messages,
            temperature,
            signal,
            onToken: (t) => setStreamedText((prev) => prev + t),
            onDone: () => { if (!signal.aborted) setStatus('done'); },
          });
        } else {
          await ollamaRef.current.chat({
            model: ollamaModelRef.current,
            messages,
            temperature,
            signal,
            onToken: (t) => setStreamedText((prev) => prev + t),
            onDone: () => { if (!signal.aborted) setStatus('done'); },
          });
        }
      } catch (err) {
        if (signal.aborted) return;
        const message =
          err instanceof OllamaError ? err.message
          : err instanceof Error ? err.message
          : 'An unexpected error occurred';
        setError(message);
        setStatus('error');
      }
    },
    [],
  );

  return {
    status,
    streamedText,
    error,
    isStreaming: status === 'generating',
    provider,
    webllmStatus,
    webllmProgress,
    loadWebLLM,
    isWebGPUSupported: WebLLMService.isWebGPUSupported(),
    suggest,
    cancel,
    reset,
  };
}
