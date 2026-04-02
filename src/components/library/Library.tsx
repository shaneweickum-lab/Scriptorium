import { useState } from 'react';
import { Plus, Download, Globe2, X, Share } from 'lucide-react';
import { useLibraryStore } from '../../store/libraryStore';
import { useWorldStore } from '../../store/worldStore';
import { useWritingStore } from '../../store/writingStore';
import { useAssemblyStore } from '../../store/assemblyStore';
import { useWorldBibleStore } from '../../store/worldBibleStore';
import { usePWAInstall } from '../../hooks/usePWAInstall';
import { BookCard } from './BookCard';
import { WorldCard } from './WorldCard';
import { NewBookModal } from './NewBookModal';
import { EditBookModal } from './EditBookModal';
import { NewWorldModal } from './NewWorldModal';
import { BOOK_COLORS, WORLD_COLORS } from '../../types';
import type { Book, WorldBible } from '../../types';

function SafariInstallModal({ method, onClose }: { method: 'safari-mac' | 'safari-ios'; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-slate-100">Install Wizards Playground</h2>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-slate-700 transition-colors">
            <X size={16} />
          </button>
        </div>

        {method === 'safari-ios' ? (
          <div className="space-y-4">
            <p className="text-sm text-slate-400">To install on your iPhone or iPad:</p>
            <ol className="space-y-3 text-sm text-slate-300">
              <li className="flex items-start gap-3">
                <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-xs flex items-center justify-center shrink-0 mt-0.5 font-bold">1</span>
                <span>Tap the <Share size={14} className="inline mx-1 text-blue-400" /> <strong>Share</strong> button in Safari's toolbar (bottom of screen)</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-xs flex items-center justify-center shrink-0 mt-0.5 font-bold">2</span>
                <span>Scroll down and tap <strong>"Add to Home Screen"</strong></span>
              </li>
              <li className="flex items-start gap-3">
                <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-xs flex items-center justify-center shrink-0 mt-0.5 font-bold">3</span>
                <span>Tap <strong>"Add"</strong> in the top-right corner</span>
              </li>
            </ol>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-slate-400">To install on your Mac with Safari:</p>
            <ol className="space-y-3 text-sm text-slate-300">
              <li className="flex items-start gap-3">
                <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-xs flex items-center justify-center shrink-0 mt-0.5 font-bold">1</span>
                <span>Click the <Share size={14} className="inline mx-1 text-blue-400" /> <strong>Share</strong> button in Safari's toolbar</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-xs flex items-center justify-center shrink-0 mt-0.5 font-bold">2</span>
                <span>Click <strong>"Add to Dock"</strong></span>
              </li>
              <li className="flex items-start gap-3">
                <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-xs flex items-center justify-center shrink-0 mt-0.5 font-bold">3</span>
                <span>Click <strong>"Add"</strong> to confirm</span>
              </li>
            </ol>
            <p className="text-xs text-slate-500 pt-1 border-t border-slate-700">
              Tip: On Mac you can also install via <strong>Chrome</strong> or <strong>Edge</strong> using the install button in the address bar for a one-click install.
            </p>
          </div>
        )}

        <button
          onClick={onClose}
          className="mt-5 w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-medium transition-colors"
        >
          Got it
        </button>
      </div>
    </div>
  );
}

export function Library() {
  const { books, createBook, updateBook, deleteBook, openBook } = useLibraryStore();
  const loadWorld = useWorldStore((s) => s.loadFromDB);
  const loadWriting = useWritingStore((s) => s.loadFromDB);
  const loadAssembly = useAssemblyStore((s) => s.loadFromDB);
  const { worldBibles, createWorldBible, updateWorldBible, deleteWorldBible, openWorldBible } = useWorldBibleStore();
  const loadWorldBibleData = useWorldStore((s) => s.loadFromDB);
  const { canInstall, install, installMethod } = usePWAInstall();

  const [showNewBookModal, setShowNewBookModal] = useState(false);
  const [editBookTarget, setEditBookTarget] = useState<Book | null>(null);
  const [showNewWorldModal, setShowNewWorldModal] = useState(false);
  const [editWorldTarget, setEditWorldTarget] = useState<WorldBible | null>(null);
  const [showInstallModal, setShowInstallModal] = useState(false);

  const handleOpenBook = async (id: string) => {
    await openBook(id);
    await Promise.all([loadWorld(id), loadWriting(id), loadAssembly(id)]);
  };

  const handleCreateBook = async (title: string, author: string, synopsis: string, color: string, worldBibleId?: string) => {
    const book = await createBook(title, author, synopsis);
    await updateBook(book.id, { coverColor: color, worldBibleId });
    await handleOpenBook(book.id);
  };

  const handleOpenWorldBible = async (id: string) => {
    openWorldBible(id);
    await loadWorldBibleData(id);
  };

  const handleCreateWorld = async (name: string, description: string, color: string) => {
    const wb = await createWorldBible(name, description, color);
    await handleOpenWorldBible(wb.id);
  };

  const nextBookColor = BOOK_COLORS[books.length % BOOK_COLORS.length];
  const nextWorldColor = WORLD_COLORS[worldBibles.length % WORLD_COLORS.length];

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col">
      {/* Header */}
      <header className="border-b border-slate-800 px-8 py-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img
            src="/logo.svg"
            alt="Wizards Playground"
            className="w-10 h-10 drop-shadow-[0_0_8px_rgba(99,102,241,0.8)]"
          />
          <div>
            <h1 className="text-lg font-bold text-slate-100 leading-none tracking-wide">
              Wizards Playground
            </h1>
            <p className="text-xs text-indigo-400/80 mt-0.5 tracking-widest uppercase font-medium">
              World-Builder's Toolkit
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canInstall && (
            <button
              onClick={
                installMethod === 'safari-mac' || installMethod === 'safari-ios'
                  ? () => setShowInstallModal(true)
                  : install
              }
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
            >
              <Download size={13} />
              Install App
            </button>
          )}
        </div>
      </header>

      <main className="flex-1 px-8 py-8 max-w-6xl mx-auto w-full space-y-12">

        {/* ── My Books ─────────────────────────────── */}
        <section>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-slate-100">My Books</h2>
            <button
              onClick={() => setShowNewBookModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-medium transition-colors shadow-lg shadow-indigo-900/30"
            >
              <Plus size={16} />
              New Book
            </button>
          </div>

          {books.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-5">
              <img src="/logo.svg" alt="" className="w-20 h-20 opacity-50 drop-shadow-[0_0_16px_rgba(99,102,241,0.4)]" />
              <div className="text-center">
                <h3 className="text-lg font-semibold text-slate-300 mb-2">No books yet</h3>
                <p className="text-slate-500 text-sm mb-5 max-w-xs">
                  Add your first book to begin crafting your story.
                </p>
                <button
                  onClick={() => setShowNewBookModal(true)}
                  className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-medium transition-colors mx-auto"
                >
                  <Plus size={15} />
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
                  onEdit={(b) => setEditBookTarget(b)}
                />
              ))}
              <button
                onClick={() => setShowNewBookModal(true)}
                className="flex flex-col items-center justify-center gap-3 bg-slate-800/50 border-2 border-dashed border-slate-700 rounded-xl p-8 text-slate-500 hover:text-slate-300 hover:border-slate-500 transition-all min-h-40"
              >
                <Plus size={24} />
                <span className="text-sm font-medium">New Book</span>
              </button>
            </div>
          )}
        </section>

        {/* ── My Worlds ────────────────────────────── */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <div>
              <h2 className="text-2xl font-bold text-slate-100">My Worlds</h2>
              <p className="text-sm text-slate-500 mt-1">
                Shared world bibles — link one to multiple books in a series
              </p>
            </div>
            <button
              onClick={() => setShowNewWorldModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-violet-700 hover:bg-violet-600 text-white rounded-xl text-sm font-medium transition-colors shadow-lg shadow-violet-900/30"
            >
              <Globe2 size={15} />
              New World
            </button>
          </div>

          <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {worldBibles.map((world) => (
              <WorldCard
                key={world.id}
                world={world}
                onOpen={handleOpenWorldBible}
                onDelete={deleteWorldBible}
                onEdit={(w) => setEditWorldTarget(w)}
              />
            ))}
            <button
              onClick={() => setShowNewWorldModal(true)}
              className="flex flex-col items-center justify-center gap-3 bg-slate-800/30 border-2 border-dashed border-slate-700/60 rounded-xl p-8 text-slate-600 hover:text-slate-400 hover:border-slate-600 transition-all min-h-40"
            >
              <Globe2 size={22} />
              <span className="text-sm font-medium">New World</span>
            </button>
          </div>
        </section>

      </main>

      {/* Modals */}
      {showNewBookModal && (
        <NewBookModal
          onClose={() => setShowNewBookModal(false)}
          onSave={handleCreateBook}
          initialColor={nextBookColor}
          worldBibles={worldBibles}
        />
      )}
      {editBookTarget && (
        <EditBookModal
          book={editBookTarget}
          onClose={() => setEditBookTarget(null)}
          onSave={(updates) => updateBook(editBookTarget.id, updates)}
          worldBibles={worldBibles}
        />
      )}
      {showNewWorldModal && (
        <NewWorldModal
          onClose={() => setShowNewWorldModal(false)}
          onSave={handleCreateWorld}
          initialColor={nextWorldColor}
        />
      )}
      {editWorldTarget && (
        <NewWorldModal
          onClose={() => setEditWorldTarget(null)}
          onSave={(name, description, color) =>
            updateWorldBible(editWorldTarget.id, { name, description, coverColor: color })
          }
          initialColor={editWorldTarget.coverColor}
        />
      )}
      {showInstallModal && (installMethod === 'safari-mac' || installMethod === 'safari-ios') && (
        <SafariInstallModal method={installMethod} onClose={() => setShowInstallModal(false)} />
      )}
    </div>
  );
}
