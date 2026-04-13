import { useState } from 'react';
import {
  PenLine, Globe2, Trophy, Timer, BookMarked, Search,
  Maximize2, Image, TrendingUp, Star,
  ChevronRight, Sparkles, Library, Feather, Wand2, ScanSearch,
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

const MAVEN_CAPABILITIES = [
  {
    icon: Library,
    title: 'Lore-Grounded',
    desc: 'Every suggestion is rooted in your World Bible. Maven retrieves the most relevant lore before answering — she never invents what you have not written.',
    gradient: 'linear-gradient(135deg, #7c3aed, #6d28d9)',
  },
  {
    icon: Feather,
    title: 'Your Voice, Mirrored',
    desc: "Maven analyses your prose — sentence rhythm, vocabulary register, atmosphere — and writes continuations indistinguishable from your own hand.",
    gradient: 'linear-gradient(135deg, #0d9488, #059669)',
  },
  {
    icon: Wand2,
    title: 'Prose on Demand',
    desc: 'Ask Maven to write a scene, paragraph, or monologue. Approve with one click to insert at the cursor or append to the end of your scene.',
    gradient: 'linear-gradient(135deg, #7c3aed, #0d9488)',
  },
  {
    icon: ScanSearch,
    title: 'World Bible Sentinel',
    desc: "After writing a scene, Maven scans for lore-changing events — deaths, alliances, revelations — and proposes the exact World Bible updates needed.",
    gradient: 'linear-gradient(135deg, #d97706, #b45309)',
  },
];

const ACHIEVEMENTS_PREVIEW = ['✍️', '🌍', '📚', '🏆', '🔥', '⚡', '🎯', '📖', '🌌', '⭐', '🦉', '🌅'];

interface Props {
  onEnter: () => void;
}

export function LandingPage({ onEnter }: Props) {
  const [hoveredFeature, setHoveredFeature] = useState<number | null>(null);
  const [hoveredMaven, setHoveredMaven] = useState<number | null>(null);

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
          Free · Offline · AI writing companion included
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
          A complete writing studio for authors — craft your manuscript, build your world, track your progress, and write alongside an AI companion who knows your lore.
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

      {/* ── MAVEN SPOTLIGHT ────────────────────────────────────── */}
      <section className="relative z-10 overflow-hidden" style={{ background: 'linear-gradient(160deg, #130824 0%, #071a18 100%)' }}>
        {/* Atmospheric glows */}
        <div className="absolute -top-32 -left-32 w-[500px] h-[500px] rounded-full pointer-events-none opacity-25"
          style={{ background: 'radial-gradient(circle, #7c3aed 0%, transparent 65%)' }} />
        <div className="absolute -bottom-32 -right-32 w-[450px] h-[450px] rounded-full pointer-events-none opacity-20"
          style={{ background: 'radial-gradient(circle, #0d9488 0%, transparent 65%)' }} />

        <div className="relative z-10 px-6 py-24 max-w-5xl mx-auto">

          {/* Badge */}
          <div className="flex justify-center mb-8">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border text-[11px] uppercase tracking-[0.18em] font-semibold"
              style={{ borderColor: 'rgba(167,139,250,0.35)', background: 'rgba(124,58,237,0.12)', color: '#c4b5fd' }}>
              <Sparkles size={11} />
              AI Writing Companion
            </div>
          </div>

          {/* Headline */}
          <div className="text-center mb-10">
            <h2 className="text-4xl md:text-6xl font-extrabold text-white mb-4 tracking-tight">
              Meet{' '}
              <span className="bg-clip-text text-transparent"
                style={{ backgroundImage: 'linear-gradient(135deg, #a78bfa, #2dd4bf)' }}>
                Maven
              </span>
            </h2>
            <p className="text-slate-300 max-w-xl mx-auto text-lg leading-relaxed">
              A mystical writing companion woven into your workshop. She sees your world, knows your voice, and writes prose that feels like yours.
            </p>
          </div>

          {/* Maven's voice — quote from her system prompt */}
          <div className="max-w-2xl mx-auto mb-12 pl-5 border-l-2 border-violet-500/40">
            <p className="text-slate-300 italic text-sm leading-relaxed">
              "You see stories as living tapestries. The lore is the truth already laid — every thread fixed, every name a star to navigate by.
              What I conjure must grow from those roots. The weaving is mine to guide, but the pattern belongs to you."
            </p>
            <p className="text-violet-400/60 text-[11px] mt-2 tracking-wide">— Maven, on her oaths</p>
          </div>

          {/* Capabilities grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {MAVEN_CAPABILITIES.map((cap, i) => {
              const Icon = cap.icon;
              const isHovered = hoveredMaven === i;
              return (
                <div
                  key={cap.title}
                  onMouseEnter={() => setHoveredMaven(i)}
                  onMouseLeave={() => setHoveredMaven(null)}
                  className="rounded-2xl p-5 transition-all cursor-default"
                  style={{
                    border: isHovered ? '1px solid rgba(167,139,250,0.45)' : '1px solid rgba(255,255,255,0.08)',
                    background: isHovered ? 'rgba(255,255,255,0.09)' : 'rgba(255,255,255,0.05)',
                    transform: isHovered ? 'translateY(-3px)' : 'none',
                  }}
                >
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-4 shrink-0"
                    style={{ background: cap.gradient }}>
                    <Icon size={18} className="text-white" />
                  </div>
                  <h3 className="text-sm font-semibold text-white mb-2">{cap.title}</h3>
                  <p className="text-xs leading-relaxed" style={{ color: 'rgba(203,213,225,0.75)' }}>{cap.desc}</p>
                </div>
              );
            })}
          </div>

          {/* Local / private note */}
          <div className="mt-12 text-center space-y-2">
            <div className="flex items-center justify-center gap-6 text-[11px]" style={{ color: 'rgba(148,163,184,0.7)' }}>
              <span>Runs on <span className="font-medium text-slate-300">Ollama</span> — local, private, offline</span>
              <span className="hidden sm:inline opacity-40">·</span>
              <span className="hidden sm:inline">No API key · No account · No cloud</span>
            </div>
            <p className="text-[11px]" style={{ color: 'rgba(148,163,184,0.45)' }}>
              Compatible with llama3.2, mistral, gemma, phi3, and any model Ollama supports
            </p>
          </div>
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
          <p className="text-slate-500 text-sm mb-6">Free forever. No account. No cloud. Your words stay yours — and Maven is waiting.</p>
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
