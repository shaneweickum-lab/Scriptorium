import { create } from 'zustand';

export type ActiveView = 'world' | 'writing' | 'assembly';

interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

interface UIState {
  activeView: ActiveView;
  showExportModal: boolean;
  showHierarchyConfig: boolean;
  showProjectSettings: boolean;
  showMobileSidebar: boolean;
  toasts: Toast[];

  setActiveView: (view: ActiveView) => void;
  setShowExportModal: (show: boolean) => void;
  setShowHierarchyConfig: (show: boolean) => void;
  setShowProjectSettings: (show: boolean) => void;
  setShowMobileSidebar: (show: boolean) => void;
  addToast: (message: string, type?: Toast['type']) => void;
  removeToast: (id: string) => void;
}

export const useUIStore = create<UIState>((set) => ({
  activeView: 'writing',
  showExportModal: false,
  showHierarchyConfig: false,
  showProjectSettings: false,
  showMobileSidebar: false,
  toasts: [],

  setActiveView: (view) => set({ activeView: view }),
  setShowExportModal: (show) => set({ showExportModal: show }),
  setShowHierarchyConfig: (show) => set({ showHierarchyConfig: show }),
  setShowProjectSettings: (show) => set({ showProjectSettings: show }),
  setShowMobileSidebar: (show) => set({ showMobileSidebar: show }),

  addToast: (message, type = 'success') => {
    const id = crypto.randomUUID();
    set((state) => ({ toasts: [...state.toasts, { id, message, type }] }));
    setTimeout(() => {
      set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
    }, 3000);
  },

  removeToast: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}));
