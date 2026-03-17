import React from 'react';
import { Icon } from '../../../Icon';

interface SelectionCardProps {
  icon: string;
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
      className={`relative text-left p-4 rounded-xl border transition-all duration-200 group
        ${selected
          ? 'ring-2 ring-primary bg-primary/5 border-primary/50'
          : 'border-outline-variant/20 hover:border-outline-variant/60 hover:scale-[1.02] hover:shadow-[0_4px_20px_rgba(0,0,0,0.15)]'
        }`}
      style={{
        animation: `slideUp 400ms cubic-bezier(0.05, 0.7, 0.1, 1.0) ${index * 40}ms both`,
      }}
    >
      {selected && (
        <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
          <Icon name="check" className="w-3 h-3 text-on-primary" />
        </div>
      )}
      <div className="flex items-start gap-3">
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
          selected ? 'bg-primary/15' : 'bg-surface-container-high'
        }`}>
          <Icon name={icon} className={`w-5 h-5 ${selected ? 'text-primary' : 'text-on-surface-variant'}`} />
        </div>
        <div className="min-w-0">
          <div className={`text-sm font-medium ${selected ? 'text-on-surface' : 'text-on-surface-variant'}`}>
            {title}
          </div>
          {description && (
            <div className="text-xs text-on-surface-variant/70 mt-0.5 line-clamp-2">{description}</div>
          )}
        </div>
      </div>
    </button>
  );
};
