import { forwardRef, useImperativeHandle, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Tag } from 'lucide-react';
import type { WorldEntry, WorldSection } from '../../types';
import { tiptapJsonToText } from '../../utils/tiptapToHtml';

export interface MentionSuggestionState {
  active: boolean;
  items: WorldEntry[];
  selectedIndex: number;
  position: { top: number; left: number };
  command: ((props: { id: string; label: string }) => void) | null;
}

export const INITIAL_MENTION_STATE: MentionSuggestionState = {
  active: false,
  items: [],
  selectedIndex: 0,
  position: { top: 0, left: 0 },
  command: null,
};

interface Props {
  state: MentionSuggestionState;
  sections: WorldSection[];
  onSelectEntry: (entry: WorldEntry, command: (props: { id: string; label: string }) => void) => void;
}

export interface MentionPopupHandle {
  onKeyDown: (event: KeyboardEvent) => boolean;
}

function EntryDetail({ entry, section }: { entry: WorldEntry; section: WorldSection | undefined }) {
  const notes = tiptapJsonToText(entry.content);
  return (
    <div className="flex flex-col h-full overflow-y-auto p-4 gap-3">
      {/* Title + section */}
      <div>
        <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold mb-0.5">
          {section?.name ?? 'World Bible'}
        </p>
        <h3 className="text-base font-bold text-slate-100 leading-snug">@{entry.title}</h3>
      </div>

      {/* Tags */}
      {entry.tags.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <Tag size={10} className="text-slate-500 shrink-0" />
          {entry.tags.map((tag) => (
            <span key={tag} className="text-[10px] bg-slate-700 text-slate-400 px-1.5 py-0.5 rounded">
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Notes / content */}
      {notes ? (
        <div>
          <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold mb-1">Notes</p>
          <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-wrap line-clamp-[12]">
            {notes}
          </p>
        </div>
      ) : (
        <p className="text-xs text-slate-600 italic">No notes written yet.</p>
      )}

      {/* Custom fields */}
      {entry.customFields.length > 0 && (
        <div>
          <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold mb-2">Details</p>
          <div className="space-y-2">
            {entry.customFields.map((field) => (
              field.value ? (
                <div key={field.id}>
                  <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-0.5">{field.label}</p>
                  <p className="text-xs text-slate-300 leading-relaxed">{field.value}</p>
                </div>
              ) : null
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export const MentionPopup = forwardRef<MentionPopupHandle, Props>(
  function MentionPopup({ state, sections, onSelectEntry }, ref) {
    const [localIndex, setLocalIndex] = useState(0);

    useEffect(() => {
      setLocalIndex(0);
    }, [state.items]);

    useImperativeHandle(ref, () => ({
      onKeyDown(event: KeyboardEvent): boolean {
        if (!state.active || state.items.length === 0) return false;
        if (event.key === 'ArrowDown') {
          setLocalIndex((i) => (i + 1) % state.items.length);
          return true;
        }
        if (event.key === 'ArrowUp') {
          setLocalIndex((i) => (i - 1 + state.items.length) % state.items.length);
          return true;
        }
        if (event.key === 'Enter' || event.key === 'Tab') {
          const entry = state.items[localIndex];
          if (entry && state.command) onSelectEntry(entry, state.command);
          return true;
        }
        return false;
      },
    }), [state, localIndex, onSelectEntry]);

    if (!state.active || state.items.length === 0) return null;

    const selectedEntry = state.items[localIndex];
    const selectedSection = selectedEntry
      ? sections.find((s) => s.id === selectedEntry.sectionId)
      : undefined;

    // Keep popup inside viewport horizontally
    const popupWidth = 580;
    const leftPos = Math.min(
      state.position.left,
      Math.max(0, (typeof window !== 'undefined' ? window.innerWidth : 1200) - popupWidth - 12)
    );

    return createPortal(
      <div
        style={{ top: state.position.top, left: leftPos, width: popupWidth }}
        className="fixed z-50 bg-slate-800 border border-slate-600/80 rounded-xl shadow-2xl overflow-hidden flex"
      >
        {/* Left: entry list */}
        <div className="w-52 shrink-0 border-r border-slate-700/60 flex flex-col">
          <div className="px-3 py-2 border-b border-slate-700/60">
            <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">
              World Bible
            </span>
          </div>
          <div className="overflow-y-auto max-h-80 py-1">
            {state.items.map((entry, i) => {
              const section = sections.find((s) => s.id === entry.sectionId);
              return (
                <button
                  key={entry.id}
                  className={`w-full flex flex-col px-3 py-2 text-left transition-colors ${
                    i === localIndex
                      ? 'bg-indigo-600/30 text-slate-100'
                      : 'text-slate-300 hover:bg-slate-700/50'
                  }`}
                  onMouseEnter={() => setLocalIndex(i)}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    if (state.command) onSelectEntry(entry, state.command);
                  }}
                >
                  <span className="text-sm font-medium truncate">@{entry.title}</span>
                  <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                    {section && (
                      <span className="text-[10px] text-slate-500 bg-slate-700/60 px-1.5 py-0.5 rounded">
                        {section.name}
                      </span>
                    )}
                    {entry.tags.slice(0, 2).map((tag) => (
                      <span key={tag} className="text-[10px] text-indigo-400/70">#{tag}</span>
                    ))}
                  </div>
                </button>
              );
            })}
          </div>
          <div className="px-3 py-1.5 border-t border-slate-700/40">
            <p className="text-[10px] text-slate-600">↑↓ navigate · Enter to insert</p>
          </div>
        </div>

        {/* Right: full entry detail */}
        <div className="flex-1 max-h-80 overflow-hidden">
          {selectedEntry ? (
            <EntryDetail entry={selectedEntry} section={selectedSection} />
          ) : (
            <div className="flex items-center justify-center h-full text-slate-600 text-xs">
              Select an entry
            </div>
          )}
        </div>
      </div>,
      document.body
    );
  }
);
