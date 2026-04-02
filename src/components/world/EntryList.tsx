import { useState } from 'react';
import { Plus, Trash2, Search } from 'lucide-react';
import { useWorldStore } from '../../store/worldStore';
import { useLibraryStore } from '../../store/libraryStore';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { EmptyState } from '../common/EmptyState';
import type { WorldEntry } from '../../types';
import { tiptapJsonToText } from '../../utils/tiptapToHtml';

export function EntryList() {
  const sections = useWorldStore((s) => s.sections);
  const entries = useWorldStore((s) => s.entries);
  const activeSectionId = useWorldStore((s) => s.activeSectionId);
  const activeEntryId = useWorldStore((s) => s.activeEntryId);
  const setActiveEntry = useWorldStore((s) => s.setActiveEntry);
  const addEntry = useWorldStore((s) => s.addEntry);
  const deleteEntry = useWorldStore((s) => s.deleteEntry);
  const bookId = useLibraryStore((s) => s.activeBook?.id ?? '');

  const [search, setSearch] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<WorldEntry | null>(null);

  const activeSection = sections.find((s) => s.id === activeSectionId);
  const sectionEntries = entries
    .filter((e) => e.sectionId === activeSectionId)
    .filter((e) => !search || e.title.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => b.updatedAt - a.updatedAt);

  if (!activeSectionId) {
    return (
      <div className="flex items-center justify-center h-full text-slate-500 text-sm">
        Select a section
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-slate-700/50 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-slate-300">{activeSection?.name}</span>
          <button
            onClick={() => addEntry(bookId, activeSectionId)}
            className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
          >
            <Plus size={14} />
            New
          </button>
        </div>
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search entries..."
            className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-300 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-1">
        {sectionEntries.length === 0 ? (
          <EmptyState
            icon={<Plus size={32} />}
            title="No entries yet"
            description={`Add your first ${activeSection?.name.toLowerCase()} entry`}
            action={{ label: 'Add Entry', onClick: () => addEntry(bookId, activeSectionId) }}
          />
        ) : (
          sectionEntries.map((entry) => {
            const preview = tiptapJsonToText(entry.content).slice(0, 80);
            return (
              <div
                key={entry.id}
                onClick={() => setActiveEntry(entry.id)}
                className={`group flex flex-col px-3 py-2.5 cursor-pointer border-b border-slate-700/30 transition-colors ${
                  activeEntryId === entry.id
                    ? 'bg-indigo-600/15 border-l-2 border-l-indigo-500'
                    : 'hover:bg-slate-800'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-sm font-medium text-slate-200 truncate">{entry.title}</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); setDeleteTarget(entry); }}
                    className="shrink-0 opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-900/40 text-red-400 transition-all"
                    title="Delete entry"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
                {preview && <p className="text-xs text-slate-500 mt-0.5 truncate">{preview}</p>}
                {entry.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {entry.tags.slice(0, 3).map((tag) => (
                      <span key={tag} className="text-[10px] bg-slate-700 text-slate-400 px-1.5 py-0.5 rounded">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {deleteTarget && (
        <ConfirmDialog
          title="Delete Entry"
          message={`Delete "${deleteTarget.title}"? This cannot be undone.`}
          confirmLabel="Delete"
          danger
          onConfirm={() => deleteEntry(deleteTarget.id)}
          onClose={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
