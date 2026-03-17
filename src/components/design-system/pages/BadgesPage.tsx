import React, { useState } from 'react';
import { DesignSystemPage, Section, ComponentRow } from '../shared';
import { Icon } from '../../Icon';

export const BadgesPage: React.FC = () => {
    const [selectedComponents, setSelectedComponents] = useState<Set<string>>(new Set());

    const toggleSelection = (id: string) => {
        setSelectedComponents(prev => {
            const newSet = new Set(prev);
            if (newSet.has(id)) {
                newSet.delete(id);
            } else {
                newSet.add(id);
            }
            return newSet;
        });
    };

    return (
        <DesignSystemPage
            title="Badges & Chips"
            description="Status indicators and labels"
        >
            <Section title="Badges & Chips" description="Status indicators and labels">

                {/* Color System Reference */}
                <div className="mb-8 p-4 bg-[#783264]/5 border border-[#783264]/20 rounded-xl">
                    <h4 className="text-sm font-semibold text-[#783264] mb-2 flex items-center gap-2">
                        <Icon name="palette" className="w-4 h-4" />
                        Detection Studio Color System
                    </h4>
                    <div className="flex flex-wrap gap-4 text-xs text-on-surface-variant">
                        <span className="flex items-center gap-2"><span className="w-3 h-3 rounded bg-[#783264]"></span><strong>#783264</strong> Primary Magenta</span>
                        <span className="flex items-center gap-2"><span className="w-3 h-3 rounded bg-[#4D7C6F]"></span><strong>#4D7C6F</strong> Sage Green</span>
                        <span className="flex items-center gap-2"><span className="w-3 h-3 rounded bg-[#A63D40]"></span><strong>#A63D40</strong> Brick Red</span>
                        <span className="flex items-center gap-2"><span className="w-3 h-3 rounded bg-[#0284C7]"></span><strong>#0284C7</strong> Sky Blue</span>
                        <span className="flex items-center gap-2"><span className="w-3 h-3 rounded bg-purple-500"></span><strong>Purple</strong> MITRE/Tags</span>
                        <span className="flex items-center gap-2"><span className="w-3 h-3 rounded bg-orange-500"></span><strong>Orange</strong> High/Software</span>
                        <span className="flex items-center gap-2"><span className="w-3 h-3 rounded bg-yellow-500"></span><strong>Yellow</strong> Medium/Warning</span>
                        <span className="flex items-center gap-2"><span className="w-3 h-3 rounded bg-emerald-500"></span><strong>Emerald</strong> Mitigation</span>
                    </div>
                </div>

                {/* ===== STATUS BADGES ===== */}
                <ComponentRow label="Status Badges" description="Sage (Production), Sky Blue (Testing), Purple (Dev), Brick Red (Deprecated)">
                    <span className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide rounded-lg bg-[#4D7C6F]/15 text-[#4D7C6F]">
                        Production
                    </span>
                    <span className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide rounded-lg bg-[#0284C7]/15 text-[#0284C7]">
                        Testing
                    </span>
                    <span className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide rounded-lg bg-purple-500/15 text-purple-600 dark:text-purple-400">
                        Development
                    </span>
                    <span className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide rounded-lg bg-surface-container-highest text-on-surface-variant">
                        Draft
                    </span>
                    <span className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide rounded-lg bg-[#A63D40]/15 text-[#A63D40]">
                        Deprecated
                    </span>
                </ComponentRow>

                {/* ===== SEVERITY BADGES ===== */}
                <ComponentRow label="Severity Badges" description="Brick Red (Critical) → Orange → Yellow → Sage (Low)">
                    <span className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide rounded-lg bg-[#A63D40]/15 text-[#A63D40] border border-[#A63D40]/20">
                        Critical
                    </span>
                    <span className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide rounded-lg bg-orange-500/15 text-orange-500 border border-orange-500/20">
                        High
                    </span>
                    <span className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide rounded-lg bg-yellow-500/15 text-yellow-600 dark:text-yellow-400 border border-yellow-500/20">
                        Medium
                    </span>
                    <span className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide rounded-lg bg-[#4D7C6F]/15 text-[#4D7C6F] border border-[#4D7C6F]/20">
                        Low
                    </span>
                    <span className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide rounded-lg bg-surface-container-highest text-on-surface-variant border border-outline-variant/20">
                        Info
                    </span>
                </ComponentRow>

                {/* ===== MITRE CHIPS ===== */}
                <div className="mb-4 p-3 bg-surface-container rounded-xl border border-outline-variant/20">
                    <p className="text-xs text-on-surface-variant">
                        <strong>MITRE ATT&CK Entity Types:</strong> Tactic (TA), Technique (T), Threat Group (G), Software (S), Campaign (C), Mitigation (M), Data Source (DS)
                    </p>
                </div>

                <ComponentRow label="Tactic Chips" description="TA#### - Kill chain phases (Magenta)">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-mono font-bold rounded-lg bg-[#783264]/10 text-[#783264] border border-[#783264]/20">
                        <Icon name="target" className="w-3 h-3" />
                        TA0001
                    </span>
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-mono font-bold rounded-lg bg-[#783264]/10 text-[#783264] border border-[#783264]/20">
                        <Icon name="target" className="w-3 h-3" />
                        TA0002
                    </span>
                    <span className="text-[10px] text-on-surface-variant ml-2">Initial Access, Execution</span>
                </ComponentRow>

                <ComponentRow label="Technique Chips" description="T#### / T####.### - Attack techniques (Purple)">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-mono font-bold rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
                        <Icon name="zap" className="w-3 h-3" />
                        T1059
                    </span>
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-mono font-bold rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
                        <Icon name="zap" className="w-3 h-3" />
                        T1059.001
                    </span>
                    <span className="text-[10px] text-on-surface-variant ml-2">Command and Scripting Interpreter</span>
                </ComponentRow>

                <ComponentRow label="Threat Group Chips" description="G#### - APT and threat actor groups (Brick Red)">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-bold rounded-lg bg-[#A63D40]/10 text-[#A63D40] border border-[#A63D40]/20">
                        <Icon name="users" className="w-3 h-3" />
                        <span className="font-mono">G0016</span>
                        <span className="font-medium">APT29</span>
                    </span>
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-bold rounded-lg bg-[#A63D40]/10 text-[#A63D40] border border-[#A63D40]/20">
                        <Icon name="users" className="w-3 h-3" />
                        <span className="font-mono">G0032</span>
                        <span className="font-medium">Lazarus</span>
                    </span>
                </ComponentRow>

                <ComponentRow label="Software Chips" description="S#### - Malware and tools (Orange)">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-bold rounded-lg bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/20">
                        <Icon name="package" className="w-3 h-3" />
                        <span className="font-mono">S0154</span>
                        <span className="font-medium">Cobalt Strike</span>
                    </span>
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-bold rounded-lg bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/20">
                        <Icon name="package" className="w-3 h-3" />
                        <span className="font-mono">S0002</span>
                        <span className="font-medium">Mimikatz</span>
                    </span>
                </ComponentRow>

                <ComponentRow label="Campaign Chips" description="C#### - Threat campaigns (Sky Blue)">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-bold rounded-lg bg-[#0284C7]/10 text-[#0284C7] border border-[#0284C7]/20">
                        <Icon name="flag" className="w-3 h-3" />
                        <span className="font-mono">C0001</span>
                        <span className="font-medium">Frankenstein</span>
                    </span>
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-bold rounded-lg bg-[#0284C7]/10 text-[#0284C7] border border-[#0284C7]/20">
                        <Icon name="flag" className="w-3 h-3" />
                        <span className="font-mono">C0018</span>
                        <span className="font-medium">SolarWinds</span>
                    </span>
                </ComponentRow>

                <ComponentRow label="Mitigation Chips" description="M#### - Security controls (Emerald)">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-bold rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                        <Icon name="shield" className="w-3 h-3" />
                        <span className="font-mono">M1026</span>
                        <span className="font-medium">Privileged Account Mgmt</span>
                    </span>
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-bold rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                        <Icon name="shield" className="w-3 h-3" />
                        <span className="font-mono">M1049</span>
                        <span className="font-medium">Antivirus</span>
                    </span>
                </ComponentRow>

                <ComponentRow label="Data Source Chips" description="DS#### - Telemetry sources (Sage Green)">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-bold rounded-lg bg-[#4D7C6F]/10 text-[#4D7C6F] border border-[#4D7C6F]/20">
                        <Icon name="database" className="w-3 h-3" />
                        <span className="font-mono">DS0009</span>
                        <span className="font-medium">Process</span>
                    </span>
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-bold rounded-lg bg-[#4D7C6F]/10 text-[#4D7C6F] border border-[#4D7C6F]/20">
                        <Icon name="database" className="w-3 h-3" />
                        <span className="font-mono">DS0017</span>
                        <span className="font-medium">Command</span>
                    </span>
                </ComponentRow>

                <ComponentRow label="Detection Strategy Chips" description="Custom detection categorization (Magenta)">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-bold rounded-lg bg-[#783264]/10 text-[#783264] border border-[#783264]/20">
                        <Icon name="crosshair" className="w-3 h-3" />
                        Behavioral
                    </span>
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-bold rounded-lg bg-[#783264]/10 text-[#783264] border border-[#783264]/20">
                        <Icon name="crosshair" className="w-3 h-3" />
                        Signature
                    </span>
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-bold rounded-lg bg-[#783264]/10 text-[#783264] border border-[#783264]/20">
                        <Icon name="crosshair" className="w-3 h-3" />
                        Anomaly
                    </span>
                </ComponentRow>

                {/* ===== DOT INDICATORS ===== */}
                <ComponentRow label="Dot Indicator" description="Sage (Active), Yellow (Pending), Brick Red (Error)">
                    <span className="flex items-center gap-1.5 text-xs text-on-surface-variant">
                        <span className="w-2 h-2 rounded-full bg-[#4D7C6F]"></span>
                        Active
                    </span>
                    <span className="flex items-center gap-1.5 text-xs text-on-surface-variant">
                        <span className="w-2 h-2 rounded-full bg-yellow-500"></span>
                        Pending
                    </span>
                    <span className="flex items-center gap-1.5 text-xs text-on-surface-variant">
                        <span className="w-2 h-2 rounded-full bg-[#A63D40]"></span>
                        Error
                    </span>
                </ComponentRow>

                <ComponentRow label="Pulsing Dot Indicator" description="Animated status dots for real-time status">
                    <span className="flex items-center gap-1.5 text-xs text-on-surface-variant">
                        <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#4D7C6F] opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-[#4D7C6F]"></span>
                        </span>
                        Live
                    </span>
                    <span className="flex items-center gap-1.5 text-xs text-on-surface-variant">
                        <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-500 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-yellow-500"></span>
                        </span>
                        Processing
                    </span>
                    <span className="flex items-center gap-1.5 text-xs text-on-surface-variant">
                        <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#A63D40] opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-[#A63D40]"></span>
                        </span>
                        Alert
                    </span>
                </ComponentRow>

                {/* ===== COUNT BADGES ===== */}
                <ComponentRow label="Count Badges" description="Primary for default, Brick Red for alerts/errors">
                    <span className="inline-flex items-center justify-center w-6 h-6 text-[11px] font-bold rounded-full bg-primary text-on-primary">
                        5
                    </span>
                    <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-[10px] font-bold rounded-full bg-[#A63D40] text-white">
                        12
                    </span>
                    <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-[10px] font-bold rounded-full bg-surface-container-highest text-on-surface-variant">
                        99+
                    </span>
                </ComponentRow>

                {/* ===== REMOVABLE CHIPS ===== */}
                <ComponentRow label="Removable Chips" description="Tags with close button">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg bg-surface-container-highest text-on-surface-variant">
                        PowerShell
                        <button className="hover:text-[#A63D40] transition-colors">
                            <Icon name="x" className="w-3 h-3" />
                        </button>
                    </span>
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-500/20">
                        Credential Access
                        <button className="hover:text-[#A63D40] transition-colors">
                            <Icon name="x" className="w-3 h-3" />
                        </button>
                    </span>
                </ComponentRow>

                {/* ===== QUALITY SCORE ===== */}
                <ComponentRow label="Quality Score" description="Sage (80+), Sky Blue (60+), Orange (40+), Brick Red (<40)">
                    <div className="flex items-center gap-4">
                        {[85, 65, 42, 25].map(score => {
                            const color = score >= 80 ? '#4D7C6F' : score >= 60 ? '#0284C7' : score >= 40 ? '#D97706' : '#A63D40';
                            const circumference = 2 * Math.PI * 18;
                            const offset = circumference - (score / 100) * circumference;
                            return (
                                <div key={score} className="relative w-12 h-12 rounded-full" style={{ backgroundColor: `${color}10` }}>
                                    <svg className="w-12 h-12 -rotate-90">
                                        <circle cx="24" cy="24" r="18" fill="none" strokeWidth="5" stroke={`${color}20`} />
                                        <circle cx="24" cy="24" r="18" fill="none" strokeWidth="5" stroke={color} strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" />
                                    </svg>
                                    <span className="absolute inset-0 flex items-center justify-center text-sm font-bold" style={{ color }}>{score}</span>
                                </div>
                            );
                        })}
                    </div>
                </ComponentRow>

                {/* ===== ADDITIONAL COMPONENTS ===== */}
                <div className="mt-8 pt-6 border-t border-outline-variant/20">
                    <h3 className="text-sm font-semibold text-on-surface-variant mb-4">Additional Components</h3>
                </div>

                <ComponentRow label="Notification Badges" description="Small indicator badges for icons/buttons">
                    <div className="flex items-center gap-6">
                        <div className="relative">
                            <div className="p-2 bg-surface-container-highest rounded-lg">
                                <Icon name="bell" className="w-5 h-5 text-on-surface-variant" />
                            </div>
                            <span className="absolute -top-1 -right-1 w-4 h-4 flex items-center justify-center text-[9px] font-bold rounded-full bg-[#A63D40] text-white">3</span>
                        </div>
                        <div className="relative">
                            <div className="p-2 bg-surface-container-highest rounded-lg">
                                <Icon name="mail" className="w-5 h-5 text-on-surface-variant" />
                            </div>
                            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-primary"></span>
                        </div>
                        <div className="relative">
                            <div className="p-2 bg-surface-container-highest rounded-lg">
                                <Icon name="shield" className="w-5 h-5 text-on-surface-variant" />
                            </div>
                            <span className="absolute -top-1 -right-1 w-4 h-4 flex items-center justify-center text-[9px] font-bold rounded-full bg-[#4D7C6F] text-white">
                                <Icon name="check" className="w-2.5 h-2.5" />
                            </span>
                        </div>
                    </div>
                </ComponentRow>

                <ComponentRow label="Version Badges" description="Software version and release tags">
                    <span className="inline-flex items-center text-[10px] font-mono rounded-md overflow-hidden border border-outline-variant/30">
                        <span className="px-2 py-1 bg-[#4D7C6F] text-white">stable</span>
                        <span className="px-2 py-1 bg-surface-container-highest text-on-surface-variant">1.0.0</span>
                    </span>
                    <span className="inline-flex items-center text-[10px] font-mono rounded-md overflow-hidden border border-outline-variant/30">
                        <span className="px-2 py-1 bg-yellow-500 text-white">beta</span>
                        <span className="px-2 py-1 bg-surface-container-highest text-on-surface-variant">2.0.0-rc1</span>
                    </span>
                    <span className="inline-flex items-center text-[10px] font-mono rounded-md overflow-hidden border border-outline-variant/30">
                        <span className="px-2 py-1 bg-[#A63D40] text-white">deprecated</span>
                        <span className="px-2 py-1 bg-surface-container-highest text-on-surface-variant">0.9.0</span>
                    </span>
                </ComponentRow>

                <ComponentRow label="Progress Bar Badges" description="Inline progress indicators">
                    <div className="flex items-center gap-3 px-3 py-2 bg-surface-container-highest rounded-lg">
                        <span className="text-xs text-on-surface-variant">Coverage</span>
                        <div className="w-24 h-1.5 bg-surface-container rounded-full overflow-hidden">
                            <div className="h-full bg-[#4D7C6F] rounded-full" style={{ width: '75%' }}></div>
                        </div>
                        <span className="text-xs font-semibold text-[#4D7C6F]">75%</span>
                    </div>
                    <div className="flex items-center gap-3 px-3 py-2 bg-surface-container-highest rounded-lg">
                        <span className="text-xs text-on-surface-variant">Risk</span>
                        <div className="w-24 h-1.5 bg-surface-container rounded-full overflow-hidden">
                            <div className="h-full bg-[#A63D40] rounded-full" style={{ width: '85%' }}></div>
                        </div>
                        <span className="text-xs font-semibold text-[#A63D40]">85%</span>
                    </div>
                </ComponentRow>

                <ComponentRow label="Avatar Chips" description="User/author attribution chips">
                    <span className="inline-flex items-center gap-2 px-1 pr-3 py-1 text-xs font-medium rounded-full bg-surface-container-highest text-on-surface-variant">
                        <span className="w-6 h-6 rounded-full bg-primary flex items-center justify-center text-white text-[10px] font-bold">JD</span>
                        John Doe
                    </span>
                    <span className="inline-flex items-center gap-2 px-1 pr-3 py-1 text-xs font-medium rounded-full bg-surface-container-highest text-on-surface-variant">
                        <span className="w-6 h-6 rounded-full bg-purple-500 flex items-center justify-center text-white text-[10px] font-bold">
                            <Icon name="user" className="w-3.5 h-3.5" />
                        </span>
                        Unassigned
                    </span>
                </ComponentRow>

                {/* ===== SIZE GUIDE ===== */}
                <div className="mt-10 pt-8 border-t-2 border-[#783264]/20">
                    <h3 className="text-base font-semibold text-[#783264] mb-2">Size Guide</h3>
                    <p className="text-sm text-on-surface-variant mb-6">Standardized sizing specifications for consistent badge and chip usage across the application</p>
                </div>

                {/* Size Specifications Table */}
                <div className="mb-8 overflow-hidden rounded-xl border border-outline-variant/30">
                    <table className="w-full text-xs">
                        <thead className="bg-surface-container">
                            <tr>
                                <th className="px-4 py-3 text-left font-semibold text-on-surface border-b border-outline-variant/20">Size</th>
                                <th className="px-4 py-3 text-left font-semibold text-on-surface border-b border-outline-variant/20">Padding</th>
                                <th className="px-4 py-3 text-left font-semibold text-on-surface border-b border-outline-variant/20">Text</th>
                                <th className="px-4 py-3 text-left font-semibold text-on-surface border-b border-outline-variant/20">Height</th>
                                <th className="px-4 py-3 text-left font-semibold text-on-surface border-b border-outline-variant/20">Icon</th>
                                <th className="px-4 py-3 text-left font-semibold text-on-surface border-b border-outline-variant/20">Border Radius</th>
                                <th className="px-4 py-3 text-left font-semibold text-on-surface border-b border-outline-variant/20">Use Case</th>
                            </tr>
                        </thead>
                        <tbody className="font-mono text-on-surface-variant">
                            <tr className="bg-surface-container-low">
                                <td className="px-4 py-2.5 font-semibold text-on-surface">xs</td>
                                <td className="px-4 py-2.5">px-1.5 py-0.5</td>
                                <td className="px-4 py-2.5">text-[8px]</td>
                                <td className="px-4 py-2.5">~16px</td>
                                <td className="px-4 py-2.5">w-2 h-2</td>
                                <td className="px-4 py-2.5">rounded</td>
                                <td className="px-4 py-2.5 text-on-surface-variant/60 font-sans">Inline meta, tight spaces</td>
                            </tr>
                            <tr>
                                <td className="px-4 py-2.5 font-semibold text-on-surface">sm</td>
                                <td className="px-4 py-2.5">px-2 py-0.5</td>
                                <td className="px-4 py-2.5">text-[9px]</td>
                                <td className="px-4 py-2.5">~20px</td>
                                <td className="px-4 py-2.5">w-2.5 h-2.5</td>
                                <td className="px-4 py-2.5">rounded-md</td>
                                <td className="px-4 py-2.5 text-on-surface-variant/60 font-sans">Cards, compact lists</td>
                            </tr>
                            <tr className="bg-surface-container-low">
                                <td className="px-4 py-2.5 font-semibold text-[#783264]">md (default)</td>
                                <td className="px-4 py-2.5">px-2.5 py-1</td>
                                <td className="px-4 py-2.5">text-[10px]</td>
                                <td className="px-4 py-2.5">~24px</td>
                                <td className="px-4 py-2.5">w-3 h-3</td>
                                <td className="px-4 py-2.5">rounded-lg</td>
                                <td className="px-4 py-2.5 text-on-surface-variant/60 font-sans">Standard usage, forms</td>
                            </tr>
                            <tr>
                                <td className="px-4 py-2.5 font-semibold text-on-surface">lg</td>
                                <td className="px-4 py-2.5">px-3 py-1.5</td>
                                <td className="px-4 py-2.5">text-[11px]</td>
                                <td className="px-4 py-2.5">~28px</td>
                                <td className="px-4 py-2.5">w-3.5 h-3.5</td>
                                <td className="px-4 py-2.5">rounded-lg</td>
                                <td className="px-4 py-2.5 text-on-surface-variant/60 font-sans">Headers, hero sections</td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                {/* Size Comparison - Status Badges */}
                <ComponentRow label="Status Badges - All Sizes" description="xs → sm → md → lg progression">
                    <div className="flex items-center gap-4">
                        <div className="flex flex-col items-center gap-1">
                            <span className="px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide rounded bg-[#4D7C6F]/15 text-[#4D7C6F]">Production</span>
                            <span className="text-[8px] text-on-surface-variant/60">xs</span>
                        </div>
                        <div className="flex flex-col items-center gap-1">
                            <span className="px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide rounded-md bg-[#4D7C6F]/15 text-[#4D7C6F]">Production</span>
                            <span className="text-[8px] text-on-surface-variant/60">sm</span>
                        </div>
                        <div className="flex flex-col items-center gap-1">
                            <span className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide rounded-lg bg-[#4D7C6F]/15 text-[#4D7C6F]">Production</span>
                            <span className="text-[8px] text-on-surface-variant/60">md</span>
                        </div>
                        <div className="flex flex-col items-center gap-1">
                            <span className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide rounded-lg bg-[#4D7C6F]/15 text-[#4D7C6F]">Production</span>
                            <span className="text-[8px] text-on-surface-variant/60">lg</span>
                        </div>
                    </div>
                </ComponentRow>

                {/* Size Comparison - Severity Badges */}
                <ComponentRow label="Severity Badges - All Sizes" description="Consistent border across all sizes">
                    <div className="flex items-center gap-4">
                        <div className="flex flex-col items-center gap-1">
                            <span className="px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide rounded bg-[#A63D40]/15 text-[#A63D40] border border-[#A63D40]/20">Critical</span>
                            <span className="text-[8px] text-on-surface-variant/60">xs</span>
                        </div>
                        <div className="flex flex-col items-center gap-1">
                            <span className="px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide rounded-md bg-[#A63D40]/15 text-[#A63D40] border border-[#A63D40]/20">Critical</span>
                            <span className="text-[8px] text-on-surface-variant/60">sm</span>
                        </div>
                        <div className="flex flex-col items-center gap-1">
                            <span className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide rounded-lg bg-[#A63D40]/15 text-[#A63D40] border border-[#A63D40]/20">Critical</span>
                            <span className="text-[8px] text-on-surface-variant/60">md</span>
                        </div>
                        <div className="flex flex-col items-center gap-1">
                            <span className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide rounded-lg bg-[#A63D40]/15 text-[#A63D40] border border-[#A63D40]/20">Critical</span>
                            <span className="text-[8px] text-on-surface-variant/60">lg</span>
                        </div>
                    </div>
                </ComponentRow>

                {/* Size Comparison - MITRE Chips */}
                <ComponentRow label="MITRE Chips - All Sizes" description="Icon scales proportionally with text">
                    <div className="flex items-center gap-4">
                        <div className="flex flex-col items-center gap-1">
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[8px] font-mono font-bold rounded bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
                                <Icon name="zap" className="w-2 h-2" />
                                T1059
                            </span>
                            <span className="text-[8px] text-on-surface-variant/60">xs</span>
                        </div>
                        <div className="flex flex-col items-center gap-1">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[9px] font-mono font-bold rounded-md bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
                                <Icon name="zap" className="w-2.5 h-2.5" />
                                T1059
                            </span>
                            <span className="text-[8px] text-on-surface-variant/60">sm</span>
                        </div>
                        <div className="flex flex-col items-center gap-1">
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-mono font-bold rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
                                <Icon name="zap" className="w-3 h-3" />
                                T1059
                            </span>
                            <span className="text-[8px] text-on-surface-variant/60">md</span>
                        </div>
                        <div className="flex flex-col items-center gap-1">
                            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-mono font-bold rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
                                <Icon name="zap" className="w-3.5 h-3.5" />
                                T1059
                            </span>
                            <span className="text-[8px] text-on-surface-variant/60">lg</span>
                        </div>
                    </div>
                </ComponentRow>

                {/* Quality Score Sizes */}
                <ComponentRow label="Quality Score - All Sizes" description="32px → 40px → 48px → 56px">
                    <div className="flex items-end gap-6">
                        {[
                            { size: 'xs', width: 32, radius: 11, stroke: 3, fontSize: 'text-[8px]' },
                            { size: 'sm', width: 40, radius: 14, stroke: 4, fontSize: 'text-[9px]' },
                            { size: 'md', width: 48, radius: 18, stroke: 5, fontSize: 'text-sm' },
                            { size: 'lg', width: 56, radius: 21, stroke: 5, fontSize: 'text-base' },
                        ].map(({ size, width, radius, stroke, fontSize }) => {
                            const score = 85;
                            const color = '#4D7C6F';
                            const circumference = 2 * Math.PI * radius;
                            const offset = circumference - (score / 100) * circumference;
                            return (
                                <div key={size} className="flex flex-col items-center gap-1">
                                    <div className="relative rounded-full" style={{ width, height: width, backgroundColor: `${color}10` }}>
                                        <svg className="-rotate-90" style={{ width, height: width }}>
                                            <circle cx={width/2} cy={width/2} r={radius} fill="none" strokeWidth={stroke} stroke={`${color}20`} />
                                            <circle cx={width/2} cy={width/2} r={radius} fill="none" strokeWidth={stroke} stroke={color} strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" />
                                        </svg>
                                        <span className={`absolute inset-0 flex items-center justify-center font-bold ${fontSize}`} style={{ color }}>{score}</span>
                                    </div>
                                    <span className="text-[8px] text-on-surface-variant/60">{size}</span>
                                </div>
                            );
                        })}
                    </div>
                </ComponentRow>

                {/* Usage Guidelines Box */}
                <div className="mb-8 p-4 bg-[#783264]/5 border border-[#783264]/20 rounded-xl">
                    <h4 className="text-sm font-semibold text-[#783264] mb-3 flex items-center gap-2">
                        <Icon name="info" className="w-4 h-4" />
                        Size Selection Guidelines
                    </h4>
                    <div className="grid grid-cols-2 gap-4 text-xs text-on-surface-variant">
                        <div>
                            <p className="font-semibold text-on-surface mb-2">When to use each size:</p>
                            <ul className="space-y-1.5">
                                <li className="flex items-start gap-2">
                                    <span className="font-mono font-bold text-on-surface-variant/80">xs</span>
                                    <span>Inline metadata, table cells, very compact cards</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <span className="font-mono font-bold text-on-surface-variant/80">sm</span>
                                    <span>Detection cards, list items, secondary information</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <span className="font-mono font-bold text-[#783264]">md</span>
                                    <span>Default - detail pages, forms, primary UI elements</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <span className="font-mono font-bold text-on-surface-variant/80">lg</span>
                                    <span>Page headers, hero sections, prominent callouts</span>
                                </li>
                            </ul>
                        </div>
                        <div>
                            <p className="font-semibold text-on-surface mb-2">Consistency rules:</p>
                            <ul className="space-y-1.5">
                                <li className="flex items-start gap-2">
                                    <Icon name="check" className="w-3 h-3 text-[#4D7C6F] flex-shrink-0 mt-0.5" />
                                    <span>Use same size for badges in the same row/context</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <Icon name="check" className="w-3 h-3 text-[#4D7C6F] flex-shrink-0 mt-0.5" />
                                    <span>Cards use sm, detail headers use md</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <Icon name="check" className="w-3 h-3 text-[#4D7C6F] flex-shrink-0 mt-0.5" />
                                    <span>Keep icon-to-text ratio proportional</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <Icon name="check" className="w-3 h-3 text-[#4D7C6F] flex-shrink-0 mt-0.5" />
                                    <span>Quality scores: md for cards, lg for detail pages</span>
                                </li>
                            </ul>
                        </div>
                    </div>
                </div>

                {/* ===== REFERENCE MOCKUPS ===== */}
                <div className="mt-10 pt-8 border-t-2 border-[#783264]/20">
                    <h3 className="text-base font-semibold text-[#783264] mb-2">Reference Mockups</h3>
                    <p className="text-sm text-on-surface-variant mb-6">See how all badge and chip components work together with correct sizing in real UI contexts</p>
                </div>

                {/* Detection Card Mockup */}
                <div className="mb-8">
                    <label className="block text-xs font-bold uppercase tracking-widest text-on-surface-variant mb-3">Detection Card (sm)</label>
                    <div className="w-full max-w-md bg-surface-container-low border border-outline-variant/30 rounded-2xl p-5 hover:border-primary/40 transition-all">
                        {/* Header */}
                        <div className="flex items-start justify-between mb-3">
                            <div className="flex-1 min-w-0">
                                <h3 className="text-sm font-semibold text-on-surface truncate mb-1.5">Suspicious PowerShell Execution</h3>
                                <div className="flex flex-wrap items-center gap-1.5">
                                    {/* Status Badge - SM */}
                                    <span className="px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide rounded-md bg-[#4D7C6F]/15 text-[#4D7C6F]">Production</span>
                                    {/* Severity Badge - SM */}
                                    <span className="px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide rounded-md bg-[#A63D40]/15 text-[#A63D40] border border-[#A63D40]/20">Critical</span>
                                </div>
                            </div>
                            {/* Quality Score - SM (40px) */}
                            <div className="relative w-10 h-10 flex-shrink-0 rounded-full" style={{ backgroundColor: '#4D7C6F10' }}>
                                <svg className="w-10 h-10 -rotate-90" viewBox="0 0 40 40">
                                    <circle cx="20" cy="20" r="14" fill="none" strokeWidth="4" stroke="#4D7C6F20" />
                                    <circle cx="20" cy="20" r="14" fill="none" strokeWidth="4" stroke="#4D7C6F" strokeDasharray={`${0.85 * 2 * Math.PI * 14} ${2 * Math.PI * 14}`} strokeLinecap="round" />
                                </svg>
                                <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold text-[#4D7C6F]">85</span>
                            </div>
                        </div>

                        {/* Description */}
                        <p className="text-xs text-on-surface-variant mb-3 line-clamp-2">Detects suspicious PowerShell command execution patterns commonly used by threat actors for initial access and execution.</p>

                        {/* MITRE Chips - SM */}
                        <div className="flex flex-wrap gap-1.5 mb-3">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[9px] font-mono font-bold rounded-md bg-[#783264]/10 text-[#783264] border border-[#783264]/20">
                                <Icon name="target" className="w-2.5 h-2.5" />
                                TA0002
                            </span>
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[9px] font-mono font-bold rounded-md bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
                                <Icon name="zap" className="w-2.5 h-2.5" />
                                T1059.001
                            </span>
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[9px] font-bold rounded-md bg-[#A63D40]/10 text-[#A63D40] border border-[#A63D40]/20">
                                <Icon name="users" className="w-2.5 h-2.5" />
                                APT29
                            </span>
                        </div>

                        {/* Footer */}
                        <div className="flex items-center justify-between pt-3 border-t border-outline-variant/20">
                            <span className="inline-flex items-center gap-1.5 text-[10px] text-on-surface-variant">
                                <span className="w-5 h-5 rounded-full bg-primary flex items-center justify-center text-white text-[8px] font-bold">JD</span>
                                John Doe
                            </span>
                            <span className="text-[10px] text-on-surface-variant/60">Updated 2h ago</span>
                        </div>
                    </div>
                </div>

                {/* Detection Details Title Bar Mockup */}
                <div className="mb-8">
                    <label className="block text-xs font-bold uppercase tracking-widest text-on-surface-variant mb-3">Detection Details - Title Bar (md)</label>
                    <div className="w-full bg-surface-container border border-outline-variant/30 rounded-2xl overflow-hidden">
                        {/* Title Bar */}
                        <div className="px-5 py-4 border-b border-outline-variant/20">
                            <div className="flex items-start justify-between gap-4">
                                {/* Left: Title + Badges */}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-2">
                                        <button className="p-1 rounded hover:bg-surface-container-highest text-on-surface-variant">
                                            <Icon name="arrow-left" className="w-4 h-4" />
                                        </button>
                                        <h1 className="text-lg font-semibold text-on-surface truncate">Suspicious PowerShell Execution with Encoded Commands</h1>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2 ml-7">
                                        <span className="font-mono text-[10px] text-on-surface-variant/60">#a1b2c3d4</span>
                                        {/* Status - MD */}
                                        <span className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide rounded-lg bg-[#4D7C6F]/15 text-[#4D7C6F]">Production</span>
                                        {/* Severity - MD */}
                                        <span className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide rounded-lg bg-[#A63D40]/15 text-[#A63D40] border border-[#A63D40]/20">Critical</span>
                                        {/* Library Type - MD */}
                                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-bold rounded-lg bg-[#783264]/10 text-[#783264] border border-[#783264]/20">
                                            <Icon name="globe" className="w-3 h-3" />
                                            Universal
                                        </span>
                                    </div>
                                </div>

                                {/* Right: Quality Score + Actions */}
                                <div className="flex items-center gap-3 flex-shrink-0">
                                    {/* Quality Score - MD (48px) */}
                                    <div className="relative w-12 h-12 rounded-full" style={{ backgroundColor: '#4D7C6F10' }}>
                                        <svg className="w-12 h-12 -rotate-90" viewBox="0 0 48 48">
                                            <circle cx="24" cy="24" r="18" fill="none" strokeWidth="5" stroke="#4D7C6F20" />
                                            <circle cx="24" cy="24" r="18" fill="none" strokeWidth="5" stroke="#4D7C6F" strokeDasharray={`${0.85 * 2 * Math.PI * 18} ${2 * Math.PI * 18}`} strokeLinecap="round" />
                                        </svg>
                                        <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-[#4D7C6F]">85</span>
                                    </div>
                                    {/* Actions */}
                                    <button className="p-2 rounded-full hover:bg-surface-container-highest text-on-surface-variant">
                                        <Icon name="download" className="w-4 h-4" />
                                    </button>
                                    <button className="px-4 py-2 text-xs font-medium bg-primary text-on-primary rounded-full">
                                        Edit
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* MITRE Context Row - SM (compact secondary info) */}
                        <div className="px-5 py-3 bg-surface-container-low/50 flex flex-wrap items-center gap-2">
                            <span className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mr-2">MITRE ATT&CK:</span>
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[9px] font-mono font-bold rounded-md bg-[#783264]/10 text-[#783264] border border-[#783264]/20">
                                <Icon name="target" className="w-2.5 h-2.5" />
                                TA0002
                            </span>
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[9px] font-mono font-bold rounded-md bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
                                <Icon name="zap" className="w-2.5 h-2.5" />
                                T1059.001
                            </span>
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[9px] font-bold rounded-md bg-[#A63D40]/10 text-[#A63D40] border border-[#A63D40]/20">
                                <Icon name="users" className="w-2.5 h-2.5" />
                                <span className="font-mono">G0016</span>
                                APT29
                            </span>
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[9px] font-bold rounded-md bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/20">
                                <Icon name="package" className="w-2.5 h-2.5" />
                                <span className="font-mono">S0154</span>
                                Cobalt Strike
                            </span>
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[9px] font-bold rounded-md bg-[#4D7C6F]/10 text-[#4D7C6F] border border-[#4D7C6F]/20">
                                <Icon name="database" className="w-2.5 h-2.5" />
                                <span className="font-mono">DS0009</span>
                                Process
                            </span>
                        </div>
                    </div>
                </div>
            </Section>
        </DesignSystemPage>
    );
};

export default BadgesPage;
