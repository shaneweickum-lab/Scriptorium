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
  User,
  Play,
  Copy,
} from 'lucide-react';
import { useAuthorAI, type LoreProposal } from '../../features/ai-engine/hooks/useAuthorAI';
import { useLibraryStore } from '../../store/libraryStore';
import { useEditorStore, type SuggestionAction } from '../../store/editorStore';
import { useWorldStore } from '../../store/worldStore';
import { VectorIndexService } from '../../features/ai-engine/services/VectorIndexService';
import { OllamaService, OLLAMA_CHAT_MODELS } from '../../features/ai-engine/services/OllamaService';
import { WebLLMService, WEB_LLM_MODELS } from '../../features/ai-engine/services/WebLLMService';
import { AISetupModal } from './AISetupModal';
import type { VectorIndexStatus, UseVectorIndexReturn } from '../../features/ai-engine/hooks/useVectorIndex';
import type { OracleProfile } from '../../features/ai-engine/services/OracleMLService';
import { MarkdownText } from '../common/MarkdownText';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PanelTab = 'chat' | 'write' | 'lore';

interface MeyvnPanelProps {
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
  sections: { id: string; name: string }[];
  onApply: (sectionId?: string) => void;
  onSkip: () => void;
}

function ProposalCard({ proposal, applied, skipped, sections, onApply, onSkip }: ProposalCardProps) {
  const done = applied || skipped;
  const isCreate = proposal.changeType === 'create_entry';
  const defaultSection = sections.find(
    (s) => proposal.sectionTitle && s.name.toLowerCase() === proposal.sectionTitle.toLowerCase(),
  ) ?? sections[0];
  const [selectedSectionId, setSelectedSectionId] = useState(defaultSection?.id ?? '');

  const badgeClass = isCreate
    ? 'bg-teal-100 text-teal-700'
    : proposal.changeType === 'add_tag'
    ? 'bg-amber-100 text-amber-700'
    : 'bg-violet-100 text-violet-700';
  const badgeLabel = isCreate ? 'new entry' : proposal.changeType === 'add_tag' ? 'tag' : 'append';

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
          <span className={`shrink-0 text-[9px] font-medium px-1.5 py-0.5 rounded-full uppercase tracking-wide ${badgeClass}`}>
            {badgeLabel}
          </span>
        </div>
        {isCreate && sections.length > 0 && !done && (
          <div className="flex items-center gap-1.5 mb-2">
            <span className="text-[10px] text-slate-400 shrink-0">Section:</span>
            <select
              value={selectedSectionId}
              onChange={(e) => setSelectedSectionId(e.target.value)}
              className="flex-1 text-[10px] text-slate-600 bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 outline-none"
            >
              {sections.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
        )}
        <p className="text-slate-500 leading-relaxed mb-2">{proposal.description}</p>
        <p className="text-slate-700 bg-slate-50 rounded px-2 py-1.5 font-mono text-[10px] leading-relaxed border border-slate-100 line-clamp-4">
          {proposal.proposed}
        </p>
      </div>

      {!done && (
        <div className="flex border-t border-violet-100">
          <button
            onClick={() => onApply(isCreate ? selectedSectionId : undefined)}
            className="flex-1 flex items-center justify-center gap-1 py-1.5 text-teal-700 hover:bg-teal-50 transition-all rounded-bl-lg border-r border-violet-100 font-medium"
          >
            <Check size={11} /> {isCreate ? 'Add to World Bible' : 'Apply'}
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
          <span>{isCreate ? 'Added to World Bible' : 'Applied'}</span>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function MeyvnPanel({
  onClose,
  indexStatus,
  indexProgress,
  oracleProfile,
  isOracleAnalyzing,
  onRefreshOracle,
}: MeyvnPanelProps) {
  const activeBook = useLibraryStore((s) => s.activeBook);
  const liveContent = useEditorStore((s) => s.liveContent);
  const activeNodeTitle = useEditorStore((s) => s.activeNodeTitle);
  const setPendingSuggestion = useEditorStore((s) => s.setPendingSuggestion);

  const worldEntries = useWorldStore((s) => s.entries);
  const worldSections = useWorldStore((s) => s.sections);
  const linkedSections = useWorldStore((s) => s.linkedSections);
  const updateEntry = useWorldStore((s) => s.updateEntry);
  const addEntry = useWorldStore((s) => s.addEntry);

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
    clearHistory,
    undoLastTurn,
    suggest,
    cancel,
    reset,
    checkHealth,
    scanForLoreChanges,
    loreScanSummary,
    loreProposals,
    clearLoreProposals,
    isScanning,
    provider,
    setProvider,
    isWebGPUSupported,
    webllmModel,
    setWebllmModel,
    webllmStatus,
    webllmProgress,
    loadWebLLM,
  } = useAuthorAI({
    bookId: activeBook?.id,
    sceneText: liveContent,
    sceneTitle: activeNodeTitle,
    oracleProfile: oracleProfile ?? undefined,
  });

  const [tab, setTab] = useState<PanelTab>('chat');
  const [prompt, setPrompt] = useState(() => {
    try { return sessionStorage.getItem('meyvn_draft') ?? ''; } catch { return ''; }
  });
  const [showSources, setShowSources] = useState(false);
  const [showAISetup, setShowAISetup] = useState(false);
  // Long-form write: target word count + accumulated chunks from continuation
  const [wordTarget, setWordTarget] = useState(500);
  const [writtenChunks, setWrittenChunks] = useState<string[]>([]);
  const continuationDirectionRef = useRef<string>('');
  // Tracks the last text sent to editor so "Continue" can pick up from there
  const [lastInsertedText, setLastInsertedText] = useState<string | null>(null);
  // Local tracking of applied/skipped proposal IDs
  const [appliedIds, setAppliedIds] = useState<Set<string>>(new Set());
  const [skippedIds, setSkippedIds] = useState<Set<string>>(new Set());
  const responseRef = useRef<HTMLDivElement>(null);
  const [copiedMsgIdx, setCopiedMsgIdx] = useState<number | null>(null);

  // ── Human engagement tracking ─────────────────────────────────────────────
  // Counts cumulative AI-generated words inserted into the editor since the
  // last human writing contribution. Triggers a warm check-in at 1500 words.
  const aiInsertedWordsRef = useRef(0);
  const editorBaseWordsRef = useRef<number | null>(null);
  const [engagementQuestion, setEngagementQuestion] = useState<string | null>(null);
  const [isGeneratingQuestion, setIsGeneratingQuestion] = useState(false);
  const engagementAbortRef = useRef<AbortController | null>(null);

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

  // Detect when the author writes in the editor (not via AI insert) and reset
  // the engagement counter so they aren't interrupted while actively writing.
  useEffect(() => {
    const current = countWords(liveContent);
    if (editorBaseWordsRef.current === null) {
      editorBaseWordsRef.current = current;
      return;
    }
    const expected = editorBaseWordsRef.current + aiInsertedWordsRef.current;
    if (current > expected + 40) {
      aiInsertedWordsRef.current = 0;
      editorBaseWordsRef.current = current;
      engagementAbortRef.current?.abort();
      setEngagementQuestion(null);
      setIsGeneratingQuestion(false);
    }
  }, [liveContent]);

  // Cleanup engagement abort on unmount
  useEffect(() => () => { engagementAbortRef.current?.abort(); }, []);

  // Generate a personalised check-in question about the last AI passage.
  const generateEngagementQuestion = useCallback(async (passageExcerpt: string) => {
    engagementAbortRef.current?.abort();
    const ctrl = new AbortController();
    engagementAbortRef.current = ctrl;
    setIsGeneratingQuestion(true);
    setEngagementQuestion(null);

    const fallback =
      "I've been doing most of the writing! What's something YOU want to happen next — " +
      "a plot twist, something a character feels, or a small world detail?";

    const sysMsg =
      'You are Meyvn, a warm writing mentor. Generate ONE short question (max 45 words) ' +
      'to invite the author to contribute their own creative idea about this passage. ' +
      "Be specific to the content. Open with something warm like \"I'd love to know —\" or \"Quick question —\".";
    const userMsg = `Recent passage:\n\n${passageExcerpt.slice(-600)}\n\nGenerate one specific creative question.`;
    const msgs = [
      { role: 'system' as const, content: sysMsg },
      { role: 'user' as const, content: userMsg },
    ];

    let answer = '';
    const onToken = (t: string) => { answer += t; };
    const onDone = () => {
      if (!ctrl.signal.aborted) {
        setEngagementQuestion(answer.trim() || fallback);
        setIsGeneratingQuestion(false);
      }
    };

    try {
      if (provider === 'webgpu' && WebLLMService.status === 'ready') {
        await WebLLMService.chat({ messages: msgs, temperature: 0.7, maxTokens: 70, onToken, onDone, signal: ctrl.signal });
      } else {
        await new OllamaService().chat({ model, messages: msgs, temperature: 0.7, maxTokens: 70, onToken, onDone, signal: ctrl.signal });
      }
    } catch {
      if (!ctrl.signal.aborted) {
        setEngagementQuestion(fallback);
        setIsGeneratingQuestion(false);
      }
    }
  }, [provider, model]);

  // Auto-clear the warning once a successful stream completes
  useEffect(() => {
    if (status === 'generating' || status === 'done') setOllamaStatus('ok');
  }, [status]);

  // Mark that a WebGPU session was active so the reload banner shows after a crash
  useEffect(() => {
    if (webllmStatus === 'ready') {
      try { sessionStorage.setItem('meyvn_webgpu_session', '1'); } catch { /* ignore */ }
    }
  }, [webllmStatus]);

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

  // Undo the last AI response + user prompt, then re-run it for a fresh reply
  const handleRegenerate = useCallback(() => {
    if (isStreaming) return;
    reset();
    const lastPrompt = undoLastTurn();
    if (lastPrompt) {
      const maxTokens = tab === 'write' ? Math.ceil(wordTarget * 1.4) : undefined;
      suggest(lastPrompt, { maxTokens });
    }
  }, [isStreaming, reset, undoLastTurn, suggest, tab, wordTarget]);

  // ── Chat / Write submit ────────────────────────────────────────────────────
  const handleSubmit = () => {
    if (!prompt.trim() || isStreaming) return;
    const p = prompt.trim();
    setPrompt('');
    try { sessionStorage.removeItem('meyvn_draft'); } catch { /* ignore */ }

    if (tab === 'write') {
      const maxTokens = Math.ceil(wordTarget * 1.4);
      setWrittenChunks([]);
      setLastInsertedText(null);

      if (engagementQuestion) {
        // User answered Meyvn's check-in — weave their input into next generation
        const enrichedPrompt =
          `Continue the story naturally. The author has shared this creative input: "${p}"\n\n` +
          `Weave it organically into the prose — don't reference it directly, just let it shape what happens. ` +
          `Write approximately ${wordTarget} words.` +
          (continuationDirectionRef.current
            ? `\n\nOriginal story direction: ${continuationDirectionRef.current}`
            : '');
        setEngagementQuestion(null);
        aiInsertedWordsRef.current = 0;
        editorBaseWordsRef.current = countWords(liveContent);
        suggest(enrichedPrompt, { maxTokens });
      } else {
        continuationDirectionRef.current = p;
        suggest(toWritePrompt(p) + `\n\nWrite approximately ${wordTarget} words.`, { maxTokens });
      }
    } else {
      if (engagementQuestion) {
        setEngagementQuestion(null);
        aiInsertedWordsRef.current = 0;
      }
      suggest(p);
    }
  };

  const handleContinueWriting = () => {
    if (isStreaming) return;
    const allText = [...writtenChunks, streamedText].join('\n\n');
    const words = allText.trim().split(/\s+/).filter(Boolean);
    // Pass last 300 words as context so the model continues seamlessly
    const tail = words.slice(-300).join(' ');
    const remaining = Math.max(250, wordTarget - countWords(allText));
    setWrittenChunks([...writtenChunks, streamedText]);
    const maxTokens = Math.ceil(remaining * 1.4);
    suggest(
      `Continue this story seamlessly. Here is where it left off:\n\n"${tail}"\n\n` +
      `Write the next ${remaining} words, continuing directly from this point without repeating anything. ` +
      `Author's original direction: ${continuationDirectionRef.current}`,
      { maxTokens },
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleSendToEditor = (action: SuggestionAction) => {
    if (!streamedText) return;
    const fullText = writtenChunks.length > 0
      ? [...writtenChunks, streamedText].join('\n\n')
      : streamedText;
    if (action === 'insert_at_cursor') setLastInsertedText(fullText);
    setPendingSuggestion({ text: fullText, action });

    // Track AI words inserted — trigger a check-in once 1500 words accumulate
    // without the author writing anything themselves in the editor.
    aiInsertedWordsRef.current += countWords(fullText);
    if (aiInsertedWordsRef.current >= 1500 && !engagementQuestion && !isGeneratingQuestion) {
      generateEngagementQuestion(fullText);
    }

    setWrittenChunks([]);
    reset();
  };

  // Continue writing from wherever was last inserted into the editor
  const handleContinueFromInsert = () => {
    if (!lastInsertedText || isStreaming) return;
    const words = lastInsertedText.trim().split(/\s+/).filter(Boolean);
    const tail = words.slice(-300).join(' ');
    const maxTokens = Math.ceil(wordTarget * 1.4);
    setWrittenChunks([]);
    suggest(
      `Continue this story seamlessly. Here is where it left off:\n\n"${tail}"\n\n` +
      `Write the next ${wordTarget} words, continuing directly. Do not repeat what came before.\n` +
      (continuationDirectionRef.current
        ? `Author's direction: ${continuationDirectionRef.current}`
        : ''),
      { maxTokens },
    );
  };

  // ── Lore Watch ────────────────────────────────────────────────────────────
  const handleApplyProposal = useCallback(
    async (proposal: LoreProposal, targetSectionId?: string) => {
      if (proposal.changeType === 'create_entry') {
        const bookId = activeBook?.id;
        if (!bookId) return;
        // Find or use provided section
        const allSections = [...worldSections, ...linkedSections];
        let sectionId = targetSectionId;
        if (!sectionId && proposal.sectionTitle) {
          const match = allSections.find(
            (s) => s.name.toLowerCase() === proposal.sectionTitle!.toLowerCase(),
          );
          sectionId = match?.id ?? allSections[0]?.id;
        }
        if (!sectionId) return;
        // Create the entry then immediately populate its title + content
        const tiptapContent = JSON.stringify({
          type: 'doc',
          content: [{
            type: 'paragraph',
            content: [{ type: 'text', text: proposal.proposed }],
          }],
        });
        const newEntry = await addEntry(bookId, sectionId);
        await updateEntry(newEntry.id, { title: proposal.entryTitle, content: tiptapContent });
        setAppliedIds((prev) => new Set([...prev, proposal.id]));
        return;
      }

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
    [activeBook?.id, worldEntries, worldSections, linkedSections, updateEntry, addEntry],
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
  const totalWrittenWords = countWords([...writtenChunks, streamedText].join(' '));
  const showContinueAction = showWriteActions && writtenChunks.length > 0 && totalWrittenWords < wordTarget * 0.92;
  const showContinuePrompt = showWriteActions && writtenChunks.length === 0 && countWords(streamedText) < wordTarget * 0.75;
  // Show "Continue from last insert" when idle and something was just sent to the editor
  const showContinueFromInsert = tab === 'write' && !isStreaming && !streamedText && lastInsertedText !== null;

  // Build visible conversation: past turns + live streaming response
  const allMessages = [
    ...history,
    ...(streamedText ? [{ role: 'assistant' as const, content: streamedText, live: true }] : []),
  ];

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
          <span className="font-semibold text-sm text-slate-800">Meyvn</span>
          <input
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="flex-1 min-w-0 text-xs text-slate-400 bg-transparent outline-none border-b border-transparent hover:border-slate-200 focus:border-violet-300 focus:text-slate-600 transition-all px-0.5"
            title="MeyvnAi model"
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
              Lore index unavailable — Meyvn will answer from context only
            </span>
          </div>
        )}

        {/* ── Provider + model selector ─────────────────────────────────── */}
        <div className="px-3 py-2 border-b border-slate-100 shrink-0 space-y-1.5">
          {/* Provider toggle */}
          <div className="flex bg-slate-100 rounded-lg p-0.5 gap-0.5">
            <button onClick={() => setProvider('ollama')}
              className={`flex-1 py-1 text-[11px] font-semibold rounded-md transition-all ${
                provider === 'ollama' ? 'bg-white text-violet-700 shadow-sm' : 'text-slate-400 hover:text-slate-600'
              }`}>
              Ollama
            </button>
            <button onClick={() => setProvider('webgpu')} disabled={!isWebGPUSupported}
              title={!isWebGPUSupported ? 'WebGPU not supported in this browser' : undefined}
              className={`flex-1 py-1 text-[11px] font-semibold rounded-md transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                provider === 'webgpu' ? 'bg-white text-teal-700 shadow-sm' : 'text-slate-400 hover:text-slate-600'
              }`}>
              WebGPU
            </button>
          </div>

          {/* Ollama model picker */}
          {provider === 'ollama' && (
            <div className="flex items-center gap-1.5">
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="flex-1 text-[11px] text-slate-600 bg-white border border-slate-200 rounded-lg px-2 py-1.5 outline-none focus:border-violet-300 transition-all"
              >
                {OLLAMA_CHAT_MODELS.map((m) => (
                  <option key={m.tag} value={m.tag}>{m.label} · {m.vram}</option>
                ))}
              </select>
              <button onClick={() => setShowAISetup(true)} title="Setup guide"
                className="flex items-center justify-center w-7 h-7 rounded-lg text-slate-400 hover:text-violet-600 hover:bg-violet-50 transition-all shrink-0">
                <ChevronRight size={13} />
              </button>
            </div>
          )}

          {/* WebGPU model picker */}
          {provider === 'webgpu' && (
            <div className="flex items-center gap-1.5">
              <select
                value={webllmModel}
                onChange={(e) => { setWebllmModel(e.target.value); }}
                className="flex-1 text-[11px] text-slate-600 bg-white border border-slate-200 rounded-lg px-2 py-1.5 outline-none focus:border-teal-300 transition-all"
              >
                {WEB_LLM_MODELS.map((m) => (
                  <option key={m.id} value={m.id}>{m.label} · {m.vram}</option>
                ))}
              </select>
              <button onClick={() => setShowAISetup(true)} title="Setup guide"
                className="flex items-center justify-center w-7 h-7 rounded-lg text-slate-400 hover:text-teal-600 hover:bg-teal-50 transition-all shrink-0">
                <ChevronRight size={13} />
              </button>
            </div>
          )}
        </div>

        {/* ── WebGPU load / status ──────────────────────────────────────── */}
        {provider === 'webgpu' && webllmStatus === 'idle' && (() => {
          let hadSession = false;
          try { hadSession = !!sessionStorage.getItem('meyvn_webgpu_session'); } catch { /* ignore */ }
          const modelLabel = WEB_LLM_MODELS.find((m) => m.id === webllmModel)?.label ?? 'WebGPU model';
          return (
            <div className={`mx-3 mb-1 rounded-lg border p-3 text-xs shrink-0 space-y-2 ${hadSession ? 'border-amber-200 bg-amber-50' : 'border-teal-200 bg-teal-50'}`}>
              {hadSession ? (
                <p className="text-amber-700 font-medium flex items-center gap-1.5">
                  <AlertCircle size={12} className="shrink-0" />
                  Browser restarted AI session — reload {modelLabel}
                </p>
              ) : (
                <>
                  <p className="text-teal-700 font-medium">{modelLabel} · in-browser</p>
                  <p className="text-[10px] text-teal-600 leading-relaxed">
                    Runs entirely in your browser — no server required. Weights are cached after first load.
                  </p>
                </>
              )}
              <button onClick={loadWebLLM}
                className={`flex items-center gap-1.5 w-full justify-center py-1.5 rounded-md border transition-all font-medium ${hadSession ? 'border-amber-300 text-amber-700 hover:bg-amber-100' : 'border-teal-300 text-teal-700 hover:bg-teal-100'}`}>
                {hadSession ? 'Reload model' : 'Load model'}
              </button>
            </div>
          );
        })()}

        {provider === 'webgpu' && webllmStatus === 'loading' && (
          <div className="mx-3 mb-1 rounded-lg border border-teal-200 bg-teal-50 p-3 text-xs shrink-0 space-y-2">
            <div className="flex items-center gap-1.5 text-teal-700 font-medium">
              <Loader2 size={12} className="animate-spin shrink-0" />
              Loading {WEB_LLM_MODELS.find((m) => m.id === webllmModel)?.label ?? 'model'}…
            </div>
            {webllmProgress && (
              <>
                <div className="w-full h-1.5 bg-teal-100 rounded-full overflow-hidden">
                  <div className="h-full bg-teal-400 rounded-full transition-all duration-300"
                    style={{ width: `${Math.round(webllmProgress.progress * 100)}%` }} />
                </div>
                <p className="text-[10px] text-teal-600 truncate">{webllmProgress.text}</p>
              </>
            )}
          </div>
        )}

        {provider === 'webgpu' && webllmStatus === 'ready' && (
          <div className="flex items-center gap-1.5 px-3 py-1 shrink-0">
            <div className="w-1.5 h-1.5 rounded-full bg-teal-400 shrink-0" />
            <span className="text-[10px] text-slate-400">
              {WEB_LLM_MODELS.find((m) => m.id === webllmModel)?.label ?? 'WebGPU'} ready
            </span>
          </div>
        )}

        {provider === 'webgpu' && webllmStatus === 'error' && (
          <div className="mx-3 mb-1 rounded-lg border border-red-200 bg-red-50 p-3 text-xs shrink-0 space-y-2">
            <p className="text-red-700 font-medium">Failed to load WebLLM engine</p>
            <div className="flex gap-2">
              <button onClick={loadWebLLM}
                className="flex-1 flex items-center gap-1.5 justify-center py-1.5 rounded-md border border-red-300 text-red-700 hover:bg-red-100 transition-all font-medium">
                <RefreshCw size={11} /> Retry
              </button>
              <button onClick={() => setShowAISetup(true)}
                className="flex-1 flex items-center gap-1.5 justify-center py-1.5 rounded-md border border-red-200 text-red-600 hover:bg-red-50 transition-all font-medium">
                Setup guide
              </button>
            </div>
          </div>
        )}

        {/* MeyvnAi connection banner — Ollama only */}
        {provider === 'ollama' && ollamaStatus === 'unreachable' && (
          <div className="mx-3 mb-1 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs shrink-0 space-y-2">
            <div className="flex items-center gap-1.5 text-amber-700 font-medium">
              <WifiOff size={12} className="shrink-0" />
              Ollama not detected on localhost:11434
            </div>
            <p className="text-[10px] text-amber-600 leading-relaxed">
              Start Ollama with browser access:
            </p>
            <code className="block text-[10px] bg-amber-100 text-amber-800 rounded px-2 py-1 font-mono leading-relaxed">
              OLLAMA_ORIGINS="*" ollama serve
            </code>
            <div className="flex gap-2">
              <button onClick={probeHealth}
                className="flex-1 flex items-center gap-1.5 justify-center py-1.5 rounded-md border border-amber-300 text-amber-700 hover:bg-amber-100 transition-all font-medium">
                <RefreshCw size={11} /> Retry
              </button>
              <button onClick={() => setShowAISetup(true)}
                className="flex-1 flex items-center gap-1.5 justify-center py-1.5 rounded-md border border-amber-200 text-amber-600 hover:bg-amber-50 transition-all font-medium">
                Setup guide
              </button>
            </div>
          </div>
        )}

        {provider === 'ollama' && ollamaStatus === 'checking' && (
          <div className="flex items-center gap-1.5 px-3 py-1 text-[10px] text-slate-400 shrink-0">
            <Loader2 size={10} className="animate-spin shrink-0" />
            Connecting to Ollama · localhost:11434…
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
              {/* Meyvn's plain-English summary */}
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
                      sections={[...worldSections, ...linkedSections]}
                      onApply={(sectionId) => handleApplyProposal(p, sectionId)}
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
                    Meyvn will read your scene and suggest which World Bible entries need updating.
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

            {/* Response area — conversation history + live stream */}
            <div
              ref={responseRef}
              className="flex-1 overflow-y-auto px-3 py-2 space-y-3 text-sm text-slate-700"
            >
              {allMessages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center gap-3 py-8">
                  <Sparkles size={28} className="text-slate-200" />
                  {tab === 'write' ? (
                    <>
                      <p className="text-xs text-slate-400 max-w-[200px]">
                        Tell Meyvn what to write and she'll weave prose you can insert directly into your scene.
                      </p>
                      {showContinueFromInsert && (
                        <button onClick={handleContinueFromInsert}
                          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold text-white"
                          style={{ background: 'linear-gradient(135deg, #7c3aed, #0d9488)' }}>
                          <Play size={11} /> Continue writing
                        </button>
                      )}
                    </>
                  ) : (
                    <p className="text-xs text-slate-400 max-w-[200px]">
                      {liveContent
                        ? "Meyvn is watching your scene. Ask her anything and she'll weave from what you've written."
                        : 'Ask Meyvn anything about your story. She will ground her suggestions in your World Bible lore.'}
                    </p>
                  )}
                </div>
              ) : (
                <>
                  {/* New thread / clear button at top of history */}
                  {history.length > 0 && (
                    <div className="flex justify-end pt-1">
                      <button
                        onClick={() => { clearHistory(); reset(); setLastInsertedText(null); }}
                        className="text-[10px] text-slate-400 hover:text-slate-600 px-2 py-0.5 rounded hover:bg-slate-100 transition-all">
                        New thread
                      </button>
                    </div>
                  )}
                  {allMessages.map((msg, i) => (
                    <div key={i} className={`flex gap-2 items-start ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      {msg.role === 'assistant' && (
                        <div className="w-5 h-5 rounded-full shrink-0 mt-0.5 flex items-center justify-center"
                          style={{ background: 'linear-gradient(135deg, #7c3aed, #0d9488)' }}>
                          <Sparkles size={10} className="text-white" />
                        </div>
                      )}
                      {msg.role === 'assistant' ? (
                        <div className="flex flex-col items-start gap-0.5 max-w-[85%]">
                          <div className="bg-slate-100 text-slate-700 rounded-2xl rounded-tl-sm px-3 py-2 text-xs leading-relaxed">
                            <MarkdownText content={msg.content} />
                            {'live' in msg && msg.live && status === 'generating' && (
                              <span className="inline-block w-0.5 h-3.5 bg-slate-500 ml-0.5 animate-pulse align-text-bottom" />
                            )}
                          </div>
                          {/* Copy + Regenerate — only when this message is fully received */}
                          {!('live' in msg && msg.live) && (
                            <div className="flex items-center gap-0.5 pl-0.5">
                              <button
                                onClick={() => {
                                  navigator.clipboard.writeText(msg.content).catch(() => {});
                                  setCopiedMsgIdx(i);
                                  setTimeout(() => setCopiedMsgIdx((prev) => prev === i ? null : prev), 2000);
                                }}
                                className="p-1 rounded text-slate-300 hover:text-slate-500 hover:bg-slate-100 transition-colors"
                                title="Copy response"
                              >
                                {copiedMsgIdx === i
                                  ? <Check size={10} className="text-teal-500" />
                                  : <Copy size={10} />}
                              </button>
                              {i === allMessages.length - 1 && !isStreaming && (
                                <button
                                  onClick={handleRegenerate}
                                  className="p-1 rounded text-slate-300 hover:text-violet-500 hover:bg-violet-50 transition-colors"
                                  title="Reload — get a new response"
                                >
                                  <RefreshCw size={10} />
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="max-w-[85%] bg-violet-600 text-white rounded-2xl rounded-tr-sm px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap">
                          {msg.content}
                        </div>
                      )}
                      {msg.role === 'user' && (
                        <div className="w-5 h-5 rounded-full shrink-0 mt-0.5 bg-slate-200 flex items-center justify-center">
                          <User size={10} className="text-slate-500" />
                        </div>
                      )}
                    </div>
                  ))}
                  {/* Continue from insert — shown below the conversation */}
                  {showContinueFromInsert && (
                    <div className="flex justify-center pt-1">
                      <button onClick={handleContinueFromInsert}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold text-white"
                        style={{ background: 'linear-gradient(135deg, #7c3aed, #0d9488)' }}>
                        <Play size={11} /> Continue writing
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Write mode: Send to Editor action row */}
            {showWriteActions && (
              <div className="border-t border-violet-100 bg-violet-50 px-3 py-2 shrink-0 space-y-1.5">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] text-violet-500 font-medium">
                    {totalWrittenWords} / {wordTarget} words
                    {writtenChunks.length > 0 && ` · ${writtenChunks.length + 1} parts`}
                  </p>
                  {(showContinuePrompt || showContinueAction) && (
                    <button
                      onClick={handleContinueWriting}
                      className="text-[10px] font-semibold text-teal-600 hover:text-teal-700 flex items-center gap-0.5"
                    >
                      Continue →
                    </button>
                  )}
                </div>
                <p className="text-[10px] text-violet-400">Send to editor:</p>
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
                    onClick={() => { reset(); setWrittenChunks([]); }}
                    className="px-2.5 py-1.5 text-xs rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all"
                    title="Discard Meyvn's suggestion"
                  >
                    ✕
                  </button>
                </div>
              </div>
            )}

            {/* Continue-from-insert bar — shows after "At cursor" when conversation area is visible */}
            {showContinueFromInsert && allMessages.length > 0 && (
              <div className="border-t border-teal-100 bg-teal-50 px-3 py-2 shrink-0">
                <div className="flex items-center gap-2">
                  <p className="text-[10px] text-teal-600 flex-1">Ready to continue from last insert</p>
                  <button
                    onClick={handleContinueFromInsert}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-semibold text-white transition-all"
                    style={{ background: 'linear-gradient(135deg, #7c3aed, #0d9488)' }}>
                    <Play size={10} /> Continue
                  </button>
                  <button
                    onClick={() => setLastInsertedText(null)}
                    className="p-1 text-teal-400 hover:text-teal-600 transition-all" title="Dismiss">
                    <X size={11} />
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

            {/* Engagement question — Meyvn's check-in when too much AI writing */}
            {tab === 'write' && isGeneratingQuestion && (
              <div className="flex items-center gap-2 px-3 py-2 border-t border-violet-100 bg-violet-50 shrink-0">
                <Loader2 size={11} className="animate-spin text-violet-400 shrink-0" />
                <p className="text-[10px] text-violet-500">Meyvn has a question for you…</p>
              </div>
            )}
            {tab === 'write' && engagementQuestion && (
              <div className="border-t border-violet-200 bg-violet-50 px-3 py-3 shrink-0">
                <div className="flex items-start gap-2">
                  <div
                    className="w-5 h-5 rounded-full shrink-0 mt-0.5 flex items-center justify-center"
                    style={{ background: 'linear-gradient(135deg, #7c3aed, #0d9488)' }}
                  >
                    <Sparkles size={10} className="text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-semibold text-violet-600 mb-1">
                      Meyvn wants your voice in this story
                    </p>
                    <p className="text-xs text-slate-700 leading-relaxed">{engagementQuestion}</p>
                    <p className="text-[10px] text-violet-400 mt-1.5">
                      Your answer will be woven naturally into the next passage.
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setEngagementQuestion(null);
                      aiInsertedWordsRef.current = 0;
                    }}
                    className="text-slate-300 hover:text-slate-500 transition-colors shrink-0 mt-0.5"
                    title="Dismiss"
                  >
                    <X size={11} />
                  </button>
                </div>
              </div>
            )}

            {/* Input area */}
            <div className="border-t border-slate-200 p-3 space-y-2 shrink-0">
              {tab === 'write' && (
                <div className="flex items-center gap-2">
                  <label className="text-[10px] text-slate-400 shrink-0">Target length</label>
                  <select
                    value={wordTarget}
                    onChange={(e) => setWordTarget(Number(e.target.value))}
                    className="flex-1 text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-md px-2 py-1 outline-none focus:border-violet-300"
                  >
                    {[250, 500, 750, 1000, 1500, 2000, 3000].map((n) => (
                      <option key={n} value={n}>{n} words</option>
                    ))}
                  </select>
                </div>
              )}
              <textarea
                value={prompt}
                onChange={(e) => {
                  setPrompt(e.target.value);
                  try { sessionStorage.setItem('meyvn_draft', e.target.value); } catch { /* ignore */ }
                }}
                onKeyDown={handleKeyDown}
                disabled={isStreaming}
                placeholder={
                  tab === 'write' && engagementQuestion
                    ? 'Your answer \u2014 Meyvn will weave it in\u2026 (Enter to generate)'
                    : tab === 'write'
                    ? 'What should Meyvn write? (Enter to generate)'
                    : 'Ask Meyvn\u2026 (Enter to send, Shift+Enter for newline)'
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
                    {tab === 'write' && engagementQuestion ? 'Weave in' : tab === 'write' ? 'Write' : 'Generate'}
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

      {showAISetup && <AISetupModal onClose={() => setShowAISetup(false)} />}
    </>
  );
}
