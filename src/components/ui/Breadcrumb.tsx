import React from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../Icon';

export interface BreadcrumbItem {
  /** Display label */
  label: string;
  /** Route path (omit for current/last item) */
  href?: string;
  /** Optional icon */
  icon?: string;
}

export interface BreadcrumbProps {
  /** Ordered list of breadcrumb items */
  items: BreadcrumbItem[];
  /** Additional className */
  className?: string;
}

/**
 * Breadcrumb Navigation Component
 *
 * Provides hierarchical navigation for deep pages like
 * Detection Detail, Group Profile, Software Profile, etc.
 *
 * @example
 * <Breadcrumb items={[
 *   { label: "Detections", href: "/library" },
 *   { label: "Detection Library", href: "/library" },
 *   { label: "My Detection Rule" },
 * ]} />
 */
export const Breadcrumb: React.FC<BreadcrumbProps> = ({ items, className = '' }) => {
  if (items.length <= 1) return null;

  return (
    <nav aria-label="Breadcrumb" className={`flex items-center gap-1 text-sm ${className}`}>
      <ol className="flex items-center gap-1 list-none p-0 m-0">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;

          return (
            <li key={index} className="flex items-center gap-1">
              {index > 0 && (
                <Icon name="chevron-right" className="w-3.5 h-3.5 text-on-surface-variant/30 flex-shrink-0" />
              )}

              {isLast || !item.href ? (
                <span className={`flex items-center gap-1.5 ${
                  isLast
                    ? 'text-on-surface font-medium'
                    : 'text-on-surface-variant/60'
                }`}>
                  {item.icon && <Icon name={item.icon} className="w-3.5 h-3.5" />}
                  <span className="truncate max-w-[200px]">{item.label}</span>
                </span>
              ) : (
                <Link
                  to={item.href}
                  className="flex items-center gap-1.5 text-on-surface-variant/60 hover:text-on-surface transition-colors no-underline"
                >
                  {item.icon && <Icon name={item.icon} className="w-3.5 h-3.5" />}
                  <span className="truncate max-w-[200px]">{item.label}</span>
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
};
