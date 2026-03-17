/**
 * StageNode
 *
 * SVG `<g>` group that renders a single circular pipeline stage node.
 * Uses M3 CSS custom properties for theme-aware colors.
 *
 * Visual layers (outside in):
 *   1. Glow filter (defs)
 *   2. Outer ring  -- dashed when idle, solid + spinning when active
 *   3. Inner ring  -- thinner, counter-rotates when active
 *   4. Fill circle -- very low opacity state color
 *   5. Counter text (Orbitron, large)
 *   6. Label text  (Orbitron, uppercase)
 *   7. Secondary counter badge (errors/warnings)
 *   8. Completion checkmark
 *
 * Color mapping:
 *   - Active: M3 primary
 *   - Complete: #10b981 (semantic emerald)
 *   - Error: M3 error
 *   - Idle: M3 outline-variant / surface-container
 */

import { useRef, useEffect, useState } from 'react';
import type { PipelineStage } from '../types';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface StageNodeProps {
  stage: PipelineStage;
  status: 'idle' | 'active' | 'complete' | 'error';
  counter: number;
  secondaryCounter?: number;
  label: string;
  x: number;
  y: number;
  radius?: number;
}

// ---------------------------------------------------------------------------
// Color helper -- M3 theme-aware
// ---------------------------------------------------------------------------

interface StatusColors {
  stroke: string;
  fill: string;
  text: string;
  glow: string;
}

function getStageColors(status: string): StatusColors {
  switch (status) {
    case 'active':
      return {
        stroke: 'rgb(var(--md-sys-color-primary))',
        fill: 'rgb(var(--md-sys-color-primary) / 0.08)',
        text: 'rgb(var(--md-sys-color-primary))',
        glow: 'rgb(var(--md-sys-color-primary))',
      };
    case 'complete':
      return {
        stroke: '#10b981',
        fill: 'rgba(16, 185, 129, 0.08)',
        text: '#10b981',
        glow: '#10b981',
      };
    case 'error':
      return {
        stroke: 'rgb(var(--md-sys-color-error))',
        fill: 'rgb(var(--md-sys-color-error) / 0.08)',
        text: 'rgb(var(--md-sys-color-error))',
        glow: 'rgb(var(--md-sys-color-error))',
      };
    case 'idle':
    default:
      return {
        stroke: 'rgb(var(--md-sys-color-outline-variant))',
        fill: 'rgb(var(--md-sys-color-surface-container))',
        text: 'rgb(var(--md-sys-color-on-surface-variant))',
        glow: 'transparent',
      };
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function StageNode({
  stage,
  status,
  counter,
  secondaryCounter,
  label,
  x,
  y,
  radius = 56,
}: StageNodeProps) {
  const colors = getStageColors(status);
  const filterId = `glow-${stage}`;

  // Track counter changes for the scale-pulse effect
  const prevCounter = useRef(counter);
  const [pulse, setPulse] = useState(false);

  useEffect(() => {
    if (counter !== prevCounter.current) {
      prevCounter.current = counter;
      setPulse(true);
      const t = setTimeout(() => setPulse(false), 300);
      return () => clearTimeout(t);
    }
  }, [counter]);

  const isActive = status === 'active';
  const isComplete = status === 'complete';
  const showSecondary = (secondaryCounter ?? 0) > 0;

  return (
    <g>
      {/* ---- Defs: glow filter ---- */}
      <defs>
        <filter id={filterId} x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="10" result="blur" />
          <feFlood floodColor={colors.glow} floodOpacity="0.35" />
          <feComposite in2="blur" operator="in" />
          <feMerge>
            <feMergeNode />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* ---- Ambient glow circle (behind everything) ---- */}
      {isActive && (
        <circle
          cx={x}
          cy={y}
          r={radius + 12}
          fill="none"
          stroke={colors.glow}
          strokeWidth={1}
          opacity={0.15}
          className="animate-glow-pulse"
        />
      )}

      {/* ---- Outer ring ---- */}
      <circle
        cx={x}
        cy={y}
        r={radius}
        fill="none"
        stroke={colors.stroke}
        strokeWidth={3}
        strokeDasharray={status === 'idle' ? '8 6' : 'none'}
        filter={isActive ? `url(#${filterId})` : undefined}
        style={{
          transformOrigin: `${x}px ${y}px`,
          animation: isActive ? 'nodeSpin 3s linear infinite' : undefined,
        }}
        className="transition-[stroke] duration-500"
      />

      {/* ---- Inner ring (counter-rotates when active) ---- */}
      <circle
        cx={x}
        cy={y}
        r={radius - 10}
        fill="none"
        stroke={colors.stroke}
        strokeWidth={2}
        strokeDasharray={status === 'idle' ? '6 5' : 'none'}
        style={{
          transformOrigin: `${x}px ${y}px`,
          animation: isActive ? 'nodeSpin 3s linear infinite reverse' : undefined,
        }}
        className="transition-[stroke] duration-500"
      />

      {/* ---- Fill circle ---- */}
      <circle
        cx={x}
        cy={y}
        r={radius - 15}
        fill={colors.fill}
        className="transition-[fill] duration-500"
      />

      {/* ---- Counter text ---- */}
      <text
        x={x}
        y={y - 6}
        textAnchor="middle"
        dominantBaseline="central"
        style={{
          fontFamily: "'Orbitron', sans-serif",
          fontSize: 22,
          fontWeight: 700,
          fill: 'rgb(var(--md-sys-color-on-surface))',
          transform: pulse ? 'scale(1.15)' : 'scale(1)',
          transformOrigin: `${x}px ${y - 6}px`,
          transition: 'transform 300ms cubic-bezier(0.05, 0.7, 0.1, 1.0)',
        }}
      >
        {counter.toLocaleString()}
      </text>

      {/* ---- Label text ---- */}
      <text
        x={x}
        y={y + 18}
        textAnchor="middle"
        dominantBaseline="central"
        style={{
          fontFamily: "'Orbitron', sans-serif",
          fontSize: 10,
          fontWeight: 500,
          letterSpacing: '0.18em',
          textTransform: 'uppercase' as const,
          fill: 'rgb(var(--md-sys-color-on-surface-variant))',
        }}
      >
        {label}
      </text>

      {/* ---- Secondary counter badge (errors / warnings) ---- */}
      {showSecondary && !isComplete && (
        <g>
          <circle
            cx={x + radius - 10}
            cy={y - radius + 10}
            r={12}
            fill="rgb(var(--md-sys-color-error))"
          />
          <text
            x={x + radius - 10}
            y={y - radius + 10}
            textAnchor="middle"
            dominantBaseline="central"
            style={{
              fontFamily: "'Orbitron', sans-serif",
              fontSize: 10,
              fontWeight: 700,
              fill: '#ffffff',
            }}
          >
            {secondaryCounter}
          </text>
        </g>
      )}

      {/* ---- Completion checkmark ---- */}
      {isComplete && (
        <g
          style={{
            opacity: 1,
            transition: 'opacity 400ms ease-in-out',
          }}
        >
          <circle
            cx={x + radius - 8}
            cy={y - radius + 8}
            r={12}
            fill="#10b981"
          />
          {/* Checkmark path */}
          <path
            d={`M${x + radius - 13} ${y - radius + 8} l4 4 6 -6`}
            fill="none"
            stroke="#ffffff"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
      )}
    </g>
  );
}
