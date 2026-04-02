import { db } from './database';
import type { Assembly, AssemblyItem } from '../types';
import { generateId } from '../utils/id';

export const assemblyRepository = {
  async getAssembly(bookId: string): Promise<Assembly> {
    const assembly = await db.assemblies.get(bookId);
    if (assembly) return assembly;
    const newAssembly: Assembly = {
      id: bookId,
      bookId,
      name: 'Manuscript',
      items: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await db.assemblies.add(newAssembly);
    return newAssembly;
  },

  async updateAssembly(bookId: string, updates: Partial<Assembly>): Promise<void> {
    await db.assemblies.update(bookId, { ...updates, updatedAt: Date.now() });
  },

  async setItems(bookId: string, items: AssemblyItem[]): Promise<void> {
    await db.assemblies.update(bookId, { items, updatedAt: Date.now() });
  },

  async addNodeItem(bookId: string, nodeId: string): Promise<void> {
    const assembly = await assemblyRepository.getAssembly(bookId);
    const maxOrder = assembly.items.length > 0 ? Math.max(...assembly.items.map((i) => i.order)) : -1;
    const item: AssemblyItem = {
      id: generateId(),
      nodeId,
      type: 'node',
      order: maxOrder + 1,
    };
    await db.assemblies.update(bookId, {
      items: [...assembly.items, item],
      updatedAt: Date.now(),
    });
  },

  async addBreakItem(bookId: string): Promise<void> {
    const assembly = await assemblyRepository.getAssembly(bookId);
    const maxOrder = assembly.items.length > 0 ? Math.max(...assembly.items.map((i) => i.order)) : -1;
    const item: AssemblyItem = {
      id: generateId(),
      nodeId: null,
      type: 'break',
      content: '* * *',
      order: maxOrder + 1,
    };
    await db.assemblies.update(bookId, {
      items: [...assembly.items, item],
      updatedAt: Date.now(),
    });
  },

  async removeItem(bookId: string, itemId: string): Promise<void> {
    const assembly = await assemblyRepository.getAssembly(bookId);
    await db.assemblies.update(bookId, {
      items: assembly.items.filter((i) => i.id !== itemId),
      updatedAt: Date.now(),
    });
  },
};
