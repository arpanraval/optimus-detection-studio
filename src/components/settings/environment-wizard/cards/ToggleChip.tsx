import React from 'react';

interface ToggleChipProps {
  label: string;
  selected: boolean;
  onClick: () => void;
}

export const ToggleChip: React.FC<ToggleChipProps> = ({ label, selected, onClick }) => {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center rounded-full px-3.5 py-1.5 text-sm font-medium border transition-all duration-150
        ${selected
          ? 'bg-primary border-primary text-on-primary'
          : 'bg-surface-container-high border-outline-variant/40 text-on-surface hover:border-outline-variant hover:bg-surface-container-highest'
        }`}
    >
      {label}
    </button>
  );
};
