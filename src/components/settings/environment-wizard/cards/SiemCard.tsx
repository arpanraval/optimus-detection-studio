import React from 'react';
import { IntegrationLogo } from '../../../integrations/IntegrationLogo';
import { Icon } from '../../../Icon';
import type { ProviderMeta, DisplayStatus } from '../../../../lib/providerMeta';
import { STATUS_BADGE_CONFIG } from '../../../../lib/providerMeta';

interface SiemCardProps {
  providerMeta: ProviderMeta;
  selected: boolean;
  connectionStatus: DisplayStatus;
  onClick: () => void;
  index: number;
}

export const SiemCard: React.FC<SiemCardProps> = ({
  providerMeta,
  selected,
  connectionStatus,
  onClick,
  index,
}) => {
  const badge = STATUS_BADGE_CONFIG[connectionStatus];

  return (
    <button
      onClick={onClick}
      className={`relative text-left p-4 rounded-xl border transition-all duration-200 group
        ${selected
          ? 'ring-2 ring-primary bg-primary/5 border-primary/50'
          : 'border-outline-variant/20 hover:border-outline-variant/60 hover:scale-[1.02] hover:shadow-[0_4px_20px_rgba(0,0,0,0.15)]'
        }`}
      style={{
        animation: `slideUp 400ms cubic-bezier(0.05, 0.7, 0.1, 1.0) ${index * 40}ms both`,
      }}
    >
      {selected && (
        <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
          <Icon name="check" className="w-3 h-3 text-on-primary" />
        </div>
      )}
      <div className="flex items-center gap-3">
        <IntegrationLogo provider={providerMeta} size="lg" />
        <div className="min-w-0 flex-1">
          <div className={`text-sm font-medium ${selected ? 'text-on-surface' : 'text-on-surface-variant'}`}>
            {providerMeta.name}
          </div>
          {providerMeta.queryLanguages && providerMeta.queryLanguages.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {providerMeta.queryLanguages.map(lang => (
                <span
                  key={lang}
                  className="text-[10px] px-1.5 py-0.5 rounded bg-surface-container-high text-on-surface-variant"
                >
                  {lang}
                </span>
              ))}
            </div>
          )}
          <span className={`inline-block mt-1.5 text-[10px] px-2 py-0.5 rounded-full border ${badge.className}`}>
            {badge.label}
          </span>
        </div>
      </div>
    </button>
  );
};
