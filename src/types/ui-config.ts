import type { TeamRole } from './rbac';
import type { ReviewStatus } from './detection';

// ============================================
// HELPER TYPES FOR UI COMPONENTS
// ============================================

/** Role badge display configuration */
export interface RoleBadgeConfig {
  label: string;
  color: string;
  bgColor: string;
  icon?: string;
}

/** Role badge configurations */
export const ROLE_BADGE_CONFIG: Record<TeamRole, RoleBadgeConfig> = {
  owner: {
    label: 'Owner',
    color: 'text-amber-700 dark:text-amber-400',
    bgColor: 'bg-amber-100 dark:bg-amber-900/30',
    icon: 'crown',
  },
  admin: {
    label: 'Admin',
    color: 'text-purple-700 dark:text-purple-400',
    bgColor: 'bg-purple-100 dark:bg-purple-900/30',
    icon: 'shield',
  },
  lead: {
    label: 'Lead',
    color: 'text-blue-700 dark:text-blue-400',
    bgColor: 'bg-blue-100 dark:bg-blue-900/30',
    icon: 'users',
  },
  analyst: {
    label: 'Analyst',
    color: 'text-green-700 dark:text-green-400',
    bgColor: 'bg-green-100 dark:bg-green-900/30',
    icon: 'search',
  },
  viewer: {
    label: 'Viewer',
    color: 'text-gray-700 dark:text-gray-400',
    bgColor: 'bg-gray-100 dark:bg-gray-900/30',
    icon: 'eye',
  },
};

/** Review status badge configuration */
export const REVIEW_STATUS_CONFIG: Record<ReviewStatus, { label: string; color: string; bgColor: string }> = {
  none: {
    label: 'No Review',
    color: 'text-gray-600 dark:text-gray-400',
    bgColor: 'bg-gray-100 dark:bg-gray-800',
  },
  requested: {
    label: 'Review Requested',
    color: 'text-amber-600 dark:text-amber-400',
    bgColor: 'bg-amber-100 dark:bg-amber-900/30',
  },
  in_review: {
    label: 'In Review',
    color: 'text-blue-600 dark:text-blue-400',
    bgColor: 'bg-blue-100 dark:bg-blue-900/30',
  },
  approved: {
    label: 'Approved',
    color: 'text-green-600 dark:text-green-400',
    bgColor: 'bg-green-100 dark:bg-green-900/30',
  },
  rejected: {
    label: 'Changes Requested',
    color: 'text-red-600 dark:text-red-400',
    bgColor: 'bg-red-100 dark:bg-red-900/30',
  },
};
