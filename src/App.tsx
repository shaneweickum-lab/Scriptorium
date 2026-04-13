import { useEffect, useState } from 'react';
import { AppShell } from './components/layout/AppShell';
import { Library } from './components/library/Library';
import { WorldBibleEditorShell } from './components/library/WorldBibleEditorShell';
import { LandingPage } from './components/landing/LandingPage';
import { TimerController } from './components/timer/TimerController';
import { BreakOverlay } from './components/timer/BreakOverlay';
import { useLibraryStore } from './store/libraryStore';
import { useWorldStore } from './store/worldStore';
import { useWritingStore } from './store/writingStore';
import { useAssemblyStore } from './store/assemblyStore';
import { useWorldBibleStore } from './store/worldBibleStore';
import { useAchievementStore } from './store/achievementStore';

const LS_LANDING = 'wp_seen_landing';

function App() {
  const [showLanding, setShowLanding] = useState(() => !localStorage.getItem(LS_LANDING));
  const { isLoaded, activeBook, loadLibrary } = useLibraryStore();
  const loadWorld = useWorldStore((s) => s.loadFromDB);
  const loadLinked = useWorldStore((s) => s.loadLinked);
  const clearLinked = useWorldStore((s) => s.clearLinked);
  const loadWriting = useWritingStore((s) => s.loadFromDB);
  const loadAssembly = useAssemblyStore((s) => s.loadFromDB);
  const { activeWorldBible, loadWorldBibles } = useWorldBibleStore();
  const loadAchievements = useAchievementStore((s) => s.loadAchievements);

  // Bootstrap: load library + world bibles list on mount
  useEffect(() => {
    loadLibrary();
    loadWorldBibles();
    loadAchievements();
  }, []);

  // When a book becomes active, load all its data + any linked world bible
  useEffect(() => {
    if (!activeBook) {
      clearLinked();
      return;
    }
    Promise.all([
      loadWorld(activeBook.id),
      loadWriting(activeBook.id),
      loadAssembly(activeBook.id),
    ]);
    if (activeBook.worldBibleId) {
      loadLinked(activeBook.worldBibleId);
    } else {
      clearLinked();
    }
  }, [activeBook?.id, activeBook?.worldBibleId]);

  // When a world bible is opened for editing, load its sections/entries
  useEffect(() => {
    if (activeWorldBible) {
      loadWorld(activeWorldBible.id);
    }
  }, [activeWorldBible?.id]);

  if (!isLoaded) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <img
          src="/logo.svg"
          alt="Loading…"
          className="w-16 h-16 animate-pulse drop-shadow-[0_0_20px_rgba(99,102,241,0.6)]"
        />
      </div>
    );
  }

  if (showLanding) {
    const enterApp = (initialView?: string) => {
      if (initialView) localStorage.setItem('wp_initial_view', initialView);
      localStorage.setItem(LS_LANDING, '1');
      setShowLanding(false);
    };
    return (
      <LandingPage
        onEnter={() => enterApp()}
        onEnterMaven={() => enterApp('maven')}
        onEnterTraining={() => enterApp('training')}
      />
    );
  }

  return (
    <>
      <TimerController />
      <BreakOverlay />
      {activeWorldBible ? <WorldBibleEditorShell /> : !activeBook ? <Library /> : <AppShell />}
    </>
  );
}

export default App;
