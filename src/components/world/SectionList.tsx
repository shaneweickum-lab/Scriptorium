import { useState } from 'react';
import {
  Users, Calendar, Leaf, Sparkles, BookOpen,
  Plus, Pencil, Trash2, GripVertical,
} from 'lucide-react';
import { useWorldStore } from '../../store/worldStore';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { Modal } from '../common/Modal';
import { Input } from '../common/Input';
import { Button } from '../common/Button';
import type { WorldSection } from '../../types';

const ICONS: Record<string, React.FC<{ size?: number }>> = {
  Users, Calendar, Leaf, Sparkles, BookOpen,
};

const ICON_OPTIONS = ['BookOpen', 'Users', 'Calendar', 'Leaf', 'Sparkles'];

function SectionIcon({ name, size = 16 }: { name: string; size?: number }) {
  const Icon = ICONS[name] || BookOpen;
  return <Icon size={size} />;
}

interface EditModalProps {
  section?: WorldSection;
  onClose: () => void;
  onSave: (name: string, icon: string) => void;
}

function EditModal({ section, onClose, onSave }: EditModalProps) {
  const [name, setName] = useState(section?.name || '');
  const [icon, setIcon] = useState(section?.icon || 'BookOpen');

  return (
    <Modal title={section ? 'Rename Section' : 'New Section'} onClose={onClose} size="sm">
      <div className="flex flex-col gap-4">
        <Input
          label="Section Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Factions, Magic Systems"
          autoFocus
          onKeyDown={(e) => { if (e.key === 'Enter' && name.trim()) { onSave(name.trim(), icon); onClose(); } }}
        />
        <div>
          <p className="text-sm text-slate-400 mb-2">Icon</p>
          <div className="flex gap-2">
            {ICON_OPTIONS.map((opt) => (
              <button
                key={opt}
                onClick={() => setIcon(opt)}
                className={`p-2 rounded-lg transition-colors ${icon === opt ? 'bg-indigo-600 text-white' : 'bg-slate-700 text-slate-400 hover:bg-slate-600'}`}
                title={opt}
              >
                <SectionIcon name={opt} size={18} />
              </button>
            ))}
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={() => { if (name.trim()) { onSave(name.trim(), icon); onClose(); } }}>
            {section ? 'Save' : 'Create'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export function SectionList() {
  const sections = useWorldStore((s) => s.sections);
  const activeSectionId = useWorldStore((s) => s.activeSectionId);
  const setActiveSection = useWorldStore((s) => s.setActiveSection);
  const addSection = useWorldStore((s) => s.addSection);
  const updateSection = useWorldStore((s) => s.updateSection);
  const deleteSection = useWorldStore((s) => s.deleteSection);

  const [editingSection, setEditingSection] = useState<WorldSection | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<WorldSection | null>(null);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-700/50">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Sections</span>
        <button
          onClick={() => setShowAddModal(true)}
          className="text-slate-500 hover:text-slate-300 transition-colors"
          title="Add section"
        >
          <Plus size={16} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto py-1">
        {sections.map((section) => (
          <div
            key={section.id}
            className={`group flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors ${
              activeSectionId === section.id
                ? 'bg-indigo-600/20 text-indigo-300'
                : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
            }`}
            onClick={() => setActiveSection(section.id)}
          >
            <GripVertical size={14} className="text-slate-600 opacity-0 group-hover:opacity-100" />
            <SectionIcon name={section.icon} size={15} />
            <span className="flex-1 text-sm truncate">{section.name}</span>
            <div className="flex gap-1 opacity-0 group-hover:opacity-100">
              <button
                onClick={(e) => { e.stopPropagation(); setEditingSection(section); }}
                className="p-1 rounded hover:bg-slate-700 transition-colors"
                title="Rename"
              >
                <Pencil size={12} />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setDeleteTarget(section); }}
                className="p-1 rounded hover:bg-red-900/50 text-red-400 transition-colors"
                title="Delete"
              >
                <Trash2 size={12} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {showAddModal && (
        <EditModal
          onClose={() => setShowAddModal(false)}
          onSave={(name, icon) => addSection(name, icon)}
        />
      )}
      {editingSection && (
        <EditModal
          section={editingSection}
          onClose={() => setEditingSection(null)}
          onSave={(name, icon) => updateSection(editingSection.id, { name, icon })}
        />
      )}
      {deleteTarget && (
        <ConfirmDialog
          title="Delete Section"
          message={`Delete "${deleteTarget.name}" and all its entries? This cannot be undone.`}
          confirmLabel="Delete"
          danger
          onConfirm={() => deleteSection(deleteTarget.id)}
          onClose={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
