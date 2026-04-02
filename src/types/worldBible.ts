export const WORLD_COLORS = [
  '#8b5cf6', // violet
  '#6366f1', // indigo
  '#a855f7', // purple
  '#ec4899', // pink
  '#14b8a6', // teal
  '#10b981', // emerald
  '#f59e0b', // amber
  '#3b82f6', // blue
];

export interface WorldBible {
  id: string;
  name: string;
  description: string;
  coverColor: string;
  createdAt: number;
  updatedAt: number;
}
