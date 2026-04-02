export type AssemblyItemType = 'node' | 'break' | 'frontmatter';

export interface AssemblyItem {
  id: string;
  nodeId: string | null;
  type: AssemblyItemType;
  customTitle?: string;
  content?: string;
  order: number;
}

export interface Assembly {
  id: string; // = bookId
  bookId: string;
  name: string;
  items: AssemblyItem[];
  createdAt: number;
  updatedAt: number;
}
