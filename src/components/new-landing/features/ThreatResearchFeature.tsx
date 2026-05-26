import React, { useState, useEffect } from 'react';
import { MockupFrame } from '../shared/FeatureSlide';
import { Icon } from '../../Icon';

const ACCENT = '#783264';
const BLUE = '#005091';
const TEAL = '#4D7C6F';

interface LogLine {
  time: string;
  agent: 'orch' | 'preflight' | 'research' | 'attack' | 'engineer' | 'qa';
  agentLabel: string;
  dotColor: string;
  type: string;
  message: string;
}

const CONSOLE_STEPS: Record<number, LogLine[]> = {
  1: [
    { time: '14:20:02', agent: 'orch', agentLabel: 'Orch', dotColor: '#9ca3af', type: 'SESSION_START', message: 'Orchestrating research session for: "Lazarus PDF CVE-2024-21412 & Registry Persistence"' },
    { time: '14:20:03', agent: 'preflight', agentLabel: 'Preflight', dotColor: '#3b82f6', type: 'INTEL_INGEST', message: 'Extracting indicators from CVE-2024-21412 advisory & Lazarus TTP feeds...' },
    { time: '14:20:04', agent: 'preflight', agentLabel: 'Preflight', dotColor: '#3b82f6', type: 'INGEST_SUCCESS', message: 'Ingested 3 advisories. Isolated TTPs: DLL Sideloading, HKCU Registry Run keys.' }
  ],
  2: [
    { time: '14:20:05', agent: 'research', agentLabel: 'Research', dotColor: '#a855f7', type: 'BEHAVIOR_PARSE', message: 'Analyzing payload execution behavior. Sideloading target: FoxitReader.exe' },
    { time: '14:20:06', agent: 'research', agentLabel: 'Research', dotColor: '#a855f7', type: 'REGISTRY_WRITE', message: 'Identified registry write operation targeting key: HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run' },
    { time: '14:20:07', agent: 'attack', agentLabel: 'Attack', dotColor: '#ec4899', type: 'MITRE_MAP', message: 'Mapping behaviors to MITRE ATT&CK: Persistence (T1547.001) & Defense Evasion (T1574.002)' }
  ],
  3: [
    { time: '14:20:08', agent: 'engineer', agentLabel: 'Engineer', dotColor: '#eab308', type: 'RULE_SYNTHESIS', message: 'Drafting detection logic in Microsoft Sentinel KQL (Kusto Query Language)...' },
    { time: '14:20:09', agent: 'engineer', agentLabel: 'Engineer', dotColor: '#eab308', type: 'RULE_GEN', message: 'Generated detection rule "Lazarus DLL Sideloading via FoxitReader and Registry Persistence"' }
  ],
  4: [
    { time: '14:20:10', agent: 'qa', agentLabel: 'QA', dotColor: '#10b981', type: 'TELEMETRY_SIM', message: 'Injecting simulated Windows Event ID 4688 & Registry Event 13 log streams...' },
    { time: '14:20:11', agent: 'qa', agentLabel: 'QA', dotColor: '#10b981', type: 'RULE_TEST', message: 'Validating KQL query performance against 14-day telemetry baseline...' },
    { time: '14:20:12', agent: 'qa', agentLabel: 'QA', dotColor: '#10b981', type: 'VERDICT_PASS', message: 'QA check: APPROVED. Rule successfully detected 100% of payloads. False Positives: 0.' }
  ],
  5: [
    { time: '14:20:13', agent: 'orch', agentLabel: 'Orch', dotColor: '#9ca3af', type: 'COMPLETED', message: 'Research cycle complete. Synthesized Auto-Digest and committed rule to library.' }
  ]
};

export const ThreatResearchMockup: React.FC = () => {
  const [step, setStep] = useState(1);
  const [consoleLogs, setConsoleLogs] = useState<LogLine[]>([]);

  // Simulation timer loop
  useEffect(() => {
    // Initial logs load
    setConsoleLogs(CONSOLE_STEPS[1]);

    const interval = setInterval(() => {
      setStep((prev) => {
        const next = prev === 5 ? 1 : prev + 1;
        if (next === 1) {
          setConsoleLogs(CONSOLE_STEPS[1]);
        } else {
          // Accumulate logs
          setConsoleLogs((prevLogs) => [
            ...prevLogs,
            ...CONSOLE_STEPS[next]
          ]);
        }
        return next;
      });
    }, 4500);

    return () => clearInterval(interval);
  }, []);

  return (
    <MockupFrame title="AUTONOMOUS THREAT RESEARCH" accent="#a855f7">
      {/* Workspace Header */}
      <div className="flex items-center justify-between border-b border-outline-variant pb-3 mb-4">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-purple-500/10 flex items-center justify-center border border-purple-500/20">
            <span className="text-purple-400 font-bold text-xs">A</span>
          </div>
          <div>
            <h4 className="text-xs font-semibold text-on-surface">Threat Research Engine</h4>
            <p className="text-[9px] text-outline">Autonomous Agent & Auto-Digest Hub</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="mono text-[8px] px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 font-bold border border-emerald-500/20">
            ACTIVE THREAT CAPTURE
          </span>
          <div className="flex gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" />
          </div>
        </div>
      </div>

      {/* Main split-view workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        
        {/* Left Column: Console Panel (span 7) */}
        <div className="lg:col-span-7 flex flex-col h-[320px] rounded-xl border border-outline-variant bg-surface-container-high overflow-hidden shadow-inner">
          {/* Console Header */}
          <div className="flex items-center justify-between bg-surface-container px-3 py-1.5 border-b border-outline-variant">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-red-400/80" />
              <span className="w-2.5 h-2.5 rounded-full bg-yellow-400/80" />
              <span className="w-2.5 h-2.5 rounded-full bg-green-400/80" />
              <span className="mono text-[10px] text-on-surface-variant font-bold ml-2">agents-orchestrator.log</span>
            </div>
            <span className="mono text-[9px] text-outline">Lazarus-Research-Session_091</span>
          </div>

          {/* Scrolling log text */}
          <div className="flex-1 p-3 overflow-y-auto space-y-2 font-mono text-[9.5px] leading-relaxed bg-black/40 text-gray-300">
            {consoleLogs.map((log, i) => (
              <div key={i} className="flex items-start gap-2 border-b border-white/[0.03] pb-1.5 last:border-b-0">
                <span className="text-gray-500 shrink-0">{log.time}</span>
                <span 
                  className="px-1.5 py-0.2 rounded text-[8px] font-bold uppercase shrink-0 tracking-wider"
                  style={{ backgroundColor: `${log.dotColor}20`, color: log.dotColor, border: `1px solid ${log.dotColor}35` }}
                >
                  {log.agentLabel}
                </span>
                <div className="flex-1">
                  <span className="text-purple-400/90 font-semibold mr-1.5">[{log.type}]</span>
                  <span className="text-gray-300">{log.message}</span>
                </div>
              </div>
            ))}
            
            {/* Live active typing prompt indicator */}
            <div className="flex items-center gap-1 mt-1 text-purple-400/80">
              <span className="animate-pulse">❚</span>
              <span>Agent pipeline processing...</span>
            </div>
          </div>
        </div>

        {/* Right Column: Auto-Digest & Rule Summary Panel (span 5) */}
        <div className="lg:col-span-5 flex flex-col h-[320px] rounded-xl border border-outline-variant bg-surface-container-low overflow-hidden">
          
          {/* Tabs bar */}
          <div className="flex border-b border-outline-variant bg-surface-container-high text-[10px]">
            <div className={`px-4 py-2 font-semibold border-r border-outline-variant ${step >= 5 ? 'bg-surface-container-low text-on-surface' : 'text-outline'}`}>
              Auto-Digest
            </div>
            <div className={`px-4 py-2 font-semibold border-r border-outline-variant ${step >= 3 ? 'bg-surface-container-low text-on-surface' : 'text-outline'}`}>
              Generated Rule
            </div>
          </div>

          <div className="flex-1 p-4 overflow-y-auto">
            {step < 3 ? (
              // Stage 1-2: Threat parsing progress card
              <div className="flex flex-col items-center justify-center h-full text-center p-6 space-y-4">
                <div className="relative w-12 h-12 flex items-center justify-center rounded-full bg-purple-500/10 border border-purple-500/20">
                  <div className="absolute inset-0 rounded-full border border-purple-400 border-t-transparent animate-spin" />
                  <Icon name="shield" className="text-purple-400" size={20} />
                </div>
                <div>
                  <h5 className="text-xs font-semibold text-on-surface">Ingesting Threat Intelligence</h5>
                  <p className="text-[10px] text-on-surface-variant mt-1">
                    Orchestrating agents to extract behavior signatures and map MITRE ATT&CK techniques...
                  </p>
                </div>
              </div>
            ) : (
              // Stage 3-5: Displaying digest & code
              <div className="space-y-4">
                {/* Active Digest */}
                <div className="rounded-lg p-3 bg-surface-container-high border border-outline-variant/60">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="mono text-[8px] bg-purple-500/10 text-purple-400 border border-purple-500/20 px-2 py-0.5 rounded font-bold uppercase">
                      THREAT SUMMARY
                    </span>
                    <span className="text-[9px] text-outline">Auto-Digest v1.0</span>
                  </div>
                  <h4 className="text-xs font-bold text-on-surface mb-1">Lazarus Trojanized PDF Persistence</h4>
                  <p className="text-[10px] text-on-surface-variant leading-relaxed">
                    Identified Lazarus Group Campaign using rogue FoxitReader updates. The threat installs an evasive DLL payload and updates Registry Run key (<span className="mono text-[9px] text-purple-400">HKCU\..\Run</span>) to maintain boot persistent execution.
                  </p>
                  
                  {/* Indicators and MITRE tag */}
                  <div className="flex flex-wrap gap-2 mt-3 pt-2.5 border-t border-outline-variant">
                    <div className="flex items-center gap-1.5 bg-red-500/5 px-2 py-0.5 rounded border border-red-500/10">
                      <span className="w-1 h-1 rounded-full bg-red-400" />
                      <span className="mono text-[8px] text-red-400">T1547.001 (Persistence)</span>
                    </div>
                    <div className="flex items-center gap-1.5 bg-yellow-500/5 px-2 py-0.5 rounded border border-yellow-500/10">
                      <span className="w-1 h-1 rounded-full bg-yellow-400" />
                      <span className="mono text-[8px] text-yellow-400">CVE-2024-21412</span>
                    </div>
                  </div>
                </div>

                {/* Sentinel Rule Code Snippet */}
                {step >= 3 && (
                  <div className="rounded-lg border border-outline-variant overflow-hidden font-mono text-[9px] leading-relaxed">
                    <div className="bg-surface-container-high px-3 py-1.5 border-b border-outline-variant flex justify-between items-center">
                      <span className="text-blue-400 font-semibold">Microsoft Sentinel (KQL)</span>
                      <span className="text-[8px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1 rounded font-bold">APPROVED</span>
                    </div>
                    <div className="p-3 bg-black/30 text-gray-300 overflow-x-auto space-y-1">
                      <div><span className="text-blue-400">DeviceRegistryEvents</span></div>
                      <div>| <span className="text-purple-400">where</span> RegistryKey <span className="text-blue-400">contains</span> <span className="text-green-400">@"CurrentVersion\Run"</span></div>
                      <div>| <span className="text-purple-400">where</span> RegistryValueName <span className="text-blue-400">in~</span> (<span className="text-green-400">"FoxitUpdate"</span>, <span className="text-green-400">"LazarusPDF"</span>)</div>
                      <div>| <span className="text-purple-400">project</span> TimeGenerated, DeviceName, RegistryKey, RegistryValueData</div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

      </div>

      {/* Footer statistics summary */}
      <div className="flex flex-wrap gap-4 items-center justify-between mt-4 pt-3 border-t border-outline-variant mono text-[9px] text-on-surface-variant">
        <div className="flex items-center gap-4">
          <span>STATUS: <span className={step === 5 ? 'text-emerald-400 font-bold' : 'text-purple-400 animate-pulse font-bold'}>{step === 5 ? 'COMPLETE' : 'PROCESSING'}</span></span>
          <span className="text-outline-variant">|</span>
          <span>AGENTS RUNNING: <span className="font-bold text-on-surface">5/5</span></span>
          <span className="text-outline-variant">|</span>
          <span>RULES MERGED: <span className="font-bold text-emerald-400">2</span></span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
          <span>AUTONOMOUS ENGINE ACTIVE</span>
        </div>
      </div>
    </MockupFrame>
  );
};
