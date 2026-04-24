import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { useUIStore } from '../../store/uiStore';
import { useLibraryStore } from '../../store/libraryStore';
import { WritingSpace } from '../writing/WritingSpace';
import { Assembly } from '../assembly/Assembly';
import { ExportModal } from '../export/ExportModal';
import { ProjectSettings } from './ProjectSettings';
import { ToastContainer } from '../common/Toast';
import { AchievementsModal } from '../achievements/AchievementsModal';
import { MeyvnPanel } from '../ai/MeyvnPanel';
import { useVectorIndex } from '../../features/ai-engine/hooks/useVectorIndex';
import { useOracleML } from '../../features/ai-engine/hooks/useOracleML';

export function AppShell() {
  const activeView = useUIStore((s) => s.activeView);
  const showExportModal = useUIStore((s) => s.showExportModal);
  const setShowExportModal = useUIStore((s) => s.setShowExportModal);
  const showProjectSettings = useUIStore((s) => s.showProjectSettings);
  const setShowProjectSettings = useUIStore((s) => s.setShowProjectSettings);
  const showAchievementsModal = useUIStore((s) => s.showAchievementsModal);
  const setShowAchievementsModal = useUIStore((s) => s.setShowAchievementsModal);
  const showMeyvn = useUIStore((s) => s.showMeyvn);
  const setShowMeyvn = useUIStore((s) => s.setShowMeyvn);

  const activeBook = useLibraryStore((s) => s.activeBook);
  const { indexStatus, indexProgress } = useVectorIndex(activeBook?.id);
  const { oracleProfile, isAnalyzing: isOracleAnalyzing, analyzeNow } = useOracleML(activeBook?.id);

  return (
    <div className="flex h-screen overflow-hidden bg-white text-slate-800">
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0 pb-16 md:pb-0">
        <TopBar />
        <div className="flex flex-1 overflow-hidden min-h-0">
          <main className="flex-1 overflow-hidden">
            {activeView === 'writing' && (
              <div key="writing" className="wp-view-enter h-full">
                <WritingSpace />
              </div>
            )}
            {activeView === 'assembly' && (
              <div key="assembly" className="wp-view-enter h-full">
                <Assembly />
              </div>
            )}
          </main>
          {showMeyvn && (
            <div className="wp-panel-enter flex h-full">
              <MeyvnPanel
                onClose={() => setShowMeyvn(false)}
                indexStatus={indexStatus}
                indexProgress={indexProgress}
                oracleProfile={oracleProfile}
                isOracleAnalyzing={isOracleAnalyzing}
                onRefreshOracle={analyzeNow}
              />
            </div>
          )}
        </div>
      </div>

      {showExportModal && <ExportModal onClose={() => setShowExportModal(false)} />}
      {showProjectSettings && <ProjectSettings onClose={() => setShowProjectSettings(false)} />}
      {showAchievementsModal && <AchievementsModal onClose={() => setShowAchievementsModal(false)} />}
      <ToastContainer />
    </div>
  );
}
