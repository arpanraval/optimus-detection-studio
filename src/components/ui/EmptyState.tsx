import React from 'react';
import { Icon } from '../Icon';

export interface EmptyStateProps {
  /** Icon name from Icon component */
  icon?: string;
  /** Main heading */
  title: string;
  /** Description text */
  description?: string;
  /** Optional action button */
  action?: {
    label: string;
    onClick: () => void;
    icon?: string;
  };
  /** Optional secondary action */
  secondaryAction?: {
    label: string;
    onClick: () => void;
  };
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
  /** Additional className */
  className?: string;
}

/**
 * Shared Empty State Component
 *
 * Consistent empty state display across all views.
 * Replaces ad-hoc "No items" text and inconsistent empty UIs.
 *
 * @example
 * <EmptyState
 *   icon="library"
 *   title="No detections yet"
 *   description="Create your first detection to get started."
 *   action={{ label: "New Detection", onClick: handleNew, icon: "plus" }}
 * />
 */
export const EmptyState: React.FC<EmptyStateProps> = ({
  icon = 'inbox',
  title,
  description,
  action,
  secondaryAction,
  size = 'md',
  className = '',
}) => {
  const sizeConfig = {
    sm: {
      container: 'py-8',
      iconWrapper: 'w-10 h-10',
      icon: 'w-5 h-5',
      title: 'text-sm font-semibold',
      description: 'text-xs',
      button: 'px-3 py-1.5 text-xs',
    },
    md: {
      container: 'py-16',
      iconWrapper: 'w-14 h-14',
      icon: 'w-7 h-7',
      title: 'text-base font-semibold',
      description: 'text-sm',
      button: 'px-4 py-2 text-sm',
    },
    lg: {
      container: 'py-24',
      iconWrapper: 'w-16 h-16',
      icon: 'w-8 h-8',
      title: 'text-lg font-semibold',
      description: 'text-sm',
      button: 'px-5 py-2.5 text-sm',
    },
  };

  const s = sizeConfig[size];

  return (
    <div className={`flex flex-col items-center justify-center text-center ${s.container} ${className}`}>
      <div className={`${s.iconWrapper} rounded-2xl bg-surface-container-highest/50 flex items-center justify-center mb-4`}>
        <Icon name={icon} className={`${s.icon} text-on-surface-variant/50`} />
      </div>

      <h3 className={`${s.title} text-on-surface mb-1`}>{title}</h3>

      {description && (
        <p className={`${s.description} text-on-surface-variant/60 max-w-sm mt-1`}>
          {description}
        </p>
      )}

      {(action || secondaryAction) && (
        <div className="flex items-center gap-3 mt-5">
          {action && (
            <button
              onClick={action.onClick}
              className={`${s.button} font-medium rounded-xl bg-primary text-on-primary hover:bg-primary/90 transition-colors inline-flex items-center gap-2`}
            >
              {action.icon && <Icon name={action.icon} className="w-4 h-4" />}
              {action.label}
            </button>
          )}
          {secondaryAction && (
            <button
              onClick={secondaryAction.onClick}
              className={`${s.button} font-medium rounded-xl text-on-surface-variant hover:bg-surface-container-high transition-colors`}
            >
              {secondaryAction.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
};
