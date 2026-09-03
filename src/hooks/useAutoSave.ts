import { useCallback, useEffect, useRef } from 'react';

export function useAutoSave<T>(
  saveFn: (value: T) => Promise<void>,
  delay: number = 500
) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Snapshots the exact value + save function a pending debounce will use,
  // so an unmount before the timer fires can still flush it correctly.
  const pendingRef = useRef<{ value: T; fn: (value: T) => Promise<void> } | null>(null);

  const save = useCallback(
    (value: T) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      pendingRef.current = { value, fn: saveFn };
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        pendingRef.current = null;
        saveFn(value);
      }, delay);
    },
    [saveFn, delay]
  );

  const flush = useCallback(
    (value?: T) => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      const pending = pendingRef.current;
      pendingRef.current = null;
      if (value !== undefined) return saveFn(value);
      if (pending) return pending.fn(pending.value);
      return Promise.resolve();
    },
    [saveFn]
  );

  // Flush a pending debounced save when the component unmounts — e.g. the
  // user switches views or closes the book within the debounce window —
  // so the last edits aren't silently dropped.
  useEffect(() => {
    return () => {
      if (timerRef.current && pendingRef.current) {
        clearTimeout(timerRef.current);
        const { value, fn } = pendingRef.current;
        pendingRef.current = null;
        fn(value);
      }
    };
  }, []);

  return { save, flush };
}
