/**
 * StreamLine
 *
 * Animated SVG stream line connecting pipeline stages on the onboarding
 * canvas. Renders a background "pipe" path and a foreground "flow" path with
 * state-driven styling and animation.
 *
 * Uses M3 CSS custom properties for theme-aware colors.
 * The `color` prop may be a CSS variable string like
 * `'rgb(var(--md-sys-color-primary))'` -- this works in SVG attributes
 * in modern browsers.
 *
 * Color mapping:
 *   - Active accent: M3 primary (via color prop)
 *   - Complete: #4D7C6F (brand sage, via color prop)
 *   - Error: M3 error
 *   - Idle: M3 outline-variant
 *
 * States: idle | active | complete | error | paused
 */

import { useMemo } from 'react';

interface StreamLineProps {
  id: string;
  pathData: string;
  status: 'idle' | 'active' | 'complete' | 'error' | 'paused';
  color: string;
}

// ---------------------------------------------------------------------------
// State-based style derivation (M3 theme-aware)
// ---------------------------------------------------------------------------

interface PathStyles {
  bgStroke: string;
  bgStrokeWidth: number;
  bgOpacity: number;
  fgStroke: string;
  fgStrokeWidth: number;
  fgOpacity: number;
  dashArray: string | undefined;
  animationClass: string;
  filter: string | undefined;
}

function deriveStyles(status: StreamLineProps['status'], color: string, id: string): PathStyles {
  switch (status) {
    case 'idle':
      return {
        bgStroke: 'rgb(var(--md-sys-color-outline-variant) / 0.3)',
        bgStrokeWidth: 5,
        bgOpacity: 1,
        fgStroke: 'rgb(var(--md-sys-color-outline-variant) / 0.4)',
        fgStrokeWidth: 1,
        fgOpacity: 1,
        dashArray: '8 10',
        animationClass: '',
        filter: undefined,
      };

    case 'active':
      return {
        bgStroke: color,
        bgStrokeWidth: 5,
        bgOpacity: 0.15,
        fgStroke: `url(#stream-gradient-${id})`,
        fgStrokeWidth: 3,
        fgOpacity: 1,
        dashArray: '14 8',
        animationClass: 'animate-stream-flow',
        filter: `drop-shadow(0 0 6px ${color})`,
      };

    case 'complete':
      return {
        bgStroke: color,
        bgStrokeWidth: 5,
        bgOpacity: 0.2,
        fgStroke: color,
        fgStrokeWidth: 2,
        fgOpacity: 0.6,
        dashArray: undefined,
        animationClass: '',
        filter: undefined,
      };

    case 'error':
      return {
        bgStroke: 'rgb(var(--md-sys-color-error))',
        bgStrokeWidth: 5,
        bgOpacity: 0.1,
        fgStroke: 'rgb(var(--md-sys-color-error))',
        fgStrokeWidth: 2,
        fgOpacity: 0.5,
        dashArray: '4 4',
        animationClass: '',
        filter: undefined,
      };

    case 'paused':
      return {
        bgStroke: '#f59e0b',
        bgStrokeWidth: 5,
        bgOpacity: 0.1,
        fgStroke: '#f59e0b',
        fgStrokeWidth: 2,
        fgOpacity: 0.4,
        dashArray: '8 8',
        animationClass: 'animate-stream-flow-slow',
        filter: undefined,
      };
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function StreamLine({ id, pathData, status, color }: StreamLineProps) {
  const styles = useMemo(() => deriveStyles(status, color, id), [status, color, id]);

  return (
    <g>
      {/* Gradient definition for active state */}
      {status === 'active' && (
        <defs>
          <linearGradient id={`stream-gradient-${id}`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={color} />
            <stop offset="100%" stopColor={color} />
          </linearGradient>
        </defs>
      )}

      {/* Background pipe path */}
      <path
        d={pathData}
        fill="none"
        stroke={styles.bgStroke}
        strokeWidth={styles.bgStrokeWidth}
        strokeLinecap="round"
        opacity={styles.bgOpacity}
      />

      {/* Foreground flow path */}
      <path
        d={pathData}
        fill="none"
        stroke={styles.fgStroke}
        strokeWidth={styles.fgStrokeWidth}
        strokeLinecap="round"
        strokeDasharray={styles.dashArray}
        style={styles.filter ? { filter: styles.filter } : undefined}
        className={styles.animationClass || undefined}
        opacity={styles.fgOpacity}
      />
    </g>
  );
}
