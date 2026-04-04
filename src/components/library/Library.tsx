import { useState } from 'react';
import { Plus, Download, Globe2, X, Share } from 'lucide-react';
import { useLibraryStore } from '../../store/libraryStore';
import { useWorldStore } from '../../store/worldStore';
import { useWritingStore } from '../../store/writingStore';
import { useAssemblyStore } from '../../store/assemblyStore';
import { useWorldBibleStore } from '../../store/worldBibleStore';
import { usePWAInstall } from '../../hooks/usePWAInstall';
import { BookCard } from './BookCard';
import { NewBookModal } from './NewBookModal';
import { EditBookModal } from './EditBookModal';
import { NewWorldModal } from './NewWorldModal';
import { Modal } from '../common/Modal';
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
    <svg width="160" height="160" viewBox="0 0 160 160" fill="none" className="w-28 h-28 md:w-40 md:h-40 drop-shadow-[0_0_30px_rgba(99,102,241,0.35)]">
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

/* ── World Bibles Modal ───────────────────────────────────── */
interface WorldBiblesModalProps {
  worldBibles: WorldBible[];
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
  onNewWorld: () => void;
  onClose: () => void;
}

function WorldBiblesModal({ worldBibles, onOpen, onDelete, onNewWorld, onClose }: WorldBiblesModalProps) {
  return (
    <Modal title="My Worlds" onClose={onClose} size="md">
      {worldBibles.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 gap-4 text-center">
          <Globe2 size={40} className="text-slate-600" />
          <div>
            <p className="text-slate-300 font-medium mb-1">No worlds yet</p>
            <p className="text-slate-500 text-sm">Create a world bible to define your universe, lore, and geography.</p>
          </div>
          <button
            onClick={() => { onNewWorld(); onClose(); }}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold
              bg-violet-600/20 hover:bg-violet-600/40 text-violet-300 border border-violet-500/40
              hover:border-violet-400/60 transition-all"
          >
            <Plus size={15} />
            Create World Bible
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {worldBibles.map((world) => (
            <div
              key={world.id}
              className="flex items-center gap-3 p-3 rounded-xl bg-slate-700/40 hover:bg-slate-700/60 transition-colors"
            >
              <Globe2 size={16} style={{ color: world.coverColor }} className="shrink-0" />
              <span className="flex-1 min-w-0 text-sm font-medium text-slate-200 truncate">{world.name}</span>
              <div
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: world.coverColor }}
              />
              <button
                onClick={() => { onOpen(world.id); onClose(); }}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-violet-600 hover:bg-violet-500 text-white transition-colors shrink-0"
              >
                Open
              </button>
              <button
                onClick={() => onDelete(world.id)}
                className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-900/20 transition-colors shrink-0"
                title="Delete world"
              >
                <X size={13} />
              </button>
            </div>
          ))}

          <div className="pt-2 mt-1 border-t border-slate-700">
            <button
              onClick={() => { onNewWorld(); onClose(); }}
              className="flex items-center gap-2 w-full px-4 py-2.5 rounded-xl text-sm font-semibold
                bg-violet-600/20 hover:bg-violet-600/40 text-violet-300 border border-violet-500/40
                hover:border-violet-400/60 transition-all justify-center"
            >
              <Plus size={15} />
              New World Bible
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

/* ── Main Library component ──────────────────────────────── */
export function Library() {
  const { books, createBook, updateBook, deleteBook, openBook } = useLibraryStore();
  const loadWorld = useWorldStore((s) => s.loadFromDB);
  const loadWriting = useWritingStore((s) => s.loadFromDB);
  const loadAssembly = useAssemblyStore((s) => s.loadFromDB);
  const { worldBibles, createWorldBible, deleteWorldBible, openWorldBible } = useWorldBibleStore();
  const loadWorldBibleData = useWorldStore((s) => s.loadFromDB);
  const { canInstall, install, installMethod } = usePWAInstall();

  const [showNewBookModal, setShowNewBookModal] = useState(false);
  const [editBookTarget, setEditBookTarget] = useState<Book | null>(null);
  const [showNewWorldModal, setShowNewWorldModal] = useState(false);
  const [showWorldsModal, setShowWorldsModal] = useState(false);
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
      <header className="relative z-10 flex items-center justify-between px-4 md:px-8 py-4 shrink-0">
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
          {/* My Worlds button */}
          <button
            onClick={() => setShowWorldsModal(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold
              bg-violet-700/40 hover:bg-violet-700/70 text-violet-300 border border-violet-600/40
              hover:border-violet-500/60 transition-colors"
          >
            <Globe2 size={13} />
            My Worlds
            {worldBibles.length > 0 && (
              <span className="bg-violet-600/50 text-violet-200 text-[10px] px-1.5 py-0.5 rounded-full font-bold">
                {worldBibles.length}
              </span>
            )}
          </button>

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

      {/* ── Main content panel ─────────────────────── */}
      <main className="flex-1 flex flex-col items-center justify-center px-3 md:px-6 pb-6 md:pb-8 relative z-10 min-h-0">
        <div className="w-full max-w-4xl flex flex-col" style={{ maxHeight: 'calc(100vh - 120px)' }}>

          {/* Books panel */}
          <div className="flex-1 min-h-0 overflow-y-auto rounded-2xl
            bg-[#0e1f38]/80 border border-slate-600/40 backdrop-blur-sm
            shadow-[0_0_60px_rgba(99,102,241,0.08),inset_0_1px_0_rgba(255,255,255,0.04)]">

            <div className="p-4 md:p-8">
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
                    <h2 className="text-[11px] font-bold text-slate-200 tracking-[0.14em] uppercase">My Books</h2>
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
      {showInstallModal && (installMethod === 'safari-mac' || installMethod === 'safari-ios') && (
        <SafariInstallModal method={installMethod} onClose={() => setShowInstallModal(false)} />
      )}
      {showWorldsModal && (
        <WorldBiblesModal
          worldBibles={worldBibles}
          onOpen={handleOpenWorldBible}
          onDelete={deleteWorldBible}
          onNewWorld={() => setShowNewWorldModal(true)}
          onClose={() => setShowWorldsModal(false)}
        />
      )}
    </div>
  );
}
