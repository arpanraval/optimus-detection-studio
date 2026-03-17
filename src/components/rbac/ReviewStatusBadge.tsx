import React from 'react';
import { ReviewStatus } from '../../types';

interface ReviewStatusBadgeProps {
  status: ReviewStatus;
  size?: 'sm' | 'md';
  className?: string;
}

/**
 * Minimal review status badge - subtle background with text only
 * Supports both dark and light themes
 */
export const ReviewStatusBadge: React.FC<ReviewStatusBadgeProps> = ({ 
  status, 
  size = 'sm',
  className = '' 
}) => {
  const config: Record<ReviewStatus, { label: string; className: string }> = {
    none: {
      label: 'No Review',
      className: 'bg-gray-500/10 text-gray-600 dark:text-gray-400',
    },
    requested: {
      label: 'Review Requested',
      className: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
    },
    in_review: {
      label: 'In Review',
      className: 'bg-blue-500/10 text-blue-700 dark:text-blue-400',
    },
    approved: {
      label: 'Approved',
      className: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
    },
    rejected: {
      label: 'Changes Requested',
      className: 'bg-red-500/10 text-red-700 dark:text-red-400',
    },
  };

  const { label, className: statusClassName } = config[status] || config.none;

  const sizeClasses = size === 'sm' 
    ? 'text-[10px] px-1.5 py-0.5' 
    : 'text-xs px-2 py-1';

  return (
    <span 
      className={`
        inline-flex items-center font-medium rounded-md
        ${sizeClasses}
        ${statusClassName}
        ${className}
      `.trim().replace(/\s+/g, ' ')}
    >
      {label}
    </span>
  );
};

export default ReviewStatusBadge;
