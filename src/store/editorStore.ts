/**
 * editorStore — lightweight bridge between the active TipTap editor and
 * the Maven AI panel.
 *
 * The TipTap editor instance lives inside RichTextEditor and cannot be
 * accessed directly from outside.  NodeEditor publishes plain-text snapshots
 * here (debounced alongside the normal auto-save) so Maven always has an
 * up-to-date view of what the author is actively writing.
 *
 * Kept intentionally minimal — this store is a read-only window into the
 * editor for AI consumers, not a replacement for writingStore.
 */

import { create } from 'zustand';

interface EditorState {
  /** Plain-text content of the currently open node (debounced ~500 ms). */
  liveContent: string;
  /** Title of the currently open writing node (scene / chapter / note). */
  activeNodeTitle: string;

  /**
   * Called by NodeEditor every time content is saved.
   * @param content    Plain text extracted from TipTap JSON.
   * @param nodeTitle  Title of the node being edited.
   */
  setLiveContext: (content: string, nodeTitle: string) => void;
  /** Called when the user closes or navigates away from all nodes. */
  clearLiveContext: () => void;
}

export const useEditorStore = create<EditorState>((set) => ({
  liveContent: '',
  activeNodeTitle: '',

  setLiveContext: (content, nodeTitle) =>
    set({ liveContent: content, activeNodeTitle: nodeTitle }),

  clearLiveContext: () =>
    set({ liveContent: '', activeNodeTitle: '' }),
}));
