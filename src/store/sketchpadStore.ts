import { create } from 'zustand';
import type { SketchpadEntry } from '../types/sketchpad';
import { sketchpadRepository } from '../db/sketchpadRepository';

interface SketchpadState {
  entries: SketchpadEntry[];
  selectedId: string | null;
  loadEntries: (bookId: string) => Promise<void>;
  addEntry: (entry: SketchpadEntry) => Promise<void>;
  updateEntry: (id: string, changes: Partial<SketchpadEntry>) => Promise<void>;
  deleteEntry: (id: string) => Promise<void>;
  setSelectedId: (id: string | null) => void;
}

export const useSketchpadStore = create<SketchpadState>((set) => ({
  entries: [],
  selectedId: null,

  loadEntries: async (bookId) => {
    const entries = await sketchpadRepository.getByBook(bookId);
    set({ entries: entries.sort((a, b) => b.updatedAt - a.updatedAt) });
  },

  addEntry: async (entry) => {
    await sketchpadRepository.add(entry);
    set((s) => ({ entries: [entry, ...s.entries] }));
  },

  updateEntry: async (id, changes) => {
    const updatedAt = Date.now();
    await sketchpadRepository.update(id, changes);
    set((s) => ({
      entries: s.entries.map((e) =>
        e.id === id ? { ...e, ...changes, updatedAt } : e
      ),
    }));
  },

  deleteEntry: async (id) => {
    await sketchpadRepository.delete(id);
    set((s) => ({
      entries: s.entries.filter((e) => e.id !== id),
      selectedId: s.selectedId === id ? null : s.selectedId,
    }));
  },

  setSelectedId: (id) => set({ selectedId: id }),
}));
