import { useState, useCallback } from 'react';

export const useLocalStorage = <T,>(key: string, defaultValue: T): [T, (value: T) => void] => {
  const [state, setState] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(key);
      return stored ? JSON.parse(stored) : defaultValue;
    } catch { return defaultValue; }
  });
  const setValue = useCallback((value: T) => {
    setState(value);
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* best-effort; ignore */ }
  }, [key]);
  return [state, setValue];
};
