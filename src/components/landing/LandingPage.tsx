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
    color: 'from-indigo-600 to-blue-700',
  },
  {
    icon: Globe2,
    title: 'Living World Bible',
    desc: 'Build characters, lore, maps, and magic systems in a structured world bible. @mention any entry directly in your manuscript for instant reference.',
    color: 'from-emerald-600 to-teal-700',
  },
  {
    icon: BookMarked,
    title: 'KDP-Ready Export',
    desc: 'Export directly to Amazon KDP format with proper margins, headers, footers, page numbers, dedication page, and auto-generated table of contents.',
    color: 'from-amber-600 to-orange-700',
  },
  {
    icon: Trophy,
    title: '30 Achievements & XP',
    desc: 'Earn XP and unlock badges for milestones like your first 1,000 words, finishing chapters, building your world, and staying consistent.',
    color: 'from-violet-600 to-purple-700',
  },
  {
    icon: Timer,
    title: 'Focus Timer',
    desc: 'Built-in Pomodoro-style timer with presets and custom durations. A break screen reminds you to rest so you stay sharp session after session.',
    color: 'from-rose-600 to-pink-700',
  },
  {
    icon: TrendingUp,
    title: 'Daily Writing Streaks',
    desc: 'Track your writing days on a calendar heatmap. Watch your streak grow and stay motivated to show up every day.',
    color: 'from-cyan-600 to-sky-700',
  },
  {
    icon: Search,
    title: 'Global Search',
    desc: 'Instantly search across every chapter, scene, and note in your book. Jump straight to any matching section with a single click.',
    color: 'from-slate-500 to-slate-700',
  },
  {
    icon: Image,
    title: 'Images & Media',
    desc: 'Insert images directly into your writing or world bible entries. Upload from your device — stored locally, no cloud required.',
    color: 'from-fuchsia-600 to-violet-700',
  },
  {
    icon: Maximize2,
    title: 'Appearance Controls',
    desc: 'Choose your font, font size, line height, and text width. Make your writing environment feel exactly right for long sessions.',
    color: 'from-teal-600 to-emerald-700',
  },
];

const ACHIEVEMENTS_PREVIEW = ['✍️', '🌍', '📚', '🏆', '🔥', '⚡', '🎯', '📖', '🌌', '⭐', '🦉', '🌅'];

interface Props {
  onEnter: () => void;
}

export function LandingPage({ onEnter }: Props) {
  const [hoveredFeature, setHoveredFeature] = useState<number | null>(null);

  return (
    <div className="min-h-screen bg-[#060d18] text-slate-200 overflow-y-auto">
      {/* Mystical background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_40%_20%,_#0d1f3c_0%,_#060d18_60%)]" />
        <svg className="absolute left-1/2 top-0 -translate-x-1/2 w-[900px] h-[900px] opacity-[0.06]" viewBox="0 0 900 900">
          <circle cx="450" cy="450" r="420" fill="none" stroke="#38bdf8" strokeWidth="1" />
          <circle cx="450" cy="450" r="380" fill="none" stroke="#6366f1" strokeWidth="0.5" strokeDasharray="6 8" />
          <circle cx="450" cy="450" r="320" fill="none" stroke="#7c3aed" strokeWidth="0.5" strokeDasharray="3 12" />
          {Array.from({ length: 36 }).map((_, i) => {
            const a = (i * 10 * Math.PI) / 180;
            const r = 395; const x1 = 450 + r * Math.cos(a); const y1 = 450 + r * Math.sin(a);
            const x2 = 450 + (r + (i % 3 === 0 ? 18 : 10)) * Math.cos(a);
            const y2 = 450 + (r + (i % 3 === 0 ? 18 : 10)) * Math.sin(a);
            return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={i % 3 === 0 ? '#38bdf8' : '#6366f1'} strokeWidth={i % 3 === 0 ? 1 : 0.6} />;
          })}
        </svg>
        {[[15, 8], [82, 20], [7, 55], [93, 40], [45, 90], [68, 15], [28, 75], [87, 68]].map(([x, y], i) => (
          <div key={i} className="absolute rounded-full bg-cyan-300/40"
            style={{ left: `${x}%`, top: `${y}%`, width: i % 2 === 0 ? 3 : 2, height: i % 2 === 0 ? 3 : 2, boxShadow: '0 0 6px rgba(103,232,249,0.8)' }} />
        ))}
      </div>

      {/* ── HERO ──────────────────────────────────────────────── */}
      <section className="relative z-10 flex flex-col items-center justify-center min-h-screen text-center px-6 pt-16 pb-24">
        <div className="flex items-center gap-2 mb-6">
          <img src="/logo.svg" alt="" className="w-14 h-14 drop-shadow-[0_0_20px_rgba(99,102,241,0.9)]" />
        </div>

        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-violet-950/60 border border-violet-500/30 text-[11px] text-violet-300 uppercase tracking-[0.2em] font-semibold mb-5">
          <Sparkles size={11} />
          Free • No account required • Works offline
        </div>

        <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight text-white leading-[1.05] mb-5"
          style={{ textShadow: '0 0 60px rgba(124,58,237,0.35)' }}>
          Wizards<br />
          <span className="bg-gradient-to-r from-violet-400 via-indigo-300 to-cyan-400 bg-clip-text text-transparent">
            Playground
          </span>
        </h1>

        <p className="text-xl md:text-2xl text-slate-400 max-w-xl mb-3 leading-relaxed">
          Where stories come alive.
        </p>
        <p className="text-base text-slate-500 max-w-lg mb-10 leading-relaxed">
          A complete writing studio for authors — craft your manuscript, build your world, track your progress, and publish with confidence.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 items-center">
          <button
            onClick={onEnter}
            className="flex items-center gap-2 px-8 py-4 rounded-2xl text-base font-bold
              bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500
              text-white transition-all shadow-2xl shadow-violet-900/50 hover:-translate-y-0.5"
            style={{ boxShadow: '0 0 40px rgba(124,58,237,0.4)' }}
          >
            Start Writing Free
            <ChevronRight size={18} />
          </button>
          <span className="text-xs text-slate-600">No signup · All data stays on your device</span>
        </div>

        {/* Mini stats */}
        <div className="flex gap-8 mt-16 text-center">
          {[['30', 'Achievements'], ['5', 'Export formats'], ['100%', 'Offline']].map(([val, label]) => (
            <div key={label}>
              <div className="text-2xl font-bold text-slate-200">{val}</div>
              <div className="text-xs text-slate-600 mt-0.5">{label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── FEATURES GRID ──────────────────────────────────────── */}
      <section className="relative z-10 px-6 pb-24 max-w-5xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-3">
            Everything a writer needs
          </h2>
          <p className="text-slate-500 max-w-md mx-auto">
            From first word to finished manuscript — all in one app, all on your device.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURES.map((f, i) => {
            const Icon = f.icon;
            return (
              <div
                key={f.title}
                onMouseEnter={() => setHoveredFeature(i)}
                onMouseLeave={() => setHoveredFeature(null)}
                className={`relative flex flex-col gap-3 p-5 rounded-2xl border transition-all cursor-default ${
                  hoveredFeature === i
                    ? 'border-slate-600/60 bg-slate-800/30'
                    : 'border-slate-700/30 bg-slate-900/20'
                }`}
              >
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center bg-gradient-to-br ${f.color} shrink-0`}
                  style={hoveredFeature === i ? { boxShadow: '0 0 16px rgba(124,58,237,0.3)' } : {}}>
                  <Icon size={18} className="text-white" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-200 mb-1">{f.title}</h3>
                  <p className="text-xs text-slate-500 leading-relaxed">{f.desc}</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── ACHIEVEMENTS TEASER ────────────────────────────────── */}
      <section className="relative z-10 px-6 pb-24">
        <div className="max-w-2xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-950/40 border border-amber-500/20 text-[11px] text-amber-400 uppercase tracking-[0.18em] font-semibold mb-6">
            <Trophy size={11} />
            Gamified Writing
          </div>
          <h2 className="text-2xl md:text-3xl font-bold text-white mb-4">
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
                  bg-gradient-to-br from-violet-900/60 to-slate-800/60 border border-violet-500/20
                  hover:border-violet-400/40 transition-all hover:-translate-y-1"
                style={{ boxShadow: '0 0 12px rgba(124,58,237,0.15)' }}
              >
                {emoji}
              </div>
            ))}
          </div>
          <div className="flex items-center justify-center gap-2 text-xs text-slate-600">
            <Star size={11} className="text-amber-500" />
            <span>Level up every 100 XP · Track streaks · Set word goals</span>
          </div>
        </div>
      </section>

      {/* ── FINAL CTA ──────────────────────────────────────────── */}
      <section className="relative z-10 px-6 pb-24 text-center">
        <div className="max-w-lg mx-auto p-10 rounded-3xl border border-slate-700/40 bg-slate-900/30"
          style={{ boxShadow: '0 0 60px rgba(124,58,237,0.08)' }}>
          <h2 className="text-2xl font-bold text-white mb-3">Ready to write your story?</h2>
          <p className="text-slate-500 text-sm mb-6">Free forever. No account. No cloud. Your words stay yours.</p>
          <button
            onClick={onEnter}
            className="flex items-center gap-2 px-8 py-4 rounded-2xl text-base font-bold mx-auto
              bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500
              text-white transition-all hover:-translate-y-0.5 shadow-xl shadow-violet-900/40"
          >
            Enter the App
            <ChevronRight size={18} />
          </button>
        </div>
      </section>

      <footer className="relative z-10 text-center pb-8 text-xs text-slate-700">
        Wizards Playground · Built for writers, by writers
      </footer>
    </div>
  );
}
