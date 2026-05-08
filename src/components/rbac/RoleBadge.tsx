import React from 'react';
import { Role } from '../../types';

interface RoleBadgeProps {
  role: Role;
  size?: 'sm' | 'md';
  className?: string;
}

/**
 * Role badge with M3 expressive colors
 * Uses semantic color tokens for consistency
 */
export const RoleBadge: React.FC<RoleBadgeProps> = ({ 
  role, 
  size = 'sm',
  className = '' 
}) => {
  // M3 Expressive color scheme using semantic tokens
  const config: Record<Role, { label: string; className: string }> = {
    owner: {
      label: 'Owner',
      // Gold/Amber - prestigious, highest authority
      className: 'bg-amber-500/15 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300',
    },
    admin: {
      label: 'Admin',
      // Purple/Violet - administrative power
      className: 'bg-violet-500/15 text-violet-700 dark:bg-violet-400/15 dark:text-violet-300',
    },
    lead: {
      label: 'Lead',
      // Blue/Cyan - leadership, trust
      className: 'bg-cyan-500/15 text-cyan-700 dark:bg-cyan-400/15 dark:text-cyan-300',
    },
    analyst: {
      label: 'Analyst',
      // Green/Emerald - productive, active
      className: 'bg-emerald-500/15 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300',
    },
    viewer: {
      label: 'Viewer',
      // Gray/Slate - neutral, read-only
      className: 'bg-slate-500/15 text-slate-700 dark:bg-slate-400/15 dark:text-slate-300',
    },
  };

  const { label, className: colorClass } = config[role] || config.viewer;
  
  const sizeClasses = {
    sm: 'px-1.5 py-0.5 text-[10px] min-w-[52px]',
    md: 'px-2.5 py-1 text-[11px] min-w-[62px]',
  };

  return (
    <span
      className={`
        inline-flex items-center justify-center font-medium rounded-md
        ${sizeClasses[size]}
        ${colorClass}
        ${className}
      `}
    >
      {label}
    </span>
  );
};

export default RoleBadge;