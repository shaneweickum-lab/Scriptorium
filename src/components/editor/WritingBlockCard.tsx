/**
 * WritingBlockCard
 *
 * A non-intrusive floating card that appears at the bottom of the editor when
 * the writing block detector fires.  Two states:
 *
 *   idle      — author has been staring at the screen without typing
 *   thrashing — author is caught in a write-delete loop
 *
 * The card sits above the word-count bar, slides in from below, and offers a
 * single primary action (open Meyvn) and a soft dismiss.
 */

import { Sparkles, Clock, RefreshCw, X } from 'lucide-react';
import { useUIStore } from '../../store/uiStore';

interface Props {
  type: 'idle' | 'thrashing';
  idleMinutes?: number;
  onDismiss: () => void;
}

const COPY = {
  idle: {
    Icon: Clock,
    iconGradient: 'linear-gradient(135deg, #7c3aed, #0d9488)',
    label: "You've gone quiet",
    body: (mins: number) =>
      mins >= 2
        ? `${mins} minutes of silence. Sometimes a different perspective breaks the spell.`
        : "A few minutes of silence. Sometimes a new angle is all it takes.",
    primary: 'Ask Meyvn',
    dismiss: "I'm thinking",
  },
  thrashing: {
    Icon: RefreshCw,
    iconGradient: 'linear-gradient(135deg, #e11d48, #7c3aed)',
    label: "Looks like you're in a loop",
    body: () =>
      "You've been writing and deleting in circles. Meyvn can help you find the door out of this scene.",
    primary: 'Get unstuck with Meyvn',
    dismiss: 'Keep writing',
  },
} as const;

export function WritingBlockCard({ type, idleMinutes = 0, onDismiss }: Props) {
  const setShowMeyvn = useUIStore((s) => s.setShowMeyvn);
  const copy = COPY[type];
  const { Icon, iconGradient, label, body, primary, dismiss } = copy;

  const handleOpenMeyvn = () => {
    setShowMeyvn(true);
    onDismiss();
  };

  return (
    <div
      className="mx-4 mb-2 flex items-start gap-3 px-4 py-3 rounded-xl border animate-in fade-in slide-in-from-bottom-2 duration-300"
      style={{
        background: 'linear-gradient(135deg, rgba(124,58,237,0.07), rgba(13,148,136,0.05))',
        borderColor: 'rgba(124,58,237,0.2)',
      }}
    >
      {/* Icon badge */}
      <div
        className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
        style={{ background: iconGradient }}
      >
        <Icon size={14} className="text-white" />
      </div>

      {/* Body */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-xs font-semibold text-slate-700">{label}</span>
          <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-full"
            style={{ background: 'rgba(124,58,237,0.08)' }}>
            <Sparkles size={9} className="text-violet-500" />
            <span className="text-[9px] font-semibold text-violet-600 uppercase tracking-wide">Meyvn</span>
          </div>
        </div>
        <p className="text-[11px] text-slate-500 leading-relaxed">
          {body(idleMinutes)}
        </p>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 shrink-0 ml-1">
        <button
          onClick={handleOpenMeyvn}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold text-white transition-all hover:opacity-90 hover:-translate-y-px"
          style={{ background: 'linear-gradient(135deg, #7c3aed, #0d9488)' }}
        >
          <Sparkles size={11} />
          {primary}
        </button>
        <button
          onClick={onDismiss}
          className="px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all"
          title={dismiss}
        >
          {dismiss}
        </button>
        <button
          onClick={onDismiss}
          className="p-1 rounded text-slate-300 hover:text-slate-500 hover:bg-slate-100 transition-colors"
          title="Dismiss"
        >
          <X size={12} />
        </button>
      </div>
    </div>
  );
}
