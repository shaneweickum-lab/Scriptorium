import { useState, useRef } from 'react';
import { ArrowLeft, Save, Upload, Download } from 'lucide-react';
import { useLibraryStore } from '../../store/libraryStore';
import { useUIStore } from '../../store/uiStore';
import { useProject } from '../../hooks/useProject';

export function TopBar() {
  const { activeBook, updateBook, closeBook } = useLibraryStore();
  const activeView = useUIStore((s) => s.activeView);
  const setShowExportModal = useUIStore((s) => s.setShowExportModal);
  const { saveProject, loadProject } = useProject();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState('');

  const viewLabels = { world: 'World Bible', writing: 'Writing', assembly: 'Assembly' };

  const handleTitleClick = () => {
    setTitleValue(activeBook?.title || '');
    setEditingTitle(true);
  };

  const handleTitleBlur = () => {
    setEditingTitle(false);
    if (titleValue.trim() && activeBook) {
      updateBook(activeBook.id, { title: titleValue.trim() });
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) loadProject(file);
    e.target.value = '';
  };

  return (
    <header className="h-12 bg-slate-900/80 backdrop-blur border-b border-slate-700/50 flex items-center px-3 gap-2 shrink-0">
      {/* Back to library */}
      <button
        onClick={closeBook}
        title="Back to Library"
        className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs text-slate-500 hover:text-slate-200 hover:bg-slate-800 transition-all shrink-0"
      >
        <ArrowLeft size={14} />
        <img src="/logo.svg" alt="" className="w-5 h-5 opacity-70" />
        <span className="hidden sm:inline font-medium">Wizards Playground</span>
      </button>

      <span className="text-slate-700 text-sm">/</span>

      {/* Project title */}
      <div className="flex items-center gap-2 flex-1 min-w-0">
        {editingTitle ? (
          <input
            autoFocus
            value={titleValue}
            onChange={(e) => setTitleValue(e.target.value)}
            onBlur={handleTitleBlur}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleTitleBlur();
              if (e.key === 'Escape') setEditingTitle(false);
            }}
            className="bg-slate-800 border border-indigo-500 rounded px-2 py-0.5 text-sm text-slate-100 outline-none w-48"
          />
        ) : (
          <button
            onClick={handleTitleClick}
            className="text-sm font-medium text-slate-300 hover:text-white truncate max-w-[180px]"
            title="Click to rename"
          >
            {activeBook?.title || 'Untitled'}
          </button>
        )}
        {activeBook && (
          <div
            className="w-2 h-2 rounded-full shrink-0"
            style={{ backgroundColor: activeBook.coverColor }}
          />
        )}
        <span className="text-slate-600 text-sm hidden sm:inline">·</span>
        <span className="text-sm text-slate-500 hidden sm:inline">{viewLabels[activeView]}</span>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1">
        <button
          onClick={saveProject}
          title="Save project to file"
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-all"
        >
          <Save size={14} />
          <span className="hidden md:inline">Save</span>
        </button>
        <button
          onClick={() => fileInputRef.current?.click()}
          title="Load project from file"
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-all"
        >
          <Upload size={14} />
          <span className="hidden md:inline">Load</span>
        </button>
        <button
          onClick={() => setShowExportModal(true)}
          title="Export manuscript"
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-all"
        >
          <Download size={14} />
          <span className="hidden md:inline">Export</span>
        </button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        onChange={handleFileChange}
        className="hidden"
      />
    </header>
  );
}
