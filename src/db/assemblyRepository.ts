import { db } from './database';
import type { Assembly, AssemblyItem } from '../types';
import { generateId } from '../utils/id';

export const assemblyRepository = {
  async getAssembly(): Promise<Assembly> {
    const assembly = await db.assemblies.get('main');
    if (assembly) return assembly;
    const newAssembly: Assembly = {
      id: 'main',
      name: 'Manuscript',
      items: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await db.assemblies.add(newAssembly);
    return newAssembly;
  },

  async updateAssembly(updates: Partial<Assembly>): Promise<void> {
    await db.assemblies.update('main', { ...updates, updatedAt: Date.now() });
  },

  async setItems(items: AssemblyItem[]): Promise<void> {
    await db.assemblies.update('main', { items, updatedAt: Date.now() });
  },

  async addNodeItem(nodeId: string): Promise<void> {
    const assembly = await assemblyRepository.getAssembly();
    const maxOrder = assembly.items.length > 0 ? Math.max(...assembly.items.map((i) => i.order)) : -1;
    const item: AssemblyItem = {
      id: generateId(),
      nodeId,
      type: 'node',
      order: maxOrder + 1,
    };
    await db.assemblies.update('main', {
      items: [...assembly.items, item],
      updatedAt: Date.now(),
    });
  },

  async addBreakItem(): Promise<void> {
    const assembly = await assemblyRepository.getAssembly();
    const maxOrder = assembly.items.length > 0 ? Math.max(...assembly.items.map((i) => i.order)) : -1;
    const item: AssemblyItem = {
      id: generateId(),
      nodeId: null,
      type: 'break',
      content: '* * *',
      order: maxOrder + 1,
    };
    await db.assemblies.update('main', {
      items: [...assembly.items, item],
      updatedAt: Date.now(),
    });
  },

  async removeItem(itemId: string): Promise<void> {
    const assembly = await assemblyRepository.getAssembly();
    await db.assemblies.update('main', {
      items: assembly.items.filter((i) => i.id !== itemId),
      updatedAt: Date.now(),
    });
  },
};
