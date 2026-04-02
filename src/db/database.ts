import Dexie from 'dexie';
import type { Table } from 'dexie';
import type { WorldSection, WorldEntry, WritingNode, Assembly, Book, WorldBible } from '../types';
import { generateId } from '../utils/id';
import { DEFAULT_HIERARCHY_LABELS } from '../types';
import { BOOK_COLORS } from '../types';

export class ScriptoriumDB extends Dexie {
  books!: Table<Book, string>;
  worldBibles!: Table<WorldBible, string>;
  worldSections!: Table<WorldSection, string>;
  worldEntries!: Table<WorldEntry, string>;
  writingNodes!: Table<WritingNode, string>;
  assemblies!: Table<Assembly, string>;

  constructor() {
    super('ScriptoriumDB');

    // v1 schema (legacy - single book, no bookId)
    this.version(1).stores({
      worldSections: 'id, order',
      worldEntries: 'id, sectionId, updatedAt',
      writingNodes: 'id, parentId, order, type',
      assemblies: 'id',
      projectMeta: 'id',
    });

    // v2 schema - multi-book, bookId on all tables
    this.version(2)
      .stores({
        books: 'id',
        worldSections: 'id, bookId, order',
        worldEntries: 'id, bookId, sectionId, updatedAt',
        writingNodes: 'id, bookId, parentId, order, type',
        assemblies: 'id, bookId',
        projectMeta: null,
      })
      .upgrade(async (tx) => {
        // Migrate any existing v1 data into a default book
        const existingMeta = await tx.table('projectMeta').toArray().catch(() => []);
        const defaultBookId = existingMeta[0]?.id || generateId();
        const defaultBook: Book = {
          id: defaultBookId,
          title: existingMeta[0]?.title || 'My Novel',
          author: existingMeta[0]?.author || '',
          synopsis: '',
          coverColor: BOOK_COLORS[0],
          hierarchyLabels: existingMeta[0]?.hierarchyLabels || DEFAULT_HIERARCHY_LABELS,
          createdAt: existingMeta[0]?.createdAt || Date.now(),
          updatedAt: Date.now(),
        };
        await tx.table('books').put(defaultBook);

        // Stamp bookId on all existing records
        await tx.table('worldSections').toCollection().modify({ bookId: defaultBookId });
        await tx.table('worldEntries').toCollection().modify({ bookId: defaultBookId });
        await tx.table('writingNodes').toCollection().modify({ bookId: defaultBookId });
        // Fix assemblies: rename 'main' key to bookId
        const oldAssembly = await tx.table('assemblies').get('main').catch(() => null);
        if (oldAssembly) {
          await tx.table('assemblies').delete('main');
          await tx.table('assemblies').put({ ...oldAssembly, id: defaultBookId, bookId: defaultBookId });
        }
      });

    // v3 schema - add worldBibles table (no migration needed, fresh table)
    this.version(3).stores({
      worldBibles: 'id',
    });
  }
}

export const db = new ScriptoriumDB();
