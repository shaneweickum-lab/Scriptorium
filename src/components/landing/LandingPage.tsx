import { useState } from 'react';
import {
  PenLine, Globe2, Trophy, Timer, BookMarked, Search,
  Maximize2, Image, TrendingUp, Star,
  ChevronRight, Sparkles,
} from 'lucide-react';

const FEATURES = [
  {
    icon: PenLine,
    title: 'Distraction-Free Writing',
    desc: 'A full-screen focus mode that hides everything but your words. Rich formatting, find & replace, and editor appearance controls built in.',
    gradient: 'linear-gradient(135deg, #7c3aed, #6d28d9)',
  },
  {
    icon: Globe2,
    title: 'Living World Bible',
    desc: 'Build characters, lore, maps, and magic systems in a structured world bible. @mention any entry directly in your manuscript for instant reference.',
    gradient: 'linear-gradient(135deg, #0d9488, #059669)',
  },
  {
    icon: BookMarked,
    title: 'KDP-Ready Export',
    desc: 'Export directly to Amazon KDP format with proper margins, headers, footers, page numbers, dedication page, and auto-generated table of contents.',
    gradient: 'linear-gradient(135deg, #d97706, #b45309)',
  },
  {
    icon: Trophy,
    title: '30 Achievements & XP',
    desc: 'Earn XP and unlock badges for milestones like your first 1,000 words, finishing chapters, building your world, and staying consistent.',
    gradient: 'linear-gradient(135deg, #7c3aed, #0d9488)',
  },
  {
    icon: Timer,
    title: 'Focus Timer',
    desc: 'Built-in Pomodoro-style timer with presets and custom durations. A break screen reminds you to rest so you stay sharp session after session.',
    gradient: 'linear-gradient(135deg, #e11d48, #db2777)',
  },
  {
    icon: TrendingUp,
    title: 'Daily Writing Streaks',
    desc: 'Track your writing days on a calendar heatmap. Watch your streak grow and stay motivated to show up every day.',
    gradient: 'linear-gradient(135deg, #0891b2, #0284c7)',
  },
  {
    icon: Search,
    title: 'Global Search',
    desc: 'Instantly search across every chapter, scene, and note in your book. Jump straight to any matching section with a single click.',
    gradient: 'linear-gradient(135deg, #475569, #334155)',
  },
  {
    icon: Image,
    title: 'Images & Media',
    desc: 'Insert images directly into your writing or world bible entries. Upload from your device — stored locally, no cloud required.',
    gradient: 'linear-gradient(135deg, #a21caf, #7c3aed)',
  },
  {
    icon: Maximize2,
    title: 'Appearance Controls',
    desc: 'Choose your font, font size, line height, and text width. Make your writing environment feel exactly right for long sessions.',
    gradient: 'linear-gradient(135deg, #0d9488, #7c3aed)',
  },
];

const ACHIEVEMENTS_PREVIEW = ['✍️', '🌍', '📚', '🏆', '🔥', '⚡', '🎯', '📖', '🌌', '⭐', '🦉', '🌅'];

interface Props {
  onEnter: () => void;
}

export function LandingPage({ onEnter }: Props) {
  const [hoveredFeature, setHoveredFeature] = useState<number | null>(null);

  return (
    <div className="min-h-screen bg-white text-slate-800 overflow-y-auto">
      {/* Subtle background decoration */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 -right-40 w-[600px] h-[600px] rounded-full opacity-[0.06]"
          style={{ background: 'radial-gradient(circle, #7c3aed 0%, transparent 70%)' }} />
        <div className="absolute -bottom-40 -left-40 w-[500px] h-[500px] rounded-full opacity-[0.05]"
          style={{ background: 'radial-gradient(circle, #0d9488 0%, transparent 70%)' }} />
      </div>

      {/* ── HERO ──────────────────────────────────────────────── */}
      <section className="relative z-10 flex flex-col items-center justify-center min-h-screen text-center px-6 pt-16 pb-24">
        {/* Logo */}
        <div className="flex items-center justify-center w-20 h-20 rounded-3xl mb-8 shadow-xl shadow-violet-200"
          style={{ background: 'linear-gradient(135deg, #7c3aed, #0d9488)' }}>
          <img src="/logo.svg" alt="" className="w-10 h-10 opacity-90" onError={(e) => {
            (e.target as HTMLImageElement).style.display = 'none';
          }} />
        </div>

        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-violet-50 border border-violet-200 text-[11px] text-violet-700 uppercase tracking-[0.18em] font-semibold mb-6">
          <Sparkles size={11} />
          Free · No account required · Works offline
        </div>

        <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight text-slate-900 leading-[1.05] mb-5">
          Wizards<br />
          <span className="bg-clip-text text-transparent"
            style={{ backgroundImage: 'linear-gradient(135deg, #7c3aed, #0d9488)' }}>
            Playground
          </span>
        </h1>

        <p className="text-xl md:text-2xl text-slate-500 max-w-xl mb-3 leading-relaxed">
          Where stories come alive.
        </p>
        <p className="text-base text-slate-400 max-w-lg mb-10 leading-relaxed">
          A complete writing studio for authors — craft your manuscript, build your world, track your progress, and publish with confidence.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 items-center">
          <button
            onClick={onEnter}
            className="flex items-center gap-2 px-8 py-4 rounded-2xl text-base font-bold text-white
              transition-all hover:-translate-y-0.5 shadow-xl shadow-violet-200"
            style={{ background: 'linear-gradient(135deg, #7c3aed, #0d9488)' }}
          >
            Start Writing Free
            <ChevronRight size={18} />
          </button>
          <span className="text-xs text-slate-400">No signup · All data stays on your device</span>
        </div>

        {/* Mini stats */}
        <div className="flex gap-10 mt-16 text-center">
          {[['30', 'Achievements'], ['4', 'Export formats'], ['100%', 'Offline']].map(([val, label]) => (
            <div key={label}>
              <div className="text-2xl font-extrabold text-slate-800">{val}</div>
              <div className="text-xs text-slate-400 mt-0.5">{label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── FEATURES GRID ──────────────────────────────────────── */}
      <section className="relative z-10 px-6 pb-24 max-w-5xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-3">
            Everything a writer needs
          </h2>
          <p className="text-slate-500 max-w-md mx-auto">
            From first word to finished manuscript — all in one app, all on your device.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURES.map((f, i) => {
            const Icon = f.icon;
            const isHovered = hoveredFeature === i;
            return (
              <div
                key={f.title}
                onMouseEnter={() => setHoveredFeature(i)}
                onMouseLeave={() => setHoveredFeature(null)}
                className={`relative flex flex-col gap-3 p-5 rounded-2xl border bg-white transition-all cursor-default ${
                  isHovered
                    ? 'border-violet-200 shadow-lg shadow-violet-100 -translate-y-1'
                    : 'border-slate-100 shadow-sm'
                }`}
              >
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: f.gradient }}>
                  <Icon size={18} className="text-white" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-800 mb-1">{f.title}</h3>
                  <p className="text-xs text-slate-500 leading-relaxed">{f.desc}</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── ACHIEVEMENTS TEASER ────────────────────────────────── */}
      <section className="relative z-10 px-6 pb-24 bg-slate-50 py-20">
        <div className="max-w-2xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber-50 border border-amber-200 text-[11px] text-amber-700 uppercase tracking-[0.18em] font-semibold mb-6">
            <Trophy size={11} />
            Gamified Writing
          </div>
          <h2 className="text-2xl md:text-3xl font-bold text-slate-900 mb-4">
            Stay motivated with achievements
          </h2>
          <p className="text-slate-500 mb-8 text-sm leading-relaxed max-w-md mx-auto">
            30 unlockable badges across writing milestones, world building, chapters, sessions, and more. Every book has its own set — keep earning as you write.
          </p>
          {/* Badge preview */}
          <div className="flex flex-wrap justify-center gap-3 mb-8">
            {ACHIEVEMENTS_PREVIEW.map((emoji, i) => (
              <div key={i}
                className="w-12 h-12 rounded-full flex items-center justify-center text-xl
                  bg-white border border-violet-100 shadow-sm
                  hover:border-violet-300 hover:shadow-md transition-all hover:-translate-y-1"
              >
                {emoji}
              </div>
            ))}
          </div>
          <div className="flex items-center justify-center gap-2 text-xs text-slate-400">
            <Star size={11} className="text-amber-500" />
            <span>Level up every 100 XP · Track streaks · Set word goals</span>
          </div>
        </div>
      </section>

      {/* ── FINAL CTA ──────────────────────────────────────────── */}
      <section className="relative z-10 px-6 py-24 text-center bg-white">
        <div className="max-w-lg mx-auto p-10 rounded-3xl border border-slate-100 shadow-xl shadow-slate-100">
          <div className="w-16 h-16 rounded-2xl mx-auto mb-6 shadow-lg shadow-violet-200"
            style={{ background: 'linear-gradient(135deg, #7c3aed, #0d9488)' }}>
            <div className="w-full h-full flex items-center justify-center">
              <PenLine size={28} className="text-white" />
            </div>
          </div>
          <h2 className="text-2xl font-bold text-slate-900 mb-3">Ready to write your story?</h2>
          <p className="text-slate-500 text-sm mb-6">Free forever. No account. No cloud. Your words stay yours.</p>
          <button
            onClick={onEnter}
            className="flex items-center gap-2 px-8 py-4 rounded-2xl text-base font-bold mx-auto
              text-white transition-all hover:-translate-y-0.5 shadow-lg shadow-violet-200"
            style={{ background: 'linear-gradient(135deg, #7c3aed, #0d9488)' }}
          >
            Enter the App
            <ChevronRight size={18} />
          </button>
        </div>
      </section>

      <footer className="relative z-10 text-center py-8 text-xs text-slate-400 border-t border-slate-100">
        Wizards Playground · Built for writers, by writers
      </footer>
    </div>
  );
}
