/**
 * Invisible component rendered once at the app root.
 * Polls the timer store and fires finishTimer() when the countdown hits zero.
 */
import { useEffect } from 'react';
import { useTimerStore } from '../../store/timerStore';

export function TimerController() {
  const isRunning = useTimerStore((s) => s.isRunning);
  const endTime = useTimerStore((s) => s.endTime);
  const finishTimer = useTimerStore((s) => s.finishTimer);

  useEffect(() => {
    if (!isRunning || !endTime) return;

    // Check immediately
    if (Date.now() >= endTime) {
      finishTimer();
      return;
    }

    const id = setInterval(() => {
      if (Date.now() >= endTime) {
        finishTimer();
        clearInterval(id);
      }
    }, 500);

    return () => clearInterval(id);
  }, [isRunning, endTime]);

  return null;
}
