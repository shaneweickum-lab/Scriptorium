import { useRef, useEffect, useState } from 'react';
import type { Editor } from '@tiptap/react';
import {
  MessageSquare, CheckCircle, Trash2, RotateCcw, X, ChevronDown, ChevronRight,
} from 'lucide-react';
import { useCommentStore } from '../../store/commentStore';
import type { InlineComment } from '../../store/commentStore';

interface NewCommentDraft {
  from: number;
  to: number;
  quote: string;
}

interface Props {
  editor: Editor;
  nodeId: string;
  focusedId: string | null;
  onFocusChange: (id: string | null) => void;
  draft: NewCommentDraft | null;
  onDraftCancel: () => void;
  onClose: () => void;
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function CommentCard({
  comment,
  focused,
  editor,
  onFocus,
}: {
  comment: InlineComment;
  focused: boolean;
  editor: Editor;
  onFocus: () => void;
}) {
  const { resolveComment, unresolveComment, deleteComment } = useCommentStore();
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(comment.text);
  const { updateComment } = useCommentStore();
  const cardRef = useRef<HTMLDivElement>(null);

  // Scroll into view when focused
  useEffect(() => {
    if (focused && cardRef.current) {
      cardRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [focused]);

  const handleGoTo = () => {
    onFocus();
    // Find and select the commented text in the editor
    const { doc } = editor.state;
    let from = -1;
    let to = -1;
    doc.descendants((node, pos) => {
      if (from !== -1) return false;
      if (!node.isText) return;
      const mark = node.marks.find(
        (m) => m.type.name === 'comment' && m.attrs.commentId === comment.id
      );
      if (mark) {
        from = pos;
        to = pos + node.nodeSize;
      }
    });
    if (from !== -1) {
      editor.chain().focus().setTextSelection({ from, to }).scrollIntoView().run();
    }
  };

  const handleDelete = () => {
    editor.commands.removeComment(comment.id);
    deleteComment(comment.id);
  };

  const handleSaveEdit = () => {
    if (editText.trim()) updateComment(comment.id, editText.trim());
    setEditing(false);
  };

  return (
    <div
      ref={cardRef}
      onClick={handleGoTo}
      className={`rounded-xl border p-3 cursor-pointer transition-all ${
        comment.resolved
          ? 'border-slate-700/30 bg-slate-800/20 opacity-60'
          : focused
          ? 'border-amber-500/50 bg-amber-900/10 shadow-[0_0_12px_rgba(245,158,11,0.1)]'
          : 'border-slate-700/40 bg-slate-800/30 hover:border-slate-600/60 hover:bg-slate-800/50'
      }`}
    >
      {/* Quote */}
      <p className={`text-[11px] italic mb-2 leading-relaxed line-clamp-2 ${
        comment.resolved ? 'text-slate-600' : 'text-amber-400/70'
      }`}>
        "{comment.quote}"
      </p>

      {/* Comment body */}
      {editing ? (
        <div className="flex flex-col gap-1.5" onClick={(e) => e.stopPropagation()}>
          <textarea
            autoFocus
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSaveEdit(); }
              if (e.key === 'Escape') { setEditing(false); setEditText(comment.text); }
            }}
            className="w-full bg-slate-900 border border-slate-600 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 resize-none focus:outline-none focus:border-indigo-500"
            rows={3}
          />
          <div className="flex gap-1.5">
            <button
              onClick={handleSaveEdit}
              className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition-colors"
            >
              Save
            </button>
            <button
              onClick={() => { setEditing(false); setEditText(comment.text); }}
              className="px-2.5 py-1 rounded-lg text-xs text-slate-400 hover:text-slate-200 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <p
          className={`text-xs leading-relaxed mb-2 ${
            comment.resolved ? 'text-slate-600 line-through' : 'text-slate-300'
          }`}
          onDoubleClick={(e) => { e.stopPropagation(); setEditing(true); }}
          title="Double-click to edit"
        >
          {comment.text}
        </p>
      )}

      {/* Footer */}
      {!editing && (
        <div className="flex items-center justify-between" onClick={(e) => e.stopPropagation()}>
          <span className="text-[10px] text-slate-600">{timeAgo(comment.createdAt)}</span>
          <div className="flex items-center gap-0.5">
            {comment.resolved ? (
              <button
                onClick={() => unresolveComment(comment.id)}
                title="Reopen"
                className="p-1 rounded text-slate-600 hover:text-slate-400 hover:bg-slate-700 transition-colors"
              >
                <RotateCcw size={11} />
              </button>
            ) : (
              <button
                onClick={() => resolveComment(comment.id)}
                title="Resolve"
                className="p-1 rounded text-slate-500 hover:text-emerald-400 hover:bg-slate-700 transition-colors"
              >
                <CheckCircle size={11} />
              </button>
            )}
            <button
              onClick={handleDelete}
              title="Delete"
              className="p-1 rounded text-slate-600 hover:text-red-400 hover:bg-slate-700 transition-colors"
            >
              <Trash2 size={11} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function CommentsPanel({ editor, nodeId, focusedId, onFocusChange, draft, onDraftCancel, onClose }: Props) {
  const { comments, addComment } = useCommentStore();
  const [draftText, setDraftText] = useState('');
  const [showResolved, setShowResolved] = useState(false);
  const draftInputRef = useRef<HTMLTextAreaElement>(null);

  const nodeComments = comments.filter((c) => c.nodeId === nodeId);
  const active = nodeComments.filter((c) => !c.resolved);
  const resolved = nodeComments.filter((c) => c.resolved);

  // Focus the draft input when a new draft is created
  useEffect(() => {
    if (draft) {
      setDraftText('');
      setTimeout(() => draftInputRef.current?.focus(), 50);
    }
  }, [draft]);

  const handleSubmitDraft = () => {
    if (!draft || !draftText.trim()) return;
    const id = addComment(nodeId, draft.quote, draftText.trim());
    // Apply the comment mark to the selected range
    editor
      .chain()
      .focus()
      .setTextSelection({ from: draft.from, to: draft.to })
      .setComment(id)
      .run();
    setDraftText('');
    onDraftCancel();
    onFocusChange(id);
  };

  return (
    <div className="flex flex-col h-full w-72 border-l border-slate-700/40 bg-slate-900/60 shrink-0">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-slate-700/40 shrink-0">
        <div className="flex items-center gap-2">
          <MessageSquare size={13} className="text-amber-400" />
          <span className="text-xs font-semibold text-slate-300">Comments</span>
          {active.length > 0 && (
            <span className="text-[10px] bg-amber-500/20 text-amber-300 rounded-full px-1.5 py-0.5 font-medium">
              {active.length}
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded text-slate-600 hover:text-slate-300 hover:bg-slate-800 transition-colors"
        >
          <X size={13} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3">
        {/* New comment draft input */}
        {draft && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-900/10 p-3 flex flex-col gap-2">
            <p className="text-[10px] text-slate-500 uppercase tracking-wider">New comment</p>
            <p className="text-[11px] italic text-amber-400/70 leading-relaxed line-clamp-2">
              "{draft.quote}"
            </p>
            <textarea
              ref={draftInputRef}
              value={draftText}
              onChange={(e) => setDraftText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmitDraft(); }
                if (e.key === 'Escape') onDraftCancel();
              }}
              placeholder="Add your note or comment…"
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-2 text-xs text-slate-200 placeholder-slate-600 resize-none focus:outline-none focus:border-amber-500/50"
              rows={3}
            />
            <div className="flex gap-1.5">
              <button
                onClick={handleSubmitDraft}
                disabled={!draftText.trim()}
                className="flex-1 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-30 text-white text-xs font-semibold transition-colors"
              >
                Add Comment
              </button>
              <button
                onClick={onDraftCancel}
                className="px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Active comments */}
        {active.length === 0 && !draft ? (
          <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
            <MessageSquare size={24} className="text-slate-700" />
            <p className="text-xs text-slate-600">No comments yet</p>
            <p className="text-[10px] text-slate-700">Select text and click 💬 to add one</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {active.map((c) => (
              <CommentCard
                key={c.id}
                comment={c}
                focused={focusedId === c.id}
                editor={editor}
                onFocus={() => onFocusChange(c.id)}
              />
            ))}
          </div>
        )}

        {/* Resolved section */}
        {resolved.length > 0 && (
          <div className="flex flex-col gap-2">
            <button
              onClick={() => setShowResolved((v) => !v)}
              className="flex items-center gap-1.5 text-[10px] text-slate-600 hover:text-slate-400 uppercase tracking-wider transition-colors"
            >
              {showResolved ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
              Resolved ({resolved.length})
            </button>
            {showResolved && resolved.map((c) => (
              <CommentCard
                key={c.id}
                comment={c}
                focused={focusedId === c.id}
                editor={editor}
                onFocus={() => onFocusChange(c.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
