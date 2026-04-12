import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { useUIStore } from '../../store/uiStore';
import { WritingSpace } from '../writing/WritingSpace';
import { Assembly } from '../assembly/Assembly';
import { ExportModal } from '../export/ExportModal';
import { ProjectSettings } from './ProjectSettings';
import { ToastContainer } from '../common/Toast';
import { AchievementsModal } from '../achievements/AchievementsModal';
import { MavenPanel } from '../ai/MavenPanel';

export function AppShell() {
  const activeView = useUIStore((s) => s.activeView);
  const showExportModal = useUIStore((s) => s.showExportModal);
  const setShowExportModal = useUIStore((s) => s.setShowExportModal);
  const showProjectSettings = useUIStore((s) => s.showProjectSettings);
  const setShowProjectSettings = useUIStore((s) => s.setShowProjectSettings);
  const showAchievementsModal = useUIStore((s) => s.showAchievementsModal);
  const setShowAchievementsModal = useUIStore((s) => s.setShowAchievementsModal);
  const showMaven = useUIStore((s) => s.showMaven);
  const setShowMaven = useUIStore((s) => s.setShowMaven);

  return (
    <div className="flex h-screen overflow-hidden bg-white text-slate-800">
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0 pb-16 md:pb-0">
        <TopBar />
        <div className="flex flex-1 overflow-hidden min-h-0">
          <main className="flex-1 overflow-hidden">
            {activeView === 'writing' && <WritingSpace />}
            {activeView === 'assembly' && <Assembly />}
          </main>
          {showMaven && <MavenPanel onClose={() => setShowMaven(false)} />}
        </div>
      </div>

      {showExportModal && <ExportModal onClose={() => setShowExportModal(false)} />}
      {showProjectSettings && <ProjectSettings onClose={() => setShowProjectSettings(false)} />}
      {showAchievementsModal && <AchievementsModal onClose={() => setShowAchievementsModal(false)} />}
      <ToastContainer />
    </div>
  );
}
