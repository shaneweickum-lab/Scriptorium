import { db } from './database';
import type { TrainingEntry, TrainingCategory } from '../types';

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export const trainingRepository = {
  async getAll(): Promise<TrainingEntry[]> {
    return db.trainingEntries.orderBy('updatedAt').reverse().toArray();
  },

  async getByCategory(category: TrainingCategory): Promise<TrainingEntry[]> {
    return db.trainingEntries
      .where('category')
      .equals(category)
      .reverse()
      .sortBy('updatedAt');
  },

  async add(category: TrainingCategory, title = 'Untitled'): Promise<TrainingEntry> {
    const entry: TrainingEntry = {
      id: crypto.randomUUID(),
      category,
      title,
      content: '',
      wordCount: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await db.trainingEntries.add(entry);
    return entry;
  },

  async update(
    id: string,
    updates: Partial<Pick<TrainingEntry, 'title' | 'content' | 'category'>>,
  ): Promise<void> {
    const patch: Partial<TrainingEntry> = { ...updates, updatedAt: Date.now() };
    if (updates.content !== undefined) {
      patch.wordCount = countWords(updates.content);
    }
    await db.trainingEntries.update(id, patch);
  },

  async delete(id: string): Promise<void> {
    await db.trainingEntries.delete(id);
  },

  async totalWordCount(): Promise<number> {
    const entries = await db.trainingEntries.toArray();
    return entries.reduce((sum, e) => sum + e.wordCount, 0);
  },
};
