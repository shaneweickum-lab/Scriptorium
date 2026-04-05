export interface Achievement {
  id: string;
  name: string;
  description: string;
  xp: number;
  emoji: string;
  category: 'global' | 'writing' | 'chapters' | 'world' | 'session';
  /** 'global' = once ever; 'per-book' = once per book; 'per-world' = once per world bible */
  scope: 'global' | 'per-book' | 'per-world';
}

export interface AchievementUnlock {
  id: string;
  achievementId: string;
  /** '' for global scope; bookId or worldId otherwise */
  scopeId: string;
  unlockedAt: number;
  xpAwarded: number;
}

// ── 30 Achievements ────────────────────────────────────────────────────────
export const ACHIEVEMENTS: Achievement[] = [
  // ── Global ────────────────────────────────────────────────
  {
    id: 'first-book',
    name: 'First Quill',
    description: 'Create your very first book.',
    xp: 25,
    emoji: '✍️',
    category: 'global',
    scope: 'global',
  },
  {
    id: 'first-world',
    name: 'World Architect',
    description: 'Bring your first world bible into existence.',
    xp: 25,
    emoji: '🌍',
    category: 'global',
    scope: 'global',
  },
  {
    id: 'five-books',
    name: 'The Collector',
    description: 'Amass a library of 5 books.',
    xp: 50,
    emoji: '📚',
    category: 'global',
    scope: 'global',
  },
  {
    id: 'three-worlds',
    name: 'Pantheon Builder',
    description: 'Create 3 distinct world bibles.',
    xp: 50,
    emoji: '🗺️',
    category: 'global',
    scope: 'global',
  },
  {
    id: 'first-export',
    name: 'Into the Wild',
    description: 'Export a manuscript for the first time.',
    xp: 40,
    emoji: '📤',
    category: 'global',
    scope: 'global',
  },
  {
    id: 'night-owl',
    name: 'Night Owl',
    description: 'Write between midnight and 4 AM.',
    xp: 30,
    emoji: '🦉',
    category: 'global',
    scope: 'global',
  },
  {
    id: 'early-bird',
    name: 'Dawn Scribe',
    description: 'Write between 5 AM and 7 AM.',
    xp: 30,
    emoji: '🌅',
    category: 'global',
    scope: 'global',
  },
  {
    id: 'arcane-master',
    name: 'Arcane Master',
    description: 'Accumulate 1,000 total XP. A true wizard of words.',
    xp: 0,
    emoji: '⭐',
    category: 'global',
    scope: 'global',
  },

  // ── Per-book: word count ───────────────────────────────────
  {
    id: 'words-100',
    name: 'First Words',
    description: 'Write 100 words in a book.',
    xp: 10,
    emoji: '🖊️',
    category: 'writing',
    scope: 'per-book',
  },
  {
    id: 'words-500',
    name: 'Warming Up',
    description: 'Reach 500 words in a book.',
    xp: 15,
    emoji: '🔥',
    category: 'writing',
    scope: 'per-book',
  },
  {
    id: 'words-1k',
    name: 'In the Flow',
    description: 'Hit 1,000 words in a book.',
    xp: 20,
    emoji: '💧',
    category: 'writing',
    scope: 'per-book',
  },
  {
    id: 'words-2500',
    name: 'Building Momentum',
    description: 'Reach 2,500 words in a book.',
    xp: 25,
    emoji: '⚡',
    category: 'writing',
    scope: 'per-book',
  },
  {
    id: 'words-5k',
    name: 'True Scribe',
    description: 'Write 5,000 words in a book.',
    xp: 35,
    emoji: '📜',
    category: 'writing',
    scope: 'per-book',
  },
  {
    id: 'words-10k',
    name: 'Novella Territory',
    description: 'Reach 10,000 words in a book.',
    xp: 50,
    emoji: '📖',
    category: 'writing',
    scope: 'per-book',
  },
  {
    id: 'words-25k',
    name: 'Quarter Novel',
    description: 'Write 25,000 words in a book.',
    xp: 75,
    emoji: '🏔️',
    category: 'writing',
    scope: 'per-book',
  },
  {
    id: 'words-50k',
    name: 'NaNoWriMo Champion',
    description: 'Reach 50,000 words in a book.',
    xp: 100,
    emoji: '🏆',
    category: 'writing',
    scope: 'per-book',
  },
  {
    id: 'words-80k',
    name: 'Epic Length',
    description: 'Write 80,000 words in a book.',
    xp: 125,
    emoji: '🌌',
    category: 'writing',
    scope: 'per-book',
  },
  {
    id: 'words-goal',
    name: 'Goal Reached!',
    description: 'Hit your personal word count goal for a book.',
    xp: 200,
    emoji: '🎯',
    category: 'writing',
    scope: 'per-book',
  },

  // ── Per-book: chapter milestones ───────────────────────────
  {
    id: 'chapter-1',
    name: 'Chapter One',
    description: 'Add your first chapter to a book.',
    xp: 15,
    emoji: '📑',
    category: 'chapters',
    scope: 'per-book',
  },
  {
    id: 'chapters-3',
    name: 'Three Acts',
    description: 'Write 3 chapters in a book.',
    xp: 20,
    emoji: '🎭',
    category: 'chapters',
    scope: 'per-book',
  },
  {
    id: 'chapters-10',
    name: 'Ten Deep',
    description: 'Reach 10 chapters in a book.',
    xp: 40,
    emoji: '🔟',
    category: 'chapters',
    scope: 'per-book',
  },
  {
    id: 'chapters-20',
    name: 'Twenty Chapters',
    description: 'Write 20 chapters in a book.',
    xp: 75,
    emoji: '📘',
    category: 'chapters',
    scope: 'per-book',
  },

  // ── Per-world: world bible ─────────────────────────────────
  {
    id: 'world-entry-1',
    name: 'Lore Begins',
    description: 'Create your first world entry.',
    xp: 15,
    emoji: '🌱',
    category: 'world',
    scope: 'per-world',
  },
  {
    id: 'world-entries-10',
    name: 'Lore Keeper',
    description: 'Grow your world to 10 entries.',
    xp: 30,
    emoji: '📔',
    category: 'world',
    scope: 'per-world',
  },
  {
    id: 'world-entries-25',
    name: 'Encyclopedia',
    description: 'Build a world with 25 entries.',
    xp: 60,
    emoji: '📕',
    category: 'world',
    scope: 'per-world',
  },
  {
    id: 'world-words-500',
    name: 'World Builder',
    description: 'Write 500 words across world entries.',
    xp: 20,
    emoji: '🧱',
    category: 'world',
    scope: 'per-world',
  },
  {
    id: 'world-words-5k',
    name: 'Myth Maker',
    description: 'Accumulate 5,000 words across world entries.',
    xp: 50,
    emoji: '🐉',
    category: 'world',
    scope: 'per-world',
  },
  {
    id: 'world-sections-all',
    name: 'Well Rounded',
    description: 'Add at least one entry to all 9 default world sections.',
    xp: 75,
    emoji: '🌐',
    category: 'world',
    scope: 'per-world',
  },

  // ── Session ────────────────────────────────────────────────
  {
    id: 'session-500',
    name: 'Sprint Writer',
    description: 'Write 500 words in a single session.',
    xp: 30,
    emoji: '⚡',
    category: 'session',
    scope: 'global',
  },
  {
    id: 'session-1k',
    name: 'Marathon Writer',
    description: 'Write 1,000 words in a single session.',
    xp: 50,
    emoji: '🏃',
    category: 'session',
    scope: 'global',
  },
];

// ── XP / Level helpers ──────────────────────────────────────────────────────
export function getLevel(totalXP: number): number {
  return Math.floor(totalXP / 100) + 1;
}

export function getLevelProgress(totalXP: number): { current: number; needed: number; pct: number } {
  const current = totalXP % 100;
  return { current, needed: 100, pct: current };
}

export const CATEGORY_COLORS: Record<Achievement['category'], string> = {
  global: 'from-violet-600 to-purple-800',
  writing: 'from-indigo-500 to-blue-700',
  chapters: 'from-emerald-500 to-teal-700',
  world: 'from-amber-500 to-orange-700',
  session: 'from-rose-500 to-pink-700',
};
