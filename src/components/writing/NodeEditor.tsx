import { useCallback, useState, useEffect, useRef } from 'react';
import { useWritingStore } from '../../store/writingStore';
import { useLibraryStore } from '../../store/libraryStore';
import { useWorldStore } from '../../store/worldStore';
import { useAchievementStore } from '../../store/achievementStore';
import { useUIStore } from '../../store/uiStore';
import { useEditorStore } from '../../store/editorStore';
import { streakStore } from '../../store/streakStore';
import { RichTextEditor } from '../editor/RichTextEditor';
import { WorldReferencePanel } from './WorldReferencePanel';
import { EmptyState } from '../common/EmptyState';
import { PenLine, Maximize2 } from 'lucide-react';
import { useAutoSave } from '../../hooks/useAutoSave';
import { tiptapJsonToText } from '../../utils/tiptapToHtml';

interface NodeEditorProps { distractFree?: boolean; }
export function NodeEditor({ distractFree = false }: NodeEditorProps) {
  const nodes = useWritingStore((s) => s.nodes);
  const activeNodeId = useWritingStore((s) => s.activeNodeId);
  const updateNode = useWritingStore((s) => s.updateNode);
  const activeBook = useLibraryStore((s) => s.activeBook);
  const sections = useWorldStore((s) => s.sections);
  const entries = useWorldStore((s) => s.entries);
  const linkedSections = useWorldStore((s) => s.linkedSections);
  const linkedEntries = useWorldStore((s) => s.linkedEntries);

  const {
    checkBookWordCount,
    checkBookChapters,
    checkSessionWords,
    checkTimeOfDay,
    checkXPMilestone,
  } = useAchievementStore();
  const addAchievementToast = useUIStore((s) => s.addAchievementToast);
  const setShowDistractFree = useUIStore((s) => s.setShowDistractFree);
  const setLiveContext = useEditorStore((s) => s.setLiveContext);
  const clearLiveContext = useEditorStore((s) => s.clearLiveContext);

  // Track session word count delta
  const sessionBaseWords = useRef<number | null>(null);

  // Merge book's own world entries with linked world bible entries for @mention
  const allSections = linkedSections.length > 0 ? [...sections, ...linkedSections] : sections;
  const allEntries = linkedEntries.length > 0 ? [...entries, ...linkedEntries] : entries;

  const totalBookWords = nodes.reduce((sum, n) => sum + (n.wordCountCache ?? 0), 0);
  const node = nodes.find((n) => n.id === activeNodeId);
  const labels = activeBook?.hierarchyLabels || { part: 'Part', chapter: 'Chapter', scene: 'Scene', note: 'Note' };

  const [referencedEntryId, setReferencedEntryId] = useState<string | null>(null);
  const referencedEntry = referencedEntryId ? entries.find((e) => e.id === referencedEntryId) ?? null : null;
  const referencedSection = referencedEntry ? sections.find((s) => s.id === referencedEntry.sectionId) : undefined;

  const saveContent = useCallback(
    async (content: string) => {
      if (!node) return;
      await updateNode(node.id, { content });
      // Keep Meyvn's live context in sync with every debounced save
      setLiveContext(tiptapJsonToText(content), node.title);
    },
    [node, updateNode, setLiveContext]
  );

  const { save: debouncedSave } = useAutoSave(saveContent, 500);

  // Seed live context when the active node changes (scene switch, initial load)
  useEffect(() => {
    if (node) {
      setLiveContext(tiptapJsonToText(node.content ?? ''), node.title);
    } else {
      clearLiveContext();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node?.id]);

  // Check achievements whenever nodes change
  useEffect(() => {
    if (!activeBook || nodes.length === 0) return;

    const totalWords = nodes.reduce((sum, n) => sum + (n.wordCountCache ?? 0), 0);
    const chapterCount = nodes.filter((n) => n.type === 'chapter').length;

    // Initialize session baseline on first load
    if (sessionBaseWords.current === null) {
      sessionBaseWords.current = totalWords;
    }

    const sessionWords = Math.max(0, totalWords - sessionBaseWords.current);

    const onUnlock = (name: string, xp: number, emoji: string) => {
      addAchievementToast(name, xp, emoji);
    };

    checkBookWordCount(activeBook.id, totalWords, activeBook.wordGoal, onUnlock);
    checkBookChapters(activeBook.id, chapterCount, onUnlock);
    checkSessionWords(sessionWords, onUnlock);
    checkTimeOfDay(onUnlock);
    checkXPMilestone(onUnlock);

    // Record writing streak
    if (totalWords > 0) streakStore.recordToday();
  }, [nodes, activeBook?.id]);

  if (!node) {
    return (
      <EmptyState
        icon={<PenLine size={40} />}
        title="Select something to write"
        description="Choose a scene, chapter, or note from the outline to start writing"
      />
    );
  }

  const typeLabel = labels[node.type] || node.type;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-6 pt-4 pb-2 border-b border-slate-200">
        <div className="flex items-center justify-between gap-2 mb-1">
          <span className="text-[10px] font-semibold text-teal-600 uppercase tracking-widest">{typeLabel}</span>
          {!distractFree && (
            <button
              onClick={() => setShowDistractFree(true)}
              title="Distraction-free mode (Esc to exit)"
              className="p-1 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            >
              <Maximize2 size={13} />
            </button>
          )}
        </div>
        <input
          value={node.title}
          onChange={(e) => updateNode(node.id, { title: e.target.value })}
          className="w-full bg-transparent text-2xl font-bold text-slate-900 placeholder-slate-300 focus:outline-none"
          placeholder={`${typeLabel} title...`}
        />
        <input
          value={node.synopsis}
          onChange={(e) => updateNode(node.id, { synopsis: e.target.value })}
          className="w-full bg-transparent text-sm text-slate-400 placeholder-slate-300 focus:outline-none mt-1"
          placeholder="Synopsis (optional)..."
        />
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 overflow-hidden">
          <RichTextEditor
            key={node.id}
            nodeId={node.id}
            content={node.content}
            onChange={debouncedSave}
            placeholder={`Write your ${typeLabel.toLowerCase()} here...`}
            autoFocus
            worldEntries={allEntries}
            worldSections={allSections}
            onMentionClick={setReferencedEntryId}
            totalBookWords={totalBookWords}
          />
        </div>

        {referencedEntry && (
          <WorldReferencePanel
            entry={referencedEntry}
            section={referencedSection}
            onClose={() => setReferencedEntryId(null)}
          />
        )}
      </div>
    </div>
  );
}
