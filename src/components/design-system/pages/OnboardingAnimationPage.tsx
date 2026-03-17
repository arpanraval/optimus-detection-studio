import React, { useEffect, useRef, useCallback } from 'react';
import { DesignSystemPage, Section } from '../shared';

/* ================================================================
   ENGINEERING BLUEPRINT — TURBINE ENGINE CROSS-SECTION

   Side-view technical cutaway of a turbofan engine being drawn
   line-by-line like a pen plotter / CAD system.

   Lines trace themselves via strokeDashoffset — NOT fade in.
   Proper aerodynamic profile with:
   - Spinner/nose cone
   - Large fan blades
   - Multi-stage axial compressor (narrowing)
   - Annular combustion chamber
   - Turbine stages
   - Converging exhaust nozzle
   - Bypass duct (outer cowling)
   ================================================================ */

const W = 1400, H = 750;
const CY = 375;
const L = 'rgba(255,255,255,';

/* ================================================================
   TRACED DRAWING PRIMITIVES

   These draw themselves over time using strokeDashoffset.
   progress 0 = invisible, progress 1 = fully drawn.
   ================================================================ */

interface TPathProps {
    d: string;
    len: number;       // approximate path length
    t0: number;        // start time ms
    dur: number;       // draw duration ms
    now: number;       // current time ms
    sw?: number;       // stroke width
    op?: number;       // opacity (0-1)
}

const TPath: React.FC<TPathProps> = ({ d, len, t0, dur, now, sw = 0.5, op = 0.12 }) => {
    const elapsed = now - t0;
    if (elapsed < -100) return null;
    const p = Math.min(1, Math.max(0, elapsed / dur));
    return (
        <path d={d} fill="none"
            stroke={`${L}${op})`}
            strokeWidth={sw}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={len}
            strokeDashoffset={len * (1 - p)} />
    );
};

interface TLineProps {
    x1: number; y1: number; x2: number; y2: number;
    t0: number; dur: number; now: number;
    sw?: number; op?: number;
}

const TLine: React.FC<TLineProps> = ({ x1, y1, x2, y2, t0, dur, now, sw = 0.4, op = 0.1 }) => {
    const elapsed = now - t0;
    if (elapsed < -100) return null;
    const len = Math.hypot(x2 - x1, y2 - y1);
    const p = Math.min(1, Math.max(0, elapsed / dur));
    return (
        <line x1={x1} y1={y1} x2={x2} y2={y2}
            stroke={`${L}${op})`}
            strokeWidth={sw}
            strokeLinecap="round"
            strokeDasharray={len}
            strokeDashoffset={len * (1 - p)} />
    );
};

interface TCircProps {
    cx: number; cy: number; r: number;
    t0: number; dur: number; now: number;
    sw?: number; op?: number;
}

const TCirc: React.FC<TCircProps> = ({ cx, cy, r, t0, dur, now, sw = 0.4, op = 0.08 }) => {
    const elapsed = now - t0;
    if (elapsed < -100) return null;
    const c = 2 * Math.PI * r;
    const p = Math.min(1, Math.max(0, elapsed / dur));
    return (
        <circle cx={cx} cy={cy} r={r} fill="none"
            stroke={`${L}${op})`}
            strokeWidth={sw}
            strokeDasharray={c}
            strokeDashoffset={c * (1 - p)} />
    );
};

// Fade-in text (text can't stroke-draw, so it fades)
const FText: React.FC<{
    x: number; y: number; text: string;
    t0: number; dur: number; now: number;
    size?: number; op?: number; anchor?: 'start' | 'middle' | 'end';
}> = ({ x, y, text, t0, dur, now, size = 7, op = 0.08, anchor = 'start' }) => {
    const p = Math.min(1, Math.max(0, (now - t0) / dur));
    if (p <= 0) return null;
    return (
        <text x={x} y={y} textAnchor={anchor}
            fill={`${L}${op * p})`}
            fontFamily="monospace" fontSize={size} letterSpacing="1">
            {text}
        </text>
    );
};

/* ================================================================
   ENGINE GEOMETRY

   All coordinates define a realistic turbofan cross-section.
   The upper half is drawn; lower half mirrors it.

   Key Y values at each X section:
   - Outer cowling (bypass duct outer wall)
   - Inner cowling (bypass duct inner wall / core casing)
   - Core flow path (inner)
   - Shaft

   This creates the layered look of a real engine cutaway.
   ================================================================ */

// --- Outer nacelle / cowling profile ---
// Smooth aerodynamic shape: pointed intake lip → max diameter at fan → gentle taper → exhaust
const outerTop = `
    M 120 ${CY}
    C 130 ${CY - 40}, 150 ${CY - 120}, 200 ${CY - 165}
    C 240 ${CY - 195}, 290 ${CY - 210}, 360 ${CY - 218}
    C 430 ${CY - 224}, 520 ${CY - 222}, 600 ${CY - 218}
    C 680 ${CY - 214}, 760 ${CY - 210}, 840 ${CY - 206}
    C 920 ${CY - 200}, 1000 ${CY - 192}, 1060 ${CY - 178}
    C 1100 ${CY - 168}, 1130 ${CY - 152}, 1160 ${CY - 130}
    L 1200 ${CY - 115}
`;

const outerBot = `
    M 120 ${CY}
    C 130 ${CY + 40}, 150 ${CY + 120}, 200 ${CY + 165}
    C 240 ${CY + 195}, 290 ${CY + 210}, 360 ${CY + 218}
    C 430 ${CY + 224}, 520 ${CY + 222}, 600 ${CY + 218}
    C 680 ${CY + 214}, 760 ${CY + 210}, 840 ${CY + 206}
    C 920 ${CY + 200}, 1000 ${CY + 192}, 1060 ${CY + 178}
    C 1100 ${CY + 168}, 1130 ${CY + 152}, 1160 ${CY + 130}
    L 1200 ${CY + 115}
`;

// --- Inner cowling (core engine casing) ---
// Starts after fan, runs through compressor/combustion/turbine
const coreTop = `
    M 330 ${CY - 80}
    C 360 ${CY - 95}, 400 ${CY - 108}, 450 ${CY - 115}
    C 520 ${CY - 122}, 600 ${CY - 125}, 680 ${CY - 128}
    C 760 ${CY - 128}, 840 ${CY - 125}, 900 ${CY - 118}
    C 960 ${CY - 108}, 1010 ${CY - 95}, 1050 ${CY - 78}
    L 1080 ${CY - 60}
`;

const coreBot = `
    M 330 ${CY + 80}
    C 360 ${CY + 95}, 400 ${CY + 108}, 450 ${CY + 115}
    C 520 ${CY + 122}, 600 ${CY + 125}, 680 ${CY + 128}
    C 760 ${CY + 128}, 840 ${CY + 125}, 900 ${CY + 118}
    C 960 ${CY + 108}, 1010 ${CY + 95}, 1050 ${CY + 78}
    L 1080 ${CY + 60}
`;

// --- Spinner / nose cone ---
const spinnerTop = `
    M 155 ${CY}
    C 165 ${CY - 8}, 185 ${CY - 30}, 210 ${CY - 42}
    C 235 ${CY - 52}, 270 ${CY - 58}, 310 ${CY - 60}
`;

const spinnerBot = `
    M 155 ${CY}
    C 165 ${CY + 8}, 185 ${CY + 30}, 210 ${CY + 42}
    C 235 ${CY + 52}, 270 ${CY + 58}, 310 ${CY + 60}
`;

// --- Exhaust nozzle inner cone ---
const exhaustConeTop = `
    M 1050 ${CY - 30}
    C 1080 ${CY - 28}, 1140 ${CY - 22}, 1220 ${CY - 10}
`;
const exhaustConeBot = `
    M 1050 ${CY + 30}
    C 1080 ${CY + 28}, 1140 ${CY + 22}, 1220 ${CY + 10}
`;

// --- Exhaust nozzle outer shroud ---
const exhaustShroudTop = `
    M 1160 ${CY - 130}
    C 1180 ${CY - 118}, 1210 ${CY - 98}, 1250 ${CY - 80}
`;
const exhaustShroudBot = `
    M 1160 ${CY + 130}
    C 1180 ${CY + 118}, 1210 ${CY + 98}, 1250 ${CY + 80}
`;

// --- Fan blade positions (large, from spinner to cowling) ---
function fanBladeCoords(): { x: number; topOuter: number; topInner: number; botOuter: number; botInner: number }[] {
    return [
        { x: 225, topOuter: CY - 195, topInner: CY - 48, botOuter: CY + 195, botInner: CY + 48 },
        { x: 255, topOuter: CY - 200, topInner: CY - 52, botOuter: CY + 200, botInner: CY + 52 },
        { x: 285, topOuter: CY - 205, topInner: CY - 56, botOuter: CY + 205, botInner: CY + 56 },
        { x: 310, topOuter: CY - 208, topInner: CY - 58, botOuter: CY + 208, botInner: CY + 58 },
    ];
}

// --- Compressor blade positions (smaller, denser, progressively narrowing) ---
function compBladeCoords(): { x: number; topY: number; botY: number; coreTopY: number; coreBotY: number }[] {
    const blades: { x: number; topY: number; botY: number; coreTopY: number; coreBotY: number }[] = [];
    for (let i = 0; i < 14; i++) {
        const x = 350 + i * 22;
        // Outer wall narrows slightly, inner wall expands = compressor effect
        const outerR = 210 - i * 2.5;
        const innerR = 62 + i * 3;
        blades.push({
            x,
            topY: CY - outerR,
            botY: CY + outerR,
            coreTopY: CY - innerR,
            coreBotY: CY + innerR,
        });
    }
    return blades;
}

// --- Turbine blade positions ---
function turbBladeCoords(): { x: number; topY: number; botY: number; coreTopY: number; coreBotY: number }[] {
    const blades: { x: number; topY: number; botY: number; coreTopY: number; coreBotY: number }[] = [];
    for (let i = 0; i < 6; i++) {
        const x = 870 + i * 30;
        const outerR = 120 - i * 5;
        const innerR = 65 - i * 3;
        blades.push({
            x,
            topY: CY - outerR,
            botY: CY + outerR,
            coreTopY: CY - innerR,
            coreBotY: CY + innerR,
        });
    }
    return blades;
}

// --- Combustion chamber liner (wavy flame tube) ---
function flameLinePath(ySign: number): string {
    let d = `M 660 ${CY + ySign * 100}`;
    for (let i = 0; i < 6; i++) {
        const x0 = 660 + i * 30;
        d += ` C ${x0 + 10} ${CY + ySign * 95}, ${x0 + 20} ${CY + ySign * 105}, ${x0 + 30} ${CY + ySign * 100}`;
    }
    return d;
}

/* ================================================================
   TIMELINE (ms) — what draws when

   Things draw in overlapping waves across different areas.
   Not strictly left-to-right.
   ================================================================ */

const LOOP = 30000;

/* ================================================================
   COMPONENT GROUPS
   ================================================================ */

// 1. Registration marks + frame
const Reg: React.FC<{ now: number }> = ({ now }) => (
    <g>
        {[
            [40, 40, 1, 1], [W - 40, 40, -1, 1],
            [40, H - 40, 1, -1], [W - 40, H - 40, -1, -1],
        ].map(([x, y, dx, dy], i) => (
            <g key={i}>
                <TLine x1={x} y1={y} x2={x + dx * 20} y2={y}
                    t0={100 + i * 60} dur={300} now={now} sw={0.4} op={0.1} />
                <TLine x1={x} y1={y} x2={x} y2={y + dy * 20}
                    t0={100 + i * 60} dur={300} now={now} sw={0.4} op={0.1} />
            </g>
        ))}
    </g>
);

// 2. Grid dots (fade in since they're fills, not strokes)
const Grid: React.FC<{ now: number }> = ({ now }) => {
    const p = Math.min(1, Math.max(0, (now - 400) / 1500));
    if (p <= 0) return null;
    return (
        <g style={{ opacity: p }}>
            <defs>
                <pattern id="bp-dots" width="50" height="50" patternUnits="userSpaceOnUse">
                    <circle cx="25" cy="25" r="0.5" fill={`${L}0.05)`} />
                </pattern>
            </defs>
            <rect width={W} height={H} fill="url(#bp-dots)" />
        </g>
    );
};

// 3. Center axis
const Axis: React.FC<{ now: number }> = ({ now }) => (
    <g>
        <TLine x1={80} y1={CY} x2={W - 80} y2={CY}
            t0={800} dur={1200} now={now} sw={0.3} op={0.06} />
        {/* Axis end ticks */}
        <TLine x1={85} y1={CY - 5} x2={85} y2={CY + 5}
            t0={900} dur={200} now={now} sw={0.3} op={0.08} />
        <TLine x1={W - 85} y1={CY - 5} x2={W - 85} y2={CY + 5}
            t0={1800} dur={200} now={now} sw={0.3} op={0.08} />
    </g>
);

// 4. Construction circles (at key stations)
const Constr: React.FC<{ now: number }> = ({ now }) => (
    <g>
        {/* Fan face */}
        <TCirc cx={280} cy={CY} r={215} t0={1800} dur={1000} now={now} sw={0.2} op={0.04} />
        {/* Compressor mid */}
        <TCirc cx={500} cy={CY} r={195} t0={2200} dur={800} now={now} sw={0.2} op={0.03} />
        {/* Combustion */}
        <TCirc cx={720} cy={CY} r={140} t0={2500} dur={800} now={now} sw={0.2} op={0.03} />
        {/* Turbine */}
        <TCirc cx={920} cy={CY} r={125} t0={2800} dur={800} now={now} sw={0.2} op={0.03} />
        {/* Exhaust */}
        <TCirc cx={1200} cy={CY} r={100} t0={3100} dur={600} now={now} sw={0.2} op={0.03} />
    </g>
);

// 5. Outer nacelle profile (main engine shape)
const Nacelle: React.FC<{ now: number }> = ({ now }) => (
    <g>
        <TPath d={outerTop} len={1150} t0={3000} dur={2800} now={now} sw={0.7} op={0.14} />
        <TPath d={outerBot} len={1150} t0={3200} dur={2800} now={now} sw={0.7} op={0.14} />
        {/* Intake lip (connects top and bottom at front) */}
        <TPath d={`M 200 ${CY - 165} C 170 ${CY - 155}, 125 ${CY - 60}, 120 ${CY}`}
            len={180} t0={3800} dur={600} now={now} sw={0.5} op={0.1} />
        <TPath d={`M 200 ${CY + 165} C 170 ${CY + 155}, 125 ${CY + 60}, 120 ${CY}`}
            len={180} t0={3900} dur={600} now={now} sw={0.5} op={0.1} />
    </g>
);

// 6. Spinner / nose cone
const Spinner: React.FC<{ now: number }> = ({ now }) => (
    <g>
        <TPath d={spinnerTop} len={180} t0={4500} dur={800} now={now} sw={0.5} op={0.12} />
        <TPath d={spinnerBot} len={180} t0={4600} dur={800} now={now} sw={0.5} op={0.12} />
        {/* Tip */}
        <TCirc cx={155} cy={CY} r={3} t0={4500} dur={300} now={now} sw={0.4} op={0.1} />
        {/* Internal spinner lines */}
        <TLine x1={170} y1={CY - 12} x2={290} y2={CY - 52}
            t0={5000} dur={500} now={now} sw={0.3} op={0.07} />
        <TLine x1={170} y1={CY + 12} x2={290} y2={CY + 52}
            t0={5100} dur={500} now={now} sw={0.3} op={0.07} />
    </g>
);

// 7. Fan blades (large, angled)
const FanBlades: React.FC<{ now: number }> = ({ now }) => {
    const blades = fanBladeCoords();
    // Draw order: not left-to-right, staggered
    const order = [1, 3, 0, 2];
    return (
        <g>
            {order.map((idx, oi) => {
                const b = blades[idx];
                const t = 5500 + oi * 250;
                // Angled blade (lean forward) — offset x slightly from base to tip
                const lean = 12;
                return (
                    <g key={idx}>
                        {/* Upper blade */}
                        <TLine x1={b.x + lean} y1={b.topOuter} x2={b.x - lean * 0.3} y2={b.topInner}
                            t0={t} dur={500} now={now} sw={0.6} op={0.12} />
                        {/* Lower blade */}
                        <TLine x1={b.x + lean} y1={b.botOuter} x2={b.x - lean * 0.3} y2={b.botInner}
                            t0={t + 150} dur={500} now={now} sw={0.6} op={0.12} />
                    </g>
                );
            })}
        </g>
    );
};

// 8. Core casing (inner engine walls)
const CoreCasing: React.FC<{ now: number }> = ({ now }) => (
    <g>
        <TPath d={coreTop} len={800} t0={7000} dur={2000} now={now} sw={0.5} op={0.1} />
        <TPath d={coreBot} len={800} t0={7200} dur={2000} now={now} sw={0.5} op={0.1} />
        {/* Shaft line */}
        <TLine x1={310} y1={CY} x2={1080} y2={CY}
            t0={7500} dur={1500} now={now} sw={0.2} op={0.04} />
    </g>
);

// 9. Compressor blades (dense, staggered from center outward)
const CompBlades: React.FC<{ now: number }> = ({ now }) => {
    const blades = compBladeCoords();
    // Draw from center outward alternating
    const mid = Math.floor(blades.length / 2);
    const order: number[] = [];
    for (let i = 0; i <= mid; i++) {
        if (mid + i < blades.length) order.push(mid + i);
        if (mid - i >= 0 && mid - i !== mid + i) order.push(mid - i);
    }
    return (
        <g>
            {order.map((idx, oi) => {
                const b = blades[idx];
                const t = 9500 + oi * 80;
                const lean = 6;
                return (
                    <g key={idx}>
                        <TLine x1={b.x + lean} y1={b.topY} x2={b.x - lean * 0.5} y2={b.coreTopY}
                            t0={t} dur={300} now={now} sw={0.35} op={0.09} />
                        <TLine x1={b.x + lean} y1={b.botY} x2={b.x - lean * 0.5} y2={b.coreBotY}
                            t0={t + 80} dur={300} now={now} sw={0.35} op={0.09} />
                    </g>
                );
            })}
        </g>
    );
};

// 10. Combustion chamber
const Combustion: React.FC<{ now: number }> = ({ now }) => (
    <g>
        {/* Flame tube liners (wavy) */}
        <TPath d={flameLinePath(-1)} len={250} t0={12000} dur={1500} now={now} sw={0.35} op={0.08} />
        <TPath d={flameLinePath(1)} len={250} t0={12200} dur={1500} now={now} sw={0.35} op={0.08} />
        {/* Inner chamber walls */}
        <TLine x1={660} y1={CY - 70} x2={840} y2={CY - 70}
            t0={12500} dur={800} now={now} sw={0.3} op={0.06} />
        <TLine x1={660} y1={CY + 70} x2={840} y2={CY + 70}
            t0={12600} dur={800} now={now} sw={0.3} op={0.06} />
        {/* Fuel injectors */}
        {[0, 1, 2, 3].map(i => {
            const x = 670 + i * 42;
            return (
                <g key={i}>
                    <TCirc cx={x} cy={CY - 210 + i * 2} r={4}
                        t0={13200 + i * 150} dur={250} now={now} sw={0.3} op={0.07} />
                    <TLine x1={x} y1={CY - 205 + i * 2} x2={x} y2={CY - 105}
                        t0={13300 + i * 150} dur={400} now={now} sw={0.2} op={0.05} />
                </g>
            );
        })}
    </g>
);

// 11. Turbine blades (draw from rear forward)
const TurbBlades: React.FC<{ now: number }> = ({ now }) => {
    const blades = turbBladeCoords();
    const reversed = [...blades].reverse();
    return (
        <g>
            {reversed.map((b, oi) => {
                const t = 14500 + oi * 200;
                const lean = -8; // turbine blades lean opposite
                return (
                    <g key={oi}>
                        <TLine x1={b.x + lean} y1={b.topY} x2={b.x - lean * 0.4} y2={b.coreTopY}
                            t0={t} dur={350} now={now} sw={0.45} op={0.1} />
                        <TLine x1={b.x + lean} y1={b.botY} x2={b.x - lean * 0.4} y2={b.coreBotY}
                            t0={t + 100} dur={350} now={now} sw={0.45} op={0.1} />
                    </g>
                );
            })}
        </g>
    );
};

// 12. Exhaust nozzle
const Exhaust: React.FC<{ now: number }> = ({ now }) => (
    <g>
        {/* Outer exhaust shroud */}
        <TPath d={exhaustShroudTop} len={120} t0={16500} dur={800} now={now} sw={0.5} op={0.11} />
        <TPath d={exhaustShroudBot} len={120} t0={16600} dur={800} now={now} sw={0.5} op={0.11} />
        {/* Inner exhaust cone */}
        <TPath d={exhaustConeTop} len={200} t0={17000} dur={800} now={now} sw={0.4} op={0.09} />
        <TPath d={exhaustConeBot} len={200} t0={17100} dur={800} now={now} sw={0.4} op={0.09} />
        {/* Nozzle exit plane */}
        <TLine x1={1250} y1={CY - 80} x2={1250} y2={CY + 80}
            t0={17500} dur={400} now={now} sw={0.4} op={0.08} />
        {/* Exit inner */}
        <TLine x1={1220} y1={CY - 10} x2={1220} y2={CY + 10}
            t0={17600} dur={200} now={now} sw={0.3} op={0.06} />
    </g>
);

// 13. Bypass duct separators (vertical section lines in duct space)
const BypassDuct: React.FC<{ now: number }> = ({ now }) => {
    // Duct is between outer cowling and core casing
    const stations = [400, 520, 640, 760, 880, 1000];
    return (
        <g>
            {stations.map((x, i) => {
                const outerR = 220 - (x - 200) * 0.05;
                const innerR = 80 + (x - 330) * 0.06;
                return (
                    <g key={i}>
                        <TLine x1={x} y1={CY - outerR} x2={x} y2={CY - innerR}
                            t0={18500 + i * 120} dur={300} now={now} sw={0.2} op={0.04} />
                        <TLine x1={x} y1={CY + outerR} x2={x} y2={CY + innerR}
                            t0={18500 + i * 120} dur={300} now={now} sw={0.2} op={0.04} />
                    </g>
                );
            })}
        </g>
    );
};

// 14. Dimension lines
const Dims: React.FC<{ now: number }> = ({ now }) => (
    <g>
        {/* Overall length */}
        <TLine x1={155} y1={CY - 260} x2={1250} y2={CY - 260}
            t0={19500} dur={1200} now={now} sw={0.25} op={0.06} />
        <TLine x1={155} y1={CY - 267} x2={155} y2={CY - 253}
            t0={19500} dur={150} now={now} sw={0.3} op={0.08} />
        <TLine x1={1250} y1={CY - 267} x2={1250} y2={CY - 253}
            t0={20500} dur={150} now={now} sw={0.3} op={0.08} />
        <FText x={700} y={CY - 268} text="L = 1095mm" t0={20200} dur={600} now={now} size={6.5} op={0.07} anchor="middle" />

        {/* Fan diameter */}
        <TLine x1={130} y1={CY - 218} x2={130} y2={CY + 218}
            t0={20000} dur={800} now={now} sw={0.25} op={0.06} />
        <TLine x1={123} y1={CY - 218} x2={137} y2={CY - 218}
            t0={20000} dur={100} now={now} sw={0.3} op={0.08} />
        <TLine x1={123} y1={CY + 218} x2={137} y2={CY + 218}
            t0={20600} dur={100} now={now} sw={0.3} op={0.08} />
        <FText x={110} y={CY + 5} text="∅ 436" t0={20400} dur={600} now={now} size={6} op={0.06} anchor="middle" />

        {/* Section labels */}
        <FText x={270} y={CY + 252} text="FAN" t0={21500} dur={500} now={now} size={7} op={0.07} anchor="middle" />
        <FText x={460} y={CY + 252} text="COMPRESSOR" t0={21700} dur={500} now={now} size={7} op={0.07} anchor="middle" />
        <FText x={720} y={CY + 252} text="COMBUSTION" t0={21900} dur={500} now={now} size={7} op={0.07} anchor="middle" />
        <FText x={920} y={CY + 252} text="TURBINE" t0={22100} dur={500} now={now} size={7} op={0.07} anchor="middle" />
        <FText x={1120} y={CY + 252} text="EXHAUST" t0={22300} dur={500} now={now} size={7} op={0.07} anchor="middle" />

        {/* Section divider dashes */}
        {[330, 660, 860, 1060].map((x, i) => (
            <TLine key={x} x1={x} y1={CY + 235} x2={x} y2={CY + 260}
                t0={21400 + i * 200} dur={200} now={now} sw={0.2} op={0.05} />
        ))}
    </g>
);

// 15. Title block & specs
const Title: React.FC<{ now: number }> = ({ now }) => (
    <g>
        <FText x={55} y={52} text="OPTIMUS-T14 REV.3" t0={23000} dur={800} now={now} size={9} op={0.12} />
        <FText x={55} y={66} text="TURBOFAN ENGINE — LONGITUDINAL SECTION A-A" t0={23300} dur={800} now={now} size={6.5} op={0.07} />
        {(() => {
            const p = Math.min(1, Math.max(0, (now - 23500) / 600));
            if (p <= 0) return null;
            return <line x1={55} y1={72} x2={55 + 320 * p} y2={72}
                stroke={`${L}${0.06 * p})`} strokeWidth="0.3" />;
        })()}

        <FText x={W - 50} y={H - 68} text="MATERIAL: Ti-6Al-4V / Inconel 718" t0={23800} dur={600} now={now} size={6.5} op={0.07} anchor="end" />
        <FText x={W - 50} y={H - 55} text="SCALE 1:4  |  THIRD ANGLE PROJECTION" t0={24100} dur={600} now={now} size={6} op={0.06} anchor="end" />
        <FText x={W - 50} y={H - 43} text="TOLERANCE: ±0.005mm" t0={24400} dur={600} now={now} size={5.5} op={0.05} anchor="end" />
    </g>
);

// Vignette overlay
const Vig: React.FC = () => (
    <>
        <defs>
            <radialGradient id="bp-vig" cx="50%" cy="50%" r="62%">
                <stop offset="0%" stopColor="transparent" />
                <stop offset="100%" stopColor="#060609" stopOpacity="0.85" />
            </radialGradient>
        </defs>
        <rect width={W} height={H} fill="url(#bp-vig)" pointerEvents="none" />
    </>
);

/* ================================================================
   MAIN DEMO
   ================================================================ */

function BlueprintDemo() {
    const startRef = useRef(Date.now());
    const progressRef = useRef<HTMLDivElement>(null);
    const timeRef = useRef<HTMLSpanElement>(null);
    const labelRef = useRef<HTMLSpanElement>(null);
    const [now, setNow] = React.useState(0);

    useEffect(() => {
        let raf: number;
        const tick = () => {
            const t = (Date.now() - startRef.current) % LOOP;
            setNow(t);
            if (progressRef.current) progressRef.current.style.width = `${(t / LOOP) * 100}%`;
            if (timeRef.current) timeRef.current.textContent = `${(t / 1000).toFixed(1)}s`;
            if (labelRef.current) {
                let lbl = 'INITIALIZING';
                if (t > 23000) lbl = 'OPTIMUS-T14 ASSEMBLY';
                else if (t > 19500) lbl = 'DIMENSIONING';
                else if (t > 18500) lbl = 'BYPASS DUCT';
                else if (t > 16500) lbl = 'EXHAUST NOZZLE';
                else if (t > 14500) lbl = 'TURBINE STAGES';
                else if (t > 12000) lbl = 'COMBUSTION CHAMBER';
                else if (t > 9500) lbl = 'COMPRESSOR STAGES';
                else if (t > 7000) lbl = 'CORE CASING';
                else if (t > 5500) lbl = 'FAN BLADES';
                else if (t > 4500) lbl = 'NOSE SPINNER';
                else if (t > 3000) lbl = 'OUTER NACELLE';
                else if (t > 1800) lbl = 'CONSTRUCTION GEOMETRY';
                else if (t > 800) lbl = 'CENTER AXIS';
                else if (t > 100) lbl = 'REGISTRATION';
                labelRef.current.textContent = lbl;
            }
            raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, []);

    const handleReset = useCallback(() => {
        startRef.current = Date.now();
        setNow(0);
    }, []);

    return (
        <div className="bg-[#060609] rounded-2xl p-5 -mx-2 overflow-hidden">
            {/* Status bar */}
            <div className="flex items-center gap-3 mb-3">
                <span ref={labelRef}
                    className="text-[10px] font-mono tracking-[0.15em] text-white/20 uppercase w-56 truncate">
                    INITIALIZING
                </span>
                <div className="flex-1 h-[2px] bg-white/[0.02] rounded-full overflow-hidden">
                    <div ref={progressRef}
                        className="h-full bg-gradient-to-r from-white/5 via-white/[0.03] to-white/5 rounded-full"
                        style={{ width: '0%' }} />
                </div>
                <span ref={timeRef} className="text-[10px] font-mono text-white/8 w-10 text-right">0.0s</span>
                <button onClick={handleReset}
                    className="text-[9px] font-mono text-white/10 hover:text-white/30 uppercase tracking-wider transition-colors px-2 py-1 border border-white/[0.03] hover:border-white/8 rounded">
                    Reset
                </button>
            </div>

            <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: '72vh' }}>
                <rect width={W} height={H} fill="#060609" />

                <Grid now={now} />
                <Reg now={now} />
                <Axis now={now} />
                <Constr now={now} />
                <Nacelle now={now} />
                <Spinner now={now} />
                <FanBlades now={now} />
                <CoreCasing now={now} />
                <CompBlades now={now} />
                <Combustion now={now} />
                <TurbBlades now={now} />
                <Exhaust now={now} />
                <BypassDuct now={now} />
                <Dims now={now} />
                <Title now={now} />

                <Vig />
            </svg>
        </div>
    );
}

/* ================================================================
   PAGE
   ================================================================ */

export const OnboardingAnimationPage: React.FC = () => (
    <DesignSystemPage
        title="Onboarding Animation"
        description="Engineering blueprint — turbofan engine cross-section"
    >
        <Section
            title="Turbofan Engine Blueprint"
            description="Longitudinal cross-section of a turbofan engine drawn line-by-line. Proper aerodynamic profile with intake lip, fan blades, multi-stage compressor (14 stages), annular combustion chamber, turbine stages, and converging exhaust nozzle. 30-second build with overlapping construction across sections."
        >
            <BlueprintDemo />
        </Section>
    </DesignSystemPage>
);

export default OnboardingAnimationPage;
