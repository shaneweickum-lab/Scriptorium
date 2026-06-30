export interface SyncBook {
  id: string;
  title: string;
  author: string;
  synopsis: string;
  word_goal?: number;
  cover_color: string;
  world_bible_id?: string;
  created_at: number;
  updated_at: number;
}

export interface SyncNode {
  id: string;
  book_id: string;
  parent_id: string | null;
  type: string;
  title: string;
  order: number;
  content_text: string;
  content_raw: string;
  word_count: number;
}

export interface SyncWorldSection {
  id: string;
  book_id: string;
  name: string;
  order: number;
}

export interface SyncWorldEntry {
  id: string;
  book_id: string;
  section_id: string;
  section_name: string;
  title: string;
  content_text: string;
  tags: string[];
  custom_fields: Array<{ label: string; value: string }>;
  updated_at: number;
}

export interface SyncAssembly {
  id: string;
  book_id: string;
  items: Array<{ id: string; type: string; nodeId?: string; label?: string }>;
}

export interface PendingWrite {
  id: string;
  type: 'update_node_content';
  node_id: string;
  content_raw: string;
  content_text: string;
  written_at: string;
}

export interface ScriptoriumSync {
  version: 1;
  exported_at: string;
  books: SyncBook[];
  writing_nodes: SyncNode[];
  world_sections: SyncWorldSection[];
  world_entries: SyncWorldEntry[];
  assemblies: SyncAssembly[];
  pending_writes: PendingWrite[];
}
