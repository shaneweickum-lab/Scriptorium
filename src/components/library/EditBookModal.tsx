import { useState } from 'react';
import { Globe2 } from 'lucide-react';
import { Modal } from '../common/Modal';
import { Input, Textarea } from '../common/Input';
import { Button } from '../common/Button';
import { BOOK_COLORS } from '../../types';
import type { Book, WorldBible } from '../../types';

interface Props {
  book: Book;
  onClose: () => void;
  onSave: (updates: Partial<Book>) => void;
  worldBibles: WorldBible[];
}

export function EditBookModal({ book, onClose, onSave, worldBibles }: Props) {
  const [title, setTitle] = useState(book.title);
  const [author, setAuthor] = useState(book.author);
  const [synopsis, setSynopsis] = useState(book.synopsis);
  const [color, setColor] = useState(book.coverColor);
  const [worldBibleId, setWorldBibleId] = useState(book.worldBibleId ?? '');

  const handleSubmit = () => {
    if (!title.trim()) return;
    onSave({
      title: title.trim(),
      author: author.trim(),
      synopsis: synopsis.trim(),
      coverColor: color,
      worldBibleId: worldBibleId || undefined,
    });
    onClose();
  };

  return (
    <Modal title="Edit Book" onClose={onClose} size="md">
      <div className="flex flex-col gap-4">
        <Input
          label="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          autoFocus
          onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
        />
        <Input
          label="Author"
          value={author}
          onChange={(e) => setAuthor(e.target.value)}
          placeholder="Your name"
        />
        <Textarea
          label="Synopsis"
          value={synopsis}
          onChange={(e) => setSynopsis(e.target.value)}
          placeholder="A brief description of your story..."
          rows={3}
        />
        <div>
          <p className="text-sm text-slate-400 mb-2">Accent Color</p>
          <div className="flex gap-2 flex-wrap">
            {BOOK_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className="w-7 h-7 rounded-full transition-transform hover:scale-110"
                style={{
                  backgroundColor: c,
                  outline: color === c ? '3px solid white' : 'none',
                  outlineOffset: '2px',
                }}
              />
            ))}
          </div>
        </div>

        {/* World Bible link */}
        <div>
          <p className="text-sm text-slate-400 mb-2 flex items-center gap-1.5">
            <Globe2 size={13} className="text-violet-400" />
            Linked World Bible
          </p>
          <select
            value={worldBibleId}
            onChange={(e) => setWorldBibleId(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            <option value="">— None —</option>
            {worldBibles.map((wb) => (
              <option key={wb.id} value={wb.id}>{wb.name}</option>
            ))}
          </select>
          {worldBibleId && (
            <p className="text-xs text-violet-400/70 mt-1">
              World entries will be searchable via @ in the writing editor.
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={handleSubmit} disabled={!title.trim()}>
            Save Changes
          </Button>
        </div>
      </div>
    </Modal>
  );
}
