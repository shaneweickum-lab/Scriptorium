import { db } from './database';
import type { SketchpadEntry } from '../types/sketchpad';

export const sketchpadRepository = {
  async getByBook(bookId: string): Promise<SketchpadEntry[]> {
    return db.sketchpadEntries.where('bookId').equals(bookId).toArray();
  },

  async add(entry: SketchpadEntry): Promise<void> {
    await db.sketchpadEntries.add(entry);
  },

  async update(id: string, changes: Partial<SketchpadEntry>): Promise<void> {
    await db.sketchpadEntries.update(id, { ...changes, updatedAt: Date.now() });
  },

  async delete(id: string): Promise<void> {
    await db.sketchpadEntries.delete(id);
  },
};
