import { useState } from 'react';
import {
  DndContext, PointerSensor, useSensor, useSensors,
  closestCenter,
} from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Plus, Settings2 } from 'lucide-react';
import { useWritingStore } from '../../store/writingStore';
import { useUIStore } from '../../store/uiStore';
import { useLibraryStore } from '../../store/libraryStore';
import { TreeNode } from './TreeNode';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { Modal } from '../common/Modal';
import { Input } from '../common/Input';
import { Button } from '../common/Button';
import { buildTree } from '../../utils/sortableTree';
import type { WritingNode, NodeType } from '../../types';

export function OutlineTree() {
  const nodes = useWritingStore((s) => s.nodes);
  const addNode = useWritingStore((s) => s.addNode);
  const deleteNode = useWritingStore((s) => s.deleteNode);
  const reorderSiblings = useWritingStore((s) => s.reorderSiblings);
  const updateNode = useWritingStore((s) => s.updateNode);
  const setShowHierarchyConfig = useUIStore((s) => s.setShowHierarchyConfig);
  const activeBook = useLibraryStore((s) => s.activeBook);

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<WritingNode | null>(null);
  const [renameTarget, setRenameTarget] = useState<WritingNode | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const labels = activeBook?.hierarchyLabels || { part: 'Part', chapter: 'Chapter', scene: 'Scene', note: 'Note' };
  const bookId = activeBook?.id ?? '';

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleAddChild = (parentId: string, type: NodeType) => {
    addNode(bookId, parentId, type);
    setExpanded((prev) => new Set([...prev, parentId]));
  };

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeNode = nodes.find((n) => n.id === active.id);
    const overNode = nodes.find((n) => n.id === over.id);
    if (!activeNode || !overNode || activeNode.parentId !== overNode.parentId) return;

    const siblings = nodes
      .filter((n) => n.parentId === activeNode.parentId)
      .sort((a, b) => a.order - b.order);
    const oldIdx = siblings.findIndex((n) => n.id === active.id);
    const newIdx = siblings.findIndex((n) => n.id === over.id);
    if (oldIdx === -1 || newIdx === -1) return;

    const reordered = [...siblings];
    const [moved] = reordered.splice(oldIdx, 1);
    reordered.splice(newIdx, 0, moved);
    reorderSiblings(activeNode.parentId, reordered.map((n) => n.id));
  };

  // Build tree and flatten for rendering (respecting expand state)
  const tree = buildTree(nodes);
  const flatItems: { node: WritingNode; depth: number }[] = [];
  function traverse(items: ReturnType<typeof buildTree>) {
    for (const item of items) {
      flatItems.push({ node: item, depth: item.depth });
      if (expanded.has(item.id)) traverse(item.children);
    }
  }
  traverse(tree);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-700/50">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Outline</span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowHierarchyConfig(true)}
            title="Configure hierarchy labels"
            className="p-1 rounded text-slate-600 hover:text-slate-400 hover:bg-slate-800 transition-colors"
          >
            <Settings2 size={14} />
          </button>
          <button
            onClick={() => addNode(bookId, null, 'part')}
            title={`Add ${labels.part}`}
            className="p-1 rounded text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-colors"
          >
            <Plus size={14} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-1 py-1">
        {nodes.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 gap-2 text-slate-600 text-xs">
            <p>No content yet</p>
            <button
              onClick={() => addNode(bookId, null, 'part')}
              className="text-indigo-400 hover:text-indigo-300 transition-colors"
            >
              + Add {labels.part}
            </button>
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext
              items={flatItems.map((i) => i.node.id)}
              strategy={verticalListSortingStrategy}
            >
              {flatItems.map(({ node, depth }) => (
                <TreeNode
                  key={node.id}
                  node={node}
                  depth={depth}
                  isExpanded={expanded.has(node.id)}
                  onToggle={toggleExpand}
                  labels={labels}
                  onAddChild={handleAddChild}
                  onDelete={(n) => setDeleteTarget(n)}
                  onRename={(n) => { setRenameTarget(n); setRenameValue(n.title); }}
                />
              ))}
            </SortableContext>
          </DndContext>
        )}
      </div>

      {deleteTarget && (
        <ConfirmDialog
          title="Delete Node"
          message={`Delete "${deleteTarget.title}" and all its children? This cannot be undone.`}
          confirmLabel="Delete"
          danger
          onConfirm={() => deleteNode(deleteTarget.id)}
          onClose={() => setDeleteTarget(null)}
        />
      )}
      {renameTarget && (
        <Modal title="Rename" onClose={() => setRenameTarget(null)} size="sm">
          <div className="flex flex-col gap-4">
            <Input
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  updateNode(renameTarget.id, { title: renameValue.trim() || renameTarget.title });
                  setRenameTarget(null);
                }
                if (e.key === 'Escape') setRenameTarget(null);
              }}
            />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setRenameTarget(null)}>Cancel</Button>
              <Button
                variant="primary"
                onClick={() => {
                  updateNode(renameTarget.id, { title: renameValue.trim() || renameTarget.title });
                  setRenameTarget(null);
                }}
              >
                Rename
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
