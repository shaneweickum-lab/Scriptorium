import { useState, useMemo, useRef, useEffect } from 'react';
import { Search, X, FileText } from 'lucide-react';
import { useWritingStore } from '../../store/writingStore';
import { useLibraryStore } from '../../store/libraryStore';
import { tiptapJsonToText } from '../../utils/tiptapToHtml';

interface Props {
  onClose: () => void;
}

function highlight(text: string, query: string): React.ReactNode {
  if (!query) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-amber-100 text-amber-700 rounded-sm px-0.5">{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  );
}

function getSnippet(content: string, query: string, radius = 80): string {
  const text = tiptapJsonToText(content);
  if (!query) return text.slice(0, radius * 2);
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text.slice(0, radius * 2);
  const start = Math.max(0, idx - radius);
  const end = Math.min(text.length, idx + query.length + radius);
  return (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '');
}

export function GlobalSearch({ onClose }: Props) {
  const [query, setQuery] = useState('');
  const nodes = useWritingStore((s) => s.nodes);
  const setActiveNode = useWritingStore((s) => s.setActiveNode);
  const activeBook = useLibraryStore((s) => s.activeBook);
  const inputRef = useRef<HTMLInputElement>(null);
  const labels = activeBook?.hierarchyLabels ?? { part: 'Part', chapter: 'Chapter', scene: 'Scene', note: 'Note' };

  useEffect(() => { inputRef.current?.focus(); }, []);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return nodes.filter((n) => {
      const titleMatch = n.title.toLowerCase().includes(q);
      const contentMatch = tiptapJsonToText(n.content).toLowerCase().includes(q);
      return titleMatch || contentMatch;
    });
  }, [query, nodes]);

  const handleSelect = (id: string) => {
    setActiveNode(id);
    onClose();
  };

  return (
    <div className="flex flex-col h-full bg-white border-r border-slate-200">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-slate-200">
        <Search size={14} className="text-slate-400 shrink-0" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search all sections…"
          className="flex-1 bg-transparent text-sm text-slate-800 placeholder-slate-400 focus:outline-none"
        />
        <button onClick={onClose} className="p-1 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
          <X size={13} />
        </button>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto">
        {query.trim() === '' ? (
          <div className="flex flex-col items-center justify-center h-32 text-slate-400 text-xs text-center px-4">
            <Search size={20} className="mb-2 opacity-40" />
            Type to search across all sections
          </div>
        ) : results.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-slate-400 text-xs text-center px-4">
            <p>No matches for</p>
            <p className="text-slate-500 mt-1">"{query}"</p>
          </div>
        ) : (
          <div className="flex flex-col divide-y divide-slate-100">
            <p className="px-3 py-1.5 text-[10px] text-slate-400 uppercase tracking-wider">
              {results.length} result{results.length !== 1 ? 's' : ''}
            </p>
            {results.map((n) => {
              const snippet = getSnippet(n.content, query.trim());
              const typeLabel = labels[n.type] ?? n.type;
              return (
                <button
                  key={n.id}
                  onClick={() => handleSelect(n.id)}
                  className="flex flex-col items-start gap-1 px-3 py-2.5 text-left
                    hover:bg-slate-50 transition-colors group"
                >
                  <div className="flex items-center gap-1.5 w-full">
                    <FileText size={11} className="text-teal-500 shrink-0" />
                    <span className="text-[10px] text-teal-600 uppercase tracking-wider font-semibold shrink-0">{typeLabel}</span>
                    <span className="text-xs font-medium text-slate-700 group-hover:text-slate-900 truncate">
                      {highlight(n.title || 'Untitled', query.trim())}
                    </span>
                  </div>
                  {snippet && (
                    <p className="text-[11px] text-slate-500 leading-relaxed line-clamp-2 pl-5">
                      {highlight(snippet, query.trim())}
                    </p>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
