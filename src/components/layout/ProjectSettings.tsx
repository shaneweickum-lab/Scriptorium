import { useState } from 'react';
import { Modal } from '../common/Modal';
import { Input, Textarea } from '../common/Input';
import { Button } from '../common/Button';
import { useLibraryStore } from '../../store/libraryStore';
import { useUIStore } from '../../store/uiStore';
import { BOOK_COLORS } from '../../types';
import type { HierarchyLabels } from '../../types';

interface Props { onClose: () => void }

export function ProjectSettings({ onClose }: Props) {
  const { activeBook, updateBook, updateHierarchyLabels } = useLibraryStore();
  const addToast = useUIStore((s) => s.addToast);

  const [title, setTitle] = useState(activeBook?.title || '');
  const [author, setAuthor] = useState(activeBook?.author || '');
  const [synopsis, setSynopsis] = useState(activeBook?.synopsis || '');
  const [color, setColor] = useState(activeBook?.coverColor || BOOK_COLORS[0]);
  const [labels, setLabels] = useState<HierarchyLabels>(
    activeBook?.hierarchyLabels || { part: 'Part', chapter: 'Chapter', scene: 'Scene', note: 'Note' }
  );

  const handleSave = async () => {
    if (!activeBook) return;
    await updateBook(activeBook.id, {
      title: title.trim() || 'Untitled',
      author: author.trim(),
      synopsis: synopsis.trim(),
      coverColor: color,
    });
    await updateHierarchyLabels(labels);
    addToast('Settings saved');
    onClose();
  };

  return (
    <Modal title="Book Settings" onClose={onClose} size="md">
      <div className="flex flex-col gap-4">
        <Input
          label="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="My Novel"
        />
        <Input
          label="Author"
          value={author}
          onChange={(e) => setAuthor(e.target.value)}
          placeholder="Your Name"
        />
        <Textarea
          label="Synopsis"
          value={synopsis}
          onChange={(e) => setSynopsis(e.target.value)}
          placeholder="A brief description..."
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

        <div>
          <p className="text-sm text-slate-400 mb-2">Hierarchy Labels</p>
          <div className="grid grid-cols-2 gap-2">
            {(['part', 'chapter', 'scene', 'note'] as const).map((key) => (
              <Input
                key={key}
                label={key.charAt(0).toUpperCase() + key.slice(1)}
                value={labels[key]}
                onChange={(e) => setLabels({ ...labels, [key]: e.target.value })}
                placeholder={key.charAt(0).toUpperCase() + key.slice(1)}
              />
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={handleSave}>Save Settings</Button>
        </div>
      </div>
    </Modal>
  );
}
