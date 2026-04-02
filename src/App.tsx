import { useEffect } from 'react';
import { AppShell } from './components/layout/AppShell';
import { useWorldStore } from './store/worldStore';
import { useWritingStore } from './store/writingStore';
import { useAssemblyStore } from './store/assemblyStore';

function App() {
  const loadWorld = useWorldStore((s) => s.loadFromDB);
  const loadWriting = useWritingStore((s) => s.loadFromDB);
  const loadAssembly = useAssemblyStore((s) => s.loadFromDB);

  useEffect(() => {
    Promise.all([loadWorld(), loadWriting(), loadAssembly()]);
  }, []);

  return <AppShell />;
}

export default App;
