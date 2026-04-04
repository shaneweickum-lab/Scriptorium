import { ArrowLeft, Globe2, Pencil, Menu, X } from 'lucide-react';
import { useState } from 'react';
import { useWorldBibleStore } from '../../store/worldBibleStore';
import { SectionList } from '../world/SectionList';
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
  const [showSidebar, setShowSidebar] = useState(false);

  if (!activeWorldBible) return null;

  return (
    <div className="flex h-screen overflow-hidden bg-[#060d18] text-slate-200">
      {/* Mobile overlay backdrop */}
      {showSidebar && (
        <div className="fixed inset-0 z-20 bg-black/50 md:hidden" onClick={() => setShowSidebar(false)} />
      )}

      {/* Sidebar: drawer on mobile, static on desktop */}
      <div className={`
        absolute inset-y-0 left-0 z-30 flex flex-col
        bg-[#0a1628] border-r border-purple-900/30
        transform transition-transform duration-200
        ${showSidebar ? 'translate-x-0' : '-translate-x-full'}
        md:relative md:translate-x-0 md:transform-none md:transition-none md:shrink-0
        w-72 md:w-[280px]
      `}>
        {/* Close button for mobile */}
        <button className="md:hidden absolute top-2 right-2 p-1 text-slate-500 hover:text-slate-300 z-10" onClick={() => setShowSidebar(false)}>
          <X size={16} />
        </button>

        {/* Sidebar header */}
        <div className="p-3 pb-2 border-b border-purple-900/20">
          {/* Back button */}
          <button
            onClick={closeWorldBible}
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-200 transition-colors mb-3"
          >
            <ArrowLeft size={13} />
            Library
          </button>

          {/* World name row */}
          <div className="flex items-center gap-2">
            <div
              className="w-6 h-6 rounded-md flex items-center justify-center shrink-0"
              style={{
                backgroundColor: activeWorldBible.coverColor + '30',
                color: activeWorldBible.coverColor,
              }}
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

        {/* Section + entries tree fills remaining space */}
        <div className="flex-1 overflow-hidden">
          <SectionList />
        </div>
      </div>

      {/* Mobile header bar */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-10 h-12 bg-[#0a1628] border-b border-purple-900/30 flex items-center px-3 gap-2">
        <button onClick={() => setShowSidebar(true)} className="p-2 text-slate-400 hover:text-slate-200">
          <Menu size={18} />
        </button>
        <span className="text-sm font-medium text-slate-200 truncate">{activeWorldBible.name}</span>
        <button onClick={closeWorldBible} className="ml-auto flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300">
          <ArrowLeft size={13} /> Library
        </button>
      </div>

      {/* Entry editor: full width, with top padding on mobile for the header bar */}
      <div className="flex-1 bg-[#060d18] overflow-hidden pt-12 md:pt-0">
        <EntryEditor />
      </div>

      {showEdit && <EditWorldModal onClose={() => setShowEdit(false)} />}
      <ToastContainer />
    </div>
  );
}
