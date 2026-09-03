import { create } from 'zustand';
import {
  getSyncDirHandle,
  setSyncDirHandle,
  clearSyncDirHandle,
  syncToFile,
  applyPendingWrites,
  isFSASupported,
} from '../utils/fileSync';
import { useLibraryStore } from './libraryStore';
import { useWritingStore } from './writingStore';

interface SyncStore {
  handle: FileSystemDirectoryHandle | null;
  folderName: string | null;
  syncing: boolean;
  lastSynced: Date | null;
  pendingApplied: number;
  supported: boolean;

  load: () => Promise<void>;
  pickFolder: () => Promise<void>;
  syncNow: () => Promise<void>;
  disconnect: () => Promise<void>;
}

export const useSyncStore = create<SyncStore>((set, get) => ({
  handle: null,
  folderName: null,
  syncing: false,
  lastSynced: null,
  pendingApplied: 0,
  supported: isFSASupported(),

  load: async () => {
    if (!isFSASupported()) return;
    const h = await getSyncDirHandle();
    if (h) set({ handle: h, folderName: h.name });
  },

  pickFolder: async () => {
    if (!isFSASupported()) return;
    try {
      const h = await (window as unknown as { showDirectoryPicker: (opts?: object) => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker({ mode: 'readwrite' });
      await setSyncDirHandle(h);
      set({ handle: h, folderName: h.name });
      await get().syncNow();
    } catch {
      // user cancelled or permission denied — ignore
    }
  },

  syncNow: async () => {
    const { handle } = get();
    if (!handle) return;
    set({ syncing: true });
    try {
      const applied = await applyPendingWrites(handle);
      if (applied > 0) {
        // applyPendingWrites writes straight to Dexie, bypassing
        // writingStore — refresh it so an open editor doesn't keep
        // showing stale content, and so cloud auto-sync (which watches
        // writingStore) notices these edits and pushes them too.
        const activeBookId = useLibraryStore.getState().activeBook?.id;
        if (activeBookId) {
          const prevActiveNodeId = useWritingStore.getState().activeNodeId;
          await useWritingStore.getState().loadFromDB(activeBookId);
          if (prevActiveNodeId) useWritingStore.getState().setActiveNode(prevActiveNodeId);
        }
      }
      await syncToFile(handle);
      set({ syncing: false, lastSynced: new Date(), pendingApplied: applied });
    } catch {
      set({ syncing: false });
    }
  },

  disconnect: async () => {
    await clearSyncDirHandle();
    set({ handle: null, folderName: null, lastSynced: null, pendingApplied: 0 });
  },
}));
