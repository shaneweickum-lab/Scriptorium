import { db } from './database';
import type { WorldSection, WorldEntry } from '../types';
import { DEFAULT_SECTIONS } from '../types';
import { generateId } from '../utils/id';

export const worldRepository = {
  async seedDefaultSections(): Promise<void> {
    const count = await db.worldSections.count();
    if (count === 0) {
      const now = Date.now();
      await db.worldSections.bulkAdd(
        DEFAULT_SECTIONS.map((s) => ({ ...s, createdAt: now }))
      );
    }
  },

  async getAllSections(): Promise<WorldSection[]> {
    return db.worldSections.orderBy('order').toArray();
  },

  async addSection(name: string, icon: string = 'BookOpen'): Promise<WorldSection> {
    const sections = await db.worldSections.orderBy('order').toArray();
    const maxOrder = sections.length > 0 ? Math.max(...sections.map((s) => s.order)) : -1;
    const section: WorldSection = {
      id: generateId(),
      name,
      icon,
      order: maxOrder + 1,
      createdAt: Date.now(),
    };
    await db.worldSections.add(section);
    return section;
  },

  async updateSection(id: string, updates: Partial<WorldSection>): Promise<void> {
    await db.worldSections.update(id, updates);
  },

  async deleteSection(id: string): Promise<void> {
    await db.transaction('rw', db.worldSections, db.worldEntries, async () => {
      await db.worldEntries.where('sectionId').equals(id).delete();
      await db.worldSections.delete(id);
    });
  },

  async reorderSections(ids: string[]): Promise<void> {
    await db.transaction('rw', db.worldSections, async () => {
      for (let i = 0; i < ids.length; i++) {
        await db.worldSections.update(ids[i], { order: i });
      }
    });
  },

  async getAllEntries(): Promise<WorldEntry[]> {
    return db.worldEntries.toArray();
  },

  async getEntriesBySection(sectionId: string): Promise<WorldEntry[]> {
    return db.worldEntries.where('sectionId').equals(sectionId).toArray();
  },

  async addEntry(sectionId: string): Promise<WorldEntry> {
    const entry: WorldEntry = {
      id: generateId(),
      sectionId,
      title: 'New Entry',
      content: '',
      customFields: [],
      tags: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await db.worldEntries.add(entry);
    return entry;
  },

  async updateEntry(id: string, updates: Partial<WorldEntry>): Promise<void> {
    await db.worldEntries.update(id, { ...updates, updatedAt: Date.now() });
  },

  async deleteEntry(id: string): Promise<void> {
    await db.worldEntries.delete(id);
  },
};
