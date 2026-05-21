import React from 'react';
import { Icon } from '../../Icon';

interface InlineActionButtonProps {
  icon: string;
  label: string;
  onClick: () => void;
  variant?: 'default' | 'danger' | 'success';
  active?: boolean;
}

export const InlineActionButton: React.FC<InlineActionButtonProps> = ({
  icon, label, onClick, variant = 'default', active = false,
}) => {
  const variantStyles = {
    default: 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest',
    danger: 'text-on-surface-variant hover:text-error hover:bg-error/10',
    success: 'text-[#4D7C6F] hover:bg-[#4D7C6F]/10',
  };

  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      aria-label={label}
      title={label}
      className={`p-1 rounded transition-colors ${variantStyles[variant]} ${active ? 'bg-primary/10 text-primary' : ''}`}
    >
      <Icon name={icon} className="w-3.5 h-3.5" />
    </button>
  );
};
