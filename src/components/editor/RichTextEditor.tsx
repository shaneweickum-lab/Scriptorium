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
import type { SuggestionProps, SuggestionKeyDownProps } from '@tiptap/suggestion';
import { EditorToolbar } from './EditorToolbar';
import { MentionPopup, INITIAL_MENTION_STATE } from './MentionPopup';
import type { MentionSuggestionState, MentionPopupHandle } from './MentionPopup';
import { FindReplacePanel } from './FindReplacePanel';
import { SearchAndReplace } from './SearchAndReplace';
import type { WorldEntry, WorldSection } from '../../types';

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
}: Props) {
  const isInitialMount = useRef(true);
  const lastContent = useRef(content);

  // Keep refs to world data so the mention extension (created once) always sees the latest
  const worldEntriesRef = useRef<WorldEntry[]>(worldEntries ?? []);
  const worldSectionsRef = useRef<WorldSection[]>(worldSections ?? []);
  worldEntriesRef.current = worldEntries ?? [];
  worldSectionsRef.current = worldSections ?? [];

  const onMentionClickRef = useRef(onMentionClick);
  onMentionClickRef.current = onMentionClick;

  // Find & replace state
  const [showFindReplace, setShowFindReplace] = useState(false);

  // Mention popup state
  const [mentionState, setMentionState] = useState<MentionSuggestionState>(INITIAL_MENTION_STATE);
  const mentionPopupRef = useRef<MentionPopupHandle>(null);

  // These callbacks are set during render and read by the suggestion render() callbacks
  const suggestionHandlersRef = useRef<{
    onStart?: (props: SuggestionProps<WorldEntry>) => void;
    onUpdate?: (props: SuggestionProps<WorldEntry>) => void;
    onKeyDown?: (props: SuggestionKeyDownProps) => boolean;
    onExit?: () => void;
  }>({});

  // Set up the suggestion render callbacks (read from the ref inside the extension)
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
      // Open the reference panel for this entry
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
      Mention.configure({
        HTMLAttributes: { class: 'world-mention' },
        suggestion: {
          char: '@',
          items: ({ query }: { query: string }) => {
            const entries = worldEntriesRef.current;
            if (!query && entries.length > 0) {
              return entries.slice(0, 8);
            }
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

  // Handle clicks on rendered mention nodes in the editor
  const handleEditorClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const target = e.target as HTMLElement;
      const mentionEl = target.closest('[data-type="mention"]') as HTMLElement | null;
      if (mentionEl) {
        const entryId = mentionEl.getAttribute('data-id');
        if (entryId) onMentionClickRef.current?.(entryId);
      }
    },
    []
  );

  if (!editor) return null;

  return (
    <div
      className="flex flex-col h-full"
      onKeyDown={(e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
          e.preventDefault();
          setShowFindReplace(true);
        }
      }}
    >
      {showToolbar && (
        <EditorToolbar
          editor={editor}
          onFindToggle={() => setShowFindReplace((v) => !v)}
          findActive={showFindReplace}
        />
      )}
      <div className="relative flex-1 overflow-y-auto" onClick={handleEditorClick}>
        {showFindReplace && (
          <FindReplacePanel editor={editor} onClose={() => setShowFindReplace(false)} />
        )}
        <EditorContent editor={editor} className="h-full" />
      </div>
      <div className="px-4 py-1 border-t border-slate-700/30 text-xs text-slate-600 flex items-center gap-4">
        <span>{editor.storage.characterCount.words().toLocaleString()} words</span>
        <span>{editor.storage.characterCount.characters().toLocaleString()} characters</span>
        {totalBookWords !== undefined && (
          <>
            <span className="text-slate-700">·</span>
            <span className="text-slate-500">
              Book total:{' '}
              <span className="text-slate-400 font-medium">{totalBookWords.toLocaleString()}</span> words
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
