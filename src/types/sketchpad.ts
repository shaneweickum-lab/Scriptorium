export type SketchpadCategory =
  | 'Character' | 'Location' | 'Worldbuilding' | 'Culture'
  | 'Magic' | 'Technology' | 'Creature' | 'Conflict'
  | 'Plot' | 'Scene' | 'Dialogue' | 'Theme'
  | 'Lore' | 'Mystery' | 'Item' | 'Faction' | 'Other';

export type SketchpadStatus =
  | 'RAW' | 'EXPLORING' | 'KEEP' | 'MAYBE' | 'REVISE' | 'REJECTED' | 'CANON';

export interface SketchpadEntry {
  id: string;
  bookId: string;
  /** The creator's original idea text — never overwritten by AI. */
  content: string;
  /** Last AI-generated development analysis. Empty string until first AI call. */
  aiAnalysis: string;
  category: SketchpadCategory;
  status: SketchpadStatus;
  tags: string[];
  /** IDs of related SketchpadEntries. */
  relatedIds: string[];
  createdAt: number;
  updatedAt: number;
}

export const SKETCHPAD_CATEGORIES: SketchpadCategory[] = [
  'Character', 'Location', 'Worldbuilding', 'Culture',
  'Magic', 'Technology', 'Creature', 'Conflict',
  'Plot', 'Scene', 'Dialogue', 'Theme',
  'Lore', 'Mystery', 'Item', 'Faction', 'Other',
];

export const SKETCHPAD_STATUSES: SketchpadStatus[] = [
  'RAW', 'EXPLORING', 'KEEP', 'MAYBE', 'REVISE', 'REJECTED', 'CANON',
];

export const STATUS_LABELS: Record<SketchpadStatus, string> = {
  RAW: 'Raw',
  EXPLORING: 'Exploring',
  KEEP: 'Keep',
  MAYBE: 'Maybe',
  REVISE: 'Revise',
  REJECTED: 'Rejected',
  CANON: 'Canon',
};

export const STATUS_COLORS: Record<SketchpadStatus, string> = {
  RAW:      'bg-slate-100 text-slate-600 border-slate-200',
  EXPLORING:'bg-blue-50 text-blue-700 border-blue-200',
  KEEP:     'bg-teal-50 text-teal-700 border-teal-200',
  MAYBE:    'bg-amber-50 text-amber-700 border-amber-200',
  REVISE:   'bg-orange-50 text-orange-700 border-orange-200',
  REJECTED: 'bg-red-50 text-red-500 border-red-200 opacity-60',
  CANON:    'bg-violet-50 text-violet-700 border-violet-200',
};

export const CATEGORY_COLORS: Record<SketchpadCategory, string> = {
  Character:     'text-indigo-600 bg-indigo-50',
  Location:      'text-emerald-600 bg-emerald-50',
  Worldbuilding: 'text-violet-600 bg-violet-50',
  Culture:       'text-amber-600 bg-amber-50',
  Magic:         'text-purple-600 bg-purple-50',
  Technology:    'text-sky-600 bg-sky-50',
  Creature:      'text-lime-700 bg-lime-50',
  Conflict:      'text-red-600 bg-red-50',
  Plot:          'text-orange-600 bg-orange-50',
  Scene:         'text-cyan-600 bg-cyan-50',
  Dialogue:      'text-pink-600 bg-pink-50',
  Theme:         'text-slate-600 bg-slate-100',
  Lore:          'text-teal-600 bg-teal-50',
  Mystery:       'text-violet-700 bg-violet-50',
  Item:          'text-yellow-700 bg-yellow-50',
  Faction:       'text-rose-600 bg-rose-50',
  Other:         'text-slate-500 bg-slate-100',
};
