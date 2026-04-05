import { useState } from 'react';
import { Coffee, RotateCcw, Timer, Check } from 'lucide-react';
import { useTimerStore } from '../../store/timerStore';

const PRESETS = [
  { label: '15 min', seconds: 15 * 60 },
  { label: '25 min', seconds: 25 * 60 },
  { label: '45 min', seconds: 45 * 60 },
  { label: '60 min', seconds: 60 * 60 },
  { label: '90 min', seconds: 90 * 60 },
];

export function BreakOverlay() {
  const { isFinished, lastDuration, dismissBreak, restartTimer, startTimer } = useTimerStore();
  const [mode, setMode] = useState<'break' | 'new-timer'>('break');
  const [customMin, setCustomMin] = useState('');

  if (!isFinished) return null;

  const handleNewTimerStart = (seconds: number) => {
    startTimer(seconds);
    setMode('break');
    setCustomMin('');
  };

  const handleCustomStart = () => {
    const min = parseInt(customMin, 10);
    if (!min || min <= 0) return;
    handleNewTimerStart(min * 60);
  };

  const formatDuration = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m} min`;
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center"
      style={{ background: 'rgba(6, 13, 24, 0.92)', backdropFilter: 'blur(8px)' }}
    >
      {/* Subtle radial glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse at center, rgba(124,58,237,0.08) 0%, transparent 65%)' }}
      />

      {mode === 'break' ? (
        <div className="relative flex flex-col items-center gap-6 text-center px-6 max-w-sm w-full">
          {/* Icon */}
          <div className="w-20 h-20 rounded-full bg-violet-950/60 border border-violet-500/20 flex items-center justify-center"
            style={{ boxShadow: '0 0 40px rgba(124,58,237,0.25)' }}>
            <Coffee size={36} className="text-violet-300" />
          </div>

          {/* Heading */}
          <div>
            <h2 className="text-2xl font-bold text-white tracking-wide">
              It's time to take a break
            </h2>
            {lastDuration && (
              <p className="text-sm text-slate-500 mt-2">
                You focused for {formatDuration(lastDuration)}. Well done!
              </p>
            )}
          </div>

          {/* Buttons */}
          <div className="flex flex-col gap-3 w-full">
            {/* Break Over — restart with same time */}
            <button
              onClick={() => { restartTimer(); }}
              className="flex items-center justify-center gap-2 w-full py-3 rounded-xl
                bg-violet-600 hover:bg-violet-500 text-white font-semibold text-sm
                transition-all shadow-lg shadow-violet-900/40"
              style={{ boxShadow: '0 0 20px rgba(124,58,237,0.3)' }}
            >
              <RotateCcw size={15} />
              Break Over — Restart{lastDuration ? ` (${formatDuration(lastDuration)})` : ''}
            </button>

            {/* New Timer */}
            <button
              onClick={() => setMode('new-timer')}
              className="flex items-center justify-center gap-2 w-full py-3 rounded-xl
                bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-sm
                border border-slate-700 transition-colors"
            >
              <Timer size={15} />
              New Timer
            </button>

            {/* Confirm / dismiss */}
            <button
              onClick={dismissBreak}
              className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl
                text-slate-500 hover:text-slate-300 text-sm transition-colors"
            >
              <Check size={14} />
              Confirm — I'll take a break
            </button>
          </div>
        </div>
      ) : (
        /* New timer picker */
        <div className="relative flex flex-col items-center gap-5 text-center px-6 max-w-xs w-full">
          <div className="w-16 h-16 rounded-full bg-violet-950/60 border border-violet-500/20 flex items-center justify-center"
            style={{ boxShadow: '0 0 30px rgba(124,58,237,0.2)' }}>
            <Timer size={28} className="text-violet-300" />
          </div>

          <h2 className="text-xl font-bold text-white">Set a new timer</h2>

          {/* Presets */}
          <div className="grid grid-cols-3 gap-2 w-full">
            {PRESETS.map((p) => (
              <button
                key={p.seconds}
                onClick={() => handleNewTimerStart(p.seconds)}
                className="py-2.5 rounded-xl text-xs font-semibold
                  bg-slate-800 hover:bg-violet-900/40 border border-slate-700
                  hover:border-violet-500/40 text-slate-300 hover:text-violet-200
                  transition-all"
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Custom */}
          <div className="flex gap-2 w-full">
            <input
              type="number"
              min="1"
              max="480"
              placeholder="Custom minutes"
              value={customMin}
              onChange={(e) => setCustomMin(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCustomStart()}
              autoFocus
              className="flex-1 bg-slate-800 border border-slate-600 rounded-xl px-3 py-2.5
                text-sm text-slate-200 placeholder-slate-600 focus:outline-none
                focus:border-violet-500 text-center [appearance:textfield]
                [&::-webkit-inner-spin-button]:appearance-none"
            />
            <button
              onClick={handleCustomStart}
              disabled={!customMin || parseInt(customMin) <= 0}
              className="px-4 py-2.5 rounded-xl text-sm font-semibold
                bg-violet-600 hover:bg-violet-500 text-white
                disabled:opacity-30 transition-colors"
            >
              Start
            </button>
          </div>

          <button
            onClick={() => setMode('break')}
            className="text-xs text-slate-600 hover:text-slate-400 transition-colors"
          >
            ← Back
          </button>
        </div>
      )}
    </div>
  );
}
