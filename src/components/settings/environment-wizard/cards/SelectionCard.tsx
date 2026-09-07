import React from 'react';
import { Icon } from '../../../Icon';
import type { IconName } from '../../../Icon';

interface SelectionCardProps {
  /** Optional leading icon. Omit when the icon would be redundant (e.g. all items the same). */
  icon?: IconName;
  title: string;
  description?: string;
  selected: boolean;
  onClick: () => void;
  index: number;
}

export const SelectionCard: React.FC<SelectionCardProps> = ({
  icon,
  title,
  description,
  selected,
  onClick,
  index,
}) => {
  return (
    <button
      onClick={onClick}
      className={`relative text-left px-3 py-2.5 rounded-lg border transition-all duration-150 group
        ${selected
          ? 'bg-primary border-primary text-on-primary'
          : 'bg-surface-container-low border-outline-variant/40 text-on-surface hover:border-outline-variant hover:bg-surface-container-high'
        }`}
      style={{
        animation: `slideUp 300ms cubic-bezier(0.05, 0.7, 0.1, 1.0) ${index * 25}ms both`,
      }}
    >
      <div className="flex items-center gap-2.5">
        {icon && (
          <Icon
            name={icon}
            className={`w-4 h-4 flex-shrink-0 ${selected ? 'text-on-primary' : 'text-on-surface-variant'}`}
          />
        )}
        <div className="min-w-0 flex-1">
          <div className={`text-sm font-medium truncate ${selected ? 'text-on-primary' : 'text-on-surface'}`}>
            {title}
          </div>
          {description && (
            <div className={`text-xs mt-0.5 line-clamp-1 ${selected ? 'text-on-primary/80' : 'text-on-surface-variant/70'}`}>
              {description}
            </div>
          )}
        </div>
        {selected && <Icon name="check" className="w-4 h-4 text-on-primary flex-shrink-0" />}
      </div>
    </button>
  );
};
