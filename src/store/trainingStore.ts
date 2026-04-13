import { create } from 'zustand';
import { trainingRepository } from '../db/trainingRepository';
import type { TrainingEntry, TrainingCategory } from '../types';

interface TrainingState {
  entries: TrainingEntry[];
  loaded: boolean;

  loadAll: () => Promise<void>;
  addEntry: (category: TrainingCategory) => Promise<TrainingEntry>;
  updateEntry: (
    id: string,
    updates: Partial<Pick<TrainingEntry, 'title' | 'content' | 'category'>>,
  ) => Promise<void>;
  deleteEntry: (id: string) => Promise<void>;
}

export const useTrainingStore = create<TrainingState>((set, get) => ({
  entries: [],
  loaded: false,

  loadAll: async () => {
    if (get().loaded) return;
    const entries = await trainingRepository.getAll();
    set({ entries, loaded: true });
  },

  addEntry: async (category) => {
    const entry = await trainingRepository.add(category);
    set((state) => ({ entries: [entry, ...state.entries] }));
    return entry;
  },

  updateEntry: async (id, updates) => {
    await trainingRepository.update(id, updates);
    set((state) => ({
      entries: state.entries.map((e) =>
        e.id === id
          ? {
              ...e,
              ...updates,
              wordCount:
                updates.content !== undefined
                  ? updates.content.trim().split(/\s+/).filter(Boolean).length
                  : e.wordCount,
              updatedAt: Date.now(),
            }
          : e,
      ),
    }));
  },

  deleteEntry: async (id) => {
    await trainingRepository.delete(id);
    set((state) => ({ entries: state.entries.filter((e) => e.id !== id) }));
  },
}));
