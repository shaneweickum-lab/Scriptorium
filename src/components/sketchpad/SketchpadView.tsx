import { useState, useEffect, useRef } from 'react';
import { Lightbulb, Search, X, Plus } from 'lucide-react';
import { useSketchpadStore } from '../../store/sketchpadStore';
import { useLibraryStore } from '../../store/libraryStore';
import { SketchpadAIPanel } from './SketchpadAIPanel';
import type { SketchpadCategory, SketchpadStatus } from '../../types/sketchpad';
import {
  SKETCHPAD_CATEGORIES, SKETCHPAD_STATUSES, STATUS_LABELS,
  STATUS_COLORS, CATEGORY_COLORS,
} from '../../types/sketchpad';

// ---------------------------------------------------------------------------
// Category inference from idea text
// ---------------------------------------------------------------------------

const CATEGORY_KEYWORDS: [SketchpadCategory, string[]][] = [
  ['Character',     ['character', 'person', 'hero', 'villain', 'protagonist', 'named', 'her name', 'his name', 'they are']],
  ['Location',      ['city', 'town', 'village', 'place', 'forest', 'mountain', 'castle', 'kingdom', 'island', 'desert', 'cave', 'region']],
  ['Magic',         ['magic', 'spell', 'enchant', 'curse', 'power', 'ability', 'rune', 'arcane', 'mystic', 'sorcery']],
  ['Technology',    ['machine', 'device', 'invention', 'tech', 'mechanism', 'engine', 'clockwork', 'automaton']],
  ['Creature',      ['creature', 'beast', 'monster', 'dragon', 'animal', 'demon', 'spirit', 'elemental']],
  ['Conflict',      ['war', 'battle', 'fight', 'conflict', 'struggle', 'tension', 'invasion', 'siege', 'rebellion']],
  ['Lore',          ['history', 'legend', 'myth', 'lore', 'origin', 'ancient', 'prophecy', 'chronicle']],
  ['Culture',       ['culture', 'tradition', 'custom', 'society', 'ritual', 'ceremony', 'belief', 'religion']],
  ['Mystery',       ['mystery', 'secret', 'unknown', 'hidden', 'puzzle', 'clue', 'disappear', 'strange']],
  ['Item',          ['item', 'artifact', 'weapon', 'sword', 'ring', 'object', 'relic', 'talisman']],
  ['Faction',       ['faction', 'group', 'guild', 'order', 'clan', 'organization', 'alliance']],
  ['Worldbuilding', ['world', 'realm', 'system', 'rule', 'law', 'geography', 'economy', 'political']],
  ['Plot',          ['quest', 'journey', 'discovery', 'plot twist', 'turning point', 'event']],
  ['Scene',         ['scene', 'moment', 'setting', 'backdrop', 'encounter']],
  ['Dialogue',      ['says', 'conversation', 'dialogue', 'speech', 'whisper', 'told']],
  ['Theme',         ['theme', 'concept', 'message', 'meaning', 'symbolism', 'motif']],
];

function inferCategory(text: string): SketchpadCategory {
  const lower = text.toLowerCase();
  for (const [category, keywords] of CATEGORY_KEYWORDS) {
    if (keywords.some((kw) => lower.includes(kw))) return category;
  }
  return 'Other';
}

// ---------------------------------------------------------------------------
// Entry card
// ---------------------------------------------------------------------------

interface EntryCardProps {
  entry: { id: string; content: string; category: SketchpadCategory; status: SketchpadStatus; tags: string[] };
  isSelected: boolean;
  onClick: () => void;
}

function EntryCard({ entry, isSelected, onClick }: EntryCardProps) {
  const catColor = CATEGORY_COLORS[entry.category] ?? 'text-slate-500 bg-slate-100';
  const statusColor = STATUS_COLORS[entry.status] ?? 'bg-slate-100 text-slate-600 border-slate-200';
  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-3 rounded-xl border transition-all ${
        isSelected
          ? 'bg-violet-50 border-violet-200 shadow-sm'
          : 'bg-white border-slate-200 hover:border-violet-200 hover:bg-violet-50/50'
      }`}
    >
      <p className="text-sm text-slate-700 leading-snug line-clamp-3 mb-2">{entry.content}</p>
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${catColor}`}>
          {entry.category}
        </span>
        <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full border ${statusColor}`}>
          {STATUS_LABELS[entry.status]}
        </span>
        {entry.tags.slice(0, 3).map((tag) => (
          <span key={tag} className="text-[9px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-full">
            {tag}
          </span>
        ))}
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Main view
// ---------------------------------------------------------------------------

export function SketchpadView() {
  const activeBook = useLibraryStore((s) => s.activeBook);
  const entries = useSketchpadStore((s) => s.entries);
  const selectedId = useSketchpadStore((s) => s.selectedId);
  const loadEntries = useSketchpadStore((s) => s.loadEntries);
  const addEntry = useSketchpadStore((s) => s.addEntry);
  const setSelectedId = useSketchpadStore((s) => s.setSelectedId);

  const [mobileView, setMobileView] = useState<'list' | 'detail'>('list');
  const [filterCategory, setFilterCategory] = useState<SketchpadCategory | 'All'>('All');
  const [filterStatus, setFilterStatus] = useState<SketchpadStatus | 'All'>('All');
  const [search, setSearch] = useState('');
  const [newIdea, setNewIdea] = useState('');
  const [newCategory, setNewCategory] = useState<SketchpadCategory>('Other');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (activeBook?.id) loadEntries(activeBook.id);
  }, [activeBook?.id, loadEntries]);

  // Auto-infer category as user types
  useEffect(() => {
    if (newIdea.length > 15) {
      setNewCategory(inferCategory(newIdea));
    }
  }, [newIdea]);

  const selectedEntry = entries.find((e) => e.id === selectedId) ?? null;
  const relatedIdeas = entries
    .filter((e) => e.id !== selectedId && e.status !== 'REJECTED')
    .slice(0, 8)
    .map((e) => e.content.slice(0, 120));

  const filteredEntries = entries.filter((e) => {
    if (filterCategory !== 'All' && e.category !== filterCategory) return false;
    if (filterStatus !== 'All' && e.status !== filterStatus) return false;
    if (search && !e.content.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const handleSubmit = async () => {
    if (!newIdea.trim() || !activeBook) return;
    setIsSubmitting(true);
    const entry = {
      id: crypto.randomUUID(),
      bookId: activeBook.id,
      content: newIdea.trim(),
      aiAnalysis: '',
      category: newCategory,
      status: 'RAW' as SketchpadStatus,
      tags: [],
      relatedIds: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await addEntry(entry);
    setSelectedId(entry.id);
    setNewIdea('');
    setNewCategory('Other');
    setIsSubmitting(false);
    setMobileView('detail');
    textareaRef.current?.focus();
  };

  const handleSelectEntry = (id: string) => {
    setSelectedId(id);
    setMobileView('detail');
  };

  const clearFilters = filterCategory !== 'All' || filterStatus !== 'All' || search !== '';

  return (
    <div className="flex h-full overflow-hidden bg-slate-50">
      {/* Left panel: form + list */}
      <div
        className={`flex flex-col h-full bg-white border-r border-slate-200 overflow-hidden shrink-0
          w-full md:w-96
          ${mobileView === 'detail' ? 'hidden md:flex' : 'flex'}`}
      >
        {/* Header */}
        <div className="px-4 pt-5 pb-4 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-2 mb-1">
            <div
              className="w-7 h-7 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: 'linear-gradient(135deg, #7c3aed, #0d9488)' }}
            >
              <Lightbulb size={13} className="text-white" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-800">Sketchpad</h2>
              <p className="text-[10px] text-slate-400">Capture & develop ideas</p>
            </div>
          </div>
        </div>

        {/* New idea form */}
        <div className="px-3 py-3 border-b border-slate-100 shrink-0">
          <textarea
            ref={textareaRef}
            value={newIdea}
            onChange={(e) => setNewIdea(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSubmit();
            }}
            placeholder="Capture an idea — a character, location, plot twist, magic system… anything."
            rows={3}
            className="w-full text-sm bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-violet-300 resize-none placeholder-slate-300 text-slate-700"
          />
          <div className="flex items-center justify-between mt-2 gap-2">
            <select
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value as SketchpadCategory)}
              className="flex-1 text-xs bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-slate-600 focus:outline-none focus:border-violet-300"
            >
              {SKETCHPAD_CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <button
              onClick={handleSubmit}
              disabled={!newIdea.trim() || isSubmitting}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-white disabled:opacity-40 transition-all"
              style={{ background: 'linear-gradient(135deg, #7c3aed, #0d9488)' }}
            >
              <Plus size={11} />
              Add Idea
            </button>
          </div>
          <p className="text-[9px] text-slate-300 mt-1">⌘↵ to add quickly</p>
        </div>

        {/* Filters */}
        <div className="px-3 py-2 border-b border-slate-100 shrink-0 space-y-2">
          <div className="relative">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-300" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search ideas…"
              className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg pl-7 pr-3 py-1.5 focus:outline-none focus:border-violet-300 text-slate-700"
            />
          </div>
          <div className="flex gap-1.5">
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value as SketchpadCategory | 'All')}
              className="flex-1 text-[11px] bg-white border border-slate-200 rounded-lg px-2 py-1 text-slate-600 focus:outline-none"
            >
              <option value="All">All categories</option>
              {SKETCHPAD_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as SketchpadStatus | 'All')}
              className="flex-1 text-[11px] bg-white border border-slate-200 rounded-lg px-2 py-1 text-slate-600 focus:outline-none"
            >
              <option value="All">All statuses</option>
              {SKETCHPAD_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
            </select>
            {clearFilters && (
              <button
                onClick={() => { setFilterCategory('All'); setFilterStatus('All'); setSearch(''); }}
                className="p-1 rounded text-slate-400 hover:text-slate-600"
              >
                <X size={12} />
              </button>
            )}
          </div>
        </div>

        {/* Entry list */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {filteredEntries.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-center text-slate-400">
              <Lightbulb size={24} className="mb-2 opacity-30" />
              <p className="text-xs">
                {entries.length === 0
                  ? 'No ideas yet — capture your first one above.'
                  : 'No ideas match your filters.'}
              </p>
            </div>
          ) : (
            filteredEntries.map((entry) => (
              <EntryCard
                key={entry.id}
                entry={entry}
                isSelected={selectedId === entry.id}
                onClick={() => handleSelectEntry(entry.id)}
              />
            ))
          )}
        </div>
      </div>

      {/* Right panel: AI panel */}
      <div
        className={`flex flex-col flex-1 h-full overflow-hidden
          ${mobileView === 'list' ? 'hidden md:flex' : 'flex'}`}
      >
        {selectedEntry ? (
          <SketchpadAIPanel
            entry={selectedEntry}
            relatedIdeas={relatedIdeas}
            onBack={() => setMobileView('list')}
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-center text-slate-400 p-8">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, #7c3aed1a, #0d94881a)' }}
            >
              <Lightbulb size={28} className="text-violet-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-500 mb-1">Select an idea to develop it</p>
              <p className="text-xs text-slate-400 max-w-xs">
                Choose any idea from the list to analyse, brainstorm, challenge, or generate content from it.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
