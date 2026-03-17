import { useEffect, useRef } from 'react';

/**
 * Warns the user with a browser-native confirmation dialog when they attempt
 * to close the tab, refresh the page, or navigate away via the address bar
 * while there are unsaved changes.
 *
 * Uses a ref internally so the event listener is registered only once,
 * avoiding stale-closure and re-registration timing issues.
 *
 * @param shouldBlock - Whether the user should be warned before leaving.
 */
export function useBeforeUnload(shouldBlock: boolean): void {
  const shouldBlockRef = useRef(shouldBlock);
  shouldBlockRef.current = shouldBlock;

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (!shouldBlockRef.current) return;
      e.preventDefault();
      // Chrome requires returnValue to be set
      e.returnValue = '';
    };

    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);
}
