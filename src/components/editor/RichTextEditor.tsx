import { useEffect, useRef, useCallback, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Typography from '@tiptap/extension-typography';
import CharacterCount from '@tiptap/extension-character-count';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import Highlight from '@tiptap/extension-highlight';
import Mention from '@tiptap/extension-mention';
import Image from '@tiptap/extension-image';
import type { SuggestionProps, SuggestionKeyDownProps } from '@tiptap/suggestion';
import { Sparkles, Check, X as XIcon } from 'lucide-react';
import { EditorToolbar } from './EditorToolbar';
import { MentionPopup, INITIAL_MENTION_STATE } from './MentionPopup';
import type { MentionSuggestionState, MentionPopupHandle } from './MentionPopup';
import { FindReplacePanel } from './FindReplacePanel';
import { SearchAndReplace } from './SearchAndReplace';
import { CommentsPanel } from './CommentsPanel';
import { WritingBlockCard } from './WritingBlockCard';
import { CommentMark } from '../../extensions/CommentMark';
import { useEditorSettings, getEditorFont } from '../../store/editorSettingsStore';
import { useEditorStore } from '../../store/editorStore';
import { useWritingBlock } from '../../features/ai-engine/hooks/useWritingBlock';
import type { WorldEntry, WorldSection } from '../../types';

interface CommentDraft {
  from: number;
  to: number;
  quote: string;
}

interface Props {
  content: string;
  onChange: (json: string) => void;
  placeholder?: string;
  showToolbar?: boolean;
  autoFocus?: boolean;
  worldEntries?: WorldEntry[];
  worldSections?: WorldSection[];
  onMentionClick?: (entryId: string) => void;
  /** Total accumulated word count across all sections in the book */
  totalBookWords?: number;
  /** Node id used to scope inline comments. Comments are hidden when omitted. */
  nodeId?: string;
}

export function RichTextEditor({
  content,
  onChange,
  placeholder = 'Begin writing...',
  showToolbar = true,
  autoFocus = false,
  worldEntries,
  worldSections,
  onMentionClick,
  totalBookWords,
  nodeId,
}: Props) {
  const isInitialMount = useRef(true);
  const lastContent = useRef(content);
  const [editorSettings] = useEditorSettings();
  const editorFont = getEditorFont(editorSettings.fontValue);

  // Keep refs to world data so the mention extension (created once) always sees the latest
  const worldEntriesRef = useRef<WorldEntry[]>(worldEntries ?? []);
  const worldSectionsRef = useRef<WorldSection[]>(worldSections ?? []);
  worldEntriesRef.current = worldEntries ?? [];
  worldSectionsRef.current = worldSections ?? [];

  const onMentionClickRef = useRef(onMentionClick);
  onMentionClickRef.current = onMentionClick;

  // Find & replace state
  const [showFindReplace, setShowFindReplace] = useState(false);

  // Comment state
  const [showComments, setShowComments] = useState(false);
  const [commentDraft, setCommentDraft] = useState<CommentDraft | null>(null);
  const [focusedCommentId, setFocusedCommentId] = useState<string | null>(null);

  // Mention popup state
  const [mentionState, setMentionState] = useState<MentionSuggestionState>(INITIAL_MENTION_STATE);
  const mentionPopupRef = useRef<MentionPopupHandle>(null);

  const suggestionHandlersRef = useRef<{
    onStart?: (props: SuggestionProps<WorldEntry>) => void;
    onUpdate?: (props: SuggestionProps<WorldEntry>) => void;
    onKeyDown?: (props: SuggestionKeyDownProps) => boolean;
    onExit?: () => void;
  }>({});

  suggestionHandlersRef.current.onStart = (props: SuggestionProps<WorldEntry>) => {
    setMentionState({
      active: true,
      items: props.items,
      selectedIndex: 0,
      command: props.command as MentionSuggestionState['command'],
    });
  };

  suggestionHandlersRef.current.onUpdate = (props: SuggestionProps<WorldEntry>) => {
    setMentionState((prev) => ({
      ...prev,
      items: props.items,
      selectedIndex: 0,
      command: props.command as MentionSuggestionState['command'],
    }));
  };

  suggestionHandlersRef.current.onKeyDown = ({ event }: SuggestionKeyDownProps) => {
    if (!mentionPopupRef.current) return false;
    return mentionPopupRef.current.onKeyDown(event);
  };

  suggestionHandlersRef.current.onExit = () => {
    setMentionState(INITIAL_MENTION_STATE);
  };

  const handleSelectEntry = useCallback(
    (entry: WorldEntry, command: (props: { id: string; label: string }) => void) => {
      command({ id: entry.id, label: entry.title });
      setMentionState(INITIAL_MENTION_STATE);
      onMentionClickRef.current?.(entry.id);
    },
    []
  );

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder }),
      Typography,
      CharacterCount,
      Underline,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Highlight,
      SearchAndReplace,
      Image.configure({ allowBase64: true, inline: false }),
      CommentMark,
      Mention.configure({
        HTMLAttributes: { class: 'world-mention' },
        suggestion: {
          char: '@',
          items: ({ query }: { query: string }) => {
            const entries = worldEntriesRef.current;
            if (!query && entries.length > 0) return entries.slice(0, 8);
            return entries
              .filter(
                (e) =>
                  e.title.toLowerCase().includes(query.toLowerCase()) ||
                  e.tags.some((t) => t.toLowerCase().includes(query.toLowerCase()))
              )
              .slice(0, 8);
          },
          render: () => ({
            onStart: (props: SuggestionProps<WorldEntry>) => suggestionHandlersRef.current.onStart?.(props),
            onUpdate: (props: SuggestionProps<WorldEntry>) => suggestionHandlersRef.current.onUpdate?.(props),
            onKeyDown: (props: SuggestionKeyDownProps) =>
              suggestionHandlersRef.current.onKeyDown?.(props) ?? false,
            onExit: () => suggestionHandlersRef.current.onExit?.(),
          }),
        },
      }),
    ],
    content: content ? JSON.parse(content) : '',
    autofocus: autoFocus,
    onUpdate: ({ editor }) => {
      const json = JSON.stringify(editor.getJSON());
      lastContent.current = json;
      onChange(json);
    },
  });

  // Sync external content changes (e.g. when switching nodes)
  useEffect(() => {
    if (!editor) return;
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    if (content !== lastContent.current) {
      lastContent.current = content;
      const parsed = content ? JSON.parse(content) : { type: 'doc', content: [] };
      editor.commands.setContent(parsed);
    }
  }, [content, editor]);

  // Handle clicks on the editor — mentions and comment marks
  const handleEditorClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const target = e.target as HTMLElement;

      // Mention chip click → open reference panel
      const mentionEl = target.closest('[data-type="mention"]') as HTMLElement | null;
      if (mentionEl) {
        const entryId = mentionEl.getAttribute('data-id');
        if (entryId) onMentionClickRef.current?.(entryId);
      }

      // Comment mark click → focus the comment in the panel
      const commentEl = target.closest('[data-comment-id]') as HTMLElement | null;
      if (commentEl && nodeId) {
        const commentId = commentEl.getAttribute('data-comment-id');
        if (commentId) {
          setShowComments(true);
          setFocusedCommentId(commentId);
        }
      }
    },
    [nodeId]
  );

  // Start adding a comment: capture selection then open panel
  const handleAddComment = useCallback(() => {
    if (!editor || !nodeId) return;
    const { from, to, empty } = editor.state.selection;
    if (empty) return;
    const quote = editor.state.doc.textBetween(from, to, ' ').slice(0, 150);
    setCommentDraft({ from, to, quote });
    setShowComments(true);
  }, [editor, nodeId]);

  // ── Meyvn suggestion approval ──────────────────────────────────────────────
  const pendingSuggestion = useEditorStore((s) => s.pendingSuggestion);
  const clearPendingSuggestion = useEditorStore((s) => s.clearPendingSuggestion);

  const handleApplySuggestion = useCallback(() => {
    if (!editor || !pendingSuggestion) return;

    // Convert Meyvn's plain-text prose (with \n\n paragraph breaks) to HTML
    const html = pendingSuggestion.text
      .split(/\n\n+/)
      .filter((p) => p.trim())
      .map((p) => `<p>${p.trim().replace(/\n/g, '<br>')}</p>`)
      .join('');

    if (pendingSuggestion.action === 'append') {
      editor.chain().focus('end').insertContent(html).run();
    } else {
      // insert_at_cursor — respects wherever the author's cursor was last
      editor.chain().focus().insertContent(html).run();
    }

    clearPendingSuggestion();
  }, [editor, pendingSuggestion, clearPendingSuggestion]);

  const suggestionWordCount = pendingSuggestion
    ? pendingSuggestion.text.trim().split(/\s+/).filter(Boolean).length
    : 0;

  // ── Writing block detection ────────────────────────────────────────────────
  const { blockType, idleMinutes, dismiss } = useWritingBlock(editor, nodeId);

  if (!editor) return null;

  return (
    <div
      className="flex flex-col h-full"
      onKeyDown={(e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
          e.preventDefault();
          setShowFindReplace(true);
        }
        // Ctrl+Alt+M → add comment
        if ((e.ctrlKey || e.metaKey) && e.altKey && e.key === 'm') {
          e.preventDefault();
          handleAddComment();
        }
      }}
    >
      {showToolbar && (
        <EditorToolbar
          editor={editor}
          onFindToggle={() => setShowFindReplace((v) => !v)}
          findActive={showFindReplace}
          onAddComment={nodeId ? handleAddComment : undefined}
          onToggleComments={nodeId ? () => setShowComments((v) => !v) : undefined}
          commentsOpen={showComments}
        />
      )}

      {/* Meyvn suggestion approval banner */}
      {pendingSuggestion && (
        <div className="flex items-center gap-2 px-4 py-2 bg-violet-50 border-b border-violet-200 shrink-0">
          <Sparkles size={13} className="text-violet-500 shrink-0" />
          <span className="text-xs text-violet-700 flex-1 truncate">
            Meyvn wrote{' '}
            <span className="font-semibold">{suggestionWordCount} words</span>
            {pendingSuggestion.action === 'append' ? ' — appending to scene' : ' — inserting at cursor'}
          </span>
          <button
            onClick={handleApplySuggestion}
            className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md text-white transition-all shrink-0"
            style={{ background: 'linear-gradient(135deg, #7c3aed, #0d9488)' }}
          >
            <Check size={11} />
            Insert
          </button>
          <button
            onClick={clearPendingSuggestion}
            className="flex items-center justify-center w-6 h-6 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all shrink-0"
            title="Discard Meyvn's suggestion"
          >
            <XIcon size={13} />
          </button>
        </div>
      )}

      {/* Editor + Comments panel side by side */}
      <div className="flex flex-1 overflow-hidden">
        <div className="relative flex-1 overflow-y-auto" onClick={handleEditorClick}
          style={{
            fontFamily: editorFont.stack,
            fontSize: editorSettings.fontSize,
            lineHeight: editorSettings.lineHeight,
          }}
        >
          {showFindReplace && (
            <FindReplacePanel editor={editor} onClose={() => setShowFindReplace(false)} />
          )}
          <div style={{ maxWidth: editorSettings.maxWidthCh < 100 ? `${editorSettings.maxWidthCh}ch` : undefined }}>
            <EditorContent editor={editor} className="h-full" />
          </div>
        </div>

        {showComments && nodeId && (
          <CommentsPanel
            editor={editor}
            nodeId={nodeId}
            focusedId={focusedCommentId}
            onFocusChange={setFocusedCommentId}
            draft={commentDraft}
            onDraftCancel={() => setCommentDraft(null)}
            onClose={() => { setShowComments(false); setCommentDraft(null); }}
          />
        )}
      </div>

      {/* Writing block card — shown above the word count bar when a block is detected */}
      {blockType && (
        <WritingBlockCard
          type={blockType}
          idleMinutes={idleMinutes}
          onDismiss={dismiss}
        />
      )}

      <div className="px-4 py-1 border-t border-slate-100 text-xs text-slate-400 flex items-center gap-4 shrink-0">
        <span>{editor.storage.characterCount.words().toLocaleString()} words</span>
        <span>{editor.storage.characterCount.characters().toLocaleString()} characters</span>
        {totalBookWords !== undefined && (
          <>
            <span className="text-slate-300">·</span>
            <span>
              Book total:{' '}
              <span className="font-medium text-slate-500">{totalBookWords.toLocaleString()}</span> words
            </span>
          </>
        )}
      </div>

      <MentionPopup
        ref={mentionPopupRef}
        state={mentionState}
        sections={worldSectionsRef.current}
        onSelectEntry={handleSelectEntry}
      />
    </div>
  );
}
