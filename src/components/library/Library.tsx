import { useState, useRef, useEffect } from 'react';
import {
  Plus, Globe2, BookOpen, Pencil, Trash2, MoreHorizontal,
  Search, Star, Trophy, Download, X, Share, Settings, Menu, Upload, Sparkles, Brain, GraduationCap,
  User, LogOut, Cloud, Loader2,
} from 'lucide-react';
import { FocusTimer } from '../timer/FocusTimer';
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
import { LibraryMeyvnView } from './LibraryMeyvnView';
import { LibraryTrainingView } from './LibraryTrainingView';
import { LibraryCoachView } from './LibraryCoachView';
import { IS_TAURI } from '../../features/ai-engine/services/OllamaService';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { AchievementsModal } from '../achievements/AchievementsModal';
import { ToastContainer } from '../common/Toast';
import { BOOK_COLORS, WORLD_COLORS } from '../../types';
import type { Book, WorldBible } from '../../types';
import { getLevel, getLevelProgress } from '../../types/achievements';
import { useStreak } from '../../store/streakStore';
import { db } from '../../db/database';
import { libraryRepository } from '../../db/libraryRepository';
import { useAuthStore } from '../../store/authStore';
import { AuthModal } from '../auth/AuthModal';
import { listBackups, restoreBook, backupBook, type BackupSummary } from '../../services/cloudBackupService';
import { isSupabaseConfigured } from '../../lib/supabase';

/* ── Color helper ─────────────────────────────────────────── */
function shiftColor(hex: string, amount: number): string {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = Math.min(255, Math.max(0, (n >> 16) + amount));
  const g = Math.min(255, Math.max(0, ((n >> 8) & 0xff) + amount));
  const b = Math.min(255, Math.max(0, (n & 0xff) + amount));
  return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
}

/* ── Cover Art ────────────────────────────────────────────── */
function BookCoverArt({ color, title }: { color: string; title: string }) {
  const seed = title.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const dark = shiftColor(color, -45);
  return (
    <div className="relative w-full h-44 overflow-hidden" style={{
      background: `linear-gradient(145deg, ${color} 0%, ${dark} 100%)`,
    }}>
      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 300 176" preserveAspectRatio="xMidYMid slice">
        <circle cx={60 + (seed % 80)} cy={20 + (seed % 50)} r={100} fill="rgba(255,255,255,0.07)" />
        <circle cx={220 + (seed % 50)} cy={130 + (seed % 40)} r={75} fill="rgba(255,255,255,0.05)" />
        {Array.from({ length: 14 }).map((_, i) => {
          const x = ((seed * (i * 37 + 17)) % 260) + 20;
          const y = ((seed * (i * 23 + 11)) % 140) + 18;
          const r = 1 + (i % 3) * 0.8;
          return <circle key={i} cx={x} cy={y} r={r} fill="rgba(255,255,255,0.45)" />;
        })}
        <line x1="0" y1="176" x2="300" y2="0" stroke="rgba(255,255,255,0.04)" strokeWidth="50" />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <span className="select-none text-7xl font-bold tracking-wider"
          style={{ color: 'rgba(255,255,255,0.13)', fontFamily: 'Georgia, serif' }}>
          {title.slice(0, 2).toUpperCase()}
        </span>
      </div>
    </div>
  );
}

function WorldCoverArt({ color, name }: { color: string; name: string }) {
  const seed = name.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const dark = shiftColor(color, -45);
  return (
    <div className="relative w-full h-44 overflow-hidden" style={{
      background: `linear-gradient(145deg, ${color} 0%, ${dark} 100%)`,
    }}>
      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 300 176" preserveAspectRatio="xMidYMid slice">
        <circle cx={150} cy={88} r={82} fill="none" stroke="rgba(255,255,255,0.13)" strokeWidth="1.5" />
        <circle cx={150} cy={88} r={55} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
        <ellipse cx={150} cy={88} rx={42} ry={82} fill="none" stroke="rgba(255,255,255,0.10)" strokeWidth="1" />
        <line x1={68} y1={88} x2={232} y2={88} stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
        <line x1={150} y1={6} x2={150} y2={170} stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
        {Array.from({ length: 9 }).map((_, i) => {
          const x = ((seed * (i * 41 + 13)) % 240) + 30;
          const y = ((seed * (i * 29 + 7)) % 120) + 28;
          return <circle key={i} cx={x} cy={y} r={1.5} fill="rgba(255,255,255,0.4)" />;
        })}
      </svg>
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <Globe2 size={54} style={{ color: 'rgba(255,255,255,0.16)' }} />
      </div>
    </div>
  );
}

/* ── Book Card ────────────────────────────────────────────── */
function BookCard({ book, onOpen, onEdit, onDelete }: {
  book: Book; onOpen: (id: string) => void;
  onEdit: (b: Book) => void; onDelete: (id: string) => void;
}) {
  const [menu, setMenu] = useState(false);
  const [confirm, setConfirm] = useState(false);

  return (
    <>
      <div
        className="group bg-white rounded-2xl overflow-hidden cursor-pointer flex flex-col
          shadow-[0_2px_12px_rgba(0,0,0,0.07)] hover:shadow-[0_10px_36px_rgba(0,0,0,0.14)]
          transition-all duration-300 hover:-translate-y-1.5 border border-slate-100/80"
        onClick={() => onOpen(book.id)}
      >
        <BookCoverArt color={book.coverColor} title={book.title} />

        <div className="p-4 flex flex-col flex-1">
          <h3 className="font-bold text-slate-900 text-sm leading-snug mb-0.5 line-clamp-2">{book.title}</h3>
          {book.author && <p className="text-[11px] text-slate-400 mb-2 truncate">{book.author}</p>}

          <div className="mt-auto flex items-center justify-between pt-3 border-t border-slate-100"
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-0.5">
              <button onClick={() => onOpen(book.id)} title="Open"
                className="p-1.5 rounded-lg text-slate-400 hover:text-teal-600 hover:bg-teal-50 transition-colors">
                <BookOpen size={14} />
              </button>
              <button onClick={() => onEdit(book)} title="Edit"
                className="p-1.5 rounded-lg text-slate-400 hover:text-teal-600 hover:bg-teal-50 transition-colors">
                <Pencil size={14} />
              </button>
            </div>
            <div className="relative">
              <button onClick={() => setMenu(!menu)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
                <MoreHorizontal size={14} />
              </button>
              {menu && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setMenu(false)} />
                  <div className="absolute right-0 bottom-9 z-40 bg-white border border-slate-200 rounded-xl shadow-xl py-1 w-32">
                    <button onClick={() => { setConfirm(true); setMenu(false); }}
                      className="flex items-center gap-2 w-full px-3 py-2 text-xs text-red-500 hover:bg-red-50">
                      <Trash2 size={11} /> Delete
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {confirm && (
        <ConfirmDialog title="Delete Book"
          message={`Delete "${book.title}" and all its content? This cannot be undone.`}
          confirmLabel="Delete" danger
          onConfirm={() => { onDelete(book.id); setConfirm(false); }}
          onClose={() => setConfirm(false)} />
      )}
    </>
  );
}

/* ── World Card ───────────────────────────────────────────── */
function WorldCard({ world, onOpen, onEdit, onDelete }: {
  world: WorldBible; onOpen: (id: string) => void;
  onEdit: (w: WorldBible) => void; onDelete: (id: string) => void;
}) {
  const [menu, setMenu] = useState(false);
  const [confirm, setConfirm] = useState(false);

  return (
    <>
      <div
        className="group bg-white rounded-2xl overflow-hidden cursor-pointer flex flex-col
          shadow-[0_2px_12px_rgba(0,0,0,0.07)] hover:shadow-[0_10px_36px_rgba(0,0,0,0.14)]
          transition-all duration-300 hover:-translate-y-1.5 border border-slate-100/80"
        onClick={() => onOpen(world.id)}
      >
        <WorldCoverArt color={world.coverColor} name={world.name} />

        <div className="p-4 flex flex-col flex-1">
          <h3 className="font-bold text-slate-900 text-sm leading-snug mb-0.5 line-clamp-2">{world.name}</h3>
          {world.description && <p className="text-[11px] text-slate-400 mb-2 line-clamp-2">{world.description}</p>}

          <div className="mt-auto flex items-center justify-between pt-3 border-t border-slate-100"
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-0.5">
              <button onClick={() => onOpen(world.id)} title="Open"
                className="p-1.5 rounded-lg text-slate-400 hover:text-teal-600 hover:bg-teal-50 transition-colors">
                <Globe2 size={14} />
              </button>
              <button onClick={() => onEdit(world)} title="Edit"
                className="p-1.5 rounded-lg text-slate-400 hover:text-teal-600 hover:bg-teal-50 transition-colors">
                <Pencil size={14} />
              </button>
            </div>
            <div className="relative">
              <button onClick={() => setMenu(!menu)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
                <MoreHorizontal size={14} />
              </button>
              {menu && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setMenu(false)} />
                  <div className="absolute right-0 bottom-9 z-40 bg-white border border-slate-200 rounded-xl shadow-xl py-1 w-32">
                    <button onClick={() => { setConfirm(true); setMenu(false); }}
                      className="flex items-center gap-2 w-full px-3 py-2 text-xs text-red-500 hover:bg-red-50">
                      <Trash2 size={11} /> Delete
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {confirm && (
        <ConfirmDialog title="Delete World"
          message={`Delete "${world.name}" and all its entries? This cannot be undone.`}
          confirmLabel="Delete" danger
          onConfirm={() => { onDelete(world.id); setConfirm(false); }}
          onClose={() => setConfirm(false)} />
      )}
    </>
  );
}

/* ── Create New Card ──────────────────────────────────────── */
function CreateCard({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <div onClick={onClick}
      className="border-2 border-dashed border-slate-200 hover:border-teal-400
        rounded-2xl flex flex-col items-center justify-center gap-3 cursor-pointer
        transition-all duration-200 hover:bg-teal-50/40 group min-h-[240px] bg-white">
      <div className="w-14 h-14 rounded-full bg-slate-100 group-hover:bg-teal-100
        flex items-center justify-center transition-colors">
        <Plus size={24} className="text-slate-400 group-hover:text-teal-600 transition-colors" />
      </div>
      <span className="text-sm font-semibold text-slate-400 group-hover:text-teal-600 transition-colors">
        {label}
      </span>
    </div>
  );
}

/* ── Safari Install Modal ─────────────────────────────────── */
function SafariInstallModal({ method, onClose }: { method: 'safari-mac' | 'safari-ios' | 'ios-chrome'; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-slate-900">Install Wizards Playground</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100">
            <X size={16} />
          </button>
        </div>
        {method === 'ios-chrome' ? (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">
              Chrome on iPhone can't install PWAs — Apple requires Safari for this.
            </p>
            <ol className="space-y-3 text-sm text-slate-600">
              <li className="flex items-start gap-3">
                <span className="w-5 h-5 rounded-full bg-violet-600 text-white text-xs flex items-center justify-center shrink-0 mt-0.5 font-bold">1</span>
                <span>Copy this URL and open it in <strong>Safari</strong></span>
              </li>
              <li className="flex items-start gap-3">
                <span className="w-5 h-5 rounded-full bg-violet-600 text-white text-xs flex items-center justify-center shrink-0 mt-0.5 font-bold">2</span>
                <span>Tap <Share size={13} className="inline mx-1 text-blue-500" /><strong>Share</strong>, then <strong>"Add to Home Screen"</strong></span>
              </li>
              <li className="flex items-start gap-3">
                <span className="w-5 h-5 rounded-full bg-violet-600 text-white text-xs flex items-center justify-center shrink-0 mt-0.5 font-bold">3</span>
                <span>Tap <strong>"Add"</strong></span>
              </li>
            </ol>
          </div>
        ) : method === 'safari-ios' ? (
          <ol className="space-y-3 text-sm text-slate-600">
            <li className="flex items-start gap-3">
              <span className="w-5 h-5 rounded-full bg-violet-600 text-white text-xs flex items-center justify-center shrink-0 mt-0.5 font-bold">1</span>
              <span>Tap <Share size={13} className="inline mx-1 text-blue-500" /><strong>Share</strong> in Safari</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="w-5 h-5 rounded-full bg-violet-600 text-white text-xs flex items-center justify-center shrink-0 mt-0.5 font-bold">2</span>
              <span>Tap <strong>"Add to Home Screen"</strong></span>
            </li>
            <li className="flex items-start gap-3">
              <span className="w-5 h-5 rounded-full bg-violet-600 text-white text-xs flex items-center justify-center shrink-0 mt-0.5 font-bold">3</span>
              <span>Tap <strong>"Add"</strong></span>
            </li>
          </ol>
        ) : (
          <ol className="space-y-3 text-sm text-slate-600">
            <li className="flex items-start gap-3">
              <span className="w-5 h-5 rounded-full bg-violet-600 text-white text-xs flex items-center justify-center shrink-0 mt-0.5 font-bold">1</span>
              <span>Click <Share size={13} className="inline mx-1 text-blue-500" /><strong>Share</strong> in Safari</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="w-5 h-5 rounded-full bg-violet-600 text-white text-xs flex items-center justify-center shrink-0 mt-0.5 font-bold">2</span>
              <span>Click <strong>"Add to Dock"</strong></span>
            </li>
            <li className="flex items-start gap-3">
              <span className="w-5 h-5 rounded-full bg-violet-600 text-white text-xs flex items-center justify-center shrink-0 mt-0.5 font-bold">3</span>
              <span>Click <strong>"Add"</strong></span>
            </li>
          </ol>
        )}
        <button onClick={onClose}
          className="mt-5 w-full py-2.5 bg-violet-600 hover:bg-violet-500 text-white rounded-xl text-sm font-semibold transition-colors">
          Got it
        </button>
      </div>
    </div>
  );
}

/* ── Sidebar ──────────────────────────────────────────────── */
type LibraryView = 'books' | 'worlds' | 'maven' | 'training' | 'coach';

interface SidebarProps {
  view: LibraryView;
  setView: (v: LibraryView) => void;
  totalXP: number;
  level: number;
  xpPct: number;
  streakDays: number;
  unlockCount: number;
  onAchievements: () => void;
  canInstall: boolean;
  onInstall: () => void;
  onAbout: () => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
}

function LibrarySidebar({
  view, setView, totalXP, level, xpPct, streakDays,
  unlockCount, onAchievements, canInstall, onInstall, onAbout,
  mobileOpen, onMobileClose,
}: SidebarProps) {
  const navItems: { id: LibraryView; icon: typeof BookOpen; label: string; accent?: boolean; oracle?: boolean }[] = [
    { id: 'books', icon: BookOpen, label: 'Books Library' },
    { id: 'worlds', icon: Globe2, label: 'World Atlas' },
    { id: 'maven', icon: Sparkles, label: 'Ask Meyvn', accent: true },
    { id: 'training', icon: Brain, label: 'Training Portal', oracle: true },
    { id: 'coach', icon: GraduationCap, label: 'Writing Coach' },
  ];

  const content = (
    <div className="flex flex-col h-full bg-white border-r border-slate-200">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <img src="/IMG_4709.jpeg" alt="" className="w-9 h-9 rounded-xl object-cover shrink-0" />
          <div>
            <p className="text-[11px] font-bold text-slate-800 leading-none tracking-wide">Wizards Playground</p>
            <p className="text-[9px] text-teal-600/70 mt-0.5 tracking-[0.18em] uppercase">World Builder's Toolkit</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {navItems.map(({ id, icon: Icon, label, accent, oracle }) => (
          <button key={id} onClick={() => { setView(id); onMobileClose(); }}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all
              ${view === id
                ? oracle
                  ? 'text-amber-700 bg-amber-50 border-l-2 border-amber-400 pl-[10px]'
                  : 'text-violet-700 bg-violet-50 border-l-2 border-violet-500 pl-[10px]'
                : oracle
                  ? 'text-slate-500 hover:text-amber-700 hover:bg-amber-50/60'
                  : accent
                  ? 'text-slate-500 hover:text-violet-600 hover:bg-violet-50/60'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
              }`}>
            <Icon
              size={16}
              className={
                view === id
                  ? oracle ? 'text-amber-500' : 'text-violet-600'
                  : oracle ? 'text-amber-400' : accent ? 'text-violet-400' : 'text-slate-400'
              }
            />
            {label}
          </button>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-3 pb-4 space-y-0.5 border-t border-slate-100 pt-3">
        {/* XP */}
        <div className="px-3 py-2.5">
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-1.5">
              <Star size={11} className="text-amber-500" />
              <span className="text-[11px] font-bold text-amber-600">Level {level}</span>
              {streakDays > 0 && (
                <span className="text-[11px] text-orange-500">· 🔥 {streakDays}</span>
              )}
            </div>
            <span className="text-[10px] text-slate-400">{totalXP} XP</span>
          </div>
          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all duration-700"
              style={{ width: `${xpPct}%`, background: 'linear-gradient(to right, #7c3aed, #0d9488)' }} />
          </div>
        </div>

        <button onClick={onAchievements}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium
            text-slate-500 hover:text-slate-700 hover:bg-slate-50 transition-all">
          <Trophy size={16} className="text-teal-500" />
          {unlockCount} Achievements
        </button>

        {canInstall && (
          <button onClick={onInstall}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold
              text-white transition-all"
            style={{ background: 'linear-gradient(135deg, #7c3aed, #0d9488)' }}>
            <Download size={16} />
            Install App
          </button>
        )}

        {!IS_TAURI && (
          <a
            href="https://github.com/shaneweickum-lab/Scriptorium/releases/latest"
            target="_blank"
            rel="noreferrer"
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium
              text-slate-500 hover:text-slate-700 hover:bg-slate-50 transition-all"
          >
            <Download size={16} className="text-violet-400" />
            Get Desktop App
          </a>
        )}

        <button onClick={onAbout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium
            text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-all">
          <Settings size={16} className="text-slate-300" />
          About
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-56 shrink-0 h-full">
        {content}
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <>
          <div className="fixed inset-0 z-40 bg-slate-900/40 md:hidden" onClick={onMobileClose} />
          <aside className="fixed inset-y-0 left-0 z-50 w-64 md:hidden flex flex-col shadow-xl">
            {content}
          </aside>
        </>
      )}
    </>
  );
}

/* ── Cloud Book Card ──────────────────────────────────────── */
function CloudBookCard({ backup, isRestoring, onRestore }: {
  backup: BackupSummary;
  isRestoring: boolean;
  onRestore: () => void;
}) {
  return (
    <div className="bg-white rounded-2xl overflow-hidden flex flex-col border border-dashed border-violet-200 shadow-sm hover:shadow-md transition-all hover:-translate-y-0.5 duration-200">
      <div className="relative w-full h-44 flex items-center justify-center overflow-hidden"
        style={{ background: 'linear-gradient(145deg, #7c3aed14, #0d948814)' }}>
        <Cloud size={52} className="text-violet-100" />
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="select-none text-7xl font-bold tracking-wider"
            style={{ color: 'rgba(124,58,237,0.1)', fontFamily: 'Georgia, serif' }}>
            {backup.title.slice(0, 2).toUpperCase()}
          </span>
        </div>
        <div className="absolute top-2 right-2 flex items-center gap-1 text-[9px] font-semibold text-violet-600 bg-white px-1.5 py-0.5 rounded-full shadow-sm border border-violet-100">
          <Cloud size={8} /> Cloud
        </div>
      </div>
      <div className="p-4 flex flex-col flex-1">
        <h3 className="font-bold text-slate-800 text-sm leading-snug mb-0.5 line-clamp-2">{backup.title}</h3>
        {backup.author && <p className="text-[11px] text-slate-400 truncate">{backup.author}</p>}
        <p className="text-[10px] text-slate-400 mt-1">
          {backup.word_count.toLocaleString()} words · {new Date(backup.backed_up_at).toLocaleDateString()}
        </p>
        <button
          onClick={onRestore}
          disabled={isRestoring}
          className="mt-auto pt-3 flex items-center justify-center gap-1.5 w-full py-2 rounded-xl text-xs font-semibold text-white transition-all hover:opacity-90 disabled:opacity-50"
          style={{ background: 'linear-gradient(135deg, #7c3aed, #0d9488)' }}>
          {isRestoring
            ? <><Loader2 size={11} className="animate-spin" /> Opening…</>
            : <><Download size={11} /> Open on this device</>
          }
        </button>
      </div>
    </div>
  );
}

/* ── Main Library ─────────────────────────────────────────── */
export function Library() {
  const { books, createBook, updateBook, deleteBook, openBook, loadLibrary } = useLibraryStore();
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
  const { current: streakDays } = useStreak();

  const [view, setView] = useState<LibraryView>(() => {
    const initial = localStorage.getItem('wp_initial_view') as LibraryView | null;
    if (initial && ['books', 'worlds', 'maven', 'training', 'coach'].includes(initial)) {
      localStorage.removeItem('wp_initial_view');
      return initial;
    }
    return 'books';
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [showNewBookModal, setShowNewBookModal] = useState(false);
  const [editBookTarget, setEditBookTarget] = useState<Book | null>(null);
  const [showNewWorldModal, setShowNewWorldModal] = useState(false);
  const [editWorldTarget, setEditWorldTarget] = useState<WorldBible | null>(null);
  const [showInstallModal, setShowInstallModal] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const loadFileRef = useRef<HTMLInputElement>(null);
  const addToast = useUIStore((s) => s.addToast);
  const openAuthModal = useUIStore((s) => s.openAuthModal);
  const closeAuthModal = useUIStore((s) => s.closeAuthModal);
  const showAuthModal = useUIStore((s) => s.showAuthModal);

  const { status, user, profile, signOut } = useAuthStore();
  const [cloudBackups, setCloudBackups] = useState<BackupSummary[]>([]);
  const [cloudLoading, setCloudLoading] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [backingUpAll, setBackingUpAll] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  // Fetch cloud backups when auth state changes
  useEffect(() => {
    if (status === 'authenticated' && user) {
      setCloudLoading(true);
      listBackups(user.id).then((b) => { setCloudBackups(b); setCloudLoading(false); });
    } else {
      setCloudBackups([]);
    }
  }, [status, user?.id]);

  // Close user menu on outside click
  useEffect(() => {
    if (!showUserMenu) return;
    const handler = (e: MouseEvent) => {
      if (!userMenuRef.current?.contains(e.target as Node)) setShowUserMenu(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showUserMenu]);

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

  const handleLoadFile = async (file: File) => {
    try {
      const text = await file.text();
      const data = JSON.parse(text);

      if (data.type === 'worldBible' && data.worldBible) {
        // World Bible file
        const wbId = data.worldBible.id;
        await db.worldSections.where('bookId').equals(wbId).delete();
        await db.worldEntries.where('bookId').equals(wbId).delete();
        await db.worldBibles.put(data.worldBible);
        if (data.sections?.length) await db.worldSections.bulkPut(data.sections);
        if (data.entries?.length) await db.worldEntries.bulkPut(data.entries);
        addToast('World Bible loaded');
      } else if (data.version && data.writingNodes && data.book) {
        // Book project file (v2+)
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
        if (data.linkedWorldBible) {
          const { worldBible, sections: wbSections, entries: wbEntries } = data.linkedWorldBible;
          const wbId = worldBible.id;
          await db.worldSections.where('bookId').equals(wbId).delete();
          await db.worldEntries.where('bookId').equals(wbId).delete();
          await db.worldBibles.put(worldBible);
          if (wbSections?.length) await db.worldSections.bulkPut(wbSections);
          if (wbEntries?.length) await db.worldEntries.bulkPut(wbEntries);
        }
        addToast('Book loaded — it now appears in your library');
      } else {
        addToast('Unrecognised file format', 'error');
      }
    } catch {
      addToast('Failed to load file', 'error');
    }
  };

  // Restore a cloud book to this device then open it
  const handleRestoreBook = async (backup: BackupSummary) => {
    if (books.find((b) => b.id === backup.local_id)) {
      await handleOpenBook(backup.local_id);
      return;
    }
    setRestoringId(backup.id);
    const result = await restoreBook(backup.id);
    if (result.ok) {
      await loadLibrary();
      await handleOpenBook(backup.local_id);
    } else {
      addToast(result.error ?? 'Restore failed', 'error');
    }
    setRestoringId(null);
  };

  // Back up every local book to the cloud
  const handleBackupAll = async () => {
    if (!user) return;
    setBackingUpAll(true);
    let ok = 0;
    for (const book of books) {
      const result = await backupBook(book.id, user);
      if (result.ok) ok++;
    }
    const updated = await listBackups(user.id);
    setCloudBackups(updated);
    setBackingUpAll(false);
    setShowUserMenu(false);
    addToast(`${ok}/${books.length} ${ok === 1 ? 'book' : 'books'} backed up`);
  };

  const nextBookColor = BOOK_COLORS[books.length % BOOK_COLORS.length];
  const nextWorldColor = WORLD_COLORS[worldBibles.length % WORLD_COLORS.length];

  const filteredBooks = books.filter((b) =>
    !searchQuery || b.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    b.author?.toLowerCase().includes(searchQuery.toLowerCase())
  );
  const filteredWorlds = worldBibles.filter((w) =>
    !searchQuery || w.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const cloudOnlyBackups = cloudBackups.filter(
    (backup) => !books.some((b) => b.id === backup.local_id),
  );

  const isBooks = view === 'books';
  const sectionTitle = isBooks ? 'Books Library' : 'World Atlas';
  const newLabel = isBooks ? 'New Book' : 'New World';
  const emptyHint = isBooks
    ? 'Your library is empty — create your first book above'
    : 'No world bibles yet — build your first universe above';

  return (
    <div className="h-screen flex overflow-hidden bg-slate-50">
      {/* Sidebar */}
      <LibrarySidebar
        view={view} setView={setView}
        totalXP={totalXP} level={level} xpPct={pct} streakDays={streakDays}
        unlockCount={unlocks.length}
        onAchievements={() => setShowAchievementsModal(true)}
        canInstall={canInstall}
        onInstall={installMethod === 'safari-mac' || installMethod === 'safari-ios' || installMethod === 'ios-chrome'
          ? () => setShowInstallModal(true) : install}
        onAbout={() => { localStorage.removeItem('wp_seen_landing'); window.location.reload(); }}
        mobileOpen={mobileSidebarOpen}
        onMobileClose={() => setMobileSidebarOpen(false)}
      />

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden bg-white relative pb-16 md:pb-0">
        {view === 'maven' ? (
          <div key="maven" className="wp-view-enter flex-1 flex flex-col overflow-hidden">
            <LibraryMeyvnView />
          </div>
        ) : view === 'training' ? (
          <div key="training" className="wp-view-enter flex-1 flex flex-col overflow-hidden">
            <LibraryTrainingView />
          </div>
        ) : view === 'coach' ? (
          <div key="coach" className="wp-view-enter flex-1 flex flex-col overflow-hidden">
            <LibraryCoachView />
          </div>
        ) : (
        <div key={view} className="wp-view-enter flex-1 flex flex-col overflow-hidden">
        <>
        {/* Top bar */}
        <header className="shrink-0 px-6 pt-5 pb-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            {/* Mobile menu button */}
            <button className="md:hidden p-2 rounded-xl text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              onClick={() => setMobileSidebarOpen(true)}>
              <Menu size={20} />
            </button>

            {/* Search bar with gradient border */}
            <div className="flex-1 max-w-xl">
              <div className="relative p-px rounded-full"
                style={{ background: 'linear-gradient(to right, #7c3aed, #0d9488)', padding: '1.5px' }}>
                <div className="relative flex items-center gap-2 bg-white rounded-full px-4 py-2.5">
                  <Search size={15} className="text-slate-400 shrink-0" />
                  <input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={isBooks ? 'Search your books...' : 'Search world bibles...'}
                    className="flex-1 bg-transparent text-sm text-slate-700 placeholder-slate-400 outline-none"
                  />
                  {searchQuery && (
                    <button onClick={() => setSearchQuery('')}
                      className="text-slate-400 hover:text-slate-600 transition-colors">
                      <X size={13} />
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Focus timer */}
            <div className="hidden sm:block">
              <FocusTimer />
            </div>

            {/* Load button */}
            <button
              onClick={() => loadFileRef.current?.click()}
              title="Load a book or world bible from a file"
              className="flex items-center gap-2 px-3 py-2.5 rounded-full text-sm font-semibold text-slate-600
                border border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition-all shrink-0">
              <Upload size={15} />
              <span className="hidden sm:inline">Load</span>
            </button>
            <input
              ref={loadFileRef}
              type="file"
              accept=".json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) { handleLoadFile(file); e.target.value = ''; }
              }}
            />

            {/* New button */}
            <button
              onClick={() => isBooks ? setShowNewBookModal(true) : setShowNewWorldModal(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-semibold text-white
                shadow-lg shadow-teal-900/20 transition-all hover:opacity-90 shrink-0"
              style={{ background: 'linear-gradient(135deg, #7c3aed, #0d9488)' }}>
              <Plus size={16} />
              <span className="hidden sm:inline">{newLabel}</span>
            </button>

            {/* Account button — only shown when Supabase is configured */}
            {isSupabaseConfigured && status !== 'loading' && (
              status === 'unauthenticated' ? (
                <button
                  onClick={() => openAuthModal('signin')}
                  title="Sign in to sync across devices"
                  className="flex items-center gap-2 px-3 py-2.5 rounded-full text-sm font-semibold text-slate-600
                    border border-slate-200 hover:border-violet-300 hover:text-violet-600 hover:bg-violet-50 transition-all shrink-0">
                  <User size={15} />
                  <span className="hidden lg:inline">Sign In</span>
                </button>
              ) : (
                <div className="relative shrink-0" ref={userMenuRef}>
                  <button
                    onClick={() => setShowUserMenu((v) => !v)}
                    title={profile?.display_name ?? user?.email ?? 'Account'}
                    className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white hover:opacity-80 transition-opacity"
                    style={{ background: 'linear-gradient(135deg, #7c3aed, #0d9488)' }}>
                    {(profile?.display_name ?? user?.email ?? '?')[0].toUpperCase()}
                  </button>
                  {showUserMenu && (
                    <div className="absolute right-0 top-11 z-50 bg-white border border-slate-200 rounded-xl shadow-xl py-1 w-56 overflow-hidden">
                      <div className="px-3 py-2.5 border-b border-slate-100">
                        <p className="text-xs font-semibold text-slate-700 truncate">{profile?.display_name ?? 'Account'}</p>
                        <p className="text-[10px] text-slate-400 truncate mt-0.5">{user?.email}</p>
                      </div>
                      <button
                        onClick={handleBackupAll}
                        disabled={backingUpAll || books.length === 0}
                        className="flex items-center gap-2 w-full px-3 py-2 text-xs text-slate-600 hover:bg-violet-50 hover:text-violet-700 transition-colors disabled:opacity-50">
                        {backingUpAll
                          ? <Loader2 size={12} className="animate-spin" />
                          : <Cloud size={12} />}
                        Back up all books
                      </button>
                      <button
                        onClick={() => { signOut(); setShowUserMenu(false); }}
                        className="flex items-center gap-2 w-full px-3 py-2 text-xs text-red-500 hover:bg-red-50 transition-colors">
                        <LogOut size={12} /> Sign Out
                      </button>
                    </div>
                  )}
                </div>
              )
            )}
          </div>
        </header>

        {/* Section title */}
        <div className="shrink-0 px-6 py-4 flex items-center justify-between border-b border-slate-100">
          <div>
            <h1 className="text-lg font-bold text-slate-800">{sectionTitle}</h1>
            <p className="text-xs text-slate-400 mt-0.5">
              {isBooks
                ? `${filteredBooks.length} ${filteredBooks.length === 1 ? 'book' : 'books'} in your library`
                : `${filteredWorlds.length} world ${filteredWorlds.length === 1 ? 'bible' : 'bibles'}`
              }
            </p>
          </div>
        </div>

        {/* Card grid */}
        <main className="flex-1 overflow-y-auto px-6 pb-8 pt-5 bg-slate-50">
          {isBooks ? (
            filteredBooks.length === 0 && !searchQuery ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                <CreateCard onClick={() => setShowNewBookModal(true)} label="Create New Book" />
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {filteredBooks.map((book) => (
                  <BookCard key={book.id} book={book}
                    onOpen={handleOpenBook}
                    onEdit={(b) => setEditBookTarget(b)}
                    onDelete={deleteBook} />
                ))}
                {!searchQuery && (
                  <CreateCard onClick={() => setShowNewBookModal(true)} label="New Book" />
                )}
                {searchQuery && filteredBooks.length === 0 && (
                  <div className="col-span-full text-center py-16 text-slate-400 text-sm">
                    No books match "{searchQuery}"
                  </div>
                )}
              </div>
            )
          ) : (
            filteredWorlds.length === 0 && !searchQuery ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                <CreateCard onClick={() => setShowNewWorldModal(true)} label="Create New World" />
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {filteredWorlds.map((world) => (
                  <WorldCard key={world.id} world={world}
                    onOpen={handleOpenWorldBible}
                    onEdit={(w) => setEditWorldTarget(w)}
                    onDelete={deleteWorldBible} />
                ))}
                {!searchQuery && (
                  <CreateCard onClick={() => setShowNewWorldModal(true)} label="New World" />
                )}
                {searchQuery && filteredWorlds.length === 0 && (
                  <div className="col-span-full text-center py-16 text-slate-400 text-sm">
                    No worlds match "{searchQuery}"
                  </div>
                )}
              </div>
            )
          )}

          {/* Empty hint */}
          {((isBooks && books.length === 0) || (!isBooks && worldBibles.length === 0)) && (
            <p className="text-center text-xs text-slate-400 mt-6">{emptyHint}</p>
          )}

          {/* Cloud books — available on other devices */}
          {isBooks && status === 'authenticated' && cloudOnlyBackups.length > 0 && (
            <div className="mt-8">
              <div className="flex items-center gap-3 mb-4">
                <div className="flex items-center gap-2">
                  <Cloud size={14} className="text-violet-400" />
                  <h2 className="text-sm font-bold text-slate-700">Available from Cloud</h2>
                </div>
                <div className="flex-1 h-px bg-slate-100" />
                <p className="text-[10px] text-slate-400">Written on another device · click to open here</p>
              </div>
              {cloudLoading ? (
                <div className="flex items-center gap-2 text-xs text-slate-400 py-4">
                  <Loader2 size={13} className="animate-spin text-violet-400" /> Loading cloud books…
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                  {cloudOnlyBackups.map((backup) => (
                    <CloudBookCard
                      key={backup.id}
                      backup={backup}
                      isRestoring={restoringId === backup.id}
                      onRestore={() => handleRestoreBook(backup)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Sign-in prompt — only when Supabase is configured and user is logged out */}
          {isBooks && isSupabaseConfigured && status === 'unauthenticated' && (
            <div className="mt-8 p-4 rounded-2xl border border-dashed border-slate-200 bg-white flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: 'linear-gradient(135deg, #7c3aed14, #0d948814)' }}>
                <Cloud size={18} className="text-violet-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-700">Sync across devices</p>
                <p className="text-xs text-slate-400 mt-0.5">Sign in to back up your books and pick up where you left off on any device</p>
              </div>
              <button
                onClick={() => openAuthModal('signin')}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90 shrink-0"
                style={{ background: 'linear-gradient(135deg, #7c3aed, #0d9488)' }}>
                <User size={13} /> Sign In
              </button>
            </div>
          )}
        </main>
        </>
        </div>
        )}
      </div>

      {/* Modals */}
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
      {showInstallModal && (installMethod === 'safari-mac' || installMethod === 'safari-ios' || installMethod === 'ios-chrome') && (
        <SafariInstallModal method={installMethod} onClose={() => setShowInstallModal(false)} />
      )}
      {showAchievementsModal && <AchievementsModal onClose={() => setShowAchievementsModal(false)} />}
      {showAuthModal && <AuthModal onClose={closeAuthModal} />}
      <ToastContainer />

      {/* Mobile bottom tab bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 h-16 bg-white border-t border-slate-200 flex items-center justify-around px-2 safe-area-bottom">
        <button onClick={() => setView('books')} className={`flex flex-col items-center gap-1 px-3 py-2 rounded-xl transition-all ${view === 'books' ? 'text-violet-700' : 'text-slate-400'}`}>
          <BookOpen size={20} className={view === 'books' ? 'text-violet-600' : 'text-slate-400'} />
          <span className="text-[9px] font-semibold">Books</span>
        </button>
        <button onClick={() => setView('worlds')} className={`flex flex-col items-center gap-1 px-3 py-2 rounded-xl transition-all ${view === 'worlds' ? 'text-violet-700' : 'text-slate-400'}`}>
          <Globe2 size={20} className={view === 'worlds' ? 'text-violet-600' : 'text-slate-400'} />
          <span className="text-[9px] font-semibold">Worlds</span>
        </button>
        <button onClick={() => setView('maven')} className={`flex flex-col items-center gap-1 px-3 py-2 rounded-xl transition-all ${view === 'maven' ? 'text-violet-700' : 'text-slate-400'}`}>
          <Sparkles size={20} className={view === 'maven' ? 'text-violet-600' : 'text-violet-300'} />
          <span className="text-[9px] font-semibold">Meyvn</span>
        </button>
        <button onClick={() => setView('training')} className={`flex flex-col items-center gap-1 px-3 py-2 rounded-xl transition-all ${view === 'training' ? 'text-amber-700' : 'text-slate-400'}`}>
          <Brain size={20} className={view === 'training' ? 'text-amber-500' : 'text-slate-400'} />
          <span className="text-[9px] font-semibold">Train</span>
        </button>
        <button onClick={() => setView('coach')} className={`flex flex-col items-center gap-1 px-3 py-2 rounded-xl transition-all ${view === 'coach' ? 'text-teal-700' : 'text-slate-400'}`}>
          <GraduationCap size={20} className={view === 'coach' ? 'text-teal-600' : 'text-slate-400'} />
          <span className="text-[9px] font-semibold">Coach</span>
        </button>
      </nav>
    </div>
  );
}
