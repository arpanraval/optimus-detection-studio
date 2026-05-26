import React, { useState } from 'react';
import { FeatureSlide, MockupFrame, FeatureCarousel } from '../shared/FeatureSlide';

const ACCENT = '#783264';
const TEAL = '#4D7C6F';
const YELLOW = '#ca8a04';
const GREEN = '#22c55e';

/* ------------------------------------------------------------------ */
/*  Shared tiny components                                             */
/* ------------------------------------------------------------------ */

const Badge: React.FC<{ children: React.ReactNode; bg: string; fg: string; border?: string; className?: string }> = ({ children, bg, fg, border, className = '' }) => (
  <span className={`mono text-[8px] px-1.5 py-0.5 rounded ${className}`} style={{ backgroundColor: bg, color: fg, border: border ? `1px solid ${border}` : undefined }}>{children}</span>
);

const Btn: React.FC<{ children: React.ReactNode; accent?: boolean; outline?: boolean; className?: string }> = ({ children, accent, outline, className = '' }) => (
  <span className={`mono text-[8px] px-2 py-1 rounded cursor-pointer ${className}`}
    style={accent ? { backgroundColor: `${ACCENT}25`, color: `${ACCENT}dd`, border: `1px solid ${ACCENT}40` }
      : outline ? { border: `1px solid ${ACCENT}50`, color: `${ACCENT}cc` }
      : { backgroundColor: 'rgb(var(--md-sys-color-surface-container-low))', color: 'rgb(var(--md-sys-color-on-surface-variant))', border: '1px solid rgb(var(--md-sys-color-outline-variant))' }}>
    {children}
  </span>
);

const CovBadge: React.FC<{ n: number }> = ({ n }) => (
  <span className="mono text-[7px] min-w-[14px] h-[14px] rounded-full flex items-center justify-center font-bold"
    style={{ backgroundColor: `${TEAL}90`, color: '#fff' }}>{n}</span>
);

/* ------------------------------------------------------------------ */
/*  Matrix data                                                        */
/* ------------------------------------------------------------------ */

const TACTICS = [
  { name: 'RECONNAISSANCE', count: 11, techniques: ['Active Scanning', 'Gather Victim Host Info', 'Gather Victim Identity Info', 'Gather Victim Network Info', 'Gather Victim Org Info', 'Phishing for Info', 'Search Closed Sources', 'Search Open Tech DBs', 'Search Open Websites', 'Search Victim-Owned'] },
  { name: 'RESOURCE DEV', count: 8, techniques: ['Acquire Access', 'Acquire Infrastructure', 'Compromise Accounts', 'Compromise Infrastructure', 'Develop Capabilities', 'Establish Accounts', 'Obtain Capabilities', 'Stage Capabilities'] },
  { name: 'INITIAL ACCESS', count: 14, techniques: ['Content Injection', 'Drive-by Compromise', 'Exploit Public-Facing App', 'External Remote Services', 'Hardware Additions', 'Phishing', 'Replication via Media', 'Supply Chain Compromise', 'Trusted Relationship', 'Valid Accounts', 'Cloud Admin Command', 'Spearphishing Service', 'Default Accounts', 'Domain Trust'] },
  { name: 'EXECUTION', count: 35, techniques: ['Cloud Admin Command', 'Command & Scripting', 'Container Admin Command', 'Deploy Container', 'Exploitation for Client', 'Inter-Process Comms', 'Native API', 'Scheduled Task/Job', 'Serverless Execution', 'Shared Modules', 'Software Deploy Tools', 'System Services', 'User Execution', 'WMI'] },
  { name: 'PERSISTENCE', count: 71, techniques: ['Account Manipulation', 'BITS Jobs', 'Boot/Logon Autostart', 'Boot/Logon Init Scripts', 'Browser Extensions', 'Compromise Client SW', 'Create Account', 'Create/Modify Process', 'Event Triggered Exec', 'External Remote Services', 'Hijack Execution Flow', 'Implant Internal Image', 'Modify Auth Process', 'Office App Startup'] },
  { name: 'PRIVILEGE ESC', count: 68, techniques: ['Abuse Elevation Control', 'Access Token Manip', 'Boot/Logon Autostart', 'Boot/Logon Init Scripts', 'Create/Modify Process', 'Domain Policy Mod', 'Escape to Host', 'Event Triggered Exec', 'Exploitation for Priv', 'Hijack Execution Flow', 'Process Injection', 'Scheduled Task/Job', 'Valid Accounts'] },
  { name: 'DEFENSE EVASION', count: 45, techniques: ['Abuse Elevation Control', 'Access Token Manip', 'BITS Jobs', 'Build Image on Host', 'Debugger Evasion', 'Deobfuscate/Decode', 'Deploy Container', 'Direct Volume Access', 'Domain Policy Mod', 'Execution Guardrails', 'Exploitation for Def Ev', 'File/Dir Permissions', 'Hide Artifacts', 'Hijack Execution Flow'] },
  { name: 'CREDENTIAL ACCESS', count: 17, techniques: ['Adversary-in-the-Middle', 'Brute Force', 'Credentials from Stores', 'Exploitation for Cred', 'Forced Authentication', 'Forge Web Credentials', 'Input Capture', 'Modify Auth Process', 'Multi-Factor Intercept', 'Network Sniffing', 'OS Credential Dumping', 'Steal App Access Token', 'Steal or Forge Certs', 'Steal Web Session'] },
  { name: 'DISCOVERY', count: 32, techniques: ['Account Discovery', 'Application Window Disc', 'Browser Information Disc', 'Cloud Dashboard', 'Cloud Infra Discovery', 'Cloud Service Dashboard', 'Cloud Service Discovery', 'Cloud Storage Object Disc', 'Container/Resource Disc', 'Debugger Evasion', 'Device Driver Discovery', 'Domain Trust Discovery', 'File and Dir Discovery', 'Group Policy Discovery'] },
  { name: 'LATERAL MOVEMENT', count: 9, techniques: ['Exploitation of Remote', 'Internal Spearphishing', 'Lateral Tool Transfer', 'Remote Service Hijack', 'Remote Services', 'Replication via Media', 'Software Deploy Tools', 'Taint Shared Content', 'Use Alt Auth Material'] },
  { name: 'COLLECTION', count: 17, techniques: ['Adversary-in-the-Middle', 'Archive Collected Data', 'Audio Capture', 'Auto Collection', 'Browser Session Hijack', 'Clipboard Data', 'Data from Cloud Storage', 'Data from Config Repo', 'Data from Info Repos', 'Data from Local System', 'Data from Network Drive', 'Data from Removable', 'Data Staged', 'Email Collection'] },
  { name: 'COMMAND & CONTROL', count: 17, techniques: ['Application Layer Proto', 'Comms Through Removable', 'Content Injection', 'Data Encoding', 'Data Obfuscation', 'Dynamic Resolution', 'Encrypted Channel', 'Fallback Channels', 'Ingress Tool Transfer', 'Multi-Stage Channels', 'Non-App Layer Proto', 'Non-Standard Port', 'Protocol Tunneling', 'Proxy'] },
  { name: 'EXFILTRATION', count: 9, techniques: ['Auto Exfiltration', 'Data Transfer Size Limits', 'Exfil Over Alt Protocol', 'Exfil Over C2 Channel', 'Exfil Over Other Network', 'Exfil Over Physical', 'Exfil Over Web Service', 'Scheduled Transfer', 'Transfer Data to Cloud'] },
];

// Coverage map: tactic index -> technique indices that are covered, with detection count
const COVERAGE: Record<number, Record<number, number>> = {
  0: { 0: 2, 5: 4 },
  1: { 1: 1, 6: 3 },
  2: { 2: 61, 3: 4, 5: 12, 9: 4, 7: 2 },
  3: { 1: 8, 4: 3, 7: 5, 12: 2, 6: 1 },
  4: { 0: 3, 2: 6, 4: 2, 8: 4, 10: 1, 12: 3 },
  5: { 0: 2, 1: 3, 4: 1, 8: 5, 10: 4, 12: 4 },
  6: { 2: 3, 5: 7, 7: 2, 10: 4, 12: 1, 13: 2 },
  7: { 1: 5, 3: 2, 6: 3, 10: 8, 13: 1 },
  8: { 0: 2, 4: 1, 11: 3, 13: 2 },
  9: { 0: 3, 4: 6, 7: 2 },
  10: { 0: 1, 5: 2, 9: 3, 12: 4 },
  11: { 0: 5, 6: 8, 8: 2, 12: 3 },
  12: { 2: 4, 4: 1, 6: 2 },
};

// Critical gaps: tactic index -> technique indices
const CRITICAL_GAPS: Record<number, number[]> = {
  3: [13],
  4: [1, 6],
  6: [3, 8],
  7: [0, 4],
  8: [6, 9],
};

/* ------------------------------------------------------------------ */
/*  Slide 1: Full Matrix                                               */
/* ------------------------------------------------------------------ */

export const FullMatrixMockup = () => (
  <MockupFrame title="MITRE ATT&CK MATRIX" accent={TEAL}>
    {/* Header bar */}
    <div className="flex flex-wrap items-center gap-1.5 mb-3">
      <span className="text-xs text-on-surface-variant font-medium">MITRE ATT&CK Matrix</span>
      <Badge bg={`${YELLOW}25`} fg={`${YELLOW}dd`} border={`${YELLOW}40`}>V18.1</Badge>
      <Btn>All Platforms <span className="text-outline ml-0.5">&#9662;</span></Btn>
      <span className="mono text-[8px] px-2 py-1 rounded cursor-pointer" style={{ backgroundColor: `${ACCENT}20`, color: `${ACCENT}cc`, border: `1px solid ${ACCENT}40` }}>
        Threat Intel <span className="text-outline ml-0.5">&#9662;</span>
      </span>
      <span className="flex items-center gap-1 mono text-[8px] text-on-surface-variant ml-1">
        <span className="w-5 h-2.5 rounded-full bg-surface-container-high relative"><span className="absolute right-0.5 top-0.5 w-1.5 h-1.5 rounded-full bg-outline" /></span> Production Only
      </span>
      <span className="flex-1" />
      <Btn>Show Subtechniques</Btn>
      <Btn>Covered Only</Btn>
      <Btn outline>Coverage Gaps</Btn>
      <Btn>Full View</Btn>
      <Btn>Import</Btn>
      <Btn accent>Export</Btn>
    </div>

    {/* Matrix grid */}
    <div className="overflow-x-auto -mx-5 sm:-mx-8 px-5 sm:px-8">
      <div className="flex gap-[3px] min-w-[700px]">
        {TACTICS.map((tactic, ti) => {
          const covMap = COVERAGE[ti] || {};
          const critSet = new Set(CRITICAL_GAPS[ti] || []);
          const showCount = Math.min(tactic.techniques.length, 7);
          return (
            <div key={tactic.name} className="flex-1 min-w-0">
              {/* Column header */}
              <div className="mono text-[6px] text-on-surface-variant mb-1 leading-tight truncate" title={tactic.name}>
                {tactic.name} <span className="text-outline">({tactic.count})</span>
              </div>
              {/* Cells */}
              {tactic.techniques.slice(0, showCount).map((tech, ri) => {
                const detCount = covMap[ri];
                const isCovered = detCount !== undefined;
                const isCrit = critSet.has(ri);
                const isHighlight = ti === 2 && ri === 2; // Exploit Public-Facing App highlighted
                return (
                  <div key={ri} className={`h-[18px] mb-[2px] rounded-sm flex items-center justify-between px-1 border ${
                    isHighlight ? 'ring-1 ring-outline' : ''
                  }`} style={{
                    backgroundColor: isCrit ? `${ACCENT}25` : isCovered ? `${TEAL}30` : 'transparent',
                    borderColor: isCrit ? `${ACCENT}35` : isCovered ? `${TEAL}20` : 'rgb(var(--md-sys-color-outline-variant))',
                  }}>
                    <span className={`mono text-[5.5px] truncate ${isCovered ? 'text-on-surface-variant' : isCrit ? `text-[${ACCENT}]` : 'text-outline'}`} style={isCrit ? { color: `${ACCENT}cc` } : undefined}>
                      {tech}
                    </span>
                    {isCovered && <CovBadge n={detCount} />}
                  </div>
                );
              })}
              {tactic.techniques.length > showCount && (
                <div className="mono text-[6px] text-outline text-center mt-0.5">+{tactic.techniques.length - showCount} more</div>
              )}
            </div>
          );
        })}
      </div>
    </div>

    {/* Legend */}
    <div className="flex flex-wrap gap-4 mt-3 mono text-[8px]">
      <span className="flex items-center gap-1.5"><span className="w-3 h-2.5 rounded-sm" style={{ backgroundColor: `${TEAL}30`, border: `1px solid ${TEAL}20` }} /> <span className="text-on-surface-variant">Covered</span></span>
      <span className="flex items-center gap-1.5"><span className="w-3 h-2.5 rounded-sm" style={{ backgroundColor: `${ACCENT}25`, border: `1px solid ${ACCENT}35` }} /> <span className="text-on-surface-variant">Critical Gap</span></span>
      <span className="flex items-center gap-1.5"><span className="w-3 h-2.5 rounded-sm border border-outline-variant" /> <span className="text-on-surface-variant">Uncovered</span></span>
      <span className="flex items-center gap-1.5"><CovBadge n={4} /> <span className="text-on-surface-variant">Detection count</span></span>
    </div>
  </MockupFrame>
);

/* ------------------------------------------------------------------ */
/*  Slide 2: Threat Actor Filter                                       */
/* ------------------------------------------------------------------ */

const GROUPS = [
  { name: 'Kimsuky', count: 109 },
  { name: 'Lazarus Group', count: 93 },
  { name: 'APT28', count: 91 },
  { name: 'Mustang Panda', count: 85 },
  { name: 'APT41', count: 82 },
];

const ThreatActorFilterMockup = () => (
  <MockupFrame title="MITRE ATT&CK MATRIX -- FILTERED" accent={ACCENT}>
    {/* Header bar (same as slide 1, condensed) */}
    <div className="flex flex-wrap items-center gap-1.5 mb-3">
      <span className="text-xs text-on-surface-variant font-medium">MITRE ATT&CK Matrix</span>
      <Badge bg={`${YELLOW}25`} fg={`${YELLOW}dd`} border={`${YELLOW}40`}>V18.1</Badge>
      <span className="flex-1" />
      <Btn accent>Export</Btn>
    </div>

    {/* Filter tabs */}
    <div className="flex gap-1 mb-3">
      {['GROUPS', 'CAMPAIGNS', 'SOFTWARE', 'ORIGIN', 'TARGETS', 'SECTORS'].map((tab, i) => (
        <span key={tab} className={`mono text-[8px] px-2.5 py-1 rounded cursor-pointer ${
          i === 0 ? 'text-on-surface bg-surface-container-high' : 'text-on-surface-variant hover:text-on-surface-variant'
        }`}>{tab}</span>
      ))}
    </div>

    <div className="flex gap-4">
      {/* Left: filter panel */}
      <div className="w-[200px] shrink-0 border border-outline-variant rounded-lg p-3 bg-surface-container-low">
        {/* Search */}
        <div className="px-2 py-1.5 border border-outline-variant rounded bg-surface-container-low text-[9px] text-on-surface-variant mb-3">Search groups...</div>

        {/* Group list */}
        <div className="space-y-1.5">
          {GROUPS.map((g, i) => (
            <label key={g.name} className="flex items-center gap-2 cursor-pointer group">
              <span className={`w-3 h-3 rounded-sm border flex items-center justify-center ${
                i === 1 ? 'border-[#783264] bg-[#783264]' : 'border-outline-variant bg-surface-container-low'
              }`}>
                {i === 1 && <span className="text-white text-[7px]">&#10003;</span>}
              </span>
              <span className={`text-[10px] flex-1 ${i === 1 ? 'text-on-surface' : 'text-on-surface-variant group-hover:text-on-surface-variant'}`}>{g.name}</span>
              <span className="mono text-[8px] text-outline">{g.count}</span>
            </label>
          ))}
        </div>

        {/* Stats */}
        <div className="mono text-[7px] text-outline mt-3 pt-2 border-t border-outline-variant leading-relaxed">
          172 groups | 52 campaigns | 786 software
        </div>
      </div>

      {/* Right: filtered matrix (compact) */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-2">
          <span className="mono text-[9px] px-2 py-0.5 rounded" style={{ backgroundColor: `${ACCENT}15`, color: `${ACCENT}cc`, border: `1px solid ${ACCENT}30` }}>
            Lazarus Group <span className="text-outline ml-1 cursor-pointer">x</span>
          </span>
          <span className="mono text-[9px] text-on-surface-variant">93 techniques mapped</span>
        </div>
        <div className="overflow-x-auto">
          <div className="flex gap-[3px] min-w-[500px]">
            {TACTICS.slice(0, 10).map((tactic, ti) => {
              // Lazarus uses roughly half the techniques in each tactic
              const active = [0, 2, 4, 6].includes(ti) ? [0, 2, 4] : [1, 3, 5];
              const activeSet = new Set(active);
              return (
                <div key={tactic.name} className="flex-1 min-w-0">
                  <div className="mono text-[5.5px] text-outline mb-1 truncate">{tactic.name}</div>
                  {tactic.techniques.slice(0, 6).map((tech, ri) => {
                    const isActive = activeSet.has(ri);
                    return (
                      <div key={ri} className="h-[16px] mb-[2px] rounded-sm flex items-center px-0.5 border" style={{
                        backgroundColor: isActive ? `${ACCENT}30` : 'transparent',
                        borderColor: isActive ? `${ACCENT}25` : 'rgb(var(--md-sys-color-outline-variant))',
                      }}>
                        <span className={`mono text-[5px] truncate ${isActive ? 'text-on-surface-variant' : 'text-outline-variant'}`}>{tech}</span>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>

        {/* Coverage bar */}
        <div className="mt-3 border border-outline-variant rounded-lg p-3 bg-surface-container-low">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] text-on-surface-variant">Lazarus Group: <span className="font-bold text-on-surface-variant">93 techniques</span></span>
            <span className="mono text-[10px] font-bold" style={{ color: TEAL }}>72% covered</span>
          </div>
          <div className="h-2 rounded-full bg-surface-container-high overflow-hidden">
            <div className="h-full rounded-full" style={{ width: '72%', backgroundColor: TEAL }} />
          </div>
          <div className="flex gap-3 mt-2 mono text-[8px] text-outline">
            <span>67 covered</span><span>26 gaps</span><span style={{ color: `${ACCENT}cc` }}>8 critical</span>
          </div>
        </div>
      </div>
    </div>
  </MockupFrame>
);

/* ------------------------------------------------------------------ */
/*  Slide 3: Technique Detail Panel                                    */
/* ------------------------------------------------------------------ */

const TechniqueDetailMockup = () => (
  <MockupFrame title="MITRE ATT&CK MATRIX" accent={TEAL}>
    <div className="flex gap-4">
      {/* Left: mini matrix (context) */}
      <div className="flex-1 min-w-0 hidden sm:block">
        <div className="flex gap-[2px]">
          {TACTICS.slice(2, 8).map((tactic, ti) => (
            <div key={tactic.name} className="flex-1 min-w-0">
              <div className="mono text-[5px] text-outline mb-1 truncate">{tactic.name}</div>
              {tactic.techniques.slice(0, 6).map((tech, ri) => {
                const isCov = (COVERAGE[ti + 2] || {})[ri] !== undefined;
                const isSelected = ti === 0 && ri === 2; // Exploit Public-Facing App
                const isT1078 = ti === 0 && ri === 9;
                return (
                  <div key={ri} className={`h-[14px] mb-[1px] rounded-sm border flex items-center px-0.5 ${isSelected ? 'ring-1 ring-outline' : ''}`} style={{
                    backgroundColor: isCov ? `${TEAL}25` : 'transparent',
                    borderColor: isCov ? `${TEAL}15` : 'rgb(var(--md-sys-color-outline-variant))',
                  }}>
                    <span className={`mono text-[4.5px] truncate ${isCov ? 'text-on-surface-variant' : 'text-outline-variant'}`}>{tech}</span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Right: detail drawer */}
      <div className="w-full sm:w-[280px] shrink-0 border border-outline-variant rounded-lg bg-surface-container-low overflow-hidden">
        {/* Drawer header */}
        <div className="px-4 py-3 border-b border-outline-variant bg-surface-container-low">
          <div className="flex items-center gap-2 mb-1">
            <span className="mono text-[10px] text-on-surface-variant font-bold">T1078</span>
            <span className="mono text-[8px] px-1.5 py-0.5 rounded bg-surface-container-high text-on-surface-variant">Defense Evasion</span>
            <span className="ml-auto"><CovBadge n={4} /></span>
          </div>
          <div className="text-sm text-on-surface font-medium">Valid Accounts</div>
          <div className="mono text-[8px] text-on-surface-variant mt-1">6 groups &middot; 5 tools &middot; 3 campaigns</div>
        </div>

        {/* Detections section */}
        <div className="px-4 py-3 border-b border-outline-variant">
          <div className="mono text-[8px] text-on-surface-variant tracking-wider mb-2">DETECTIONS</div>
          <div className="space-y-1.5">
            {[
              { name: 'Valid Account Login from Unusual Geo', status: 'PROD', color: TEAL },
              { name: 'Service Account Auth Anomaly', status: 'PROD', color: TEAL },
              { name: 'Default Credential Usage Detection', status: 'DRAFT', color: '#79747e' },
              { name: 'Cloud Account Compromise Indicators', status: 'PROD', color: TEAL },
            ].map(d => (
              <div key={d.name} className="flex items-center gap-2">
                <span className="text-[9px] text-on-surface-variant flex-1 truncate">{d.name}</span>
                <Badge bg={`${d.color}15`} fg={`${d.color}cc`}>{d.status}</Badge>
              </div>
            ))}
          </div>
        </div>

        {/* Groups section */}
        <div className="px-4 py-3 border-b border-outline-variant">
          <div className="mono text-[8px] text-on-surface-variant tracking-wider mb-2">GROUPS</div>
          <div className="flex flex-wrap gap-1">
            {['Indrik Spider', 'BlackByte', 'GALLIUM', 'Volt Typhoon', 'APT41', 'Dragonfly'].map((g, i) => {
              const colors = [`${ACCENT}`, '#ef4444', '#3b82f6', '#f59e0b', '#22c55e', '#8b5cf6'];
              return (
                <span key={g} className="mono text-[7px] px-1.5 py-0.5 rounded" style={{
                  backgroundColor: `${colors[i]}15`,
                  color: `${colors[i]}cc`,
                  border: `1px solid ${colors[i]}25`,
                }}>{g}</span>
              );
            })}
          </div>
        </div>

        {/* Malware & Tools section */}
        <div className="px-4 py-3 border-b border-outline-variant">
          <div className="mono text-[8px] text-on-surface-variant tracking-wider mb-2">MALWARE & TOOLS</div>
          <div className="flex flex-wrap gap-1">
            {['Linux Rabbit', 'SeaDuke', 'Duqu', 'Kinsing', 'Industroyer'].map(t => (
              <span key={t} className="mono text-[7px] px-1.5 py-0.5 rounded bg-surface-container-low text-on-surface-variant border border-outline-variant">{t}</span>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5">
          <span className="mono text-[8px] cursor-pointer" style={{ color: `${ACCENT}cc` }}>Click for full details &rarr;</span>
        </div>
      </div>
    </div>

    {/* Second example: T1190 inline preview */}
    <div className="mt-4 border border-outline-variant rounded-lg p-3 bg-surface-container-low flex flex-wrap items-start gap-4">
      <div className="min-w-[140px]">
        <div className="flex items-center gap-2 mb-1">
          <span className="mono text-[10px] text-on-surface-variant font-bold">T1190</span>
          <CovBadge n={61} />
        </div>
        <div className="text-[11px] text-on-surface-variant font-medium">Exploit Public-Facing Application</div>
        <div className="mono text-[8px] text-outline mt-1">3 shown, +58 more detections</div>
      </div>
      <div className="flex-1 min-w-[180px]">
        <div className="mono text-[7px] text-outline mb-1">GROUPS</div>
        <div className="flex flex-wrap gap-1 mb-2">
          {['BlackByte', 'GALLIUM', 'Kimsuky', 'Volt Typhoon', 'APT41', 'Salt Typhoon'].map(g => (
            <span key={g} className="mono text-[7px] px-1.5 py-0.5 rounded bg-surface-container-low text-on-surface-variant">{g}</span>
          ))}
        </div>
        <div className="mono text-[7px] text-outline mb-1">MALWARE</div>
        <div className="flex flex-wrap gap-1">
          {['COATHANGER', 'BOLDMOVE', 'Siloscape', 'ZxShell', 'Oilin'].map(m => (
            <span key={m} className="mono text-[7px] px-1.5 py-0.5 rounded bg-surface-container-low text-on-surface-variant">{m}</span>
          ))}
        </div>
      </div>
    </div>
  </MockupFrame>
);

/* ------------------------------------------------------------------ */
/*  Slide 4: Export Options                                            */
/* ------------------------------------------------------------------ */

const ExportMockup = () => (
  <MockupFrame title="EXPORT MITRE COVERAGE" accent={ACCENT}>
    <div className="grid sm:grid-cols-3 gap-4 mb-6">
      {[
        { format: 'Navigator JSON', desc: 'Import directly into MITRE ATT&CK Navigator with color-coded coverage layers. Compatible with Navigator v4.x.', icon: <span className="mono text-xl text-outline">{'{}'}</span> },
        { format: 'Excel Workbook', desc: 'Full technique list with coverage status, detection counts, TIS scores, gap analysis, and group mappings per sheet.', icon: <span className="mono text-xl text-outline">XLS</span> },
        { format: 'Coverage PNG', desc: 'Board-ready heatmap visualization. Branded with organization logo. Includes legend and summary statistics.', icon: <span className="mono text-xl text-outline">PNG</span> },
      ].map(e => (
        <div key={e.format} className="border border-outline-variant rounded-xl p-5 bg-surface-container-low hover:border-outline-variant transition-colors cursor-pointer group">
          <div className="mb-3">{e.icon}</div>
          <div className="text-sm text-on-surface-variant font-medium mb-2 group-hover:text-on-surface transition-colors">{e.format}</div>
          <p className="text-[10px] text-on-surface-variant leading-relaxed mb-3">{e.desc}</p>
          <Btn accent>Download</Btn>
        </div>
      ))}
    </div>

    {/* Navigator preview */}
    <div className="border border-outline-variant rounded-lg p-4 bg-surface-container-low">
      <div className="flex items-center justify-between mb-3">
        <span className="mono text-[9px] text-on-surface-variant tracking-wider">NAVIGATOR LAYER PREVIEW</span>
        <span className="mono text-[8px] text-outline">optimus_coverage_2026-03-25.json</span>
      </div>
      <div className="overflow-x-auto">
        <div className="flex gap-[2px] min-w-[500px]">
          {TACTICS.map((tactic, ti) => {
            const covMap = COVERAGE[ti] || {};
            return (
              <div key={ti} className="flex-1 min-w-0">
                <div className="mono text-[4.5px] text-outline mb-0.5 truncate">{tactic.name}</div>
                {Array.from({ length: 5 }).map((_, ri) => {
                  const detCount = covMap[ri];
                  const hasCov = detCount !== undefined;
                  return (
                    <div key={ri} className="h-[8px] mb-[1px] rounded-sm" style={{
                      backgroundColor: hasCov
                        ? (detCount > 5 ? TEAL : detCount > 2 ? `${TEAL}80` : `${TEAL}50`)
                        : 'rgb(var(--md-sys-color-outline-variant))',
                    }} />
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
      <div className="flex items-center gap-4 mt-3 mono text-[7px] text-outline">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm" style={{ backgroundColor: TEAL }} /> Full coverage</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm" style={{ backgroundColor: `${TEAL}80` }} /> Partial</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm" style={{ backgroundColor: `${TEAL}50` }} /> Minimal</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-surface-container-low" /> No coverage</span>
      </div>
    </div>

    {/* Export config */}
    <div className="flex flex-wrap items-center gap-3 mt-4 pt-3 border-t border-outline-variant">
      <span className="mono text-[8px] text-outline">Export options:</span>
      <span className="flex items-center gap-1 mono text-[8px] text-on-surface-variant">
        <span className="w-3 h-2.5 rounded-sm border border-outline-variant bg-surface-container-high flex items-center justify-center"><span className="text-[6px]">&#10003;</span></span>
        Include subtechniques
      </span>
      <span className="flex items-center gap-1 mono text-[8px] text-on-surface-variant">
        <span className="w-3 h-2.5 rounded-sm border border-outline-variant bg-surface-container-high flex items-center justify-center"><span className="text-[6px]">&#10003;</span></span>
        Include detection names
      </span>
      <span className="flex items-center gap-1 mono text-[8px] text-outline">
        <span className="w-3 h-2.5 rounded-sm border border-outline-variant bg-surface-container-low" />
        Include TIS scores
      </span>
    </div>
  </MockupFrame>
);

/* ------------------------------------------------------------------ */
/*  Exported component                                                 */
/* ------------------------------------------------------------------ */

export const MITREFeature: React.FC = () => {
  const [active, setActive] = useState(0);

  const slides = [
    { label: 'Full Matrix', content: <FullMatrixMockup /> },
    { label: 'Threat Actor Filter', content: <ThreatActorFilterMockup /> },
    { label: 'Technique Detail', content: <TechniqueDetailMockup /> },
    { label: 'Export Options', content: <ExportMockup /> },
  ];

  return (
    <FeatureSlide
      headline="MITRE ATT&CK. Not just a heatmap."
      description="Full ATT&CK v18.1 matrix with 14 tactics, 200+ techniques, and 20,000+ entity relationships. Filter by threat group, campaign, software, origin country. Hover any technique to see linked detections, groups, and malware. Export as Navigator JSON, Excel, or PNG."
    >
      <FeatureCarousel slides={slides} activeIndex={active} onSelect={setActive} />
    </FeatureSlide>
  );
};
