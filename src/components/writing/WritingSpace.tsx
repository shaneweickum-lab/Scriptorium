import { useUIStore } from '../../store/uiStore';
import { OutlineTree } from './OutlineTree';
import { NodeEditor } from './NodeEditor';
import { HierarchyConfig } from './HierarchyConfig';
import { WorldQuickRef } from './WorldQuickRef';

export function WritingSpace() {
  const showHierarchyConfig = useUIStore((s) => s.showHierarchyConfig);
  const showMobileSidebar = useUIStore((s) => s.showMobileSidebar);
  const setShowMobileSidebar = useUIStore((s) => s.setShowMobileSidebar);
  const showWorldRef = useUIStore((s) => s.showWorldRef);
  const setShowWorldRef = useUIStore((s) => s.setShowWorldRef);

  return (
    <div className="relative flex h-full overflow-hidden">
      {/* Outline tree: drawer on mobile, static on desktop */}
      <div className={`
        absolute inset-y-0 left-0 z-30 w-64 shrink-0
        bg-slate-900 border-r border-slate-700/50
        transform transition-transform duration-200
        ${showMobileSidebar ? 'translate-x-0' : '-translate-x-full'}
        md:relative md:w-56 md:translate-x-0 md:transform-none md:transition-none
      `}>
        <OutlineTree />
      </div>

      {/* Mobile backdrop */}
      {showMobileSidebar && (
        <div
          className="fixed inset-0 z-20 bg-black/50 md:hidden"
          onClick={() => setShowMobileSidebar(false)}
        />
      )}

      {/* Editor */}
      <div className="flex-1 overflow-hidden bg-slate-900/10 min-w-0">
        <NodeEditor />
      </div>

      {/* World quick-ref panel */}
      {showWorldRef && (
        <WorldQuickRef onClose={() => setShowWorldRef(false)} />
      )}

      {showHierarchyConfig && <HierarchyConfig />}
    </div>
  );
}
