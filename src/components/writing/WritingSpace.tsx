import { useUIStore } from '../../store/uiStore';
import { OutlineTree } from './OutlineTree';
import { NodeEditor } from './NodeEditor';
import { HierarchyConfig } from './HierarchyConfig';

export function WritingSpace() {
  const showHierarchyConfig = useUIStore((s) => s.showHierarchyConfig);
  const showMobileSidebar = useUIStore((s) => s.showMobileSidebar);
  const setShowMobileSidebar = useUIStore((s) => s.setShowMobileSidebar);

  return (
    <div className="relative flex h-full overflow-hidden">
      {/* Outline tree: fixed drawer on mobile, static panel on desktop */}
      <div className={`
        absolute inset-y-0 left-0 z-30 w-64
        bg-slate-900 border-r border-slate-700/50
        transform transition-transform duration-200
        ${showMobileSidebar ? 'translate-x-0' : '-translate-x-full'}
        md:relative md:w-56 md:translate-x-0 md:shrink-0 md:transform-none md:transition-none
      `}>
        <OutlineTree />
      </div>

      {/* Backdrop (mobile only) */}
      {showMobileSidebar && (
        <div
          className="fixed inset-0 z-20 bg-black/50 md:hidden"
          onClick={() => setShowMobileSidebar(false)}
        />
      )}

      {/* Editor */}
      <div className="flex-1 overflow-hidden bg-slate-900/10">
        <NodeEditor />
      </div>

      {showHierarchyConfig && <HierarchyConfig />}
    </div>
  );
}
