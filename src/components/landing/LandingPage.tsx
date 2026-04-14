import { useState } from 'react';
import {
  PenLine, Globe2, Trophy, Timer, BookMarked, Search,
  Maximize2, Image, TrendingUp, Star,
  ChevronRight, Sparkles, Library, Feather, Wand2, ScanSearch,
  Brain, Fingerprint, Activity, Eye, MessageCircle, Layers,
  Zap, BookHeart, ShieldCheck, Palette, Mail, Monitor, Download,
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
  {
    icon: Activity,
    title: 'Writer\'s Block Sensor',
    desc: "Maven watches your editor in real time. If you go quiet for too long or fall into a write-delete loop, she appears — gently — and offers a way through.",
    gradient: 'linear-gradient(135deg, #e11d48, #7c3aed)',
  },
];

const ORACLE_LEVELS = [
  {
    level: 'Apprentice',
    threshold: '< 2,000 words',
    desc: 'First impressions. Maven catches your perspective and the opening rhythm of your voice.',
    glow: 'rgba(148,163,184,0.3)',
    color: '#94a3b8',
    ring: 'rgba(148,163,184,0.25)',
  },
  {
    level: 'Journeyman',
    threshold: '2,000 – 10,000',
    desc: 'A clear voice fingerprint emerges. Pacing style, dialogue habits, and signature vocabulary take shape.',
    glow: 'rgba(45,212,191,0.4)',
    color: '#2dd4bf',
    ring: 'rgba(45,212,191,0.2)',
  },
  {
    level: 'Master',
    threshold: '10,000 – 50,000',
    desc: 'Full craft portrait. Thematic currents, sentence rhythm, interiority depth — Maven knows this writer.',
    glow: 'rgba(167,139,250,0.5)',
    color: '#a78bfa',
    ring: 'rgba(167,139,250,0.25)',
  },
  {
    level: 'Oracle',
    threshold: '50,000+ words',
    desc: 'Complete sight. Maven knows your voice as well as you know yourself — and writes from inside it.',
    glow: 'rgba(251,191,36,0.5)',
    color: '#fbbf24',
    ring: 'rgba(251,191,36,0.2)',
  },
];

const ORACLE_DIMENSIONS = [
  {
    icon: Eye,
    title: 'Point of View',
    gradient: 'linear-gradient(135deg, #7c3aed, #6d28d9)',
    desc: 'First, second, or third person — detected from pronoun frequency so Maven always narrates from your chosen vantage.',
  },
  {
    icon: Activity,
    title: 'Pacing Style',
    gradient: 'linear-gradient(135deg, #e11d48, #db2777)',
    desc: 'Kinetic, measured, or lyrical — inferred from action-verb density and sentence length. Maven matches your tempo.',
  },
  {
    icon: MessageCircle,
    title: 'Dialogue Ratio',
    gradient: 'linear-gradient(135deg, #0d9488, #059669)',
    desc: 'How much of your prose lives in dialogue versus narration. Maven calibrates how much characters speak in her output.',
  },
  {
    icon: Layers,
    title: 'Character Interiority',
    gradient: 'linear-gradient(135deg, #0891b2, #0284c7)',
    desc: 'Cognitive verb density reveals how deep inside a character\'s head you write. Maven mirrors that depth.',
  },
  {
    icon: Zap,
    title: 'Sensory Texture',
    gradient: 'linear-gradient(135deg, #d97706, #b45309)',
    desc: 'Sensory word density per 100 words. Maven weaves matching sight, sound, touch, smell, and taste into her prose.',
  },
  {
    icon: Fingerprint,
    title: 'Signature Vocabulary',
    gradient: 'linear-gradient(135deg, #7c3aed, #0d9488)',
    desc: 'Your top 15 non-stop-words — the words you reach for instinctively. Maven\'s lexicon bends toward yours.',
  },
  {
    icon: BookHeart,
    title: 'Thematic Currents',
    gradient: 'linear-gradient(135deg, #a21caf, #7c3aed)',
    desc: 'Death & loss, betrayal, power, transformation — the obsessions woven through your corpus, surfaced and reinforced.',
  },
  {
    icon: TrendingUp,
    title: 'Sentence Rhythm',
    gradient: 'linear-gradient(135deg, #475569, #334155)',
    desc: 'Standard deviation of sentence lengths — the proxy for musical variety. Maven modulates to match your natural variance.',
  },
];

const ORACLE_UNLOCKS = [
  {
    icon: Palette,
    title: 'Voice-Matched Prose',
    desc: 'Maven\'s Write mode produces sentences that feel continuous with your hand — not generic AI, but a seamless extension of your own style.',
    gradient: 'linear-gradient(135deg, #7c3aed, #a78bfa)',
  },
  {
    icon: ShieldCheck,
    title: 'Invisible Growth',
    desc: 'Development areas — like sensory grounding or dialogue variety — are woven organically into every suggestion, never pointed out directly.',
    gradient: 'linear-gradient(135deg, #0d9488, #2dd4bf)',
  },
  {
    icon: Brain,
    title: 'Thematic Resonance',
    desc: 'Your recurring obsessions — the themes that define your work — are threaded through Maven\'s suggestions wherever they naturally fit.',
    gradient: 'linear-gradient(135deg, #d97706, #fbbf24)',
  },
];

const TRAINING_CATEGORIES = [
  {
    id: 'journal',
    icon: PenLine,
    label: 'Journal Entries',
    gradient: 'linear-gradient(135deg, #7c3aed, #6d28d9)',
    description: 'Personal reflections, diary entries, or daily writing practice. Your most unguarded voice.',
  },
  {
    id: 'email',
    icon: Mail,
    label: 'Emails',
    gradient: 'linear-gradient(135deg, #0891b2, #0284c7)',
    description: 'Emails you have written — casual or professional. Natural rhythm and word choices emerge here.',
  },
  {
    id: 'short-story',
    icon: BookHeart,
    label: 'Short Stories',
    gradient: 'linear-gradient(135deg, #0d9488, #059669)',
    description: 'Completed or draft short fiction — any genre. Your purest narrative instincts, on display.',
  },
  {
    id: 'misc',
    icon: Layers,
    label: 'Miscellaneous',
    gradient: 'linear-gradient(135deg, #475569, #334155)',
    description: 'Essays, blog posts, scripts, or anything you have written. Every word teaches Maven.',
  },
];

const ACHIEVEMENTS_PREVIEW = ['✍️', '🌍', '📚', '🏆', '🔥', '⚡', '🎯', '📖', '🌌', '⭐', '🦉', '🌅'];

const RELEASES_URL = 'https://github.com/shaneweickum-lab/Scriptorium/releases/latest';

const DESKTOP_PLATFORMS = [
  {
    id: 'mac',
    label: 'macOS',
    version: '11+',
    note: 'Apple Silicon & Intel',
  },
  {
    id: 'windows',
    label: 'Windows',
    version: '10 / 11',
    note: '.msi installer',
  },
  {
    id: 'linux',
    label: 'Linux',
    version: 'x64',
    note: '.deb · .AppImage',
  },
] as const;

/** Best-effort OS detection from the user agent. */
const DETECTED_OS: 'mac' | 'windows' | 'linux' = (() => {
  const ua = navigator.userAgent;
  if (/Win/.test(ua)) return 'windows';
  if (/Mac/.test(ua)) return 'mac';
  return 'linux';
})();

interface Props {
  onEnter: () => void;
  onEnterMaven?: () => void;
  onEnterTraining?: () => void;
}

export function LandingPage({ onEnter, onEnterMaven, onEnterTraining }: Props) {
  const [hoveredFeature, setHoveredFeature] = useState<number | null>(null);
  const [hoveredMaven, setHoveredMaven] = useState<number | null>(null);
  const [hoveredOracle, setHoveredOracle] = useState<number | null>(null);
  const [hoveredDimension, setHoveredDimension] = useState<number | null>(null);
  const [hoveredUnlock, setHoveredUnlock] = useState<number | null>(null);
  const [hoveredTraining, setHoveredTraining] = useState<number | null>(null);

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

          {/* Maven icon — visual centerpiece matching the hero logo */}
          <div className="flex justify-center mb-6">
            <div className="w-20 h-20 rounded-3xl flex items-center justify-center shadow-2xl"
              style={{
                background: 'linear-gradient(135deg, #7c3aed, #0d9488)',
                boxShadow: '0 0 60px rgba(124,58,237,0.45), 0 20px 40px rgba(0,0,0,0.4)',
              }}>
              <Sparkles size={36} className="text-white/90" />
            </div>
          </div>

          {/* Badge */}
          <div className="flex justify-center mb-6">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border text-[11px] uppercase tracking-[0.18em] font-semibold"
              style={{ borderColor: 'rgba(167,139,250,0.35)', background: 'rgba(124,58,237,0.12)', color: '#c4b5fd' }}>
              <Sparkles size={11} />
              AI Writing Companion
            </div>
          </div>

          {/* Headline */}
          <div className="text-center mb-8">
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

          {/* Maven's voice — pull quote */}
          <div className="max-w-2xl mx-auto mb-14 rounded-2xl px-7 py-6"
            style={{ border: '1px solid rgba(167,139,250,0.2)', background: 'rgba(124,58,237,0.07)' }}>
            <p className="text-slate-300 italic text-sm leading-relaxed mb-3">
              "You see stories as living tapestries. The lore is the truth already laid — every thread fixed, every name a star to navigate by.
              What I conjure must grow from those roots. The weaving is mine to guide, but the pattern belongs to you."
            </p>
            <p className="text-[11px] font-medium tracking-wide" style={{ color: 'rgba(167,139,250,0.55)' }}>
              — Maven, on her oaths
            </p>
          </div>

          {/* Capabilities label */}
          <p className="text-center text-[11px] uppercase tracking-[0.2em] font-semibold mb-6"
            style={{ color: 'rgba(148,163,184,0.5)' }}>
            What Maven can do for your writing
          </p>

          {/* Capabilities grid — same card pattern as the features grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {MAVEN_CAPABILITIES.map((cap, i) => {
              const Icon = cap.icon;
              const isHovered = hoveredMaven === i;
              return (
                <div
                  key={cap.title}
                  onMouseEnter={() => setHoveredMaven(i)}
                  onMouseLeave={() => setHoveredMaven(null)}
                  className="flex flex-col gap-3 rounded-2xl p-5 transition-all cursor-default"
                  style={{
                    border: isHovered ? '1px solid rgba(167,139,250,0.45)' : '1px solid rgba(255,255,255,0.08)',
                    background: isHovered ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.05)',
                    transform: isHovered ? 'translateY(-4px)' : 'none',
                    boxShadow: isHovered ? '0 12px 32px rgba(124,58,237,0.2)' : 'none',
                  }}
                >
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: cap.gradient }}>
                    <Icon size={18} className="text-white" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-white mb-1">{cap.title}</h3>
                    <p className="text-xs leading-relaxed" style={{ color: 'rgba(203,213,225,0.75)' }}>{cap.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* CTA */}
          <div className="mt-12 flex flex-col items-center gap-4">
            <button
              onClick={onEnterMaven ?? onEnter}
              className="flex items-center gap-2 px-8 py-4 rounded-2xl text-base font-bold text-white transition-all hover:-translate-y-0.5 shadow-xl"
              style={{
                background: 'linear-gradient(135deg, #7c3aed, #0d9488)',
                boxShadow: '0 8px 32px rgba(124,58,237,0.35)',
              }}
            >
              Meet Maven Now
              <ChevronRight size={18} />
            </button>
            <div className="flex items-center gap-6 text-[11px]" style={{ color: 'rgba(148,163,184,0.6)' }}>
              <span>Runs on <span className="font-medium text-slate-300">Ollama</span> — local, private, offline</span>
              <span className="hidden sm:inline opacity-40">·</span>
              <span className="hidden sm:inline">Compatible with llama3.2, mistral, gemma, phi3</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── ORACLE INTELLIGENCE SYSTEM ─────────────────────────── */}
      <section className="relative z-10 overflow-hidden" style={{ background: 'linear-gradient(180deg, #0d0d1a 0%, #08101a 60%, #060e14 100%)' }}>
        {/* Atmospheric glows */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[300px] rounded-full pointer-events-none opacity-20"
          style={{ background: 'radial-gradient(ellipse, #7c3aed 0%, transparent 65%)' }} />
        <div className="absolute bottom-0 right-0 w-[400px] h-[400px] rounded-full pointer-events-none opacity-15"
          style={{ background: 'radial-gradient(circle, #fbbf24 0%, transparent 65%)' }} />

        <div className="relative z-10 px-6 py-24 max-w-5xl mx-auto">

          {/* Oracle icon — visual centerpiece */}
          <div className="flex justify-center mb-6">
            <div className="w-20 h-20 rounded-3xl flex items-center justify-center shadow-2xl"
              style={{
                background: 'linear-gradient(135deg, #92400e, #d97706, #fbbf24)',
                boxShadow: '0 0 60px rgba(251,191,36,0.35), 0 20px 40px rgba(0,0,0,0.4)',
              }}>
              <Brain size={36} className="text-white/90" />
            </div>
          </div>

          {/* Badge */}
          <div className="flex flex-col items-center gap-3 mb-8">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border text-[11px] uppercase tracking-[0.18em] font-semibold"
              style={{ borderColor: 'rgba(251,191,36,0.3)', background: 'rgba(251,191,36,0.08)', color: '#fbbf24' }}>
              <Brain size={11} />
              Oracle Intelligence System
            </div>
            <p className="text-[10px] uppercase tracking-[0.15em]"
              style={{ color: 'rgba(251,191,36,0.45)' }}>
              Powered by OracleML · Learns as you write
            </p>
          </div>

          {/* Headline */}
          <div className="text-center mb-5">
            <h2 className="text-4xl md:text-5xl font-extrabold text-white mb-4 tracking-tight leading-tight">
              The more you write,<br />
              <span className="bg-clip-text text-transparent"
                style={{ backgroundImage: 'linear-gradient(135deg, #fbbf24, #a78bfa)' }}>
                the better she knows you
              </span>
            </h2>
            <p className="text-slate-400 max-w-2xl mx-auto text-base leading-relaxed">
              The <span className="text-white font-medium">Oracle Intelligence System</span> is Maven's
              built-in learning engine. Powered by OracleML — a local corpus analysis algorithm — it
              studies everything you write and builds a growing portrait of your craft, so her suggestions
              feel less like AI and more like your own hand, guided.
            </p>
          </div>

          {/* Oracle Levels — progression */}
          <div className="mb-16 mt-12">
            <p className="text-center text-[11px] uppercase tracking-[0.2em] font-semibold mb-6"
              style={{ color: 'rgba(148,163,184,0.5)' }}>
              Oracle Intelligence levels — unlocked by writing
            </p>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {ORACLE_LEVELS.map((lvl, i) => {
                const isHov = hoveredOracle === i;
                return (
                  <div
                    key={lvl.level}
                    onMouseEnter={() => setHoveredOracle(i)}
                    onMouseLeave={() => setHoveredOracle(null)}
                    className="relative flex flex-col gap-2 p-5 rounded-2xl transition-all cursor-default"
                    style={{
                      border: isHov ? `1px solid ${lvl.color}55` : '1px solid rgba(255,255,255,0.07)',
                      background: isHov ? `rgba(255,255,255,0.07)` : 'rgba(255,255,255,0.04)',
                      transform: isHov ? 'translateY(-3px)' : 'none',
                      boxShadow: isHov ? `0 8px 32px ${lvl.ring}` : 'none',
                    }}
                  >
                    {/* Glowing orb */}
                    <div className="w-8 h-8 rounded-full flex items-center justify-center mb-1 transition-all"
                      style={{
                        background: `radial-gradient(circle, ${lvl.color}33 0%, transparent 70%)`,
                        border: `1.5px solid ${lvl.color}55`,
                        boxShadow: isHov ? `0 0 16px ${lvl.glow}` : 'none',
                      }}>
                      <div className="w-2.5 h-2.5 rounded-full transition-all"
                        style={{
                          background: lvl.color,
                          boxShadow: isHov ? `0 0 8px ${lvl.color}` : 'none',
                        }} />
                    </div>
                    <div className="font-bold text-sm" style={{ color: lvl.color }}>{lvl.level}</div>
                    <div className="text-[10px] font-medium" style={{ color: 'rgba(148,163,184,0.5)' }}>{lvl.threshold} words</div>
                    <p className="text-[11px] leading-relaxed mt-1" style={{ color: 'rgba(203,213,225,0.65)' }}>{lvl.desc}</p>
                  </div>
                );
              })}
            </div>
            {/* Connecting line beneath */}
            <div className="hidden lg:block relative mt-0 -translate-y-[0]">
              <div className="absolute left-[12.5%] right-[12.5%] top-0 h-px"
                style={{ background: 'linear-gradient(90deg, rgba(148,163,184,0.15), rgba(167,139,250,0.3), rgba(251,191,36,0.3), rgba(251,191,36,0.1))' }} />
            </div>
          </div>

          {/* What Maven learns — full card pattern matching the features grid */}
          <div className="mb-14">
            <p className="text-center text-[11px] uppercase tracking-[0.2em] font-semibold mb-6"
              style={{ color: 'rgba(148,163,184,0.5)' }}>
              What the Oracle Intelligence System studies in your writing
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {ORACLE_DIMENSIONS.map((dim, i) => {
                const Icon = dim.icon;
                const isHov = hoveredDimension === i;
                return (
                  <div
                    key={dim.title}
                    onMouseEnter={() => setHoveredDimension(i)}
                    onMouseLeave={() => setHoveredDimension(null)}
                    className="flex flex-col gap-3 p-5 rounded-2xl transition-all cursor-default"
                    style={{
                      border: isHov ? '1px solid rgba(167,139,250,0.45)' : '1px solid rgba(255,255,255,0.08)',
                      background: isHov ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.05)',
                      transform: isHov ? 'translateY(-4px)' : 'none',
                      boxShadow: isHov ? '0 12px 32px rgba(124,58,237,0.2)' : 'none',
                    }}
                  >
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                      style={{ background: dim.gradient }}>
                      <Icon size={18} className="text-white" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-white mb-1">{dim.title}</div>
                      <p className="text-xs leading-relaxed" style={{ color: 'rgba(203,213,225,0.75)' }}>{dim.desc}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* What it unlocks — same card pattern with hover */}
          <div>
            <p className="text-center text-[11px] uppercase tracking-[0.2em] font-semibold mb-6"
              style={{ color: 'rgba(148,163,184,0.5)' }}>
              What Oracle Intelligence unlocks in Maven
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {ORACLE_UNLOCKS.map((unlock, i) => {
                const Icon = unlock.icon;
                const isHov = hoveredUnlock === i;
                return (
                  <div
                    key={unlock.title}
                    onMouseEnter={() => setHoveredUnlock(i)}
                    onMouseLeave={() => setHoveredUnlock(null)}
                    className="flex flex-col gap-3 rounded-2xl p-5 transition-all cursor-default"
                    style={{
                      border: isHov ? '1px solid rgba(167,139,250,0.45)' : '1px solid rgba(255,255,255,0.08)',
                      background: isHov ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.05)',
                      transform: isHov ? 'translateY(-4px)' : 'none',
                      boxShadow: isHov ? '0 12px 32px rgba(124,58,237,0.2)' : 'none',
                    }}
                  >
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                      style={{ background: unlock.gradient }}>
                      <Icon size={18} className="text-white" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-white mb-1">{unlock.title}</h3>
                      <p className="text-xs leading-relaxed" style={{ color: 'rgba(203,213,225,0.75)' }}>{unlock.desc}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Private note */}
          <div className="mt-12 text-center space-y-1.5">
            <p className="text-[11px] font-medium" style={{ color: 'rgba(251,191,36,0.5)' }}>
              Oracle Intelligence System · Powered by OracleML
            </p>
            <p className="text-[11px]" style={{ color: 'rgba(148,163,184,0.45)' }}>
              All analysis runs locally in your browser — no data leaves your device.
              Pure statistical analysis, no cloud ML APIs, no training on your writing.
            </p>
          </div>

        </div>
      </section>

      {/* ── TRAINING PORTAL ────────────────────────────────────── */}
      <section className="relative z-10 px-6 py-24 bg-white overflow-hidden">
        {/* Subtle background decoration */}
        <div className="absolute top-0 right-0 w-[400px] h-[400px] rounded-full pointer-events-none opacity-[0.04]"
          style={{ background: 'radial-gradient(circle, #d97706 0%, transparent 70%)' }} />
        <div className="absolute bottom-0 left-0 w-[300px] h-[300px] rounded-full pointer-events-none opacity-[0.03]"
          style={{ background: 'radial-gradient(circle, #7c3aed 0%, transparent 70%)' }} />

        <div className="relative z-10 max-w-5xl mx-auto">

          {/* Centerpiece icon */}
          <div className="flex justify-center mb-6">
            <div className="w-20 h-20 rounded-3xl flex items-center justify-center shadow-xl shadow-amber-200"
              style={{ background: 'linear-gradient(135deg, #92400e, #d97706, #fbbf24)' }}>
              <Brain size={36} className="text-white/90" />
            </div>
          </div>

          {/* Badge */}
          <div className="flex flex-col items-center gap-2 mb-8">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber-50 border border-amber-200 text-[11px] text-amber-700 uppercase tracking-[0.18em] font-semibold">
              <Brain size={11} />
              Training Portal
            </div>
            <p className="text-[10px] uppercase tracking-[0.15em] text-amber-500/60">
              Accelerates Oracle Intelligence · Feeds OracleML
            </p>
          </div>

          {/* Headline */}
          <div className="text-center mb-10">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4 tracking-tight">
              Train Maven before you<br />
              <span className="bg-clip-text text-transparent"
                style={{ backgroundImage: 'linear-gradient(135deg, #d97706, #7c3aed)' }}>
                write a single word
              </span>
            </h2>
            <p className="text-slate-500 max-w-xl mx-auto text-base leading-relaxed">
              Paste your existing writings — journal entries, emails, short stories, anything. Maven studies them immediately, and every word counts toward your Oracle Intelligence level.
            </p>
          </div>

          {/* Category cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
            {TRAINING_CATEGORIES.map((cat, i) => {
              const Icon = cat.icon;
              const isHov = hoveredTraining === i;
              return (
                <div
                  key={cat.id}
                  onMouseEnter={() => setHoveredTraining(i)}
                  onMouseLeave={() => setHoveredTraining(null)}
                  className={`flex flex-col gap-3 p-5 rounded-2xl border bg-white transition-all cursor-default ${
                    isHov
                      ? 'border-amber-200 shadow-lg shadow-amber-100 -translate-y-1'
                      : 'border-slate-100 shadow-sm'
                  }`}
                >
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: cat.gradient }}>
                    <Icon size={18} className="text-white" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-slate-800 mb-1">{cat.label}</h3>
                    <p className="text-xs text-slate-500 leading-relaxed">{cat.description}</p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* OIS connection callout */}
          <div className="max-w-2xl mx-auto mb-10 flex items-start gap-4 p-5 rounded-2xl border border-amber-100 bg-amber-50/50">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: 'linear-gradient(135deg, #d97706, #fbbf24)' }}>
              <Brain size={16} className="text-white" />
            </div>
            <div>
              <p className="text-sm font-semibold text-amber-900 mb-1">Every word counts toward your Oracle level</p>
              <p className="text-xs text-amber-700/70 leading-relaxed">
                Training Portal entries are analysed by OracleML alongside your manuscript. A journal full of your writing can push Maven from Apprentice to Journeyman before chapter one is written.
              </p>
            </div>
          </div>

          {/* CTA */}
          <div className="flex justify-center">
            <button
              onClick={onEnterTraining ?? onEnter}
              className="flex items-center gap-2 px-8 py-4 rounded-2xl text-base font-bold text-white transition-all hover:-translate-y-0.5 shadow-xl shadow-amber-200"
              style={{ background: 'linear-gradient(135deg, #92400e, #d97706, #fbbf24)' }}
            >
              Open Training Portal
              <ChevronRight size={18} />
            </button>
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

      {/* ── DESKTOP DOWNLOAD ───────────────────────────────────── */}
      <section className="relative z-10 px-6 py-20 bg-slate-900 text-white overflow-hidden">
        {/* Background glow */}
        <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(circle, rgba(124,58,237,0.15) 0%, transparent 70%)' }} />

        <div className="relative max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 border border-white/20 text-[11px] text-white/70 uppercase tracking-[0.18em] font-semibold mb-6">
            <Monitor size={11} />
            Desktop App · Free
          </div>

          <h2 className="text-2xl md:text-4xl font-bold mb-4">
            Maven. No browser.<br />
            <span className="bg-clip-text text-transparent"
              style={{ backgroundImage: 'linear-gradient(135deg, #a78bfa, #2dd4bf)' }}>
              No configuration. Just works.
            </span>
          </h2>

          <p className="text-white/50 mb-12 text-sm leading-relaxed max-w-lg mx-auto">
            The desktop app connects to your local Ollama directly — no CORS setup, no origin allowlists, no browser sandbox. Install it and Maven is ready the moment Ollama runs.
          </p>

          {/* Platform cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10 max-w-2xl mx-auto">
            {DESKTOP_PLATFORMS.map(({ id, label, version, note }) => {
              const isDetected = id === DETECTED_OS;
              return (
                <a
                  key={id}
                  href={RELEASES_URL}
                  target="_blank"
                  rel="noreferrer"
                  className={`flex flex-col gap-3 p-5 rounded-2xl border text-left transition-all group
                    ${isDetected
                      ? 'border-violet-400/60 bg-violet-500/10 shadow-lg shadow-violet-900/30'
                      : 'border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/20'
                    }`}
                >
                  <div className="flex items-center justify-between">
                    <Monitor size={18} className={isDetected ? 'text-violet-300' : 'text-white/40'} />
                    {isDetected && (
                      <span className="text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full bg-violet-500/30 text-violet-300">
                        Your OS
                      </span>
                    )}
                  </div>
                  <div>
                    <p className={`text-sm font-bold ${isDetected ? 'text-white' : 'text-white/70'}`}>{label}</p>
                    <p className="text-[11px] text-white/40 mt-0.5">{version}</p>
                    <p className="text-[10px] text-white/30 mt-1">{note}</p>
                  </div>
                  <div className={`flex items-center gap-1.5 text-[11px] font-medium mt-auto pt-2 border-t
                    ${isDetected ? 'border-violet-500/30 text-violet-300' : 'border-white/10 text-white/40 group-hover:text-white/60'}
                    transition-colors`}>
                    <Download size={11} />
                    Download
                  </div>
                </a>
              );
            })}
          </div>

          <a
            href={RELEASES_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 px-8 py-4 rounded-2xl text-sm font-bold text-white
              transition-all hover:-translate-y-0.5 shadow-xl shadow-violet-900/40"
            style={{ background: 'linear-gradient(135deg, #7c3aed, #0d9488)' }}
          >
            <Download size={16} />
            View all downloads on GitHub
          </a>

          <p className="text-white/30 text-xs mt-4">
            Requires <a href="https://ollama.com" target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-white/50 transition-colors">Ollama</a> running locally · All data stays on your device
          </p>
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
