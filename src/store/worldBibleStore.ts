import { create } from 'zustand';
import type { WorldBible } from '../types';
import { WORLD_COLORS } from '../types';
import { worldBibleRepository } from '../db/worldBibleRepository';
import { worldRepository } from '../db/worldRepository';
import { generateId } from '../utils/id';

interface WorldBibleStoreState {
  worldBibles: WorldBible[];
  activeWorldBible: WorldBible | null;

  loadWorldBibles: () => Promise<void>;
  createWorldBible: (name: string, description?: string, color?: string) => Promise<WorldBible>;
  updateWorldBible: (id: string, updates: Partial<WorldBible>) => Promise<void>;
  deleteWorldBible: (id: string) => Promise<void>;
  openWorldBible: (id: string) => void;
  closeWorldBible: () => void;
}

export const useWorldBibleStore = create<WorldBibleStoreState>((set, get) => ({
  worldBibles: [],
  activeWorldBible: null,

  loadWorldBibles: async () => {
    try {
      const worldBibles = await worldBibleRepository.getAllWorldBibles();
      set({ worldBibles });
    } catch (err) {
      console.error('Failed to load world bibles:', err);
    }
  },

  createWorldBible: async (name, description = '', color) => {
    const colorIdx = get().worldBibles.length % WORLD_COLORS.length;
    const wb: WorldBible = {
      id: generateId(),
      name: name.trim() || 'Unnamed World',
      description,
      coverColor: color ?? WORLD_COLORS[colorIdx],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await worldBibleRepository.addWorldBible(wb);
    // Seed default sections for this world bible
    await worldRepository.seedDefaultSections(wb.id);
    set((state) => ({ worldBibles: [...state.worldBibles, wb] }));
    return wb;
  },

  updateWorldBible: async (id, updates) => {
    await worldBibleRepository.updateWorldBible(id, updates);
    set((state) => ({
      worldBibles: state.worldBibles.map((w) =>
        w.id === id ? { ...w, ...updates, updatedAt: Date.now() } : w
      ),
      activeWorldBible:
        state.activeWorldBible?.id === id
          ? { ...state.activeWorldBible, ...updates, updatedAt: Date.now() }
          : state.activeWorldBible,
    }));
  },

  deleteWorldBible: async (id) => {
    await worldBibleRepository.deleteWorldBible(id);
    set((state) => ({
      worldBibles: state.worldBibles.filter((w) => w.id !== id),
      activeWorldBible: state.activeWorldBible?.id === id ? null : state.activeWorldBible,
    }));
  },

  openWorldBible: (id) => {
    const wb = get().worldBibles.find((w) => w.id === id);
    if (wb) set({ activeWorldBible: wb });
  },

  closeWorldBible: () => set({ activeWorldBible: null }),
}));
