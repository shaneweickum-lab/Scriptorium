import { useCallback, useRef } from 'react';

export function useAutoSave<T>(
  saveFn: (value: T) => Promise<void>,
  delay: number = 500
) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const save = useCallback(
    (value: T) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        saveFn(value);
      }, delay);
    },
    [saveFn, delay]
  );

  const flush = useCallback(
    (value: T) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      return saveFn(value);
    },
    [saveFn]
  );

  return { save, flush };
}
