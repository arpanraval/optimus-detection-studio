import React, { useState } from 'react';

interface FilterSectionProps {
  title: string;
  defaultExpanded?: boolean;
  activeCount?: number;
  children: React.ReactNode;
}

export function FilterSection({
  title,
  defaultExpanded = false,
  activeCount = 0,
  children,
}: FilterSectionProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <div className="border-b border-outline-variant/15 last:border-b-0">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-3 py-2.5
                   hover:bg-surface-container-highest/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <svg
            viewBox="0 0 20 20"
            fill="currentColor"
            className={`w-3.5 h-3.5 text-on-surface-variant/60 transition-transform duration-200
                       ${expanded ? 'rotate-90' : ''}`}
          >
            <path
              fillRule="evenodd"
              d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
              clipRule="evenodd"
            />
          </svg>
          <span className="text-xs font-semibold text-on-surface">{title}</span>
        </div>
        {activeCount > 0 && (
          <span className="text-[10px] font-bold text-white bg-primary rounded-full
                         min-w-[18px] h-[18px] flex items-center justify-center px-1">
            {activeCount}
          </span>
        )}
      </button>
      {expanded && (
        <div className="pb-2">
          {children}
        </div>
      )}
    </div>
  );
}
