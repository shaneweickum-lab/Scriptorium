import { useState } from 'react';
import { Modal } from '../common/Modal';
import { Input } from '../common/Input';
import { Button } from '../common/Button';
import { useWritingStore } from '../../store/writingStore';
import { useUIStore } from '../../store/uiStore';
import type { HierarchyLabels } from '../../types';

interface Props { onClose: () => void }

export function ProjectSettings({ onClose }: Props) {
  const projectMeta = useWritingStore((s) => s.projectMeta);
  const updateProjectMeta = useWritingStore((s) => s.updateProjectMeta);
  const updateHierarchyLabels = useWritingStore((s) => s.updateHierarchyLabels);
  const addToast = useUIStore((s) => s.addToast);

  const [title, setTitle] = useState(projectMeta?.title || '');
  const [author, setAuthor] = useState(projectMeta?.author || '');
  const [labels, setLabels] = useState<HierarchyLabels>(
    projectMeta?.hierarchyLabels || { part: 'Part', chapter: 'Chapter', scene: 'Scene', note: 'Note' }
  );

  const handleSave = async () => {
    await updateProjectMeta({ title: title.trim() || 'My Novel', author: author.trim() });
    await updateHierarchyLabels(labels);
    addToast('Settings saved');
    onClose();
  };

  return (
    <Modal title="Project Settings" onClose={onClose} size="md">
      <div className="flex flex-col gap-4">
        <Input
          label="Project Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="My Novel"
        />
        <Input
          label="Author Name"
          value={author}
          onChange={(e) => setAuthor(e.target.value)}
          placeholder="Your Name"
        />

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
