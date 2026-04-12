import { useEffect, useRef, useState } from 'react';
import { X, ChevronUp, ChevronDown, Replace, CaseSensitive } from 'lucide-react';
import type { Editor } from '@tiptap/react';
import { searchPluginKey, scrollToMatch } from './SearchAndReplace';

interface Props {
  editor: Editor;
  onClose: () => void;
}

export function FindReplacePanel({ editor, onClose }: Props) {
  const [searchTerm, setSearchTerm] = useState('');
  const [replaceTerm, setReplaceTerm] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [showReplace, setShowReplace] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Focus search input on mount
  useEffect(() => {
    searchInputRef.current?.focus();
    searchInputRef.current?.select();
  }, []);

  // Sync search term to plugin state
  useEffect(() => {
    if (!editor) return;
    const { state, dispatch } = editor.view;
    const tr = state.tr.setMeta(searchPluginKey, {
      searchTerm,
      caseSensitive,
      currentIndex: 0,
    });
    dispatch(tr);
  }, [searchTerm, caseSensitive, editor]);

  // Clear highlights on unmount
  useEffect(() => {
    return () => {
      if (!editor || editor.isDestroyed) return;
      const { state, dispatch } = editor.view;
      const tr = state.tr.setMeta(searchPluginKey, {
        searchTerm: '',
        caseSensitive: false,
        currentIndex: 0,
      });
      dispatch(tr);
    };
  }, [editor]);

  const getPluginState = () => searchPluginKey.getState(editor.view.state);

  const navigate = (direction: 'next' | 'prev') => {
    const ps = getPluginState();
    if (!ps || ps.results.length === 0) return;

    const total = ps.results.length;
    const newIndex =
      direction === 'next'
        ? (ps.currentIndex + 1) % total
        : (ps.currentIndex - 1 + total) % total;

    const { state, dispatch } = editor.view;
    const tr = state.tr.setMeta(searchPluginKey, {
      searchTerm: ps.searchTerm,
      caseSensitive: ps.caseSensitive,
      currentIndex: newIndex,
    });
    dispatch(tr);

    const updated = searchPluginKey.getState(editor.view.state);
    if (updated && updated.results[newIndex]) {
      scrollToMatch(editor.view, updated.results[newIndex]);
    }
  };

  const handleReplace = () => {
    const ps = getPluginState();
    if (!ps || ps.results.length === 0) return;
    const match = ps.results[ps.currentIndex];
    if (!match) return;
    editor.view.dispatch(
      editor.view.state.tr.insertText(replaceTerm, match.from, match.to)
    );
    navigate('next');
  };

  const handleReplaceAll = () => {
    const ps = getPluginState();
    if (!ps || ps.results.length === 0) return;
    const { tr } = editor.view.state;
    const sorted = [...ps.results].sort((a, b) => b.from - a.from);
    for (const match of sorted) {
      tr.insertText(replaceTerm, match.from, match.to);
    }
    editor.view.dispatch(tr);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      navigate(e.shiftKey ? 'prev' : 'next');
    }
  };

  const ps = getPluginState();
  const total = ps?.results.length ?? 0;
  const currentIndex = ps?.currentIndex ?? 0;
  const matchLabel =
    total === 0
      ? searchTerm ? 'No results' : ''
      : `${currentIndex + 1} of ${total}`;

  return (
    <div
      className="absolute top-0 right-0 z-50 bg-white border border-slate-200 rounded-bl-xl shadow-xl p-2"
      style={{ minWidth: '300px' }}
      onKeyDown={handleKeyDown}
    >
      {/* Search row */}
      <div className="flex items-center gap-1">
        <div className="relative flex-1">
          <input
            ref={searchInputRef}
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Find..."
            className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-sm text-slate-800
              placeholder-slate-400 focus:outline-none focus:border-violet-400"
          />
          {matchLabel && (
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-400 pointer-events-none">
              {matchLabel}
            </span>
          )}
        </div>

        {/* Case sensitive toggle */}
        <button
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setCaseSensitive((v) => !v)}
          title="Case sensitive"
          className={`p-1.5 rounded transition-colors ${
            caseSensitive
              ? 'text-white'
              : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
          }`}
          style={caseSensitive ? { background: 'linear-gradient(135deg, #7c3aed, #0d9488)' } : undefined}
        >
          <CaseSensitive size={14} />
        </button>

        {/* Prev / Next */}
        <button
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => navigate('prev')}
          disabled={total === 0}
          title="Previous match (Shift+Enter)"
          className="p-1.5 rounded text-slate-500 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-30 transition-colors"
        >
          <ChevronUp size={14} />
        </button>
        <button
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => navigate('next')}
          disabled={total === 0}
          title="Next match (Enter)"
          className="p-1.5 rounded text-slate-500 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-30 transition-colors"
        >
          <ChevronDown size={14} />
        </button>

        {/* Toggle replace */}
        <button
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setShowReplace((v) => !v)}
          title="Toggle replace"
          className={`p-1.5 rounded transition-colors ${
            showReplace
              ? 'bg-slate-100 text-slate-700'
              : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
          }`}
        >
          <Replace size={14} />
        </button>

        {/* Close */}
        <button
          onMouseDown={(e) => e.preventDefault()}
          onClick={onClose}
          title="Close (Escape)"
          className="p-1.5 rounded text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors"
        >
          <X size={14} />
        </button>
      </div>

      {/* Replace row */}
      {showReplace && (
        <div className="flex items-center gap-1 mt-1.5">
          <input
            type="text"
            value={replaceTerm}
            onChange={(e) => setReplaceTerm(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Replace with..."
            className="flex-1 bg-white border border-slate-200 rounded-lg px-2 py-1 text-sm text-slate-800
              placeholder-slate-400 focus:outline-none focus:border-violet-400"
          />
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={handleReplace}
            disabled={total === 0}
            title="Replace current"
            className="px-2.5 py-1 rounded-lg text-xs text-white font-medium
              disabled:opacity-30 transition-opacity hover:opacity-90 whitespace-nowrap"
            style={{ background: 'linear-gradient(135deg, #7c3aed, #0d9488)' }}
          >
            Replace
          </button>
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={handleReplaceAll}
            disabled={total === 0}
            title="Replace all"
            className="px-2.5 py-1 rounded-lg text-xs bg-slate-100 hover:bg-slate-200 text-slate-700
              disabled:opacity-30 transition-colors whitespace-nowrap"
          >
            All
          </button>
        </div>
      )}
    </div>
  );
}
