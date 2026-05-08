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
  onConnectClick?: () => void;
  index: number;
}

export const SiemCard: React.FC<SiemCardProps> = ({
  providerMeta,
  selected,
  connectionStatus,
  onClick,
  onConnectClick,
  index,
}) => {
  const badge = STATUS_BADGE_CONFIG[connectionStatus];

  const primaryQueryLang = providerMeta.queryLanguages?.[0];
  const isConnected = connectionStatus === 'connected';
  const isComingSoon = connectionStatus === 'coming-soon';
  const dotClass = (() => {
    switch (connectionStatus) {
      case 'connected': return 'bg-[#4D7C6F]';
      case 'configured': return 'bg-amber-500';
      case 'error': return 'bg-[#A63D40]';
      case 'coming-soon': return 'bg-on-surface-variant/30';
      default: return 'bg-on-surface-variant/40';
    }
  })();

  const handleConnectClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onConnectClick?.();
  };

  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}
      className={`relative text-left px-4 py-3.5 rounded-xl border transition-all duration-150 cursor-pointer
        ${selected
          ? 'bg-surface-container-high border-primary ring-1 ring-primary'
          : 'bg-surface-container-low border-outline-variant/40 hover:border-outline-variant hover:bg-surface-container-high'
        }`}
      style={{
        animation: `slideUp 300ms cubic-bezier(0.05, 0.7, 0.1, 1.0) ${index * 30}ms both`,
      }}
    >
      <div className="flex items-center gap-3">
        <IntegrationLogo provider={providerMeta} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-on-surface truncate">
              {providerMeta.name}
            </span>
            <span
              className={`inline-block w-1.5 h-1.5 rounded-full flex-shrink-0 ${dotClass}`}
              title={badge.label}
            />
          </div>
          {primaryQueryLang && (
            <div className="text-[11px] text-on-surface-variant mt-0.5 truncate">
              {primaryQueryLang}
            </div>
          )}
        </div>
        {selected && (
          <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
            <Icon name="check" className="w-3 h-3 text-on-primary" />
          </div>
        )}
      </div>

      {onConnectClick && !isComingSoon && (
        <div className="mt-3 pt-3 border-t border-outline-variant/30 flex items-center justify-between">
          <span className="text-[11px] text-on-surface-variant">
            {isConnected ? 'Connected' : 'Not connected'}
          </span>
          <button
            type="button"
            onClick={handleConnectClick}
            className={`text-[11px] font-medium px-2.5 py-1 rounded-md transition-colors ${
              isConnected
                ? 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest'
                : 'text-primary hover:bg-primary/10'
            }`}
          >
            {isConnected ? 'Reconfigure' : 'Connect'}
          </button>
        </div>
      )}
    </div>
  );
};
