import React, { useState } from 'react';
import type { ProviderMeta } from '../../lib/providerMeta';
import { useTheme } from '../../context/ThemeContext';

interface IntegrationLogoProps {
  provider: ProviderMeta;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZE_MAP = {
  sm: { container: 'w-10 h-10 rounded-lg', img: 22, fallbackText: 'text-sm' },
  md: { container: 'w-12 h-12 rounded-xl', img: 28, fallbackText: 'text-base' },
  lg: { container: 'w-14 h-14 rounded-xl', img: 32, fallbackText: 'text-lg' },
};

export const IntegrationLogo: React.FC<IntegrationLogoProps> = ({
  provider,
  size = 'md',
  className = '',
}) => {
  const [imgError, setImgError] = useState(false);
  const { theme } = useTheme();
  const { container, img, fallbackText } = SIZE_MAP[size];

  // Use light-mode variant when available and theme is light
  const logoSrc = theme === 'light' && provider.logoPathLight
    ? provider.logoPathLight
    : provider.logoPath;

  return (
    <div
      className={`${container} bg-surface-container-high flex items-center justify-center flex-shrink-0 border border-outline-variant/15 overflow-hidden ${className}`}
    >
      {!imgError && logoSrc ? (
        <img
          src={logoSrc}
          alt={`${provider.name} logo`}
          width={img}
          height={img}
          className="object-contain"
          onError={() => setImgError(true)}
          loading="lazy"
        />
      ) : (
        <span
          className={`font-bold ${fallbackText}`}
          style={{ color: provider.brandColor }}
        >
          {provider.name.charAt(0)}
        </span>
      )}
    </div>
  );
};
