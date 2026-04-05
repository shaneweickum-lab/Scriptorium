import type { HierarchyLabels } from './writing';

export const BOOK_COLORS = [
  '#6366f1', // indigo
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#f59e0b', // amber
  '#10b981', // emerald
  '#3b82f6', // blue
  '#ef4444', // red
  '#14b8a6', // teal
];

export interface Book {
  id: string;
  title: string;
  author: string;
  synopsis: string;
  coverColor: string;
  hierarchyLabels: HierarchyLabels;
  worldBibleId?: string; // optional link to a shared WorldBible for series
  wordGoal?: number;     // personal word count target
  createdAt: number;
  updatedAt: number;
}
