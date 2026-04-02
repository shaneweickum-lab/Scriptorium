import Dexie from 'dexie';
import type { Table } from 'dexie';
import type { WorldSection, WorldEntry, WritingNode, Assembly, ProjectMeta } from '../types';

export class ScriptoriumDB extends Dexie {
  worldSections!: Table<WorldSection, string>;
  worldEntries!: Table<WorldEntry, string>;
  writingNodes!: Table<WritingNode, string>;
  assemblies!: Table<Assembly, string>;
  projectMeta!: Table<ProjectMeta, string>;

  constructor() {
    super('ScriptoriumDB');
    this.version(1).stores({
      worldSections: 'id, order',
      worldEntries: 'id, sectionId, updatedAt',
      writingNodes: 'id, parentId, order, type',
      assemblies: 'id',
      projectMeta: 'id',
    });
  }
}

export const db = new ScriptoriumDB();
