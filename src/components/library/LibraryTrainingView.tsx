import { useEffect, useRef, useState, useCallback } from 'react';
import {
  Brain, Plus, Trash2, BookOpen, Mail, Feather, Layers,
  ChevronRight, FileText, Save, AlertCircle, Sparkles,
} from 'lucide-react';
import { useTrainingStore } from '../../store/trainingStore';
import type { TrainingCategory, TrainingEntry } from '../../types';
import { TRAINING_CATEGORY_META } from '../../types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CATEGORY_ICONS: Record<TrainingCategory, typeof Brain> = {
  journal: BookOpen,
  email: Mail,
  'short-story': Feather,
  misc: Layers,
};

const ORDERED_CATEGORIES: TrainingCategory[] = ['journal', 'email', 'short-story', 'misc'];

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface CategoryPillProps {
  category: TrainingCategory;
  count: number;
  selected: boolean;
  onClick: () => void;
}

function CategoryPill({ category, count, selected, onClick }: CategoryPillProps) {
  const meta = TRAINING_CATEGORY_META[category];
  const Icon = CATEGORY_ICONS[category];
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
        selected
          ? 'bg-violet-50 text-violet-700 border-l-2 border-violet-500 pl-[10px]'
          : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
      }`}
    >
      <Icon size={15} className={selected ? 'text-violet-500' : 'text-slate-400'} />
      <span className="flex-1 text-left truncate">{meta.plural}</span>
      {count > 0 && (
        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
          selected ? 'bg-violet-100 text-violet-600' : 'bg-slate-100 text-slate-400'
        }`}>
          {count}
        </span>
      )}
    </button>
  );
}

interface EntryRowProps {
  entry: TrainingEntry;
  selected: boolean;
  onClick: () => void;
}

function EntryRow({ entry, selected, onClick }: EntryRowProps) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-3 py-2.5 rounded-xl transition-all group ${
        selected
          ? 'bg-violet-50 border border-violet-100'
          : 'hover:bg-slate-50 border border-transparent'
      }`}
    >
      <p className={`text-sm font-medium truncate ${selected ? 'text-violet-800' : 'text-slate-700'}`}>
        {entry.title || 'Untitled'}
      </p>
      <div className="flex items-center gap-2 mt-0.5">
        <span className="text-[10px] text-slate-400">
          {entry.wordCount.toLocaleString()} words
        </span>
        <span className="text-[10px] text-slate-300">·</span>
        <span className="text-[10px] text-slate-400">{timeAgo(entry.updatedAt)}</span>
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function LibraryTrainingView() {
  const { entries, loaded, loadAll, addEntry, updateEntry, deleteEntry } = useTrainingStore();

  const [activeCategory, setActiveCategory] = useState<TrainingCategory>('journal');
  const [activeEntryId, setActiveEntryId] = useState<string | null>(null);

  // Draft state — buffered locally so saves don't cause re-renders mid-type
  const [draftTitle, setDraftTitle] = useState('');
  const [draftContent, setDraftContent] = useState('');
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { loadAll(); }, [loadAll]);

  const categoryEntries = entries.filter((e) => e.category === activeCategory);
  const activeEntry = entries.find((e) => e.id === activeEntryId) ?? null;

  // When active entry changes, load draft
  useEffect(() => {
    if (activeEntry) {
      setDraftTitle(activeEntry.title);
      setDraftContent(activeEntry.content);
      setIsDirty(false);
    }
  }, [activeEntryId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [draftContent]);

  // ── Autosave (2 s debounce) ────────────────────────────────────────────────
  const save = useCallback(async () => {
    if (!activeEntryId || !isDirty) return;
    setIsSaving(true);
    await updateEntry(activeEntryId, { title: draftTitle, content: draftContent });
    setIsDirty(false);
    setIsSaving(false);
  }, [activeEntryId, isDirty, draftTitle, draftContent, updateEntry]);

  useEffect(() => {
    if (!isDirty) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(save, 2000);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [isDirty, save]);

  // ── Actions ────────────────────────────────────────────────────────────────
  const handleNewEntry = async () => {
    if (isDirty) await save();
    const entry = await addEntry(activeCategory);
    setActiveEntryId(entry.id);
    setTimeout(() => textareaRef.current?.focus(), 50);
  };

  const handleSelectEntry = async (id: string) => {
    if (id === activeEntryId) return;
    if (isDirty) await save();
    setActiveEntryId(id);
  };

  const handleSelectCategory = async (cat: TrainingCategory) => {
    if (isDirty) await save();
    setActiveCategory(cat);
    setActiveEntryId(null);
  };

  const handleDelete = async () => {
    if (!activeEntryId) return;
    await deleteEntry(activeEntryId);
    setActiveEntryId(null);
    setShowDeleteConfirm(false);
    setIsDirty(false);
  };

  const handleTitleChange = (v: string) => { setDraftTitle(v); setIsDirty(true); };
  const handleContentChange = (v: string) => { setDraftContent(v); setIsDirty(true); };

  const totalWords = entries.reduce((s, e) => s + e.wordCount, 0);
  const meta = TRAINING_CATEGORY_META[activeCategory];
  const CategoryIcon = CATEGORY_ICONS[activeCategory];

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col flex-1 overflow-hidden h-full">

      {/* ── Coming Soon banner ─────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 border-b border-amber-200 shrink-0">
        <Sparkles size={12} className="text-amber-500 shrink-0" />
        <span className="text-xs font-medium text-amber-700">Coming Soon — the Training Portal is not yet functional in this version.</span>
      </div>

      <div className="flex flex-1 overflow-hidden">

      {/* ── Left panel: categories + entry list ── */}
      <div className="w-64 shrink-0 border-r border-slate-200 flex flex-col bg-white">

        {/* Header */}
        <div className="px-4 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2.5 mb-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: 'linear-gradient(135deg, #fbbf24, #d97706)' }}>
              <Brain size={15} className="text-white" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-800 leading-none">Training Portal</p>
              <p className="text-[10px] text-slate-400 mt-0.5">Oracle Intelligence System</p>
            </div>
          </div>
          {loaded && (
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-50 border border-amber-100">
              <Brain size={10} className="text-amber-500 shrink-0" />
              <span className="text-[10px] text-amber-700 font-medium">
                {totalWords.toLocaleString()} words in corpus
              </span>
            </div>
          )}
        </div>

        {/* Categories */}
        <div className="px-3 py-3 border-b border-slate-100">
          <p className="text-[10px] uppercase tracking-[0.15em] font-semibold text-slate-400 px-3 mb-2">
            Sections
          </p>
          <nav className="space-y-0.5">
            {ORDERED_CATEGORIES.map((cat) => (
              <CategoryPill
                key={cat}
                category={cat}
                count={entries.filter((e) => e.category === cat).length}
                selected={activeCategory === cat}
                onClick={() => handleSelectCategory(cat)}
              />
            ))}
          </nav>
        </div>

        {/* Entry list */}
        <div className="flex-1 overflow-y-auto px-3 py-3">
          <div className="flex items-center justify-between px-1 mb-2">
            <p className="text-[10px] uppercase tracking-[0.15em] font-semibold text-slate-400">
              {meta.plural}
            </p>
            <button
              onClick={handleNewEntry}
              className="flex items-center gap-1 text-[10px] text-violet-600 hover:text-violet-700 font-medium transition-colors"
            >
              <Plus size={11} />
              New
            </button>
          </div>

          {categoryEntries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center gap-2">
              <CategoryIcon size={24} className="text-slate-200" />
              <p className="text-[11px] text-slate-400 max-w-[140px] leading-relaxed">
                No {meta.plural.toLowerCase()} yet. Add your first entry.
              </p>
              <button
                onClick={handleNewEntry}
                className="flex items-center gap-1 text-[11px] text-violet-600 hover:text-violet-700 font-medium mt-1 transition-colors"
              >
                <Plus size={11} />
                Add entry
              </button>
            </div>
          ) : (
            <div className="space-y-0.5">
              {categoryEntries.map((entry) => (
                <EntryRow
                  key={entry.id}
                  entry={entry}
                  selected={entry.id === activeEntryId}
                  onClick={() => handleSelectEntry(entry.id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Right panel: editor ── */}
      <div className="flex-1 flex flex-col overflow-hidden bg-white">

        {activeEntry ? (
          <>
            {/* Editor toolbar */}
            <div className="flex items-center gap-3 px-6 py-3 border-b border-slate-100 shrink-0">
              {/* Category badge */}
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold text-white"
                style={{ background: meta.gradient }}>
                <CategoryIcon size={10} />
                {meta.label}
              </div>

              <div className="flex-1" />

              {/* Save status */}
              <span className={`text-[10px] transition-colors ${
                isSaving ? 'text-violet-500' : isDirty ? 'text-amber-500' : 'text-slate-300'
              }`}>
                {isSaving ? 'Saving…' : isDirty ? 'Unsaved changes' : 'Saved'}
              </span>

              {/* Manual save */}
              <button
                onClick={save}
                disabled={!isDirty || isSaving}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all
                  disabled:opacity-30 border-violet-200 text-violet-600 hover:bg-violet-50 disabled:cursor-not-allowed"
              >
                <Save size={11} />
                Save
              </button>

              {/* Delete */}
              {showDeleteConfirm ? (
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-red-500">Delete?</span>
                  <button onClick={handleDelete}
                    className="px-2 py-1 rounded text-[11px] font-medium bg-red-100 text-red-700 hover:bg-red-200 transition-all">
                    Yes
                  </button>
                  <button onClick={() => setShowDeleteConfirm(false)}
                    className="px-2 py-1 rounded text-[11px] text-slate-500 hover:bg-slate-100 transition-all">
                    No
                  </button>
                </div>
              ) : (
                <button onClick={() => setShowDeleteConfirm(true)}
                  className="p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-all">
                  <Trash2 size={13} />
                </button>
              )}
            </div>

            {/* Scrollable editor body */}
            <div className="flex-1 overflow-y-auto px-8 py-6">
              {/* Title */}
              <input
                value={draftTitle}
                onChange={(e) => handleTitleChange(e.target.value)}
                placeholder="Entry title…"
                className="w-full text-2xl font-bold text-slate-900 placeholder-slate-200 bg-transparent outline-none border-none mb-5 leading-tight"
              />

              {/* Paste hint */}
              {draftContent === '' && (
                <div className="flex items-start gap-3 p-4 mb-4 rounded-xl border border-dashed border-slate-200 bg-slate-50">
                  <FileText size={16} className="text-slate-300 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-slate-500 mb-0.5">Paste your writing here</p>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Copy and paste any text you've written — {meta.description.toLowerCase()}
                      {' '}Meyvn will study your vocabulary, rhythm, and style to write more like you.
                    </p>
                  </div>
                </div>
              )}

              {/* Content textarea */}
              <textarea
                ref={textareaRef}
                value={draftContent}
                onChange={(e) => handleContentChange(e.target.value)}
                placeholder="Start typing or paste your writing…"
                className="w-full bg-transparent outline-none resize-none text-slate-700 text-sm leading-relaxed placeholder-slate-300 min-h-[300px]"
                style={{ fontFamily: 'inherit' }}
              />
            </div>

            {/* Footer: word count + Oracle note */}
            <div className="shrink-0 px-8 py-3 border-t border-slate-100 flex items-center gap-4">
              <span className="text-[11px] text-slate-400">
                {wordCount(draftContent).toLocaleString()} words in this entry
              </span>
              {wordCount(draftContent) > 100 && (
                <>
                  <span className="text-slate-200">·</span>
                  <div className="flex items-center gap-1.5">
                    <Brain size={10} className="text-amber-400" />
                    <span className="text-[11px] text-amber-600 font-medium">
                      Oracle Intelligence will include this in the next analysis
                    </span>
                  </div>
                </>
              )}
            </div>
          </>
        ) : (
          /* ── Empty state ── */
          <div className="flex-1 flex flex-col items-center justify-center text-center px-8 gap-5">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center shadow-lg"
              style={{ background: 'linear-gradient(135deg, #fbbf24, #d97706)' }}>
              <Brain size={28} className="text-white/90" />
            </div>
            <div className="max-w-sm">
              <h3 className="text-lg font-bold text-slate-800 mb-2">Training Portal</h3>
              <p className="text-sm text-slate-500 leading-relaxed mb-1">
                Paste any writing you've done outside of Scriptorium — journal entries, emails,
                short stories, or anything else.
              </p>
              <p className="text-sm text-slate-500 leading-relaxed">
                The <span className="font-medium text-amber-600">Oracle Intelligence System</span> will
                study your vocabulary, rhythm, pacing, and style so Meyvn writes more like you.
              </p>
            </div>

            {/* Category quick-start */}
            <div className="grid grid-cols-2 gap-2 w-full max-w-xs">
              {ORDERED_CATEGORIES.map((cat) => {
                const CatIcon = CATEGORY_ICONS[cat];
                const catMeta = TRAINING_CATEGORY_META[cat];
                return (
                  <button
                    key={cat}
                    onClick={async () => {
                      setActiveCategory(cat);
                      const entry = await addEntry(cat);
                      setActiveEntryId(entry.id);
                    }}
                    className="flex items-center gap-2.5 p-3 rounded-xl border border-slate-100 hover:border-violet-200 hover:bg-violet-50 transition-all group text-left"
                  >
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                      style={{ background: catMeta.gradient }}>
                      <CatIcon size={14} className="text-white" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-slate-700 group-hover:text-violet-700 transition-colors">
                        {catMeta.plural}
                      </p>
                      <p className="text-[10px] text-slate-400 flex items-center gap-0.5 mt-0.5">
                        <Plus size={9} />New entry
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>

            {totalWords > 0 && (
              <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-amber-50 border border-amber-100">
                <Brain size={12} className="text-amber-500" />
                <span className="text-xs text-amber-700 font-medium">
                  {totalWords.toLocaleString()} words already in your corpus
                </span>
              </div>
            )}

            {entries.length > 0 && (
              <button
                onClick={() => {
                  const first = entries.find((e) => e.category === activeCategory) ?? entries[0];
                  if (first) {
                    setActiveCategory(first.category);
                    setActiveEntryId(first.id);
                  }
                }}
                className="flex items-center gap-1.5 text-sm text-violet-600 hover:text-violet-700 font-medium transition-colors"
              >
                View existing entries
                <ChevronRight size={14} />
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Floating Oracle indicator (top-right) ── */}
      {loaded && totalWords > 0 && (
        <div className="absolute top-4 right-4 flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-amber-200 bg-amber-50 pointer-events-none">
          <Brain size={11} className="text-amber-500" />
          <span className="text-[10px] text-amber-700 font-semibold">
            {entries.length} {entries.length === 1 ? 'entry' : 'entries'} · {totalWords.toLocaleString()} words
          </span>
          <AlertCircle size={10} className="text-amber-400 ml-0.5" />
        </div>
      )}
    </div>
    </div>
  );
}
