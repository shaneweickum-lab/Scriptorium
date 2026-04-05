import { useState } from 'react';
import { Lock } from 'lucide-react';
import { Modal } from '../common/Modal';
import { Input, Textarea } from '../common/Input';
import { Button } from '../common/Button';
import { useLibraryStore } from '../../store/libraryStore';
import { useUIStore } from '../../store/uiStore';
import { useAchievementStore } from '../../store/achievementStore';
import { BOOK_COLORS } from '../../types';
import type { HierarchyLabels } from '../../types';
import { ACHIEVEMENTS, CATEGORY_COLORS } from '../../types/achievements';

interface Props { onClose: () => void }

type Tab = 'settings' | 'achievements';

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

  const handleSave = async () => {
    if (!activeBook) return;
    await updateBook(activeBook.id, {
      title: title.trim() || 'Untitled',
      author: author.trim(),
      synopsis: synopsis.trim(),
      coverColor: color,
      wordGoal: wordGoal ? Number(wordGoal) : undefined,
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
      <div className="flex gap-1 mb-5 border-b border-slate-700/40 pb-0">
        {(['settings', 'achievements'] as Tab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-xs font-semibold capitalize rounded-t-lg transition-colors border-b-2 -mb-px ${
              tab === t
                ? 'text-violet-300 border-violet-500'
                : 'text-slate-500 border-transparent hover:text-slate-300'
            }`}>
            {t === 'achievements' ? `Achievements (${unlockedCount}/${bookAchievements.length})` : t}
          </button>
        ))}
      </div>

      {tab === 'settings' && (
        <div className="flex flex-col gap-4">
          <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="My Novel" />
          <Input label="Author" value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="Your Name" />
          <Textarea label="Synopsis" value={synopsis} onChange={(e) => setSynopsis(e.target.value)}
            placeholder="A brief description..." rows={3} />
          <Input
            label="Word Count Goal"
            value={wordGoal}
            onChange={(e) => setWordGoal(e.target.value.replace(/\D/g, ''))}
            placeholder="e.g. 80000"
            type="text"
            inputMode="numeric"
          />

          <div>
            <p className="text-sm text-slate-400 mb-2">Accent Color</p>
            <div className="flex gap-2 flex-wrap">
              {BOOK_COLORS.map((c) => (
                <button key={c} onClick={() => setColor(c)}
                  className="w-7 h-7 rounded-full transition-transform hover:scale-110"
                  style={{ backgroundColor: c, outline: color === c ? '3px solid white' : 'none', outlineOffset: '2px' }} />
              ))}
            </div>
          </div>

          <div>
            <p className="text-sm text-slate-400 mb-2">Hierarchy Labels</p>
            <div className="grid grid-cols-2 gap-2">
              {(['part', 'chapter', 'scene', 'note'] as const).map((key) => (
                <Input key={key} label={key.charAt(0).toUpperCase() + key.slice(1)}
                  value={labels[key]} onChange={(e) => setLabels({ ...labels, [key]: e.target.value })}
                  placeholder={key.charAt(0).toUpperCase() + key.slice(1)} />
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button variant="primary" onClick={handleSave}>Save Settings</Button>
          </div>
        </div>
      )}

      {tab === 'achievements' && (
        <div className="flex flex-col gap-3">
          <p className="text-xs text-slate-500">
            Per-book achievements for <span className="text-slate-300">{activeBook?.title || 'this book'}</span>.
            Each book has its own set — keep writing to unlock them all!
          </p>

          <div className="grid grid-cols-3 gap-2">
            {bookAchievements.map((a) => {
              const unlocked = isUnlocked(a.id);
              return (
                <div key={a.id}
                  className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-all ${
                    unlocked
                      ? 'border-violet-500/30 bg-violet-950/20'
                      : 'border-slate-700/20 bg-slate-800/10 opacity-45'
                  }`}
                  style={unlocked ? { boxShadow: '0 0 10px rgba(124,58,237,0.1)' } : {}}
                  title={a.description}
                >
                  <div
                    className={`w-11 h-11 rounded-full flex items-center justify-center text-xl bg-gradient-to-br ${
                      unlocked ? CATEGORY_COLORS[a.category] : 'from-slate-700 to-slate-800'
                    }`}
                    style={unlocked ? { boxShadow: '0 0 12px rgba(124,58,237,0.25)' } : {}}
                  >
                    {unlocked ? a.emoji : <Lock size={14} className="text-slate-600" />}
                  </div>
                  <p className={`text-[10px] font-semibold text-center leading-tight ${unlocked ? 'text-slate-300' : 'text-slate-600'}`}>
                    {a.name}
                  </p>
                  {a.xp > 0 && (
                    <span className={`text-[9px] font-bold ${unlocked ? 'text-amber-400' : 'text-slate-700'}`}>
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
