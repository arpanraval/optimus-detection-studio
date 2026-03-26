import React from 'react';

interface DetailCardProps {
  title: string;
  description?: string;
  headerRight?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export const DetailCard: React.FC<DetailCardProps> = ({ title, description, headerRight, children, className }) => (
  <section className={`rounded-2xl overflow-hidden mb-6 border border-outline-variant/30 bg-surface-container-low ${className || ''}`}>
    <div className="px-6 py-5 border-b border-outline-variant/30 bg-surface-container-low flex items-center justify-between">
      <div>
        <h3 className="text-base font-medium text-on-surface">{title}</h3>
        {description && (
          <p className="text-sm mt-0.5 text-on-surface-variant">{description}</p>
        )}
      </div>
      {headerRight}
    </div>
    <div className="p-6 space-y-5">
      {children}
    </div>
  </section>
);
