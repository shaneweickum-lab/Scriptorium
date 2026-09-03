/**
 * useCoachAI — thin hook powering the Writing Coach portal.
 *
 * Reads the active provider/model from localStorage (set by useAuthorAI)
 * so the coach always uses whatever model the user has already configured.
 * Routes to OllamaService or WebLLMService, streams tokens, and exposes
 * the same status/streamedText/suggest/cancel shape the portal UI needs.
 *
 * Also exposes analyzeAttempt() — a separate low-temperature inference call
 * that returns structured highlight annotations (TextHighlight[]) without
 * touching the main coaching stream.
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
import { CoachingService, type CoachSubcategory } from '../services/CoachingService';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CoachStatus = 'idle' | 'generating' | 'done' | 'error';
export type AIProvider = 'ollama' | 'webgpu';

export type HighlightType = 'spelling' | 'punctuation' | 'tense' | 'grammar' | 'structure';

export interface TextHighlight {
  span: string;
  type: HighlightType;
  label: string;
}

// ---------------------------------------------------------------------------
// Highlight JSON parser — lenient; handles markdown fences and partial JSON
// ---------------------------------------------------------------------------

function parseHighlights(raw: string): TextHighlight[] {
  // Strip markdown fences
  const stripped = raw.replace(/```[a-z]*\n?/gi, '').replace(/```/g, '').trim();
  // Find the outermost JSON array
  const match = stripped.match(/\[[\s\S]*\]/);
  if (!match) return [];
  try {
    const parsed = JSON.parse(match[0]);
    if (!Array.isArray(parsed)) return [];
    const validTypes: HighlightType[] = ['spelling', 'punctuation', 'tense', 'grammar', 'structure'];
    return parsed.filter(
      (item): item is TextHighlight =>
        item !== null &&
        typeof item === 'object' &&
        typeof item.span === 'string' &&
        item.span.length > 0 &&
        typeof item.type === 'string' &&
        validTypes.includes(item.type as HighlightType),
    ).map((item) => ({
      span: item.span as string,
      type: item.type as HighlightType,
      label: typeof item.label === 'string' ? item.label : item.type,
    }));
  } catch {
    return [];
  }
}

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

  // Text highlight analysis
  highlights: TextHighlight[];
  isAnalyzing: boolean;
  analyzeAttempt: (text: string, subcategory: CoachSubcategory) => Promise<void>;
  clearHighlights: () => void;

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
  const [highlights, setHighlights] = useState<TextHighlight[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
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
  const analysisAbortRef = useRef<AbortController | null>(null);
  const statusRef = useRef<CoachStatus>('idle');
  statusRef.current = status;

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

  const clearHighlights = useCallback(() => {
    analysisAbortRef.current?.abort();
    analysisAbortRef.current = null;
    setHighlights([]);
    setIsAnalyzing(false);
  }, []);

  // ── Main coaching stream ─────────────────────────────────────────────────────

  const suggest = useCallback(
    async (messages: OllamaMessage[], opts?: { temperature?: number }) => {
      // Cancel any in-flight analysis so the models don't conflict on WebGPU
      analysisAbortRef.current?.abort();
      analysisAbortRef.current = null;
      setIsAnalyzing(false);

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

  // ── Analysis stream (separate abort, goes to highlights not streamedText) ───

  const analyzeAttempt = useCallback(
    async (text: string, subcategory: CoachSubcategory) => {
      // Don't conflict with main coaching stream
      if (statusRef.current === 'generating') return;
      if (!text.trim() || text.trim().length < 15) {
        setHighlights([]);
        return;
      }

      analysisAbortRef.current?.abort();
      const controller = new AbortController();
      analysisAbortRef.current = controller;
      const { signal } = controller;

      setIsAnalyzing(true);

      const messages = CoachingService.buildAnalysisMessages({ userText: text, subcategory });

      try {
        if (providerRef.current === 'webgpu') {
          await WebLLMService.chat({
            messages,
            temperature: 0.1,
            signal,
            onToken: () => {},
            onDone: (text) => {
              if (signal.aborted) return;
              setHighlights(parseHighlights(text));
            },
          });
        } else {
          await ollamaRef.current.chat({
            model: ollamaModelRef.current,
            messages,
            temperature: 0.1,
            signal,
            onToken: () => {},
            onDone: (text) => {
              if (signal.aborted) return;
              setHighlights(parseHighlights(text));
            },
          });
        }
      } catch {
        // Analysis failures are silent — just clear highlights
        if (!signal.aborted) setHighlights([]);
      } finally {
        if (!signal.aborted) setIsAnalyzing(false);
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
    highlights,
    isAnalyzing,
    analyzeAttempt,
    clearHighlights,
    suggest,
    cancel,
    reset,
  };
}
