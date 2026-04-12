import { useState, useRef, useEffect } from 'react';
import {
  Sparkles,
  X,
  Loader2,
  AlertCircle,
  ChevronRight,
  ChevronDown,
  BookOpen,
  Eye,
  PenLine,
  MessageSquare,
  CornerDownRight,
} from 'lucide-react';
import { useAuthorAI } from '../../features/ai-engine/hooks/useAuthorAI';
import { useLibraryStore } from '../../store/libraryStore';
import { useEditorStore, type SuggestionAction } from '../../store/editorStore';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PanelMode = 'chat' | 'write';

interface MavenPanelProps {
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** Wrap a user direction so Maven writes pure prose, no meta-commentary. */
function toWritePrompt(direction: string): string {
  return (
    'Write only prose — no preamble, no explanation, no meta-commentary. ' +
    'Produce the text directly, as it would appear in the finished novel. ' +
    "Author's direction:\n\n" +
    direction
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function MavenPanel({ onClose }: MavenPanelProps) {
  const activeBook = useLibraryStore((s) => s.activeBook);
  const liveContent = useEditorStore((s) => s.liveContent);
  const activeNodeTitle = useEditorStore((s) => s.activeNodeTitle);
  const setPendingSuggestion = useEditorStore((s) => s.setPendingSuggestion);

  const {
    status,
    streamedText,
    retrievedEntries,
    error,
    isStreaming,
    model,
    setModel,
    styleProfile,
    history,
    suggest,
    cancel,
    reset,
  } = useAuthorAI({
    bookId: activeBook?.id,
    sceneText: liveContent,
    sceneTitle: activeNodeTitle,
  });

  const [mode, setMode] = useState<PanelMode>('chat');
  const [prompt, setPrompt] = useState('');
  const [showSources, setShowSources] = useState(false);
  const responseRef = useRef<HTMLDivElement>(null);

  // Auto-scroll as tokens arrive
  useEffect(() => {
    if (responseRef.current) {
      responseRef.current.scrollTop = responseRef.current.scrollHeight;
    }
  }, [streamedText]);

  // Clear response when switching modes to avoid confusion
  const handleModeSwitch = (next: PanelMode) => {
    if (next !== mode) {
      reset();
      setMode(next);
    }
  };

  const handleSubmit = () => {
    if (!prompt.trim() || isStreaming) return;
    const p = prompt.trim();
    setPrompt('');
    suggest(mode === 'write' ? toWritePrompt(p) : p);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  /** Stage Maven's prose into the editor approval flow, then clear the panel. */
  const handleSendToEditor = (action: SuggestionAction) => {
    if (!streamedText) return;
    setPendingSuggestion({ text: streamedText, action });
    reset();
  };

  const statusMessage =
    status === 'retrieving'
      ? 'Searching World Bible\u2026'
      : status === 'generating'
      ? mode === 'write'
        ? 'Weaving prose\u2026'
        : 'Writing\u2026'
      : null;

  // Write mode: show action row when generation is done and there's output
  const showWriteActions = mode === 'write' && streamedText && !isStreaming;

  return (
    <>
      {/* Mobile backdrop */}
      <div
        className="fixed inset-0 bg-black/20 z-20 md:hidden"
        onClick={onClose}
      />

      {/* Panel */}
      <aside className="
        fixed inset-y-0 right-0 z-30 w-[min(100vw,320px)]
        md:relative md:inset-auto md:z-auto md:w-80
        flex flex-col bg-white border-l border-slate-200 shadow-xl md:shadow-none shrink-0
      ">
        {/* Header */}
        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-slate-200 shrink-0">
          <Sparkles size={16} className="text-violet-500 shrink-0" />
          <span className="font-semibold text-sm text-slate-800">Maven</span>
          <input
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="flex-1 min-w-0 text-xs text-slate-400 bg-transparent outline-none border-b border-transparent hover:border-slate-200 focus:border-violet-300 focus:text-slate-600 transition-all px-0.5"
            title="Ollama model tag"
          />
          <button
            onClick={onClose}
            className="flex items-center justify-center w-6 h-6 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all shrink-0"
          >
            <X size={14} />
          </button>
        </div>

        {/* Mode toggle */}
        <div className="flex gap-0.5 bg-slate-100 rounded-lg mx-3 mt-2 mb-1 p-0.5 shrink-0">
          <button
            onClick={() => handleModeSwitch('chat')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-medium transition-all ${
              mode === 'chat'
                ? 'bg-white text-slate-700 shadow-sm'
                : 'text-slate-400 hover:text-slate-500'
            }`}
          >
            <MessageSquare size={11} />
            Chat
          </button>
          <button
            onClick={() => handleModeSwitch('write')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-medium transition-all ${
              mode === 'write'
                ? 'bg-white text-violet-600 shadow-sm'
                : 'text-slate-400 hover:text-slate-500'
            }`}
          >
            <PenLine size={11} />
            Write
          </button>
        </div>

        {/* Scene awareness indicator */}
        {liveContent && activeNodeTitle && (
          <div className="flex items-center gap-1.5 px-3 py-1 shrink-0">
            <Eye size={10} className="text-slate-300 shrink-0" />
            <span className="text-[10px] text-slate-400 truncate">
              Reading:{' '}
              <span className="text-slate-500 font-medium">{activeNodeTitle}</span>
            </span>
          </div>
        )}

        {/* Status bar */}
        {statusMessage && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-violet-50 border-y border-violet-100 shrink-0">
            <Loader2 size={12} className="text-violet-500 animate-spin shrink-0" />
            <span className="text-xs text-violet-600">{statusMessage}</span>
          </div>
        )}

        {/* Error bar */}
        {status === 'error' && error && (
          <div className="flex items-start gap-2 px-3 py-2 bg-red-50 border-y border-red-100 shrink-0">
            <AlertCircle size={12} className="text-red-500 mt-0.5 shrink-0" />
            <span className="text-xs text-red-600">{error}</span>
          </div>
        )}

        {/* Response area */}
        <div
          ref={responseRef}
          className="flex-1 overflow-y-auto px-3 py-3 text-sm text-slate-700 leading-relaxed"
        >
          {streamedText ? (
            <div className="whitespace-pre-wrap">
              {streamedText}
              {status === 'generating' && (
                <span className="inline-block w-0.5 h-4 bg-violet-400 ml-0.5 animate-pulse align-text-bottom" />
              )}
            </div>
          ) : status === 'idle' && history.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center gap-3 py-8">
              <Sparkles size={28} className="text-slate-200" />
              {mode === 'write' ? (
                <p className="text-xs text-slate-400 max-w-[200px]">
                  Tell Maven what to write and she'll weave prose you can insert directly into your scene.
                </p>
              ) : (
                <p className="text-xs text-slate-400 max-w-[200px]">
                  {liveContent
                    ? "Maven is watching your scene. Ask her anything and she'll weave from what you've written."
                    : 'Ask Maven anything about your story. She will ground her suggestions in your World Bible lore.'}
                </p>
              )}
            </div>
          ) : null}
        </div>

        {/* Write mode: Send to Editor action row */}
        {showWriteActions && (
          <div className="border-t border-violet-100 bg-violet-50 px-3 py-2 shrink-0">
            <p className="text-[10px] text-violet-500 mb-1.5 font-medium">
              {countWords(streamedText)} words — send to editor:
            </p>
            <div className="flex gap-1.5">
              <button
                onClick={() => handleSendToEditor('insert_at_cursor')}
                className="flex-1 flex items-center justify-center gap-1 py-1.5 text-xs font-medium rounded-md text-white transition-all"
                style={{ background: 'linear-gradient(135deg, #7c3aed, #0d9488)' }}
                title="Insert Maven's text at the current cursor position"
              >
                <CornerDownRight size={11} />
                At cursor
              </button>
              <button
                onClick={() => handleSendToEditor('append')}
                className="flex-1 py-1.5 text-xs font-medium rounded-md border border-violet-300 text-violet-700 hover:bg-violet-100 transition-all"
                title="Append Maven's text to the end of the current scene"
              >
                Append
              </button>
              <button
                onClick={reset}
                className="px-2.5 py-1.5 text-xs rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all"
                title="Discard Maven's suggestion"
              >
                ✕
              </button>
            </div>
          </div>
        )}

        {/* Sources accordion */}
        {retrievedEntries.length > 0 && (
          <div className="border-t border-slate-100 shrink-0">
            <button
              onClick={() => setShowSources((s) => !s)}
              className="flex items-center gap-1.5 w-full px-3 py-2 text-xs text-slate-500 hover:bg-slate-50 transition-all"
            >
              {showSources ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              <BookOpen size={12} />
              <span>
                {retrievedEntries.length} lore source{retrievedEntries.length !== 1 ? 's' : ''} used
              </span>
            </button>
            {showSources && (
              <div className="px-3 pb-2 space-y-1.5">
                {retrievedEntries.map((e, i) => (
                  <div key={i} className="flex items-start gap-1.5">
                    <span className="text-[10px] text-slate-300 mt-0.5 shrink-0">{i + 1}.</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-slate-600 truncate">{e.title}</p>
                      {e.sectionName && (
                        <p className="text-[10px] text-slate-400 truncate">{e.sectionName}</p>
                      )}
                    </div>
                    <span className="text-[10px] text-slate-300 shrink-0">
                      {Math.round(e.score * 100)}%
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Style profile indicator */}
        {styleProfile && styleProfile.atmosphere.dominant !== 'neutral' && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-teal-50 border-t border-teal-100 shrink-0">
            <div className="w-1.5 h-1.5 rounded-full bg-teal-500 shrink-0" />
            <span className="text-[10px] text-teal-600 truncate">
              {styleProfile.atmosphere.dominant} · {styleProfile.sentences.category} sentences
            </span>
          </div>
        )}

        {/* Input area */}
        <div className="border-t border-slate-200 p-3 space-y-2 shrink-0">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isStreaming}
            placeholder={
              mode === 'write'
                ? 'What should Maven write? (Enter to generate)'
                : 'Ask Maven\u2026 (Enter to send, Shift+Enter for newline)'
            }
            rows={3}
            className="w-full text-sm text-slate-700 placeholder-slate-300 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-violet-300 focus:bg-white resize-none transition-all disabled:opacity-50"
          />
          <div className="flex items-center gap-1.5">
            {isStreaming ? (
              <button
                onClick={cancel}
                className="flex-1 py-1.5 text-xs font-medium rounded-lg border border-red-300 text-red-600 hover:bg-red-50 transition-all"
              >
                Cancel
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={!prompt.trim()}
                className="flex-1 py-1.5 text-xs font-medium rounded-lg text-white disabled:opacity-40 transition-all"
                style={{ background: 'linear-gradient(135deg, #7c3aed, #0d9488)' }}
              >
                {mode === 'write' ? 'Write' : 'Generate'}
              </button>
            )}
            <button
              onClick={reset}
              disabled={isStreaming}
              title="Clear output"
              className="px-3 py-1.5 text-xs rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 disabled:opacity-40 transition-all"
            >
              Clear
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
