export type AssemblyItemType = 'node' | 'break' | 'frontmatter';

export interface AssemblyItem {
  id: string;
  nodeId: string | null; // null for breaks/frontmatter
  type: AssemblyItemType;
  customTitle?: string;
  content?: string; // For frontmatter/break custom text
  order: number;
}

export interface Assembly {
  id: string;
  name: string;
  items: AssemblyItem[];
  createdAt: number;
  updatedAt: number;
}
