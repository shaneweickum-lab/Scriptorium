import { PenLine, BookMarked, Download, Settings } from 'lucide-react';
import { useUIStore } from '../../store/uiStore';
import type { ActiveView } from '../../store/uiStore';

const navItems: { view: ActiveView; icon: typeof PenLine; label: string }[] = [
  { view: 'writing', icon: PenLine, label: 'Writing' },
  { view: 'assembly', icon: BookMarked, label: 'Assembly' },
];

export function Sidebar() {
  const activeView = useUIStore((s) => s.activeView);
  const setActiveView = useUIStore((s) => s.setActiveView);
  const setShowExportModal = useUIStore((s) => s.setShowExportModal);
  const setShowProjectSettings = useUIStore((s) => s.setShowProjectSettings);

  return (
    <aside className="
      fixed bottom-0 left-0 right-0 z-40 h-16 flex flex-row items-center
      bg-slate-900 border-t border-slate-700/50
      md:static md:h-full md:w-14 md:flex-col md:border-t-0 md:border-r
    ">
      {/* Logo icon — hide on mobile bottom bar, show on desktop */}
      <div className="hidden md:flex items-center justify-center h-14 border-b border-slate-700/50 w-full shrink-0">
        <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
          <span className="text-white font-bold text-sm font-serif">W</span>
        </div>
      </div>

      {/* Nav items — row on mobile, column on desktop */}
      <nav className="flex flex-row flex-1 items-center justify-around px-2 md:flex-col md:justify-start md:gap-1 md:p-2 md:flex-1">
        {navItems.map(({ view, icon: Icon, label }) => (
          <button
            key={view}
            onClick={() => setActiveView(view)}
            title={label}
            className={`flex flex-col items-center justify-center gap-0.5
              w-14 h-12 md:w-10 md:h-10 rounded-xl md:rounded-lg transition-all
              text-[10px] md:text-base
              ${activeView === view
                ? 'bg-indigo-600 text-white'
                : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800'
              }`}
          >
            <Icon size={18} />
            <span className="md:hidden">{label.split(' ')[0]}</span>
          </button>
        ))}
      </nav>

      {/* Export + Settings — row on mobile (right side), column on desktop (bottom) */}
      <div className="flex flex-row gap-1 pr-2 md:flex-col md:p-2 md:pr-0 md:border-t md:border-slate-700/50">
        <button onClick={() => setShowExportModal(true)} title="Export"
          className="w-12 h-12 md:w-10 md:h-10 rounded-xl md:rounded-lg flex items-center justify-center
            text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-all">
          <Download size={18} />
        </button>
        <button onClick={() => setShowProjectSettings(true)} title="Settings"
          className="w-12 h-12 md:w-10 md:h-10 rounded-xl md:rounded-lg flex items-center justify-center
            text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-all">
          <Settings size={18} />
        </button>
      </div>
    </aside>
  );
}
