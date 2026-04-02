import { db } from '../db/database';
import { useUIStore } from '../store/uiStore';
import { useWorldStore } from '../store/worldStore';
import { useWritingStore } from '../store/writingStore';
import { useAssemblyStore } from '../store/assemblyStore';

export function useProject() {
  const addToast = useUIStore((s) => s.addToast);
  const loadWorld = useWorldStore((s) => s.loadFromDB);
  const loadWriting = useWritingStore((s) => s.loadFromDB);
  const loadAssembly = useAssemblyStore((s) => s.loadFromDB);

  const saveProject = async () => {
    try {
      const [worldSections, worldEntries, writingNodes, assemblies, projectMeta] = await Promise.all([
        db.worldSections.toArray(),
        db.worldEntries.toArray(),
        db.writingNodes.toArray(),
        db.assemblies.toArray(),
        db.projectMeta.toArray(),
      ]);

      const data = { worldSections, worldEntries, writingNodes, assemblies, projectMeta, version: 1 };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const title = projectMeta[0]?.title || 'scriptorium';
      a.download = `${title.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-backup.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      addToast('Project saved successfully');
    } catch {
      addToast('Failed to save project', 'error');
    }
  };

  const loadProject = async (file: File) => {
    try {
      const text = await file.text();
      const data = JSON.parse(text);

      if (!data.version || !data.writingNodes) {
        addToast('Invalid project file', 'error');
        return;
      }

      // Clear and reload all tables
      await db.worldSections.clear();
      await db.worldEntries.clear();
      await db.writingNodes.clear();
      await db.assemblies.clear();
      await db.projectMeta.clear();

      if (data.worldSections?.length) await db.worldSections.bulkAdd(data.worldSections);
      if (data.worldEntries?.length) await db.worldEntries.bulkAdd(data.worldEntries);
      if (data.writingNodes?.length) await db.writingNodes.bulkAdd(data.writingNodes);
      if (data.assemblies?.length) await db.assemblies.bulkAdd(data.assemblies);
      if (data.projectMeta?.length) await db.projectMeta.bulkAdd(data.projectMeta);

      await Promise.all([loadWorld(), loadWriting(), loadAssembly()]);
      addToast('Project loaded successfully');
    } catch {
      addToast('Failed to load project file', 'error');
    }
  };

  return { saveProject, loadProject };
}
