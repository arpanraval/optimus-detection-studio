import React, { useEffect, useState } from 'react';
import { Spinner } from './Spinner';

export function LoadingStatus({ label = 'Updating…', spinner = true }: { label?: string; spinner?: boolean }) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setSlow(true), 8000);
    return () => window.clearTimeout(timer);
  }, []);
  return (
    <span role="status" className="inline-flex items-center gap-2 text-sm text-on-surface-variant">
      {spinner && <Spinner />}
      {slow ? `${label} Taking longer than usual…` : label}
    </span>
  );
}
