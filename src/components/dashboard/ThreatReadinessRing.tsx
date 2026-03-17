import React, { useEffect, useState } from 'react';
import { AnimatedNumber } from '../optimus/AnimatedNumber';

interface ThreatReadinessRingProps {
  coverageScore: number;    // 0-100
  productionScore: number;  // 0-100
  validationScore: number;  // 0-100
  qualityScore: number;     // 0-100
  readinessScore: number;   // 0-100 weighted aggregate
}

interface Segment {
  label: string;
  value: number;
  color: string;
  cssColor: string;
}

const SIZE = 280;
const STROKE_WIDTH = 18;
const RADIUS = (SIZE - STROKE_WIDTH) / 2 - 12; // padding for outer ring
const CIRCUMFERENCE = RADIUS * 2 * Math.PI;
const GAP = 8; // gap in pixels between segments
const SEGMENT_COUNT = 4;
const TOTAL_GAP = GAP * SEGMENT_COUNT;
const USABLE_CIRCUMFERENCE = CIRCUMFERENCE - TOTAL_GAP;

export const ThreatReadinessRing: React.FC<ThreatReadinessRingProps> = ({
  coverageScore,
  productionScore,
  validationScore,
  qualityScore,
  readinessScore,
}) => {
  const [animated, setAnimated] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setAnimated(true), 100);
    return () => clearTimeout(timer);
  }, []);

  const segments: Segment[] = [
    { label: 'Coverage', value: coverageScore, color: 'rgb(var(--md-sys-color-primary))', cssColor: 'text-primary' },
    { label: 'Production', value: productionScore, color: '#10b981', cssColor: 'text-emerald-500' },
    { label: 'Validation', value: validationScore, color: 'rgb(var(--md-sys-color-secondary))', cssColor: 'text-secondary' },
    { label: 'Quality', value: qualityScore, color: 'rgb(var(--md-sys-color-tertiary))', cssColor: 'text-tertiary' },
  ];

  // Each segment gets a proportional share of the ring based on its value
  const totalValue = segments.reduce((sum, s) => sum + s.value, 0) || 1;
  let currentOffset = 0;

  return (
    <div className="flex flex-col items-center gap-6">
      {/* Ring SVG */}
      <div className="relative" style={{ width: SIZE, height: SIZE }}>
        <svg width={SIZE} height={SIZE} className="transform -rotate-90">
          {/* Track ring */}
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke="rgb(var(--md-sys-color-surface-variant))"
            strokeWidth={STROKE_WIDTH}
            opacity="0.15"
          />

          {/* Colored arc segments */}
          {segments.map((segment, i) => {
            const segmentLength = (segment.value / totalValue) * USABLE_CIRCUMFERENCE;
            const dashArray = `${animated ? segmentLength : 0} ${CIRCUMFERENCE}`;
            const dashOffset = -(currentOffset + i * GAP);
            currentOffset += segmentLength;

            return (
              <circle
                key={segment.label}
                cx={SIZE / 2}
                cy={SIZE / 2}
                r={RADIUS}
                fill="none"
                stroke={segment.color}
                strokeWidth={STROKE_WIDTH}
                strokeLinecap="round"
                style={{
                  strokeDasharray: dashArray,
                  strokeDashoffset: dashOffset,
                  transition: 'stroke-dasharray 1.2s cubic-bezier(0.05, 0.7, 0.1, 1.0)',
                }}
              />
            );
          })}

          {/* Outer decorative dashed ring */}
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS + STROKE_WIDTH / 2 + 8}
            fill="none"
            stroke="rgb(var(--md-sys-color-outline-variant))"
            strokeWidth="0.5"
            strokeDasharray="3 6"
            opacity="0.25"
            className="animate-pulse-slow"
          />
        </svg>

        {/* Center content */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <AnimatedNumber
            value={readinessScore}
            duration={1400}
            className="text-4xl font-brand font-bold text-on-surface"
          />
          <span className="text-[9px] font-brand text-on-surface-variant uppercase tracking-[0.2em] mt-1">
            Readiness
          </span>
        </div>
      </div>

      {/* 2x2 Legend grid */}
      <div className="grid grid-cols-2 gap-x-6 gap-y-2">
        {segments.map((segment) => (
          <div key={segment.label} className="flex items-center gap-2">
            <div
              className="w-2.5 h-2.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: segment.color }}
            />
            <span className="text-xs text-on-surface-variant">
              {segment.label}
            </span>
            <span className={`text-xs font-bold font-mono ${segment.cssColor}`}>
              {segment.value}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};
