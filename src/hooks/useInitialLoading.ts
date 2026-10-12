import { useEffect, useState } from 'react';

/** A mounted resource keeps its content during refetch. Route identity resets remain explicit. */
export function useInitialLoading(loading: boolean): boolean {
  const [settled, setSettled] = useState(!loading);
  useEffect(() => {
    if (!loading) setSettled(true);
  }, [loading]);
  return loading && !settled;
}
