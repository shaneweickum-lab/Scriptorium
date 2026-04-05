import { useCallback, useState, useEffect, useRef } from 'react';
import { useWritingStore } from '../../store/writingStore';
import { useLibraryStore } from '../../store/libraryStore';
import { useWorldStore } from '../../store/worldStore';
import { useAchievementStore } from '../../store/achievementStore';
import { useUIStore } from '../../store/uiStore';
import { RichTextEditor } from '../editor/RichTextEditor';
import { WorldReferencePanel } from './WorldReferencePanel';
import { EmptyState } from '../common/EmptyState';
import { PenLine } from 'lucide-react';
import { useAutoSave } from '../../hooks/useAutoSave';

export function NodeEditor() {
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

  // Track session word count delta
  const sessionBaseWords = useRef<number | null>(null);

  // Merge book's own world entries with linked world bible entries for @mention
  const allSections = linkedSections.length > 0 ? [...sections, ...linkedSections] : sections;
  const allEntries = linkedEntries.length > 0 ? [...entries, ...linkedEntries] : entries;

  const node = nodes.find((n) => n.id === activeNodeId);
  const labels = activeBook?.hierarchyLabels || { part: 'Part', chapter: 'Chapter', scene: 'Scene', note: 'Note' };

  const [referencedEntryId, setReferencedEntryId] = useState<string | null>(null);
  const referencedEntry = referencedEntryId ? entries.find((e) => e.id === referencedEntryId) ?? null : null;
  const referencedSection = referencedEntry ? sections.find((s) => s.id === referencedEntry.sectionId) : undefined;

  const saveContent = useCallback(
    async (content: string) => {
      if (node) await updateNode(node.id, { content });
    },
    [node, updateNode]
  );

  const { save: debouncedSave } = useAutoSave(saveContent, 500);

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
      <div className="px-6 pt-4 pb-2 border-b border-slate-700/30">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs text-slate-500 uppercase tracking-wider">{typeLabel}</span>
        </div>
        <input
          value={node.title}
          onChange={(e) => updateNode(node.id, { title: e.target.value })}
          className="w-full bg-transparent text-2xl font-bold text-slate-100 placeholder-slate-600 focus:outline-none"
          placeholder={`${typeLabel} title...`}
        />
        <input
          value={node.synopsis}
          onChange={(e) => updateNode(node.id, { synopsis: e.target.value })}
          className="w-full bg-transparent text-sm text-slate-500 placeholder-slate-700 focus:outline-none mt-1"
          placeholder="Synopsis (optional)..."
        />
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 overflow-hidden">
          <RichTextEditor
            key={node.id}
            content={node.content}
            onChange={debouncedSave}
            placeholder={`Write your ${typeLabel.toLowerCase()} here...`}
            autoFocus
            worldEntries={allEntries}
            worldSections={allSections}
            onMentionClick={setReferencedEntryId}
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
