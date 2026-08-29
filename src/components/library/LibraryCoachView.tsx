import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Sparkles, PenLine, BookOpen, Pen, ChevronRight,
  RotateCcw, Send, Loader2, AlertCircle, User, ChevronDown,
  CheckCircle2, TrendingUp, GraduationCap, RefreshCw,
} from 'lucide-react';
import { useWriterProfileStore } from '../../store/writerProfileStore';
import { useCoachAI, type TextHighlight, type HighlightType } from '../../features/writing-coach/hooks/useCoachAI';
import {
  CoachingService,
  COACH_CATEGORIES,
  type CoachSubcategory,
  type CoachCategoryDef,
} from '../../features/writing-coach/services/CoachingService';
import { WriterOnboardingModal } from '../coach/WriterOnboardingModal';
import { SKILL_LEVEL_LABEL, SKILL_LEVEL_COLOR } from '../../types/writerProfile';
import type { SkillLevel } from '../../types/writerProfile';

// ---------------------------------------------------------------------------
// Highlight color map
// ---------------------------------------------------------------------------

const HIGHLIGHT_COLORS: Record<HighlightType, { bg: string; dot: string; label: string }> = {
  spelling:    { bg: 'rgba(239,68,68,0.18)',    dot: '#ef4444', label: 'Spelling' },
  punctuation: { bg: 'rgba(245,158,11,0.20)',   dot: '#f59e0b', label: 'Punctuation' },
  tense:       { bg: 'rgba(59,130,246,0.18)',   dot: '#3b82f6', label: 'Tense' },
  grammar:     { bg: 'rgba(249,115,22,0.18)',   dot: '#f97316', label: 'Grammar' },
  structure:   { bg: 'rgba(139,92,246,0.18)',   dot: '#8b5cf6', label: 'Structure' },
};

// ---------------------------------------------------------------------------
// HighlightedTextarea — textarea with a colour-coded error backdrop
// ---------------------------------------------------------------------------

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function buildHighlightedHtml(text: string, highlights: TextHighlight[]): string {
  if (!highlights.length) return escapeHtml(text);

  // Find all match positions (one pass per highlight)
  const regions: Array<{ start: number; end: number; type: HighlightType }> = [];
  for (const h of highlights) {
    let idx = 0;
    while (idx < text.length) {
      const pos = text.indexOf(h.span, idx);
      if (pos === -1) break;
      regions.push({ start: pos, end: pos + h.span.length, type: h.type });
      idx = pos + h.span.length;
    }
  }
  regions.sort((a, b) => a.start - b.start);

  let html = '';
  let cursor = 0;
  for (const r of regions) {
    if (r.start < cursor) continue; // skip overlap
    html += escapeHtml(text.slice(cursor, r.start));
    const color = HIGHLIGHT_COLORS[r.type]?.bg ?? 'rgba(245,158,11,0.2)';
    html += `<mark style="background:${color};border-radius:2px;color:transparent;">${escapeHtml(text.slice(r.start, r.end))}</mark>`;
    cursor = r.end;
  }
  html += escapeHtml(text.slice(cursor));
  return html;
}

const TEXTAREA_STYLE: React.CSSProperties = {
  fontFamily: 'ui-sans-serif, system-ui, -apple-system, sans-serif',
  fontSize: '14px',
  lineHeight: '1.625',
  padding: '12px 16px',
  whiteSpace: 'pre-wrap',
  overflowWrap: 'break-word',
  wordBreak: 'break-word',
  letterSpacing: 'normal',
};

function HighlightedTextarea({
  value, onChange, highlights, placeholder, rows, disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  highlights: TextHighlight[];
  placeholder?: string;
  rows?: number;
  disabled?: boolean;
}) {
  const backdropRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const syncScroll = () => {
    if (backdropRef.current && textareaRef.current) {
      backdropRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  };

  const highlightedHtml = buildHighlightedHtml(value, highlights);

  return (
    <div className="relative rounded-xl border border-slate-200 focus-within:border-violet-400 focus-within:ring-2 focus-within:ring-violet-100 overflow-hidden bg-white">
      {/* Highlight backdrop */}
      <div
        ref={backdropRef}
        aria-hidden
        className="absolute inset-0 pointer-events-none select-none overflow-hidden"
        style={{ ...TEXTAREA_STYLE, zIndex: 1, color: 'transparent' }}
        dangerouslySetInnerHTML={{ __html: highlightedHtml }}
      />
      {/* Textarea on top */}
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onScroll={syncScroll}
        placeholder={placeholder}
        rows={rows ?? 5}
        disabled={disabled}
        className="relative w-full resize-none outline-none disabled:opacity-50"
        style={{
          ...TEXTAREA_STYLE,
          background: 'transparent',
          color: '#334155',
          caretColor: '#1e293b',
          zIndex: 2,
          border: 'none',
          display: 'block',
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Highlight legend
// ---------------------------------------------------------------------------

function HighlightLegend({ highlights }: { highlights: TextHighlight[] }) {
  const types = Array.from(new Set(highlights.map((h) => h.type)));
  if (!types.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5">
      {types.map((t) => {
        const c = HIGHLIGHT_COLORS[t];
        return (
          <span key={t} className="flex items-center gap-1 text-[10px] text-slate-500">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: c.dot }} />
            {c.label}
          </span>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Category icon / color helpers
// ---------------------------------------------------------------------------

const CATEGORY_ICONS: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  fundamentals: PenLine,
  grammar: BookOpen,
  punctuation: Pen,
  fiction: Sparkles,
};

const CATEGORY_COLORS: Record<string, string> = {
  fundamentals: 'violet',
  grammar: 'blue',
  punctuation: 'amber',
  fiction: 'teal',
};

function colorClasses(color: string, active: boolean) {
  const map: Record<string, { bg: string; text: string; border: string; activeBg: string; activeText: string }> = {
    violet: { bg: 'bg-violet-50', text: 'text-violet-600', border: 'border-violet-200', activeBg: 'bg-violet-600', activeText: 'text-white' },
    blue:   { bg: 'bg-blue-50',   text: 'text-blue-600',   border: 'border-blue-200',   activeBg: 'bg-blue-600',   activeText: 'text-white' },
    amber:  { bg: 'bg-amber-50',  text: 'text-amber-600',  border: 'border-amber-200',  activeBg: 'bg-amber-600',  activeText: 'text-white' },
    teal:   { bg: 'bg-teal-50',   text: 'text-teal-600',   border: 'border-teal-200',   activeBg: 'bg-teal-600',   activeText: 'text-white' },
  };
  const c = map[color] ?? map.violet;
  return active
    ? `${c.activeBg} ${c.activeText} border-transparent`
    : `${c.bg} ${c.text} ${c.border}`;
}

function SkillBadge({ level }: { level: SkillLevel }) {
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 ${SKILL_LEVEL_COLOR[level]}`}>
      {SKILL_LEVEL_LABEL[level]}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Session phases
// ---------------------------------------------------------------------------

type SessionPhase = 'idle' | 'loading-exercise' | 'exercise' | 'hinting' | 'evaluating' | 'done';

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function LibraryCoachView() {
  const { profile, initProfile, updateSkill, recordExercise } = useWriterProfileStore();
  const [showOnboarding, setShowOnboarding] = useState(false);

  const [activeCategory, setActiveCategory] = useState<CoachCategoryDef>(COACH_CATEGORIES[0]);
  const [activeSub, setActiveSub] = useState<CoachSubcategory>(COACH_CATEGORIES[0].subcategories[0]);
  const [expandedCategory, setExpandedCategory] = useState<string>(COACH_CATEGORIES[0].id);

  const [phase, setPhase] = useState<SessionPhase>('idle');
  const [exerciseText, setExerciseText] = useState('');
  const [userAttempt, setUserAttempt] = useState('');
  const [hintStage, setHintStage] = useState<1 | 2 | 3>(1);
  const [coachReply, setCoachReply] = useState('');
  const [attemptCount, setAttemptCount] = useState(1);

  const ai = useCoachAI();
  const bottomRef = useRef<HTMLDivElement>(null);
  const analysisTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { initProfile(); }, [initProfile]);

  useEffect(() => {
    if (profile && !profile.onboardingComplete) setShowOnboarding(true);
  }, [profile]);

  // Capture coach stream into coachReply
  useEffect(() => {
    if (ai.streamedText) setCoachReply(ai.streamedText);
  }, [ai.streamedText]);

  // Scroll into view when streaming finishes or hint appears
  useEffect(() => {
    if (phase !== 'idle' && phase !== 'loading-exercise') {
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    }
  }, [coachReply, phase]);

  // ---------------------------------------------------------------------------
  // Debounced analysis on attempt change
  // ---------------------------------------------------------------------------

  const scheduleAnalysis = useCallback((text: string, sub: CoachSubcategory) => {
    if (analysisTimerRef.current) clearTimeout(analysisTimerRef.current);
    if (text.trim().length < 15) { ai.clearHighlights(); return; }
    analysisTimerRef.current = setTimeout(() => {
      ai.analyzeAttempt(text, sub);
    }, 2200);
  }, [ai]);

  function handleAttemptChange(value: string) {
    setUserAttempt(value);
    scheduleAnalysis(value, activeSub);
  }

  // ---------------------------------------------------------------------------
  // Session actions
  // ---------------------------------------------------------------------------

  async function generateExercise() {
    if (!profile) return;
    setPhase('loading-exercise');
    setExerciseText('');
    setUserAttempt('');
    setCoachReply('');
    setHintStage(1);
    setAttemptCount(1);
    ai.clearHighlights();
    ai.reset();

    const messages = CoachingService.buildExerciseMessages({
      subcategory: activeSub,
      skillLevel: profile.skills[activeSub.skillKey],
      profile,
    });

    await ai.suggest(messages, { temperature: 0.85 });
    // ai.streamedText has the full exercise once done
    setExerciseText(ai.streamedText || '');
    setPhase('exercise');
  }

  // After suggest() resolves, ai.streamedText has the final text.
  // But since suggest resets streamedText, capture it in state on done.
  useEffect(() => {
    if (ai.status === 'done' && phase === 'loading-exercise') {
      setExerciseText(ai.streamedText);
      setPhase('exercise');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ai.status]);

  async function submitAttempt() {
    if (!userAttempt.trim() || !profile) return;
    recordExercise(activeSub.skillKey);
    if (analysisTimerRef.current) clearTimeout(analysisTimerRef.current);

    const messages = CoachingService.buildEvaluationMessages({
      exercise: exerciseText,
      userAttempt,
      subcategory: activeSub,
      profile,
    });

    setPhase('evaluating');
    setCoachReply('');
    ai.clearHighlights();
    await ai.suggest(messages, { temperature: 0.6 });
    setPhase('done');
  }

  async function requestHint() {
    if (!profile || !userAttempt.trim()) return;
    if (analysisTimerRef.current) clearTimeout(analysisTimerRef.current);

    const messages = CoachingService.buildHintMessages({
      exercise: exerciseText,
      userAttempt,
      hintStage,
      subcategory: activeSub,
      profile,
    });

    setPhase('hinting');
    setCoachReply('');
    ai.clearHighlights();
    await ai.suggest(messages, { temperature: 0.6 });
    if (hintStage < 3) setHintStage((s) => (s + 1) as 1 | 2 | 3);
    setPhase('exercise');
  }

  function tryAgain() {
    setUserAttempt('');
    setCoachReply('');
    setHintStage(1);
    setAttemptCount((n) => n + 1);
    ai.clearHighlights();
    ai.reset();
    setPhase('exercise');
  }

  function handleSelectSub(cat: CoachCategoryDef, sub: CoachSubcategory) {
    setActiveCategory(cat);
    setActiveSub(sub);
    setPhase('idle');
    setExerciseText('');
    setCoachReply('');
    setUserAttempt('');
    setHintStage(1);
    setAttemptCount(1);
    ai.clearHighlights();
    ai.reset();
  }

  function markLevel(level: SkillLevel) { updateSkill(activeSub.skillKey, level); }

  // ---------------------------------------------------------------------------
  // Provider check
  // ---------------------------------------------------------------------------

  const providerReady =
    ai.provider === 'ollama' ||
    (ai.provider === 'webgpu' && ai.webllmStatus === 'ready');

  // ---------------------------------------------------------------------------
  // Derived booleans
  // ---------------------------------------------------------------------------

  const showExerciseCard = phase !== 'idle' && phase !== 'loading-exercise';
  const showAttemptArea = phase === 'exercise' || phase === 'hinting';
  const showCoachReply = (phase === 'hinting' || phase === 'evaluating' || phase === 'done') && coachReply;
  const isStreaming = ai.isStreaming;

  if (!profile) return null;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <header className="shrink-0 px-6 pt-5 pb-4 border-b border-slate-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, #7c3aed, #0d9488)' }}>
              <GraduationCap size={18} className="text-white" />
            </div>
            <div>
              <h1 className="font-semibold text-slate-800 text-base leading-tight">Writing Coach</h1>
              <p className="text-xs text-slate-500">Guided discovery — you own every word</p>
            </div>
          </div>
          <button onClick={() => setShowOnboarding(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors border border-slate-200">
            <User size={12} /> Profile
          </button>
        </div>
      </header>

      {/* Provider warning */}
      {!providerReady && (
        <div className="mx-4 mt-3 p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2 shrink-0">
          <AlertCircle size={15} className="text-amber-500 mt-0.5 shrink-0" />
          <p className="text-xs text-amber-700">
            {ai.provider === 'webgpu' && ai.webllmStatus === 'idle'
              ? 'WebGPU model not loaded. Go to Ask Meyvn → Settings to load a model.'
              : ai.provider === 'webgpu' && ai.webllmStatus === 'loading'
              ? 'WebGPU model is loading… exercises will be available shortly.'
              : 'No AI provider configured. Open Ask Meyvn to set up Ollama or WebGPU.'}
          </p>
        </div>
      )}

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar — desktop only */}
        <aside className="w-56 shrink-0 border-r border-slate-100 overflow-y-auto py-3 hidden md:block">
          {COACH_CATEGORIES.map((cat) => {
            const Icon = CATEGORY_ICONS[cat.id] ?? PenLine;
            const color = CATEGORY_COLORS[cat.id] ?? 'violet';
            const isExpanded = expandedCategory === cat.id;
            return (
              <div key={cat.id} className="mb-1">
                <button onClick={() => setExpandedCategory(isExpanded ? '' : cat.id)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-slate-50 transition-colors">
                  <Icon size={14} className={`text-${color}-500 shrink-0`} />
                  <span className="flex-1 text-xs font-semibold text-slate-600">{cat.label}</span>
                  <ChevronDown size={12} className={`text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                </button>
                {isExpanded && (
                  <div className="ml-2">
                    {cat.subcategories.map((sub) => {
                      const isActive = activeSub.id === sub.id;
                      return (
                        <button key={sub.id}
                          onClick={() => handleSelectSub(cat, sub)}
                          className={`w-full flex items-center justify-between gap-2 px-3 py-1.5 text-left rounded-lg mx-1 my-0.5 text-xs transition-all ${isActive ? 'bg-violet-50 text-violet-700 font-medium' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'}`}>
                          <span className="truncate">{sub.label}</span>
                          <SkillBadge level={profile.skills[sub.skillKey]} />
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </aside>

        {/* Main area */}
        <div className="flex-1 flex flex-col overflow-hidden">

          {/* Mobile category scroll */}
          <div className="md:hidden px-4 pt-3 pb-2 flex gap-2 overflow-x-auto shrink-0">
            {COACH_CATEGORIES.map((cat) => {
              const color = CATEGORY_COLORS[cat.id] ?? 'violet';
              const isActive = activeCategory.id === cat.id;
              return (
                <button key={cat.id}
                  onClick={() => { setActiveCategory(cat); setActiveSub(cat.subcategories[0]); setExpandedCategory(cat.id); }}
                  className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${colorClasses(color, isActive)}`}>
                  {cat.label}
                </button>
              );
            })}
          </div>

          {/* Mobile subcategory scroll */}
          <div className="md:hidden px-4 pb-2 flex gap-2 overflow-x-auto shrink-0">
            {activeCategory.subcategories.map((sub) => (
              <button key={sub.id}
                onClick={() => handleSelectSub(activeCategory, sub)}
                className={`shrink-0 px-3 py-1.5 rounded-full text-xs border transition-all ${activeSub.id === sub.id ? 'bg-violet-600 text-white border-violet-600' : 'bg-white text-slate-500 border-slate-200'}`}>
                {sub.label}
              </button>
            ))}
          </div>

          {/* Subcategory header */}
          <div className="shrink-0 px-4 pt-3 pb-2 flex items-start justify-between gap-3 border-b border-slate-100">
            <div>
              <h2 className="font-semibold text-slate-800 text-sm">{activeSub.label}</h2>
              <p className="text-xs text-slate-500 mt-0.5">{activeSub.description}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <SkillBadge level={profile.skills[activeSub.skillKey]} />
              {/* Skill self-rate dropdown */}
              <div className="relative group">
                <button className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors border border-slate-200">
                  <TrendingUp size={11} /> Rate
                </button>
                <div className="hidden group-hover:flex absolute right-0 top-8 bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden z-10 flex-col min-w-[140px]">
                  {(['needs-practice', 'developing', 'strong', 'excellent'] as SkillLevel[]).map((lvl) => (
                    <button key={lvl} onClick={() => markLevel(lvl)}
                      className={`px-4 py-2 text-xs text-left transition-colors whitespace-nowrap ${profile.skills[activeSub.skillKey] === lvl ? 'bg-violet-50 text-violet-700 font-medium' : 'text-slate-600 hover:bg-slate-50'}`}>
                      {SKILL_LEVEL_LABEL[lvl]}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto">

            {/* STICKY exercise card — always visible once generated */}
            {showExerciseCard && (
              <div className="sticky top-0 z-10 mx-4 mt-4 bg-slate-50 rounded-xl border border-slate-200 shadow-sm">
                <div className="flex items-center gap-1.5 px-4 pt-3 pb-1">
                  <BookOpen size={13} className="text-slate-400" />
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Exercise</span>
                  {attemptCount > 1 && (
                    <span className="ml-auto text-[10px] text-slate-400 font-medium">Attempt {attemptCount}</span>
                  )}
                </div>
                <div className="px-4 pb-3 text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
                  {exerciseText}
                </div>
              </div>
            )}

            <div className="px-4 pb-4 space-y-4">

              {/* Idle state */}
              {phase === 'idle' && (
                <div className="flex flex-col items-center justify-center py-14 text-center">
                  <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
                    style={{ background: 'linear-gradient(135deg, #ede9fe, #ccfbf1)' }}>
                    <Sparkles size={28} className="text-violet-500" />
                  </div>
                  <p className="text-slate-700 font-medium mb-1">Ready to practise {activeSub.label}?</p>
                  <p className="text-xs text-slate-500 mb-6 max-w-xs">
                    Meyvn will craft a personalised exercise. You write — Meyvn guides. You always discover the answer yourself.
                  </p>
                  <button onClick={generateExercise} disabled={!providerReady}
                    className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-40"
                    style={{ background: 'linear-gradient(135deg, #7c3aed, #0d9488)' }}>
                    <Sparkles size={15} /> Generate Exercise
                  </button>
                </div>
              )}

              {/* Loading exercise */}
              {phase === 'loading-exercise' && (
                <div className="flex flex-col items-center justify-center py-10 gap-3">
                  <Loader2 size={22} className="text-violet-500 animate-spin" />
                  <p className="text-sm text-slate-500">Crafting your exercise…</p>
                  {ai.isStreaming && (
                    <div className="w-full max-w-md bg-slate-50 rounded-xl p-4 text-xs text-slate-600 whitespace-pre-wrap leading-relaxed border border-slate-200">
                      {ai.streamedText}
                    </div>
                  )}
                </div>
              )}

              {/* Hint / evaluation reply from Meyvn */}
              {showCoachReply && (
                <div className="bg-violet-50 rounded-xl p-4 border border-violet-100 mt-4">
                  <div className="flex items-center gap-1.5 mb-2">
                    <Sparkles size={13} className="text-violet-500" />
                    <span className="text-xs font-semibold text-violet-600">Meyvn</span>
                    {isStreaming && <Loader2 size={11} className="text-violet-400 animate-spin ml-1" />}
                  </div>
                  <div className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
                    {coachReply || <span className="text-slate-400 italic">Thinking…</span>}
                  </div>
                </div>
              )}

              {/* Attempt textarea with highlights */}
              {showAttemptArea && (
                <div>
                  <div className="flex items-center gap-2 mb-1.5">
                    <label className="text-xs font-medium text-slate-600">Your attempt</label>
                    {ai.isAnalyzing && (
                      <span className="flex items-center gap-1 text-[10px] text-slate-400">
                        <Loader2 size={9} className="animate-spin" /> Analysing…
                      </span>
                    )}
                  </div>
                  <HighlightedTextarea
                    value={userAttempt}
                    onChange={handleAttemptChange}
                    highlights={ai.highlights}
                    placeholder="Write your response here — Meyvn will highlight potential issues as you type…"
                    rows={5}
                    disabled={isStreaming}
                  />
                  <HighlightLegend highlights={ai.highlights} />

                  {/* Action row */}
                  <div className="flex items-center gap-2 mt-3 flex-wrap">
                    <button
                      onClick={submitAttempt}
                      disabled={!userAttempt.trim() || isStreaming}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white transition-all disabled:opacity-40"
                      style={{ background: 'linear-gradient(135deg, #7c3aed, #0d9488)' }}>
                      <Send size={12} /> Submit
                    </button>
                    {hintStage <= 3 && (
                      <button
                        onClick={requestHint}
                        disabled={!userAttempt.trim() || isStreaming}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors disabled:opacity-40">
                        <ChevronRight size={12} />
                        {hintStage === 1 ? 'First hint' : hintStage === 2 ? 'Second hint' : 'Final hint'}
                      </button>
                    )}
                    <button
                      onClick={generateExercise}
                      disabled={isStreaming}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors ml-auto">
                      <RotateCcw size={11} /> New exercise
                    </button>
                  </div>
                </div>
              )}

              {/* Post-evaluation actions */}
              {phase === 'done' && !isStreaming && (
                <div className="space-y-3 pt-1">
                  {/* Your attempt display (read-only, with highlights) */}
                  <div>
                    <p className="text-xs font-medium text-slate-500 mb-1.5">Your attempt</p>
                    <div className="bg-slate-50 rounded-xl p-3 border border-slate-200 text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
                      {userAttempt}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 flex-wrap">
                    <button onClick={tryAgain}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-violet-50 text-violet-700 border border-violet-200 hover:bg-violet-100 transition-colors">
                      <RefreshCw size={12} /> Try same exercise again
                    </button>
                    <button onClick={generateExercise}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white transition-all"
                      style={{ background: 'linear-gradient(135deg, #7c3aed, #0d9488)' }}>
                      <RotateCcw size={12} /> New exercise
                    </button>
                  </div>

                  {/* Self-rate */}
                  <div className="flex items-center gap-2 flex-wrap pt-1">
                    <span className="text-xs text-slate-500">How did that feel?</span>
                    {(['needs-practice', 'developing', 'strong', 'excellent'] as SkillLevel[]).map((lvl) => (
                      <button key={lvl} onClick={() => markLevel(lvl)}
                        className={`px-2.5 py-1 rounded-full text-[10px] font-medium border transition-all ${profile.skills[activeSub.skillKey] === lvl ? 'bg-violet-50 text-violet-600 border-violet-300' : 'bg-white text-slate-500 border-slate-200 hover:border-violet-300'}`}>
                        {SKILL_LEVEL_LABEL[lvl]}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Error banner */}
              {ai.error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2">
                  <AlertCircle size={14} className="text-red-500 mt-0.5 shrink-0" />
                  <p className="text-xs text-red-700">{ai.error}</p>
                </div>
              )}

              <div ref={bottomRef} />
            </div>
          </div>

          {/* Progress strip */}
          <div className="shrink-0 border-t border-slate-100 px-4 py-2 flex items-center gap-4 overflow-x-auto">
            <span className="text-xs text-slate-400 shrink-0 font-medium">Progress:</span>
            {COACH_CATEGORIES.flatMap((c) => c.subcategories).map((sub) => (
              <div key={sub.id} className="flex items-center gap-1.5 shrink-0">
                <span className="text-xs text-slate-500">{sub.label}</span>
                <SkillBadge level={profile.skills[sub.skillKey]} />
                {(profile.exerciseCounts[sub.skillKey] ?? 0) > 0 && (
                  <CheckCircle2 size={11} className="text-teal-500" />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {showOnboarding && (
        <WriterOnboardingModal onClose={() => setShowOnboarding(false)} />
      )}
    </div>
  );
}
