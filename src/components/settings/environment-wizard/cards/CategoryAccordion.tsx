import React, { useState } from 'react';
import { Icon } from '../../../Icon';

interface CategoryAccordionProps {
  icon: string;
  title: string;
  selectedCount: number;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

export const CategoryAccordion: React.FC<CategoryAccordionProps> = ({
  icon,
  title,
  selectedCount,
  children,
  defaultOpen = false,
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="rounded-xl border border-outline-variant/20 overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-surface-container/50 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <Icon name={icon} className="w-4 h-4 text-on-surface-variant" />
          <span className="text-sm font-medium text-on-surface">{title}</span>
          {selectedCount > 0 && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
              {selectedCount} selected
            </span>
          )}
        </div>
        <Icon
          name="chevron-down"
          className={`w-4 h-4 text-on-surface-variant transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>
      {isOpen && (
        <div className="px-4 pb-4 pt-1">
          {children}
        </div>
      )}
    </div>
  );
};
