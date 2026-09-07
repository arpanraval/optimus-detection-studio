import React from 'react';
import { Icon } from '../../Icon';
import type { IconName } from '../../Icon';

interface Props {
  title: string;
  icon?: IconName;
  action?: React.ReactNode;        // optional right-side action (e.g. small button)
  className?: string;
  /** Stagger index for entrance delay (0..n). When omitted, no entrance animation. */
  index?: number;
  children: React.ReactNode;
}

export const CostCenterTile: React.FC<Props> = ({ title, icon, action, className = '', index, children }) => {
  const entrance =
    index != null
      ? { className: 'animate-slide-up', style: { animationDelay: `${index * 50}ms`, animationFillMode: 'backwards' as const } }
      : { className: '', style: undefined };

  return (
    <div
      className={`
        group flex flex-col h-full
        bg-surface-container-lowest rounded-2xl overflow-hidden
        border border-outline-variant/8
        transition-all duration-300 ease-emphasized
        hover:border-outline-variant/20 hover:shadow-md hover:shadow-black/5
        ${entrance.className} ${className}
      `}
      style={entrance.style}
    >
      <div className="flex items-center gap-2 px-3 pt-3 pb-2">
        {icon && (
          <Icon
            name={icon}
            className="w-3.5 h-3.5 text-on-surface-variant/60 transition-colors group-hover:text-on-surface-variant"
          />
        )}
        <span className="text-[13px] font-brand font-extrabold text-on-surface uppercase tracking-wider truncate flex-1">
          {title}
        </span>
        {action}
      </div>
      <div className="flex-1 min-h-0">{children}</div>
    </div>
  );
};
