export type NodeType = 'part' | 'chapter' | 'scene' | 'note';

export interface WritingNode {
  id: string;
  bookId: string;
  parentId: string | null;
  type: NodeType;
  title: string;
  content: string; // TipTap JSON as string
  order: number;
  synopsis: string;
  wordCountCache: number;
  createdAt: number;
  updatedAt: number;
}

export interface HierarchyLabels {
  part: string;
  chapter: string;
  scene: string;
  note: string;
}

export const DEFAULT_HIERARCHY_LABELS: HierarchyLabels = {
  part: 'Part',
  chapter: 'Chapter',
  scene: 'Scene',
  note: 'Note',
};
