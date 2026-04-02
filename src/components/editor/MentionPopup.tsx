import { forwardRef, useImperativeHandle, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { WorldEntry, WorldSection } from '../../types';

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

export const MentionPopup = forwardRef<MentionPopupHandle, Props>(
  function MentionPopup({ state, sections, onSelectEntry }, ref) {
    const [localIndex, setLocalIndex] = useState(0);

    useEffect(() => {
      setLocalIndex(state.selectedIndex);
    }, [state.selectedIndex, state.items]);

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
          if (entry && state.command) {
            onSelectEntry(entry, state.command);
          }
          return true;
        }
        if (event.key === 'Escape') {
          return false;
        }
        return false;
      },
    }), [state, localIndex, onSelectEntry]);

    if (!state.active || state.items.length === 0) return null;

    return createPortal(
      <div
        style={{ top: state.position.top, left: state.position.left }}
        className="fixed z-50 w-72 bg-slate-800 border border-slate-600 rounded-xl shadow-2xl overflow-hidden"
      >
        <div className="px-3 py-1.5 border-b border-slate-700/60">
          <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">
            World Bible
          </span>
        </div>
        <div className="max-h-56 overflow-y-auto py-1">
          {state.items.map((entry, i) => {
            const section = sections.find((s) => s.id === entry.sectionId);
            return (
              <button
                key={entry.id}
                className={`w-full flex flex-col px-3 py-2 text-left transition-colors ${
                  i === localIndex
                    ? 'bg-indigo-600/30 text-slate-100'
                    : 'text-slate-300 hover:bg-slate-700/60'
                }`}
                onMouseEnter={() => setLocalIndex(i)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  if (state.command) onSelectEntry(entry, state.command);
                }}
              >
                <span className="text-sm font-medium truncate">@{entry.title}</span>
                <div className="flex items-center gap-1.5 mt-0.5">
                  {section && (
                    <span className="text-[10px] text-slate-500 bg-slate-700/60 px-1.5 py-0.5 rounded">
                      {section.name}
                    </span>
                  )}
                  {entry.tags.slice(0, 2).map((tag) => (
                    <span key={tag} className="text-[10px] text-indigo-400/80">
                      #{tag}
                    </span>
                  ))}
                </div>
              </button>
            );
          })}
        </div>
      </div>,
      document.body
    );
  }
);
