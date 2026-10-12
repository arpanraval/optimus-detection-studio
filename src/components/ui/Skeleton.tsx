import React from 'react';

export type SkeletonVariant = 'text' | 'circular' | 'rectangular' | 'rounded';

export interface SkeletonProps {
  /** Shape variant */
  variant?: SkeletonVariant;
  /** Width - accepts Tailwind class or CSS value */
  width?: string;
  /** Height - accepts Tailwind class or CSS value */
  height?: string;
  /** Additional classes */
  className?: string;
  /** Number of repetitions (for lists) */
  count?: number;
  /** Gap between repetitions */
  gap?: string;
}

/**
 * Skeleton Loading Component
 *
 * Content-shaped loading placeholders for perceived performance.
 * Uses a shimmer animation that matches the design system.
 *
 * @example
 * // Single text line
 * <Skeleton variant="text" width="w-48" />
 *
 * // Multiple table rows
 * <Skeleton variant="rounded" height="h-12" count={5} />
 *
 * // Stat card
 * <Skeleton variant="rounded" width="w-full" height="h-32" />
 *
 * // Avatar
 * <Skeleton variant="circular" width="w-10" height="h-10" />
 */
export const Skeleton: React.FC<SkeletonProps> = ({
  variant = 'text',
  width,
  height,
  className = '',
  count = 1,
  gap = 'gap-3',
}) => {
  const variantClasses: Record<SkeletonVariant, string> = {
    text: 'rounded-md h-4',
    circular: 'rounded-full',
    rectangular: 'rounded-none',
    rounded: 'rounded-xl',
  };

  const baseClasses = `
    bg-on-surface/[0.08] dark:bg-on-surface/[0.06]
    loading-placeholder
    ${variantClasses[variant]}
    ${width || 'w-full'}
    ${height || (variant === 'text' ? 'h-4' : variant === 'circular' ? 'w-10 h-10' : 'h-20')}
    ${className}
  `;

  if (count <= 1) {
    return <div className={baseClasses} aria-hidden="true" />;
  }

  return (
    <div className={`flex flex-col ${gap} loading-placeholder-group`} aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className={baseClasses} />
      ))}
    </div>
  );
};

/**
 * Pre-built skeleton layouts for common page patterns
 */

/** Skeleton for a table row */
export const SkeletonTableRow: React.FC<{ columns?: number }> = ({ columns = 5 }) => (
  <div className="flex items-center gap-4 px-4 py-3 border-b border-outline-variant/10" aria-hidden="true">
    {Array.from({ length: columns }).map((_, i) => (
      <Skeleton
        key={i}
        variant="text"
        width={i === 0 ? 'w-48' : i === columns - 1 ? 'w-20' : 'w-32'}
        height="h-4"
      />
    ))}
  </div>
);

/** Skeleton for a stat card */
export const SkeletonStatCard: React.FC = () => (
  <div className="bg-surface-container rounded-2xl p-5 border border-outline-variant/10" aria-hidden="true">
    <Skeleton variant="text" width="w-24" height="h-3" className="mb-3" />
    <Skeleton variant="text" width="w-16" height="h-8" className="mb-2" />
    <Skeleton variant="text" width="w-32" height="h-3" />
  </div>
);

/** Skeleton for a detail page section */
export const SkeletonDetailSection: React.FC = () => (
  <div className="bg-surface-container rounded-2xl p-6 border border-outline-variant/10" aria-hidden="true">
    <Skeleton variant="text" width="w-40" height="h-5" className="mb-4" />
    <Skeleton variant="text" width="w-full" height="h-4" className="mb-2" />
    <Skeleton variant="text" width="w-3/4" height="h-4" className="mb-2" />
    <Skeleton variant="text" width="w-1/2" height="h-4" />
  </div>
);
