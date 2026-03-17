import React from 'react';
import { Icon } from '../../../Icon';

interface ToggleChipProps {
  label: string;
  selected: boolean;
  onClick: () => void;
}

export const ToggleChip: React.FC<ToggleChipProps> = ({ label, selected, onClick }) => {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm border transition-all duration-150
        ${selected
          ? 'bg-primary/10 border-primary/50 text-primary'
          : 'bg-surface-container border-outline-variant/20 text-on-surface-variant hover:bg-surface-container-high/50'
        }`}
    >
      {selected && <Icon name="check" className="w-3.5 h-3.5" />}
      {label}
    </button>
  );
};
