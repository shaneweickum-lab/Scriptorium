import { db } from './database';
import type { WritingNode, NodeType, ProjectMeta } from '../types';
import { DEFAULT_HIERARCHY_LABELS } from '../types';
import { generateId } from '../utils/id';
import { getNextOrder, getDescendantIds } from '../utils/sortableTree';

export const writingRepository = {
  async getAllNodes(): Promise<WritingNode[]> {
    return db.writingNodes.toArray();
  },

  async addNode(parentId: string | null, type: NodeType, title?: string): Promise<WritingNode> {
    const allNodes = await db.writingNodes.toArray();
    const order = getNextOrder(allNodes, parentId);
    const node: WritingNode = {
      id: generateId(),
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

  async reorderSiblings(parentId: string | null, orderedIds: string[]): Promise<void> {
    void parentId;
    await db.transaction('rw', db.writingNodes, async () => {
      for (let i = 0; i < orderedIds.length; i++) {
        await db.writingNodes.update(orderedIds[i], { order: i });
      }
    });
  },

  async getProjectMeta(): Promise<ProjectMeta> {
    const meta = await db.projectMeta.get('main');
    if (meta) return meta;
    const newMeta: ProjectMeta = {
      id: 'main',
      title: 'My Novel',
      author: '',
      hierarchyLabels: DEFAULT_HIERARCHY_LABELS,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await db.projectMeta.add(newMeta);
    return newMeta;
  },

  async updateProjectMeta(updates: Partial<ProjectMeta>): Promise<void> {
    await db.projectMeta.update('main', { ...updates, updatedAt: Date.now() });
  },
};
