import React from 'react';
import { Icon } from '../Icon';

interface BoardSearchBarProps {
  value: string;
  onChange: (value: string) => void;
  resultCount: number;
  totalCount: number;
}

export const BoardSearchBar: React.FC<BoardSearchBarProps> = ({
  value,
  onChange,
  resultCount,
  totalCount,
}) => {
  const isFiltering = value.trim().length > 0;

  return (
    <div className="relative flex items-center">
      <div className="absolute left-2.5 pointer-events-none">
        <Icon name="search" className="w-3.5 h-3.5 text-on-surface-variant/50" />
      </div>
      <input
        data-board-search
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search board…"
        className="w-32 focus:w-48 transition-all bg-surface-container rounded-xl border border-outline-variant/20 px-3 py-1.5 pl-8 text-[11px] text-on-surface placeholder:text-on-surface-variant/40 outline-none focus:border-[#783264]/30 focus:ring-1 focus:ring-[#783264]/20"
      />
      {isFiltering && (
        <>
          <span className="ml-2 text-[11px] font-bold tabular-nums text-on-surface-variant whitespace-nowrap">
            {resultCount}/{totalCount}
          </span>
          <button
            onClick={() => onChange('')}
            className="ml-1 p-0.5 rounded-md hover:bg-surface-container-high transition-colors text-on-surface-variant/60 hover:text-on-surface-variant"
          >
            <Icon name="x" className="w-3.5 h-3.5" />
          </button>
        </>
      )}
    </div>
  );
};
