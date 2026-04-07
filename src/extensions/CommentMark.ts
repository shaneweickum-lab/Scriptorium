import { Mark, mergeAttributes } from '@tiptap/core';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    comment: {
      /** Wrap the current selection with a comment mark */
      setComment: (commentId: string) => ReturnType;
      /** Remove the comment mark with the given id from the entire document */
      removeComment: (commentId: string) => ReturnType;
    };
  }
}

export const CommentMark = Mark.create({
  name: 'comment',

  // Don't expand when typing at the edge
  inclusive: false,
  spanning: true,

  addAttributes() {
    return {
      commentId: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-comment-id'),
        renderHTML: (attrs) => ({ 'data-comment-id': attrs.commentId }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-comment-id]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { class: 'editor-comment' }), 0];
  },

  addCommands() {
    return {
      setComment:
        (commentId: string) =>
        ({ commands }) =>
          commands.setMark(this.name, { commentId }),

      removeComment:
        (commentId: string) =>
        ({ state, dispatch }) => {
          const { tr, doc } = state;
          let found = false;
          doc.descendants((node, pos) => {
            if (!node.isText) return;
            const mark = node.marks.find(
              (m) => m.type.name === 'comment' && m.attrs.commentId === commentId
            );
            if (mark) {
              tr.removeMark(pos, pos + node.nodeSize, mark);
              found = true;
            }
          });
          if (found && dispatch) dispatch(tr);
          return found;
        },
    };
  },
});
