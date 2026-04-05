import { useState } from 'react';
import { Plus, Download, Globe2, BookOpen, Pencil, Trash2, MoreVertical, X, Share, Trophy, Star } from 'lucide-react';
import { useLibraryStore } from '../../store/libraryStore';
import { useWorldStore } from '../../store/worldStore';
import { useWritingStore } from '../../store/writingStore';
import { useAssemblyStore } from '../../store/assemblyStore';
import { useWorldBibleStore } from '../../store/worldBibleStore';
import { useAchievementStore } from '../../store/achievementStore';
import { useUIStore } from '../../store/uiStore';
import { usePWAInstall } from '../../hooks/usePWAInstall';
import { NewBookModal } from './NewBookModal';
import { EditBookModal } from './EditBookModal';
import { NewWorldModal } from './NewWorldModal';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { AchievementsModal } from '../achievements/AchievementsModal';
import { ToastContainer } from '../common/Toast';
import { BOOK_COLORS, WORLD_COLORS } from '../../types';
import type { Book, WorldBible } from '../../types';
import { getLevel, getLevelProgress } from '../../types/achievements';

/* ── Helpers ─────────────────────────────────────────────── */
function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

const BOOKS_PER_SHELF = 9;

/* ── Mystical background ──────────────────────────────────── */
function MysticalBackground() {
  const stars = [
    [8, 12], [22, 38], [68, 18], [84, 58], [14, 72], [58, 82],
    [38, 8], [91, 28], [47, 55], [73, 42], [5, 48], [95, 75],
    [31, 90], [77, 10], [52, 25], [19, 62],
  ];
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden" aria-hidden>
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_#0d1f3c_0%,_#060d18_65%)]" />
      <svg className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[680px] h-[680px] opacity-[0.15]"
        viewBox="0 0 680 680">
        <circle cx="340" cy="340" r="320" fill="none" stroke="#38bdf8" strokeWidth="1.2" />
        <circle cx="340" cy="340" r="295" fill="none" stroke="#6366f1" strokeWidth="0.6" strokeDasharray="4 6" />
        {Array.from({ length: 48 }).map((_, i) => {
          const angle = (i * 7.5 * Math.PI) / 180;
          const len = i % 4 === 0 ? 14 : 7;
          const r1 = 308;
          const x1 = 340 + r1 * Math.cos(angle); const y1 = 340 + r1 * Math.sin(angle);
          const x2 = 340 + (r1 + len) * Math.cos(angle); const y2 = 340 + (r1 + len) * Math.sin(angle);
          return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2}
            stroke={i % 4 === 0 ? '#38bdf8' : '#6366f1'} strokeWidth={i % 4 === 0 ? 1.2 : 0.7} />;
        })}
        <line x1="340" y1="20" x2="340" y2="660" stroke="#38bdf8" strokeWidth="0.3" strokeDasharray="2 8" />
        <line x1="20" y1="340" x2="660" y2="340" stroke="#38bdf8" strokeWidth="0.3" strokeDasharray="2 8" />
      </svg>
      {stars.map(([x, y], i) => (
        <div key={i} className="absolute rounded-full bg-cyan-300/50"
          style={{ left: `${x}%`, top: `${y}%`, width: i % 3 === 0 ? 3 : 2, height: i % 3 === 0 ? 3 : 2,
            boxShadow: '0 0 4px rgba(103,232,249,0.7)' }} />
      ))}
    </div>
  );
}

/* ── Shelf plank ──────────────────────────────────────────── */
function ShelfPlank() {
  return (
    <div className="w-full" style={{
      height: 14,
      background: 'linear-gradient(to bottom, #3a1c08 0%, #281205 55%, #180b03 100%)',
      borderTop: '1px solid rgba(200,110,40,0.22)',
      boxShadow: '0 5px 16px rgba(0,0,0,0.75), 0 2px 4px rgba(0,0,0,0.5)',
    }} />
  );
}

/* ── Add-new slot ─────────────────────────────────────────── */
function AddSlot({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <div onClick={onClick} title={label}
      className="shrink-0 cursor-pointer flex flex-col items-center justify-center gap-2
        border-2 border-dashed border-white/10 hover:border-white/25 rounded-r-sm
        transition-all duration-200 group"
      style={{ width: 72, height: 186 }}>
      <Plus size={18} className="text-white/20 group-hover:text-white/45 transition-colors" />
      <span className="text-[9px] text-white/15 group-hover:text-white/35 transition-colors
        text-center leading-tight px-1">{label}</span>
    </div>
  );
}

/* ── Book spine ───────────────────────────────────────────── */
function BookSpine({ book, onOpen, onEdit, onDelete }: {
  book: Book;
  onOpen: (id: string) => void;
  onEdit: (b: Book) => void;
  onDelete: (id: string) => void;
}) {
  const [menu, setMenu] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const c = book.coverColor;

  return (
    <>
      <div style={{ width: 72, height: 186 }} className="relative group shrink-0">
        {/* Spine body */}
        <div
          className="absolute inset-0 rounded-r-sm cursor-pointer flex flex-col py-5 px-1.5"
          style={{
            backgroundColor: c,
            backgroundImage: `linear-gradient(to right, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0.1) 35%, rgba(255,255,255,0.05) 100%)`,
            boxShadow: `inset 1px 0 3px rgba(0,0,0,0.5), 3px 0 8px rgba(0,0,0,0.45)`,
          }}
          onClick={() => onOpen(book.id)}
        >
          {/* Title (vertical, bottom-to-top) */}
          <span className="text-white font-semibold tracking-wide leading-tight flex-1"
            style={{
              fontSize: 11, writingMode: 'vertical-rl', textOrientation: 'mixed',
              transform: 'rotate(180deg)', overflow: 'hidden', maxHeight: 130,
              textShadow: '0 1px 3px rgba(0,0,0,0.6)',
            }}>
            {book.title}
          </span>
          {/* Author last name */}
          {book.author && (
            <span className="text-white/50 mt-auto"
              style={{ fontSize: 9, writingMode: 'vertical-rl', transform: 'rotate(180deg)', overflow: 'hidden' }}>
              {book.author.split(' ').pop()}
            </span>
          )}
        </div>

        {/* Left-edge highlight (spine binding) */}
        <div className="absolute left-0 top-0 bottom-0 rounded-l-sm pointer-events-none"
          style={{ width: 5, background: 'linear-gradient(to right, rgba(255,255,255,0.22), rgba(255,255,255,0.05))' }} />

        {/* Hover glow */}
        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200 rounded-r-sm pointer-events-none"
          style={{ boxShadow: `0 0 22px ${c}70, inset 0 0 8px rgba(255,255,255,0.06)` }} />

        {/* Lift on hover */}
        <div className="absolute inset-0 group-hover:-translate-y-1.5 transition-transform duration-200 pointer-events-none" />

        {/* Kebab menu */}
        <div className="absolute top-1.5 right-0.5 opacity-0 group-hover:opacity-100 transition-opacity z-10"
          onClick={(e) => e.stopPropagation()}>
          <button onClick={() => setMenu(!menu)}
            className="p-0.5 rounded text-white/50 hover:text-white hover:bg-black/40 transition-colors">
            <MoreVertical size={10} />
          </button>
          {menu && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setMenu(false)} />
              <div className="absolute left-1/2 -translate-x-1/2 top-5 z-40
                bg-slate-800 border border-slate-700 rounded-lg shadow-2xl py-1 w-28">
                <button onClick={() => { onOpen(book.id); setMenu(false); }}
                  className="flex items-center gap-2 w-full px-3 py-2 text-xs text-slate-300 hover:bg-slate-700">
                  <BookOpen size={11} /> Open
                </button>
                <button onClick={() => { onEdit(book); setMenu(false); }}
                  className="flex items-center gap-2 w-full px-3 py-2 text-xs text-slate-300 hover:bg-slate-700">
                  <Pencil size={11} /> Edit
                </button>
                <button onClick={() => { setConfirm(true); setMenu(false); }}
                  className="flex items-center gap-2 w-full px-3 py-2 text-xs text-red-400 hover:bg-red-900/20">
                  <Trash2 size={11} /> Delete
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {confirm && (
        <ConfirmDialog title="Delete Book"
          message={`Delete "${book.title}" and all its content? This cannot be undone.`}
          confirmLabel="Delete" danger
          onConfirm={() => onDelete(book.id)}
          onClose={() => setConfirm(false)} />
      )}
    </>
  );
}

/* ── World Bible spine ────────────────────────────────────── */
function WorldSpine({ world, onOpen, onEdit, onDelete }: {
  world: WorldBible;
  onOpen: (id: string) => void;
  onEdit: (w: WorldBible) => void;
  onDelete: (id: string) => void;
}) {
  const [menu, setMenu] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const c = world.coverColor;

  return (
    <>
      <div style={{ width: 72, height: 186 }} className="relative group shrink-0">
        {/* Spine body */}
        <div
          className="absolute inset-0 rounded-r-sm cursor-pointer flex flex-col items-center py-5 px-1.5"
          style={{
            backgroundColor: c,
            backgroundImage: `linear-gradient(to right, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.15) 40%, rgba(255,255,255,0.04) 100%)`,
            boxShadow: `inset 1px 0 3px rgba(0,0,0,0.5), 3px 0 8px rgba(0,0,0,0.45)`,
          }}
          onClick={() => onOpen(world.id)}
        >
          <Globe2 size={14} className="text-white/50 mb-3 shrink-0" />
          <span className="text-white font-semibold tracking-wide leading-tight flex-1"
            style={{
              fontSize: 11, writingMode: 'vertical-rl', textOrientation: 'mixed',
              transform: 'rotate(180deg)', overflow: 'hidden', maxHeight: 110,
              textShadow: '0 1px 3px rgba(0,0,0,0.6)',
            }}>
            {world.name}
          </span>
        </div>

        {/* Left-edge highlight */}
        <div className="absolute left-0 top-0 bottom-0 rounded-l-sm pointer-events-none"
          style={{ width: 5, background: 'linear-gradient(to right, rgba(255,255,255,0.22), rgba(255,255,255,0.05))' }} />

        {/* Hover glow */}
        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200 rounded-r-sm pointer-events-none"
          style={{ boxShadow: `0 0 22px ${c}70, inset 0 0 8px rgba(255,255,255,0.06)` }} />

        {/* Kebab menu */}
        <div className="absolute top-1.5 right-0.5 opacity-0 group-hover:opacity-100 transition-opacity z-10"
          onClick={(e) => e.stopPropagation()}>
          <button onClick={() => setMenu(!menu)}
            className="p-0.5 rounded text-white/50 hover:text-white hover:bg-black/40 transition-colors">
            <MoreVertical size={10} />
          </button>
          {menu && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setMenu(false)} />
              <div className="absolute left-1/2 -translate-x-1/2 top-5 z-40
                bg-slate-800 border border-slate-700 rounded-lg shadow-2xl py-1 w-28">
                <button onClick={() => { onOpen(world.id); setMenu(false); }}
                  className="flex items-center gap-2 w-full px-3 py-2 text-xs text-slate-300 hover:bg-slate-700">
                  <Globe2 size={11} /> Open
                </button>
                <button onClick={() => { onEdit(world); setMenu(false); }}
                  className="flex items-center gap-2 w-full px-3 py-2 text-xs text-slate-300 hover:bg-slate-700">
                  <Pencil size={11} /> Edit
                </button>
                <button onClick={() => { setConfirm(true); setMenu(false); }}
                  className="flex items-center gap-2 w-full px-3 py-2 text-xs text-red-400 hover:bg-red-900/20">
                  <Trash2 size={11} /> Delete
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {confirm && (
        <ConfirmDialog title="Delete World"
          message={`Delete "${world.name}" and all its entries? This cannot be undone.`}
          confirmLabel="Delete" danger
          onConfirm={() => onDelete(world.id)}
          onClose={() => setConfirm(false)} />
      )}
    </>
  );
}

/* ── Safari install modal ─────────────────────────────────── */
function SafariInstallModal({ method, onClose }: { method: 'safari-mac' | 'safari-ios'; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl rounded-b-2xl shadow-2xl w-full max-w-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-slate-100">Install Wizards Playground</h2>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-slate-800">
            <X size={16} />
          </button>
        </div>
        {method === 'safari-ios' ? (
          <ol className="space-y-3 text-sm text-slate-300">
            <li className="flex items-start gap-3"><span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-xs flex items-center justify-center shrink-0 mt-0.5 font-bold">1</span>
              <span>Tap <Share size={13} className="inline mx-1 text-blue-400" /><strong>Share</strong> in Safari</span></li>
            <li className="flex items-start gap-3"><span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-xs flex items-center justify-center shrink-0 mt-0.5 font-bold">2</span>
              <span>Tap <strong>"Add to Home Screen"</strong></span></li>
            <li className="flex items-start gap-3"><span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-xs flex items-center justify-center shrink-0 mt-0.5 font-bold">3</span>
              <span>Tap <strong>"Add"</strong></span></li>
          </ol>
        ) : (
          <ol className="space-y-3 text-sm text-slate-300">
            <li className="flex items-start gap-3"><span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-xs flex items-center justify-center shrink-0 mt-0.5 font-bold">1</span>
              <span>Click <Share size={13} className="inline mx-1 text-blue-400" /><strong>Share</strong> in Safari</span></li>
            <li className="flex items-start gap-3"><span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-xs flex items-center justify-center shrink-0 mt-0.5 font-bold">2</span>
              <span>Click <strong>"Add to Dock"</strong></span></li>
            <li className="flex items-start gap-3"><span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-xs flex items-center justify-center shrink-0 mt-0.5 font-bold">3</span>
              <span>Click <strong>"Add"</strong></span></li>
          </ol>
        )}
        <button onClick={onClose}
          className="mt-5 w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-medium transition-colors">
          Got it
        </button>
      </div>
    </div>
  );
}

/* ── Main Library ─────────────────────────────────────────── */
export function Library() {
  const { books, createBook, updateBook, deleteBook, openBook } = useLibraryStore();
  const loadWorld = useWorldStore((s) => s.loadFromDB);
  const loadWriting = useWritingStore((s) => s.loadFromDB);
  const loadAssembly = useAssemblyStore((s) => s.loadFromDB);
  const { worldBibles, createWorldBible, updateWorldBible, deleteWorldBible, openWorldBible } = useWorldBibleStore();
  const loadWorldBibleData = useWorldStore((s) => s.loadFromDB);
  const { canInstall, install, installMethod } = usePWAInstall();
  const { checkGlobal, unlocks, totalXP } = useAchievementStore();
  const addAchievementToast = useUIStore((s) => s.addAchievementToast);
  const showAchievementsModal = useUIStore((s) => s.showAchievementsModal);
  const setShowAchievementsModal = useUIStore((s) => s.setShowAchievementsModal);

  const level = getLevel(totalXP);
  const { pct } = getLevelProgress(totalXP);

  const [view, setView] = useState<'books' | 'worlds'>('books');
  const [showNewBookModal, setShowNewBookModal] = useState(false);
  const [editBookTarget, setEditBookTarget] = useState<Book | null>(null);
  const [showNewWorldModal, setShowNewWorldModal] = useState(false);
  const [editWorldTarget, setEditWorldTarget] = useState<WorldBible | null>(null);
  const [showInstallModal, setShowInstallModal] = useState(false);

  const onUnlock = (name: string, xp: number, emoji: string) => addAchievementToast(name, xp, emoji);

  const handleOpenBook = async (id: string) => {
    await openBook(id);
    await Promise.all([loadWorld(id), loadWriting(id), loadAssembly(id)]);
  };

  const handleCreateBook = async (title: string, author: string, synopsis: string, color: string, worldBibleId?: string) => {
    const book = await createBook(title, author, synopsis);
    await updateBook(book.id, { coverColor: color, ...(worldBibleId ? { worldBibleId } : {}) });
    await checkGlobal(books.length + 1, worldBibles.length, onUnlock);
    await handleOpenBook(book.id);
  };

  const handleOpenWorldBible = async (id: string) => {
    openWorldBible(id);
    await loadWorldBibleData(id);
  };

  const handleCreateWorld = async (name: string, description: string, color: string) => {
    const wb = await createWorldBible(name, description, color);
    await checkGlobal(books.length, worldBibles.length + 1, onUnlock);
    await handleOpenWorldBible(wb.id);
  };

  const nextBookColor = BOOK_COLORS[books.length % BOOK_COLORS.length];
  const nextWorldColor = WORLD_COLORS[worldBibles.length % WORLD_COLORS.length];

  const bookShelves = chunk(books, BOOKS_PER_SHELF);
  const worldShelves = chunk(worldBibles, BOOKS_PER_SHELF);

  return (
    <div className="h-screen bg-[#060d18] flex flex-col overflow-hidden text-slate-200">
      <MysticalBackground />

      {/* ── Header ─────────────────────────────────── */}
      <header className="relative z-10 flex items-center justify-between px-4 md:px-10 py-4 shrink-0">
        <div className="flex items-center gap-3">
          <img src="/logo.svg" alt="Wizards Playground"
            className="w-10 h-10 drop-shadow-[0_0_10px_rgba(99,102,241,0.9)]" />
          <div>
            <h1 className="text-lg font-bold leading-none tracking-wide text-white">Wizards Playground</h1>
            <p className="text-[10px] text-cyan-400/70 mt-0.5 tracking-[0.22em] uppercase font-medium">World‑Builder's Toolkit</p>
          </div>
        </div>

        {/* XP bar (center-ish, hidden on small) */}
        <div className="hidden sm:flex flex-col items-center gap-1">
          <div className="flex items-center gap-2">
            <Star size={12} className="text-amber-400" />
            <span className="text-xs font-bold text-amber-300">Level {level}</span>
            <span className="text-[10px] text-slate-600">·</span>
            <span className="text-[10px] text-slate-500">{totalXP} XP</span>
          </div>
          <div className="w-36 h-1.5 bg-slate-800 rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all duration-700"
              style={{ width: `${pct}%`, background: 'linear-gradient(to right, #7c3aed, #a78bfa)' }} />
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Achievements */}
          <button
            onClick={() => setShowAchievementsModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold
              bg-white/5 hover:bg-white/10 border border-white/10 hover:border-violet-500/30
              text-slate-400 hover:text-violet-300 transition-all"
          >
            <Trophy size={13} />
            <span className="hidden md:inline">{unlocks.length} Achievements</span>
            <span className="md:hidden">{unlocks.length}</span>
          </button>

          {/* Toggle view */}
          <button
            onClick={() => setView(view === 'books' ? 'worlds' : 'books')}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold
              bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20
              text-slate-300 hover:text-white transition-all"
          >
            {view === 'books'
              ? <><Globe2 size={14} /> My Worlds</>
              : <><BookOpen size={14} /> My Books</>
            }
          </button>

          {canInstall && (
            <button
              onClick={installMethod === 'safari-mac' || installMethod === 'safari-ios'
                ? () => setShowInstallModal(true) : install}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold
                bg-indigo-600 hover:bg-indigo-500 text-white transition-colors shadow-lg shadow-indigo-900/40"
            >
              <Download size={13} />
              Install App
            </button>
          )}
        </div>
      </header>

      {/* ── Bookshelf area ──────────────────────────── */}
      <main className="flex-1 overflow-y-auto relative z-10 px-4 md:px-10 pt-6 pb-4">

        {/* Section label + add button */}
        <div className="flex items-center gap-3 mb-6">
          <h2 className="text-[11px] font-bold text-white/35 uppercase tracking-[0.22em]">
            {view === 'books' ? 'My Books' : 'My Worlds'}
          </h2>
          <button
            onClick={() => view === 'books' ? setShowNewBookModal(true) : setShowNewWorldModal(true)}
            className="flex items-center gap-1 text-[11px] text-indigo-400/60 hover:text-indigo-300 transition-colors"
          >
            <Plus size={12} />
            {view === 'books' ? 'New Book' : 'New World'}
          </button>
        </div>

        {/* ── BOOKS view ── */}
        {view === 'books' && (
          bookShelves.length === 0 ? (
            <div>
              <div className="flex gap-3 items-end pb-1 px-1">
                <AddSlot onClick={() => setShowNewBookModal(true)} label="New Book" />
              </div>
              <ShelfPlank />
              {/* Empty hint */}
              <p className="text-center text-xs text-white/20 mt-8">
                Your shelves are empty — add your first book above
              </p>
            </div>
          ) : (
            <>
              {bookShelves.map((shelf, si) => (
                <div key={si} className="mb-8">
                  <div className="flex gap-3 items-end pb-1 px-1 overflow-x-auto">
                    {shelf.map((book) => (
                      <BookSpine key={book.id} book={book}
                        onOpen={handleOpenBook}
                        onEdit={(b) => setEditBookTarget(b)}
                        onDelete={deleteBook} />
                    ))}
                    {/* Add slot only on last shelf */}
                    {si === bookShelves.length - 1 && (
                      <AddSlot onClick={() => setShowNewBookModal(true)} label="New Book" />
                    )}
                  </div>
                  <ShelfPlank />
                </div>
              ))}
            </>
          )
        )}

        {/* ── WORLDS view ── */}
        {view === 'worlds' && (
          worldShelves.length === 0 ? (
            <div>
              <div className="flex gap-3 items-end pb-1 px-1">
                <AddSlot onClick={() => setShowNewWorldModal(true)} label="New World" />
              </div>
              <ShelfPlank />
              <p className="text-center text-xs text-white/20 mt-8">
                No world bibles yet — create one to define your universe
              </p>
            </div>
          ) : (
            <>
              {worldShelves.map((shelf, si) => (
                <div key={si} className="mb-8">
                  <div className="flex gap-3 items-end pb-1 px-1 overflow-x-auto">
                    {shelf.map((world) => (
                      <WorldSpine key={world.id} world={world}
                        onOpen={handleOpenWorldBible}
                        onEdit={(w) => setEditWorldTarget(w)}
                        onDelete={deleteWorldBible} />
                    ))}
                    {si === worldShelves.length - 1 && (
                      <AddSlot onClick={() => setShowNewWorldModal(true)} label="New World" />
                    )}
                  </div>
                  <ShelfPlank />
                </div>
              ))}
            </>
          )
        )}
      </main>

      {/* ── Modals ─────────────────────────────────── */}
      {showNewBookModal && (
        <NewBookModal onClose={() => setShowNewBookModal(false)}
          onSave={handleCreateBook} initialColor={nextBookColor}
          worldBibles={worldBibles} />
      )}
      {editBookTarget && (
        <EditBookModal book={editBookTarget} onClose={() => setEditBookTarget(null)}
          onSave={(updates) => updateBook(editBookTarget.id, updates)}
          worldBibles={worldBibles} />
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
      {showAchievementsModal && <AchievementsModal onClose={() => setShowAchievementsModal(false)} />}
      <ToastContainer />
    </div>
  );
}
