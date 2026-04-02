import { db } from './database';
import type { Book } from '../types';

export const libraryRepository = {
  async getAllBooks(): Promise<Book[]> {
    const books = await db.books.toArray();
    return books.sort((a, b) => a.createdAt - b.createdAt);
  },

  async getBook(id: string): Promise<Book | undefined> {
    return db.books.get(id);
  },

  async addBook(book: Book): Promise<void> {
    await db.books.add(book);
  },

  async updateBook(id: string, updates: Partial<Book>): Promise<void> {
    await db.books.update(id, { ...updates, updatedAt: Date.now() });
  },

  async deleteBook(id: string): Promise<void> {
    // Cascade delete all book data
    await db.transaction(
      'rw',
      [db.books, db.worldSections, db.worldEntries, db.writingNodes, db.assemblies],
      async () => {
        await db.worldSections.where('bookId').equals(id).delete();
        await db.worldEntries.where('bookId').equals(id).delete();
        await db.writingNodes.where('bookId').equals(id).delete();
        await db.assemblies.where('bookId').equals(id).delete();
        await db.books.delete(id);
      }
    );
  },
};
