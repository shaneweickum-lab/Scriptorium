import { useEffect, useState } from 'react';
import { useSettingsStore } from './store/settingsStore';
import { useAuthStore } from './store/authStore';
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
import { useSyncStore } from './store/syncStore';

const LS_LANDING = 'wp_seen_landing';

function App() {
  // Initialise settings store and apply theme/animation attributes once on mount
  useSettingsStore();
  const initAuth = useAuthStore((s) => s.init);
  const [showLanding, setShowLanding] = useState(() => !localStorage.getItem(LS_LANDING));
  const { isLoaded, activeBook, loadLibrary } = useLibraryStore();
  const loadWorld = useWorldStore((s) => s.loadFromDB);
  const loadLinked = useWorldStore((s) => s.loadLinked);
  const clearLinked = useWorldStore((s) => s.clearLinked);
  const loadWriting = useWritingStore((s) => s.loadFromDB);
  const loadAssembly = useAssemblyStore((s) => s.loadFromDB);
  const { activeWorldBible, loadWorldBibles } = useWorldBibleStore();
  const loadAchievements = useAchievementStore((s) => s.loadAchievements);

  const loadSync = useSyncStore((s) => s.load);
  const syncNow = useSyncStore((s) => s.syncNow);

  // Bootstrap: load library + world bibles list + auth session on mount
  useEffect(() => {
    loadLibrary();
    loadWorldBibles();
    loadAchievements();
    loadSync();
    initAuth();
  }, []);

  // Auto-sync to file 2.5 s after any writing node change
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsub = useWritingStore.subscribe(() => {
      if (!useSyncStore.getState().handle) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(syncNow, 2500);
    });
    return () => {
      unsub();
      if (timer) clearTimeout(timer);
    };
  }, [syncNow]);

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
          src="/IMG_4709.jpeg"
          alt="Loading…"
          className="w-16 h-16 rounded-2xl object-cover animate-pulse drop-shadow-[0_0_20px_rgba(99,102,241,0.6)]"
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
        onEnterMeyvn={() => enterApp('maven')}
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
