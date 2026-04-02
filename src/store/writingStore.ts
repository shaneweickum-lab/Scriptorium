import { create } from 'zustand';
import type { WritingNode, NodeType } from '../types';
import { writingRepository } from '../db/writingRepository';
import { tiptapJsonToText, countWords } from '../utils/tiptapToHtml';

interface WritingState {
  nodes: WritingNode[];
  activeNodeId: string | null;

  loadFromDB: (bookId: string) => Promise<void>;
  addNode: (bookId: string, parentId: string | null, type: NodeType, title?: string) => Promise<WritingNode>;
  updateNode: (id: string, updates: Partial<WritingNode>) => Promise<void>;
  deleteNode: (id: string) => Promise<void>;
  moveNode: (id: string, newParentId: string | null, newOrder: number) => Promise<void>;
  reorderSiblings: (parentId: string | null, orderedIds: string[]) => Promise<void>;
  setActiveNode: (id: string | null) => void;
}

export const useWritingStore = create<WritingState>((set, get) => ({
  nodes: [],
  activeNodeId: null,

  loadFromDB: async (bookId) => {
    const nodes = await writingRepository.getNodesByBook(bookId);
    set({ nodes, activeNodeId: null });
  },

  addNode: async (bookId, parentId, type, title) => {
    const node = await writingRepository.addNode(bookId, parentId, type, title);
    set((state) => ({ nodes: [...state.nodes, node], activeNodeId: node.id }));
    return node;
  },

  updateNode: async (id, updates) => {
    const extra: Partial<WritingNode> = {};
    if (updates.content !== undefined) {
      const text = tiptapJsonToText(updates.content);
      extra.wordCountCache = countWords(text);
    }
    await writingRepository.updateNode(id, { ...updates, ...extra });
    set((state) => ({
      nodes: state.nodes.map((n) =>
        n.id === id ? { ...n, ...updates, ...extra, updatedAt: Date.now() } : n
      ),
    }));
  },

  deleteNode: async (id) => {
    const { nodes } = get();
    const toDelete = new Set<string>([id]);
    function collectDescendants(parentId: string) {
      for (const n of nodes) {
        if (n.parentId === parentId) {
          toDelete.add(n.id);
          collectDescendants(n.id);
        }
      }
    }
    collectDescendants(id);
    await writingRepository.deleteNode(id);
    set((state) => ({
      nodes: state.nodes.filter((n) => !toDelete.has(n.id)),
      activeNodeId: toDelete.has(state.activeNodeId ?? '') ? null : state.activeNodeId,
    }));
  },

  moveNode: async (id, newParentId, newOrder) => {
    await writingRepository.moveNode(id, newParentId, newOrder);
    set((state) => ({
      nodes: state.nodes.map((n) =>
        n.id === id ? { ...n, parentId: newParentId, order: newOrder } : n
      ),
    }));
  },

  reorderSiblings: async (_parentId, orderedIds) => {
    await writingRepository.reorderSiblings(orderedIds);
    const orderMap = new Map(orderedIds.map((id, i) => [id, i]));
    set((state) => ({
      nodes: state.nodes.map((n) =>
        orderMap.has(n.id) ? { ...n, order: orderMap.get(n.id)! } : n
      ),
    }));
  },

  setActiveNode: (id) => set({ activeNodeId: id }),
}));
