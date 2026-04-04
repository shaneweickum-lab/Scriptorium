import { useState } from 'react';
import { Plus, Download, Globe2, X, Share, BookOpen } from 'lucide-react';
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

/* ── Mystical background ──────────────────────────────────── */
function MysticalBackground() {
  const stars = [
    [8, 12], [22, 38], [68, 18], [84, 58], [14, 72], [58, 82],
    [38, 8], [91, 28], [47, 55], [73, 42], [5, 48], [95, 75],
    [31, 90], [77, 10], [52, 25], [19, 62],
  ];
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden" aria-hidden>
      {/* Base radial gradient */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_#0d1f3c_0%,_#060d18_65%)]" />

      {/* Runic constellation ring */}
      <svg
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[680px] h-[680px] opacity-[0.18]"
        viewBox="0 0 680 680"
      >
        {/* Outer ring */}
        <circle cx="340" cy="340" r="320" fill="none" stroke="#38bdf8" strokeWidth="1.2" />
        {/* Inner ring */}
        <circle cx="340" cy="340" r="295" fill="none" stroke="#6366f1" strokeWidth="0.6" strokeDasharray="4 6" />
        {/* Tick marks around the ring */}
        {Array.from({ length: 48 }).map((_, i) => {
          const angle = (i * 7.5 * Math.PI) / 180;
          const len = i % 4 === 0 ? 14 : 7;
          const r1 = 308;
          const r2 = r1 + len;
          const x1 = 340 + r1 * Math.cos(angle);
          const y1 = 340 + r1 * Math.sin(angle);
          const x2 = 340 + r2 * Math.cos(angle);
          const y2 = 340 + r2 * Math.sin(angle);
          return (
            <line key={i} x1={x1} y1={y1} x2={x2} y2={y2}
              stroke={i % 4 === 0 ? '#38bdf8' : '#6366f1'}
              strokeWidth={i % 4 === 0 ? 1.2 : 0.7}
            />
          );
        })}
        {/* Cardinal cross lines */}
        <line x1="340" y1="20" x2="340" y2="660" stroke="#38bdf8" strokeWidth="0.3" strokeDasharray="2 8" />
        <line x1="20" y1="340" x2="660" y2="340" stroke="#38bdf8" strokeWidth="0.3" strokeDasharray="2 8" />
      </svg>

      {/* Twinkling star dots */}
      {stars.map(([x, y], i) => (
        <div
          key={i}
          className="absolute rounded-full bg-cyan-300/50"
          style={{
            left: `${x}%`,
            top: `${y}%`,
            width: i % 3 === 0 ? 3 : 2,
            height: i % 3 === 0 ? 3 : 2,
            boxShadow: '0 0 4px rgba(103,232,249,0.7)',
          }}
        />
      ))}
    </div>
  );
}

/* ── Safari install instructions modal ───────────────────── */
function SafariInstallModal({ method, onClose }: { method: 'safari-mac' | 'safari-ios'; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-slate-100">Install Wizards Playground</h2>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-colors">
            <X size={16} />
          </button>
        </div>
        {method === 'safari-ios' ? (
          <ol className="space-y-3 text-sm text-slate-300">
            <li className="flex items-start gap-3">
              <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-xs flex items-center justify-center shrink-0 mt-0.5 font-bold">1</span>
              <span>Tap the <Share size={13} className="inline mx-1 text-blue-400" /><strong>Share</strong> button in Safari's toolbar</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-xs flex items-center justify-center shrink-0 mt-0.5 font-bold">2</span>
              <span>Tap <strong>"Add to Home Screen"</strong></span>
            </li>
            <li className="flex items-start gap-3">
              <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-xs flex items-center justify-center shrink-0 mt-0.5 font-bold">3</span>
              <span>Tap <strong>"Add"</strong></span>
            </li>
          </ol>
        ) : (
          <>
            <ol className="space-y-3 text-sm text-slate-300">
              <li className="flex items-start gap-3">
                <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-xs flex items-center justify-center shrink-0 mt-0.5 font-bold">1</span>
                <span>Click the <Share size={13} className="inline mx-1 text-blue-400" /><strong>Share</strong> button in Safari</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-xs flex items-center justify-center shrink-0 mt-0.5 font-bold">2</span>
                <span>Click <strong>"Add to Dock"</strong></span>
              </li>
              <li className="flex items-start gap-3">
                <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-xs flex items-center justify-center shrink-0 mt-0.5 font-bold">3</span>
                <span>Click <strong>"Add"</strong></span>
              </li>
            </ol>
            <p className="text-xs text-slate-600 mt-3 pt-3 border-t border-slate-800">
              Tip: Chrome or Edge offer a one-click install from the address bar.
            </p>
          </>
        )}
        <button onClick={onClose}
          className="mt-5 w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-medium transition-colors">
          Got it
        </button>
      </div>
    </div>
  );
}

/* ── Book illustration (SVG) ─────────────────────────────── */
function BookIllustration() {
  return (
    <svg width="160" height="160" viewBox="0 0 160 160" fill="none" className="drop-shadow-[0_0_30px_rgba(99,102,241,0.35)]">
      {/* Back book */}
      <rect x="38" y="46" width="76" height="94" rx="6" fill="#1e293b" stroke="#334155" strokeWidth="1.5" />
      <rect x="38" y="46" width="10" height="94" rx="3" fill="#334155" />
      {/* Front book */}
      <rect x="46" y="36" width="76" height="94" rx="6" fill="#1e2d4a" stroke="#3b4f72" strokeWidth="1.5" />
      <rect x="46" y="36" width="10" height="94" rx="3" fill="#2a3f63" />
      {/* Compass rose on cover */}
      <g transform="translate(84,83)">
        <circle r="22" fill="none" stroke="#38bdf8" strokeWidth="0.8" opacity="0.6" />
        <circle r="14" fill="none" stroke="#6366f1" strokeWidth="0.5" opacity="0.5" strokeDasharray="3 3" />
        {/* N/S/E/W spokes */}
        {[0, 90, 180, 270].map((deg) => {
          const rad = (deg * Math.PI) / 180;
          return (
            <line key={deg} x1={Math.cos(rad) * 4} y1={Math.sin(rad) * 4}
              x2={Math.cos(rad) * 20} y2={Math.sin(rad) * 20}
              stroke="#38bdf8" strokeWidth="1.2" opacity="0.8" />
          );
        })}
        {/* Diagonal spokes */}
        {[45, 135, 225, 315].map((deg) => {
          const rad = (deg * Math.PI) / 180;
          return (
            <line key={deg} x1={Math.cos(rad) * 4} y1={Math.sin(rad) * 4}
              x2={Math.cos(rad) * 14} y2={Math.sin(rad) * 14}
              stroke="#6366f1" strokeWidth="0.8" opacity="0.6" />
          );
        })}
        <circle r="4" fill="#0f172a" stroke="#38bdf8" strokeWidth="1" />
        <circle r="2" fill="#38bdf8" opacity="0.9" />
      </g>
      {/* Glow under */}
      <ellipse cx="84" cy="138" rx="40" ry="6" fill="#6366f1" opacity="0.15" />
    </svg>
  );
}

/* ── World illustration (SVG) ────────────────────────────── */
function WorldIllustration() {
  return (
    <svg width="160" height="160" viewBox="0 0 160 160" fill="none" className="drop-shadow-[0_0_30px_rgba(124,58,237,0.4)]">
      {/* Orbit ring */}
      <ellipse cx="80" cy="80" rx="68" ry="28" fill="none" stroke="#38bdf8" strokeWidth="1" opacity="0.35"
        transform="rotate(-20 80 80)" />
      {/* Globe body */}
      <circle cx="80" cy="80" r="44" fill="#0d1f3c" stroke="#2d4a7a" strokeWidth="1.5" />
      {/* Continent silhouettes */}
      <ellipse cx="68" cy="68" rx="14" ry="10" fill="#1e3a5f" opacity="0.8" />
      <ellipse cx="92" cy="78" rx="10" ry="14" fill="#1e3a5f" opacity="0.7" />
      <ellipse cx="70" cy="92" rx="8" ry="6" fill="#1e3a5f" opacity="0.6" />
      {/* Latitude lines */}
      <ellipse cx="80" cy="80" rx="44" ry="15" fill="none" stroke="#38bdf8" strokeWidth="0.5" opacity="0.25" />
      <ellipse cx="80" cy="65" rx="38" ry="10" fill="none" stroke="#38bdf8" strokeWidth="0.5" opacity="0.2" />
      {/* Meridian */}
      <ellipse cx="80" cy="80" rx="15" ry="44" fill="none" stroke="#38bdf8" strokeWidth="0.5" opacity="0.2" />
      {/* Compass center */}
      <circle cx="80" cy="80" r="8" fill="none" stroke="#6366f1" strokeWidth="1" opacity="0.7" />
      <circle cx="80" cy="80" r="3" fill="#38bdf8" opacity="0.9" />
      {/* Outer runic ring */}
      <circle cx="80" cy="80" r="70" fill="none" stroke="#6366f1" strokeWidth="0.8" opacity="0.25" strokeDasharray="4 5" />
      {/* Glow */}
      <ellipse cx="80" cy="140" rx="38" ry="5" fill="#7c3aed" opacity="0.18" />
    </svg>
  );
}

/* ── Main Library component ──────────────────────────────── */
export function Library() {
  const { books, createBook, updateBook, deleteBook, openBook } = useLibraryStore();
  const loadWorld = useWorldStore((s) => s.loadFromDB);
  const loadWriting = useWritingStore((s) => s.loadFromDB);
  const loadAssembly = useAssemblyStore((s) => s.loadFromDB);
  const { worldBibles, createWorldBible, updateWorldBible, deleteWorldBible, openWorldBible } = useWorldBibleStore();
  const loadWorldBibleData = useWorldStore((s) => s.loadFromDB);
  const { canInstall, install, installMethod } = usePWAInstall();

  const [activeTab, setActiveTab] = useState<'books' | 'worlds'>('books');
  const [showNewBookModal, setShowNewBookModal] = useState(false);
  const [editBookTarget, setEditBookTarget] = useState<Book | null>(null);
  const [showNewWorldModal, setShowNewWorldModal] = useState(false);
  const [editWorldTarget, setEditWorldTarget] = useState<WorldBible | null>(null);
  const [showInstallModal, setShowInstallModal] = useState(false);

  const handleOpenBook = async (id: string) => {
    await openBook(id);
    await Promise.all([loadWorld(id), loadWriting(id), loadAssembly(id)]);
  };

  const handleCreateBook = async (title: string, author: string, synopsis: string, color: string) => {
    const book = await createBook(title, author, synopsis);
    await updateBook(book.id, { coverColor: color });
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
    <div className="h-screen bg-[#060d18] flex flex-col overflow-hidden text-slate-200">
      <MysticalBackground />

      {/* ── Top bar ────────────────────────────────── */}
      <header className="relative z-10 flex items-center justify-between px-8 py-4 shrink-0">
        {/* Logo */}
        <div className="flex items-center gap-3">
          <img src="/logo.svg" alt="Wizards Playground"
            className="w-10 h-10 drop-shadow-[0_0_10px_rgba(99,102,241,0.9)]" />
          <div>
            <h1 className="text-lg font-bold leading-none tracking-wide text-white">
              Wizards Playground
            </h1>
            <p className="text-[10px] text-cyan-400/70 mt-0.5 tracking-[0.22em] uppercase font-medium">
              World‑Builder's Toolkit
            </p>
          </div>
        </div>

        {/* Right actions */}
        <div className="flex items-center gap-2">
          {canInstall && (
            <button
              onClick={installMethod === 'safari-mac' || installMethod === 'safari-ios'
                ? () => setShowInstallModal(true) : install}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold
                bg-indigo-600 hover:bg-indigo-500 text-white transition-colors
                shadow-lg shadow-indigo-900/40"
            >
              <Download size={13} />
              Install App
            </button>
          )}
        </div>
      </header>

      {/* ── Folder tabs + panel ─────────────────────── */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 pb-8 relative z-10 min-h-0">
        <div className="w-full max-w-4xl flex flex-col" style={{ maxHeight: 'calc(100vh - 120px)' }}>

          {/* Tab strip */}
          <div className="flex items-end gap-1 px-1">
            {/* Books tab */}
            <button
              onClick={() => setActiveTab('books')}
              className={`flex items-center gap-2 px-8 py-3 rounded-t-2xl text-sm font-semibold
                border-t border-l border-r transition-all duration-200 select-none
                ${activeTab === 'books'
                  ? 'bg-[#0e1f38]/90 border-slate-600/50 text-white z-10 -mb-px pb-4'
                  : 'bg-[#0a1628]/40 border-slate-700/30 text-slate-500 hover:text-slate-300 hover:bg-[#0a1628]/60'
                }`}
            >
              <BookOpen size={15} />
              Books
              {books.length > 0 && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold
                  ${activeTab === 'books' ? 'bg-indigo-600/40 text-indigo-300' : 'bg-slate-700 text-slate-500'}`}>
                  {books.length}
                </span>
              )}
            </button>

            {/* World Bibles tab */}
            <button
              onClick={() => setActiveTab('worlds')}
              className={`flex items-center gap-2 px-8 py-3 rounded-t-2xl text-sm font-semibold
                border-t border-l border-r transition-all duration-200 select-none
                ${activeTab === 'worlds'
                  ? 'bg-[#0e1f38]/90 border-slate-600/50 text-white z-10 -mb-px pb-4'
                  : 'bg-[#0a1628]/40 border-slate-700/30 text-slate-500 hover:text-slate-300 hover:bg-[#0a1628]/60'
                }`}
            >
              <Globe2 size={15} />
              World Bibles
              {worldBibles.length > 0 && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold
                  ${activeTab === 'worlds' ? 'bg-violet-600/40 text-violet-300' : 'bg-slate-700 text-slate-500'}`}>
                  {worldBibles.length}
                </span>
              )}
            </button>
          </div>

          {/* Content panel */}
          <div className="flex-1 min-h-0 overflow-y-auto rounded-b-2xl rounded-tr-2xl
            bg-[#0e1f38]/80 border border-slate-600/40 backdrop-blur-sm
            shadow-[0_0_60px_rgba(99,102,241,0.08),inset_0_1px_0_rgba(255,255,255,0.04)]">

            {/* ── BOOKS ── */}
            {activeTab === 'books' && (
              <div className="p-8">
                {books.length === 0 ? (
                  /* Empty state */
                  <div className="flex flex-col items-center justify-center py-10 gap-6">
                    <BookIllustration />
                    <div className="text-center">
                      <h2 className="text-xl font-bold text-white mb-2 tracking-wide">Add a Book Project</h2>
                      <p className="text-slate-400 text-sm mb-6">Create your next great story.</p>
                      <button
                        onClick={() => setShowNewBookModal(true)}
                        className="flex items-center gap-2 px-6 py-3 mx-auto rounded-xl text-sm font-semibold
                          bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-300 border border-indigo-500/40
                          hover:border-indigo-400/60 transition-all shadow-lg shadow-indigo-900/20"
                      >
                        <Plus size={16} />
                        Add Book
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Book grid */
                  <>
                    <div className="flex items-center justify-between mb-6">
                      <h2 className="text-base font-bold text-slate-200 tracking-wider uppercase text-[11px]
                        [font-size:11px] [letter-spacing:0.14em]">My Books</h2>
                      <button
                        onClick={() => setShowNewBookModal(true)}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold
                          bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
                      >
                        <Plus size={14} />
                        New Book
                      </button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                      {books.map((book) => (
                        <BookCard key={book.id} book={book}
                          onOpen={handleOpenBook} onDelete={deleteBook}
                          onEdit={(b) => setEditBookTarget(b)} />
                      ))}
                      <button
                        onClick={() => setShowNewBookModal(true)}
                        className="flex flex-col items-center justify-center gap-3 min-h-36
                          border-2 border-dashed border-slate-700/60 rounded-xl
                          text-slate-600 hover:text-slate-400 hover:border-slate-500/60 transition-all"
                      >
                        <Plus size={22} />
                        <span className="text-xs font-medium">New Book</span>
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ── WORLD BIBLES ── */}
            {activeTab === 'worlds' && (
              <div className="p-8">
                {worldBibles.length === 0 ? (
                  /* Empty state */
                  <div className="flex flex-col items-center justify-center py-10 gap-6">
                    <WorldIllustration />
                    <div className="text-center">
                      <h2 className="text-xl font-bold text-white mb-2 tracking-[0.08em] uppercase">
                        Create Your World Bible
                      </h2>
                      <p className="text-slate-400 text-sm mb-6">Define your universe, lore, and geography.</p>
                      <button
                        onClick={() => setShowNewWorldModal(true)}
                        className="flex items-center gap-2 px-6 py-3 mx-auto rounded-xl text-sm font-semibold
                          bg-violet-600/20 hover:bg-violet-600/40 text-violet-300 border border-violet-500/40
                          hover:border-violet-400/60 transition-all shadow-lg shadow-violet-900/20"
                      >
                        <Plus size={16} />
                        Add World Bible
                      </button>
                    </div>
                  </div>
                ) : (
                  /* World grid */
                  <>
                    <div className="flex items-center justify-between mb-6">
                      <div>
                        <p className="text-[11px] font-bold text-slate-400 tracking-[0.14em] uppercase">My Worlds</p>
                        <p className="text-xs text-slate-600 mt-0.5">Shared world bibles — link to multiple books in a series</p>
                      </div>
                      <button
                        onClick={() => setShowNewWorldModal(true)}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold
                          bg-violet-700 hover:bg-violet-600 text-white transition-colors"
                      >
                        <Globe2 size={14} />
                        New World
                      </button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                      {worldBibles.map((world) => (
                        <WorldCard key={world.id} world={world}
                          onOpen={handleOpenWorldBible} onDelete={deleteWorldBible}
                          onEdit={(w) => setEditWorldTarget(w)} />
                      ))}
                      <button
                        onClick={() => setShowNewWorldModal(true)}
                        className="flex flex-col items-center justify-center gap-3 min-h-36
                          border-2 border-dashed border-slate-700/40 rounded-xl
                          text-slate-600 hover:text-slate-400 hover:border-slate-600/60 transition-all"
                      >
                        <Globe2 size={20} />
                        <span className="text-xs font-medium">New World</span>
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* ── Modals ─────────────────────────────────── */}
      {showNewBookModal && (
        <NewBookModal onClose={() => setShowNewBookModal(false)}
          onSave={handleCreateBook} initialColor={nextBookColor} />
      )}
      {editBookTarget && (
        <EditBookModal book={editBookTarget} onClose={() => setEditBookTarget(null)}
          onSave={(updates) => updateBook(editBookTarget.id, updates)} />
      )}
      {showNewWorldModal && (
        <NewWorldModal onClose={() => setShowNewWorldModal(false)}
          onSave={handleCreateWorld} initialColor={nextWorldColor} />
      )}
      {editWorldTarget && (
        <NewWorldModal onClose={() => setEditWorldTarget(null)}
          onSave={(name, description, color) =>
            updateWorldBible(editWorldTarget.id, { name, description, coverColor: color })}
          initialColor={editWorldTarget.coverColor} />
      )}
      {showInstallModal && (installMethod === 'safari-mac' || installMethod === 'safari-ios') && (
        <SafariInstallModal method={installMethod} onClose={() => setShowInstallModal(false)} />
      )}
    </div>
  );
}
