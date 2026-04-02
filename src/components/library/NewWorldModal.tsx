import { useState } from 'react';
import { Modal } from '../common/Modal';
import { Input, Textarea } from '../common/Input';
import { Button } from '../common/Button';
import { WORLD_COLORS } from '../../types';

interface Props {
  onClose: () => void;
  onSave: (name: string, description: string, color: string) => void;
  initialColor: string;
}

export function NewWorldModal({ onClose, onSave, initialColor }: Props) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState(initialColor);

  const handleSubmit = () => {
    if (!name.trim()) return;
    onSave(name.trim(), description.trim(), color);
    onClose();
  };

  return (
    <Modal title="New World Bible" onClose={onClose} size="md">
      <div className="flex flex-col gap-4">
        <Input
          label="World Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. The Realm of Aethoria"
          autoFocus
          onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
        />
        <Textarea
          label="Description (optional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="A brief overview of this world..."
          rows={3}
        />
        <div>
          <p className="text-sm text-slate-400 mb-2">Accent Color</p>
          <div className="flex gap-2 flex-wrap">
            {WORLD_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className="w-7 h-7 rounded-full transition-transform hover:scale-110"
                style={{
                  backgroundColor: c,
                  outline: color === c ? '3px solid white' : 'none',
                  outlineOffset: '2px',
                }}
                title={c}
              />
            ))}
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={handleSubmit} disabled={!name.trim()}>
            Create World
          </Button>
        </div>
      </div>
    </Modal>
  );
}
