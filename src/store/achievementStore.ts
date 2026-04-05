import { create } from 'zustand';
import { db } from '../db/database';
import { generateId } from '../utils/id';
import type { AchievementUnlock } from '../types/achievements';
import { ACHIEVEMENTS } from '../types/achievements';

function unlockKey(achievementId: string, scopeId: string) {
  return `${achievementId}:${scopeId}`;
}

export type OnUnlock = (name: string, xp: number, emoji: string) => void;

interface AchievementStoreState {
  unlocks: AchievementUnlock[];
  /** Pre-computed set of "achievementId:scopeId" keys for O(1) lookup */
  unlockSet: Set<string>;
  totalXP: number;
  isLoaded: boolean;

  loadAchievements: () => Promise<void>;
  isUnlocked: (achievementId: string, scopeId?: string) => boolean;
  unlockAchievement: (achievementId: string, scopeId: string, onUnlock?: OnUnlock) => Promise<void>;

  checkBookWordCount: (bookId: string, totalWords: number, wordGoal?: number, onUnlock?: OnUnlock) => Promise<void>;
  checkBookChapters: (bookId: string, chapterCount: number, onUnlock?: OnUnlock) => Promise<void>;
  checkGlobal: (bookCount: number, worldCount: number, onUnlock?: OnUnlock) => Promise<void>;
  checkWorldEntries: (worldId: string, entryCount: number, totalWords: number, coveredSectionIds: string[], onUnlock?: OnUnlock) => Promise<void>;
  checkSessionWords: (sessionWords: number, onUnlock?: OnUnlock) => Promise<void>;
  checkExport: (onUnlock?: OnUnlock) => Promise<void>;
  checkTimeOfDay: (onUnlock?: OnUnlock) => Promise<void>;
  checkXPMilestone: (onUnlock?: OnUnlock) => Promise<void>;
}

export const useAchievementStore = create<AchievementStoreState>((set, get) => ({
  unlocks: [],
  unlockSet: new Set(),
  totalXP: 0,
  isLoaded: false,

  loadAchievements: async () => {
    try {
      const unlocks = await db.achievementUnlocks.toArray();
      const unlockSet = new Set(unlocks.map((u) => unlockKey(u.achievementId, u.scopeId)));
      const totalXP = unlocks.reduce((sum, u) => sum + u.xpAwarded, 0);
      set({ unlocks, unlockSet, totalXP, isLoaded: true });
    } catch {
      set({ unlocks: [], unlockSet: new Set(), totalXP: 0, isLoaded: true });
    }
  },

  isUnlocked: (achievementId, scopeId = '') => {
    return get().unlockSet.has(unlockKey(achievementId, scopeId));
  },

  unlockAchievement: async (achievementId, scopeId, onUnlock) => {
    const { isUnlocked } = get();
    if (isUnlocked(achievementId, scopeId)) return;

    const def = ACHIEVEMENTS.find((a) => a.id === achievementId);
    if (!def) return;

    const record: AchievementUnlock = {
      id: generateId(),
      achievementId,
      scopeId,
      unlockedAt: Date.now(),
      xpAwarded: def.xp,
    };

    try {
      await db.achievementUnlocks.add(record);
    } catch {
      return; // duplicate, ignore
    }

    set((state) => ({
      unlocks: [...state.unlocks, record],
      unlockSet: new Set([...state.unlockSet, unlockKey(achievementId, scopeId)]),
      totalXP: state.totalXP + def.xp,
    }));

    onUnlock?.(def.name, def.xp, def.emoji);
  },

  checkBookWordCount: async (bookId, totalWords, wordGoal, onUnlock) => {
    const { unlockAchievement } = get();
    const thresholds = [
      { id: 'words-100', threshold: 100 },
      { id: 'words-500', threshold: 500 },
      { id: 'words-1k', threshold: 1000 },
      { id: 'words-2500', threshold: 2500 },
      { id: 'words-5k', threshold: 5000 },
      { id: 'words-10k', threshold: 10000 },
      { id: 'words-25k', threshold: 25000 },
      { id: 'words-50k', threshold: 50000 },
      { id: 'words-80k', threshold: 80000 },
    ];
    for (const { id, threshold } of thresholds) {
      if (totalWords >= threshold) {
        await unlockAchievement(id, bookId, onUnlock);
      }
    }
    if (wordGoal && wordGoal > 0 && totalWords >= wordGoal) {
      await unlockAchievement('words-goal', bookId, onUnlock);
    }
  },

  checkBookChapters: async (bookId, chapterCount, onUnlock) => {
    const { unlockAchievement } = get();
    if (chapterCount >= 1) await unlockAchievement('chapter-1', bookId, onUnlock);
    if (chapterCount >= 3) await unlockAchievement('chapters-3', bookId, onUnlock);
    if (chapterCount >= 10) await unlockAchievement('chapters-10', bookId, onUnlock);
    if (chapterCount >= 20) await unlockAchievement('chapters-20', bookId, onUnlock);
  },

  checkGlobal: async (bookCount, worldCount, onUnlock) => {
    const { unlockAchievement } = get();
    if (bookCount >= 1) await unlockAchievement('first-book', '', onUnlock);
    if (bookCount >= 5) await unlockAchievement('five-books', '', onUnlock);
    if (worldCount >= 1) await unlockAchievement('first-world', '', onUnlock);
    if (worldCount >= 3) await unlockAchievement('three-worlds', '', onUnlock);
  },

  checkWorldEntries: async (worldId, entryCount, totalWords, coveredSectionIds, onUnlock) => {
    const { unlockAchievement } = get();
    if (entryCount >= 1) await unlockAchievement('world-entry-1', worldId, onUnlock);
    if (entryCount >= 10) await unlockAchievement('world-entries-10', worldId, onUnlock);
    if (entryCount >= 25) await unlockAchievement('world-entries-25', worldId, onUnlock);
    if (totalWords >= 500) await unlockAchievement('world-words-500', worldId, onUnlock);
    if (totalWords >= 5000) await unlockAchievement('world-words-5k', worldId, onUnlock);
    if (coveredSectionIds.length >= 9) {
      await unlockAchievement('world-sections-all', worldId, onUnlock);
    }
  },

  checkSessionWords: async (sessionWords, onUnlock) => {
    const { unlockAchievement } = get();
    if (sessionWords >= 500) await unlockAchievement('session-500', '', onUnlock);
    if (sessionWords >= 1000) await unlockAchievement('session-1k', '', onUnlock);
  },

  checkExport: async (onUnlock) => {
    const { unlockAchievement } = get();
    await unlockAchievement('first-export', '', onUnlock);
  },

  checkTimeOfDay: async (onUnlock) => {
    const { unlockAchievement } = get();
    const hour = new Date().getHours();
    if (hour >= 0 && hour < 4) await unlockAchievement('night-owl', '', onUnlock);
    if (hour >= 5 && hour < 7) await unlockAchievement('early-bird', '', onUnlock);
  },

  checkXPMilestone: async (onUnlock) => {
    const { totalXP, unlockAchievement } = get();
    if (totalXP >= 1000) await unlockAchievement('arcane-master', '', onUnlock);
  },
}));
