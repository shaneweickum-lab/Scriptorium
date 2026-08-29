import { useState, useEffect, useRef } from 'react';
import {
  Sparkles, PenLine, BookOpen, Pen, ChevronRight,
  RotateCcw, Send, Loader2, AlertCircle, User, ChevronDown,
  CheckCircle2, TrendingUp, GraduationCap,
} from 'lucide-react';
import { useWriterProfileStore } from '../../store/writerProfileStore';
import { useCoachAI } from '../../features/writing-coach/hooks/useCoachAI';
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
// Category icon map
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
    blue: { bg: 'bg-blue-50', text: 'text-blue-600', border: 'border-blue-200', activeBg: 'bg-blue-600', activeText: 'text-white' },
    amber: { bg: 'bg-amber-50', text: 'text-amber-600', border: 'border-amber-200', activeBg: 'bg-amber-600', activeText: 'text-white' },
    teal: { bg: 'bg-teal-50', text: 'text-teal-600', border: 'border-teal-200', activeBg: 'bg-teal-600', activeText: 'text-white' },
  };
  const c = map[color] ?? map.violet;
  return active
    ? `${c.activeBg} ${c.activeText} border-transparent`
    : `${c.bg} ${c.text} ${c.border}`;
}

// ---------------------------------------------------------------------------
// Skill level badge
// ---------------------------------------------------------------------------

function SkillBadge({ level }: { level: SkillLevel }) {
  const label = SKILL_LEVEL_LABEL[level];
  const color = SKILL_LEVEL_COLOR[level];
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 ${color}`}>
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Exercise session types
// ---------------------------------------------------------------------------

type SessionPhase = 'idle' | 'loading-exercise' | 'exercise' | 'hint-1' | 'hint-2' | 'hint-3' | 'submitted';

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function LibraryCoachView() {
  const { profile, initProfile } = useWriterProfileStore();
  const { updateSkill, recordExercise } = useWriterProfileStore();

  const [showOnboarding, setShowOnboarding] = useState(false);

  // Selected category / subcategory
  const [activeCategory, setActiveCategory] = useState<CoachCategoryDef>(COACH_CATEGORIES[0]);
  const [activeSub, setActiveSub] = useState<CoachSubcategory>(COACH_CATEGORIES[0].subcategories[0]);

  // Exercise session state
  const [phase, setPhase] = useState<SessionPhase>('idle');
  const [exerciseText, setExerciseText] = useState('');
  const [userAttempt, setUserAttempt] = useState('');
  const [hintStage, setHintStage] = useState<1 | 2 | 3>(1);
  const [coachReply, setCoachReply] = useState('');
  const [expandedCategory, setExpandedCategory] = useState<string>(COACH_CATEGORIES[0].id);

  const ai = useCoachAI();
  const bottomRef = useRef<HTMLDivElement>(null);

  // Init profile on mount
  useEffect(() => { initProfile(); }, [initProfile]);

  // Show onboarding if not complete
  useEffect(() => {
    if (profile && !profile.onboardingComplete) setShowOnboarding(true);
  }, [profile]);

  // Scroll to bottom when coach replies
  useEffect(() => {
    if (phase === 'exercise' || phase.startsWith('hint')) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [coachReply, phase]);

  // Capture streamed text as coachReply
  useEffect(() => {
    if (ai.streamedText) setCoachReply(ai.streamedText);
  }, [ai.streamedText]);

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  async function generateExercise() {
    if (!profile) return;
    setPhase('loading-exercise');
    setExerciseText('');
    setUserAttempt('');
    setCoachReply('');
    setHintStage(1);

    const skillLevel = profile.skills[activeSub.skillKey];
    const messages = CoachingService.buildExerciseMessages({
      subcategory: activeSub,
      skillLevel,
      profile,
    });

    await ai.suggest(messages, { temperature: 0.8 });
    setExerciseText(ai.streamedText || '');
    setPhase('exercise');
  }

  async function submitAttempt() {
    if (!userAttempt.trim() || !profile) return;
    recordExercise(activeSub.skillKey);

    const messages = CoachingService.buildEvaluationMessages({
      exercise: exerciseText,
      userAttempt,
      subcategory: activeSub,
      profile,
    });

    setPhase('submitted');
    setCoachReply('');
    await ai.suggest(messages, { temperature: 0.6 });
  }

  async function requestHint() {
    if (!profile) return;
    const stage = hintStage as 1 | 2 | 3;

    const messages = CoachingService.buildHintMessages({
      exercise: exerciseText,
      userAttempt,
      hintStage: stage,
      subcategory: activeSub,
      profile,
    });

    const nextPhase: SessionPhase = `hint-${stage}` as SessionPhase;
    setPhase(nextPhase);
    setCoachReply('');
    await ai.suggest(messages, { temperature: 0.6 });
    if (stage < 3) setHintStage((s) => (s + 1) as 1 | 2 | 3);
  }

  function handleSelectSub(cat: CoachCategoryDef, sub: CoachSubcategory) {
    setActiveCategory(cat);
    setActiveSub(sub);
    setPhase('idle');
    setExerciseText('');
    setCoachReply('');
    setUserAttempt('');
    setHintStage(1);
  }

  function markLevel(level: SkillLevel) {
    updateSkill(activeSub.skillKey, level);
  }

  // ---------------------------------------------------------------------------
  // Provider warning
  // ---------------------------------------------------------------------------

  const providerReady =
    ai.provider === 'ollama' ||
    (ai.provider === 'webgpu' && ai.webllmStatus === 'ready');

  const notReadyBanner = !providerReady ? (
    <div className="mx-4 mb-3 p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2">
      <AlertCircle size={15} className="text-amber-500 mt-0.5 shrink-0" />
      <div className="text-xs text-amber-700">
        {ai.provider === 'webgpu' && ai.webllmStatus === 'idle'
          ? 'WebGPU model not loaded. Go to Ask Meyvn → Settings to load a model.'
          : ai.provider === 'webgpu' && ai.webllmStatus === 'loading'
          ? 'WebGPU model is loading… please wait.'
          : 'No AI provider configured. Open Ask Meyvn to set up Ollama or WebGPU.'}
      </div>
    </div>
  ) : null;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

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

      <div className="flex-1 flex overflow-hidden">
        {/* Left nav — categories */}
        <aside className="w-56 shrink-0 border-r border-slate-100 overflow-y-auto py-3 hidden md:block">
          {COACH_CATEGORIES.map((cat) => {
            const Icon = CATEGORY_ICONS[cat.id] ?? PenLine;
            const color = CATEGORY_COLORS[cat.id] ?? 'violet';
            const isExpanded = expandedCategory === cat.id;
            return (
              <div key={cat.id} className="mb-1">
                <button
                  onClick={() => setExpandedCategory(isExpanded ? '' : cat.id)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-slate-50 transition-colors group">
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
                          <span>{sub.label}</span>
                          {profile && <SkillBadge level={profile.skills[sub.skillKey]} />}
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
          {notReadyBanner}

          {/* Mobile category picker */}
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

          {/* Mobile subcategory row */}
          <div className="md:hidden px-4 pb-2 flex gap-2 overflow-x-auto shrink-0">
            {activeCategory.subcategories.map((sub) => (
              <button key={sub.id}
                onClick={() => handleSelectSub(activeCategory, sub)}
                className={`shrink-0 px-3 py-1.5 rounded-full text-xs border transition-all ${activeSub.id === sub.id ? 'bg-violet-600 text-white border-violet-600' : 'bg-white text-slate-500 border-slate-200'}`}>
                {sub.label}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto px-4 pb-4">
            {/* Subcategory header */}
            <div className="pt-4 pb-3 flex items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold text-slate-800">{activeSub.label}</h2>
                <p className="text-xs text-slate-500 mt-0.5">{activeSub.description}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <SkillBadge level={profile.skills[activeSub.skillKey]} />
                <div className="relative group">
                  <button className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors border border-slate-200">
                    <TrendingUp size={11} /> Rate
                  </button>
                  <div className="hidden group-hover:flex absolute right-0 top-8 bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden z-10 flex-col">
                    {(['needs-practice', 'developing', 'strong', 'excellent'] as SkillLevel[]).map((lvl) => (
                      <button key={lvl} onClick={() => markLevel(lvl)}
                        className="px-4 py-2 text-xs text-left hover:bg-slate-50 whitespace-nowrap text-slate-600 hover:text-slate-800 transition-colors">
                        {SKILL_LEVEL_LABEL[lvl]}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Idle state */}
            {phase === 'idle' && (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
                  style={{ background: 'linear-gradient(135deg, #ede9fe, #ccfbf1)' }}>
                  <Sparkles size={28} className="text-violet-500" />
                </div>
                <p className="text-slate-700 font-medium mb-1">Ready to practise {activeSub.label}?</p>
                <p className="text-xs text-slate-500 mb-6 max-w-xs">
                  Meyvn will give you a personalised exercise. You write. Meyvn guides. You always discover the answer yourself.
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
              <div className="flex flex-col items-center justify-center py-12 gap-3">
                <Loader2 size={24} className="text-violet-500 animate-spin" />
                <p className="text-sm text-slate-500">Meyvn is crafting your exercise…</p>
                {ai.isStreaming && (
                  <div className="w-full max-w-md bg-slate-50 rounded-xl p-4 text-sm text-slate-600 whitespace-pre-wrap font-mono text-xs leading-relaxed">
                    {ai.streamedText}
                  </div>
                )}
              </div>
            )}

            {/* Exercise phase */}
            {(phase === 'exercise' || phase.startsWith('hint') || phase === 'submitted') && (
              <div className="space-y-4">
                {/* Exercise card */}
                <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                  <div className="flex items-center gap-1.5 mb-2">
                    <BookOpen size={13} className="text-slate-400" />
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Your Exercise</span>
                  </div>
                  <div className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
                    {exerciseText}
                  </div>
                </div>

                {/* Coach reply (hints / evaluation) */}
                {(phase.startsWith('hint') || phase === 'submitted') && (
                  <div className="bg-violet-50 rounded-xl p-4 border border-violet-100">
                    <div className="flex items-center gap-1.5 mb-2">
                      <Sparkles size={13} className="text-violet-500" />
                      <span className="text-xs font-semibold text-violet-600">Meyvn</span>
                      {ai.isStreaming && <Loader2 size={11} className="text-violet-400 animate-spin ml-1" />}
                    </div>
                    <div className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
                      {coachReply || <span className="text-slate-400 italic">Thinking…</span>}
                    </div>
                  </div>
                )}

                {/* Attempt textarea */}
                {phase !== 'submitted' && (
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1.5">
                      Your attempt
                    </label>
                    <textarea
                      value={userAttempt}
                      onChange={(e) => setUserAttempt(e.target.value)}
                      placeholder="Write your response here…"
                      rows={4}
                      className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-700 resize-none focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
                    />
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      <button
                        onClick={submitAttempt}
                        disabled={!userAttempt.trim() || ai.isStreaming}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white transition-all disabled:opacity-40"
                        style={{ background: 'linear-gradient(135deg, #7c3aed, #0d9488)' }}>
                        <Send size={12} /> Submit
                      </button>
                      {hintStage <= 3 && (
                        <button
                          onClick={requestHint}
                          disabled={!userAttempt.trim() || ai.isStreaming}
                          className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors disabled:opacity-40">
                          <ChevronRight size={12} /> Hint {hintStage}/3
                        </button>
                      )}
                      <button
                        onClick={generateExercise}
                        disabled={ai.isStreaming}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors ml-auto">
                        <RotateCcw size={11} /> New exercise
                      </button>
                    </div>
                  </div>
                )}

                {/* Post-submission actions */}
                {phase === 'submitted' && !ai.isStreaming && (
                  <div className="flex items-center gap-3 pt-2 flex-wrap">
                    <button onClick={generateExercise}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white transition-all"
                      style={{ background: 'linear-gradient(135deg, #7c3aed, #0d9488)' }}>
                      <RotateCcw size={12} /> Try another
                    </button>
                    <div className="flex items-center gap-2 ml-auto">
                      <span className="text-xs text-slate-500">How did that feel?</span>
                      {(['needs-practice', 'developing', 'strong', 'excellent'] as SkillLevel[]).map((lvl) => (
                        <button key={lvl} onClick={() => markLevel(lvl)}
                          className={`px-2.5 py-1 rounded-full text-[10px] font-medium border transition-all hover:border-violet-400 hover:text-violet-600 ${profile.skills[activeSub.skillKey] === lvl ? 'bg-violet-50 text-violet-600 border-violet-300' : 'bg-white text-slate-500 border-slate-200'}`}>
                          {SKILL_LEVEL_LABEL[lvl]}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div ref={bottomRef} />
              </div>
            )}

            {/* Error state */}
            {ai.error && (
              <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2">
                <AlertCircle size={14} className="text-red-500 mt-0.5 shrink-0" />
                <p className="text-xs text-red-700">{ai.error}</p>
              </div>
            )}
          </div>

          {/* Progress strip at bottom */}
          <div className="shrink-0 border-t border-slate-100 px-4 py-2 flex items-center gap-4 overflow-x-auto">
            <span className="text-xs text-slate-400 shrink-0 font-medium">Your progress:</span>
            {COACH_CATEGORIES.flatMap((c) => c.subcategories).slice(0, 6).map((sub) => (
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
