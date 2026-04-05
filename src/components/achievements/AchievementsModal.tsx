import { useState } from 'react';
import { X, Lock, Star } from 'lucide-react';
import { useAchievementStore } from '../../store/achievementStore';
import { useLibraryStore } from '../../store/libraryStore';
import { ACHIEVEMENTS, CATEGORY_COLORS, getLevel, getLevelProgress } from '../../types/achievements';
import type { Achievement } from '../../types/achievements';

interface Props {
  onClose: () => void;
}

type Filter = 'all' | 'unlocked' | 'locked';
type Category = 'all' | Achievement['category'];

export function AchievementsModal({ onClose }: Props) {
  const { unlocks, unlockSet, totalXP } = useAchievementStore();
  const { activeBook } = useLibraryStore();
  const [filter, setFilter] = useState<Filter>('all');
  const [category, setCategory] = useState<Category>('all');

  const level = getLevel(totalXP);
  const { current, needed, pct } = getLevelProgress(totalXP);
  const unlockedCount = unlocks.length;

  // For per-book achievements, check scoped by activeBook; for global check ''
  const isUnlocked = (a: Achievement) => {
    if (a.scope === 'per-book') {
      return activeBook ? unlockSet.has(`${a.id}:${activeBook.id}`) : false;
    }
    if (a.scope === 'per-world') return false; // world view only in world context
    return unlockSet.has(`${a.id}:`);
  };

  const filtered = ACHIEVEMENTS.filter((a) => {
    if (category !== 'all' && a.category !== category) return false;
    const unlocked = isUnlocked(a);
    if (filter === 'unlocked' && !unlocked) return false;
    if (filter === 'locked' && unlocked) return false;
    return true;
  });

  const categories: { key: Category; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'global', label: 'Global' },
    { key: 'writing', label: 'Writing' },
    { key: 'chapters', label: 'Chapters' },
    { key: 'world', label: 'World' },
    { key: 'session', label: 'Session' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-[#0d1526] border border-slate-700/60 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden"
        style={{ boxShadow: '0 0 60px rgba(124,58,237,0.15)' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700/50">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🏆</span>
            <div>
              <h2 className="text-base font-bold text-white tracking-wide">Achievements</h2>
              <p className="text-xs text-slate-500">{unlockedCount} of {ACHIEVEMENTS.length} unlocked</p>
            </div>
          </div>

          {/* XP / Level summary */}
          <div className="flex items-center gap-4 mr-4">
            <div className="text-right">
              <div className="flex items-center gap-1.5 justify-end">
                <Star size={12} className="text-amber-400" />
                <span className="text-sm font-bold text-amber-300">Level {level}</span>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <div className="w-28 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${pct}%`,
                      background: 'linear-gradient(to right, #7c3aed, #a78bfa)',
                    }}
                  />
                </div>
                <span className="text-[10px] text-slate-500 whitespace-nowrap">{current}/{needed} XP</span>
              </div>
            </div>
          </div>

          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-500 hover:text-slate-200 hover:bg-slate-800 transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Filters */}
        <div className="px-6 py-3 border-b border-slate-700/30 flex flex-wrap gap-2">
          {/* Unlocked/locked filter */}
          <div className="flex gap-1 mr-2">
            {(['all', 'unlocked', 'locked'] as Filter[]).map((f) => (
              <button key={f} onClick={() => setFilter(f)}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors capitalize ${
                  filter === f
                    ? 'bg-violet-600 text-white'
                    : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                }`}>
                {f}
              </button>
            ))}
          </div>

          {/* Category filter */}
          <div className="flex gap-1 flex-wrap">
            {categories.map(({ key, label }) => (
              <button key={key} onClick={() => setCategory(key)}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                  category === key
                    ? 'bg-slate-600 text-white'
                    : 'bg-slate-800/60 text-slate-500 hover:text-slate-300'
                }`}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Achievement grid */}
        <div className="flex-1 overflow-y-auto p-6">
          {filtered.length === 0 ? (
            <div className="text-center py-12 text-slate-600 text-sm">No achievements match your filters.</div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {filtered.map((a) => {
                const unlocked = isUnlocked(a);
                return (
                  <div
                    key={a.id}
                    className={`relative flex flex-col items-center gap-2 p-4 rounded-xl border transition-all ${
                      unlocked
                        ? 'border-violet-500/30 bg-violet-950/20'
                        : 'border-slate-700/30 bg-slate-800/20 opacity-50'
                    }`}
                    style={unlocked ? { boxShadow: '0 0 12px rgba(124,58,237,0.12)' } : {}}
                  >
                    {/* Badge icon */}
                    <div
                      className={`w-14 h-14 rounded-full flex items-center justify-center text-2xl shrink-0 bg-gradient-to-br ${
                        unlocked ? CATEGORY_COLORS[a.category] : 'from-slate-700 to-slate-800'
                      }`}
                      style={unlocked ? { boxShadow: '0 0 16px rgba(124,58,237,0.3)' } : {}}
                    >
                      {unlocked ? a.emoji : <Lock size={18} className="text-slate-600" />}
                    </div>

                    {/* Text */}
                    <div className="text-center">
                      <p className={`text-xs font-semibold leading-tight ${unlocked ? 'text-slate-200' : 'text-slate-600'}`}>
                        {a.name}
                      </p>
                      <p className="text-[10px] text-slate-500 mt-0.5 leading-tight">{a.description}</p>
                    </div>

                    {/* XP badge */}
                    {a.xp > 0 && (
                      <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                        unlocked ? 'bg-amber-900/40 text-amber-400' : 'bg-slate-700/40 text-slate-600'
                      }`}>
                        +{a.xp} XP
                      </span>
                    )}

                    {/* Unlocked indicator */}
                    {unlocked && (
                      <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-violet-400"
                        style={{ boxShadow: '0 0 6px rgba(167,139,250,0.8)' }} />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Per-book note */}
        {activeBook && (
          <div className="px-6 py-2 border-t border-slate-700/30 text-[10px] text-slate-600">
            Per-book achievements shown for: <span className="text-slate-500">{activeBook.title}</span>
          </div>
        )}
      </div>
    </div>
  );
}
