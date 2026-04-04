import { useState } from 'react';
import {
  Clock, Map, Zap, Users, User, Leaf, AlertCircle, HelpCircle, CheckCircle2,
  BookOpen, Calendar, Sparkles,
  Plus, Pencil, Trash2, ChevronDown, ChevronRight,
} from 'lucide-react';
import { useWorldStore } from '../../store/worldStore';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { Modal } from '../common/Modal';
import { Input } from '../common/Input';
import { Button } from '../common/Button';
import type { WorldSection } from '../../types';

const ICONS: Record<string, React.FC<{ size?: number; className?: string }>> = {
  Clock, Map, Zap, Users, User, Leaf, AlertCircle, HelpCircle, CheckCircle2,
  BookOpen, Calendar, Sparkles,
};

const ICON_OPTIONS = [
  'Clock', 'Map', 'Zap', 'Users', 'User', 'Leaf',
  'AlertCircle', 'HelpCircle', 'CheckCircle2', 'BookOpen',
];

function SectionIcon({ name, size = 14 }: { name: string; size?: number }) {
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
          onKeyDown={(e) => {
            if (e.key === 'Enter' && name.trim()) { onSave(name.trim(), icon); onClose(); }
          }}
        />
        <div>
          <p className="text-sm text-slate-400 mb-2">Icon</p>
          <div className="flex gap-2 flex-wrap">
            {ICON_OPTIONS.map((opt) => (
              <button
                key={opt}
                onClick={() => setIcon(opt)}
                className={`p-2 rounded-lg transition-colors ${
                  icon === opt
                    ? 'bg-violet-600 text-white'
                    : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
                }`}
                title={opt}
              >
                <SectionIcon name={opt} size={16} />
              </button>
            ))}
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            onClick={() => { if (name.trim()) { onSave(name.trim(), icon); onClose(); } }}
          >
            {section ? 'Save' : 'Create'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export function SectionList() {
  const sections = useWorldStore((s) => s.sections);
  const entries = useWorldStore((s) => s.entries);
  const activeSectionId = useWorldStore((s) => s.activeSectionId);
  const activeEntryId = useWorldStore((s) => s.activeEntryId);
  const setActiveSection = useWorldStore((s) => s.setActiveSection);
  const setActiveEntry = useWorldStore((s) => s.setActiveEntry);
  const addSection = useWorldStore((s) => s.addSection);
  const updateSection = useWorldStore((s) => s.updateSection);
  const deleteSection = useWorldStore((s) => s.deleteSection);
  const addEntry = useWorldStore((s) => s.addEntry);
  const bookId = useWorldStore((s) => s.editingContextId ?? '');

  const [editingSection, setEditingSection] = useState<WorldSection | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<WorldSection | null>(null);
  // Expanded sections set — default all active section expanded
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSectionClick = (sectionId: string) => {
    setActiveSection(sectionId);
    toggleExpand(sectionId);
  };

  const handleEntryClick = (sectionId: string, entryId: string) => {
    setActiveSection(sectionId);
    setActiveEntry(entryId);
  };

  const handleAddEntry = async (e: React.MouseEvent, sectionId: string) => {
    e.stopPropagation();
    await addEntry(bookId, sectionId);
    // Make sure the section is expanded
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.add(sectionId);
      return next;
    });
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-3 pt-4 pb-2">
        <span className="arcane-section-header tracking-[0.14em]">World Building Sections</span>
      </div>

      {/* Section + entries tree */}
      <div className="flex-1 overflow-y-auto py-1">
        {sections.map((section) => {
          const isActive = activeSectionId === section.id;
          const isExpanded = expandedIds.has(section.id);
          const sectionEntries = entries.filter((e) => e.sectionId === section.id);

          return (
            <div key={section.id}>
              {/* Section row */}
              <div
                className={`group flex items-center gap-1.5 px-3 py-2 cursor-pointer transition-all ${
                  isActive
                    ? 'arcane-active bg-violet-900/20 text-violet-200 border-l-2 border-violet-400'
                    : 'text-purple-300/80 hover:bg-violet-900/10 hover:text-purple-200 border-l-2 border-transparent'
                }`}
                onClick={() => handleSectionClick(section.id)}
              >
                {/* Expand/collapse chevron */}
                <span className="shrink-0 text-purple-500/60">
                  {isExpanded
                    ? <ChevronDown size={12} />
                    : <ChevronRight size={12} />
                  }
                </span>

                {/* Section icon */}
                <span className="shrink-0 opacity-70">
                  <SectionIcon name={section.icon} size={13} />
                </span>

                {/* Section name */}
                <span className="flex-1 text-[11px] font-bold tracking-[0.12em] uppercase truncate">
                  {section.name}
                </span>

                {/* Hover actions */}
                <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  {/* Add entry */}
                  <button
                    onClick={(e) => handleAddEntry(e, section.id)}
                    className="p-1 rounded hover:bg-violet-700/40 text-violet-400/70 hover:text-violet-300 transition-colors"
                    title="Add entry"
                  >
                    <Plus size={11} />
                  </button>
                  {/* Edit section */}
                  <button
                    onClick={(e) => { e.stopPropagation(); setEditingSection(section); }}
                    className="p-1 rounded hover:bg-slate-700/50 text-slate-500 hover:text-slate-300 transition-colors"
                    title="Rename section"
                  >
                    <Pencil size={11} />
                  </button>
                  {/* Delete section */}
                  <button
                    onClick={(e) => { e.stopPropagation(); setDeleteTarget(section); }}
                    className="p-1 rounded hover:bg-red-900/40 text-slate-500 hover:text-red-400 transition-colors"
                    title="Delete section"
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              </div>

              {/* Entries sub-list */}
              {isExpanded && (
                <div className="ml-4 border-l border-purple-900/30 pl-1">
                  {sectionEntries.length === 0 ? (
                    <div className="px-3 py-1.5 text-[11px] text-slate-600 italic">
                      No entries yet
                    </div>
                  ) : (
                    sectionEntries.map((entry) => {
                      const isEntryActive = activeEntryId === entry.id;
                      return (
                        <div
                          key={entry.id}
                          onClick={() => handleEntryClick(section.id, entry.id)}
                          className={`flex items-center gap-2 px-3 py-1.5 cursor-pointer rounded-sm transition-colors text-[13px] ${
                            isEntryActive
                              ? 'text-violet-300 font-medium bg-violet-900/15'
                              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                          }`}
                        >
                          <span className={`w-1 h-1 rounded-full shrink-0 ${isEntryActive ? 'bg-violet-400' : 'bg-slate-600'}`} />
                          <span className="truncate">{entry.title || 'Untitled'}</span>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Bottom: new section button */}
      <div className="p-3 border-t border-purple-900/20">
        <button
          onClick={() => setShowAddModal(true)}
          className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-[11px] font-semibold tracking-[0.08em] uppercase text-purple-400/60 hover:text-purple-300 hover:bg-violet-900/20 transition-colors border border-dashed border-purple-900/30 hover:border-violet-700/40"
        >
          <Plus size={12} />
          New Section
        </button>
      </div>

      {showAddModal && (
        <EditModal
          onClose={() => setShowAddModal(false)}
          onSave={(name, icon) => addSection(bookId, name, icon)}
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
