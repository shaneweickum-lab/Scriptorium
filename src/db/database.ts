import Dexie from 'dexie';
import type { Table } from 'dexie';
import type { WorldSection, WorldEntry, WritingNode, Assembly, Book, WorldBible, TrainingEntry } from '../types';
import type { AchievementUnlock } from '../types/achievements';
import type { SketchpadEntry } from '../types/sketchpad';
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
  achievementUnlocks!: Table<AchievementUnlock, string>;
  trainingEntries!: Table<TrainingEntry, string>;
  sketchpadEntries!: Table<SketchpadEntry, string>;

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

    // v4 schema - add achievement unlock tracking
    this.version(4).stores({
      achievementUnlocks: 'id, achievementId, scopeId, [achievementId+scopeId]',
    });

    // v5 schema - add training corpus for OracleML / Oracle Intelligence System
    this.version(5).stores({
      trainingEntries: 'id, category, updatedAt',
    });

    // v6 schema - add sketchpad idea entries
    this.version(6).stores({
      sketchpadEntries: 'id, bookId, category, status, updatedAt',
    });

    // v7 schema - deduplicate any achievement rows a race condition may have
    // written twice for the same achievementId+scopeId, before the unique
    // index below can be created (creating a unique index over existing
    // duplicate rows would throw). Schema itself is unchanged from v6.
    this.version(7)
      .stores({
        achievementUnlocks: 'id, achievementId, scopeId, [achievementId+scopeId]',
      })
      .upgrade(async (tx) => {
        const rows = await tx.table('achievementUnlocks').toArray();
        const seen = new Set<string>();
        for (const row of rows) {
          const key = `${row.achievementId}::${row.scopeId}`;
          if (seen.has(key)) {
            await tx.table('achievementUnlocks').delete(row.id);
          } else {
            seen.add(key);
          }
        }
      });

    // v8 schema - enforce one unlock per achievement+scope at the DB level,
    // so a race between two concurrent unlockAchievement() calls can no
    // longer double-award XP (the second insert now throws and is ignored).
    this.version(8).stores({
      achievementUnlocks: 'id, achievementId, scopeId, &[achievementId+scopeId]',
    });
  }
}

export const db = new ScriptoriumDB();
