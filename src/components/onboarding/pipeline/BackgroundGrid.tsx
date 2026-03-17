/**
 * BackgroundGrid
 *
 * Full-screen canvas background with a subtle dot grid pattern and
 * phase-reactive radial glow. Uses M3 CSS custom properties for
 * theme-aware rendering in both light and dark modes.
 *
 * Visual layers:
 *   1. M3 surface-container-lowest base fill (via parent/className)
 *   2. Repeating dot grid via CSS background-image (inline SVG data URI)
 *   3. Radial gradient glow (primary accent, phase-dependent intensity)
 *   4. Subtle noise/grain overlay for texture
 */

import { useMemo } from 'react';
import type { OnboardingPhase } from '../types';

interface BackgroundGridProps {
  phase: OnboardingPhase;
}

// ---------------------------------------------------------------------------
// Dot grid SVG data URI
// We use a CSS variable reference approach -- since data URIs cannot
// reference CSS variables, we use a neutral gray dot that works with
// both themes via opacity control on the parent layer.
// ---------------------------------------------------------------------------

function buildDotGridDataUri(): string {
  const spacing = 32;
  const dotRadius = 0.6;

  // Use a neutral mid-tone dot; the parent layer's opacity controls visibility
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='${spacing}' height='${spacing}'>` +
    `<circle cx='${spacing / 2}' cy='${spacing / 2}' r='${dotRadius}' fill='rgba(128,128,128,0.35)'/>` +
    `</svg>`;

  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function BackgroundGrid({ phase }: BackgroundGridProps) {
  const dotBg = useMemo(() => buildDotGridDataUri(), []);

  // Phase-dependent glow intensity
  const glowOpacity = phase === 'processing' ? 0.12
    : phase === 'complete' ? 0.08
    : 0.05;

  const animationClass = phase === 'processing'
    ? 'animate-pulse'
    : phase === 'selection'
      ? 'animate-pulse-slow'
      : '';

  return (
    <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden bg-surface-container-lowest">
      {/* Dot grid layer */}
      <div
        className="absolute inset-0 opacity-40 dark:opacity-100"
        style={{ backgroundImage: dotBg }}
      />

      {/* Primary radial glow - brand primary accent from center */}
      <div
        className={`absolute inset-0 transition-opacity duration-700 motion-reduce:animate-none ${animationClass}`}
        style={{
          background: `radial-gradient(ellipse 60% 50% at 50% 50%, rgb(var(--md-sys-color-primary) / ${glowOpacity}) 0%, transparent 70%)`,
        }}
      />

      {/* Secondary warm glow bottom-left for depth */}
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(ellipse 40% 40% at 15% 80%, rgb(var(--md-sys-color-primary) / ${glowOpacity * 0.3}) 0%, transparent 70%)`,
        }}
      />

      {/* Subtle vignette using surface color */}
      <div
        className="absolute inset-0"
        style={{
          background: 'radial-gradient(ellipse at center, transparent 50%, rgb(var(--md-sys-color-surface-container-lowest) / 0.4) 100%)',
        }}
      />

      {/* Subtle grain texture overlay */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
          backgroundSize: '128px 128px',
        }}
      />
    </div>
  );
}
