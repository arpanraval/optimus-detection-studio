import React from 'react';
import './brand.css';

interface BrandArtworkProps {
  variant?: 'mark' | 'lockup' | 'wordmark';
  className?: string;
  tone?: 'light' | 'dark';
  decorative?: boolean;
}

/** Approved outlined artwork; colours follow the app theme or a fixed surface tone. */
export const BrandArtwork: React.FC<BrandArtworkProps> = ({
  variant = 'mark',
  className = 'h-full w-full',
  tone,
  decorative = false,
}) =>
  variant === 'mark' ? (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 300 300"
      className={`brand-artwork ${className}`}
      data-brand-tone={tone}
      data-brand-artwork="mark"
      role={decorative ? undefined : 'img'}
      aria-label={decorative ? undefined : 'Optimus Detection Studio'}
      aria-hidden={decorative || undefined}
    >
      <image className="brand-artwork__light" href="/brand/point-field/mark-light.svg" width="300" height="300" />
      <image className="brand-artwork__dark" href="/brand/point-field/mark-dark.svg" width="300" height="300" />
    </svg>
  ) : (
    <span
      className={`brand-artwork ${className}`}
      data-brand-tone={tone}
      data-brand-artwork={variant}
      role={decorative ? undefined : 'img'}
      aria-label={decorative ? undefined : 'Optimus Detection Studio'}
      aria-hidden={decorative || undefined}
    >
      <img className="brand-artwork__light" src={`/brand/point-field/${variant}-light.svg`} alt="" />
      <img className="brand-artwork__dark" src={`/brand/point-field/${variant}-dark.svg`} alt="" />
    </span>
  );
