import { create } from 'zustand';
import type { Assembly, AssemblyItem } from '../types';
import { assemblyRepository } from '../db/assemblyRepository';

interface AssemblyState {
  assembly: Assembly | null;
  loadFromDB: () => Promise<void>;
  setItems: (items: AssemblyItem[]) => Promise<void>;
  addNodeItem: (nodeId: string) => Promise<void>;
  addBreakItem: () => Promise<void>;
  removeItem: (itemId: string) => Promise<void>;
  updateAssemblyName: (name: string) => Promise<void>;
}

export const useAssemblyStore = create<AssemblyState>((set) => ({
  assembly: null,

  loadFromDB: async () => {
    const assembly = await assemblyRepository.getAssembly();
    set({ assembly });
  },

  setItems: async (items) => {
    await assemblyRepository.setItems(items);
    set((state) => ({
      assembly: state.assembly ? { ...state.assembly, items, updatedAt: Date.now() } : null,
    }));
  },

  addNodeItem: async (nodeId) => {
    await assemblyRepository.addNodeItem(nodeId);
    const assembly = await assemblyRepository.getAssembly();
    set({ assembly });
  },

  addBreakItem: async () => {
    await assemblyRepository.addBreakItem();
    const assembly = await assemblyRepository.getAssembly();
    set({ assembly });
  },

  removeItem: async (itemId) => {
    await assemblyRepository.removeItem(itemId);
    set((state) => ({
      assembly: state.assembly
        ? { ...state.assembly, items: state.assembly.items.filter((i) => i.id !== itemId) }
        : null,
    }));
  },

  updateAssemblyName: async (name) => {
    await assemblyRepository.updateAssembly({ name });
    set((state) => ({
      assembly: state.assembly ? { ...state.assembly, name } : null,
    }));
  },
}));
