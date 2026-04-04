import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { useUIStore } from '../../store/uiStore';
import { WorldBible } from '../world/WorldBible';
import { WritingSpace } from '../writing/WritingSpace';
import { Assembly } from '../assembly/Assembly';
import { ExportModal } from '../export/ExportModal';
import { ProjectSettings } from './ProjectSettings';
import { ToastContainer } from '../common/Toast';

export function AppShell() {
  const activeView = useUIStore((s) => s.activeView);
  const showExportModal = useUIStore((s) => s.showExportModal);
  const setShowExportModal = useUIStore((s) => s.setShowExportModal);
  const showProjectSettings = useUIStore((s) => s.showProjectSettings);
  const setShowProjectSettings = useUIStore((s) => s.setShowProjectSettings);

  return (
    <div className="flex h-screen overflow-hidden bg-slate-900 text-slate-200">
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0 pb-16 md:pb-0">
        <TopBar />
        <main className="flex-1 overflow-hidden">
          {activeView === 'world' && <WorldBible />}
          {activeView === 'writing' && <WritingSpace />}
          {activeView === 'assembly' && <Assembly />}
        </main>
      </div>

      {showExportModal && <ExportModal onClose={() => setShowExportModal(false)} />}
      {showProjectSettings && <ProjectSettings onClose={() => setShowProjectSettings(false)} />}
      <ToastContainer />
    </div>
  );
}
