import React from 'react';
import { DesignSystemPage, Section, ComponentRow } from '../shared';
import { Icon } from '../../Icon';

// =============================================================================
// MITRE ATT&CK TECHNIQUE TOOLTIP REDESIGN
// =============================================================================

const MOCK_DETECTIONS = [
    { name: 'Impossible Travel', status: 'Production' },
    { name: 'AI Agents - No Auth Required', status: 'Production' },
    { name: 'Atypical Travel', status: 'Draft' },
];
const MOCK_GROUPS = [
    { name: 'APT41' },
    { name: 'Volt Typhoon' },
    { name: 'Indrik Spider' },
    { name: 'BlackByte' },
    { name: 'GALLIUM' },
    { name: 'Dragonfly' },
];
const MOCK_SOFTWARE = [
    { name: 'Mimikatz', icon: 'key' },
    { name: 'Cobalt Strike', icon: 'crosshair' },
    { name: 'SeaDuke', icon: 'terminal' },
    { name: 'Industroyer', icon: 'zap' },
];

// Quality-score style ring badge — exact same structure as BadgesPage
const ScoreRing: React.FC<{ value: number; max?: number; color: string; size?: number }> = ({
    value, max = 100, color, size = 48,
}) => {
    const r = (size / 2) - 6;
    const circumference = 2 * Math.PI * r;
    const offset = circumference - (Math.min(value, max) / max) * circumference;
    const half = size / 2;
    return (
        <div className="relative rounded-full" style={{ width: size, height: size, backgroundColor: `${color}10` }}>
            <svg className="-rotate-90" style={{ width: size, height: size }}>
                <circle cx={half} cy={half} r={r} fill="none" strokeWidth="5" stroke={`${color}20`} />
                <circle cx={half} cy={half} r={r} fill="none" strokeWidth="5" stroke={color}
                    strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-xs font-bold font-brand" style={{ color }}>
                {value}
            </span>
        </div>
    );
};

export const MitreTooltipPage: React.FC = () => {
    const PRIMARY = '#783264';

    return (
        <DesignSystemPage title="MITRE Tooltip" description="Two design options — deep black backgrounds, Orbitron headers, solid colors">

            {/* ============= OPTION A: Cyber Intel Card ============= */}
            <Section title="Option A — Cyber Intel Card" description="Score-ring badge, Orbitron technique name + ID, solid primary coverage, threat actor icons">
                <ComponentRow label="Full data + empty state" source="detection-studio" page="MITRE Matrix">
                    <div className="flex gap-8 flex-wrap items-start">

                        {/* ---- Full data card ---- */}
                        <div className="w-[340px] rounded-xl overflow-hidden bg-background shadow-2xl shadow-black/60">
                            {/* Top accent glow */}
                            <div className="h-[2px]" style={{ background: `linear-gradient(to right, transparent, ${PRIMARY}, transparent)` }} />

                            {/* Header */}
                            <div className="px-4 pt-3.5 pb-2.5">
                                <div className="flex items-start justify-between">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2">
                                            <span className="font-brand text-[11px] font-bold tracking-wider text-primary bg-primary/10 px-1.5 py-0.5 rounded">T1078</span>
                                            <span className="text-[9px] text-on-surface-variant font-medium">INITIAL ACCESS</span>
                                        </div>
                                        <h3 className="font-brand text-[14px] font-semibold text-on-surface mt-1.5 leading-tight tracking-wide">Valid Accounts</h3>
                                        <p className="text-[10px] text-on-surface-variant mt-1 leading-relaxed line-clamp-2">
                                            Adversaries may obtain and abuse credentials of existing accounts as a means of gaining Initial Access, Persistence, Privilege Escalation, or Defense Evasion.
                                        </p>
                                    </div>
                                    <div className="flex-shrink-0 ml-3 mt-0.5">
                                        <ScoreRing value={18} max={25} color={PRIMARY} />
                                    </div>
                                </div>
                            </div>

                            {/* Coverage */}
                            <div className="px-4 py-2.5 bg-surface-container-lowest/50">
                                <div className="flex items-center gap-2 mb-2">
                                    <Icon name="radar" className="w-3 h-3 text-primary" />
                                    <span className="text-[9px] font-bold text-on-surface-variant uppercase tracking-widest">Your Coverage</span>
                                    <div className="flex-1 h-px bg-outline-variant/20" />
                                </div>
                                <div className="space-y-1">
                                    {MOCK_DETECTIONS.map((det, i) => (
                                        <div key={i} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-surface-container-low/60 hover:bg-surface-container-low transition-colors">
                                            <Icon name="eye" className={`w-3 h-3 flex-shrink-0 ${det.status === 'Draft' ? 'text-on-surface-variant/40' : 'text-primary'}`} />
                                            <span className="text-[10px] text-on-surface truncate flex-1">{det.name}</span>
                                            <span className={`text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${det.status === 'Draft' ? 'text-on-surface-variant/40' : 'text-primary bg-primary/10'}`}>
                                                {det.status === 'Draft' ? 'Draft' : 'Prod'}
                                            </span>
                                        </div>
                                    ))}
                                    <span className="text-[9px] text-on-surface-variant px-2.5">+15 more</span>
                                </div>
                            </div>

                            {/* Threat Groups */}
                            <div className="px-4 py-2.5">
                                <div className="flex items-center gap-2 mb-2">
                                    <Icon name="threat-actor" className="w-3 h-3 text-[#A63D40]" />
                                    <span className="text-[9px] font-bold text-on-surface-variant uppercase tracking-widest">Threat Groups</span>
                                    <div className="flex-1 h-px bg-outline-variant/20" />
                                </div>
                                <div className="flex flex-wrap gap-1 px-0.5">
                                    {MOCK_GROUPS.map(g => (
                                        <span key={g.name} className="inline-flex items-center gap-1 px-2 py-[3px] text-[9px] font-medium text-[#A63D40] border border-outline-variant/20 rounded-md">
                                            <Icon name="threat-actor" className="w-2.5 h-2.5 text-[#A63D40]" />
                                            {g.name}
                                        </span>
                                    ))}
                                </div>
                            </div>

                            {/* Tools & Malware */}
                            <div className="px-4 py-2.5 bg-surface-container-lowest/50">
                                <div className="flex items-center gap-2 mb-2">
                                    <Icon name="bug" className="w-3 h-3 text-amber-400" />
                                    <span className="text-[9px] font-bold text-on-surface-variant uppercase tracking-widest">Tools & Malware</span>
                                    <div className="flex-1 h-px bg-outline-variant/20" />
                                </div>
                                <div className="flex flex-wrap gap-1 px-0.5">
                                    {MOCK_SOFTWARE.map(s => (
                                        <span key={s.name} className="inline-flex items-center gap-1 px-2 py-[3px] text-[9px] font-medium text-amber-400 border border-outline-variant/20 rounded-md">
                                            <Icon name={s.icon} className="w-2.5 h-2.5 text-amber-400" />
                                            {s.name}
                                        </span>
                                    ))}
                                </div>
                            </div>

                            {/* Footer */}
                            <div className="px-4 py-2 flex items-center justify-between">
                                <span className="text-[9px] text-on-surface-variant font-medium">Click to explore</span>
                                <Icon name="chevron-right" className="w-3 h-3 text-on-surface-variant" />
                            </div>
                        </div>

                        {/* ---- Empty state ---- */}
                        <div className="w-[340px] rounded-xl overflow-hidden bg-background shadow-2xl shadow-black/60">
                            <div className="h-[2px] bg-gradient-to-r from-transparent via-outline-variant/20 to-transparent" />
                            <div className="px-4 pt-3.5 pb-2.5">
                                <div className="flex items-start justify-between">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2">
                                            <span className="font-brand text-[11px] text-on-surface-variant font-bold tracking-wider">T1595</span>
                                            <span className="text-[9px] text-on-surface-variant/60 font-medium">RECONNAISSANCE</span>
                                        </div>
                                        <h3 className="font-brand text-[14px] font-semibold text-on-surface mt-1.5 tracking-wide">Active Scanning</h3>
                                        <p className="text-[10px] text-on-surface-variant mt-1 leading-relaxed line-clamp-2">
                                            Adversaries may execute active reconnaissance scans to gather information that can be used during targeting.
                                        </p>
                                    </div>
                                    <div className="flex-shrink-0 ml-3 mt-0.5">
                                        <ScoreRing value={0} max={25} color="#555" />
                                    </div>
                                </div>
                            </div>
                            <div className="px-4 py-5 flex flex-col items-center">
                                <div className="w-9 h-9 rounded-xl bg-surface-container-low flex items-center justify-center mb-2">
                                    <Icon name="shield" className="w-4 h-4 text-on-surface-variant/40" />
                                </div>
                                <span className="text-[10px] text-on-surface-variant font-medium">No coverage or linked intelligence</span>
                            </div>
                            <div className="px-4 py-2 flex items-center justify-between">
                                <span className="text-[9px] text-on-surface-variant font-medium">Click to explore</span>
                                <Icon name="chevron-right" className="w-3 h-3 text-on-surface-variant" />
                            </div>
                        </div>
                    </div>
                </ComponentRow>
            </Section>

            {/* ============= OPTION B: Threat Dashboard ============= */}
            <Section title="Option B — Threat Dashboard" description="Coverage ring, Orbitron counters, dashboard-dense layout">
                <ComponentRow label="Full data + empty state" source="detection-studio" page="MITRE Matrix">
                    <div className="flex gap-8 flex-wrap items-start">

                        {/* ---- Full data card ---- */}
                        <div className="w-[340px] rounded-xl overflow-hidden bg-background shadow-2xl shadow-black/60">
                            {/* Header with coverage ring */}
                            <div className="px-4 pt-3.5 pb-3 bg-surface-container-lowest">
                                <div className="flex items-start justify-between">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2">
                                            <span className="font-brand text-[10px] font-bold tracking-wider px-2 py-0.5 rounded text-primary bg-primary/10">{`T1078`}</span>
                                            <span className="text-[9px] text-on-surface-variant font-medium">Initial Access</span>
                                        </div>
                                        <h3 className="font-brand text-[14px] font-semibold text-on-surface mt-1.5 tracking-wide">Valid Accounts</h3>
                                    </div>
                                    <div className="flex-shrink-0 ml-3">
                                        <ScoreRing value={18} max={25} color={PRIMARY} />
                                    </div>
                                </div>

                                {/* Stat counters */}
                                <div className="flex gap-4 mt-2.5">
                                    <div className="flex items-center gap-1.5">
                                        <div className="w-5 h-5 rounded-md bg-[#A63D40]/10 flex items-center justify-center">
                                            <Icon name="threat-actor" className="w-3 h-3 text-[#A63D40]" />
                                        </div>
                                        <span className="text-[10px] text-on-surface-variant">
                                            <span className="font-brand font-bold text-on-surface text-[11px]">6</span> groups
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <div className="w-5 h-5 rounded-md bg-amber-500/10 flex items-center justify-center">
                                            <Icon name="bug" className="w-3 h-3 text-amber-400" />
                                        </div>
                                        <span className="text-[10px] text-on-surface-variant">
                                            <span className="font-brand font-bold text-on-surface text-[11px]">4</span> tools
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <div className="w-5 h-5 rounded-md bg-sky-500/10 flex items-center justify-center">
                                            <Icon name="flag" className="w-3 h-3 text-sky-400" />
                                        </div>
                                        <span className="text-[10px] text-on-surface-variant">
                                            <span className="font-brand font-bold text-on-surface text-[11px]">2</span> campaigns
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Detections */}
                            <div className="px-4 py-2.5">
                                <div className="flex items-center gap-2 mb-1.5">
                                    <Icon name="radar" className="w-3 h-3 text-primary" />
                                    <span className="text-[9px] font-bold text-on-surface-variant uppercase tracking-widest">Detections</span>
                                </div>
                                <div className="space-y-1">
                                    {MOCK_DETECTIONS.map((det, i) => (
                                        <div key={i} className="flex items-center gap-2 px-2 py-1 rounded-md hover:bg-surface-container-low/40 transition-colors">
                                            <Icon name="eye" className={`w-3 h-3 flex-shrink-0 ${det.status === 'Draft' ? 'text-on-surface-variant/40' : 'text-primary'}`} />
                                            <span className="text-[10px] text-on-surface truncate flex-1">{det.name}</span>
                                            <span className={`text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${det.status === 'Draft' ? 'text-on-surface-variant/40' : 'text-primary bg-primary/10'}`}>
                                                {det.status === 'Draft' ? 'Draft' : 'Prod'}
                                            </span>
                                        </div>
                                    ))}
                                    <span className="text-[9px] text-on-surface-variant ml-3">+15 more</span>
                                </div>
                            </div>

                            {/* Groups */}
                            <div className="px-4 py-2.5 bg-surface-container-lowest/50">
                                <div className="flex items-center gap-2 mb-1.5">
                                    <Icon name="threat-actor" className="w-3 h-3 text-[#A63D40]" />
                                    <span className="text-[9px] font-bold text-on-surface-variant uppercase tracking-widest">Groups</span>
                                </div>
                                <div className="flex flex-wrap gap-1">
                                    {MOCK_GROUPS.map(g => (
                                        <span key={g.name} className="inline-flex items-center gap-1 px-1.5 py-[3px] text-[9px] font-medium text-[#A63D40] border border-outline-variant/20 rounded-md">
                                            <Icon name="threat-actor" className="w-2.5 h-2.5 text-[#A63D40]" />
                                            {g.name}
                                        </span>
                                    ))}
                                </div>
                            </div>

                            {/* Malware & Tools */}
                            <div className="px-4 py-2.5">
                                <div className="flex items-center gap-2 mb-1.5">
                                    <Icon name="bug" className="w-3 h-3 text-amber-400" />
                                    <span className="text-[9px] font-bold text-on-surface-variant uppercase tracking-widest">Malware & Tools</span>
                                </div>
                                <div className="flex flex-wrap gap-1">
                                    {MOCK_SOFTWARE.map(s => (
                                        <span key={s.name} className="inline-flex items-center gap-1 px-1.5 py-[3px] text-[9px] font-medium text-amber-400 border border-outline-variant/20 rounded-md">
                                            <Icon name={s.icon} className="w-2.5 h-2.5 text-amber-400" />
                                            {s.name}
                                        </span>
                                    ))}
                                </div>
                            </div>

                            {/* Footer */}
                            <div className="px-4 py-2 flex items-center justify-between bg-surface-container-lowest/50">
                                <span className="text-[9px] text-on-surface-variant">Click for full details</span>
                                <Icon name="chevron-right" className="w-3 h-3 text-on-surface-variant" />
                            </div>
                        </div>

                        {/* ---- Empty state ---- */}
                        <div className="w-[340px] rounded-xl overflow-hidden bg-background shadow-2xl shadow-black/60">
                            <div className="px-4 pt-3.5 pb-3 bg-surface-container-lowest">
                                <div className="flex items-start justify-between">
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <span className="font-brand text-[10px] text-on-surface-variant bg-surface-container-low px-2 py-0.5 rounded font-bold tracking-wider">T1595</span>
                                            <span className="text-[9px] text-on-surface-variant/60 font-medium">Reconnaissance</span>
                                        </div>
                                        <h3 className="font-brand text-[14px] font-semibold text-on-surface mt-1.5 tracking-wide">Active Scanning</h3>
                                    </div>
                                    <div className="flex-shrink-0 ml-3">
                                        <ScoreRing value={0} max={25} color="#555" />
                                    </div>
                                </div>
                                <div className="flex gap-3 mt-2.5">
                                    <span className="text-[10px] text-on-surface-variant">No linked intelligence</span>
                                </div>
                            </div>
                            <div className="px-4 py-4 text-center">
                                <p className="text-[10px] text-on-surface-variant leading-relaxed">
                                    Adversaries may execute active reconnaissance scans to gather information that can be used during targeting.
                                </p>
                            </div>
                            <div className="px-4 py-2 flex items-center justify-between bg-surface-container-lowest/50">
                                <span className="text-[9px] text-on-surface-variant">Click for full details</span>
                                <Icon name="chevron-right" className="w-3 h-3 text-on-surface-variant" />
                            </div>
                        </div>
                    </div>
                </ComponentRow>
            </Section>

            {/* ============= Current Design (for comparison) ============= */}
            <Section title="Current Design (reference)" description="The existing tooltip for comparison">
                <ComponentRow label="Current implementation" source="detection-studio" page="MITRE Matrix">
                    <div className="flex gap-8 flex-wrap">
                        <div className="w-72 rounded-xl overflow-hidden border border-outline-variant/20 bg-surface-container-highest shadow-2xl">
                            <div className="px-3 py-2.5 border-b border-outline-variant/15 bg-surface-container-high">
                                <div className="flex items-center gap-2">
                                    <span className="font-mono text-[10px] text-primary font-bold">T1078</span>
                                    <span className="flex items-center gap-1 text-[9px] font-medium text-tertiary">
                                        <span className="w-1.5 h-1.5 rounded-full bg-tertiary" />
                                        18 detections
                                    </span>
                                </div>
                                <div className="text-xs font-medium text-on-surface mt-0.5 leading-tight">Valid Accounts</div>
                            </div>
                            <div className="p-2.5 space-y-2">
                                <div className="space-y-1">
                                    <div className="text-[9px] font-bold text-on-surface-variant/60 uppercase tracking-wider px-1">Your Coverage</div>
                                    {MOCK_DETECTIONS.map((det, i) => (
                                        <div key={i} className="flex items-center gap-2 px-2 py-1.5 bg-surface-container rounded-lg">
                                            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${det.status === 'Draft' ? 'bg-on-surface-variant/30' : 'bg-tertiary'}`} />
                                            <span className="text-[10px] text-on-surface truncate flex-1">{det.name}</span>
                                        </div>
                                    ))}
                                    <div className="text-[9px] text-on-surface-variant/40 px-2">+15 more</div>
                                </div>
                                <div className="space-y-1">
                                    <div className="text-[9px] font-bold text-on-surface-variant/60 uppercase tracking-wider px-1">Threat Groups</div>
                                    <div className="flex flex-wrap gap-1 px-1">
                                        {MOCK_GROUPS.map(g => (
                                            <span key={g.name} className="px-1.5 py-0.5 text-[9px] font-medium text-on-surface-variant bg-surface-container rounded">{g.name}</span>
                                        ))}
                                    </div>
                                </div>
                                <div className="space-y-1">
                                    <div className="text-[9px] font-bold text-on-surface-variant/60 uppercase tracking-wider px-1">Tools & Malware</div>
                                    <div className="flex flex-wrap gap-1 px-1">
                                        {MOCK_SOFTWARE.map(s => (
                                            <span key={s.name} className="px-1.5 py-0.5 text-[9px] font-medium text-on-surface-variant bg-surface-container rounded">{s.name}</span>
                                        ))}
                                    </div>
                                </div>
                            </div>
                            <div className="px-3 py-1.5 bg-surface-container border-t border-outline-variant/10 flex items-center justify-between">
                                <span className="text-[9px] text-on-surface-variant/40">Click for details</span>
                                <Icon name="chevron-right" className="w-3 h-3 text-on-surface-variant/30" />
                            </div>
                        </div>
                    </div>
                </ComponentRow>
            </Section>

        </DesignSystemPage>
    );
};
