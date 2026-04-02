import { useEffect } from 'react';
import { AppShell } from './components/layout/AppShell';
import { Library } from './components/library/Library';
import { WorldBibleEditorShell } from './components/library/WorldBibleEditorShell';
import { useLibraryStore } from './store/libraryStore';
import { useWorldStore } from './store/worldStore';
import { useWritingStore } from './store/writingStore';
import { useAssemblyStore } from './store/assemblyStore';
import { useWorldBibleStore } from './store/worldBibleStore';

function App() {
  const { isLoaded, activeBook, loadLibrary } = useLibraryStore();
  const loadWorld = useWorldStore((s) => s.loadFromDB);
  const loadLinked = useWorldStore((s) => s.loadLinked);
  const clearLinked = useWorldStore((s) => s.clearLinked);
  const loadWriting = useWritingStore((s) => s.loadFromDB);
  const loadAssembly = useAssemblyStore((s) => s.loadFromDB);
  const { activeWorldBible, loadWorldBibles } = useWorldBibleStore();

  // Bootstrap: load library + world bibles list on mount
  useEffect(() => {
    loadLibrary();
    loadWorldBibles();
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

  if (activeWorldBible) return <WorldBibleEditorShell />;
  if (!activeBook) return <Library />;
  return <AppShell />;
}

export default App;
