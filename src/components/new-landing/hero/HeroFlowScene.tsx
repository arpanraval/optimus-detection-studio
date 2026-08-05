import React, { useEffect, useRef, useState } from 'react';
import { Icon } from '../../Icon';

/**
 * HeroFlowScene — full-bleed isometric platform illustration.
 *
 * Composition follows the approved reference: one central platform, capability
 * panels in 3D perspective all around it, knowledge lattice above, medallions
 * on the baseline. Every panel carries REAL detection-engineering content —
 * threat intel, vendor rule sources, KQL, ATT&CK coverage — so the scene is
 * legible to a practitioner at a glance.
 *
 * Palette (strict): PLUM hero accent · INK counterweight · TEAL = validated.
 */

const PLUM = '#783264';
const PLUM_SOFT = '#9a4c82';
const INK = '#232532';
const TEAL = '#4D7C6F';

const STAGE_W = 1280;
const STAGE_H = 680;

// ─── Isometric helpers ───────────────────────────────────────────────────────
const iso = (x: number, y: number): [number, number] =>
  [640 + (x - y) * 0.7071, 425 + (x + y) * 0.3536];

const Cube: React.FC<{ x: number; y: number; base: string; light: string; dark: string; s?: number }> = ({ x, y, base, light, dark, s = 1 }) => {
  const [sx, sy] = iso(x, y);
  const w = 14 * s, h = 7 * s, d = 9 * s;
  return (
    <g transform={`translate(${sx} ${sy})`}>
      <path d={`M -${w} 0 L 0 ${h} L 0 ${h + d} L -${w} ${d} Z`} fill={base} />
      <path d={`M ${w} 0 L 0 ${h} L 0 ${h + d} L ${w} ${d} Z`} fill={dark} />
      <path d={`M 0 -${h} L ${w} 0 L 0 ${h} L -${w} 0 Z`} fill={light} />
    </g>
  );
};

const TILES = [
  { x: -128, y: -22, base: PLUM, light: '#a05a8c', dark: '#5d2750', s: 1.1 },
  { x: -52, y: -128, base: PLUM_SOFT, light: '#b06f9e', dark: '#7c3f6a', s: 0.85 },
  { x: 82, y: -104, base: INK, light: '#3a3d4e', dark: '#181a24', s: 1 },
  { x: 138, y: 12, base: PLUM, light: '#a05a8c', dark: '#5d2750', s: 0.8 },
  { x: 96, y: 92, base: TEAL, light: '#6a9887', dark: '#3a5f55', s: 1 },
  { x: -34, y: 126, base: INK, light: '#3a3d4e', dark: '#181a24', s: 0.75 },
  { x: -118, y: 74, base: PLUM_SOFT, light: '#b06f9e', dark: '#7c3f6a', s: 0.9 },
];

// ─── Wavy flow bundles ───────────────────────────────────────────────────────
const bundle = (x0: number, y0: number, x1: number, y1: number, n: number, spread: number) =>
  Array.from({ length: n }, (_, i) => {
    const t = i - (n - 1) / 2;
    const sy = y0 + t * spread;
    const ey = y1 + t * (spread * 0.45);
    const mx = (x0 + x1) / 2;
    return `M ${x0} ${sy} C ${mx} ${sy + t * 6}, ${mx} ${ey - t * 4}, ${x1} ${ey}`;
  });

const LEFT_BUNDLE = bundle(258, 318, 528, 392, 6, 17);
const RIGHT_BUNDLE = bundle(1022, 318, 752, 392, 6, 17);

const ANCHOR_STRANDS = [
  { d: 'M 250 592 C 350 560, 420 520, 496 478', c: PLUM },
  { d: 'M 1030 592 C 930 560, 860 520, 784 478', c: TEAL },
];

// ─── Knowledge lattice ───────────────────────────────────────────────────────
const LAT: { x: number; y: number; fill?: string }[] = [
  { x: 640, y: 96, fill: PLUM },
  { x: 566, y: 132 }, { x: 714, y: 132 },
  { x: 492, y: 168, fill: TEAL }, { x: 640, y: 168 }, { x: 788, y: 168, fill: INK },
  { x: 566, y: 204 }, { x: 714, y: 204 },
  { x: 640, y: 240, fill: PLUM },
];
const LAT_E: [number, number][] = [
  [0, 1], [0, 2], [1, 3], [1, 4], [2, 4], [2, 5], [3, 6], [4, 6], [4, 7], [5, 7], [6, 8], [7, 8],
];

const CAPABILITIES = [
  'RULE AUTHORING', 'VENDOR CONTENT', 'AI WORKFLOWS',
  'THREAT RESEARCH', 'MITRE COVERAGE', 'REPORTS & DASHBOARDS',
];

export const HeroFlowScene: React.FC = () => {
  const [active, setActive] = useState(0);
  const [scale, setScale] = useState(1);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const id = setInterval(() => setActive((s) => (s + 1) % CAPABILITIES.length), 2400);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setScale(e.contentRect.width / STAGE_W));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div className="select-none" aria-hidden="true">
      {/* Fixed-size stage, scaled to container width */}
      <div ref={wrapRef} className="relative w-full overflow-visible" style={{ aspectRatio: `${STAGE_W}/${STAGE_H}` }}>
        <div className="absolute top-0 left-0" style={{ width: STAGE_W, height: STAGE_H, transform: `scale(${scale})`, transformOrigin: 'top left' }}>

          {/* ══ SVG underlay ══ */}
          <svg viewBox={`0 0 ${STAGE_W} ${STAGE_H}`} width={STAGE_W} height={STAGE_H} className="absolute inset-0" fill="none">
            <defs>
              <radialGradient id="hp4-core" cx="35%" cy="28%" r="90%">
                <stop offset="0%" stopColor="#a05a8c" />
                <stop offset="100%" stopColor={PLUM} />
              </radialGradient>
              <radialGradient id="hp4-sheen" cx="42%" cy="35%" r="75%">
                <stop offset="0%" stopColor="#ffffff" />
                <stop offset="100%" stopColor="#eff0f5" />
              </radialGradient>
              <radialGradient id="hp4-wash-l" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor={PLUM} stopOpacity="0.13" />
                <stop offset="100%" stopColor={PLUM} stopOpacity="0" />
              </radialGradient>
              <radialGradient id="hp4-wash-r" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor={TEAL} stopOpacity="0.14" />
                <stop offset="100%" stopColor={TEAL} stopOpacity="0" />
              </radialGradient>
              <filter id="hp4-soft" x="-40%" y="-40%" width="180%" height="180%">
                <feDropShadow dx="0" dy="5" stdDeviation="8" floodColor="#0f121e" floodOpacity="0.07" />
              </filter>
              <filter id="hp4-slab" x="-40%" y="-40%" width="180%" height="180%">
                <feDropShadow dx="0" dy="18" stdDeviation="24" floodColor="#1a1030" floodOpacity="0.14" />
              </filter>
            </defs>

            {/* Ground washes */}
            <ellipse cx="470" cy="620" rx="280" ry="66" fill="url(#hp4-wash-l)" />
            <ellipse cx="810" cy="620" rx="280" ry="66" fill="url(#hp4-wash-r)" />

            {/* Lattice */}
            {LAT_E.map(([a, b], i) => (
              <line key={i} x1={LAT[a].x} y1={LAT[a].y} x2={LAT[b].x} y2={LAT[b].y} stroke="#d2d3dd" strokeWidth="1.2" />
            ))}
            <line x1="640" y1="242" x2="640" y2="262" stroke="#d2d3dd" strokeWidth="1.2" strokeDasharray="2 4" />
            {LAT.map((n, i) => (
              <circle key={i} cx={n.x} cy={n.y} r={n.fill ? 4.2 : 4.6}
                fill={n.fill ?? '#ffffff'} stroke={n.fill ? 'none' : '#b4b6c2'} strokeWidth="1.3" />
            ))}
            <line x1="640" y1="58" x2="640" y2="92" stroke="#d2d3dd" strokeWidth="1.2" />
            <circle cx="640" cy="40" r="19" fill="#ffffff" stroke={`${PLUM}45`} strokeWidth="1.2" filter="url(#hp4-soft)" />
            <g fill={PLUM}>
              <circle cx="634" cy="45" r="2.6" /><circle cx="647" cy="40" r="2.6" /><circle cx="634" cy="34" r="2.6" />
            </g>
            <path d="M 637 44 L 644 41 M 637 36 L 644 39" stroke={PLUM} strokeWidth="1.4" strokeLinecap="round" />

            {/* Wavy flow bundles */}
            {LEFT_BUNDLE.map((d, i) => (
              <path key={`lb-${i}`} d={d} stroke={i % 3 === 2 ? INK : PLUM}
                strokeOpacity={0.16 + 0.07 * (5 - Math.abs(i - 2.5) * 2)}
                strokeWidth="1.4" strokeDasharray={i % 2 ? '4 6' : undefined} strokeLinecap="round" />
            ))}
            {RIGHT_BUNDLE.map((d, i) => (
              <path key={`rb-${i}`} d={d} stroke={i % 3 === 2 ? TEAL : INK}
                strokeOpacity={0.14 + 0.06 * (5 - Math.abs(i - 2.5) * 2)}
                strokeWidth="1.4" strokeDasharray={i % 2 ? '4 6' : undefined} strokeLinecap="round" />
            ))}
            {[LEFT_BUNDLE[1], LEFT_BUNDLE[4], RIGHT_BUNDLE[1], RIGHT_BUNDLE[4]].map((d, i) => (
              <circle key={`bd-${i}`} r="3" fill={i < 2 ? PLUM : INK} fillOpacity="0.8">
                <animateMotion dur="3.8s" repeatCount="indefinite" begin={`${i * 1.1}s`} path={d} />
              </circle>
            ))}
            {ANCHOR_STRANDS.map((s, i) => (
              <g key={`as-${i}`}>
                <path d={s.d} stroke={s.c} strokeOpacity="0.3" strokeWidth="1.4" strokeDasharray="3 6" strokeLinecap="round" />
                <circle r="2.8" fill={s.c} fillOpacity="0.75">
                  <animateMotion dur="4.6s" repeatCount="indefinite" begin={`${1 + i * 1.7}s`} path={s.d} />
                </circle>
              </g>
            ))}

            {/* ── Two-tier platform ── */}
            <ellipse cx="640" cy="580" rx="300" ry="46" fill="#1a1030" fillOpacity="0.06" />
            <g transform="translate(640 462) scale(1 0.5) rotate(45)">
              <rect x="-212" y="-212" width="424" height="424" rx="34" fill="#d7d8e1" />
            </g>
            <g transform="translate(640 448) scale(1 0.5) rotate(45)">
              <rect x="-212" y="-212" width="424" height="424" rx="34" fill="#e8e9ef" />
            </g>
            <g transform="translate(640 439) scale(1 0.5) rotate(45)">
              <rect x="-186" y="-186" width="372" height="372" rx="28" fill="#c9cad4" />
            </g>
            <g filter="url(#hp4-slab)">
              <g transform="translate(640 425) scale(1 0.5) rotate(45)">
                <rect x="-186" y="-186" width="372" height="372" rx="28" fill="url(#hp4-sheen)" stroke="rgba(0,0,0,0.05)" />
              </g>
            </g>
            <g transform="translate(640 425) scale(1 0.5) rotate(45)">
              {[-124, -62, 0, 62, 124].map((gx) =>
                [-124, -62, 0, 62, 124].map((gy) =>
                  Math.abs(gx) + Math.abs(gy) > 66 ? (
                    <circle key={`${gx}${gy}`} cx={gx} cy={gy} r="2" fill="#000000" fillOpacity="0.07" />
                  ) : null,
                ),
              )}
              <rect x="-158" y="-158" width="316" height="316" rx="22" stroke="#000000" strokeOpacity="0.05" strokeWidth="1.5" strokeDasharray="2 8" fill="none" />
            </g>
            {/* Core */}
            <ellipse cx="640" cy="427" rx="88" ry="44" fill="#ffffff" stroke="rgba(0,0,0,0.05)" />
            <ellipse cx="640" cy="427" rx="100" ry="50" stroke={`${PLUM}30`} strokeWidth="1.2" strokeDasharray="3 7" fill="none" />
            <ellipse cx="640" cy="424" rx="58" ry="29" fill="#5d2750" />
            <rect x="582" y="408" width="116" height="16" fill="#5d2750" />
            <ellipse cx="640" cy="408" rx="58" ry="29" fill="url(#hp4-core)" className="hfs-core-pulse" />
            <ellipse cx="622" cy="400" rx="20" ry="8" fill="#ffffff" fillOpacity="0.2" />
            {/* Floating motes */}
            <circle cx="576" cy="352" r="4" fill={INK} className="hfs-float hfs-float-2" />
            <circle cx="742" cy="366" r="3.2" fill={PLUM} className="hfs-float hfs-float-3" />
            {TILES.map((t, i) => <Cube key={i} {...t} />)}

            {/* Baseline */}
            <line x1="140" y1="614" x2="1140" y2="614" stroke="#c2c3ce" strokeWidth="1.2" strokeDasharray="2 8" strokeLinecap="round" />
            <circle cx="206" cy="614" r="40" fill="#ffffff" stroke="rgba(0,0,0,0.07)" filter="url(#hp4-soft)" />
            <g stroke={PLUM} strokeWidth="1.9" strokeLinecap="round" fill="none">
              <circle cx="199" cy="607" r="6.5" />
              <path d="M 188 627 C 190 618, 208 618, 210 627" />
              <circle cx="217" cy="605" r="5" />
              <path d="M 213 623 C 217 616, 226 617, 228 623" />
            </g>
            <circle cx="1074" cy="614" r="40" fill="#ffffff" stroke="rgba(0,0,0,0.07)" filter="url(#hp4-soft)" />
            <text x="1074" y="622" textAnchor="middle" fontSize="22" fontWeight="700" fill={INK} fontFamily="'JetBrains Mono', monospace">{'</>'}</text>
            <circle cx="336" cy="614" r="6" fill="#ffffff" stroke={PLUM} strokeWidth="1.5" />
            <circle cx="416" cy="614" r="3.5" fill={PLUM} />
            <circle cx="944" cy="614" r="6" fill="#ffffff" stroke={INK} strokeWidth="1.5" />
            <circle cx="864" cy="614" r="3.5" fill={TEAL} />
          </svg>

          {/* Optimus mark on the core */}
          <div className="absolute" style={{ left: 624, top: 392 }}>
            <Icon name="optimus-logo" className="w-8 h-8 text-white opacity-90" />
          </div>

          {/* ══ HTML panels — 3D perspective, REAL content ══ */}

          {/* LEFT 1 — Threat intel report */}
          <div className="absolute hfs-float hfs-float-1" style={{ left: -8, top: 112, transform: 'perspective(1500px) rotateY(30deg) rotateX(5deg)' }}>
            <div className="w-[268px] rounded-2xl p-5" style={{ backgroundColor: '#faf1f7', border: `1px solid ${PLUM}22`, boxShadow: '0 28px 56px -22px rgba(26,16,48,0.28)' }}>
              <div className="flex items-center gap-2 mb-3">
                <span className="mono text-[9px] font-bold px-2 py-0.5 rounded uppercase tracking-wider bg-red-500/10 text-red-600 border border-red-500/20">Critical</span>
                <span className="mono text-[9px] font-bold px-2 py-0.5 rounded uppercase tracking-wider" style={{ backgroundColor: `${PLUM}12`, color: PLUM }}>Threat Intel</span>
              </div>
              <div className="text-[13px] font-bold leading-snug mb-1" style={{ color: INK }}>
                Lazarus — Trojanized PDF Campaign
              </div>
              <div className="text-[10px] mb-3" style={{ color: '#8b8d99' }}>Mandiant · auto-digested 2h ago</div>
              <div className="flex flex-wrap gap-1.5">
                {['T1547.001', '+7 TTPs'].map((t) => (
                  <span key={t} className="mono text-[9px] px-2 py-0.5 rounded border" style={{ color: PLUM, borderColor: `${PLUM}35`, backgroundColor: '#ffffff' }}>{t}</span>
                ))}
              </div>
            </div>
          </div>

          {/* LEFT 2 — Vendor rule sources */}
          <div className="absolute hfs-float hfs-float-2" style={{ left: 182, top: 62, transform: 'perspective(1500px) rotateY(27deg) rotateX(4deg)' }}>
            <div className="w-[220px] rounded-2xl p-5 bg-white" style={{ border: '1px solid rgba(0,0,0,0.06)', boxShadow: '0 24px 48px -20px rgba(26,16,48,0.22)' }}>
              <div className="mono text-[9px] font-bold tracking-[0.2em] uppercase mb-3" style={{ color: '#8b8d99' }}>Vendor Content</div>
              <div className="space-y-2.5">
                {[
                  { logo: '/logos/integrations/sigma.svg', name: 'Sigma rules', count: '3,200+' },
                  { logo: '/logos/integrations/splunk.svg', name: 'Splunk ESCU', count: '1,100+' },
                  { logo: '/logos/integrations/elastic.svg', name: 'Elastic rules', count: '900+' },
                ].map((r) => (
                  <div key={r.name} className="flex items-center gap-2.5">
                    <img src={r.logo} alt="" className="w-4 h-4 object-contain opacity-85" />
                    <span className="text-[11px] font-medium flex-1" style={{ color: INK }}>{r.name}</span>
                    <span className="mono text-[9px] font-bold" style={{ color: TEAL }}>{r.count}</span>
                  </div>
                ))}
              </div>
              <div className="mt-4 inline-flex px-3.5 py-1.5 rounded-lg" style={{ backgroundColor: PLUM }}>
                <span className="mono text-[9px] font-bold text-white tracking-wide">IMPORT TO LIBRARY</span>
              </div>
            </div>
          </div>

          {/* LEFT 3 — Coverage stat */}
          <div className="absolute hfs-float hfs-float-3" style={{ left: 258, top: 300, transform: 'perspective(1500px) rotateY(24deg) rotateX(3deg)' }}>
            <div className="w-[204px] rounded-2xl p-5 bg-white" style={{ border: '1px solid rgba(0,0,0,0.06)', boxShadow: '0 22px 44px -18px rgba(26,16,48,0.2)' }}>
              <div className="mono text-[9px] font-bold tracking-[0.2em] uppercase mb-2" style={{ color: '#8b8d99' }}>MITRE Coverage</div>
              <div className="flex items-end gap-3">
                <span className="text-[30px] font-black leading-none" style={{ color: INK }}>61%</span>
                <svg width="86" height="34" viewBox="0 0 86 34">
                  <path d="M 2 30 C 16 27, 24 20, 38 18 C 52 16, 62 8, 84 4" stroke={PLUM} strokeWidth="2.2" strokeLinecap="round" fill="none" />
                  <circle cx="84" cy="4" r="3.2" fill={PLUM} />
                </svg>
              </div>
              <div className="text-[10px] mt-2" style={{ color: '#8b8d99' }}>199 of 356 techniques have a detection</div>
            </div>
          </div>

          {/* RIGHT 1 — AI rule authoring (real KQL) */}
          <div className="absolute hfs-float hfs-float-2" style={{ right: -20, top: 58, transform: 'perspective(1500px) rotateY(-30deg) rotateX(5deg)' }}>
            <div className="w-[318px] rounded-2xl p-5" style={{ backgroundColor: INK, boxShadow: '0 30px 60px -22px rgba(15,10,35,0.4)' }}>
              <div className="flex items-center justify-between mb-3.5">
                <div className="flex items-center gap-2">
                  <div className="flex gap-1.5">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: '#3c3f4e' }} />
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: '#3c3f4e' }} />
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: PLUM_SOFT }} />
                  </div>
                  <span className="mono text-[10px]" style={{ color: '#8b8d99' }}>lazarus-run-key.kql</span>
                </div>
                <span className="mono text-[8px] font-bold px-2 py-0.5 rounded" style={{ backgroundColor: `${PLUM_SOFT}25`, color: '#c99abc' }}>AI DRAFT</span>
              </div>
              <div className="mono text-[10.5px] leading-[1.8] whitespace-nowrap overflow-hidden">
                <div><span style={{ color: '#d5d7e2' }}>DeviceRegistryEvents</span></div>
                <div><span style={{ color: PLUM_SOFT }}>| where</span> <span style={{ color: '#b8bac6' }}>RegistryKey</span> <span style={{ color: PLUM_SOFT }}>has</span> <span style={{ color: '#7fae9e' }}>@"CurrentVersion\Run"</span></div>
                <div><span style={{ color: PLUM_SOFT }}>| where</span> <span style={{ color: '#b8bac6' }}>InitiatingProcess</span> <span style={{ color: PLUM_SOFT }}>=~</span> <span style={{ color: '#7fae9e' }}>"mshta.exe"</span></div>
                <div><span style={{ color: PLUM_SOFT }}>| project</span> <span style={{ color: '#b8bac6' }}>Timestamp, DeviceName, Key</span></div>
              </div>
              <div className="flex items-center justify-between mt-4 pt-3" style={{ borderTop: '1px solid #3c3f4e' }}>
                <span className="mono text-[9px] font-bold px-2 py-1 rounded flex items-center gap-1.5" style={{ backgroundColor: `${TEAL}20`, color: '#7fae9e' }}>
                  ✓ VALIDATED
                </span>
                <div className="flex items-center gap-2">
                  <span className="mono text-[8px]" style={{ color: '#8b8d99' }}>DEPLOY →</span>
                  {['sentinel', 'splunk', 'elastic', 'crowdstrike'].map((v) => (
                    <img key={v} src={`/logos/integrations/${v}.svg`} alt="" className="w-4 h-4 object-contain opacity-80" />
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT 2 — ATT&CK matrix */}
          <div className="absolute hfs-float hfs-float-3" style={{ right: 244, top: 262, transform: 'perspective(1500px) rotateY(-26deg) rotateX(3deg)' }}>
            <div className="w-[200px] rounded-2xl p-5 bg-white" style={{ border: '1px solid rgba(0,0,0,0.06)', boxShadow: '0 24px 48px -20px rgba(26,16,48,0.22)' }}>
              <div className="mono text-[9px] font-bold tracking-[0.2em] uppercase mb-3" style={{ color: '#8b8d99' }}>ATT&CK Matrix</div>
              <div className="grid grid-cols-5 gap-1.5">
                {Array.from({ length: 20 }).map((_, i) => {
                  const covered = [1, 3, 7, 10, 13, 18].includes(i);
                  const hot = i === 12;
                  return (
                    <span key={i} className="h-[21px] rounded-md"
                      style={{
                        backgroundColor: hot ? PLUM : covered ? TEAL : '#ffffff',
                        opacity: covered && !hot ? 0.85 : 1,
                        border: hot || covered ? 'none' : '1px solid #e4e5eb',
                      }} />
                  );
                })}
              </div>
              <div className="mono text-[9px] mt-3" style={{ color: '#8b8d99' }}>
                <span className="font-bold" style={{ color: TEAL }}>199</span> covered · <span className="font-bold" style={{ color: PLUM }}>1</span> hot gap
              </div>
            </div>
          </div>

          {/* RIGHT 3 — Autonomous research */}
          <div className="absolute hfs-float hfs-float-1" style={{ right: 64, top: 318, transform: 'perspective(1500px) rotateY(-28deg) rotateX(4deg)' }}>
            <div className="w-[186px] rounded-2xl p-5 bg-white" style={{ border: '1px solid rgba(0,0,0,0.06)', boxShadow: '0 22px 44px -18px rgba(26,16,48,0.2)' }}>
              <div className="mono text-[9px] font-bold tracking-[0.15em] uppercase mb-2" style={{ color: '#8b8d99' }}>Threat Research</div>
              <svg width="146" height="100" viewBox="0 0 146 100">
                <g stroke="#c6c8d2" strokeWidth="1.2" fill="none">
                  <path d="M 73 16 C 55 28, 47 34, 43 46" />
                  <path d="M 73 16 C 91 28, 99 34, 103 46" />
                  <line x1="43" y1="62" x2="43" y2="76" />
                  <line x1="103" y1="62" x2="103" y2="76" />
                </g>
                <rect x="65" y="2" width="16" height="16" rx="5" fill="#ffffff" stroke={PLUM} strokeWidth="1.5" />
                <circle cx="43" cy="54" r="8" fill="#ffffff" stroke={PLUM} strokeWidth="1.4" />
                <circle cx="103" cy="54" r="8" fill="#ffffff" stroke={PLUM} strokeWidth="1.4" />
                <circle cx="43" cy="85" r="8" fill="#ffffff" stroke={TEAL} strokeWidth="1.5" />
                <circle cx="103" cy="85" r="8" fill="#ffffff" stroke={TEAL} strokeWidth="1.5" />
                <path d="M 39.5 85 l 2.5 2.5 l 4.5 -5.5" stroke={TEAL} strokeWidth="1.4" fill="none" strokeLinecap="round" />
                <path d="M 99.5 85 l 2.5 2.5 l 4.5 -5.5" stroke={TEAL} strokeWidth="1.4" fill="none" strokeLinecap="round" />
              </svg>
              <div className="mono text-[9px] mt-1.5" style={{ color: '#8b8d99' }}>
                <span className="font-bold" style={{ color: INK }}>T1218.005</span> · 3 rules drafted
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Capability chips ── */}
      <div className="mt-4 flex items-center gap-2 flex-wrap justify-center px-2">
        {CAPABILITIES.map((c, i) => (
          <span
            key={c}
            className={`mono text-[9px] font-bold tracking-[0.18em] px-3 py-1.5 rounded-full border transition-all duration-500 ${
              i === active
                ? 'text-white border-transparent shadow-[0_4px_14px_rgba(120,50,100,0.35)]'
                : 'text-on-surface-variant border-outline-variant bg-surface-container-highest'
            }`}
            style={i === active ? { backgroundColor: PLUM } : undefined}
          >
            {c}
          </span>
        ))}
      </div>
    </div>
  );
};
