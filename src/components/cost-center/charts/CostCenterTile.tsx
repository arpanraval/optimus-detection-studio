import React from 'react';
import { Icon } from '../../Icon';

interface Props {
  title: string;
  icon?: string;
  action?: React.ReactNode;        // optional right-side action (e.g. small button)
  className?: string;
  children: React.ReactNode;
}

export const CostCenterTile: React.FC<Props> = ({ title, icon, action, className = '', children }) => (
  <div className={`flex flex-col bg-surface-container-lowest rounded-2xl overflow-hidden ${className}`}>
    <div className="flex items-center gap-2 px-3 pt-3 pb-2">
      {icon && <Icon name={icon} className="w-3.5 h-3.5 text-on-surface-variant/60" />}
      <span className="text-[13px] font-brand font-extrabold text-on-surface uppercase tracking-wider truncate flex-1">
        {title}
      </span>
      {action}
    </div>
    <div className="flex-1 min-h-0">{children}</div>
  </div>
);
