import { create } from 'zustand';
import type { Assembly, AssemblyItem } from '../types';
import { assemblyRepository } from '../db/assemblyRepository';

interface AssemblyState {
  assembly: Assembly | null;
  loadFromDB: (bookId: string) => Promise<void>;
  setItems: (bookId: string, items: AssemblyItem[]) => Promise<void>;
  addNodeItem: (bookId: string, nodeId: string) => Promise<void>;
  addBreakItem: (bookId: string) => Promise<void>;
  removeItem: (bookId: string, itemId: string) => Promise<void>;
  updateAssemblyName: (bookId: string, name: string) => Promise<void>;
}

export const useAssemblyStore = create<AssemblyState>((set) => ({
  assembly: null,

  loadFromDB: async (bookId) => {
    const assembly = await assemblyRepository.getAssembly(bookId);
    set({ assembly });
  },

  setItems: async (bookId, items) => {
    await assemblyRepository.setItems(bookId, items);
    set((state) => ({
      assembly: state.assembly ? { ...state.assembly, items, updatedAt: Date.now() } : null,
    }));
  },

  addNodeItem: async (bookId, nodeId) => {
    await assemblyRepository.addNodeItem(bookId, nodeId);
    const assembly = await assemblyRepository.getAssembly(bookId);
    set({ assembly });
  },

  addBreakItem: async (bookId) => {
    await assemblyRepository.addBreakItem(bookId);
    const assembly = await assemblyRepository.getAssembly(bookId);
    set({ assembly });
  },

  removeItem: async (bookId, itemId) => {
    await assemblyRepository.removeItem(bookId, itemId);
    set((state) => ({
      assembly: state.assembly
        ? { ...state.assembly, items: state.assembly.items.filter((i) => i.id !== itemId) }
        : null,
    }));
  },

  updateAssemblyName: async (bookId, name) => {
    await assemblyRepository.updateAssembly(bookId, { name });
    set((state) => ({
      assembly: state.assembly ? { ...state.assembly, name } : null,
    }));
  },
}));
