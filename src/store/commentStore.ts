import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface InlineComment {
  id: string;
  nodeId: string;
  quote: string;       // snippet of the highlighted text
  text: string;        // comment body
  resolved: boolean;
  createdAt: number;
}

interface CommentState {
  comments: InlineComment[];
  addComment: (nodeId: string, quote: string, text: string) => string;
  updateComment: (id: string, text: string) => void;
  resolveComment: (id: string) => void;
  unresolveComment: (id: string) => void;
  deleteComment: (id: string) => void;
}

export const useCommentStore = create<CommentState>()(
  persist(
    (set) => ({
      comments: [],

      addComment: (nodeId, quote, text) => {
        const id = crypto.randomUUID();
        set((s) => ({
          comments: [
            ...s.comments,
            { id, nodeId, quote, text, resolved: false, createdAt: Date.now() },
          ],
        }));
        return id;
      },

      updateComment: (id, text) =>
        set((s) => ({
          comments: s.comments.map((c) => (c.id === id ? { ...c, text } : c)),
        })),

      resolveComment: (id) =>
        set((s) => ({
          comments: s.comments.map((c) => (c.id === id ? { ...c, resolved: true } : c)),
        })),

      unresolveComment: (id) =>
        set((s) => ({
          comments: s.comments.map((c) => (c.id === id ? { ...c, resolved: false } : c)),
        })),

      deleteComment: (id) =>
        set((s) => ({ comments: s.comments.filter((c) => c.id !== id) })),
    }),
    { name: 'wp_inline_comments' }
  )
);
