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

export interface EnabledLevels {
  part: boolean;
  chapter: boolean;
  scene: boolean;
}

export const DEFAULT_HIERARCHY_LABELS: HierarchyLabels = {
  part: 'Part',
  chapter: 'Chapter',
  scene: 'Scene',
  note: 'Note',
};

export const DEFAULT_ENABLED_LEVELS: EnabledLevels = {
  part: true,
  chapter: true,
  scene: true,
};

/** The topmost NodeType the user can add given which levels are enabled. */
export function getTopLevelType(levels: EnabledLevels): 'part' | 'chapter' | 'scene' {
  if (levels.part) return 'part';
  if (levels.chapter) return 'chapter';
  return 'scene';
}

/** Ordered list of child NodeTypes a given parent can accept, respecting enabled levels. */
export function getChildTypes(parentType: NodeType, levels: EnabledLevels): NodeType[] {
  if (parentType === 'part') {
    const children: NodeType[] = [];
    if (levels.chapter) children.push('chapter');
    if (levels.scene) children.push('scene');
    children.push('note');
    return children;
  }
  if (parentType === 'chapter') {
    const children: NodeType[] = [];
    if (levels.scene) children.push('scene');
    children.push('note');
    return children;
  }
  return []; // scene and note have no children
}
