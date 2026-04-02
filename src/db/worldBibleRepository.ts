import { db } from './database';
import type { WorldBible } from '../types';

export const worldBibleRepository = {
  async getAllWorldBibles(): Promise<WorldBible[]> {
    const all = await db.worldBibles.toArray();
    return all.sort((a, b) => a.createdAt - b.createdAt);
  },

  async getWorldBible(id: string): Promise<WorldBible | undefined> {
    return db.worldBibles.get(id);
  },

  async addWorldBible(wb: WorldBible): Promise<void> {
    await db.worldBibles.add(wb);
  },

  async updateWorldBible(id: string, updates: Partial<WorldBible>): Promise<void> {
    await db.worldBibles.update(id, { ...updates, updatedAt: Date.now() });
  },

  async deleteWorldBible(id: string): Promise<void> {
    // Cascade delete all sections and entries owned by this world bible,
    // then clear worldBibleId on any books that referenced it
    await db.worldSections.where('bookId').equals(id).delete();
    await db.worldEntries.where('bookId').equals(id).delete();
    // Clear the reference from any linked books
    const linkedBooks = await db.books.filter((b) => b.worldBibleId === id).toArray();
    for (const book of linkedBooks) {
      await db.books.update(book.id, { worldBibleId: undefined });
    }
    await db.worldBibles.delete(id);
  },
};
