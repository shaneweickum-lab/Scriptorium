import { useEffect } from 'react';
import { AppShell } from './components/layout/AppShell';
import { Library } from './components/library/Library';
import { useLibraryStore } from './store/libraryStore';
import { useWorldStore } from './store/worldStore';
import { useWritingStore } from './store/writingStore';
import { useAssemblyStore } from './store/assemblyStore';

function App() {
  const { isLoaded, activeBook, loadLibrary } = useLibraryStore();
  const loadWorld = useWorldStore((s) => s.loadFromDB);
  const loadWriting = useWritingStore((s) => s.loadFromDB);
  const loadAssembly = useAssemblyStore((s) => s.loadFromDB);

  useEffect(() => {
    loadLibrary();
  }, []);

  // When a book becomes active (e.g. restored from localStorage), load its data
  useEffect(() => {
    if (activeBook) {
      Promise.all([
        loadWorld(activeBook.id),
        loadWriting(activeBook.id),
        loadAssembly(activeBook.id),
      ]);
    }
  }, [activeBook?.id]);

  if (!isLoaded) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center animate-pulse">
          <span className="text-white font-bold text-sm font-serif">S</span>
        </div>
      </div>
    );
  }

  if (!activeBook) return <Library />;
  return <AppShell />;
}

export default App;
