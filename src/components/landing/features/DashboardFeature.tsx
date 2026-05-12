import React, { useState } from 'react';
import { FeatureSlide, MockupFrame, FeatureCarousel } from '../shared/FeatureSlide';

const MAGENTA = '#783264';
const TEAL = '#4D7C6F';
const RED = '#ef4444';
const AMBER = '#f59e0b';

/* ──────────────────────────────────────────────
   SLIDE 1 — Dashboard
   ────────────────────────────────────────────── */
const DashboardMockup = () => (
  <MockupFrame title="DASHBOARD" accent={MAGENTA}>
    {/* ── Top: Readiness Ring + Stats Row ── */}
    <div className="flex flex-col items-center mb-6">
      {/* Readiness ring */}
      <div className="relative w-40 h-40 mb-3">
        <svg viewBox="0 0 100 100" className="w-full h-full">
          {/* Background track */}
          <circle cx="50" cy="50" r="42" fill="none" stroke="#ffffff08" strokeWidth="7" />
          {/* Gradient arc — magenta to teal */}
          <defs>
            <linearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor={MAGENTA} />
              <stop offset="100%" stopColor={TEAL} />
            </linearGradient>
          </defs>
          <circle
            cx="50" cy="50" r="42" fill="none"
            stroke="url(#ringGrad)" strokeWidth="7"
            strokeDasharray={`${0.64 * 263.9} ${263.9 - 0.64 * 263.9}`}
            strokeLinecap="round"
            transform="rotate(-90 50 50)"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-brand text-5xl font-bold text-white">64</span>
          <span className="mono text-[9px] tracking-[0.2em] text-white/25 mt-0.5">READINESS</span>
        </div>
      </div>
      <p className="mono text-[10px] text-white/30 text-center">
        Defending <span className="text-white/50">143/118</span> threat groups · <span className="text-white/50">48/52</span> campaigns · <span className="text-white/50">5.3%</span> technique coverage
      </p>
    </div>

    {/* ── 6 Stat Cards ── */}
    <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mb-6">
      {[
        { label: 'TECHNIQUES', value: '44', sub: '/ 823', color: MAGENTA },
        { label: 'GROUPS', value: '143', sub: '/ 118', color: MAGENTA },
        { label: 'CAMPAIGNS', value: '48', sub: '/ 52', color: MAGENTA },
        { label: 'PRODUCTION', value: '3,639', sub: '/ 11,811', color: TEAL },
        { label: 'VALIDATED', value: '2', sub: '/ 11,811', color: RED },
        { label: 'QUALITY', value: '42%', sub: '', color: AMBER },
      ].map(s => (
        <div key={s.label} className="border border-white/[0.06] rounded-lg p-3 bg-white/[0.02] text-center">
          <div className="mono text-[8px] text-white/20 tracking-wider mb-1">{s.label}</div>
          <div className="font-brand text-lg sm:text-xl font-bold leading-none" style={{ color: s.color }}>
            {s.value}<span className="text-[10px] text-white/20 font-normal ml-0.5">{s.sub}</span>
          </div>
        </div>
      ))}
    </div>

    {/* ── Charts Row: Coverage Trend + Velocity ── */}
    <div className="grid md:grid-cols-2 gap-4 mb-6">
      {/* Coverage Trend */}
      <div className="border border-white/[0.06] rounded-lg p-4 bg-white/[0.02]">
        <div className="mono text-[9px] text-white/25 tracking-wider mb-3">COVERAGE TREND</div>
        <div className="h-20 flex items-end relative">
          <svg viewBox="0 0 200 60" className="w-full h-full" preserveAspectRatio="none">
            <defs>
              <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={MAGENTA} stopOpacity="0.3" />
                <stop offset="100%" stopColor={MAGENTA} stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d="M0,50 L17,48 L34,45 L51,46 L68,42 L85,38 L102,35 L119,30 L136,28 L153,22 L170,18 L187,15 L200,10"
              fill="none" stroke={MAGENTA} strokeWidth="2" />
            <path d="M0,50 L17,48 L34,45 L51,46 L68,42 L85,38 L102,35 L119,30 L136,28 L153,22 L170,18 L187,15 L200,10 L200,60 L0,60Z"
              fill="url(#trendFill)" />
          </svg>
        </div>
        <div className="flex justify-between mono text-[7px] text-white/15 mt-1">
          {['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'].map(m => (
            <span key={m}>{m}</span>
          ))}
        </div>
      </div>

      {/* Velocity */}
      <div className="border border-white/[0.06] rounded-lg p-4 bg-white/[0.02]">
        <div className="mono text-[9px] text-white/25 tracking-wider mb-3">VELOCITY (WEEKLY)</div>
        <div className="flex items-end gap-1 h-20">
          {[8, 12, 6, 15, 22, 18, 25, 14, 20, 28, 16, 24, 30, 19, 26, 32].map((h, i) => (
            <div key={i} className="flex-1 rounded-t transition-all" style={{
              height: `${(h / 32) * 100}%`,
              backgroundColor: MAGENTA,
              opacity: 0.5 + (i / 32),
            }} />
          ))}
        </div>
        <div className="flex justify-between mono text-[7px] text-white/15 mt-1">
          <span>16w ago</span><span>8w ago</span><span>Now</span>
        </div>
      </div>
    </div>

    {/* ── Bottom 4-Column Section ── */}
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {/* Threat Actors */}
      <div className="border border-white/[0.06] rounded-lg p-3 bg-white/[0.02]">
        <div className="mono text-[8px] text-white/20 tracking-wider mb-2.5">THREAT ACTORS</div>
        {[
          { name: 'APT41', pct: 72 },
          { name: 'Volt Typhoon', pct: 58 },
          { name: 'APT28', pct: 81 },
          { name: 'Mustang Panda', pct: 44 },
        ].map(t => (
          <div key={t.name} className="mb-2">
            <div className="flex justify-between mb-0.5">
              <span className="text-[10px] text-white/40 truncate">{t.name}</span>
              <span className="mono text-[9px] text-white/25">{t.pct}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${t.pct}%`, backgroundColor: MAGENTA }} />
            </div>
          </div>
        ))}
      </div>

      {/* Campaign Readiness */}
      <div className="border border-white/[0.06] rounded-lg p-3 bg-white/[0.02]">
        <div className="mono text-[8px] text-white/20 tracking-wider mb-2.5">CAMPAIGN READINESS</div>
        {[
          { name: 'SolarWinds', pct: 86 },
          { name: 'Operation Wocao', pct: 66 },
        ].map(c => (
          <div key={c.name} className="mb-2.5">
            <div className="flex justify-between mb-0.5">
              <span className="text-[10px] text-white/40 truncate">{c.name}</span>
              <span className="mono text-[9px] font-bold" style={{ color: c.pct > 75 ? TEAL : MAGENTA }}>{c.pct}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${c.pct}%`, backgroundColor: c.pct > 75 ? TEAL : MAGENTA }} />
            </div>
          </div>
        ))}
      </div>

      {/* Sector Coverage */}
      <div className="border border-white/[0.06] rounded-lg p-3 bg-white/[0.02]">
        <div className="mono text-[8px] text-white/20 tracking-wider mb-2.5">SECTOR COVERAGE</div>
        {['Government', 'Private sector', 'Military'].map((s, i) => (
          <div key={s} className="flex items-center gap-2 mb-2">
            <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: [MAGENTA, TEAL, '#005091'][i] }} />
            <span className="text-[10px] text-white/40">{s}</span>
          </div>
        ))}
      </div>

      {/* Threat Origins */}
      <div className="border border-white/[0.06] rounded-lg p-3 bg-white/[0.02]">
        <div className="mono text-[8px] text-white/20 tracking-wider mb-2.5">THREAT ORIGINS</div>
        {[
          { country: 'China', pct: 78 },
          { country: 'Russia', pct: 65 },
          { country: 'Iran', pct: 42 },
          { country: 'North Korea', pct: 38 },
        ].map(o => (
          <div key={o.country} className="flex items-center gap-2 mb-1.5">
            <span className="text-[10px] text-white/40 w-20">{o.country}</span>
            <div className="flex-1 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${o.pct}%`, backgroundColor: MAGENTA }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  </MockupFrame>
);


/* ──────────────────────────────────────────────
   SLIDE 2 — MITRE Focus
   ────────────────────────────────────────────── */
const TACTICS = [
  { name: 'Reconnaissance', rules: 186 },
  { name: 'Resource Development', rules: 141 },
  { name: 'Initial Access', rules: 1657 },
  { name: 'Execution', rules: 1504 },
  { name: 'Persistence', rules: 748 },
  { name: 'Privilege Escalation', rules: 612 },
  { name: 'Defense Evasion', rules: 943 },
  { name: 'Credential Access', rules: 521 },
  { name: 'Discovery', rules: 487 },
  { name: 'Lateral Movement', rules: 312 },
  { name: 'Collection', rules: 198 },
  { name: 'Command and Control', rules: 445 },
  { name: 'Exfiltration', rules: 167 },
  { name: 'Impact', rules: 389 },
];
const MAX_RULES = Math.max(...TACTICS.map(t => t.rules));

const MITREFocusMockup = () => (
  <MockupFrame title="MITRE FOCUS" accent={MAGENTA}>
    <div className="grid md:grid-cols-[auto_1fr] gap-8">
      {/* Left: Readiness ring (compact) */}
      <div className="flex flex-col items-center">
        <div className="relative w-28 h-28 mb-2">
          <svg viewBox="0 0 100 100" className="w-full h-full">
            <circle cx="50" cy="50" r="42" fill="none" stroke="#ffffff08" strokeWidth="6" />
            <defs>
              <linearGradient id="ringGrad2" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor={MAGENTA} />
                <stop offset="100%" stopColor={TEAL} />
              </linearGradient>
            </defs>
            <circle
              cx="50" cy="50" r="42" fill="none"
              stroke="url(#ringGrad2)" strokeWidth="6"
              strokeDasharray={`${0.64 * 263.9} ${263.9 - 0.64 * 263.9}`}
              strokeLinecap="round"
              transform="rotate(-90 50 50)"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="font-brand text-3xl font-bold text-white">64</span>
            <span className="mono text-[7px] tracking-[0.15em] text-white/20">READINESS</span>
          </div>
        </div>
      </div>

      {/* Right: ATT&CK Coverage tactic cards */}
      <div>
        <div className="mono text-[10px] text-white/30 tracking-wider mb-3">ATT&CK COVERAGE</div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-2 mb-6">
          {TACTICS.map(t => (
            <div key={t.name} className="border border-white/[0.06] rounded-lg p-2.5 bg-white/[0.02]">
              <div className="mono text-[8px] text-white/25 truncate mb-1">{t.name}</div>
              <div className="font-brand text-sm font-bold" style={{ color: MAGENTA }}>{t.rules.toLocaleString()}</div>
              <div className="mono text-[7px] text-white/15 mb-1.5">rules</div>
              <div className="h-1 rounded-full bg-white/[0.06] overflow-hidden">
                <div className="h-full rounded-full" style={{
                  width: `${(t.rules / MAX_RULES) * 100}%`,
                  backgroundColor: MAGENTA,
                }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>

    {/* MITRE ATT&CK Heatmap */}
    <div className="mt-4">
      <div className="mono text-[10px] text-white/30 tracking-wider mb-3">MITRE ATT&CK HEATMAP</div>
      <div className="space-y-1">
        {TACTICS.map((tactic, ti) => (
          <div key={tactic.name} className="flex items-center gap-2">
            <span className="mono text-[7px] text-white/20 w-24 sm:w-32 truncate text-right shrink-0">{tactic.name}</span>
            <div className="flex gap-[2px] flex-1 overflow-hidden">
              {Array.from({ length: 28 }, (_, i) => {
                const intensity = ((i * 7 + ti * 13 + 5) % 37) / 37;
                const hasDetection = intensity > 0.3;
                return (
                  <div
                    key={i}
                    className="h-3 flex-1 min-w-[6px] rounded-[2px]"
                    style={{
                      backgroundColor: hasDetection
                        ? MAGENTA
                        : '#ffffff06',
                      opacity: hasDetection ? 0.25 + intensity * 0.75 : 1,
                    }}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 mt-2 justify-end">
        <span className="mono text-[7px] text-white/15">None</span>
        <div className="flex gap-[1px]">
          {[0.15, 0.3, 0.5, 0.7, 0.9].map((o, i) => (
            <div key={i} className="w-3 h-2 rounded-[1px]" style={{ backgroundColor: MAGENTA, opacity: o }} />
          ))}
        </div>
        <span className="mono text-[7px] text-white/15">Full</span>
      </div>
    </div>
  </MockupFrame>
);


/* ──────────────────────────────────────────────
   SLIDE 3 — Quality & Gaps
   ────────────────────────────────────────────── */
const QualityGapsMockup = () => (
  <MockupFrame title="QUALITY & GAPS" accent={RED}>
    {/* ── Stat Cards ── */}
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2 mb-6">
      {[
        { label: 'NO MITRE MAPPING', value: '1,757', color: RED },
        { label: 'NO LOG SOURCE', value: '663', color: RED },
        { label: 'NO PLATFORM', value: '4,071', color: RED },
        { label: 'NOT VALIDATED', value: '11,815', color: RED },
        { label: 'LOW QUALITY', value: '9,905', color: AMBER },
        { label: 'UNTAGGED', value: '19', color: AMBER },
        { label: 'VALIDATED', value: '2', color: TEAL },
        { label: 'PRODUCTION', value: '3,639', color: TEAL },
      ].map(s => (
        <div key={s.label} className="border border-white/[0.06] rounded-lg p-2.5 bg-white/[0.02] text-center">
          <div className="mono text-[7px] text-white/20 tracking-wider mb-1 leading-tight min-h-[20px]">{s.label}</div>
          <div className="font-brand text-base sm:text-lg font-bold leading-none" style={{ color: s.color }}>{s.value}</div>
        </div>
      ))}
    </div>

    {/* ── Row: Quality Histogram + Confidence + Detection Age ── */}
    <div className="grid md:grid-cols-3 gap-4 mb-5">
      {/* Quality Scores Histogram */}
      <div className="border border-white/[0.06] rounded-lg p-4 bg-white/[0.02]">
        <div className="mono text-[9px] text-white/25 tracking-wider mb-3">QUALITY SCORES</div>
        <div className="flex items-end gap-[3px] h-20">
          {[
            { h: 85, c: MAGENTA }, { h: 72, c: MAGENTA }, { h: 55, c: MAGENTA },
            { h: 40, c: TEAL }, { h: 30, c: TEAL }, { h: 22, c: TEAL },
            { h: 18, c: TEAL }, { h: 12, c: TEAL }, { h: 8, c: TEAL }, { h: 5, c: TEAL },
          ].map((bar, i) => (
            <div key={i} className="flex-1 rounded-t" style={{
              height: `${(bar.h / 85) * 100}%`,
              backgroundColor: bar.c,
              opacity: 0.7,
            }} />
          ))}
        </div>
        <div className="flex justify-between mono text-[7px] text-white/15 mt-1">
          <span>0-10</span><span>50</span><span>90-100</span>
        </div>
      </div>

      {/* Confidence Bar */}
      <div className="border border-white/[0.06] rounded-lg p-4 bg-white/[0.02]">
        <div className="mono text-[9px] text-white/25 tracking-wider mb-3">CONFIDENCE</div>
        <div className="space-y-3">
          <div>
            <div className="flex justify-between mono text-[8px] text-white/20 mb-1">
              <span>HIGH</span><span className="text-white/30">1,244</span>
            </div>
            <div className="h-3 rounded-full overflow-hidden bg-white/[0.04]">
              <div className="h-full rounded-full" style={{ width: '22%', backgroundColor: TEAL }} />
            </div>
          </div>
          <div>
            <div className="flex justify-between mono text-[8px] text-white/20 mb-1">
              <span>MEDIUM</span><span className="text-white/30">4,812</span>
            </div>
            <div className="h-3 rounded-full overflow-hidden bg-white/[0.04]">
              <div className="h-full rounded-full" style={{ width: '55%', backgroundColor: AMBER }} />
            </div>
          </div>
          <div>
            <div className="flex justify-between mono text-[8px] text-white/20 mb-1">
              <span>LOW</span><span className="text-white/30">5,755</span>
            </div>
            <div className="h-3 rounded-full overflow-hidden bg-white/[0.04]">
              <div className="h-full rounded-full" style={{ width: '65%', backgroundColor: RED }} />
            </div>
          </div>
        </div>
      </div>

      {/* Detection Age Histogram */}
      <div className="border border-white/[0.06] rounded-lg p-4 bg-white/[0.02]">
        <div className="mono text-[9px] text-white/25 tracking-wider mb-3">DETECTION AGE</div>
        <div className="flex items-end gap-[3px] h-20">
          {[15, 28, 45, 62, 80, 95, 70, 48, 32, 18, 10, 6].map((h, i) => (
            <div key={i} className="flex-1 rounded-t" style={{
              height: `${(h / 95) * 100}%`,
              backgroundColor: i > 8 ? RED : i > 5 ? AMBER : MAGENTA,
              opacity: 0.65,
            }} />
          ))}
        </div>
        <div className="flex justify-between mono text-[7px] text-white/15 mt-1">
          <span>{'<'}30d</span><span>6mo</span><span>{'>'}1yr</span>
        </div>
      </div>
    </div>

    {/* ── Row: Hygiene Alerts + Radar + Stale Watchlist ── */}
    <div className="grid md:grid-cols-3 gap-4">
      {/* Hygiene Alerts */}
      <div className="border border-white/[0.06] rounded-lg p-4 bg-white/[0.02]">
        <div className="mono text-[9px] text-white/25 tracking-wider mb-3">HYGIENE ALERTS</div>
        <div className="space-y-2">
          {[
            { label: 'NOT VALIDATED', count: '3,639', color: RED },
            { label: 'LOW QUALITY', count: '5,698', color: AMBER },
            { label: 'MISSING LOG SOURCES', count: '663', color: AMBER },
            { label: 'STALE DRAFTS', count: '4', color: RED },
          ].map(a => (
            <div key={a.label} className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: a.color }} />
              <span className="text-[10px] text-white/35 flex-1">{a.label}</span>
              <span className="mono text-[10px] font-bold" style={{ color: a.color }}>{a.count}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Detection Maturity Radar */}
      <div className="border border-white/[0.06] rounded-lg p-4 bg-white/[0.02]">
        <div className="mono text-[9px] text-white/25 tracking-wider mb-3">DETECTION MATURITY</div>
        <div className="flex items-center justify-center h-28">
          <svg viewBox="0 0 120 120" className="w-full h-full max-w-[140px]">
            {/* Radar rings */}
            {[40, 30, 20, 10].map(r => (
              <polygon
                key={r}
                points={radarPoints(60, 60, r, 6)}
                fill="none" stroke="#ffffff08" strokeWidth="0.5"
              />
            ))}
            {/* Axis lines */}
            {Array.from({ length: 6 }, (_, i) => {
              const angle = (Math.PI * 2 * i) / 6 - Math.PI / 2;
              return (
                <line key={i}
                  x1="60" y1="60"
                  x2={60 + Math.cos(angle) * 40} y2={60 + Math.sin(angle) * 40}
                  stroke="#ffffff06" strokeWidth="0.5"
                />
              );
            })}
            {/* Data shape */}
            <polygon
              points={radarDataPoints(60, 60, 40, [0.7, 0.4, 0.55, 0.8, 0.3, 0.6])}
              fill={`${MAGENTA}30`} stroke={MAGENTA} strokeWidth="1.5"
            />
            {/* Labels */}
            {['Coverage', 'Quality', 'Validation', 'Freshness', 'Depth', 'Breadth'].map((label, i) => {
              const angle = (Math.PI * 2 * i) / 6 - Math.PI / 2;
              const x = 60 + Math.cos(angle) * 52;
              const y = 60 + Math.sin(angle) * 52;
              return (
                <text key={label} x={x} y={y} textAnchor="middle" dominantBaseline="middle"
                  className="mono" fill="#ffffff30" fontSize="5">{label}</text>
              );
            })}
          </svg>
        </div>
      </div>

      {/* Stale Watchlist */}
      <div className="border border-white/[0.06] rounded-lg p-4 bg-white/[0.02]">
        <div className="mono text-[9px] text-white/25 tracking-wider mb-3">STALE WATCHLIST</div>
        <div className="space-y-1.5">
          <div className="grid grid-cols-[1fr_auto_auto] gap-3 mono text-[7px] text-white/15 border-b border-white/[0.04] pb-1">
            <span>DETECTION</span><span>AGE</span><span>STATUS</span>
          </div>
          {[
            { name: 'T1059.001 PowerShell Exec', age: '142d', status: 'Draft' },
            { name: 'T1003 LSASS Dump', age: '98d', status: 'Review' },
            { name: 'T1547 Boot Autostart', age: '87d', status: 'Draft' },
            { name: 'T1070 Log Clearing', age: '76d', status: 'Draft' },
          ].map(d => (
            <div key={d.name} className="grid grid-cols-[1fr_auto_auto] gap-3 items-center">
              <span className="text-[10px] text-white/35 truncate">{d.name}</span>
              <span className="mono text-[9px]" style={{ color: RED }}>{d.age}</span>
              <span className="mono text-[8px] text-white/20">{d.status}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  </MockupFrame>
);


/* ── Radar helpers ── */
function radarPoints(cx: number, cy: number, r: number, sides: number): string {
  return Array.from({ length: sides }, (_, i) => {
    const angle = (Math.PI * 2 * i) / sides - Math.PI / 2;
    return `${cx + Math.cos(angle) * r},${cy + Math.sin(angle) * r}`;
  }).join(' ');
}

function radarDataPoints(cx: number, cy: number, maxR: number, values: number[]): string {
  return values.map((v, i) => {
    const angle = (Math.PI * 2 * i) / values.length - Math.PI / 2;
    const r = maxR * v;
    return `${cx + Math.cos(angle) * r},${cy + Math.sin(angle) * r}`;
  }).join(' ');
}


/* ──────────────────────────────────────────────
   Export
   ────────────────────────────────────────────── */
export const DashboardFeature: React.FC = () => {
  const [active, setActive] = useState(0);

  const slides = [
    { label: 'Dashboard', content: <DashboardMockup /> },
    { label: 'MITRE Focus', content: <MITREFocusMockup /> },
    { label: 'Quality & Gaps', content: <QualityGapsMockup /> },
  ];

  return (
    <FeatureSlide
      headline="One dashboard. Every SIEM. Complete visibility."
      description="Readiness scores, MITRE ATT&CK heatmaps, quality hygiene, threat actor coverage — regardless of how many tools your detections are deployed across."
    >
      <FeatureCarousel slides={slides} activeIndex={active} onSelect={setActive} />
    </FeatureSlide>
  );
};
