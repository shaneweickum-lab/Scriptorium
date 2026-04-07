import {
  ChevronRight, ChevronDown, GripVertical,
  Plus, Pencil, Trash2, StickyNote,
  BookText, BookOpen, FileText,
} from 'lucide-react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { WritingNode, NodeType, HierarchyLabels, EnabledLevels } from '../../types';
import { getChildTypes, DEFAULT_ENABLED_LEVELS } from '../../types';
import { useWritingStore } from '../../store/writingStore';

const TYPE_ICONS: Record<NodeType, React.FC<{ size?: number; className?: string }>> = {
  part: BookOpen,
  chapter: BookText,
  scene: FileText,
  note: StickyNote,
};

interface Props {
  node: WritingNode;
  depth: number;
  isExpanded: boolean;
  onToggle: (id: string) => void;
  labels: HierarchyLabels;
  enabledLevels?: EnabledLevels;
  onAddChild: (parentId: string, type: NodeType) => void;
  onDelete: (node: WritingNode) => void;
  onRename: (node: WritingNode) => void;
}

export function TreeNode({
  node, depth, isExpanded, onToggle, labels, enabledLevels = DEFAULT_ENABLED_LEVELS,
  onAddChild, onDelete, onRename,
}: Props) {
  const activeNodeId = useWritingStore((s) => s.activeNodeId);
  const setActiveNode = useWritingStore((s) => s.setActiveNode);

  const {
    attributes, listeners, setNodeRef,
    transform, transition, isDragging,
  } = useSortable({ id: node.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const Icon = TYPE_ICONS[node.type] || FileText;
  const isActive = activeNodeId === node.id;

  const availableChildTypes = getChildTypes(node.type, enabledLevels);

  return (
    <div ref={setNodeRef} style={style} className="select-none">
      <div
        className={`group flex items-center gap-1 py-1.5 pr-2 rounded-lg cursor-pointer transition-all ${
          isActive ? 'bg-indigo-600/20 text-indigo-300' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
        }`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={() => setActiveNode(node.id)}
      >
        <div
          {...attributes}
          {...listeners}
          className="opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing shrink-0"
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical size={12} className="text-slate-600" />
        </div>

        <button
          onClick={(e) => { e.stopPropagation(); onToggle(node.id); }}
          className="shrink-0 text-slate-600 hover:text-slate-400 transition-colors"
        >
          {availableChildTypes.length > 0 ? (
            isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />
          ) : (
            <span className="w-3 inline-block" />
          )}
        </button>

        <Icon size={13} className="shrink-0" />
        <span className="text-xs flex-1 truncate">{node.title}</span>
        {node.wordCountCache > 0 && (
          <span className="text-[10px] text-slate-600 shrink-0">{node.wordCountCache}w</span>
        )}

        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 shrink-0" onClick={(e) => e.stopPropagation()}>
          {availableChildTypes.length > 0 && (
            <button
              onClick={() => onAddChild(node.id, availableChildTypes[0])}
              className="p-1 rounded hover:bg-slate-700 transition-colors"
              title={`Add ${labels[availableChildTypes[0]] || availableChildTypes[0]}`}
            >
              <Plus size={11} />
            </button>
          )}
          <button
            onClick={() => onRename(node)}
            className="p-1 rounded hover:bg-slate-700 transition-colors"
            title="Rename"
          >
            <Pencil size={11} />
          </button>
          <button
            onClick={() => onDelete(node)}
            className="p-1 rounded hover:bg-red-900/40 text-red-400 transition-colors"
            title="Delete"
          >
            <Trash2 size={11} />
          </button>
        </div>
      </div>
    </div>
  );
}
