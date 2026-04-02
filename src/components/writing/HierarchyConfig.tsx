import { useState } from 'react';
import { Modal } from '../common/Modal';
import { Input } from '../common/Input';
import { Button } from '../common/Button';
import { useWritingStore } from '../../store/writingStore';
import { useUIStore } from '../../store/uiStore';
import type { HierarchyLabels } from '../../types';

export function HierarchyConfig() {
  const projectMeta = useWritingStore((s) => s.projectMeta);
  const updateHierarchyLabels = useWritingStore((s) => s.updateHierarchyLabels);
  const setShowHierarchyConfig = useUIStore((s) => s.setShowHierarchyConfig);
  const addToast = useUIStore((s) => s.addToast);

  const [labels, setLabels] = useState<HierarchyLabels>(
    projectMeta?.hierarchyLabels || { part: 'Part', chapter: 'Chapter', scene: 'Scene', note: 'Note' }
  );

  const handleSave = async () => {
    await updateHierarchyLabels(labels);
    addToast('Hierarchy labels updated');
    setShowHierarchyConfig(false);
  };

  return (
    <Modal title="Customize Hierarchy Labels" onClose={() => setShowHierarchyConfig(false)} size="sm">
      <p className="text-sm text-slate-400 mb-4">
        Rename the levels of your story structure to match your workflow.
      </p>
      <div className="space-y-3">
        {(['part', 'chapter', 'scene', 'note'] as const).map((key) => (
          <Input
            key={key}
            label={`Level: ${key.charAt(0).toUpperCase() + key.slice(1)}`}
            value={labels[key]}
            onChange={(e) => setLabels({ ...labels, [key]: e.target.value })}
            placeholder={key.charAt(0).toUpperCase() + key.slice(1)}
          />
        ))}
      </div>
      <div className="flex justify-end gap-2 mt-4">
        <Button variant="ghost" onClick={() => setShowHierarchyConfig(false)}>Cancel</Button>
        <Button variant="primary" onClick={handleSave}>Apply</Button>
      </div>
    </Modal>
  );
}
