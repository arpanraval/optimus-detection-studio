import React from 'react';

interface WidgetEmptyStateProps {
  message?: string;
}

const WidgetEmptyState: React.FC<WidgetEmptyStateProps> = ({ message = 'No data available' }) => (
  <div className="flex items-center justify-center h-full min-h-[80px]">
    <p className="text-[12px] font-brand font-medium text-on-surface-variant/40 text-center">
      {message}
    </p>
  </div>
);

export default WidgetEmptyState;
