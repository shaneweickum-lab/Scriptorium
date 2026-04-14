import { PenLine, BookMarked, Download, Settings, ArrowLeft } from 'lucide-react';
import { useUIStore } from '../../store/uiStore';
import { useLibraryStore } from '../../store/libraryStore';
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
  const closeBook = useLibraryStore((s) => s.closeBook);

  return (
    <aside className="
      fixed bottom-0 left-0 right-0 z-40 h-16 flex flex-row items-center
      bg-white border-t border-slate-200
      md:static md:h-full md:w-52 md:flex-col md:border-t-0 md:border-r md:border-slate-200
    ">
      {/* Logo — desktop only */}
      <div className="hidden md:flex items-center gap-3 px-4 py-4 border-b border-slate-100 w-full shrink-0">
        <img src="/IMG_4709.jpeg" alt="" className="w-8 h-8 rounded-xl object-cover shrink-0" />
        <div className="min-w-0">
          <p className="text-[11px] font-bold text-slate-800 leading-none truncate">Wizards Playground</p>
          <p className="text-[9px] text-teal-600/70 mt-0.5 tracking-wider uppercase truncate">Toolkit</p>
        </div>
      </div>

      {/* Nav items */}
      <nav className="flex flex-row flex-1 items-center justify-around px-2
        md:flex-col md:justify-start md:gap-0.5 md:p-3 md:flex-1 md:pt-4">
        {navItems.map(({ view, icon: Icon, label }) => (
          <button
            key={view}
            onClick={() => setActiveView(view)}
            title={label}
            className={`flex items-center gap-3 transition-all rounded-xl
              flex-col justify-center w-14 h-12 text-[10px]
              md:flex-row md:w-full md:h-auto md:px-3 md:py-2.5 md:text-sm md:font-medium
              ${activeView === view
                ? 'text-violet-700 bg-violet-50 md:border-l-2 md:border-violet-500 md:pl-[10px]'
                : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
              }`}
          >
            <Icon size={16} className={`md:w-4 md:h-4 ${activeView === view ? 'text-violet-600' : 'text-slate-400'}`} />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      {/* Footer actions */}
      <div className="flex flex-row gap-0.5 pr-2 md:flex-col md:p-3 md:pr-3 md:border-t md:border-slate-100 md:space-y-0.5">
        <button onClick={() => setShowExportModal(true)} title="Export"
          className="flex items-center gap-3 transition-all rounded-xl
            w-12 h-12 justify-center
            md:w-full md:h-auto md:px-3 md:py-2.5 md:justify-start
            text-slate-500 hover:text-slate-700 hover:bg-slate-50">
          <Download size={16} className="text-teal-500" />
          <span className="hidden md:inline text-sm font-medium">Export</span>
        </button>
        <button onClick={() => setShowProjectSettings(true)} title="Settings"
          className="flex items-center gap-3 transition-all rounded-xl
            w-12 h-12 justify-center
            md:w-full md:h-auto md:px-3 md:py-2.5 md:justify-start
            text-slate-500 hover:text-slate-700 hover:bg-slate-50">
          <Settings size={16} className="text-slate-400" />
          <span className="hidden md:inline text-sm font-medium">Settings</span>
        </button>
        <button onClick={closeBook} title="Back to Library"
          className="flex items-center gap-3 transition-all rounded-xl
            w-12 h-12 justify-center
            md:w-full md:h-auto md:px-3 md:py-2.5 md:justify-start
            text-slate-400 hover:text-slate-600 hover:bg-slate-50">
          <ArrowLeft size={16} className="text-slate-300" />
          <span className="hidden md:inline text-sm font-medium">Library</span>
        </button>
      </div>
    </aside>
  );
}
