import React from 'react';
import { StatusBadge } from '../../StatusBadge';
import { parseDetectionStatus } from '../../../lib/detectionStatus';

interface LibraryStatusBadgeProps {
  status?: string | null;
  className?: string;
}

/**
 * The lifecycle stage of a library rule offered as coverage. Every stage is
 * surfaced -- Draft through Production -- so the badge is how a reader tells a
 * deployed rule from an untested one.
 *
 * A status outside the enum is shown verbatim in the neutral pill rather than
 * mapped to the nearest stage.
 */
export const LibraryStatusBadge: React.FC<LibraryStatusBadgeProps> = ({ status, className = '' }) => {
  if (!status) return null;
  const parsed = parseDetectionStatus(status);
  if (parsed) return <StatusBadge status={parsed} size="xs" className={`flex-shrink-0 ${className}`} />;
  return (
    <span
      className={`inline-flex items-center h-4 px-2 text-[9px] rounded-full bg-surface-container-high border border-outline-variant/40 font-bold uppercase tracking-wider text-on-surface-variant flex-shrink-0 ${className}`}
    >
      {status}
    </span>
  );
};
