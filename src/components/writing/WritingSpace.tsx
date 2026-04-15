import { useEffect } from 'react';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import { useUIStore } from '../../store/uiStore';
import { OutlineTree } from './OutlineTree';
import { NodeEditor } from './NodeEditor';
import { HierarchyConfig } from './HierarchyConfig';
import { WorldQuickRef } from './WorldQuickRef';
import { GlobalSearch } from './GlobalSearch';

export function WritingSpace() {
  const showHierarchyConfig = useUIStore((s) => s.showHierarchyConfig);
  const showMobileSidebar = useUIStore((s) => s.showMobileSidebar);
  const setShowMobileSidebar = useUIStore((s) => s.setShowMobileSidebar);
  const showWorldRef = useUIStore((s) => s.showWorldRef);
  const setShowWorldRef = useUIStore((s) => s.setShowWorldRef);
  const showDistractFree = useUIStore((s) => s.showDistractFree);
  const setShowDistractFree = useUIStore((s) => s.setShowDistractFree);
  const showGlobalSearch = useUIStore((s) => s.showGlobalSearch);
  const setShowGlobalSearch = useUIStore((s) => s.setShowGlobalSearch);
  const showOutlinePanel = useUIStore((s) => s.showOutlinePanel);
  const setShowOutlinePanel = useUIStore((s) => s.setShowOutlinePanel);

  // Escape exits distract-free mode
  useEffect(() => {
    if (!showDistractFree) return;
    const handle = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowDistractFree(false);
    };
    document.addEventListener('keydown', handle);
    return () => document.removeEventListener('keydown', handle);
  }, [showDistractFree]);

  return (
    <>
      <div className="relative flex h-full overflow-hidden">

        {/* ── Outline / Search panel ──────────────────────────────────────── */}
        {/* Mobile: always rendered as an absolute drawer (slide in/out)      */}
        {/* Desktop: hidden via md:hidden when showOutlinePanel is false       */}
        <div className={`
          absolute inset-y-0 left-0 z-30 w-64 shrink-0
          bg-white border-r border-slate-200
          transform transition-transform duration-200
          ${showMobileSidebar ? 'translate-x-0' : '-translate-x-full'}
          md:relative md:w-56 md:translate-x-0 md:transform-none md:transition-none
          ${!showOutlinePanel ? 'md:hidden' : ''}
        `}>
          {/* Desktop collapse button — floats top-right of panel */}
          <button
            onClick={() => setShowOutlinePanel(false)}
            className="hidden md:flex absolute top-2 right-2 z-10 p-1 rounded
              text-slate-300 hover:text-slate-600 hover:bg-slate-100 transition-all"
            title="Collapse outline"
          >
            <ChevronLeft size={14} />
          </button>

          {showGlobalSearch
            ? <GlobalSearch onClose={() => setShowGlobalSearch(false)} />
            : <OutlineTree onGlobalSearch={() => setShowGlobalSearch(true)} />
          }
        </div>

        {/* Desktop expand strip — shown only when outline is collapsed */}
        {!showOutlinePanel && (
          <button
            onClick={() => setShowOutlinePanel(true)}
            className="hidden md:flex flex-col items-center justify-start pt-3 w-7 shrink-0
              bg-white border-r border-slate-200
              text-slate-300 hover:text-violet-500 hover:bg-violet-50
              transition-all"
            title="Expand outline"
          >
            <ChevronRight size={14} />
          </button>
        )}

        {/* Mobile backdrop */}
        {showMobileSidebar && (
          <div
            className="fixed inset-0 z-20 bg-black/50 md:hidden"
            onClick={() => setShowMobileSidebar(false)}
          />
        )}

        {/* Editor */}
        <div className="flex-1 overflow-hidden bg-white min-w-0">
          <NodeEditor />
        </div>

        {/* World quick-ref panel */}
        {showWorldRef && (
          <WorldQuickRef onClose={() => setShowWorldRef(false)} />
        )}

        {showHierarchyConfig && <HierarchyConfig />}
      </div>

      {/* Distraction-free overlay */}
      {showDistractFree && (
        <div className="fixed inset-0 z-[90] bg-white flex flex-col">
          {/* Minimal exit bar — fades on hover */}
          <div className="absolute top-0 left-0 right-0 flex justify-end px-4 py-2 opacity-0 hover:opacity-100 transition-opacity z-10">
            <button
              onClick={() => setShowDistractFree(false)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-slate-600 hover:bg-slate-100 border border-slate-200 transition-colors"
              title="Exit distraction-free (Esc)"
            >
              <X size={13} />
              Exit focus
            </button>
          </div>
          <div className="flex-1 overflow-hidden">
            <NodeEditor distractFree />
          </div>
        </div>
      )}
    </>
  );
}
