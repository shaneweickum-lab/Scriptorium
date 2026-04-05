import { create } from 'zustand';

interface TimerState {
  /** Duration in seconds for the current/last timer */
  lastDuration: number | null;
  /** Timestamp (ms) when the timer will/did end */
  endTime: number | null;
  isRunning: boolean;
  isFinished: boolean;

  startTimer: (seconds: number) => void;
  stopTimer: () => void;
  /** Called internally when countdown hits zero */
  finishTimer: () => void;
  /** "Confirm" — close overlay, fully stop */
  dismissBreak: () => void;
  /** "Break Over" — restart with same duration */
  restartTimer: () => void;
}

export const useTimerStore = create<TimerState>((set, get) => ({
  lastDuration: null,
  endTime: null,
  isRunning: false,
  isFinished: false,

  startTimer: (seconds) => {
    set({
      lastDuration: seconds,
      endTime: Date.now() + seconds * 1000,
      isRunning: true,
      isFinished: false,
    });
  },

  stopTimer: () => {
    set({ endTime: null, isRunning: false, isFinished: false });
  },

  finishTimer: () => {
    set({ isRunning: false, isFinished: true, endTime: null });
  },

  dismissBreak: () => {
    set({ isRunning: false, isFinished: false, endTime: null });
  },

  restartTimer: () => {
    const { lastDuration } = get();
    if (!lastDuration) return;
    set({
      endTime: Date.now() + lastDuration * 1000,
      isRunning: true,
      isFinished: false,
    });
  },
}));
