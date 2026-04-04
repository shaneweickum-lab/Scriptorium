import { useState } from 'react';
import { X, Search, BookOpen, ChevronRight } from 'lucide-react';
import { useWorldStore } from '../../store/worldStore';
import type { WorldEntry, WorldSection } from '../../types';
import { tiptapJsonToText } from '../../utils/tiptapToHtml';

export function WorldQuickRef({ onClose }: { onClose: () => void }) {
  const sections = useWorldStore((s) => s.sections);
  const entries = useWorldStore((s) => s.entries);
  const linkedSections = useWorldStore((s) => s.linkedSections);
  const linkedEntries = useWorldStore((s) => s.linkedEntries);

  const allSections: WorldSection[] = [...sections, ...linkedSections];
  const allEntries: WorldEntry[] = [...entries, ...linkedEntries];

  const [search, setSearch] = useState('');
  const [selectedEntry, setSelectedEntry] = useState<WorldEntry | null>(null);

  const filtered = allEntries.filter((e) =>
    !search ||
    e.title.toLowerCase().includes(search.toLowerCase()) ||
    e.tags.some((t) => t.toLowerCase().includes(search.toLowerCase()))
  );

  // Group entries by section, only show sections that have entries in filtered results
  const grouped = allSections
    .map((section) => ({
      section,
      entries: filtered.filter((e) => e.sectionId === section.id),
    }))
    .filter((g) => g.entries.length > 0);

  // If an entry is selected, show the WorldReferencePanel inline
  const selectedSection = selectedEntry
    ? allSections.find((s) => s.id === selectedEntry.sectionId)
    : undefined;

  if (selectedEntry) {
    return (
      <div className="w-72 shrink-0 flex flex-col h-full border-l border-slate-700/50 bg-slate-900/60">
        {/* Back button */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-700/50">
          <button
            onClick={() => setSelectedEntry(null)}
            className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 transition-colors"
          >
            ← Back
          </button>
          <span className="flex-1" />
          <button onClick={onClose} className="p-1 text-slate-600 hover:text-slate-300 transition-colors">
            <X size={13} />
          </button>
        </div>
        {/* Inline WorldReferencePanel content (without its own border/close) */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div>
            <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold mb-0.5">
              {selectedSection?.name ?? 'World Bible'}
            </p>
            <h3 className="text-sm font-semibold text-slate-100">{selectedEntry.title}</h3>
          </div>
          {selectedEntry.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {selectedEntry.tags.map((tag) => (
                <span key={tag} className="text-[10px] bg-slate-700 text-slate-400 px-1.5 py-0.5 rounded">#{tag}</span>
              ))}
            </div>
          )}
          {(() => {
            const text = tiptapJsonToText(selectedEntry.content);
            return text ? (
              <div>
                <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold mb-1.5">Notes</p>
                <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-wrap">{text}</p>
              </div>
            ) : (
              <p className="text-xs text-slate-600 italic">No notes written yet.</p>
            );
          })()}
          {selectedEntry.customFields.filter((f) => f.value).length > 0 && (
            <div>
              <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold mb-2">Details</p>
              <div className="space-y-2">
                {selectedEntry.customFields.filter((f) => f.value).map((field) => (
                  <div key={field.id}>
                    <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-0.5">{field.label}</p>
                    <p className="text-xs text-slate-300 leading-relaxed">{field.value}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="w-72 shrink-0 flex flex-col h-full border-l border-slate-700/50 bg-slate-900/60">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-slate-700/50">
        <BookOpen size={13} className="text-indigo-400 shrink-0" />
        <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex-1">
          World Reference
        </span>
        <button onClick={onClose} className="p-1 text-slate-600 hover:text-slate-300 transition-colors" title="Close">
          <X size={13} />
        </button>
      </div>

      {/* Search */}
      <div className="px-3 py-2 border-b border-slate-700/30">
        <div className="relative">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search entries..."
            className="w-full bg-slate-800/80 border border-slate-700/60 rounded-lg pl-7 pr-3 py-1.5
              text-xs text-slate-300 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-indigo-500/60"
          />
        </div>
      </div>

      {/* Entry list grouped by section */}
      <div className="flex-1 overflow-y-auto">
        {allEntries.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 px-4 text-center">
            <BookOpen size={28} className="text-slate-700" />
            <div>
              <p className="text-xs font-medium text-slate-500 mb-1">No world entries</p>
              <p className="text-[11px] text-slate-600 leading-relaxed">
                Link a world bible to this book, or add entries in the World Bible editor.
              </p>
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex items-center justify-center h-20 text-xs text-slate-600">
            No matches for "{search}"
          </div>
        ) : (
          grouped.map(({ section, entries: sectionEntries }) => (
            <div key={section.id}>
              <div className="px-3 py-1.5 sticky top-0 bg-slate-900/90 backdrop-blur-sm">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.12em]">
                  {section.name}
                </span>
              </div>
              {sectionEntries.map((entry) => {
                const preview = tiptapJsonToText(entry.content).slice(0, 60);
                return (
                  <button
                    key={entry.id}
                    onClick={() => setSelectedEntry(entry)}
                    className="w-full flex items-center gap-2 px-4 py-2.5 text-left
                      hover:bg-slate-800/60 transition-colors border-b border-slate-700/20 group"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-200 truncate font-medium">{entry.title}</p>
                      {preview && (
                        <p className="text-[11px] text-slate-600 truncate mt-0.5">{preview}</p>
                      )}
                      {entry.tags.length > 0 && (
                        <div className="flex gap-1 mt-1 flex-wrap">
                          {entry.tags.slice(0, 3).map((tag) => (
                            <span key={tag} className="text-[10px] text-indigo-400/60">#{tag}</span>
                          ))}
                        </div>
                      )}
                    </div>
                    <ChevronRight size={13} className="text-slate-700 group-hover:text-slate-500 shrink-0 transition-colors" />
                  </button>
                );
              })}
            </div>
          ))
        )}
      </div>

      {/* Footer hint */}
      {allEntries.length > 0 && (
        <div className="px-3 py-2 border-t border-slate-700/30">
          <p className="text-[10px] text-slate-600">
            Type @ in the editor to insert a reference
          </p>
        </div>
      )}
    </div>
  );
}
