import { useState, useRef } from 'react';
import { ArrowLeft, Save, Upload, Download, Menu, BookOpen, Trophy, Star, Sparkles } from 'lucide-react';
import { useLibraryStore } from '../../store/libraryStore';
import { useUIStore } from '../../store/uiStore';
import { useAchievementStore } from '../../store/achievementStore';
import { useProject } from '../../hooks/useProject';
import { getLevel, getLevelProgress } from '../../types/achievements';
import { FocusTimer } from '../timer/FocusTimer';

export function TopBar() {
  const { activeBook, updateBook, closeBook } = useLibraryStore();
  const activeView = useUIStore((s) => s.activeView);
  const setShowExportModal = useUIStore((s) => s.setShowExportModal);
  const showMobileSidebar = useUIStore((s) => s.showMobileSidebar);
  const setShowMobileSidebar = useUIStore((s) => s.setShowMobileSidebar);
  const showWorldRef = useUIStore((s) => s.showWorldRef);
  const setShowWorldRef = useUIStore((s) => s.setShowWorldRef);
  const showMeyvn = useUIStore((s) => s.showMeyvn);
  const setShowMeyvn = useUIStore((s) => s.setShowMeyvn);
  const setShowAchievementsModal = useUIStore((s) => s.setShowAchievementsModal);
  const { saveProject, loadProject } = useProject();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState('');

  const { totalXP, unlocks } = useAchievementStore();
  const level = getLevel(totalXP);
  const { pct } = getLevelProgress(totalXP);

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
    <header className="relative z-40 h-12 bg-white border-b border-slate-200 flex items-center px-3 gap-2 shrink-0">
      {/* Mobile outline toggle */}
      <button
        onClick={() => setShowMobileSidebar(!showMobileSidebar)}
        title="Toggle outline"
        className="md:hidden flex items-center justify-center w-8 h-8 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-all shrink-0"
      >
        <Menu size={16} />
      </button>

      {/* Back to library */}
      <button
        onClick={closeBook}
        title="Back to Library"
        className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-all shrink-0"
      >
        <ArrowLeft size={14} />
        <img src="/IMG_4709.jpeg" alt="" className="w-4 h-4 rounded opacity-80 object-cover" />
        <span className="hidden sm:inline font-medium">Library</span>
      </button>

      {/* XP bar (desktop) */}
      <div className="hidden md:flex items-center gap-2 px-2 py-1 shrink-0">
        <Star size={11} className="text-amber-500 shrink-0" />
        <span className="text-[10px] font-bold text-amber-600 shrink-0">Lv.{level}</span>
        <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{ width: `${pct}%`, background: 'linear-gradient(to right, #7c3aed, #0d9488)' }}
          />
        </div>
        <span className="text-[10px] text-slate-400 shrink-0">{totalXP} XP</span>
      </div>

      <span className="text-slate-200 text-sm">|</span>

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
            className="bg-white border border-violet-400 rounded px-2 py-0.5 text-sm text-slate-800 outline-none w-48"
          />
        ) : (
          <button
            onClick={handleTitleClick}
            className="text-sm font-semibold text-slate-700 hover:text-slate-900 truncate max-w-[180px]"
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
        <span className="text-slate-300 text-sm hidden sm:inline">·</span>
        <span className="text-sm text-slate-400 hidden sm:inline">{viewLabels[activeView]}</span>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1">
        <FocusTimer />

        <div className="w-px h-4 bg-slate-200 mx-0.5" />

        <button
          onClick={() => setShowAchievementsModal(true)}
          title="Achievements"
          className="relative flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs text-slate-500 hover:text-amber-600 hover:bg-amber-50 transition-all"
        >
          <Trophy size={14} />
          {unlocks.length > 0 && (
            <span className="text-[10px] font-bold text-amber-500">{unlocks.length}</span>
          )}
        </button>

        <button
          onClick={saveProject}
          title="Save project to file"
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-slate-500 hover:text-violet-700 hover:bg-violet-50 transition-all"
        >
          <Save size={14} />
          <span className="hidden md:inline">Save</span>
        </button>
        <button
          onClick={() => fileInputRef.current?.click()}
          title="Load project from file"
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-slate-500 hover:text-violet-700 hover:bg-violet-50 transition-all"
        >
          <Upload size={14} />
          <span className="hidden md:inline">Load</span>
        </button>
        <button
          onClick={() => setShowExportModal(true)}
          title="Export manuscript"
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-slate-500 hover:text-teal-700 hover:bg-teal-50 transition-all"
        >
          <Download size={14} />
          <span className="hidden md:inline">Export</span>
        </button>
        <button
          onClick={() => setShowWorldRef(!showWorldRef)}
          title="World Reference"
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition-all
            ${showWorldRef
              ? 'bg-teal-50 text-teal-700 hover:bg-teal-100'
              : 'text-slate-500 hover:text-teal-700 hover:bg-teal-50'
            }`}
        >
          <BookOpen size={14} />
          <span className="hidden md:inline">World</span>
        </button>
        <button
          onClick={() => setShowMeyvn(!showMeyvn)}
          title="Meyvn AI Assistant"
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition-all
            ${showMeyvn
              ? 'bg-violet-50 text-violet-700 hover:bg-violet-100'
              : 'text-slate-500 hover:text-violet-700 hover:bg-violet-50'
            }`}
        >
          <Sparkles size={14} />
          <span className="hidden md:inline">Meyvn</span>
          <span className="hidden md:inline text-[9px] font-semibold uppercase tracking-wide px-1 py-0.5 rounded bg-amber-50 text-amber-600 border border-amber-200">Soon</span>
        </button>
      </div>

      <input ref={fileInputRef} type="file" accept=".json" onChange={handleFileChange} className="hidden" />
    </header>
  );
}
