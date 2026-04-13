import { useState, useRef, useEffect, useCallback } from 'react';
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
  ScrollText,
  ScanSearch,
  Check,
  SkipForward,
  WifiOff,
  RefreshCw,
} from 'lucide-react';
import { useAuthorAI, type LoreProposal } from '../../features/ai-engine/hooks/useAuthorAI';
import { useLibraryStore } from '../../store/libraryStore';
import { useEditorStore, type SuggestionAction } from '../../store/editorStore';
import { useWorldStore } from '../../store/worldStore';
import { VectorIndexService } from '../../features/ai-engine/services/VectorIndexService';
import type { VectorIndexStatus, UseVectorIndexReturn } from '../../features/ai-engine/hooks/useVectorIndex';
import type { OracleProfile } from '../../features/ai-engine/services/OracleMLService';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PanelTab = 'chat' | 'write' | 'lore';

interface MavenPanelProps {
  onClose: () => void;
  indexStatus: VectorIndexStatus;
  indexProgress: UseVectorIndexReturn['indexProgress'];
  oracleProfile?: OracleProfile | null;
  isOracleAnalyzing?: boolean;
  onRefreshOracle?: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function countWords(text: string): number {
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

function appendParagraphToContent(contentJson: string, text: string): string {
  try {
    const doc: { type: string; content: unknown[] } = contentJson
      ? JSON.parse(contentJson)
      : { type: 'doc', content: [] };
    if (!Array.isArray(doc.content)) doc.content = [];
    doc.content.push({
      type: 'paragraph',
      content: [{ type: 'text', text }],
    });
    return JSON.stringify(doc);
  } catch {
    return contentJson;
  }
}

// ---------------------------------------------------------------------------
// Sub-component: Proposal card
// ---------------------------------------------------------------------------

interface ProposalCardProps {
  proposal: LoreProposal;
  applied: boolean;
  skipped: boolean;
  onApply: () => void;
  onSkip: () => void;
}

function ProposalCard({ proposal, applied, skipped, onApply, onSkip }: ProposalCardProps) {
  const done = applied || skipped;
  return (
    <div
      className={`rounded-lg border text-xs transition-all ${
        applied
          ? 'border-teal-200 bg-teal-50'
          : skipped
          ? 'border-slate-100 bg-slate-50 opacity-50'
          : 'border-violet-100 bg-white'
      }`}
    >
      <div className="px-3 pt-2.5 pb-2">
        <div className="flex items-start gap-1.5 mb-1.5">
          <BookOpen size={11} className="text-violet-400 mt-0.5 shrink-0" />
          <p className="font-semibold text-slate-700 leading-tight truncate flex-1">
            {proposal.entryTitle}
          </p>
          <span
            className={`shrink-0 text-[9px] font-medium px-1.5 py-0.5 rounded-full uppercase tracking-wide ${
              proposal.changeType === 'add_tag'
                ? 'bg-amber-100 text-amber-700'
                : 'bg-violet-100 text-violet-700'
            }`}
          >
            {proposal.changeType === 'add_tag' ? 'tag' : 'append'}
          </span>
        </div>
        <p className="text-slate-500 leading-relaxed mb-2">{proposal.description}</p>
        <p className="text-slate-700 bg-slate-50 rounded px-2 py-1.5 font-mono text-[10px] leading-relaxed border border-slate-100">
          {proposal.proposed}
        </p>
      </div>

      {!done && (
        <div className="flex border-t border-violet-100">
          <button
            onClick={onApply}
            className="flex-1 flex items-center justify-center gap-1 py-1.5 text-teal-700 hover:bg-teal-50 transition-all rounded-bl-lg border-r border-violet-100 font-medium"
          >
            <Check size={11} /> Apply
          </button>
          <button
            onClick={onSkip}
            className="flex-1 flex items-center justify-center gap-1 py-1.5 text-slate-400 hover:bg-slate-50 transition-all rounded-br-lg font-medium"
          >
            <SkipForward size={11} /> Skip
          </button>
        </div>
      )}

      {applied && (
        <div className="flex items-center gap-1.5 px-3 py-1.5 border-t border-teal-200 text-teal-600">
          <Check size={11} />
          <span>Applied</span>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function MavenPanel({
  onClose,
  indexStatus,
  indexProgress,
  oracleProfile,
  isOracleAnalyzing,
  onRefreshOracle,
}: MavenPanelProps) {
  const activeBook = useLibraryStore((s) => s.activeBook);
  const liveContent = useEditorStore((s) => s.liveContent);
  const activeNodeTitle = useEditorStore((s) => s.activeNodeTitle);
  const setPendingSuggestion = useEditorStore((s) => s.setPendingSuggestion);

  const worldEntries = useWorldStore((s) => s.entries);
  const worldSections = useWorldStore((s) => s.sections);
  const linkedSections = useWorldStore((s) => s.linkedSections);
  const updateEntry = useWorldStore((s) => s.updateEntry);

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
    checkHealth,
    connectionError,
    scanForLoreChanges,
    loreScanSummary,
    loreProposals,
    clearLoreProposals,
    isScanning,
  } = useAuthorAI({
    bookId: activeBook?.id,
    sceneText: liveContent,
    sceneTitle: activeNodeTitle,
    oracleProfile: oracleProfile ?? undefined,
  });

  const [tab, setTab] = useState<PanelTab>('chat');
  const [prompt, setPrompt] = useState('');
  const [showSources, setShowSources] = useState(false);
  // Local tracking of applied/skipped proposal IDs
  const [appliedIds, setAppliedIds] = useState<Set<string>>(new Set());
  const [skippedIds, setSkippedIds] = useState<Set<string>>(new Set());
  const responseRef = useRef<HTMLDivElement>(null);

  // ── Ollama connection health ──────────────────────────────────────────────
  type OllamaStatus = 'checking' | 'ok' | 'unreachable';
  const [ollamaStatus, setOllamaStatus] = useState<OllamaStatus>('checking');

  const probeHealth = useCallback(async () => {
    setOllamaStatus('checking');
    const ok = await checkHealth();
    setOllamaStatus(ok ? 'ok' : 'unreachable');
  }, [checkHealth]);

  // Probe once on mount
  useEffect(() => { probeHealth(); }, [probeHealth]);

  // Auto-clear the warning once a successful stream completes
  useEffect(() => {
    if (status === 'generating' || status === 'done') setOllamaStatus('ok');
  }, [status]);

  // Auto-scroll as tokens arrive
  useEffect(() => {
    if (responseRef.current) {
      responseRef.current.scrollTop = responseRef.current.scrollHeight;
    }
  }, [streamedText]);

  // Clear response when switching tabs
  const handleTabSwitch = (next: PanelTab) => {
    if (next !== tab) {
      reset();
      setTab(next);
    }
  };

  // ── Chat / Write submit ────────────────────────────────────────────────────
  const handleSubmit = () => {
    if (!prompt.trim() || isStreaming) return;
    const p = prompt.trim();
    setPrompt('');
    suggest(tab === 'write' ? toWritePrompt(p) : p);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleSendToEditor = (action: SuggestionAction) => {
    if (!streamedText) return;
    setPendingSuggestion({ text: streamedText, action });
    reset();
  };

  // ── Lore Watch ────────────────────────────────────────────────────────────
  const handleApplyProposal = useCallback(
    async (proposal: LoreProposal) => {
      const entry = worldEntries.find((e) => e.id === proposal.entryId);
      if (!entry) return;

      if (proposal.changeType === 'add_tag') {
        const tag = proposal.proposed.trim().toLowerCase();
        if (!entry.tags.includes(tag)) {
          await updateEntry(entry.id, { tags: [...entry.tags, tag] });
        }
      } else {
        // append_content
        const newContent = appendParagraphToContent(entry.content ?? '', proposal.proposed);
        await updateEntry(entry.id, { content: newContent });
      }

      setAppliedIds((prev) => new Set([...prev, proposal.id]));

      // Re-index if vector store is ready — best-effort, fail silently
      try {
        const indexService = VectorIndexService.getInstance();
        if (indexService.isInitialised) {
          const updated = { ...entry, ...(proposal.changeType === 'add_tag'
            ? { tags: [...entry.tags, proposal.proposed.trim().toLowerCase()] }
            : { content: appendParagraphToContent(entry.content ?? '', proposal.proposed) }
          )};
          const allSections = [...worldSections, ...linkedSections];
          await indexService.reindexEntry(updated, allSections);
        }
      } catch { /* silent */ }
    },
    [worldEntries, worldSections, linkedSections, updateEntry],
  );

  const handleSkipProposal = (id: string) => {
    setSkippedIds((prev) => new Set([...prev, id]));
  };

  const handleApplyAll = async () => {
    const pending = loreProposals.filter(
      (p) => !appliedIds.has(p.id) && !skippedIds.has(p.id),
    );
    for (const p of pending) {
      await handleApplyProposal(p);
    }
  };

  // ── Derived UI state ──────────────────────────────────────────────────────
  const statusMessage =
    status === 'retrieving'
      ? 'Searching World Bible\u2026'
      : status === 'generating'
      ? tab === 'write' ? 'Weaving prose\u2026' : 'Writing\u2026'
      : null;

  const showWriteActions = tab === 'write' && streamedText && !isStreaming;

  const pendingProposalCount = loreProposals.filter(
    (p) => !appliedIds.has(p.id) && !skippedIds.has(p.id),
  ).length;

  return (
    <>
      {/* Mobile backdrop */}
      <div className="fixed inset-0 bg-black/20 z-20 md:hidden" onClick={onClose} />

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

        {/* Tab toggle */}
        <div className="flex gap-0.5 bg-slate-100 rounded-lg mx-3 mt-2 mb-1 p-0.5 shrink-0">
          {([
            { key: 'chat', icon: MessageSquare, label: 'Chat' },
            { key: 'write', icon: PenLine, label: 'Write' },
            { key: 'lore', icon: ScrollText, label: 'Lore' },
          ] as const).map(({ key, icon: Icon, label }) => (
            <button
              key={key}
              onClick={() => handleTabSwitch(key)}
              className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-md text-xs font-medium transition-all ${
                tab === key
                  ? key === 'lore'
                    ? 'bg-white text-teal-700 shadow-sm'
                    : key === 'write'
                    ? 'bg-white text-violet-600 shadow-sm'
                    : 'bg-white text-slate-700 shadow-sm'
                  : 'text-slate-400 hover:text-slate-500'
              }`}
            >
              <Icon size={11} />
              {label}
            </button>
          ))}
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

        {/* Vector index status */}
        {indexStatus === 'loading-model' && (
          <div className="flex items-center gap-1.5 px-3 py-1 shrink-0">
            <Loader2 size={10} className="animate-spin text-violet-400 shrink-0" />
            <span className="text-[10px] text-slate-400">
              Loading embedding model
              {indexProgress && indexProgress.phase === 'model' && indexProgress.completed > 0
                ? ` — ${indexProgress.completed}%`
                : '…'}
            </span>
          </div>
        )}
        {indexStatus === 'indexing' && (
          <div className="flex items-center gap-1.5 px-3 py-1 shrink-0">
            <Loader2 size={10} className="animate-spin text-teal-400 shrink-0" />
            <span className="text-[10px] text-slate-400">
              Indexing lore
              {indexProgress && indexProgress.total > 0
                ? ` — ${indexProgress.completed} / ${indexProgress.total}`
                : '…'}
            </span>
          </div>
        )}
        {indexStatus === 'ready' && (
          <div className="flex items-center gap-1.5 px-3 py-1 shrink-0">
            <div className="w-1.5 h-1.5 rounded-full bg-teal-400 shrink-0" />
            <span className="text-[10px] text-slate-400">Lore index ready</span>
          </div>
        )}
        {indexStatus === 'error' && (
          <div className="flex items-center gap-1.5 px-3 py-1 shrink-0">
            <AlertCircle size={10} className="text-amber-400 shrink-0" />
            <span className="text-[10px] text-slate-400">
              Lore index unavailable — Maven will answer from context only
            </span>
          </div>
        )}

        {/* Ollama connection banner */}
        {ollamaStatus === 'unreachable' && (
          <div className="mx-3 mb-1 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs shrink-0 space-y-2">
            <div className="flex items-center gap-1.5 text-amber-700 font-medium">
              <WifiOff size={12} className="shrink-0" />
              Cannot reach Ollama at localhost:11434
            </div>

            {/* Actual error message from the failed fetch */}
            {connectionError && (
              <div className="rounded-md bg-red-50 border border-red-200 px-2 py-1.5">
                <p className="text-[10px] font-semibold text-red-700 mb-0.5">Browser error</p>
                <code className="text-[10px] text-red-600 break-all font-mono leading-relaxed">
                  {connectionError}
                </code>
              </div>
            )}

            <div className="space-y-1.5">
              <p className="text-amber-700 font-medium">1 · Make sure Ollama is running:</p>
              <code className="block bg-amber-100 text-amber-800 rounded px-2 py-1 font-mono text-[10px] select-all">
                ollama serve
              </code>
              <p className="text-amber-700 font-medium mt-1.5">2 · Allow this app's origin (required for browser access):</p>
              <p className="text-[10px] text-amber-500">
                Your app's origin: <span className="font-mono font-semibold text-amber-700">{window.location.origin}</span>
              </p>
              <code className="block bg-amber-100 text-amber-800 rounded px-2 py-1 font-mono text-[10px] select-all leading-relaxed">
                OLLAMA_ORIGINS={window.location.origin} ollama serve
              </code>
              <p className="text-[10px] text-amber-600 leading-relaxed mt-1">
                <strong>Important:</strong> stop any running Ollama instance first, then restart it with the
                env var set — setting it after the fact has no effect.
              </p>
              <p className="text-[10px] text-amber-500 leading-relaxed">
                For an installed PWA use <span className="font-mono">OLLAMA_ORIGINS='*'</span> instead.
              </p>
            </div>
            <button
              onClick={probeHealth}
              className="flex items-center gap-1.5 w-full justify-center py-1.5 rounded-md border border-amber-300 text-amber-700 hover:bg-amber-100 transition-all font-medium"
            >
              <RefreshCw size={11} />
              Retry connection
            </button>
          </div>
        )}

        {ollamaStatus === 'checking' && (
          <div className="flex items-center gap-1.5 px-3 py-1 text-[10px] text-slate-400 shrink-0">
            <Loader2 size={10} className="animate-spin shrink-0" />
            Checking Ollama connection…
          </div>
        )}

        {/* ── LORE WATCH TAB ─────────────────────────────────────────────── */}
        {tab === 'lore' && (
          <div className="flex flex-col flex-1 overflow-hidden">
            {/* Scan controls */}
            <div className="px-3 py-2 border-b border-slate-100 shrink-0">
              <button
                onClick={scanForLoreChanges}
                disabled={isScanning || !liveContent}
                className="w-full flex items-center justify-center gap-2 py-2 text-xs font-medium rounded-lg border transition-all disabled:opacity-40
                  border-teal-300 text-teal-700 hover:bg-teal-50 disabled:cursor-not-allowed"
              >
                {isScanning
                  ? <><Loader2 size={12} className="animate-spin" /> Scanning\u2026</>
                  : <><ScanSearch size={12} /> Scan scene for lore changes</>
                }
              </button>
              {!liveContent && (
                <p className="text-[10px] text-slate-400 text-center mt-1.5">
                  Open a scene to enable lore scanning
                </p>
              )}
            </div>

            {/* Results */}
            <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
              {/* Maven's plain-English summary */}
              {loreScanSummary && (
                <p className="text-xs text-slate-600 italic leading-relaxed border-l-2 border-violet-200 pl-2.5">
                  {loreScanSummary}
                </p>
              )}

              {/* Proposal cards */}
              {loreProposals.length > 0 ? (
                <>
                  {loreProposals.map((p) => (
                    <ProposalCard
                      key={p.id}
                      proposal={p}
                      applied={appliedIds.has(p.id)}
                      skipped={skippedIds.has(p.id)}
                      onApply={() => handleApplyProposal(p)}
                      onSkip={() => handleSkipProposal(p.id)}
                    />
                  ))}

                  {/* Apply all / Clear */}
                  {pendingProposalCount > 1 && (
                    <div className="flex gap-1.5 pt-1">
                      <button
                        onClick={handleApplyAll}
                        className="flex-1 py-1.5 text-xs font-medium rounded-lg border border-teal-300 text-teal-700 hover:bg-teal-50 transition-all"
                      >
                        Apply all ({pendingProposalCount})
                      </button>
                      <button
                        onClick={() => { clearLoreProposals(); setAppliedIds(new Set()); setSkippedIds(new Set()); }}
                        className="px-3 py-1.5 text-xs rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all"
                      >
                        Clear
                      </button>
                    </div>
                  )}
                </>
              ) : !isScanning && !loreScanSummary ? (
                <div className="flex flex-col items-center justify-center h-full text-center gap-3 py-8">
                  <ScrollText size={28} className="text-slate-200" />
                  <p className="text-xs text-slate-400 max-w-[200px]">
                    Maven will read your scene and suggest which World Bible entries need updating.
                  </p>
                </div>
              ) : null}
            </div>
          </div>
        )}

        {/* ── CHAT / WRITE TABS ──────────────────────────────────────────── */}
        {tab !== 'lore' && (
          <>
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
                  {tab === 'write' ? (
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
                    title="Insert at the current cursor position"
                  >
                    <CornerDownRight size={11} /> At cursor
                  </button>
                  <button
                    onClick={() => handleSendToEditor('append')}
                    className="flex-1 py-1.5 text-xs font-medium rounded-md border border-violet-300 text-violet-700 hover:bg-violet-100 transition-all"
                    title="Append to the end of the scene"
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

            {/* Oracle Intelligence indicator */}
            {oracleProfile && (
              <div className="border-t border-slate-100 shrink-0">
                <div className="flex items-center gap-2 px-3 py-1.5">
                  <Sparkles size={10} className="text-violet-400 shrink-0" />
                  <span className="text-[10px] text-slate-500 flex-1 truncate">
                    <span className={`font-semibold mr-1 ${
                      oracleProfile.oracleLevel === 'oracle' ? 'text-violet-600'
                      : oracleProfile.oracleLevel === 'master' ? 'text-violet-500'
                      : oracleProfile.oracleLevel === 'journeyman' ? 'text-teal-600'
                      : 'text-slate-400'
                    }`}>
                      {oracleProfile.oracleLevel.charAt(0).toUpperCase() + oracleProfile.oracleLevel.slice(1)}
                    </span>
                    Oracle · {oracleProfile.wordsAnalyzed.toLocaleString()} words learned
                  </span>
                  <button
                    onClick={onRefreshOracle}
                    disabled={isOracleAnalyzing}
                    title="Re-analyse writing corpus"
                    className="text-slate-300 hover:text-violet-400 disabled:opacity-40 transition-all shrink-0"
                  >
                    <RefreshCw size={10} className={isOracleAnalyzing ? 'animate-spin' : ''} />
                  </button>
                </div>
                {oracleProfile.pov !== 'unknown' && (
                  <div className="flex flex-wrap gap-1 px-3 pb-1.5">
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-violet-50 text-violet-500 font-medium">
                      {oracleProfile.pov}-person
                    </span>
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500">
                      {oracleProfile.pacingStyle}
                    </span>
                    {oracleProfile.themes.slice(0, 1).map((t) => (
                      <span key={t} className="text-[9px] px-1.5 py-0.5 rounded-full bg-teal-50 text-teal-600">
                        {t}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {!oracleProfile && !isOracleAnalyzing && (
              <div className="flex items-center gap-1.5 px-3 py-1 shrink-0">
                <Sparkles size={10} className="text-slate-300 shrink-0" />
                <span className="text-[10px] text-slate-400">
                  OracleML learns your voice as you write
                </span>
              </div>
            )}

            {isOracleAnalyzing && (
              <div className="flex items-center gap-1.5 px-3 py-1 shrink-0">
                <Loader2 size={10} className="animate-spin text-violet-300 shrink-0" />
                <span className="text-[10px] text-slate-400">OracleML studying your writing…</span>
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
                  tab === 'write'
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
                    {tab === 'write' ? 'Write' : 'Generate'}
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
          </>
        )}
      </aside>
    </>
  );
}
