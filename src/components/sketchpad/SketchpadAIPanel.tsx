import { useState, useRef, useCallback, useEffect } from 'react';
import {
  X, Sparkles, RefreshCw, Loader2, Trash2, Star, ChevronRight, Tag, MessageSquare,
} from 'lucide-react';
import { SketchpadChatPanel } from './SketchpadChatPanel';
import { MarkdownText } from '../common/MarkdownText';
import { useSketchpadStore } from '../../store/sketchpadStore';
import { useSettingsStore, creativityToTemperature } from '../../store/settingsStore';
import { useWorldStore } from '../../store/worldStore';
import { OllamaService, OLLAMA_DEFAULT_MODEL } from '../../features/ai-engine/services/OllamaService';
import { WebLLMService } from '../../features/ai-engine/services/WebLLMService';
import { SketchpadAIService, type SketchpadAIMode } from '../../features/ai-engine/services/SketchpadAIService';
import type { SketchpadEntry, SketchpadStatus } from '../../types/sketchpad';
import { STATUS_LABELS, STATUS_COLORS, CATEGORY_COLORS } from '../../types/sketchpad';

const AI_MODES: { mode: SketchpadAIMode; emoji: string; desc: string }[] = [
  { mode: 'Expand',     emoji: '🌱', desc: 'Develop into paragraphs' },
  { mode: 'Brainstorm', emoji: '💡', desc: '5-7 related variations' },
  { mode: 'Connect',    emoji: '🔗', desc: 'Find thematic links' },
  { mode: 'Challenge',  emoji: '⚡', desc: 'Find weaknesses' },
  { mode: 'Boost',      emoji: '✨', desc: 'Make more vivid' },
  { mode: 'Compress',   emoji: '🎯', desc: 'Distill to essence' },
  { mode: 'Generate',   emoji: '📖', desc: 'Write a scene sketch' },
];

const STATUS_FLOW: SketchpadStatus[] = ['RAW', 'EXPLORING', 'KEEP', 'MAYBE', 'REVISE', 'REJECTED', 'CANON'];

interface Props {
  entry: SketchpadEntry;
  relatedIdeas: string[];
  onBack?: () => void;
}

export function SketchpadAIPanel({ entry, relatedIdeas, onBack }: Props) {
  const updateEntry = useSketchpadStore((s) => s.updateEntry);
  const deleteEntry = useSketchpadStore((s) => s.deleteEntry);
  const setSelectedId = useSketchpadStore((s) => s.setSelectedId);

  const sections = useWorldStore((s) => s.sections);
  const addSection = useWorldStore((s) => s.addSection);
  const addEntry = useWorldStore((s) => s.addEntry);
  const updateWorldEntry = useWorldStore((s) => s.updateEntry);
  const editingContextId = useWorldStore((s) => s.editingContextId);

  const aiCreativity = useSettingsStore((s) => s.settings.aiCreativity);
  const [tab, setTab] = useState<'develop' | 'chat'>('develop');
  const [activeMode, setActiveMode] = useState<SketchpadAIMode | null>(null);
  const [streamedText, setStreamedText] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showCanonPicker, setShowCanonPicker] = useState(false);
  const [tagInput, setTagInput] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  // Load saved analysis if available; reset develop state on entry switch
  useEffect(() => {
    setStreamedText(entry.aiAnalysis ?? '');
    setActiveMode(null);
    setIsAnalyzing(false);
    abortRef.current?.abort();
  }, [entry.id]);

  const runMode = useCallback(async (mode: SketchpadAIMode) => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setActiveMode(mode);
    setIsAnalyzing(true);
    setStreamedText('');

    const messages = SketchpadAIService.buildMessages(mode, entry.content, entry.category, relatedIdeas);
    const provider = localStorage.getItem('meyvn_provider') ?? 'ollama';

    try {
      let fullText = '';
      const onToken = (t: string) => {
        fullText += t;
        setStreamedText(fullText);
      };
      const onDone = () => {
        setIsAnalyzing(false);
        updateEntry(entry.id, { aiAnalysis: fullText });
      };

      if (provider === 'webgpu') {
        if (!WebLLMService.isWebGPUSupported() || WebLLMService.status !== 'ready') {
          throw new Error('WebGPU model not ready. Load a model in the Meyvn panel first.');
        }
        await WebLLMService.chat({ messages, temperature: creativityToTemperature(aiCreativity), onToken, onDone, signal: ctrl.signal });
      } else {
        const modelId = localStorage.getItem('meyvn_ollama_model') ?? OLLAMA_DEFAULT_MODEL;
        const svc = new OllamaService();
        await svc.chat({ model: modelId, messages, temperature: creativityToTemperature(aiCreativity), onToken, onDone, signal: ctrl.signal });
      }
    } catch (err) {
      if (ctrl.signal.aborted) return;
      setStreamedText(`Error: ${err instanceof Error ? err.message : 'AI call failed'}`);
      setIsAnalyzing(false);
    }
  }, [entry, relatedIdeas, updateEntry]);

  const handleStatusChange = (status: SketchpadStatus) => {
    updateEntry(entry.id, { status });
  };

  const handleDelete = async () => {
    if (!confirm('Delete this idea permanently?')) return;
    await deleteEntry(entry.id);
    setSelectedId(null);
    onBack?.();
  };

  const handleAddTag = () => {
    const tag = tagInput.trim();
    if (!tag || entry.tags.includes(tag)) { setTagInput(''); return; }
    updateEntry(entry.id, { tags: [...entry.tags, tag] });
    setTagInput('');
  };

  const handleRemoveTag = (tag: string) => {
    updateEntry(entry.id, { tags: entry.tags.filter((t) => t !== tag) });
  };

  const handlePromoteToCanon = async (sectionId: string) => {
    if (!editingContextId) return;
    const newEntry = await addEntry(editingContextId, sectionId);
    await updateWorldEntry(newEntry.id, {
      content: JSON.stringify({
        type: 'doc',
        content: [{
          type: 'paragraph',
          content: [{ type: 'text', text: entry.content }],
        }],
      }),
    });
    await updateEntry(entry.id, { status: 'CANON' });
    setShowCanonPicker(false);
  };

  const handleCreateSectionAndPromote = async () => {
    if (!editingContextId) return;
    await addSection(editingContextId, 'Sketchpad Ideas');
    const updatedSections = useWorldStore.getState().sections;
    const newSection = updatedSections.find((s) => s.name === 'Sketchpad Ideas');
    if (newSection) await handlePromoteToCanon(newSection.id);
  };

  const catColor = CATEGORY_COLORS[entry.category] ?? 'text-slate-500 bg-slate-100';
  const statusColor = STATUS_COLORS[entry.status] ?? 'bg-slate-100 text-slate-600 border-slate-200';

  return (
    <div className="flex flex-col h-full overflow-hidden bg-white">
      {/* Header */}
      <div
        className="px-4 pt-4 pb-3 border-b border-slate-100 shrink-0"
        style={{ background: 'linear-gradient(135deg, #7c3aed0d, #0d94880d)' }}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div
              className="w-7 h-7 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: 'linear-gradient(135deg, #7c3aed, #0d9488)' }}
            >
              <Sparkles size={13} className="text-white" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${catColor}`}>
                  {entry.category}
                </span>
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${statusColor}`}>
                  {STATUS_LABELS[entry.status]}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {onBack && (
              <button onClick={onBack} className="md:hidden p-1 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100">
                <ChevronRight size={14} />
              </button>
            )}
            <button onClick={handleDelete} className="p-1 rounded text-slate-300 hover:text-red-400 hover:bg-red-50">
              <Trash2 size={13} />
            </button>
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-slate-100 shrink-0">
        {([
          { id: 'develop' as const, icon: Sparkles, label: 'Develop' },
          { id: 'chat' as const, icon: MessageSquare, label: 'Chat' },
        ] as const).map(({ id, icon: Icon, label }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-[11px] font-semibold transition-colors border-b-2 -mb-px ${
              tab === id
                ? 'text-violet-700 border-violet-500'
                : 'text-slate-400 border-transparent hover:text-slate-600'
            }`}
          >
            <Icon size={11} />
            {label}
          </button>
        ))}
      </div>

      {tab === 'chat' ? (
        <div className="flex-1 min-h-0">
          <SketchpadChatPanel entry={entry} relatedIdeas={relatedIdeas} />
        </div>
      ) : (
      <>
      <div className="flex-1 overflow-y-auto">
        {/* Idea content */}
        <div className="px-4 py-4 border-b border-slate-100">
          <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{entry.content}</p>
        </div>

        {/* Status workflow */}
        <div className="px-4 py-3 border-b border-slate-100">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Status</p>
          <div className="flex flex-wrap gap-1">
            {STATUS_FLOW.map((s) => (
              <button
                key={s}
                onClick={() => handleStatusChange(s)}
                className={`text-[10px] font-semibold px-2 py-1 rounded-full border transition-all ${
                  entry.status === s
                    ? STATUS_COLORS[s]
                    : 'bg-white text-slate-400 border-slate-200 hover:border-slate-300'
                }`}
              >
                {STATUS_LABELS[s]}
              </button>
            ))}
          </div>
        </div>

        {/* Tags */}
        <div className="px-4 py-3 border-b border-slate-100">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Tags</p>
          <div className="flex flex-wrap gap-1 mb-2">
            {entry.tags.map((tag) => (
              <span key={tag} className="flex items-center gap-1 text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                <Tag size={8} />
                {tag}
                <button onClick={() => handleRemoveTag(tag)} className="ml-0.5 text-slate-400 hover:text-red-400">
                  <X size={8} />
                </button>
              </span>
            ))}
          </div>
          <div className="flex gap-1">
            <input
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddTag()}
              placeholder="Add tag…"
              className="flex-1 text-xs bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 focus:outline-none focus:border-violet-300"
            />
            <button
              onClick={handleAddTag}
              className="text-xs text-slate-400 hover:text-violet-600 px-2 py-1 rounded-lg hover:bg-violet-50"
            >
              Add
            </button>
          </div>
        </div>

        {/* AI modes */}
        <div className="px-4 py-3 border-b border-slate-100">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Develop with AI</p>
          <div className="grid grid-cols-2 gap-1.5">
            {AI_MODES.map(({ mode, emoji, desc }) => (
              <button
                key={mode}
                onClick={() => runMode(mode)}
                disabled={isAnalyzing}
                className={`flex flex-col items-start gap-0.5 p-2.5 rounded-xl border text-left transition-all disabled:opacity-50 ${
                  activeMode === mode
                    ? 'bg-violet-50 border-violet-200 text-violet-700'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-violet-50 hover:border-violet-200 hover:text-violet-700'
                }`}
              >
                <span className="text-base leading-none">{emoji}</span>
                <span className="text-[11px] font-semibold leading-none">{mode}</span>
                <span className="text-[9px] text-slate-400 leading-tight">{desc}</span>
              </button>
            ))}
          </div>
        </div>

        {/* AI output */}
        {(streamedText || isAnalyzing) && (
          <div className="px-4 py-4 border-b border-slate-100">
            {activeMode && (
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] font-semibold text-violet-600 uppercase tracking-wider">
                  {AI_MODES.find((m) => m.mode === activeMode)?.emoji} {activeMode}
                </p>
                {!isAnalyzing && (
                  <button
                    onClick={() => activeMode && runMode(activeMode)}
                    className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-violet-600"
                  >
                    <RefreshCw size={9} /> Re-run
                  </button>
                )}
              </div>
            )}
            <div className="text-sm text-slate-600">
              <MarkdownText content={streamedText} />
              {isAnalyzing && (
                <span className="inline-block w-1.5 h-4 bg-violet-400 animate-pulse rounded-sm ml-0.5 align-middle mt-0.5" />
              )}
            </div>
          </div>
        )}

        {isAnalyzing && !streamedText && (
          <div className="px-4 py-6 flex items-center gap-2 text-slate-400">
            <Loader2 size={14} className="animate-spin text-violet-400" />
            <span className="text-xs">Developing your idea…</span>
          </div>
        )}
      </div>

      {/* Footer: canon promotion + stop */}
      <div className="px-4 py-3 border-t border-slate-100 shrink-0 space-y-2">
        {isAnalyzing && (
          <button
            onClick={() => { abortRef.current?.abort(); setIsAnalyzing(false); }}
            className="flex items-center gap-1.5 w-full justify-center py-2 rounded-xl text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all"
          >
            Stop
          </button>
        )}

        {/* Canon promotion */}
        {entry.status !== 'CANON' && (
          <div className="relative">
            <button
              onClick={() => setShowCanonPicker((v) => !v)}
              className="flex items-center gap-1.5 w-full justify-center py-2 rounded-xl text-xs font-semibold text-white transition-all"
              style={{ background: 'linear-gradient(135deg, #7c3aed, #0d9488)' }}
            >
              <Star size={11} />
              Promote to Canon
            </button>

            {showCanonPicker && (
              <div className="absolute bottom-full mb-1 left-0 right-0 bg-white border border-slate-200 rounded-xl shadow-lg z-10 overflow-hidden">
                <p className="text-[10px] font-semibold text-slate-500 px-3 pt-2 pb-1 uppercase tracking-wider">Add to World Bible section</p>
                {sections.map((section) => (
                  <button
                    key={section.id}
                    onClick={() => handlePromoteToCanon(section.id)}
                    className="w-full text-left px-3 py-2 text-xs text-slate-700 hover:bg-violet-50 hover:text-violet-700 transition-colors"
                  >
                    {section.name}
                  </button>
                ))}
                <button
                  onClick={handleCreateSectionAndPromote}
                  className="w-full text-left px-3 py-2 text-xs text-teal-600 hover:bg-teal-50 border-t border-slate-100 transition-colors"
                >
                  + New "Sketchpad Ideas" section
                </button>
              </div>
            )}
          </div>
        )}

        {entry.status === 'CANON' && (
          <div className="flex items-center justify-center gap-1.5 py-2 text-xs text-violet-600 font-semibold">
            <Star size={11} className="fill-violet-600" />
            Promoted to Canon
          </div>
        )}
      </div>
      </>
      )}
    </div>
  );
}
