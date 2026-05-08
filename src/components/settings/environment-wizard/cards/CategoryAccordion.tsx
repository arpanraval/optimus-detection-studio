import React, { useState } from 'react';
import { Icon } from '../../../Icon';

interface CategoryAccordionProps {
  /** @deprecated Icon is no longer rendered; kept for caller compatibility. */
  icon?: string;
  title: string;
  selectedCount: number;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

export const CategoryAccordion: React.FC<CategoryAccordionProps> = ({
  title,
  selectedCount,
  children,
  defaultOpen = false,
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="rounded-xl border border-outline-variant/40 bg-surface-container-low overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-surface-container/50 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <span className="text-sm font-medium text-on-surface">{title}</span>
          {selectedCount > 0 && (
            <span className="text-[10px] px-2 py-0.5 rounded-md bg-primary text-on-primary font-medium">
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
        <div className="px-4 pb-4 pt-1 border-t border-outline-variant/20">
          {children}
        </div>
      )}
    </div>
  );
};
