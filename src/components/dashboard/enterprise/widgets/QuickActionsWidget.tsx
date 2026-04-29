import React from 'react';
import type { WidgetComponentProps } from './types';

const QuickActionsWidget: React.FC<WidgetComponentProps> = ({ onNavigate }) => {
  const actions = [
    { label: 'New Detection', icon: '+', target: 'add_selection' },
    { label: 'Bulk Import', icon: '↓', target: 'bulk_import' },
    { label: 'MITRE Matrix', icon: '⬡', target: 'mitre' },
  ];

  return (
    <div className="flex flex-wrap gap-2 p-3 h-full items-center">
      {actions.map(a => (
        <button key={a.target} onClick={() => onNavigate(a.target)}
          className="flex items-center gap-1.5 px-4 py-2 rounded-full text-[12px] font-brand font-medium text-on-primary bg-primary hover:bg-primary/90 transition-colors tracking-wide">
          <span className="text-[14px]">{a.icon}</span>
          {a.label}
        </button>
      ))}
    </div>
  );
};

export default QuickActionsWidget;
