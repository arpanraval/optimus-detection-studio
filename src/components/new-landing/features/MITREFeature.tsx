import React, { useEffect, useRef, useState } from 'react';
import { FeatureSlide, MockupFrame, FeatureCarousel } from '../shared/FeatureSlide';

const ACCENT = '#783264';
const TEAL = '#4D7C6F';
const YELLOW = '#ca8a04';
const GREEN = '#4D7C6F';
const COVERED = '#2F4B44'; // dark sage covered cells, as in product

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

/* Matrix columns — abridged from the real product matrix (ATT&CK v18.1) */
type MatrixCell = { t: string; cov?: string };
const MATRIX: { name: string; count: number; cells: MatrixCell[] }[] = [
  { name: 'RECONNAISSANCE', count: 11, cells: [
    { t: 'Gather Victim Identity Information' }, { t: 'Gather Victim Network Information' }, { t: 'Gather Victim Org Information' },
    { t: 'Search Open Websites/Domains' }, { t: 'Active Scanning', cov: '1' }, { t: 'Search Open Technical Databases' },
    { t: 'Phishing for Information' }, { t: 'Search Closed Sources' }, { t: 'Search Threat Vendor Data' },
  ]},
  { name: 'RESOURCE DEVELOPMENT', count: 8, cells: [
    { t: 'Acquire Infrastructure' }, { t: 'Compromise Infrastructure' }, { t: 'Establish Accounts' },
    { t: 'Compromise Accounts' }, { t: 'Develop Capabilities' }, { t: 'Obtain Capabilities' },
    { t: 'Stage Capabilities' }, { t: 'Acquire Access' },
  ]},
  { name: 'INITIAL ACCESS', count: 14, cells: [
    { t: 'Valid Accounts', cov: '4' }, { t: 'Replication Through Removable Media' }, { t: 'External Remote Services', cov: '9+' },
    { t: 'Drive-by Compromise' }, { t: 'Exploit Public-Facing Application', cov: '9+' }, { t: 'Spearphishing Attachment' },
    { t: 'Supply Chain Compromise' }, { t: 'Phishing', cov: '9+' }, { t: 'Content Injection' },
  ]},
  { name: 'EXECUTION', count: 35, cells: [
    { t: 'Windows Remote Management' }, { t: 'Service Execution' }, { t: 'Windows Management Instrumentation' },
    { t: 'Scheduled Task/Job' }, { t: 'Rundll32' }, { t: 'PowerShell' },
    { t: 'Native API' }, { t: 'Regsvr32' }, { t: 'Shared Modules' },
  ]},
  { name: 'PERSISTENCE', count: 71, cells: [
    { t: 'Winlogon Helper DLL' }, { t: 'Port Monitors' }, { t: 'Accessibility Features' },
    { t: 'Boot or Logon Initialization Scripts' }, { t: 'System Firmware' }, { t: 'New Service' },
    { t: 'Registry Run Keys / Startup Folder' }, { t: 'Scheduled Task/Job' }, { t: 'Web Shell' },
  ]},
  { name: 'PRIVILEGE ESCALATION', count: 40, cells: [
    { t: 'Port Monitors' }, { t: 'Accessibility Features' }, { t: 'Process Injection' },
    { t: 'Exploitation for Privilege Escalation', cov: '2' }, { t: 'Valid Accounts', cov: '4' }, { t: 'Bypass User Account Control' },
    { t: 'Account Manipulation', cov: '1' }, { t: 'Scheduled Task/Job' }, { t: 'Boot or Logon Initialization Scripts' },
  ]},
  { name: 'DEFENSE EVASION', count: 90, cells: [
    { t: 'Direct Volume Access' }, { t: 'Binary Padding' }, { t: 'Rootkit' },
    { t: 'Obfuscated Files or Information' }, { t: 'Masquerading' }, { t: 'Indicator Removal' },
    { t: 'DLL Side-Loading' }, { t: 'Valid Accounts', cov: '4' }, { t: 'Rundll32' },
  ]},
  { name: 'CREDENTIAL ACCESS', count: 30, cells: [
    { t: 'OS Credential Dumping', cov: '1' }, { t: 'Network Sniffing', cov: '1' }, { t: 'Input Capture' },
    { t: 'Credentials in Files' }, { t: 'Brute Force' }, { t: 'Multi-Factor Authentication Interception' },
    { t: 'Keychain' }, { t: 'Private Keys' }, { t: 'Hooking' },
  ]},
  { name: 'DISCOVERY', count: 35, cells: [
    { t: 'System Service Discovery' }, { t: 'Application Window Discovery' }, { t: 'Query Registry' },
    { t: 'Remote System Discovery' }, { t: 'Network Sniffing', cov: '1' }, { t: 'Process Discovery' },
    { t: 'Security Software Discovery' }, { t: 'System Information Discovery', cov: '1' }, { t: 'File and Directory Discovery' },
  ]},
  { name: 'LATERAL MOVEMENT', count: 18, cells: [
    { t: 'Remote Services' }, { t: 'Windows Remote Management' }, { t: 'Pass the Hash' },
    { t: 'Remote Desktop Protocol' }, { t: 'Taint Shared Content' }, { t: 'Exploitation of Remote Services', cov: '1' },
    { t: 'SSH Hijacking' }, { t: 'Pass the Ticket' }, { t: 'Web Session Cookie' },
  ]},
];

// Popover cycle: technique hover card ↔ threat-intel filter dropdown
type PopoverState = 'tech' | 'groups' | 'off';
const POPOVER_SEQ: PopoverState[] = ['tech', 'tech', 'off', 'groups', 'groups', 'off'];

const FILTER_GROUPS = [
  { name: 'Kimsuky', gid: 'G0094', origin: 'North Korea', count: 109 },
  { name: 'Lazarus Group', gid: 'G0032', origin: 'North Korea', count: 93 },
  { name: 'APT28', gid: 'G0007', origin: 'Russian Federation', count: 91 },
  { name: 'Mustang Panda', gid: 'G0129', origin: 'China', count: 85 },
  { name: 'APT41', gid: 'G0096', origin: 'China', count: 82 },
];

export const FullMatrixMockup = () => {
  const [lit, setLit] = useState(false);
  const [pop, setPop] = useState<PopoverState>('off');
  const ref = useRef<HTMLDivElement>(null);
  const started = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let interval: ReturnType<typeof setInterval> | undefined;
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !started.current) {
        started.current = true;
        setLit(true);
        let i = 0;
        interval = setInterval(() => {
          i = (i + 1) % POPOVER_SEQ.length;
          setPop(POPOVER_SEQ[i]);
        }, 2100);
        setTimeout(() => setPop(POPOVER_SEQ[0]), 900);
      }
    }, { threshold: 0.25 });
    obs.observe(el);
    return () => { obs.disconnect(); if (interval) clearInterval(interval); };
  }, []);

  // Stagger index for covered-cell light-up
  let covIdx = 0;

  return (
    <MockupFrame title="MITRE ATT&CK MATRIX" accent={COVERED}>
      <div ref={ref}>
        {/* Header bar */}
        <div className="flex flex-wrap items-center gap-1.5 mb-3">
          <span className="text-sm font-bold text-on-surface tracking-tight" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>MITRE ATT&CK Matrix</span>
          <span className="mono text-[8px] px-1.5 py-0.5 rounded font-bold text-white" style={{ backgroundColor: ACCENT }}>V18.1</span>
          <span className="mono text-[8px] px-2.5 py-1 rounded-full border border-outline-variant bg-surface-container-highest text-on-surface-variant cursor-default">⚙ All Platforms <span className="text-outline ml-0.5">&#9662;</span></span>
          <span className={`mono text-[8px] px-2.5 py-1 rounded-full cursor-default transition-shadow duration-300 ${pop === 'groups' ? 'shadow-[0_0_0_2px_rgba(0,80,145,0.25)]' : ''}`}
            style={{ backgroundColor: 'rgba(0,130,200,0.10)', color: '#005091', border: '1px solid rgba(0,130,200,0.25)' }}>
            ⛉ Threat Intel <span className="ml-0.5">&#9662;</span>
          </span>
          <span className="flex items-center rounded-full border border-outline-variant bg-surface-container-low p-0.5">
            <span className="mono text-[8px] px-2 py-0.5 rounded-full bg-surface-container-highest text-on-surface font-semibold shadow-sm">Production Only</span>
            <span className="mono text-[8px] px-2 py-0.5 text-on-surface-variant">+ Development Library</span>
          </span>
          <span className="flex-1" />
          <Btn>Show Subtechnique(s)</Btn>
          <Btn outline>Covered Only</Btn>
        </div>

        {/* Matrix grid with popovers */}
        <div className="relative">
          <div className="overflow-x-auto -mx-5 sm:-mx-8 px-5 sm:px-8">
            <div className="flex gap-1 min-w-[760px]">
              {MATRIX.map((col, ci) => (
                <div key={col.name} className="flex-1 min-w-0">
                  {/* Column header card */}
                  <div className="rounded-md border border-outline-variant bg-surface-container-highest px-1 py-1.5 mb-1 text-center">
                    <div className="mono text-[6px] font-bold text-on-surface leading-tight truncate" title={col.name}>{col.name}</div>
                    <div className="mono text-[5.5px] text-outline mt-0.5">{col.count} techniques</div>
                  </div>
                  {/* Cells */}
                  {col.cells.map((cell, ri) => {
                    const isCovered = cell.cov !== undefined;
                    const delay = isCovered ? covIdx++ * 90 : 0;
                    const isAnchor = ci === 2 && ri === 4; // Exploit Public-Facing Application
                    return (
                      <div
                        key={ri}
                        className={`h-[20px] mb-[2px] rounded-[3px] flex items-center justify-between gap-0.5 px-1 border transition-colors duration-500 ${
                          isAnchor && pop === 'tech' ? 'ring-2 ring-offset-1' : ''
                        }`}
                        style={{
                          backgroundColor: isCovered && lit ? COVERED : 'rgb(var(--md-sys-color-surface-container-highest))',
                          borderColor: isCovered && lit ? COVERED : 'rgb(var(--md-sys-color-outline-variant))',
                          transitionDelay: `${delay}ms`,
                          ...(isAnchor && pop === 'tech' ? { ['--tw-ring-color' as string]: `${ACCENT}55` } : {}),
                        }}
                      >
                        <span className="text-[5.5px] leading-tight truncate transition-colors duration-500 font-medium" style={{ color: isCovered && lit ? '#ffffff' : 'rgb(var(--md-sys-color-on-surface-variant))', transitionDelay: `${delay}ms` }}>
                          {cell.t}
                        </span>
                        {isCovered && (
                          <span className="mono text-[5px] min-w-[11px] h-[11px] rounded-full flex items-center justify-center font-bold shrink-0 transition-opacity duration-500"
                            style={{ backgroundColor: 'rgba(255,255,255,0.22)', color: '#fff', opacity: lit ? 1 : 0, transitionDelay: `${delay}ms` }}>
                            {cell.cov}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          {/* ── Technique hover card (T1190) ── */}
          <div
            className={`absolute z-10 w-[240px] rounded-xl border border-outline-variant bg-surface-container-highest shadow-[0_16px_40px_-12px_rgba(15,18,30,0.25)] transition-all duration-400 ${
              pop === 'tech' ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2 pointer-events-none'
            }`}
            style={{ left: '22%', top: '38%' }}
          >
            <div className="px-3.5 pt-3 pb-2.5">
              <div className="flex items-center gap-1.5 mb-1">
                <span className="mono text-[8px] font-bold px-1.5 py-0.5 rounded border" style={{ color: ACCENT, borderColor: `${ACCENT}40`, backgroundColor: `${ACCENT}0a` }}>T1190</span>
                <span className="text-[8px] text-on-surface-variant">Initial Access</span>
                <span className="mono text-[8px] font-bold px-1.5 py-0.5 rounded ml-auto" style={{ backgroundColor: `${ACCENT}12`, color: ACCENT }}>⛊ 61</span>
              </div>
              <div className="text-[11px] font-bold text-on-surface leading-snug mb-1">Exploit Public-Facing Application</div>
              <div className="text-[7.5px] text-on-surface-variant mb-2">◉ 6 groups · ⚒ 5 tools · ⚑ 3 campaigns</div>

              <div className="mono text-[6.5px] font-bold tracking-wider text-on-surface-variant mb-1">⛊ DETECTIONS</div>
              <div className="space-y-1 mb-2">
                {[
                  { name: 'PaperCut NG Remote Web Access Atte…', tag: 'PROD', tone: TEAL },
                  { name: 'AI Agents - No Authentication Required', tag: 'DRAFT', tone: '#8c8c96' },
                  { name: 'Suspicious JetBrains TeamCity Child P…', tag: 'PROD', tone: TEAL },
                ].map((d) => (
                  <div key={d.name} className="flex items-center gap-1.5">
                    <span className="w-1 h-1 rounded-full shrink-0" style={{ backgroundColor: d.tone }} />
                    <span className="text-[7.5px] text-on-surface-variant flex-1 truncate">{d.name}</span>
                    <span className="mono text-[6px] font-bold px-1 py-0.5 rounded" style={{ backgroundColor: `${d.tone}18`, color: d.tone }}>{d.tag}</span>
                  </div>
                ))}
                <div className="text-[7px] text-outline pl-2.5">+58 more</div>
              </div>

              <div className="mono text-[6.5px] font-bold tracking-wider text-on-surface-variant mb-1">◉ GROUPS</div>
              <div className="flex flex-wrap gap-1 mb-2">
                {['BlackByte', 'GALLIUM', 'Kimsuky', 'Volt Typhoon', 'APT41', 'Salt Typhoon'].map((g) => (
                  <span key={g} className="mono text-[6.5px] px-1.5 py-0.5 rounded border border-red-500/25 bg-red-500/5 text-red-500/90">{g}</span>
                ))}
              </div>

              <div className="mono text-[6.5px] font-bold tracking-wider text-on-surface-variant mb-1">⚒ MALWARE & TOOLS</div>
              <div className="flex flex-wrap gap-1">
                {['COATHANGER', 'BOLDMOVE', 'Siloscape', 'ZxShell', 'Qilin'].map((m) => (
                  <span key={m} className="mono text-[6.5px] px-1.5 py-0.5 rounded border border-amber-500/30 bg-amber-500/5 text-amber-600">{m}</span>
                ))}
              </div>
            </div>
            <div className="px-3.5 py-1.5 border-t border-outline-variant flex items-center justify-between">
              <span className="text-[7px] text-on-surface-variant">Click for full details</span>
              <span className="text-[8px] text-outline">›</span>
            </div>
          </div>

          {/* ── Threat-intel filter dropdown ── */}
          <div
            className={`absolute z-10 w-[250px] rounded-xl border border-outline-variant bg-surface-container-highest shadow-[0_16px_40px_-12px_rgba(15,18,30,0.25)] transition-all duration-400 ${
              pop === 'groups' ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2 pointer-events-none'
            }`}
            style={{ left: '18%', top: '4%' }}
          >
            <div className="flex border-b border-outline-variant px-2 pt-2 gap-2">
              {['GROUPS', 'CAMPAIGNS', 'SOFTWARE', 'ORIGIN'].map((tab, i) => (
                <span key={tab} className={`mono text-[6.5px] font-bold pb-1.5 px-0.5 ${i === 0 ? 'text-on-surface border-b-2' : 'text-on-surface-variant'}`}
                  style={i === 0 ? { borderColor: ACCENT } : undefined}>{tab}</span>
              ))}
            </div>
            <div className="p-2.5">
              <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg border mb-2" style={{ borderColor: `${ACCENT}40` }}>
                <span className="text-[8px] text-outline">⌕</span>
                <span className="text-[8px] text-outline flex-1">Search groups…</span>
                <span className="mono text-[6px] text-outline border border-outline-variant rounded px-1">ESC</span>
              </div>
              <div className="space-y-1.5">
                {FILTER_GROUPS.map((g) => (
                  <div key={g.name} className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-sm border border-outline-variant bg-surface-container-low shrink-0" />
                    <div className="flex-1 min-w-0">
                      <span className="text-[8.5px] font-semibold text-on-surface">{g.name}</span>
                      <span className="mono text-[6px] text-outline ml-1.5">{g.gid}</span>
                      <div className="text-[6.5px] text-on-surface-variant">{g.origin}</div>
                    </div>
                    <span className="mono text-[8px] text-on-surface-variant tabular-nums">{g.count}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="px-3 py-1.5 border-t border-outline-variant">
              <span className="mono text-[6.5px] text-outline">172 groups | 52 campaigns | 786 software</span>
            </div>
          </div>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-4 mt-3 mono text-[8px]">
          <span className="flex items-center gap-1.5"><span className="w-3 h-2.5 rounded-sm" style={{ backgroundColor: COVERED }} /> <span className="text-on-surface-variant">Covered</span></span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-2.5 rounded-sm border border-outline-variant bg-surface-container-highest" /> <span className="text-on-surface-variant">Uncovered</span></span>
          <span className="flex items-center gap-1.5">
            <span className="mono text-[5px] min-w-[11px] h-[11px] rounded-full flex items-center justify-center font-bold text-white" style={{ backgroundColor: COVERED }}>4</span>
            <span className="text-on-surface-variant">Detection count</span>
          </span>
          <span className="ml-auto text-outline">199 of 356 techniques covered · production only</span>
        </div>
      </div>
    </MockupFrame>
  );
};

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
              const colors = [`${ACCENT}`, '#ef4444', '#3b82f6', '#f59e0b', '#4D7C6F', '#8b5cf6'];
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
