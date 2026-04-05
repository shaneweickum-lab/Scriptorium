import { useState, useEffect, useRef } from 'react';
import { Timer, ChevronDown, Square } from 'lucide-react';
import { useTimerStore } from '../../store/timerStore';

const PRESETS = [
  { label: '15 min', seconds: 15 * 60 },
  { label: '25 min', seconds: 25 * 60 },
  { label: '45 min', seconds: 45 * 60 },
  { label: '60 min', seconds: 60 * 60 },
  { label: '90 min', seconds: 90 * 60 },
];

function pad(n: number) {
  return String(n).padStart(2, '0');
}

function formatRemaining(ms: number) {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${pad(h)}:${pad(m)}:${pad(s)}`;
  return `${pad(m)}:${pad(s)}`;
}

interface Props {
  /** Compact mode — used in narrow headers (TopBar, WorldBible mobile) */
  compact?: boolean;
}

export function FocusTimer({ compact = false }: Props) {
  const { lastDuration, endTime, isRunning, startTimer, stopTimer } = useTimerStore();
  const [open, setOpen] = useState(false);
  const [customMin, setCustomMin] = useState('');
  const [remaining, setRemaining] = useState(0);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Tick the countdown
  useEffect(() => {
    if (!isRunning || !endTime) {
      setRemaining(0);
      return;
    }
    const update = () => setRemaining(endTime - Date.now());
    update();
    const id = setInterval(update, 500);
    return () => clearInterval(id);
  }, [isRunning, endTime]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return;
    const handle = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [open]);

  const handleStart = (seconds: number) => {
    startTimer(seconds);
    setOpen(false);
    setCustomMin('');
  };

  const handleCustomStart = () => {
    const min = parseInt(customMin, 10);
    if (!min || min <= 0) return;
    handleStart(min * 60);
  };

  const urgentPct = isRunning ? remaining / ((lastDuration ?? 1) * 1000) : 1;
  const isUrgent = isRunning && remaining < 60_000;

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Trigger button */}
      <button
        onClick={() => setOpen((v) => !v)}
        title="Focus Timer"
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
          isRunning
            ? isUrgent
              ? 'bg-red-900/30 text-red-300 border border-red-500/40 animate-pulse'
              : 'bg-violet-900/30 text-violet-300 border border-violet-500/30'
            : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
        }`}
      >
        {isRunning ? (
          <>
            <Timer size={13} className={isUrgent ? 'text-red-400' : 'text-violet-400'} />
            <span className="font-mono tabular-nums">{formatRemaining(remaining)}</span>
            <ChevronDown size={11} className="opacity-60" />
          </>
        ) : (
          <>
            <Timer size={13} />
            {!compact && <span>Focus</span>}
            <ChevronDown size={11} className="opacity-60" />
          </>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 top-full mt-1 z-[100] w-52
          bg-[#0d1526] border border-slate-700/60 rounded-xl shadow-2xl py-2 overflow-hidden"
          style={{ boxShadow: '0 8px 40px rgba(0,0,0,0.6), 0 0 20px rgba(124,58,237,0.08)' }}
        >
          {isRunning ? (
            /* Running state — show stop + remaining */
            <div className="px-3 py-2">
              <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-2">Timer running</p>

              {/* Progress bar */}
              <div className="w-full h-1 bg-slate-800 rounded-full overflow-hidden mb-3">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${urgentPct * 100}%`,
                    background: isUrgent
                      ? 'linear-gradient(to right, #ef4444, #f97316)'
                      : 'linear-gradient(to right, #7c3aed, #a78bfa)',
                  }}
                />
              </div>

              <div className="text-center mb-3">
                <span className="text-2xl font-mono font-bold text-slate-200 tabular-nums">
                  {formatRemaining(remaining)}
                </span>
                <p className="text-[10px] text-slate-600 mt-0.5">remaining</p>
              </div>

              <button
                onClick={() => { stopTimer(); setOpen(false); }}
                className="flex items-center justify-center gap-1.5 w-full py-2 rounded-lg
                  text-xs text-red-400 hover:text-red-300 hover:bg-red-900/20 border border-red-900/30
                  transition-colors"
              >
                <Square size={11} />
                Stop Timer
              </button>
            </div>
          ) : (
            /* Idle state — show presets + custom */
            <>
              <p className="text-[10px] text-slate-500 uppercase tracking-wider px-3 mb-1">Presets</p>
              {PRESETS.map((p) => (
                <button
                  key={p.seconds}
                  onClick={() => handleStart(p.seconds)}
                  className={`flex items-center justify-between w-full px-3 py-2 text-xs
                    transition-colors group ${
                      lastDuration === p.seconds
                        ? 'text-violet-300 bg-violet-900/20'
                        : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                    }`}
                >
                  <span>{p.label}</span>
                  {lastDuration === p.seconds && (
                    <span className="text-[9px] text-violet-500 uppercase tracking-wider">last used</span>
                  )}
                </button>
              ))}

              {/* Divider */}
              <div className="mx-3 my-2 border-t border-slate-700/40" />

              {/* Custom */}
              <p className="text-[10px] text-slate-500 uppercase tracking-wider px-3 mb-1.5">Custom</p>
              <div className="flex gap-1.5 px-3 pb-1">
                <input
                  type="number"
                  min="1"
                  max="480"
                  placeholder="min"
                  value={customMin}
                  onChange={(e) => setCustomMin(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleCustomStart()}
                  className="flex-1 bg-slate-800 border border-slate-600 rounded-lg px-2 py-1.5
                    text-xs text-slate-200 placeholder-slate-600 focus:outline-none
                    focus:border-violet-500 text-center [appearance:textfield]
                    [&::-webkit-inner-spin-button]:appearance-none"
                />
                <button
                  onClick={handleCustomStart}
                  disabled={!customMin || parseInt(customMin) <= 0}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold
                    bg-violet-600 hover:bg-violet-500 text-white
                    disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  Start
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
