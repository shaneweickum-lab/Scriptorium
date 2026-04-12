import { useState } from 'react';
import { Lock } from 'lucide-react';
import { Modal } from '../common/Modal';
import { Input, Textarea } from '../common/Input';
import { Button } from '../common/Button';
import { useLibraryStore } from '../../store/libraryStore';
import { useUIStore } from '../../store/uiStore';
import { useAchievementStore } from '../../store/achievementStore';
import { BOOK_COLORS, DEFAULT_ENABLED_LEVELS } from '../../types';
import type { HierarchyLabels, EnabledLevels } from '../../types';
import { ACHIEVEMENTS, CATEGORY_COLORS } from '../../types/achievements';

interface Props { onClose: () => void }

type Tab = 'settings' | 'achievements';

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
        disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'
      } ${checked ? '' : 'bg-slate-200'}`}
      style={checked ? { background: 'linear-gradient(135deg, #7c3aed, #0d9488)' } : {}}
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-[18px]' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
}

export function ProjectSettings({ onClose }: Props) {
  const { activeBook, updateBook, updateHierarchyLabels } = useLibraryStore();
  const addToast = useUIStore((s) => s.addToast);
  const { unlockSet } = useAchievementStore();

  const [tab, setTab] = useState<Tab>('settings');
  const [title, setTitle] = useState(activeBook?.title || '');
  const [author, setAuthor] = useState(activeBook?.author || '');
  const [synopsis, setSynopsis] = useState(activeBook?.synopsis || '');
  const [color, setColor] = useState(activeBook?.coverColor || BOOK_COLORS[0]);
  const [wordGoal, setWordGoal] = useState(String(activeBook?.wordGoal ?? ''));
  const [labels, setLabels] = useState<HierarchyLabels>(
    activeBook?.hierarchyLabels || { part: 'Part', chapter: 'Chapter', scene: 'Scene', note: 'Note' }
  );
  const [enabledLevels, setEnabledLevels] = useState<EnabledLevels>(
    activeBook?.enabledLevels ?? { ...DEFAULT_ENABLED_LEVELS }
  );

  const handleSave = async () => {
    if (!activeBook) return;
    await updateBook(activeBook.id, {
      title: title.trim() || 'Untitled',
      author: author.trim(),
      synopsis: synopsis.trim(),
      coverColor: color,
      wordGoal: wordGoal ? Number(wordGoal) : undefined,
      enabledLevels,
    });
    await updateHierarchyLabels(labels);
    addToast('Settings saved');
    onClose();
  };

  // Per-book achievements
  const bookAchievements = ACHIEVEMENTS.filter((a) => a.scope === 'per-book');
  const bookId = activeBook?.id ?? '';
  const isUnlocked = (id: string) => unlockSet.has(`${id}:${bookId}`);
  const unlockedCount = bookAchievements.filter((a) => isUnlocked(a.id)).length;

  return (
    <Modal title="Book Settings" onClose={onClose} size="md">
      {/* Tab bar */}
      <div className="flex gap-1 mb-5 border-b border-slate-200 pb-0">
        {(['settings', 'achievements'] as Tab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-xs font-semibold capitalize rounded-t-lg transition-colors border-b-2 -mb-px ${
              tab === t
                ? 'text-violet-600 border-violet-500'
                : 'text-slate-400 border-transparent hover:text-slate-600'
            }`}>
            {t === 'achievements' ? `Achievements (${unlockedCount}/${bookAchievements.length})` : t}
          </button>
        ))}
      </div>

      {tab === 'settings' && (
        <div className="flex flex-col gap-4">
          {/* Row 1: Title + Author */}
          <div className="grid grid-cols-2 gap-3">
            <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="My Novel" />
            <Input label="Author" value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="Your Name" />
          </div>

          {/* Row 2: Synopsis */}
          <Textarea label="Synopsis" value={synopsis} onChange={(e) => setSynopsis(e.target.value)}
            placeholder="A brief description..." rows={2} />

          {/* Row 3: Word goal + Accent color side by side */}
          <div className="grid grid-cols-2 gap-3 items-start">
            <Input
              label="Word Count Goal"
              value={wordGoal}
              onChange={(e) => setWordGoal(e.target.value.replace(/\D/g, ''))}
              placeholder="e.g. 80000"
              type="text"
              inputMode="numeric"
            />
            <div>
              <p className="text-sm font-medium text-slate-600 mb-2">Accent Color</p>
              <div className="flex gap-2 flex-wrap">
                {BOOK_COLORS.map((c) => (
                  <button key={c} onClick={() => setColor(c)}
                    className="w-6 h-6 rounded-full transition-transform hover:scale-110"
                    style={{ backgroundColor: c, outline: color === c ? `3px solid ${c}` : 'none', outlineOffset: '2px', filter: color === c ? 'brightness(0.8)' : 'none' }} />
                ))}
              </div>
            </div>
          </div>

          {/* Row 4: Outline Structure — compact toggle rows */}
          <div>
            <p className="text-sm font-medium text-slate-600 mb-2">Outline Structure</p>
            <div className="flex flex-col gap-1.5">
              {(['part', 'chapter', 'scene'] as const).map((key) => {
                const enabledCount = Object.values(enabledLevels).filter(Boolean).length;
                const disableToggle = enabledLevels[key] && enabledCount === 1;
                return (
                  <div key={key}
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg border transition-colors ${
                      enabledLevels[key]
                        ? 'bg-white border-slate-200'
                        : 'bg-slate-50 border-slate-100'
                    }`}
                  >
                    <Toggle
                      checked={enabledLevels[key]}
                      onChange={(v) => setEnabledLevels({ ...enabledLevels, [key]: v })}
                      disabled={disableToggle}
                    />
                    <input
                      value={labels[key]}
                      onChange={(e) => setLabels({ ...labels, [key]: e.target.value })}
                      disabled={!enabledLevels[key]}
                      placeholder={key.charAt(0).toUpperCase() + key.slice(1)}
                      className="flex-1 bg-transparent text-sm text-slate-800 placeholder-slate-400 focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed"
                    />
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider">
                      {key}
                    </span>
                  </div>
                );
              })}
              {/* Note — always on */}
              <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-white border border-slate-200">
                <div className="w-9 h-5 flex items-center justify-center">
                  <span className="text-[10px] text-slate-400">—</span>
                </div>
                <input
                  value={labels.note}
                  onChange={(e) => setLabels({ ...labels, note: e.target.value })}
                  placeholder="Note"
                  className="flex-1 bg-transparent text-sm text-slate-800 placeholder-slate-400 focus:outline-none"
                />
                <span className="text-[10px] text-slate-400 uppercase tracking-wider">note</span>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button variant="primary" onClick={handleSave}>Save Settings</Button>
          </div>
        </div>
      )}

      {tab === 'achievements' && (
        <div className="flex flex-col gap-3">
          <p className="text-xs text-slate-500">
            Per-book achievements for <span className="text-slate-700 font-medium">{activeBook?.title || 'this book'}</span>.
            Each book has its own set — keep writing to unlock them all!
          </p>

          <div className="grid grid-cols-3 gap-2">
            {bookAchievements.map((a) => {
              const unlocked = isUnlocked(a.id);
              return (
                <div key={a.id}
                  className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-all ${
                    unlocked
                      ? 'border-violet-200 bg-violet-50'
                      : 'border-slate-200 bg-slate-50 opacity-50'
                  }`}
                  title={a.description}
                >
                  <div
                    className={`w-11 h-11 rounded-full flex items-center justify-center text-xl bg-gradient-to-br ${
                      unlocked ? CATEGORY_COLORS[a.category] : 'from-slate-200 to-slate-300'
                    }`}
                  >
                    {unlocked ? a.emoji : <Lock size={14} className="text-slate-400" />}
                  </div>
                  <p className={`text-[10px] font-semibold text-center leading-tight ${unlocked ? 'text-slate-700' : 'text-slate-400'}`}>
                    {a.name}
                  </p>
                  {a.xp > 0 && (
                    <span className={`text-[9px] font-bold ${unlocked ? 'text-amber-500' : 'text-slate-400'}`}>
                      +{a.xp} XP
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex justify-end pt-2">
            <Button variant="ghost" onClick={onClose}>Close</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
