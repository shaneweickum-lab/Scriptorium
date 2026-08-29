import { create } from 'zustand';

export type ActiveView = 'world' | 'writing' | 'assembly' | 'sketchpad';

interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info' | 'achievement';
  achievementEmoji?: string;
  achievementXP?: number;
}

interface UIState {
  activeView: ActiveView;
  showExportModal: boolean;
  showHierarchyConfig: boolean;
  showProjectSettings: boolean;
  showAchievementsModal: boolean;
  showMobileSidebar: boolean;
  showWorldRef: boolean;
  showDistractFree: boolean;
  showGlobalSearch: boolean;
  showMeyvn: boolean;
  showOutlinePanel: boolean;
  showNavSidebar: boolean;
  showAuthModal: boolean;
  authModalTab: 'signin' | 'signup';
  toasts: Toast[];

  setActiveView: (view: ActiveView) => void;
  setShowExportModal: (show: boolean) => void;
  setShowHierarchyConfig: (show: boolean) => void;
  setShowProjectSettings: (show: boolean) => void;
  setShowAchievementsModal: (show: boolean) => void;
  setShowMobileSidebar: (show: boolean) => void;
  setShowWorldRef: (show: boolean) => void;
  setShowDistractFree: (show: boolean) => void;
  setShowGlobalSearch: (show: boolean) => void;
  setShowMeyvn: (show: boolean) => void;
  setShowOutlinePanel: (show: boolean) => void;
  setShowNavSidebar: (show: boolean) => void;
  openAuthModal: (tab?: 'signin' | 'signup') => void;
  closeAuthModal: () => void;
  addToast: (message: string, type?: Toast['type']) => void;
  addAchievementToast: (name: string, xp: number, emoji: string) => void;
  removeToast: (id: string) => void;
}

export const useUIStore = create<UIState>((set) => ({
  activeView: 'writing',
  showExportModal: false,
  showHierarchyConfig: false,
  showProjectSettings: false,
  showAchievementsModal: false,
  showMobileSidebar: false,
  showWorldRef: false,
  showDistractFree: false,
  showGlobalSearch: false,
  showMeyvn: false,
  showOutlinePanel: true,
  showNavSidebar: true,
  showAuthModal: false,
  authModalTab: 'signin' as const,
  toasts: [],

  setActiveView: (view) => set({ activeView: view }),
  setShowExportModal: (show) => set({ showExportModal: show }),
  setShowHierarchyConfig: (show) => set({ showHierarchyConfig: show }),
  setShowProjectSettings: (show) => set({ showProjectSettings: show }),
  setShowAchievementsModal: (show) => set({ showAchievementsModal: show }),
  setShowMobileSidebar: (show) => set({ showMobileSidebar: show }),
  setShowWorldRef: (show) => set({ showWorldRef: show }),
  setShowDistractFree: (show) => set({ showDistractFree: show }),
  setShowGlobalSearch: (show) => set({ showGlobalSearch: show }),
  setShowMeyvn: (show) => set({ showMeyvn: show }),
  setShowOutlinePanel: (show) => set({ showOutlinePanel: show }),
  setShowNavSidebar: (show) => set({ showNavSidebar: show }),
  openAuthModal: (tab = 'signin') => set({ showAuthModal: true, authModalTab: tab }),
  closeAuthModal: () => set({ showAuthModal: false }),

  addToast: (message, type = 'success') => {
    const id = crypto.randomUUID();
    set((state) => ({ toasts: [...state.toasts, { id, message, type }] }));
    setTimeout(() => {
      set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
    }, 3000);
  },

  addAchievementToast: (name, xp, emoji) => {
    const id = crypto.randomUUID();
    const message = xp > 0 ? `${name}  +${xp} XP` : name;
    set((state) => ({
      toasts: [...state.toasts, { id, message, type: 'achievement', achievementEmoji: emoji, achievementXP: xp }],
    }));
    setTimeout(() => {
      set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
    }, 5000);
  },

  removeToast: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}));
