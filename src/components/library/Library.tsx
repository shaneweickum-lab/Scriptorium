import { useState } from 'react';
import { Plus, BookOpen, Download } from 'lucide-react';
import { useLibraryStore } from '../../store/libraryStore';
import { useWorldStore } from '../../store/worldStore';
import { useWritingStore } from '../../store/writingStore';
import { useAssemblyStore } from '../../store/assemblyStore';
import { usePWAInstall } from '../../hooks/usePWAInstall';
import { BookCard } from './BookCard';
import { NewBookModal } from './NewBookModal';
import { EditBookModal } from './EditBookModal';
import { BOOK_COLORS } from '../../types';
import type { Book } from '../../types';

export function Library() {
  const { books, createBook, updateBook, deleteBook, openBook } = useLibraryStore();
  const loadWorld = useWorldStore((s) => s.loadFromDB);
  const loadWriting = useWritingStore((s) => s.loadFromDB);
  const loadAssembly = useAssemblyStore((s) => s.loadFromDB);
  const { canInstall, install } = usePWAInstall();

  const [showNewModal, setShowNewModal] = useState(false);
  const [editTarget, setEditTarget] = useState<Book | null>(null);

  const handleOpenBook = async (id: string) => {
    await openBook(id);
    await Promise.all([loadWorld(id), loadWriting(id), loadAssembly(id)]);
  };

  const handleCreateBook = async (title: string, author: string, synopsis: string, color: string) => {
    const book = await createBook(title, author, synopsis);
    // Apply chosen color
    await updateBook(book.id, { coverColor: color });
    await handleOpenBook(book.id);
  };

  const nextColor = BOOK_COLORS[books.length % BOOK_COLORS.length];

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col">
      {/* Header */}
      <header className="border-b border-slate-800 px-8 py-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-900/50">
            <span className="text-white font-bold text-base font-serif">S</span>
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-100 leading-none">Scriptorium</h1>
            <p className="text-xs text-slate-500 mt-0.5">Your writing workspace</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canInstall && (
            <button
              onClick={install}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
            >
              <Download size={13} />
              Install App
            </button>
          )}
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 px-8 py-8 max-w-6xl mx-auto w-full">
        {/* Section title */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-slate-100">My Library</h2>
          <button
            onClick={() => setShowNewModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-medium transition-colors shadow-lg shadow-indigo-900/30"
          >
            <Plus size={16} />
            New Book
          </button>
        </div>

        {/* Book grid */}
        {books.length === 0 ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center py-24 gap-6">
            <div className="w-20 h-20 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center">
              <BookOpen size={36} className="text-slate-600" />
            </div>
            <div className="text-center">
              <h3 className="text-xl font-semibold text-slate-300 mb-2">Your library is empty</h3>
              <p className="text-slate-500 text-sm mb-6 max-w-xs">
                Create your first book to start building your world and writing your story.
              </p>
              <button
                onClick={() => setShowNewModal(true)}
                className="flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-medium transition-colors mx-auto"
              >
                <Plus size={16} />
                Add Your First Book
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {books.map((book) => (
              <BookCard
                key={book.id}
                book={book}
                onOpen={handleOpenBook}
                onDelete={deleteBook}
                onEdit={(b) => setEditTarget(b)}
              />
            ))}
            {/* Add book card */}
            <button
              onClick={() => setShowNewModal(true)}
              className="flex flex-col items-center justify-center gap-3 bg-slate-800/50 border-2 border-dashed border-slate-700 rounded-xl p-8 text-slate-500 hover:text-slate-300 hover:border-slate-500 transition-all min-h-40"
            >
              <Plus size={24} />
              <span className="text-sm font-medium">New Book</span>
            </button>
          </div>
        )}
      </main>

      {showNewModal && (
        <NewBookModal
          onClose={() => setShowNewModal(false)}
          onSave={handleCreateBook}
          initialColor={nextColor}
        />
      )}
      {editTarget && (
        <EditBookModal
          book={editTarget}
          onClose={() => setEditTarget(null)}
          onSave={(updates) => updateBook(editTarget.id, updates)}
        />
      )}
    </div>
  );
}
