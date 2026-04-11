import { useEffect } from 'react';
import { X } from 'lucide-react';
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
        {/* Outline tree / Global search: drawer on mobile, static on desktop */}
        <div className={`
          absolute inset-y-0 left-0 z-30 w-64 shrink-0
          bg-white border-r border-slate-200
          transform transition-transform duration-200
          ${showMobileSidebar ? 'translate-x-0' : '-translate-x-full'}
          md:relative md:w-56 md:translate-x-0 md:transform-none md:transition-none
        `}>
          {showGlobalSearch
            ? <GlobalSearch onClose={() => setShowGlobalSearch(false)} />
            : <OutlineTree onGlobalSearch={() => setShowGlobalSearch(true)} />
          }
        </div>

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
        <div className="fixed inset-0 z-[90] bg-[#07080f] flex flex-col">
          {/* Minimal exit bar — fades on hover */}
          <div className="absolute top-0 left-0 right-0 flex justify-end px-4 py-2 opacity-0 hover:opacity-100 transition-opacity z-10">
            <button
              onClick={() => setShowDistractFree(false)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-slate-500 hover:text-slate-200 hover:bg-slate-800 transition-colors"
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
