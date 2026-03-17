import React, { useState } from 'react';
import { DesignSystemPage, Section, ComponentRow } from '../shared';
import { Icon } from '../../Icon';
import { TurbineAssemblyLoader } from '../../TurbineAssemblyLoader';

export const LoadingPage: React.FC = () => {
    const [turbineKey, setTurbineKey] = useState(0);

    return (
        <DesignSystemPage
            title="Loading States"
            description="Innovative and expressive loading indicators"
        >
            <Section title="Turbine Assembly Loader" description="App-level loading — the Optimus engine assembles from wireframe to full spinning turbine">

                <ComponentRow label="Turbine Assembly — Dark" description="Lines → skeleton → fill → spin-up. Click 'Replay' to restart.">
                    <div className="flex flex-col items-center gap-4">
                        <div className="bg-[#0a0a0a] rounded-2xl p-12 flex items-center justify-center">
                            <TurbineAssemblyLoader key={`dark-${turbineKey}`} variant="dark" size={200} />
                        </div>
                        <button onClick={() => setTurbineKey(k => k + 1)} className="text-xs text-[#783264] font-semibold hover:underline">Replay</button>
                    </div>
                </ComponentRow>

                <ComponentRow label="Turbine Assembly — Light" description="Same sequence on light background.">
                    <div className="flex flex-col items-center gap-4">
                        <div className="bg-[#f5f3f0] rounded-2xl p-12 flex items-center justify-center">
                            <TurbineAssemblyLoader key={`light-${turbineKey}`} variant="light" size={200} />
                        </div>
                        <button onClick={() => setTurbineKey(k => k + 1)} className="text-xs text-[#783264] font-semibold hover:underline">Replay</button>
                    </div>
                </ComponentRow>

                <ComponentRow label="Sizes" description="Scales to any size — 80px, 120px, 200px">
                    <div className="flex gap-10 items-end">
                        <div className="bg-[#0a0a0a] rounded-2xl p-6 flex items-center justify-center">
                            <TurbineAssemblyLoader key={`s80-${turbineKey}`} variant="dark" size={80} />
                        </div>
                        <div className="bg-[#0a0a0a] rounded-2xl p-8 flex items-center justify-center">
                            <TurbineAssemblyLoader key={`s120-${turbineKey}`} variant="dark" size={120} />
                        </div>
                        <div className="bg-[#0a0a0a] rounded-2xl p-10 flex items-center justify-center">
                            <TurbineAssemblyLoader key={`s200-${turbineKey}`} variant="dark" size={200} />
                        </div>
                    </div>
                </ComponentRow>

            </Section>

            <Section title="Other Loading States" description="Additional loading indicators">

                {/* DS Color Reference */}
                <div className="mb-6 p-4 bg-[#783264]/5 border border-[#783264]/20 rounded-xl">
                    <p className="text-xs font-medium text-[#783264] mb-2">DS Loading Color System:</p>
                    <div className="flex flex-wrap gap-3 text-[10px]">
                        <span className="px-2 py-1 rounded bg-[#783264]/10 text-[#783264]">Tertiary: #783264</span>
                        <span className="px-2 py-1 rounded bg-[#005091]/10 text-[#005091]">Primary: #005091</span>
                        <span className="px-2 py-1 rounded bg-[#4D7C6F]/10 text-[#4D7C6F]">Secondary: #4D7C6F</span>
                    </div>
                </div>

                <ComponentRow label="Orbital Loader (App Loader)" description="Main application loading animation with multi-ring orbital motion">
                    <div className="flex gap-12 items-center">
                        {/* Dark variant */}
                        <div className="flex flex-col items-center">
                            <div className="bg-[#0a0c0f] rounded-2xl p-8">
                                <div className="relative w-32 h-32">
                                    {/* Center breathing core - Tertiary */}
                                    <div
                                        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-[#783264]"
                                        style={{ animation: 'breathe 2s ease-in-out infinite' }}
                                    />
                                    {/* Inner orbit ring - Primary */}
                                    <div
                                        className="absolute inset-4 rounded-full border border-[#005091]/20"
                                        style={{ animation: 'orbit 3s linear infinite' }}
                                    >
                                        <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-[#005091]" />
                                    </div>
                                    {/* Middle orbit ring - Tertiary */}
                                    <div
                                        className="absolute inset-2 rounded-full border border-[#783264]/15"
                                        style={{ animation: 'orbitReverse 5s linear infinite' }}
                                    >
                                        <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-[#783264]/80" />
                                    </div>
                                    {/* Outer orbit ring - Secondary */}
                                    <div
                                        className="absolute inset-0 rounded-full border border-[#4D7C6F]/10"
                                        style={{ animation: 'orbit 8s linear infinite' }}
                                    >
                                        <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-[#4D7C6F]/70" />
                                    </div>
                                </div>
                            </div>
                            <span className="text-[10px] text-on-surface-variant mt-2">Dark Theme</span>
                        </div>

                        {/* Light variant preview */}
                        <div className="flex flex-col items-center">
                            <div className="bg-[#fafcff] rounded-2xl p-8 border border-outline-variant/30">
                                <div className="relative w-32 h-32">
                                    <div
                                        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-[#783264]"
                                        style={{ animation: 'breathe 2s ease-in-out infinite' }}
                                    />
                                    <div
                                        className="absolute inset-4 rounded-full border border-[#005091]/30"
                                        style={{ animation: 'orbit 3s linear infinite' }}
                                    >
                                        <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-[#005091]" />
                                    </div>
                                    <div
                                        className="absolute inset-2 rounded-full border border-[#783264]/20"
                                        style={{ animation: 'orbitReverse 5s linear infinite' }}
                                    >
                                        <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-[#783264]/80" />
                                    </div>
                                    <div
                                        className="absolute inset-0 rounded-full border border-[#4D7C6F]/15"
                                        style={{ animation: 'orbit 8s linear infinite' }}
                                    >
                                        <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-[#4D7C6F]/70" />
                                    </div>
                                </div>
                            </div>
                            <span className="text-[10px] text-on-surface-variant mt-2">Light Theme</span>
                        </div>
                    </div>
                </ComponentRow>

                {/* ============================================================ */}
                {/* NEW APP LOADER OPTIONS — MULTI-LAYER COMPOSITIONS          */}
                {/* ============================================================ */}

                {/* ====== Option A: Orbital Command ====== */}
                <ComponentRow label="Option A — Orbital Command" description="Central hex core with 3 tilted orbital rings rotating at different speeds/angles in 3D perspective. Sonar pulses emanate from center. Particle dots float in background. A true command-center aesthetic.">
                    <div className="w-full flex justify-center">
                        <div className="rounded-2xl overflow-hidden relative flex flex-col items-center justify-center" style={{ width: 700, height: 520, background: '#0a0c0f' }}>

                            {/* Layer 1: Background particle field */}
                            <div className="absolute inset-0" style={{ overflow: 'hidden' }}>
                                {Array.from({ length: 40 }).map((_, i) => {
                                    const x = ((i * 37 + 13) % 100);
                                    const y = ((i * 53 + 7) % 100);
                                    const size = (i % 3 === 0) ? 2 : 1;
                                    const delay = (i * 0.3) % 4;
                                    const color = i % 3 === 0 ? '#005091' : i % 3 === 1 ? '#783264' : '#4D7C6F';
                                    return <div key={i} className="absolute rounded-full" style={{
                                        left: `${x}%`, top: `${y}%`, width: size, height: size,
                                        backgroundColor: color,
                                        animation: `loaderBreathe ${3 + (i % 3)}s ease-in-out ${delay}s infinite`,
                                        opacity: 0.3,
                                    }} />;
                                })}
                                {/* Connecting lines between nearby particles */}
                                <svg className="absolute inset-0 w-full h-full" style={{ opacity: 0.04 }}>
                                    {[
                                        [13, 7, 50, 60], [37, 53, 74, 14], [87, 37, 50, 90],
                                        [24, 67, 61, 47], [11, 90, 48, 73], [74, 27, 98, 60],
                                        [37, 13, 11, 50], [61, 87, 87, 97], [24, 27, 48, 7],
                                    ].map(([x1, y1, x2, y2], i) => (
                                        <line key={i} x1={`${x1}%`} y1={`${y1}%`} x2={`${x2}%`} y2={`${y2}%`}
                                            stroke="#4D7C6F" strokeWidth="0.5" />
                                    ))}
                                </svg>
                            </div>

                            {/* Layer 2: Ambient radial glow */}
                            <div className="absolute" style={{
                                width: 500, height: 500, top: '50%', left: '50%',
                                transform: 'translate(-50%, -50%)',
                                background: 'radial-gradient(ellipse at center, rgba(0,80,145,0.1) 0%, rgba(120,50,100,0.03) 40%, transparent 70%)',
                                pointerEvents: 'none',
                            }} />

                            {/* Layer 3: Sonar pulse rings */}
                            <div className="absolute" style={{ top: '50%', left: '50%', transform: 'translate(-50%, -55%)' }}>
                                {[0, 1, 2].map(i => (
                                    <div key={i} className="absolute rounded-full" style={{
                                        width: 200, height: 200, top: -100, left: -100,
                                        border: '1px solid rgba(0,80,145,0.15)',
                                        animation: `loaderSonarPulse 3s ease-out ${i * 1}s infinite`,
                                    }} />
                                ))}
                            </div>

                            {/* Layer 4: 3D Orbital rings */}
                            <div className="relative" style={{ width: 260, height: 260, perspective: '600px', perspectiveOrigin: 'center' }}>
                                {/* Ring 1 — Primary blue, fast */}
                                <div className="absolute inset-0 flex items-center justify-center" style={{
                                    transformStyle: 'preserve-3d',
                                    animation: 'orbitTilt1 6s linear infinite',
                                }}>
                                    <div className="absolute" style={{
                                        width: 240, height: 240,
                                        borderRadius: '50%',
                                        border: '1.5px solid rgba(0,80,145,0.25)',
                                    }}>
                                        {/* Orbiting dot */}
                                        <div className="absolute" style={{
                                            width: 6, height: 6, borderRadius: '50%',
                                            background: '#005091',
                                            boxShadow: '0 0 12px 3px rgba(0,80,145,0.4)',
                                            top: -3, left: '50%', marginLeft: -3,
                                        }} />
                                    </div>
                                </div>

                                {/* Ring 2 — Magenta, medium speed, different tilt */}
                                <div className="absolute inset-0 flex items-center justify-center" style={{
                                    transformStyle: 'preserve-3d',
                                    animation: 'orbitTilt2 9s linear infinite',
                                }}>
                                    <div className="absolute" style={{
                                        width: 190, height: 190,
                                        borderRadius: '50%',
                                        border: '1px solid rgba(120,50,100,0.2)',
                                    }}>
                                        <div className="absolute" style={{
                                            width: 5, height: 5, borderRadius: '50%',
                                            background: '#783264',
                                            boxShadow: '0 0 10px 3px rgba(120,50,100,0.4)',
                                            top: -2.5, left: '50%', marginLeft: -2.5,
                                        }} />
                                    </div>
                                </div>

                                {/* Ring 3 — Teal, slow, widest tilt */}
                                <div className="absolute inset-0 flex items-center justify-center" style={{
                                    transformStyle: 'preserve-3d',
                                    animation: 'orbitTilt3 14s linear infinite',
                                }}>
                                    <div className="absolute" style={{
                                        width: 140, height: 140,
                                        borderRadius: '50%',
                                        border: '0.5px solid rgba(77,124,111,0.15)',
                                    }}>
                                        <div className="absolute" style={{
                                            width: 4, height: 4, borderRadius: '50%',
                                            background: '#4D7C6F',
                                            boxShadow: '0 0 8px 2px rgba(77,124,111,0.3)',
                                            top: -2, left: '50%', marginLeft: -2,
                                        }} />
                                    </div>
                                </div>

                                {/* Center: Hex core with glow */}
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <svg width="70" height="80" viewBox="0 0 70 80" fill="none" style={{ animation: 'loaderBreathe 3s ease-in-out infinite' }}>
                                        <defs>
                                            <linearGradient id="coreHexGradA" x1="0%" y1="0%" x2="100%" y2="100%">
                                                <stop offset="0%" stopColor="#005091" />
                                                <stop offset="100%" stopColor="#783264" />
                                            </linearGradient>
                                            <filter id="coreGlowA">
                                                <feGaussianBlur stdDeviation="3" result="blur" />
                                                <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                                            </filter>
                                        </defs>
                                        <path d="M35 4 L66 22 L66 58 L35 76 L4 58 L4 22 Z"
                                            stroke="url(#coreHexGradA)" strokeWidth="2" strokeLinejoin="round"
                                            fill="rgba(0,80,145,0.05)" filter="url(#coreGlowA)" />
                                        <path d="M35 20 L52 30 L52 50 L35 60 L18 50 L18 30 Z"
                                            stroke="#783264" strokeWidth="0.5" fill="none" opacity="0.3" />
                                        <circle cx="35" cy="40" r="3" fill="#005091" opacity="0.6">
                                            <animate attributeName="r" values="3;4;3" dur="2s" repeatCount="indefinite" />
                                            <animate attributeName="opacity" values="0.6;1;0.6" dur="2s" repeatCount="indefinite" />
                                        </circle>
                                    </svg>
                                </div>
                            </div>

                            {/* Text */}
                            <span className="relative mt-6 z-10" style={{
                                fontFamily: "'Orbitron', sans-serif", fontSize: 14,
                                letterSpacing: '0.25em', color: 'rgba(255,255,255,0.5)',
                                textTransform: 'uppercase' as const, fontWeight: 400,
                            }}>
                                Detection Studio
                            </span>
                        </div>
                    </div>
                </ComponentRow>

                {/* ====== Option B: Circuit Hex ====== */}
                <ComponentRow label="Option B — Circuit Hex" description="A hex at the center with animated circuit board traces extending outward in all directions. Traces light up in sequence with energy flowing through them, ending in glowing nodes. The hex itself has an animated stroke-draw. Like a CPU powering on.">
                    <div className="w-full flex justify-center">
                        <div className="rounded-2xl overflow-hidden relative flex flex-col items-center justify-center" style={{ width: 700, height: 520, background: '#0a0c0f' }}>

                            {/* Ambient glow */}
                            <div className="absolute" style={{
                                width: 400, height: 400, top: '50%', left: '50%',
                                transform: 'translate(-50%, -50%)',
                                background: 'radial-gradient(ellipse at center, rgba(0,80,145,0.08) 0%, rgba(120,50,100,0.03) 40%, transparent 70%)',
                            }} />

                            <div className="relative" style={{ width: 400, height: 360 }}>
                                <svg className="absolute inset-0" width="400" height="360" viewBox="0 0 400 360" fill="none">
                                    <defs>
                                        <linearGradient id="hexGradB" x1="0%" y1="0%" x2="100%" y2="100%">
                                            <stop offset="0%" stopColor="#005091" />
                                            <stop offset="50%" stopColor="#4D7C6F" />
                                            <stop offset="100%" stopColor="#783264" />
                                        </linearGradient>
                                        <filter id="traceGlow">
                                            <feGaussianBlur stdDeviation="2" result="blur" />
                                            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                                        </filter>
                                        <filter id="nodeGlow">
                                            <feGaussianBlur stdDeviation="4" result="blur" />
                                            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                                        </filter>
                                        <filter id="hexCoreGlow">
                                            <feGaussianBlur stdDeviation="5" result="blur" />
                                            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                                        </filter>
                                    </defs>

                                    {/* Central hex — animated stroke draw */}
                                    <path d="M200 110 L250 139 L250 197 L200 226 L150 197 L150 139 Z"
                                        stroke="url(#hexGradB)" strokeWidth="2" strokeLinejoin="round"
                                        fill="rgba(0,80,145,0.03)" filter="url(#hexCoreGlow)"
                                        style={{
                                            strokeDasharray: 680,
                                            animation: 'hexStrokeDraw 4s cubic-bezier(0.4, 0, 0.2, 1) infinite',
                                        }}
                                    />
                                    {/* Inner hex */}
                                    <path d="M200 135 L228 151 L228 185 L200 201 L172 185 L172 151 Z"
                                        stroke="#783264" strokeWidth="0.5" fill="none" opacity="0.2" />

                                    {/* Circuit traces extending outward from hex vertices */}
                                    {/* Top-right trace */}
                                    <line x1="250" y1="139" x2="320" y2="100" stroke="#005091" strokeWidth="1.5" filter="url(#traceGlow)"
                                        style={{ animation: 'circuitFlowRight 3s ease-in-out 0s infinite' }} />
                                    <line x1="320" y1="100" x2="320" y2="55" stroke="#005091" strokeWidth="1.5" filter="url(#traceGlow)"
                                        style={{ animation: 'circuitFlowDown 3s ease-in-out 0.3s infinite' }} />
                                    <line x1="320" y1="55" x2="370" y2="55" stroke="#005091" strokeWidth="1" filter="url(#traceGlow)"
                                        style={{ animation: 'circuitFlowRight 3s ease-in-out 0.6s infinite' }} />
                                    <circle cx="370" cy="55" r="3" fill="#005091" filter="url(#nodeGlow)"
                                        style={{ animation: 'circuitNodePulse 3s ease-in-out 0.8s infinite' }} />

                                    {/* Right trace */}
                                    <line x1="250" y1="197" x2="310" y2="197" stroke="#783264" strokeWidth="1.5" filter="url(#traceGlow)"
                                        style={{ animation: 'circuitFlowRight 3s ease-in-out 0.4s infinite' }} />
                                    <line x1="310" y1="197" x2="310" y2="250" stroke="#783264" strokeWidth="1.5" filter="url(#traceGlow)"
                                        style={{ animation: 'circuitFlowDown 3s ease-in-out 0.7s infinite' }} />
                                    <line x1="310" y1="250" x2="355" y2="250" stroke="#783264" strokeWidth="1" filter="url(#traceGlow)"
                                        style={{ animation: 'circuitFlowRight 3s ease-in-out 1s infinite' }} />
                                    <circle cx="355" cy="250" r="3" fill="#783264" filter="url(#nodeGlow)"
                                        style={{ animation: 'circuitNodePulse 3s ease-in-out 1.2s infinite' }} />

                                    {/* Bottom trace */}
                                    <line x1="200" y1="226" x2="200" y2="280" stroke="#4D7C6F" strokeWidth="1.5" filter="url(#traceGlow)"
                                        style={{ animation: 'circuitFlowDown 3s ease-in-out 0.2s infinite' }} />
                                    <line x1="200" y1="280" x2="140" y2="280" stroke="#4D7C6F" strokeWidth="1" filter="url(#traceGlow)"
                                        style={{ animation: 'circuitFlowLeft 3s ease-in-out 0.5s infinite' }} />
                                    <line x1="140" y1="280" x2="140" y2="320" stroke="#4D7C6F" strokeWidth="1" filter="url(#traceGlow)"
                                        style={{ animation: 'circuitFlowDown 3s ease-in-out 0.8s infinite' }} />
                                    <circle cx="140" cy="320" r="3" fill="#4D7C6F" filter="url(#nodeGlow)"
                                        style={{ animation: 'circuitNodePulse 3s ease-in-out 1s infinite' }} />

                                    {/* Top-left trace */}
                                    <line x1="150" y1="139" x2="90" y2="100" stroke="#005091" strokeWidth="1.5" filter="url(#traceGlow)"
                                        style={{ animation: 'circuitFlowLeft 3s ease-in-out 0.3s infinite' }} />
                                    <line x1="90" y1="100" x2="90" y2="50" stroke="#005091" strokeWidth="1" filter="url(#traceGlow)"
                                        style={{ animation: 'circuitFlowUp 3s ease-in-out 0.6s infinite' }} />
                                    <line x1="90" y1="50" x2="40" y2="50" stroke="#005091" strokeWidth="1" filter="url(#traceGlow)"
                                        style={{ animation: 'circuitFlowLeft 3s ease-in-out 0.9s infinite' }} />
                                    <circle cx="40" cy="50" r="3" fill="#005091" filter="url(#nodeGlow)"
                                        style={{ animation: 'circuitNodePulse 3s ease-in-out 1.1s infinite' }} />

                                    {/* Left trace */}
                                    <line x1="150" y1="197" x2="100" y2="197" stroke="#783264" strokeWidth="1.5" filter="url(#traceGlow)"
                                        style={{ animation: 'circuitFlowLeft 3s ease-in-out 0.5s infinite' }} />
                                    <line x1="100" y1="197" x2="100" y2="145" stroke="#783264" strokeWidth="1" filter="url(#traceGlow)"
                                        style={{ animation: 'circuitFlowUp 3s ease-in-out 0.8s infinite' }} />
                                    <line x1="100" y1="145" x2="50" y2="145" stroke="#783264" strokeWidth="1" filter="url(#traceGlow)"
                                        style={{ animation: 'circuitFlowLeft 3s ease-in-out 1.1s infinite' }} />
                                    <circle cx="50" cy="145" r="3" fill="#783264" filter="url(#nodeGlow)"
                                        style={{ animation: 'circuitNodePulse 3s ease-in-out 1.3s infinite' }} />

                                    {/* Top trace */}
                                    <line x1="200" y1="110" x2="200" y2="60" stroke="#4D7C6F" strokeWidth="1.5" filter="url(#traceGlow)"
                                        style={{ animation: 'circuitFlowUp 3s ease-in-out 0.1s infinite' }} />
                                    <line x1="200" y1="60" x2="260" y2="60" stroke="#4D7C6F" strokeWidth="1" filter="url(#traceGlow)"
                                        style={{ animation: 'circuitFlowRight 3s ease-in-out 0.4s infinite' }} />
                                    <line x1="260" y1="60" x2="260" y2="25" stroke="#4D7C6F" strokeWidth="1" filter="url(#traceGlow)"
                                        style={{ animation: 'circuitFlowUp 3s ease-in-out 0.7s infinite' }} />
                                    <circle cx="260" cy="25" r="3" fill="#4D7C6F" filter="url(#nodeGlow)"
                                        style={{ animation: 'circuitNodePulse 3s ease-in-out 0.9s infinite' }} />

                                    {/* Center core */}
                                    <circle cx="200" cy="168" r="4" fill="#005091" opacity="0.8">
                                        <animate attributeName="r" values="4;6;4" dur="2s" repeatCount="indefinite" />
                                        <animate attributeName="opacity" values="0.8;1;0.8" dur="2s" repeatCount="indefinite" />
                                    </circle>
                                    {/* Center glow ring */}
                                    <circle cx="200" cy="168" r="12" fill="none" stroke="#005091" strokeWidth="0.5" opacity="0.15">
                                        <animate attributeName="r" values="12;18;12" dur="3s" repeatCount="indefinite" />
                                        <animate attributeName="opacity" values="0.15;0.05;0.15" dur="3s" repeatCount="indefinite" />
                                    </circle>
                                </svg>
                            </div>

                            <span className="relative z-10 -mt-4" style={{
                                fontFamily: "'Orbitron', sans-serif", fontSize: 14,
                                letterSpacing: '0.25em', color: 'rgba(255,255,255,0.5)',
                                textTransform: 'uppercase' as const, fontWeight: 400,
                            }}>
                                Detection Studio
                            </span>
                        </div>
                    </div>
                </ComponentRow>

                {/* ====== Option C: Shield Matrix (3D Gyroscope) ====== */}
                <ComponentRow label="Option C — Shield Matrix" description="3D gyroscope effect: 3 hex rings rotating on different axes (X, Y, Z) nested inside each other. A glowing core at the center pulses. Corner HUD elements with status indicators. A true shield/defense visualization.">
                    <div className="w-full flex justify-center">
                        <div className="rounded-2xl overflow-hidden relative flex flex-col items-center justify-center" style={{ width: 700, height: 520, background: '#0a0c0f' }}>

                            {/* Corner HUD elements */}
                            {/* Top-left */}
                            <div className="absolute" style={{ top: 24, left: 24 }}>
                                <div style={{ width: 40, height: 40, borderTop: '1px solid rgba(0,80,145,0.3)', borderLeft: '1px solid rgba(0,80,145,0.3)', animation: 'loaderCornerPulse 4s ease-in-out infinite' }} />
                                <div className="flex items-center gap-1 mt-1.5">
                                    <div style={{ width: 4, height: 4, borderRadius: '50%', background: '#005091', animation: 'loaderBreathe 2s ease-in-out infinite' }} />
                                    <span style={{ fontFamily: 'monospace', fontSize: 8, color: 'rgba(0,80,145,0.4)', letterSpacing: '0.08em' }}>SYS.INIT</span>
                                </div>
                            </div>
                            {/* Top-right */}
                            <div className="absolute" style={{ top: 24, right: 24 }}>
                                <div style={{ width: 40, height: 40, borderTop: '1px solid rgba(120,50,100,0.3)', borderRight: '1px solid rgba(120,50,100,0.3)', animation: 'loaderCornerPulse 4s ease-in-out 1s infinite' }} />
                                <div className="flex items-center gap-1 mt-1.5 justify-end">
                                    <span style={{ fontFamily: 'monospace', fontSize: 8, color: 'rgba(120,50,100,0.4)', letterSpacing: '0.08em' }}>SHIELD.OK</span>
                                    <div style={{ width: 4, height: 4, borderRadius: '50%', background: '#783264', animation: 'loaderBreathe 2s ease-in-out 0.5s infinite' }} />
                                </div>
                            </div>
                            {/* Bottom-left */}
                            <div className="absolute" style={{ bottom: 54, left: 24 }}>
                                <div className="flex items-center gap-1 mb-1.5">
                                    <div style={{ width: 4, height: 4, borderRadius: '50%', background: '#4D7C6F', animation: 'loaderBreathe 2s ease-in-out 1s infinite' }} />
                                    <span style={{ fontFamily: 'monospace', fontSize: 8, color: 'rgba(77,124,111,0.4)', letterSpacing: '0.08em' }}>THREAT.DB</span>
                                </div>
                                <div style={{ width: 40, height: 40, borderBottom: '1px solid rgba(77,124,111,0.3)', borderLeft: '1px solid rgba(77,124,111,0.3)', animation: 'loaderCornerPulse 4s ease-in-out 2s infinite' }} />
                            </div>
                            {/* Bottom-right */}
                            <div className="absolute" style={{ bottom: 54, right: 24 }}>
                                <div className="flex items-center gap-1 mb-1.5 justify-end">
                                    <span style={{ fontFamily: 'monospace', fontSize: 8, color: 'rgba(0,80,145,0.4)', letterSpacing: '0.08em' }}>NET.SCAN</span>
                                    <div style={{ width: 4, height: 4, borderRadius: '50%', background: '#005091', animation: 'loaderBreathe 2s ease-in-out 1.5s infinite' }} />
                                </div>
                                <div style={{ width: 40, height: 40, borderBottom: '1px solid rgba(0,80,145,0.3)', borderRight: '1px solid rgba(0,80,145,0.3)', animation: 'loaderCornerPulse 4s ease-in-out 3s infinite' }} />
                            </div>

                            {/* Center ambient glow */}
                            <div className="absolute" style={{
                                width: 350, height: 350, top: '50%', left: '50%',
                                transform: 'translate(-50%, -55%)',
                                background: 'radial-gradient(ellipse at center, rgba(0,80,145,0.12) 0%, rgba(120,50,100,0.04) 35%, transparent 65%)',
                            }} />

                            {/* 3D Gyroscope — 3 hex outlines on different rotation axes */}
                            <div className="relative" style={{ width: 220, height: 220, perspective: '800px' }}>
                                {/* Outer ring — rotates on Y axis */}
                                <div className="absolute inset-0 flex items-center justify-center" style={{
                                    transformStyle: 'preserve-3d',
                                    animation: 'shieldGyroX 8s linear infinite',
                                }}>
                                    <svg width="220" height="220" viewBox="0 0 220 220" fill="none" style={{ position: 'absolute' }}>
                                        <path d="M110 10 L200 62 L200 158 L110 210 L20 158 L20 62 Z"
                                            stroke="#005091" strokeWidth="1" fill="none" opacity="0.3" />
                                    </svg>
                                </div>

                                {/* Middle ring — rotates on X axis */}
                                <div className="absolute inset-0 flex items-center justify-center" style={{
                                    transformStyle: 'preserve-3d',
                                    animation: 'shieldGyroY 12s linear infinite',
                                }}>
                                    <svg width="180" height="180" viewBox="0 0 180 180" fill="none" style={{ position: 'absolute' }}>
                                        <path d="M90 8 L164 51 L164 129 L90 172 L16 129 L16 51 Z"
                                            stroke="#783264" strokeWidth="1" fill="none" opacity="0.25" />
                                    </svg>
                                </div>

                                {/* Inner ring — rotates on Z axis */}
                                <div className="absolute inset-0 flex items-center justify-center" style={{
                                    transformStyle: 'preserve-3d',
                                    animation: 'shieldGyroZ 6s linear infinite',
                                }}>
                                    <svg width="130" height="130" viewBox="0 0 130 130" fill="none" style={{ position: 'absolute' }}>
                                        <path d="M65 6 L121 38 L121 92 L65 124 L9 92 L9 38 Z"
                                            stroke="#4D7C6F" strokeWidth="1" fill="none" opacity="0.2" />
                                    </svg>
                                </div>

                                {/* Center glowing core */}
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <div style={{
                                        width: 16, height: 16, borderRadius: '50%',
                                        background: 'radial-gradient(circle, rgba(0,80,145,0.9) 0%, rgba(120,50,100,0.4) 60%, transparent 100%)',
                                        animation: 'shieldCoreGlow 3s ease-in-out infinite',
                                    }} />
                                </div>
                            </div>

                            <span className="relative z-10 mt-6" style={{
                                fontFamily: "'Orbitron', sans-serif", fontSize: 14,
                                letterSpacing: '0.25em', color: 'rgba(255,255,255,0.5)',
                                textTransform: 'uppercase' as const, fontWeight: 400,
                            }}>
                                Detection Studio
                            </span>
                        </div>
                    </div>
                </ComponentRow>

                <div className="h-8" />

                {/* ============================================================ */}
                {/* EXISTING LOADING COMPONENTS BELOW                            */}
                {/* ============================================================ */}

                <div className="mb-6 p-3 bg-surface-container-low border border-outline-variant/20 rounded-xl">
                    <p className="text-xs font-medium text-on-surface-variant">Existing Loading Components</p>
                </div>

                <ComponentRow label="Orbital Loader Specs" description="Animation timing and structure">
                    <div className="bg-surface-container-low rounded-xl p-4 border border-outline-variant/20">
                        <table className="w-full text-xs">
                            <thead>
                                <tr className="border-b border-outline-variant/20">
                                    <th className="text-left py-2 text-on-surface-variant font-medium">Element</th>
                                    <th className="text-left py-2 text-on-surface-variant font-medium">Color</th>
                                    <th className="text-left py-2 text-on-surface-variant font-medium">Animation</th>
                                    <th className="text-left py-2 text-on-surface-variant font-medium">Duration</th>
                                </tr>
                            </thead>
                            <tbody className="text-on-surface">
                                <tr className="border-b border-outline-variant/10">
                                    <td className="py-2">Center Core</td>
                                    <td className="py-2"><span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-[#783264]" /> Tertiary</span></td>
                                    <td className="py-2 font-mono text-[10px]">breathe (scale + opacity)</td>
                                    <td className="py-2">2s</td>
                                </tr>
                                <tr className="border-b border-outline-variant/10">
                                    <td className="py-2">Inner Orbit</td>
                                    <td className="py-2"><span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-[#005091]" /> Primary</span></td>
                                    <td className="py-2 font-mono text-[10px]">orbit (clockwise)</td>
                                    <td className="py-2">3s</td>
                                </tr>
                                <tr className="border-b border-outline-variant/10">
                                    <td className="py-2">Middle Orbit</td>
                                    <td className="py-2"><span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-[#783264]/80" /> Tertiary/80</span></td>
                                    <td className="py-2 font-mono text-[10px]">orbitReverse (counter-clockwise)</td>
                                    <td className="py-2">5s</td>
                                </tr>
                                <tr>
                                    <td className="py-2">Outer Orbit</td>
                                    <td className="py-2"><span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-[#4D7C6F]/70" /> Secondary/70</span></td>
                                    <td className="py-2 font-mono text-[10px]">orbit (clockwise)</td>
                                    <td className="py-2">8s</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </ComponentRow>

                <ComponentRow label="Pulsing Ring" description="Expanding ring animation">
                    <div className="flex gap-8 items-center">
                        <div className="relative w-12 h-12">
                            <div className="absolute inset-0 rounded-full bg-[#783264]/20 animate-ping" />
                            <div className="absolute inset-2 rounded-full bg-[#783264]/40 animate-ping" style={{ animationDelay: '150ms' }} />
                            <div className="absolute inset-4 rounded-full bg-[#783264]" />
                        </div>
                        <div className="relative w-12 h-12">
                            <div className="absolute inset-0 rounded-full bg-[#4D7C6F]/20 animate-ping" />
                            <div className="absolute inset-2 rounded-full bg-[#4D7C6F]/40 animate-ping" style={{ animationDelay: '150ms' }} />
                            <div className="absolute inset-4 rounded-full bg-[#4D7C6F]" />
                        </div>
                        <div className="relative w-12 h-12">
                            <div className="absolute inset-0 rounded-full bg-[#0284C7]/20 animate-ping" />
                            <div className="absolute inset-2 rounded-full bg-[#0284C7]/40 animate-ping" style={{ animationDelay: '150ms' }} />
                            <div className="absolute inset-4 rounded-full bg-[#0284C7]" />
                        </div>
                    </div>
                </ComponentRow>

                <ComponentRow label="AI Thinking Dots" description="Expressive AI processing indicator">
                    <div className="flex flex-col gap-4">
                        {/* Gradient dots */}
                        <div className="flex items-center gap-4 px-5 py-3 bg-gradient-to-r from-[#783264]/10 to-[#4D7C6F]/10 rounded-2xl border border-[#783264]/20">
                            <div className="flex gap-1.5">
                                <span className="w-3 h-3 rounded-full bg-gradient-to-br from-[#783264] to-[#4D7C6F] animate-bounce" style={{ animationDelay: '0ms' }} />
                                <span className="w-3 h-3 rounded-full bg-gradient-to-br from-[#783264] to-[#4D7C6F] animate-bounce" style={{ animationDelay: '150ms' }} />
                                <span className="w-3 h-3 rounded-full bg-gradient-to-br from-[#783264] to-[#4D7C6F] animate-bounce" style={{ animationDelay: '300ms' }} />
                            </div>
                            <span className="text-sm text-on-surface-variant">AI is analyzing...</span>
                        </div>
                        {/* Typing indicator style */}
                        <div className="flex items-center gap-3 px-4 py-3 bg-surface-container rounded-2xl w-fit">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#783264] to-[#4D7C6F] flex items-center justify-center">
                                <Icon name="sparkles" className="w-4 h-4 text-white" />
                            </div>
                            <div className="flex gap-1">
                                <span className="w-2 h-2 rounded-full bg-[#783264] animate-pulse" style={{ animationDelay: '0ms' }} />
                                <span className="w-2 h-2 rounded-full bg-[#783264]/70 animate-pulse" style={{ animationDelay: '200ms' }} />
                                <span className="w-2 h-2 rounded-full bg-[#783264]/40 animate-pulse" style={{ animationDelay: '400ms' }} />
                            </div>
                        </div>
                    </div>
                </ComponentRow>

                <ComponentRow label="Gradient Progress Ring" description="Circular progress with gradient">
                    <div className="flex gap-6 items-center">
                        {[
                            { score: 85, from: '#4D7C6F', to: '#0284C7' },
                            { score: 65, from: '#783264', to: '#A63D40' },
                            { score: 45, from: '#0284C7', to: '#4D7C6F' },
                        ].map((item, idx) => {
                            const radius = 22;
                            const circumference = 2 * Math.PI * radius;
                            const offset = circumference - (item.score / 100) * circumference;
                            return (
                                <div key={idx} className="relative" style={{ width: 64, height: 64 }}>
                                    <svg className="-rotate-90" style={{ width: 64, height: 64 }}>
                                        <defs>
                                            <linearGradient id={`grad-${idx}`} x1="0%" y1="0%" x2="100%" y2="0%">
                                                <stop offset="0%" stopColor={item.from} />
                                                <stop offset="100%" stopColor={item.to} />
                                            </linearGradient>
                                        </defs>
                                        <circle cx={32} cy={32} r={radius} fill="none" strokeWidth={6} stroke={`${item.from}15`} />
                                        <circle cx={32} cy={32} r={radius} fill="none" strokeWidth={6} stroke={`url(#grad-${idx})`} strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" />
                                    </svg>
                                    <span className="absolute inset-0 flex items-center justify-center font-bold text-base" style={{ color: item.from }}>
                                        {item.score}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </ComponentRow>

                <ComponentRow label="Shimmer Skeleton" description="Skeleton with shimmer effect">
                    <div className="w-[360px] bg-surface-container border border-outline-variant/30 rounded-2xl p-4 overflow-hidden">
                        <div className="flex items-start gap-3 mb-4">
                            <div className="w-12 h-12 bg-surface-container-highest rounded-full relative overflow-hidden">
                                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full animate-[shimmer_2s_infinite]" style={{ animation: 'shimmer 2s infinite' }} />
                            </div>
                            <div className="flex-1 space-y-2">
                                <div className="h-4 bg-surface-container-highest rounded w-2/3 relative overflow-hidden">
                                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-pulse" />
                                </div>
                                <div className="h-3 bg-surface-container-highest rounded w-1/3 relative overflow-hidden">
                                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-pulse" style={{ animationDelay: '150ms' }} />
                                </div>
                            </div>
                        </div>
                        <div className="space-y-2 mb-4">
                            <div className="h-3 bg-surface-container-highest rounded w-full animate-pulse" />
                            <div className="h-3 bg-surface-container-highest rounded w-4/5 animate-pulse" style={{ animationDelay: '100ms' }} />
                        </div>
                        <div className="flex gap-2">
                            <div className="h-6 bg-surface-container-highest rounded-lg w-20 animate-pulse" />
                            <div className="h-6 bg-surface-container-highest rounded-lg w-16 animate-pulse" style={{ animationDelay: '200ms' }} />
                        </div>
                    </div>
                </ComponentRow>

                <ComponentRow label="Progress Steps" description="Multi-step loading indicator">
                    <div className="w-[400px] bg-surface-container rounded-2xl p-5 border border-outline-variant/20">
                        <div className="flex items-center justify-between mb-4">
                            <span className="text-sm font-medium text-on-surface">Publishing Detection</span>
                            <span className="text-xs text-[#783264] font-bold">Step 2/4</span>
                        </div>
                        <div className="flex items-center gap-2 mb-3">
                            {[
                                { done: true },
                                { active: true },
                                { pending: true },
                                { pending: true },
                            ].map((step, i) => (
                                <div key={i} className="flex-1 flex items-center gap-2">
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                                        step.done ? 'bg-[#4D7C6F]' :
                                        step.active ? 'bg-[#783264] animate-pulse' :
                                        'bg-surface-container-highest'
                                    }`}>
                                        {step.done ? (
                                            <Icon name="check" className="w-4 h-4 text-white" />
                                        ) : step.active ? (
                                            <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                            </svg>
                                        ) : (
                                            <span className="text-xs text-on-surface-variant">{i + 1}</span>
                                        )}
                                    </div>
                                    {i < 3 && (
                                        <div className={`flex-1 h-1 rounded-full ${
                                            step.done ? 'bg-[#4D7C6F]' : 'bg-surface-container-highest'
                                        }`} />
                                    )}
                                </div>
                            ))}
                        </div>
                        <p className="text-xs text-on-surface-variant">Validating detection rules...</p>
                    </div>
                </ComponentRow>

                <ComponentRow label="Branded Loading Card" description="Full-featured loading state">
                    <div className="w-[320px] bg-gradient-to-br from-[#783264]/5 to-[#4D7C6F]/5 rounded-2xl p-6 border border-[#783264]/20">
                        <div className="flex flex-col items-center text-center">
                            <div className="relative w-20 h-20 mb-4">
                                <div className="absolute inset-0 rounded-full bg-gradient-to-br from-[#783264]/20 to-[#4D7C6F]/20 animate-pulse" />
                                <div className="absolute inset-2 rounded-full bg-gradient-to-br from-[#783264]/30 to-[#4D7C6F]/30 animate-pulse" style={{ animationDelay: '150ms' }} />
                                <div className="absolute inset-4 rounded-full bg-gradient-to-br from-[#783264] to-[#4D7C6F] flex items-center justify-center">
                                    <Icon name="shield" className="w-6 h-6 text-white" />
                                </div>
                            </div>
                            <h3 className="text-base font-semibold text-on-surface mb-1">Analyzing Threats</h3>
                            <p className="text-xs text-on-surface-variant mb-4">Scanning detection coverage...</p>
                            <div className="w-full h-1.5 bg-surface-container-highest rounded-full overflow-hidden">
                                <div className="h-full bg-gradient-to-r from-[#783264] to-[#4D7C6F] rounded-full w-2/3 animate-pulse" />
                            </div>
                        </div>
                    </div>
                </ComponentRow>

                <ComponentRow label="Button Loading States" description="Loading indicators in buttons">
                    <div className="flex flex-wrap gap-3">
                        <button className="px-5 py-2.5 bg-gradient-to-r from-[#783264] to-[#783264]/80 text-white rounded-xl font-medium text-sm flex items-center gap-2">
                            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                            </svg>
                            Saving...
                        </button>
                        <button className="px-5 py-2.5 bg-[#4D7C6F] text-white rounded-xl font-medium text-sm flex items-center gap-2">
                            <div className="flex gap-0.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-white animate-bounce" style={{ animationDelay: '0ms' }} />
                                <span className="w-1.5 h-1.5 rounded-full bg-white/70 animate-bounce" style={{ animationDelay: '150ms' }} />
                                <span className="w-1.5 h-1.5 rounded-full bg-white/40 animate-bounce" style={{ animationDelay: '300ms' }} />
                            </div>
                            Publishing
                        </button>
                        <button className="px-5 py-2.5 border-2 border-[#783264]/30 text-[#783264] rounded-xl font-medium text-sm flex items-center gap-2 bg-[#783264]/5">
                            <div className="w-4 h-4 rounded-full border-2 border-[#783264]/30 border-t-[#783264] animate-spin" />
                            Loading...
                        </button>
                    </div>
                </ComponentRow>

                <ComponentRow label="Inline Loading" description="Compact inline indicators">
                    <div className="flex flex-col gap-3">
                        <div className="flex items-center gap-2 text-sm text-on-surface-variant">
                            <div className="w-4 h-4 rounded-full border-2 border-[#783264]/30 border-t-[#783264] animate-spin" />
                            Fetching detections...
                        </div>
                        <div className="flex items-center gap-2 text-sm text-on-surface-variant">
                            <div className="flex gap-0.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-[#4D7C6F] animate-pulse" />
                                <span className="w-1.5 h-1.5 rounded-full bg-[#4D7C6F]/60 animate-pulse" style={{ animationDelay: '200ms' }} />
                                <span className="w-1.5 h-1.5 rounded-full bg-[#4D7C6F]/30 animate-pulse" style={{ animationDelay: '400ms' }} />
                            </div>
                            Processing query...
                        </div>
                    </div>
                </ComponentRow>
            </Section>
        </DesignSystemPage>
    );
};

export default LoadingPage;
