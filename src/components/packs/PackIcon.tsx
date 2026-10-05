import React from 'react';
import { PackGlyph } from './PackGlyph';
import { IntegrationLogo } from '../integrations/IntegrationLogo';
import { getProviderMeta } from '../../lib/providerMeta';
import type { IntegrationProvider } from '../../types';
interface PackIconProps {
  packId: string;
  packName: string;
  source?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  animate?: boolean;
  icon?: string | null;
  platforms?: string[];
}
export const PackIcon: React.FC<PackIconProps> = ({ packName, size = 'md', className = '', icon, platforms = [] }) => {
  const provider = platforms.map((platform) => getProviderMeta(platform as IntegrationProvider)).find(Boolean);
  if (provider && (!icon || icon === 'package' || icon === '📦')) {
    return <IntegrationLogo provider={provider} size={size === 'sm' ? 'sm' : 'md'} className={className} />;
  }
  return (
    <div
      title={packName}
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center rounded-xl border border-outline-variant/30 bg-surface-container text-on-surface-variant ${size === 'sm' ? 'h-10 w-10' : 'h-12 w-12'} ${className}`}
    >
      <PackGlyph value={icon} />
    </div>
  );
};
