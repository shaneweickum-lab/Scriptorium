import { ArrowLeft, Globe2, Pencil } from 'lucide-react';
import { useState } from 'react';
import { useWorldBibleStore } from '../../store/worldBibleStore';
import { SectionList } from '../world/SectionList';
import { EntryList } from '../world/EntryList';
import { EntryEditor } from '../world/EntryEditor';
import { ToastContainer } from '../common/Toast';
import { Modal } from '../common/Modal';
import { Input, Textarea } from '../common/Input';
import { Button } from '../common/Button';
import { WORLD_COLORS } from '../../types';

function EditWorldModal({ onClose }: { onClose: () => void }) {
  const { activeWorldBible, updateWorldBible } = useWorldBibleStore();
  const [name, setName] = useState(activeWorldBible?.name ?? '');
  const [description, setDescription] = useState(activeWorldBible?.description ?? '');
  const [color, setColor] = useState(activeWorldBible?.coverColor ?? WORLD_COLORS[0]);

  const handleSave = () => {
    if (!name.trim() || !activeWorldBible) return;
    updateWorldBible(activeWorldBible.id, { name: name.trim(), description, coverColor: color });
    onClose();
  };

  return (
    <Modal title="Edit World" onClose={onClose} size="md">
      <div className="flex flex-col gap-4">
        <Input label="World Name" value={name} onChange={(e) => setName(e.target.value)} autoFocus
          onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }} />
        <Textarea label="Description" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
        <div>
          <p className="text-sm text-slate-400 mb-2">Accent Color</p>
          <div className="flex gap-2 flex-wrap">
            {WORLD_COLORS.map((c) => (
              <button key={c} onClick={() => setColor(c)}
                className="w-7 h-7 rounded-full transition-transform hover:scale-110"
                style={{ backgroundColor: c, outline: color === c ? '3px solid white' : 'none', outlineOffset: '2px' }} />
            ))}
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={handleSave} disabled={!name.trim()}>Save</Button>
        </div>
      </div>
    </Modal>
  );
}

export function WorldBibleEditorShell() {
  const { activeWorldBible, closeWorldBible } = useWorldBibleStore();
  const [showEdit, setShowEdit] = useState(false);

  if (!activeWorldBible) return null;

  return (
    <div className="flex h-screen overflow-hidden bg-slate-900 text-slate-200">
      {/* Sidebar */}
      <div className="w-44 shrink-0 border-r border-slate-700/50 bg-slate-900/50 flex flex-col">
        {/* Header */}
        <div className="p-3 border-b border-slate-700/50">
          <button
            onClick={closeWorldBible}
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-200 transition-colors mb-3"
          >
            <ArrowLeft size={13} />
            Library
          </button>
          <div className="flex items-center gap-2">
            <div
              className="w-6 h-6 rounded-md flex items-center justify-center shrink-0"
              style={{ backgroundColor: activeWorldBible.coverColor + '30', color: activeWorldBible.coverColor }}
            >
              <Globe2 size={13} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-slate-200 truncate leading-tight">
                {activeWorldBible.name}
              </p>
              <p className="text-[10px] text-slate-500 mt-0.5">World Bible</p>
            </div>
            <button
              onClick={() => setShowEdit(true)}
              className="shrink-0 p-1 rounded hover:bg-slate-700 text-slate-600 hover:text-slate-300 transition-colors"
              title="Edit world"
            >
              <Pencil size={11} />
            </button>
          </div>
        </div>
        <SectionList />
      </div>

      {/* Entry list */}
      <div className="w-60 shrink-0 border-r border-slate-700/50 bg-slate-900/30">
        <EntryList />
      </div>

      {/* Entry editor */}
      <div className="flex-1 bg-slate-900/20">
        <EntryEditor />
      </div>

      {showEdit && <EditWorldModal onClose={() => setShowEdit(false)} />}
      <ToastContainer />
    </div>
  );
}
