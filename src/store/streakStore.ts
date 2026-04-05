const LS_KEY = 'wp_writing_streak';

function todayStr() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

function daysBefore(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

interface StreakData {
  dates: string[]; // YYYY-MM-DD strings, deduplicated
}

function load(): StreakData {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return { dates: [] };
}

function save(data: StreakData) {
  localStorage.setItem(LS_KEY, JSON.stringify(data));
}

function calcStreak(dates: string[]): { current: number; longest: number } {
  if (dates.length === 0) return { current: 0, longest: 0 };
  const set = new Set(dates);

  // Current streak — count backwards from today
  let current = 0;
  let i = 0;
  while (set.has(daysBefore(i))) {
    current++;
    i++;
  }

  // Longest streak
  const sorted = [...dates].sort();
  let longest = 0;
  let run = 1;
  for (let j = 1; j < sorted.length; j++) {
    const prev = new Date(sorted[j - 1]);
    const curr = new Date(sorted[j]);
    const diff = (curr.getTime() - prev.getTime()) / 86400000;
    if (diff === 1) {
      run++;
      longest = Math.max(longest, run);
    } else if (diff > 1) {
      run = 1;
    }
  }
  longest = Math.max(longest, run, current);
  return { current, longest };
}

// Simple reactive store
type Listener = () => void;
const listeners = new Set<Listener>();
let data = load();

export const streakStore = {
  recordToday() {
    const today = todayStr();
    if (!data.dates.includes(today)) {
      data = { dates: [...data.dates, today] };
      save(data);
      listeners.forEach((l) => l());
    }
  },
  getDates(): string[] { return data.dates; },
  getStats() { return calcStreak(data.dates); },
  subscribe(l: Listener) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};

import { useSyncExternalStore } from 'react';

export function useStreak() {
  const dates = useSyncExternalStore(
    streakStore.subscribe.bind(streakStore),
    streakStore.getDates.bind(streakStore)
  );
  return { dates, ...calcStreak(dates) };
}
