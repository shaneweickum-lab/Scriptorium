import { db } from '../db/database';
import { useUIStore } from '../store/uiStore';
import { useWorldStore } from '../store/worldStore';
import { useWritingStore } from '../store/writingStore';
import { useAssemblyStore } from '../store/assemblyStore';
import { useLibraryStore } from '../store/libraryStore';
import { libraryRepository } from '../db/libraryRepository';

export function useProject() {
  const addToast = useUIStore((s) => s.addToast);
  const loadWorld = useWorldStore((s) => s.loadFromDB);
  const loadWriting = useWritingStore((s) => s.loadFromDB);
  const loadAssembly = useAssemblyStore((s) => s.loadFromDB);
  const activeBook = useLibraryStore((s) => s.activeBook);

  const saveProject = async () => {
    if (!activeBook) {
      addToast('No active book to save', 'error');
      return;
    }
    try {
      const bookId = activeBook.id;
      const [worldSections, worldEntries, writingNodes, assemblies] = await Promise.all([
        db.worldSections.where('bookId').equals(bookId).toArray(),
        db.worldEntries.where('bookId').equals(bookId).toArray(),
        db.writingNodes.where('bookId').equals(bookId).toArray(),
        db.assemblies.where('bookId').equals(bookId).toArray(),
      ]);

      const data = { book: activeBook, worldSections, worldEntries, writingNodes, assemblies, version: 2 };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${activeBook.title.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-backup.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      addToast('Book saved successfully');
    } catch {
      addToast('Failed to save book', 'error');
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

      if (data.version >= 2 && data.book) {
        // Multi-book format: import as a new/replace book
        const bookId = data.book.id;
        await db.worldSections.where('bookId').equals(bookId).delete();
        await db.worldEntries.where('bookId').equals(bookId).delete();
        await db.writingNodes.where('bookId').equals(bookId).delete();
        await db.assemblies.where('bookId').equals(bookId).delete();
        await libraryRepository.addBook(data.book);

        if (data.worldSections?.length) await db.worldSections.bulkPut(data.worldSections);
        if (data.worldEntries?.length) await db.worldEntries.bulkPut(data.worldEntries);
        if (data.writingNodes?.length) await db.writingNodes.bulkPut(data.writingNodes);
        if (data.assemblies?.length) await db.assemblies.bulkPut(data.assemblies);

        await Promise.all([loadWorld(bookId), loadWriting(bookId), loadAssembly(bookId)]);
      } else if (activeBook) {
        // Legacy v1 format: load into current active book
        const bookId = activeBook.id;
        await db.worldSections.where('bookId').equals(bookId).delete();
        await db.worldEntries.where('bookId').equals(bookId).delete();
        await db.writingNodes.where('bookId').equals(bookId).delete();
        await db.assemblies.where('bookId').equals(bookId).delete();

        const stamp = <T extends object>(arr: T[]) => arr.map((r) => ({ ...r, bookId }));
        if (data.worldSections?.length) await db.worldSections.bulkPut(stamp(data.worldSections));
        if (data.worldEntries?.length) await db.worldEntries.bulkPut(stamp(data.worldEntries));
        if (data.writingNodes?.length) await db.writingNodes.bulkPut(stamp(data.writingNodes));
        if (data.assemblies?.length) await db.assemblies.bulkPut(stamp(data.assemblies));

        await Promise.all([loadWorld(bookId), loadWriting(bookId), loadAssembly(bookId)]);
      } else {
        addToast('Open a book first to import a legacy file', 'error');
        return;
      }

      addToast('Book loaded successfully');
    } catch {
      addToast('Failed to load project file', 'error');
    }
  };

  return { saveProject, loadProject };
}
