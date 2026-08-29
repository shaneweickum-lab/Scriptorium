/**
 * LibraryMeyvnView — full-screen Meyvn chat panel for the Library page.
 *
 * Intentionally simpler than MeyvnPanel: no Lore Watch tab (no open scene),
 * no vector index (no active book), no scene awareness indicator.
 * Meyvn answers general writing questions using her bare-prompt persona.
 *
 * When the author uses Write mode, the generated prose is stored in
 * editorStore.pendingSuggestion so it appears as an approval banner the
 * moment they open a book — even if they close the Library first.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Sparkles, Loader2, AlertCircle, CornerDownRight,
  WifiOff, RefreshCw, SendHorizonal, X as XIcon, ChevronRight, Play,
} from 'lucide-react';
import { useAuthorAI } from '../../features/ai-engine/hooks/useAuthorAI';
import { useEditorStore, type SuggestionAction } from '../../store/editorStore';
import { OLLAMA_CHAT_MODELS } from '../../features/ai-engine/services/OllamaService';
import { WEB_LLM_MODELS } from '../../features/ai-engine/services/WebLLMService';
import { AISetupModal } from '../ai/AISetupModal';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type LibraryMeyvnTab = 'chat' | 'write';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function countWords(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function toWritePrompt(direction: string): string {
  return (
    'Write only prose — no preamble, no explanation, no meta-commentary. ' +
    'Produce the text directly, as it would appear in the finished novel. ' +
    "Author's direction:\n\n" +
    direction
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** A single message bubble in the conversation thread. */
function MessageBubble({
  role,
  content,
  streaming = false,
}: {
  role: 'user' | 'assistant';
  content: string;
  streaming?: boolean;
}) {
  if (role === 'user') {
    return (
      <div className="flex justify-end">
        <div
          className="max-w-[75%] px-4 py-3 rounded-2xl rounded-tr-sm text-sm text-white leading-relaxed whitespace-pre-wrap"
          style={{ background: 'linear-gradient(135deg, #7c3aed, #0d9488)' }}
        >
          {content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3">
      {/* Meyvn avatar */}
      <div
        className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5 shadow-sm"
        style={{ background: 'linear-gradient(135deg, #7c3aed, #0d9488)' }}
      >
        <Sparkles size={13} className="text-white" />
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-semibold text-violet-600 mb-1.5 tracking-wide">Meyvn</p>
        <div className="bg-white border border-slate-100 rounded-2xl rounded-tl-sm px-4 py-3 text-sm text-slate-700 leading-relaxed whitespace-pre-wrap shadow-sm">
          {content}
          {streaming && (
            <span className="inline-block w-0.5 h-4 bg-violet-400 ml-0.5 animate-pulse align-text-bottom" />
          )}
        </div>
      </div>
    </div>
  );
}

/** Empty-state card with suggested prompts. */
function EmptyState({ tab, onPrompt }: { tab: LibraryMeyvnTab; onPrompt: (p: string) => void }) {
  const suggestions =
    tab === 'write'
      ? [
          'Write an opening paragraph for a forest ambush scene',
          'Write a tense dialogue between two characters who distrust each other',
          'Write a brief description of a ruined city at dusk',
          'Write an internal monologue for a character who just discovered a betrayal',
        ]
      : [
          'How do I structure a compelling first act?',
          'What makes a villain feel real and threatening?',
          'Help me brainstorm a plot twist for my third act',
          'How do I write grief without it feeling melodramatic?',
        ];

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
      <div
        className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5 shadow-lg shadow-violet-200"
        style={{ background: 'linear-gradient(135deg, #7c3aed, #0d9488)' }}
      >
        <Sparkles size={28} className="text-white" />
      </div>

      <h2 className="text-xl font-bold text-slate-800 mb-2">
        {tab === 'write' ? 'What shall I write for you?' : 'Ask Meyvn anything'}
      </h2>

      <p className="text-sm text-slate-400 max-w-sm mb-2 leading-relaxed">
        {tab === 'write'
          ? 'Describe what you need and Meyvn will produce finished prose you can drop straight into your scene.'
          : "Meyvn knows craft. Ask about plot, character, pacing, voice — she'll answer from the traditions of storytelling itself."}
      </p>
      <p className="text-xs text-slate-300 mb-8">
        Open a book to unlock lore-grounded suggestions and World Bible Sentinel
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-xl">
        {suggestions.map((s) => (
          <button
            key={s}
            onClick={() => onPrompt(s)}
            className="text-left px-4 py-3 rounded-xl border border-slate-100 bg-white text-xs text-slate-600
              hover:border-violet-200 hover:bg-violet-50 hover:text-violet-700 transition-all shadow-sm"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function LibraryMeyvnView() {
  const setPendingSuggestion = useEditorStore((s) => s.setPendingSuggestion);

  const {
    status,
    streamedText,
    error,
    isStreaming,
    model,
    setModel,
    history,
    suggest,
    cancel,
    reset,
    clearHistory,
    checkHealth,
    provider,
    setProvider,
    isWebGPUSupported,
    webllmModel,
    setWebllmModel,
    webllmStatus,
    webllmProgress,
    loadWebLLM,
  } = useAuthorAI(); // no bookId — bare prompt mode

  const [tab, setTab] = useState<LibraryMeyvnTab>('chat');
  const [prompt, setPrompt] = useState(() => {
    try { return sessionStorage.getItem('meyvn_draft') ?? ''; } catch { return ''; }
  });
  const [showAISetup, setShowAISetup] = useState(false);
  const [lastInsertedText, setLastInsertedText] = useState<string | null>(null);
  const [wordTarget, setWordTarget] = useState(500);
  const continuationDirectionRef = useRef<string>('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // ── Ollama connection health ────────────────────────────────────────────────
  type OllamaStatus = 'checking' | 'ok' | 'unreachable';
  const [ollamaStatus, setOllamaStatus] = useState<OllamaStatus>('checking');

  const probeHealth = useCallback(async () => {
    setOllamaStatus('checking');
    const ok = await checkHealth();
    setOllamaStatus(ok ? 'ok' : 'unreachable');
  }, [checkHealth]);

  useEffect(() => { probeHealth(); }, [probeHealth]);
  useEffect(() => {
    if (status === 'generating' || status === 'done') setOllamaStatus('ok');
  }, [status]);

  // Mark that a WebGPU session was active so the reload banner shows after a crash
  useEffect(() => {
    if (webllmStatus === 'ready') {
      try { sessionStorage.setItem('meyvn_webgpu_session', '1'); } catch { /* ignore */ }
    }
  }, [webllmStatus]);

  // ── Auto-scroll ─────────────────────────────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history, streamedText]);

  // ── Textarea auto-resize ────────────────────────────────────────────────────
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [prompt]);

  // ── Submit ──────────────────────────────────────────────────────────────────
  const handleSubmit = useCallback(() => {
    if (!prompt.trim() || isStreaming) return;
    const p = prompt.trim();
    setPrompt('');
    try { sessionStorage.removeItem('meyvn_draft'); } catch { /* ignore */ }
    if (tab === 'write') {
      continuationDirectionRef.current = p;
      setLastInsertedText(null);
      const maxTokens = Math.ceil(wordTarget * 1.4);
      suggest(toWritePrompt(p) + `\n\nWrite approximately ${wordTarget} words.`, { maxTokens });
    } else {
      suggest(p);
    }
  }, [prompt, isStreaming, suggest, tab, wordTarget]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleSendToEditor = (action: SuggestionAction) => {
    if (!streamedText) return;
    if (action === 'insert_at_cursor') setLastInsertedText(streamedText);
    setPendingSuggestion({ text: streamedText, action });
    reset();
  };

  const handleContinueFromInsert = useCallback(() => {
    if (!lastInsertedText || isStreaming) return;
    const words = lastInsertedText.trim().split(/\s+/).filter(Boolean);
    const tail = words.slice(-300).join(' ');
    const maxTokens = Math.ceil(wordTarget * 1.4);
    suggest(
      `Continue this story seamlessly. Here is where it left off:\n\n"${tail}"\n\n` +
      `Write the next ${wordTarget} words, continuing directly. Do not repeat what came before.\n` +
      (continuationDirectionRef.current ? `Author's direction: ${continuationDirectionRef.current}` : ''),
      { maxTokens },
    );
  }, [lastInsertedText, isStreaming, suggest, wordTarget]);

  const handleSuggestedPrompt = (p: string) => {
    setPrompt(p);
    textareaRef.current?.focus();
  };

  const handleTabSwitch = (next: LibraryMeyvnTab) => {
    if (next !== tab) {
      reset();
      setTab(next);
    }
  };

  // ── Derived state ───────────────────────────────────────────────────────────
  const showWriteActions = tab === 'write' && streamedText && !isStreaming;
  const showEmptyState = history.length === 0 && !streamedText;
  const showContinueFromInsert = tab === 'write' && !isStreaming && !streamedText && lastInsertedText !== null;

  // Build the visible conversation: committed history + in-flight streaming message
  const allMessages = [
    ...history,
    ...(streamedText ? [{ role: 'assistant' as const, content: streamedText, streaming: true }] : []),
  ];

  return (
    <div className="h-full flex flex-col bg-white">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="shrink-0 px-6 py-4 border-b border-slate-100">
        <div className="max-w-3xl mx-auto flex items-center gap-3 flex-wrap">
          {/* Meyvn identity */}
          <div className="flex items-center gap-2 mr-1">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: 'linear-gradient(135deg, #7c3aed, #0d9488)' }}
            >
              <Sparkles size={13} className="text-white" />
            </div>
            <span className="font-bold text-slate-800 text-sm">Meyvn</span>
          </div>

          {/* Provider toggle */}
          <div className="flex bg-slate-100 rounded-lg p-0.5 gap-0.5">
            <button onClick={() => setProvider('ollama')}
              className={`px-3 py-1 text-[11px] font-semibold rounded-md transition-all ${
                provider === 'ollama' ? 'bg-white text-violet-700 shadow-sm' : 'text-slate-400 hover:text-slate-600'
              }`}>Ollama</button>
            <button onClick={() => setProvider('webgpu')} disabled={!isWebGPUSupported}
              title={!isWebGPUSupported ? 'WebGPU not supported' : undefined}
              className={`px-3 py-1 text-[11px] font-semibold rounded-md transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                provider === 'webgpu' ? 'bg-white text-teal-700 shadow-sm' : 'text-slate-400 hover:text-slate-600'
              }`}>WebGPU</button>
          </div>

          {/* Model picker */}
          {provider === 'ollama' && (
            <select value={model} onChange={(e) => setModel(e.target.value)}
              className="text-[11px] text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 outline-none focus:border-violet-300 transition-all">
              {OLLAMA_CHAT_MODELS.map((m) => (
                <option key={m.tag} value={m.tag}>{m.label}</option>
              ))}
            </select>
          )}
          {provider === 'webgpu' && (
            <select value={webllmModel} onChange={(e) => setWebllmModel(e.target.value)}
              className="text-[11px] text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 outline-none focus:border-teal-300 transition-all">
              {WEB_LLM_MODELS.map((m) => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>
          )}
          <button onClick={() => setShowAISetup(true)} title="Setup guide"
            className="flex items-center justify-center w-7 h-7 rounded-lg text-slate-400 hover:text-violet-600 hover:bg-violet-50 transition-all shrink-0">
            <ChevronRight size={13} />
          </button>

          {/* Tab toggle */}
          <div className="flex gap-0.5 bg-slate-100 rounded-lg p-0.5 ml-1">
            {(['chat', 'write'] as const).map((t) => (
              <button
                key={t}
                onClick={() => handleTabSwitch(t)}
                className={`px-4 py-1.5 rounded-md text-xs font-medium transition-all capitalize ${
                  tab === t
                    ? 'bg-white text-slate-700 shadow-sm'
                    : 'text-slate-400 hover:text-slate-500'
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Status indicators */}
          {provider === 'ollama' && ollamaStatus === 'checking' && (
            <div className="flex items-center gap-1 text-[10px] text-slate-400">
              <Loader2 size={10} className="animate-spin" />
              Checking…
            </div>
          )}
          {provider === 'ollama' && ollamaStatus === 'ok' && (
            <div className="flex items-center gap-1.5 text-[10px] text-teal-600">
              <div className="w-1.5 h-1.5 rounded-full bg-teal-400" />
              MeyvnAi connected
            </div>
          )}
          {provider === 'ollama' && ollamaStatus === 'unreachable' && (
            <div className="flex items-center gap-1 text-[10px] text-amber-600">
              <WifiOff size={10} />
              MeyvnAi unreachable
            </div>
          )}

          {/* Clear thread */}
          {history.length > 0 && (
            <button
              onClick={() => { clearHistory(); reset(); }}
              className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-600 hover:bg-slate-100
                px-2 py-1 rounded-lg transition-all"
            >
              <XIcon size={11} />
              New thread
            </button>
          )}
        </div>
      </div>

      {/* ── WebGPU load / status ──────────────────────────────────────── */}
      {provider === 'webgpu' && webllmStatus === 'idle' && (() => {
        let hadSession = false;
        try { hadSession = !!sessionStorage.getItem('meyvn_webgpu_session'); } catch { /* ignore */ }
        const modelLabel = WEB_LLM_MODELS.find((m) => m.id === webllmModel)?.label ?? 'WebGPU model';
        return (
          <div className="shrink-0 px-6 pb-2 border-b border-slate-100">
            <div className={`max-w-3xl mx-auto rounded-xl border p-3 space-y-2 ${hadSession ? 'border-amber-200 bg-amber-50' : 'border-teal-200 bg-teal-50'}`}>
              {hadSession ? (
                <p className="text-xs font-medium text-amber-700 flex items-center gap-1.5">
                  <AlertCircle size={12} className="shrink-0" />
                  Your browser restarted the AI session — tap below to reload {modelLabel}
                </p>
              ) : (
                <p className="text-xs font-medium text-teal-700">
                  {modelLabel} · in-browser, no server required
                </p>
              )}
              <button onClick={loadWebLLM}
                className={`w-full py-1.5 rounded-lg border text-xs font-semibold transition-all ${hadSession ? 'border-amber-300 text-amber-700 hover:bg-amber-100' : 'border-teal-300 text-teal-700 hover:bg-teal-100'}`}>
                {hadSession ? 'Reload model' : 'Load model (cached after first download)'}
              </button>
            </div>
          </div>
        );
      })()}
      {provider === 'webgpu' && webllmStatus === 'loading' && (
        <div className="shrink-0 px-6 pb-2 border-b border-slate-100">
          <div className="max-w-3xl mx-auto rounded-xl border border-teal-200 bg-teal-50 p-3 space-y-2">
            <div className="flex items-center gap-2 text-xs font-medium text-teal-700">
              <Loader2 size={12} className="animate-spin shrink-0" />
              Loading {WEB_LLM_MODELS.find((m) => m.id === webllmModel)?.label ?? 'model'}…
            </div>
            {webllmProgress && (
              <>
                <div className="w-full h-1.5 bg-teal-100 rounded-full overflow-hidden">
                  <div className="h-full bg-teal-400 rounded-full transition-all duration-300" style={{ width: `${Math.round(webllmProgress.progress * 100)}%` }} />
                </div>
                <p className="text-[10px] text-teal-600 truncate">{webllmProgress.text}</p>
              </>
            )}
          </div>
        </div>
      )}
      {provider === 'webgpu' && webllmStatus === 'error' && (
        <div className="shrink-0 px-6 pb-2 border-b border-slate-100">
          <div className="max-w-3xl mx-auto rounded-xl border border-red-200 bg-red-50 p-3 space-y-2">
            <p className="text-xs font-medium text-red-700">Failed to load WebLLM engine</p>
            <div className="flex gap-2">
              <button onClick={loadWebLLM} className="flex-1 py-1.5 rounded-lg border border-red-300 text-xs font-semibold text-red-700 hover:bg-red-100 transition-all flex items-center justify-center gap-1.5">
                <RefreshCw size={11} />Retry
              </button>
              <button onClick={() => setShowAISetup(true)} className="flex-1 py-1.5 rounded-lg border border-red-200 text-xs font-semibold text-red-600 hover:bg-red-50 transition-all">
                Setup guide
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Ollama connection warning ───────────────────────────────────── */}
      {provider === 'ollama' && ollamaStatus === 'unreachable' && (
        <div className="shrink-0 px-6 py-3 border-b border-amber-100 bg-amber-50">
          <div className="max-w-3xl mx-auto flex flex-col gap-2">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 space-y-1">
                <p className="text-xs font-semibold text-amber-700 flex items-center gap-1.5">
                  <AlertCircle size={12} />
                  Ollama not detected · localhost:11434
                </p>
                <pre className="text-[10px] text-amber-700 bg-amber-100 rounded-lg px-3 py-2 font-mono whitespace-pre">
{`OLLAMA_ORIGINS="*" ollama serve`}
                </pre>
              </div>
              <div className="flex flex-col gap-1.5 shrink-0">
                <button onClick={probeHealth}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber-300 text-xs text-amber-700 hover:bg-amber-100 transition-all font-medium">
                  <RefreshCw size={11} />Retry
                </button>
                <button onClick={() => setShowAISetup(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber-200 text-xs text-amber-600 hover:bg-amber-50 transition-all font-medium">
                  Setup guide
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Generating status bar ──────────────────────────────────────── */}
      {(status === 'retrieving' || status === 'generating') && (
        <div className="shrink-0 px-6 py-1.5 bg-violet-50 border-b border-violet-100">
          <div className="max-w-3xl mx-auto flex items-center gap-2">
            <Loader2 size={11} className="text-violet-500 animate-spin shrink-0" />
            <span className="text-xs text-violet-600">
              {status === 'retrieving' ? 'Reaching into the lore…' : tab === 'write' ? 'Weaving prose…' : 'Writing…'}
            </span>
          </div>
        </div>
      )}

      {/* ── Error bar ─────────────────────────────────────────────────── */}
      {status === 'error' && error && (
        <div className="shrink-0 px-6 py-2 bg-red-50 border-b border-red-100">
          <div className="max-w-3xl mx-auto flex items-start gap-2">
            <AlertCircle size={12} className="text-red-500 mt-0.5 shrink-0" />
            <span className="text-xs text-red-600">{error}</span>
          </div>
        </div>
      )}

      {/* ── Messages ──────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-6 py-8">
          {showEmptyState ? (
            <EmptyState tab={tab} onPrompt={handleSuggestedPrompt} />
          ) : (
            <div className="space-y-6">
              {allMessages.map((msg, i) => (
                <MessageBubble
                  key={i}
                  role={msg.role === 'user' ? 'user' : 'assistant'}
                  content={msg.content}
                  streaming={'streaming' in msg && (msg as { streaming?: boolean }).streaming === true}
                />
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>
      </div>

      {/* ── Write mode: send to editor action bar ──────────────────────── */}
      {showWriteActions && (
        <div className="shrink-0 border-t border-violet-100 bg-violet-50 px-6 py-3">
          <div className="max-w-3xl mx-auto flex items-center gap-3">
            <p className="text-xs text-violet-600 font-medium flex-1">
              {countWords(streamedText)} words woven — send to editor:
            </p>
            <button
              onClick={() => handleSendToEditor('insert_at_cursor')}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold text-white transition-all"
              style={{ background: 'linear-gradient(135deg, #7c3aed, #0d9488)' }}
              title="Will appear as an approval banner when you open a book"
            >
              <CornerDownRight size={11} />
              At cursor
            </button>
            <button
              onClick={() => handleSendToEditor('append')}
              className="px-4 py-1.5 rounded-lg border border-violet-300 text-xs font-semibold text-violet-700
                hover:bg-violet-100 transition-all"
            >
              Append
            </button>
            <button
              onClick={reset}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all"
              title="Discard"
            >
              <XIcon size={13} />
            </button>
          </div>
          <p className="max-w-3xl mx-auto text-[10px] text-violet-400 mt-1.5">
            An approval banner will appear when you open a book.
          </p>
        </div>
      )}

      {/* Continue-from-insert bar */}
      {showContinueFromInsert && (
        <div className="shrink-0 border-t border-teal-100 bg-teal-50 px-6 py-3">
          <div className="max-w-3xl mx-auto flex items-center gap-3">
            <p className="text-xs text-teal-700 font-medium flex-1">Ready to continue from last insert</p>
            <button onClick={handleContinueFromInsert}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold text-white"
              style={{ background: 'linear-gradient(135deg, #7c3aed, #0d9488)' }}>
              <Play size={11} /> Continue writing
            </button>
            <button onClick={() => setLastInsertedText(null)}
              className="p-1.5 rounded-lg text-teal-400 hover:text-teal-600 hover:bg-teal-100 transition-all" title="Dismiss">
              <XIcon size={13} />
            </button>
          </div>
        </div>
      )}

      {/* ── Input area ─────────────────────────────────────────────────── */}
      <div className="shrink-0 border-t border-slate-100 bg-white px-6 py-4">
        <div className="max-w-3xl mx-auto">
          {tab === 'write' && (
            <div className="flex items-center gap-2 mb-2">
              <label className="text-[10px] text-slate-400 shrink-0">Target length</label>
              <select
                value={wordTarget}
                onChange={(e) => setWordTarget(Number(e.target.value))}
                className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 outline-none focus:border-violet-300">
                {[250, 500, 750, 1000, 1500, 2000, 3000].map((n) => (
                  <option key={n} value={n}>{n} words</option>
                ))}
              </select>
            </div>
          )}
          <div className="flex items-end gap-3">
            <textarea
              ref={textareaRef}
              value={prompt}
              onChange={(e) => {
                setPrompt(e.target.value);
                try { sessionStorage.setItem('meyvn_draft', e.target.value); } catch { /* ignore */ }
              }}
              onKeyDown={handleKeyDown}
              disabled={isStreaming}
              placeholder={
                tab === 'write'
                  ? 'What should Meyvn write? (Enter to generate, Shift+Enter for newline)'
                  : 'Ask Meyvn anything… (Enter to send, Shift+Enter for newline)'
              }
              rows={1}
              style={{ resize: 'none', minHeight: '44px', maxHeight: '200px' }}
              className="flex-1 text-sm text-slate-700 placeholder-slate-400 bg-slate-50 border border-slate-200
                rounded-2xl px-4 py-3 outline-none focus:border-violet-300 focus:bg-white transition-all
                disabled:opacity-50 overflow-y-auto"
            />

            {isStreaming ? (
              <button
                onClick={cancel}
                className="flex items-center justify-center w-11 h-11 rounded-2xl border border-red-300
                  text-red-500 hover:bg-red-50 transition-all shrink-0"
                title="Cancel"
              >
                <XIcon size={16} />
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={!prompt.trim()}
                className="flex items-center justify-center w-11 h-11 rounded-2xl text-white
                  disabled:opacity-40 transition-all shrink-0 shadow-lg shadow-violet-200"
                style={{ background: 'linear-gradient(135deg, #7c3aed, #0d9488)' }}
                title={tab === 'write' ? 'Write' : 'Send'}
              >
                <SendHorizonal size={16} />
              </button>
            )}
          </div>

          <p className="text-[10px] text-slate-300 mt-2 text-center">
            Powered by MeyvnAi · Purpose-built for writers · No data leaves your device
          </p>
        </div>
      </div>

      {showAISetup && <AISetupModal onClose={() => setShowAISetup(false)} />}
    </div>
  );
}
