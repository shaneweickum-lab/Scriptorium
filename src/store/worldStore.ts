import { create } from 'zustand';
import type { WorldSection, WorldEntry, CustomField } from '../types';
import { worldRepository } from '../db/worldRepository';
import { generateId } from '../utils/id';

interface WorldState {
  sections: WorldSection[];
  entries: WorldEntry[];
  activeSectionId: string | null;
  activeEntryId: string | null;

  loadFromDB: () => Promise<void>;
  addSection: (name: string, icon?: string) => Promise<void>;
  updateSection: (id: string, updates: Partial<WorldSection>) => Promise<void>;
  deleteSection: (id: string) => Promise<void>;
  reorderSections: (ids: string[]) => Promise<void>;

  setActiveSection: (id: string | null) => void;
  setActiveEntry: (id: string | null) => void;

  addEntry: (sectionId: string) => Promise<WorldEntry>;
  updateEntry: (id: string, updates: Partial<WorldEntry>) => Promise<void>;
  deleteEntry: (id: string) => Promise<void>;

  addCustomField: (entryId: string) => Promise<void>;
  updateCustomField: (entryId: string, fieldId: string, updates: Partial<CustomField>) => Promise<void>;
  deleteCustomField: (entryId: string, fieldId: string) => Promise<void>;
}

export const useWorldStore = create<WorldState>((set, get) => ({
  sections: [],
  entries: [],
  activeSectionId: null,
  activeEntryId: null,

  loadFromDB: async () => {
    await worldRepository.seedDefaultSections();
    const [sections, entries] = await Promise.all([
      worldRepository.getAllSections(),
      worldRepository.getAllEntries(),
    ]);
    set({
      sections,
      entries,
      activeSectionId: sections[0]?.id ?? null,
    });
  },

  addSection: async (name, icon) => {
    const section = await worldRepository.addSection(name, icon);
    set((state) => ({ sections: [...state.sections, section] }));
  },

  updateSection: async (id, updates) => {
    await worldRepository.updateSection(id, updates);
    set((state) => ({
      sections: state.sections.map((s) => (s.id === id ? { ...s, ...updates } : s)),
    }));
  },

  deleteSection: async (id) => {
    await worldRepository.deleteSection(id);
    set((state) => {
      const sections = state.sections.filter((s) => s.id !== id);
      const entries = state.entries.filter((e) => e.sectionId !== id);
      const activeSectionId = state.activeSectionId === id ? (sections[0]?.id ?? null) : state.activeSectionId;
      return { sections, entries, activeSectionId, activeEntryId: null };
    });
  },

  reorderSections: async (ids) => {
    await worldRepository.reorderSections(ids);
    set((state) => {
      const map = new Map(state.sections.map((s) => [s.id, s]));
      return {
        sections: ids.map((id, i) => ({ ...map.get(id)!, order: i })),
      };
    });
  },

  setActiveSection: (id) => set({ activeSectionId: id, activeEntryId: null }),
  setActiveEntry: (id) => set({ activeEntryId: id }),

  addEntry: async (sectionId) => {
    const entry = await worldRepository.addEntry(sectionId);
    set((state) => ({ entries: [...state.entries, entry], activeEntryId: entry.id }));
    return entry;
  },

  updateEntry: async (id, updates) => {
    await worldRepository.updateEntry(id, updates);
    set((state) => ({
      entries: state.entries.map((e) => (e.id === id ? { ...e, ...updates, updatedAt: Date.now() } : e)),
    }));
  },

  deleteEntry: async (id) => {
    await worldRepository.deleteEntry(id);
    set((state) => ({
      entries: state.entries.filter((e) => e.id !== id),
      activeEntryId: state.activeEntryId === id ? null : state.activeEntryId,
    }));
  },

  addCustomField: async (entryId) => {
    const entry = get().entries.find((e) => e.id === entryId);
    if (!entry) return;
    const field: CustomField = {
      id: generateId(),
      label: 'New Field',
      value: '',
      fieldType: 'text',
    };
    const customFields = [...entry.customFields, field];
    await worldRepository.updateEntry(entryId, { customFields });
    set((state) => ({
      entries: state.entries.map((e) => (e.id === entryId ? { ...e, customFields, updatedAt: Date.now() } : e)),
    }));
  },

  updateCustomField: async (entryId, fieldId, updates) => {
    const entry = get().entries.find((e) => e.id === entryId);
    if (!entry) return;
    const customFields = entry.customFields.map((f) => (f.id === fieldId ? { ...f, ...updates } : f));
    await worldRepository.updateEntry(entryId, { customFields });
    set((state) => ({
      entries: state.entries.map((e) => (e.id === entryId ? { ...e, customFields, updatedAt: Date.now() } : e)),
    }));
  },

  deleteCustomField: async (entryId, fieldId) => {
    const entry = get().entries.find((e) => e.id === entryId);
    if (!entry) return;
    const customFields = entry.customFields.filter((f) => f.id !== fieldId);
    await worldRepository.updateEntry(entryId, { customFields });
    set((state) => ({
      entries: state.entries.map((e) => (e.id === entryId ? { ...e, customFields, updatedAt: Date.now() } : e)),
    }));
  },
}));
