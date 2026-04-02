import { useState } from 'react';
import {
  DndContext, PointerSensor, useSensor, useSensors, closestCenter,
} from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import {
  SortableContext, verticalListSortingStrategy, useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Trash2, Plus, Minus } from 'lucide-react';
import { useAssemblyStore } from '../../store/assemblyStore';
import { useWritingStore } from '../../store/writingStore';
import type { AssemblyItem } from '../../types';
import { buildTree, flattenTree } from '../../utils/sortableTree';

function SortableItem({ item, nodeTitle, onRemove }: {
  item: AssemblyItem;
  nodeTitle: string;
  onRemove: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 };

  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-2 px-3 py-2 bg-slate-800 rounded-lg border border-slate-700/50 group">
      <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing text-slate-600 hover:text-slate-400">
        <GripVertical size={14} />
      </div>
      <div className="flex-1 min-w-0">
        {item.type === 'break' ? (
          <span className="text-slate-500 text-sm italic">— Section Break —</span>
        ) : item.type === 'frontmatter' ? (
          <span className="text-slate-400 text-sm">Front Matter: {item.customTitle || 'Untitled'}</span>
        ) : (
          <span className="text-sm text-slate-300 truncate">{nodeTitle}</span>
        )}
      </div>
      <button
        onClick={() => onRemove(item.id)}
        className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-900/40 text-red-400 transition-all"
        title="Remove"
      >
        <Trash2 size={12} />
      </button>
    </div>
  );
}

export function ManuscriptBuilder() {
  const assembly = useAssemblyStore((s) => s.assembly);
  const setItems = useAssemblyStore((s) => s.setItems);
  const addNodeItem = useAssemblyStore((s) => s.addNodeItem);
  const addBreakItem = useAssemblyStore((s) => s.addBreakItem);
  const removeItem = useAssemblyStore((s) => s.removeItem);
  const nodes = useWritingStore((s) => s.nodes);
  const projectMeta = useWritingStore((s) => s.projectMeta);

  const [showNodePicker, setShowNodePicker] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const labels = projectMeta?.hierarchyLabels || { part: 'Part', chapter: 'Chapter', scene: 'Scene', note: 'Note' };

  const items = [...(assembly?.items || [])].sort((a, b) => a.order - b.order);
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = items.findIndex((i) => i.id === active.id);
    const newIdx = items.findIndex((i) => i.id === over.id);
    if (oldIdx === -1 || newIdx === -1) return;
    const reordered = [...items];
    const [moved] = reordered.splice(oldIdx, 1);
    reordered.splice(newIdx, 0, moved);
    setItems(reordered.map((item, i) => ({ ...item, order: i })));
  };

  const tree = buildTree(nodes);
  const flatNodes = flattenTree(tree);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700/50">
        <h3 className="text-sm font-semibold text-slate-300">Manuscript Order</h3>
        <div className="flex items-center gap-2">
          <button
            onClick={addBreakItem}
            className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200 px-2 py-1.5 rounded-lg hover:bg-slate-700 transition-colors"
            title="Add section break"
          >
            <Minus size={12} />
            Break
          </button>
          <button
            onClick={() => setShowNodePicker(!showNodePicker)}
            className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 px-2 py-1.5 rounded-lg hover:bg-indigo-900/30 transition-colors"
          >
            <Plus size={12} />
            Add Content
          </button>
        </div>
      </div>

      {showNodePicker && (
        <div className="border-b border-slate-700/50 bg-slate-800/50 max-h-48 overflow-y-auto p-2">
          <p className="text-xs text-slate-500 px-2 mb-1">Select content to add:</p>
          {flatNodes.map((item) => {
            const alreadyAdded = items.some((i) => i.nodeId === item.id);
            return (
              <button
                key={item.id}
                disabled={alreadyAdded}
                onClick={() => { addNodeItem(item.id); setShowNodePicker(false); }}
                className={`w-full text-left flex items-center gap-2 px-2 py-1.5 rounded text-xs transition-colors ${
                  alreadyAdded
                    ? 'text-slate-600 cursor-not-allowed'
                    : 'text-slate-300 hover:bg-slate-700'
                }`}
                style={{ paddingLeft: `${item.depth * 12 + 8}px` }}
              >
                <span className="text-slate-500">{labels[item.type] || item.type}</span>
                <span className="truncate">{item.title}</span>
                {alreadyAdded && <span className="ml-auto text-slate-600">added</span>}
              </button>
            );
          })}
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-slate-600 text-sm gap-2">
            <p>No content added yet</p>
            <p className="text-xs">Click "Add Content" to build your manuscript</p>
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
              {items.map((item) => (
                <SortableItem
                  key={item.id}
                  item={item}
                  nodeTitle={item.nodeId ? (nodeMap.get(item.nodeId)?.title || 'Unknown') : ''}
                  onRemove={removeItem}
                />
              ))}
            </SortableContext>
          </DndContext>
        )}
      </div>
    </div>
  );
}
