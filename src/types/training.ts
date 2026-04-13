export type TrainingCategory = 'journal' | 'email' | 'short-story' | 'misc';

export interface TrainingEntry {
  id: string;
  category: TrainingCategory;
  title: string;
  /** Plain text — paste directly, no TipTap JSON required. */
  content: string;
  /** Cached word count so the UI never has to re-count. */
  wordCount: number;
  createdAt: number;
  updatedAt: number;
}

export const TRAINING_CATEGORY_META: Record<
  TrainingCategory,
  { label: string; plural: string; gradient: string; description: string }
> = {
  journal: {
    label: 'Journal Entry',
    plural: 'Journal Entries',
    gradient: 'linear-gradient(135deg, #7c3aed, #6d28d9)',
    description: 'Personal reflections, diary entries, or daily writing practice.',
  },
  email: {
    label: 'Email',
    plural: 'Emails',
    gradient: 'linear-gradient(135deg, #0891b2, #0284c7)',
    description: 'Emails you have written — casual or professional.',
  },
  'short-story': {
    label: 'Short Story',
    plural: 'Short Stories',
    gradient: 'linear-gradient(135deg, #0d9488, #059669)',
    description: 'Completed or draft short fiction — any genre.',
  },
  misc: {
    label: 'Miscellaneous',
    plural: 'Miscellaneous',
    gradient: 'linear-gradient(135deg, #475569, #334155)',
    description: 'Essays, blog posts, scripts, or anything else you have written.',
  },
};
