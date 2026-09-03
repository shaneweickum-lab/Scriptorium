import { db } from './database';
import type { WritingNode, NodeType } from '../types';
import { generateId } from '../utils/id';
import { getNextOrder, getDescendantIds } from '../utils/sortableTree';

export const writingRepository = {
  async getNodesByBook(bookId: string): Promise<WritingNode[]> {
    return db.writingNodes.where('bookId').equals(bookId).toArray();
  },

  async addNode(bookId: string, parentId: string | null, type: NodeType, title?: string): Promise<WritingNode> {
    // Read-then-write inside one transaction so two rapid adds (e.g. fast
    // double-clicks on "Add Chapter") can't both compute the same order.
    return db.transaction('rw', db.writingNodes, async () => {
      const allNodes = await db.writingNodes.where('bookId').equals(bookId).toArray();
      const order = getNextOrder(allNodes, parentId);
      const node: WritingNode = {
        id: generateId(),
        bookId,
        parentId,
        type,
        title: title || `New ${type.charAt(0).toUpperCase() + type.slice(1)}`,
        content: '',
        order,
        synopsis: '',
        wordCountCache: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      await db.writingNodes.add(node);
      return node;
    });
  },

  async updateNode(id: string, updates: Partial<WritingNode>): Promise<void> {
    await db.writingNodes.update(id, { ...updates, updatedAt: Date.now() });
  },

  async deleteNode(id: string): Promise<void> {
    const allNodes = await db.writingNodes.toArray();
    const toDelete = [id, ...getDescendantIds(allNodes, id)];
    await db.writingNodes.bulkDelete(toDelete);
  },

  async moveNode(id: string, newParentId: string | null, newOrder: number): Promise<void> {
    await db.writingNodes.update(id, { parentId: newParentId, order: newOrder, updatedAt: Date.now() });
  },

  async reorderSiblings(orderedIds: string[]): Promise<void> {
    await db.transaction('rw', db.writingNodes, async () => {
      for (let i = 0; i < orderedIds.length; i++) {
        await db.writingNodes.update(orderedIds[i], { order: i });
      }
    });
  },
};
