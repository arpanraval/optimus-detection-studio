import React, { useEffect, useRef, useState } from 'react';

/**
 * TurbineAssemblyLoader
 *
 * Blueprint → Build → Engine loading animation.
 *
 *   Phase 1 — BLUEPRINT:     Grid, crosshairs, construction circles, dimensions, labels
 *   Phase 2 — WIREFRAME:     Blade outlines fan in sequentially along angle guides
 *   Phase 3 — DISSOLVE:      Grid fades, annotations fade — blueprint starts breaking down
 *   Phase 4 — BUILD RINGS:   Outer ring solidifies (dashed → solid), then inner ring
 *   Phase 5 — BUILD BLADES:  Each blade fills one by one with visible stagger (~200ms each)
 *   Phase 6 — BUILD CORE:    Center core materializes, last blueprint traces vanish
 *   Phase 7 — ACTIVATE:      Turbine spools up
 *   Phase 8 — ONLINE:        Continuous rotation
 */

const BLADE_COUNT = 14;
const BLADE_ANGLE = 360 / BLADE_COUNT;
const BLADE_D = 'M12 12 L12 2 C13.5 2 14.5 3.5 14 5 L12 12 Z';

const CYAN = '#4a9eff';
const CYAN_DIM = '#4a9eff25';
const CYAN_MID = '#4a9eff50';
const MAGENTA = '#783264';
const BLUE = '#005091';

interface Props {
  variant?: 'dark' | 'light';
  size?: number;
  /** Skip the blueprint build sequence — start with engine already spinning */
  skipIntro?: boolean;
  /** Called when the full animation sequence completes (phase 8 — continuous spin) */
  onComplete?: () => void;
}

export const TurbineAssemblyLoader: React.FC<Props> = ({ variant = 'dark', size = 200, skipIntro = false, onComplete }) => {
  const isDark = variant === 'dark';
  const [phase, setPhase] = useState(skipIntro ? 8 : 0);
  const [builtBlades, setBuiltBlades] = useState(skipIntro ? BLADE_COUNT : 0);
  const timerRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const bp = isDark ? CYAN : '#2a6cb8';
  const bpDim = isDark ? CYAN_DIM : '#2a6cb820';
  const bpMid = isDark ? CYAN_MID : '#2a6cb850';

  const outerR = 11;
  const innerR = 9;
  const coreR = 3;
  const outerC = 2 * Math.PI * outerR;

  useEffect(() => {
    if (skipIntro) return; // already at phase 8 with all blades built

    const timers: ReturnType<typeof setTimeout>[] = [
      setTimeout(() => setPhase(1), 80),
      setTimeout(() => setPhase(2), 1800),
      setTimeout(() => setPhase(3), 3400),
      setTimeout(() => setPhase(4), 4400),
      setTimeout(() => setPhase(5), 5600),
    ];

    for (let i = 0; i < BLADE_COUNT; i++) {
      timers.push(setTimeout(() => setBuiltBlades(i + 1), 5600 + i * 200));
    }

    timers.push(
      setTimeout(() => setPhase(6), 8600),
      setTimeout(() => setPhase(7), 9600),
      setTimeout(() => { setPhase(8); onComplete?.(); }, 11600),
    );

    timerRef.current = timers;
    return () => timers.forEach(clearTimeout);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Status text
  const statusText =
    phase < 2 ? 'READING BLUEPRINT' :
    phase < 3 ? 'ANALYZING GEOMETRY' :
    phase < 4 ? 'DISSOLVING SCHEMATIC' :
    phase < 5 ? 'FORGING RINGS' :
    phase < 6 ? `BUILDING BLADE ${builtBlades}/${BLADE_COUNT}` :
    phase < 7 ? 'INSTALLING CORE' :
    phase < 8 ? 'SPOOLING UP' :
    'OPTIMUS ONLINE';

  // Convenience: is blueprint element still visible?
  const gridVisible = phase < 3;
  const annotationsVisible = phase < 4;
  const constructionCirclesVisible = phase < 5;
  const dimensionVisible = phase < 4;

  // Transition speeds per layer
  const gridTrans = 'opacity 1s ease';
  const annotTrans = 'opacity 0.8s ease';
  const ringBuildTrans = 'opacity 0.7s ease, stroke 0.7s ease, stroke-width 0.7s ease, stroke-dasharray 0.8s ease';

  return (
    <div className="relative flex flex-col items-center" style={{ width: size, height: size + 28 }}>
      <svg viewBox="-2 -2 28 28" width={size} height={size} className="overflow-visible">

        {/* ─── BLUEPRINT GRID ─── */}
        <g style={{ opacity: gridVisible ? 1 : 0, transition: gridTrans }}>
          {Array.from({ length: 25 }).map((_, i) => (
            <React.Fragment key={`g${i}`}>
              <line x1={i} y1={-2} x2={i} y2={26} stroke={bpDim} strokeWidth="0.08"
                style={{ opacity: phase >= 1 ? 1 : 0, transition: `opacity 0.3s ease ${i * 15}ms` }} />
              <line x1={-2} y1={i} x2={26} y2={i} stroke={bpDim} strokeWidth="0.08"
                style={{ opacity: phase >= 1 ? 1 : 0, transition: `opacity 0.3s ease ${i * 15}ms` }} />
            </React.Fragment>
          ))}
        </g>

        {/* ─── CROSSHAIRS ─── */}
        <g style={{ opacity: annotationsVisible ? 1 : 0, transition: annotTrans }}>
          <line x1="12" y1="-1.5" x2="12" y2="25.5" stroke={bpDim} strokeWidth="0.15"
            strokeDasharray="0.5 0.5"
            style={{ opacity: phase >= 1 ? 1 : 0, transition: 'opacity 0.4s ease 0.1s' }} />
          <line x1="-1.5" y1="12" x2="25.5" y2="12" stroke={bpDim} strokeWidth="0.15"
            strokeDasharray="0.5 0.5"
            style={{ opacity: phase >= 1 ? 1 : 0, transition: 'opacity 0.4s ease 0.2s' }} />
        </g>

        {/* ─── CONSTRUCTION CIRCLES (blueprint → solid rings) ─── */}

        {/* Outer ring: blueprint dashed → solid blue */}
        <circle cx="12" cy="12" r={outerR} fill="none"
          stroke={phase >= 4 ? BLUE : bp}
          strokeWidth={phase >= 4 ? 1.2 : 0.15}
          strokeDasharray={phase >= 4 ? 'none' : (phase >= 1 ? `${outerC}` : `0 ${outerC}`)}
          strokeDashoffset={phase >= 1 ? 0 : outerC}
          style={{
            transition: phase >= 4
              ? ringBuildTrans
              : 'stroke-dashoffset 1s cubic-bezier(0.65, 0, 0.35, 1) 0.3s',
            transformOrigin: '12px 12px',
          }}
        />

        {/* Inner ring: blueprint dashed → solid blue */}
        <circle cx="12" cy="12" r={innerR} fill="none"
          stroke={phase >= 4 ? `${BLUE}50` : bpMid}
          strokeWidth={phase >= 4 ? 0.5 : 0.12}
          strokeDasharray={phase >= 4 ? 'none' : '0.8 0.4'}
          style={{
            opacity: phase >= 1 ? 1 : 0,
            transition: phase >= 4
              ? `${ringBuildTrans} 0.4s`
              : 'opacity 0.5s ease 0.6s',
          }}
        />

        {/* Core circle: blueprint dashed → stays until phase 6 */}
        <circle cx="12" cy="12" r={coreR} fill="none"
          stroke={constructionCirclesVisible ? bpMid : 'transparent'}
          strokeWidth="0.12"
          strokeDasharray="0.4 0.3"
          style={{
            opacity: phase >= 1 && phase < 5 ? 1 : 0,
            transition: 'opacity 0.5s ease',
          }}
        />

        {/* ─── DIMENSION LINES & LABELS ─── */}
        <g style={{ opacity: dimensionVisible ? 1 : 0, transition: annotTrans }}>
          {/* Radius dimension */}
          <line x1="12" y1="12" x2="23" y2="12" stroke={bp} strokeWidth="0.1"
            style={{ opacity: phase >= 1 ? 0.5 : 0, transition: 'opacity 0.4s ease 1s' }} />
          <line x1="23" y1="11.5" x2="23" y2="12.5" stroke={bp} strokeWidth="0.1"
            style={{ opacity: phase >= 1 ? 0.5 : 0, transition: 'opacity 0.4s ease 1s' }} />
          <text x="18" y="11.3" fill={bp} fontSize="0.9" fontFamily="monospace"
            style={{ opacity: phase >= 1 ? 0.45 : 0, transition: 'opacity 0.4s ease 1.1s' }}
          >R=11</text>

          {/* Angle ticks */}
          {Array.from({ length: BLADE_COUNT }).map((_, i) => {
            const a = (i * BLADE_ANGLE - 90) * (Math.PI / 180);
            const x1 = 12 + Math.cos(a) * (outerR - 0.5);
            const y1 = 12 + Math.sin(a) * (outerR - 0.5);
            const x2 = 12 + Math.cos(a) * (outerR + 0.8);
            const y2 = 12 + Math.sin(a) * (outerR + 0.8);
            return (
              <line key={`t${i}`} x1={x1} y1={y1} x2={x2} y2={y2}
                stroke={bp} strokeWidth="0.12"
                style={{ opacity: phase >= 1 ? 0.5 : 0, transition: `opacity 0.3s ease ${1 + i * 0.03}s` }} />
            );
          })}

          {/* Angle arc */}
          <path
            d={`M ${12 + 5} ${12} A 5 5 0 0 1 ${12 + 5 * Math.cos(-BLADE_ANGLE * Math.PI / 180)} ${12 + 5 * Math.sin(-BLADE_ANGLE * Math.PI / 180)}`}
            fill="none" stroke={bp} strokeWidth="0.1"
            style={{ opacity: phase >= 1 ? 0.35 : 0, transition: 'opacity 0.4s ease 1.2s' }} />
          <text x="17.5" y="10" fill={bp} fontSize="0.7" fontFamily="monospace"
            style={{ opacity: phase >= 1 ? 0.35 : 0, transition: 'opacity 0.4s ease 1.3s' }}
          >25.7°</text>
        </g>

        {/* ─── CORNER ANNOTATIONS ─── */}
        <g style={{ opacity: annotationsVisible ? 1 : 0, transition: 'opacity 1.2s ease' }}>
          <text x="-1" y="0.5" fill={bp} fontSize="0.65" fontFamily="monospace"
            style={{ opacity: phase >= 1 ? 0.3 : 0, transition: 'opacity 0.4s ease 0.5s' }}
          >OPTIMUS-T14</text>
          <text x="-1" y="1.5" fill={bp} fontSize="0.5" fontFamily="monospace"
            style={{ opacity: phase >= 1 ? 0.25 : 0, transition: 'opacity 0.4s ease 0.7s' }}
          >TURBINE ASSEMBLY</text>
          <text x="18" y="25" fill={bp} fontSize="0.5" fontFamily="monospace" textAnchor="end"
            style={{ opacity: phase >= 1 ? 0.25 : 0, transition: 'opacity 0.4s ease 0.9s' }}
          >14 BLADES / 25.7° PITCH</text>

          {/* Corner brackets */}
          <path d="M -1.5 -1.5 L -1.5 0.5 M -1.5 -1.5 L 0.5 -1.5" fill="none" stroke={bp} strokeWidth="0.15"
            style={{ opacity: phase >= 1 ? 0.3 : 0, transition: 'opacity 0.3s ease 0.3s' }} />
          <path d="M 25.5 -1.5 L 23.5 -1.5 M 25.5 -1.5 L 25.5 0.5" fill="none" stroke={bp} strokeWidth="0.15"
            style={{ opacity: phase >= 1 ? 0.3 : 0, transition: 'opacity 0.3s ease 0.4s' }} />
          <path d="M -1.5 25.5 L -1.5 23.5 M -1.5 25.5 L 0.5 25.5" fill="none" stroke={bp} strokeWidth="0.15"
            style={{ opacity: phase >= 1 ? 0.3 : 0, transition: 'opacity 0.3s ease 0.5s' }} />
          <path d="M 25.5 25.5 L 23.5 25.5 M 25.5 25.5 L 25.5 23.5" fill="none" stroke={bp} strokeWidth="0.15"
            style={{ opacity: phase >= 1 ? 0.3 : 0, transition: 'opacity 0.3s ease 0.6s' }} />
        </g>

        {/* ─── BLADES (wireframe → individual fill) ─── */}
        <g
          style={{
            transformOrigin: '12px 12px',
            animation: phase >= 8
              ? 'turbineContinuous 0.8s linear infinite'
              : phase >= 7
                ? 'turbineSpinUp 2s cubic-bezier(0.22, 1, 0.36, 1) forwards'
                : 'none',
          }}
        >
          {Array.from({ length: BLADE_COUNT }).map((_, i) => {
            const wireDelay = i * 90;
            const wireVisible = phase >= 2;
            const thisBladeBuilt = builtBlades > i;
            // During build, show a brief flash/highlight on the blade being built
            const isBuilding = builtBlades === i + 1 && phase === 5;

            return (
              <g key={i} transform={`rotate(${i * BLADE_ANGLE} 12 12)`}>
                {/* Blueprint wireframe */}
                <path
                  d={BLADE_D}
                  fill="none"
                  stroke={bp}
                  strokeWidth="0.25"
                  strokeLinejoin="round"
                  style={{
                    opacity: wireVisible && !thisBladeBuilt ? 0.7 : 0,
                    transition: thisBladeBuilt
                      ? 'opacity 0.15s ease'
                      : `opacity 0.3s ease ${wireDelay}ms`,
                  }}
                />
                {/* Build flash — brief bright outline when this blade is being forged */}
                <path
                  d={BLADE_D}
                  fill="none"
                  stroke={isDark ? '#ffffff' : MAGENTA}
                  strokeWidth="0.5"
                  strokeLinejoin="round"
                  style={{
                    opacity: isBuilding ? 0.6 : 0,
                    transition: 'opacity 0.1s ease',
                  }}
                />
                {/* Filled blade */}
                <path
                  d={BLADE_D}
                  fill={MAGENTA}
                  stroke="none"
                  style={{
                    opacity: thisBladeBuilt ? 0.85 : 0,
                    transition: 'opacity 0.3s ease',
                  }}
                />
              </g>
            );
          })}
        </g>

        {/* ─── CENTER CORE (phase 6) ─── */}
        <circle cx="12" cy="12" r={coreR} fill={BLUE}
          style={{
            opacity: phase >= 6 ? 1 : 0,
            transition: 'opacity 0.8s ease',
          }}
        />
        <path d="M12 12 L12 9.5 A 2.5 2.5 0 0 1 14.5 12"
          stroke="rgba(255,255,255,0.35)" strokeWidth="0.4" fill="none"
          style={{
            opacity: phase >= 6 ? 1 : 0,
            transition: 'opacity 0.8s ease 0.3s',
          }}
        />

        {/* ─── ACTIVATION GLOW (phase 7+) ─── */}
        <circle cx="12" cy="12" r={outerR} fill="none"
          stroke={MAGENTA} strokeWidth="0.4"
          style={{
            opacity: phase >= 7 ? 1 : 0,
            animation: phase >= 7 ? 'bpRingPulse 2s ease-in-out infinite' : 'none',
          }}
        />
      </svg>

      {/* Status line */}
      <div className="flex items-center gap-1.5" style={{ opacity: phase >= 1 ? 1 : 0, transition: 'opacity 0.5s ease' }}>
        {/* Blinking cursor */}
        <span
          className="inline-block w-[3px] h-[10px]"
          style={{
            backgroundColor: phase >= 6
              ? (isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)')
              : (isDark ? `${CYAN}50` : '#2a6cb840'),
            animation: 'bpCursorBlink 0.8s step-end infinite',
            transition: 'background-color 0.8s ease',
          }}
        />
        <span
          className="text-[9px] font-mono tracking-[0.15em] uppercase select-none"
          style={{
            color: phase >= 6
              ? (isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.12)')
              : (isDark ? `${CYAN}60` : '#2a6cb860'),
            transition: 'color 0.8s ease',
          }}
        >
          {statusText}
        </span>
      </div>

      <style>{`
        @keyframes turbineSpinUp {
          0%   { transform: rotate(0deg); }
          100% { transform: rotate(2160deg); }
        }
        @keyframes turbineContinuous {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes bpRingPulse {
          0%, 100% { opacity: 0.15; stroke-width: 0.3; }
          50%      { opacity: 0.5; stroke-width: 0.7; }
        }
        @keyframes bpCursorBlink {
          0%, 100% { opacity: 1; }
          50%      { opacity: 0; }
        }
      `}</style>
    </div>
  );
};
