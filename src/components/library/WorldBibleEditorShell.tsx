import { ArrowLeft, Globe2, Pencil, Menu, X, Download, Upload } from 'lucide-react';
import { FocusTimer } from '../timer/FocusTimer';
import { useState, useEffect, useRef } from 'react';
import { useWorldBibleStore } from '../../store/worldBibleStore';
import { useWorldStore } from '../../store/worldStore';
import { useAchievementStore } from '../../store/achievementStore';
import { useUIStore } from '../../store/uiStore';
import { db } from '../../db/database';
import { SectionList } from '../world/SectionList';
import { EntryEditor } from '../world/EntryEditor';
import { ToastContainer } from '../common/Toast';
import { Modal } from '../common/Modal';
import { Input, Textarea } from '../common/Input';
import { Button } from '../common/Button';
import { WORLD_COLORS } from '../../types';
import { tiptapJsonToText, countWords } from '../../utils/tiptapToHtml';
import { DEFAULT_SECTION_TEMPLATES } from '../../types';

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
  const entries = useWorldStore((s) => s.entries);
  const sections = useWorldStore((s) => s.sections);
  const loadWorld = useWorldStore((s) => s.loadFromDB);
  const { checkWorldEntries, checkXPMilestone } = useAchievementStore();
  const addAchievementToast = useUIStore((s) => s.addAchievementToast);
  const addToast = useUIStore((s) => s.addToast);
  const [showEdit, setShowEdit] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);
  const loadFileRef = useRef<HTMLInputElement>(null);

  const handleSaveWorldBible = async () => {
    if (!activeWorldBible) return;
    try {
      const wbId = activeWorldBible.id;
      const [wbSections, wbEntries] = await Promise.all([
        db.worldSections.where('bookId').equals(wbId).toArray(),
        db.worldEntries.where('bookId').equals(wbId).toArray(),
      ]);
      const data = { type: 'worldBible', worldBible: activeWorldBible, sections: wbSections, entries: wbEntries, version: 1 };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${activeWorldBible.name.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-world-bible.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      addToast('World Bible saved');
    } catch {
      addToast('Failed to save World Bible', 'error');
    }
  };

  const handleLoadWorldBible = async (file: File) => {
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (data.type !== 'worldBible' || !data.worldBible) {
        addToast('Invalid World Bible file', 'error');
        return;
      }
      const wbId = data.worldBible.id;
      await db.worldSections.where('bookId').equals(wbId).delete();
      await db.worldEntries.where('bookId').equals(wbId).delete();
      await db.worldBibles.put(data.worldBible);
      if (data.sections?.length) await db.worldSections.bulkPut(data.sections);
      if (data.entries?.length) await db.worldEntries.bulkPut(data.entries);
      await loadWorld(wbId);
      addToast('World Bible loaded');
    } catch {
      addToast('Failed to load World Bible', 'error');
    }
  };

  // Check world bible achievements whenever entries change
  useEffect(() => {
    if (!activeWorldBible || entries.length === 0) return;

    const totalWords = entries.reduce((sum, e) => {
      return sum + countWords(tiptapJsonToText(e.content));
    }, 0);

    // Find which default section names have at least one entry
    const defaultNames = DEFAULT_SECTION_TEMPLATES.map((t) => t.name);
    const defaultSectionIds = sections
      .filter((s) => defaultNames.includes(s.name))
      .map((s) => s.id);
    const coveredSectionIds = defaultSectionIds.filter((sId) =>
      entries.some((e) => e.sectionId === sId)
    );

    const onUnlock = (name: string, xp: number, emoji: string) => addAchievementToast(name, xp, emoji);
    checkWorldEntries(activeWorldBible.id, entries.length, totalWords, coveredSectionIds, onUnlock);
    checkXPMilestone(onUnlock);
  }, [entries.length, activeWorldBible?.id]);

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
          {/* Back + timer row */}
          <div className="flex items-center justify-between mb-3">
            <button
              onClick={closeWorldBible}
              className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-200 transition-colors"
            >
              <ArrowLeft size={13} />
              Library
            </button>
            <FocusTimer compact />
          </div>

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
            <div className="flex items-center gap-0.5">
              <button
                onClick={handleSaveWorldBible}
                className="shrink-0 p-1 rounded hover:bg-slate-700 text-slate-600 hover:text-slate-300 transition-colors"
                title="Save World Bible to file"
              >
                <Download size={11} />
              </button>
              <button
                onClick={() => loadFileRef.current?.click()}
                className="shrink-0 p-1 rounded hover:bg-slate-700 text-slate-600 hover:text-slate-300 transition-colors"
                title="Load World Bible from file"
              >
                <Upload size={11} />
              </button>
              <button
                onClick={() => setShowEdit(true)}
                className="shrink-0 p-1 rounded hover:bg-slate-700 text-slate-600 hover:text-slate-300 transition-colors"
                title="Edit world"
              >
                <Pencil size={11} />
              </button>
            </div>
            <input
              ref={loadFileRef}
              type="file"
              accept=".json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) { handleLoadWorldBible(file); e.target.value = ''; }
              }}
            />
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
        <span className="text-sm font-medium text-slate-200 truncate flex-1">{activeWorldBible.name}</span>
        <FocusTimer compact />
        <button onClick={closeWorldBible} className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300">
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
