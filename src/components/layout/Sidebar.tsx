import { BookOpen, PenLine, BookMarked, Download, Settings } from 'lucide-react';
import { useUIStore } from '../../store/uiStore';
import type { ActiveView } from '../../store/uiStore';

const navItems: { view: ActiveView; icon: typeof BookOpen; label: string }[] = [
  { view: 'world', icon: BookOpen, label: 'World Bible' },
  { view: 'writing', icon: PenLine, label: 'Writing' },
  { view: 'assembly', icon: BookMarked, label: 'Assembly' },
];

export function Sidebar() {
  const activeView = useUIStore((s) => s.activeView);
  const setActiveView = useUIStore((s) => s.setActiveView);
  const setShowExportModal = useUIStore((s) => s.setShowExportModal);
  const setShowProjectSettings = useUIStore((s) => s.setShowProjectSettings);

  return (
    <aside className="flex flex-col w-14 bg-slate-900 border-r border-slate-700/50 shrink-0">
      <div className="flex items-center justify-center h-14 border-b border-slate-700/50">
        <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
          <span className="text-white font-bold text-sm font-serif">S</span>
        </div>
      </div>

      <nav className="flex flex-col items-center gap-1 p-2 flex-1">
        {navItems.map(({ view, icon: Icon, label }) => (
          <button
            key={view}
            onClick={() => setActiveView(view)}
            title={label}
            className={`w-10 h-10 rounded-lg flex items-center justify-center transition-all ${
              activeView === view
                ? 'bg-indigo-600 text-white'
                : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800'
            }`}
          >
            <Icon size={18} />
          </button>
        ))}
      </nav>

      <div className="flex flex-col items-center gap-1 p-2 border-t border-slate-700/50">
        <button
          onClick={() => setShowExportModal(true)}
          title="Export"
          className="w-10 h-10 rounded-lg flex items-center justify-center text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-all"
        >
          <Download size={18} />
        </button>
        <button
          onClick={() => setShowProjectSettings(true)}
          title="Project Settings"
          className="w-10 h-10 rounded-lg flex items-center justify-center text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-all"
        >
          <Settings size={18} />
        </button>
      </div>
    </aside>
  );
}
