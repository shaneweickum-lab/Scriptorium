import { useState } from 'react';
import { Modal } from '../common/Modal';
import { Input, Textarea } from '../common/Input';
import { Button } from '../common/Button';
import { BOOK_COLORS } from '../../types';

interface Props {
  onClose: () => void;
  onSave: (title: string, author: string, synopsis: string, color: string) => void;
  initialColor: string;
}

export function NewBookModal({ onClose, onSave, initialColor }: Props) {
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [synopsis, setSynopsis] = useState('');
  const [color, setColor] = useState(initialColor);

  const handleSubmit = () => {
    if (!title.trim()) return;
    onSave(title.trim(), author.trim(), synopsis.trim(), color);
    onClose();
  };

  return (
    <Modal title="New Book" onClose={onClose} size="md">
      <div className="flex flex-col gap-4">
        <Input
          label="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="My Novel"
          autoFocus
          onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
        />
        <Input
          label="Author (optional)"
          value={author}
          onChange={(e) => setAuthor(e.target.value)}
          placeholder="Your name"
        />
        <Textarea
          label="Synopsis (optional)"
          value={synopsis}
          onChange={(e) => setSynopsis(e.target.value)}
          placeholder="A brief description of your story..."
          rows={3}
        />
        {/* Color picker */}
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
                  outline: color === c ? `3px solid white` : 'none',
                  outlineOffset: '2px',
                }}
                title={c}
              />
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={handleSubmit} disabled={!title.trim()}>
            Create Book
          </Button>
        </div>
      </div>
    </Modal>
  );
}
