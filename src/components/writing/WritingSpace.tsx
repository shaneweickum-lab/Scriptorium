import { useUIStore } from '../../store/uiStore';
import { OutlineTree } from './OutlineTree';
import { NodeEditor } from './NodeEditor';
import { HierarchyConfig } from './HierarchyConfig';

export function WritingSpace() {
  const showHierarchyConfig = useUIStore((s) => s.showHierarchyConfig);

  return (
    <div className="flex h-full">
      {/* Outline tree */}
      <div className="w-56 shrink-0 border-r border-slate-700/50 bg-slate-900/50">
        <OutlineTree />
      </div>
      {/* Editor */}
      <div className="flex-1 overflow-hidden bg-slate-900/10">
        <NodeEditor />
      </div>

      {showHierarchyConfig && <HierarchyConfig />}
    </div>
  );
}
