import { useEffect, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Typography from '@tiptap/extension-typography';
import CharacterCount from '@tiptap/extension-character-count';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import Highlight from '@tiptap/extension-highlight';
import { EditorToolbar } from './EditorToolbar';

interface Props {
  content: string;
  onChange: (json: string) => void;
  placeholder?: string;
  showToolbar?: boolean;
  autoFocus?: boolean;
}

export function RichTextEditor({ content, onChange, placeholder = 'Begin writing...', showToolbar = true, autoFocus = false }: Props) {
  const isInitialMount = useRef(true);
  const lastContent = useRef(content);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder }),
      Typography,
      CharacterCount,
      Underline,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Highlight,
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

  if (!editor) return null;

  return (
    <div className="flex flex-col h-full">
      {showToolbar && <EditorToolbar editor={editor} />}
      <div className="flex-1 overflow-y-auto">
        <EditorContent editor={editor} className="h-full" />
      </div>
      <div className="px-4 py-1 border-t border-slate-700/30 text-xs text-slate-600 flex gap-4">
        <span>{editor.storage.characterCount.words()} words</span>
        <span>{editor.storage.characterCount.characters()} characters</span>
      </div>
    </div>
  );
}
