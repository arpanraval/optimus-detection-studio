/**
 * AI Chat Cards - Design System Page
 * Three redesign options for Optimus Prime AI response cards
 * Goal: Uniform sizing, consistent styling, polished M3 design
 */

import React, { useState } from 'react';
import { DesignSystemPage, Section, ComponentRow } from '../shared';
import { Icon } from '../../Icon';

// =============================================================================
// MOCK DATA (shared across all options)
// =============================================================================

const MOCK_THREAT_ACTOR = {
    actor: { name: 'Scattered Spider', mitreId: 'G1015', aliases: ['UNC3944', 'Starfraud', 'Octo Tempest'] },
    total: 64,
    production: { count: 59, percent: 92, techniques: [
        { id: 'T1566.001', name: 'Spearphishing Attachment' },
        { id: 'T1078', name: 'Valid Accounts' },
        { id: 'T1021.001', name: 'Remote Desktop Protocol' },
    ]},
    gaps: { count: 3, percent: 5, techniques: [
        { id: 'T1621', name: 'Multi-Factor Authentication Request Generation' },
        { id: 'T1539', name: 'Steal Web Session Cookie' },
        { id: 'T1199', name: 'Trusted Relationship' },
    ]},
    inLibrary: { count: 2, percent: 3, techniques: [
        { id: 'T1547.001', name: 'Registry Run Keys / Startup Folder' },
        { id: 'T1036.005', name: 'Match Legitimate Name or Location' },
    ]},
};

const MOCK_COVERAGE = {
    title: 'Overall MITRE ATT&CK Coverage',
    total: 201,
    production: { count: 87, percent: 43, techniques: [
        { id: 'T1059', name: 'Command and Scripting Interpreter', detectionCount: 12 },
        { id: 'T1078', name: 'Valid Accounts', detectionCount: 8 },
        { id: 'T1566', name: 'Phishing', detectionCount: 6 },
    ]},
    inLibrary: { count: 34, percent: 17, techniques: [
        { id: 'T1547', name: 'Boot or Logon Autostart Execution' },
        { id: 'T1036', name: 'Masquerading' },
    ]},
    gaps: { count: 80, percent: 40, techniques: [
        { id: 'T1621', name: 'MFA Request Generation', priority: 'critical' as const },
        { id: 'T1539', name: 'Steal Web Session Cookie', priority: 'high' as const },
    ]},
};

const MOCK_SEARCH = {
    query: 'credential access phishing',
    total: 6,
    results: [
        { id: 'det-001', name: 'Phishing Email with Suspicious Attachment', status: 'production', mitreIds: ['T1566.001', 'T1204.002'] },
        { id: 'det-002', name: 'Credential Harvesting via OAuth Phishing', status: 'production', mitreIds: ['T1566.002', 'T1528'] },
        { id: 'det-003', name: 'Browser Credential Theft Detection', status: 'testing', mitreIds: ['T1555.003'] },
        { id: 'det-004', name: 'LSASS Memory Dump via Mimikatz', status: 'production', mitreIds: ['T1003.001'] },
    ],
};

const MOCK_GAPS = {
    profile: 'ransomware',
    profileTechniques: 47,
    covered: 28,
    coveragePercent: 60,
    gaps: [
        { id: 'T1490', name: 'Inhibit System Recovery', priority: 'critical' as const },
        { id: 'T1489', name: 'Service Stop', priority: 'critical' as const },
        { id: 'T1486', name: 'Data Encrypted for Impact', priority: 'critical' as const },
        { id: 'T1562.001', name: 'Disable or Modify Tools', priority: 'high' as const },
    ],
    quickWins: [
        { id: 'T1490', name: 'Inhibit System Recovery', reason: 'Sigma rule available in community feed' },
        { id: 'T1489', name: 'Service Stop', reason: 'Similar detection exists for T1543' },
    ],
    recommendation: 'Focus on critical ransomware impact techniques first. T1490 and T1489 have Sigma rules available for quick deployment.',
};

// =============================================================================
// SHARED PRIMITIVES — Used by all redesign options
// =============================================================================

const priorityColor = (p: string) => {
    switch (p) {
        case 'critical': return 'bg-error/15 text-error border-error/20';
        case 'high': return 'bg-primary/15 text-primary border-primary/20';
        case 'medium': return 'bg-secondary/15 text-secondary border-secondary/20';
        default: return 'bg-surface-container-highest text-on-surface-variant border-outline-variant/20';
    }
};

const statusColor = (s: string) => {
    switch (s?.toLowerCase()) {
        case 'production': return 'bg-secondary/15 text-secondary border-secondary/20';
        case 'testing': return 'bg-tertiary/15 text-tertiary border-tertiary/20';
        case 'draft': return 'bg-surface-container-highest text-on-surface-variant border-outline-variant/20';
        default: return 'bg-surface-container-highest text-on-surface-variant border-outline-variant/20';
    }
};

const coverageColor = (pct: number) => {
    if (pct >= 75) return { text: 'text-secondary', bg: 'bg-secondary', ring: 'border-secondary/30' };
    if (pct >= 50) return { text: 'text-primary', bg: 'bg-primary', ring: 'border-primary/30' };
    if (pct >= 25) return { text: 'text-tertiary', bg: 'bg-tertiary', ring: 'border-tertiary/30' };
    return { text: 'text-error', bg: 'bg-error', ring: 'border-error/30' };
};

// =============================================================================
// OPTION A — "Clean Uniform"
// Flat, consistent containers. All cards share identical shell.
// Inspired by Linear/Vercel. Maximum consistency, minimal decoration.
// =============================================================================

const A_Card: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div className="w-full bg-surface-container-low rounded-2xl border border-outline-variant/15 overflow-hidden">
        {children}
    </div>
);

const A_Header: React.FC<{ icon: string; label: string; title: string; subtitle?: string; metric?: string; metricLabel?: string; metricColor?: string }> = ({
    icon, label, title, subtitle, metric, metricLabel, metricColor = 'text-on-surface'
}) => (
    <div className="px-5 py-4 flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0 flex-1">
            <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/15 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Icon name={icon} className="w-4 h-4 text-primary" />
            </div>
            <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant/60 mb-0.5">{label}</p>
                <h3 className="text-base font-semibold text-on-surface leading-tight">{title}</h3>
                {subtitle && <p className="text-xs text-on-surface-variant/60 mt-0.5 truncate">{subtitle}</p>}
            </div>
        </div>
        {metric && (
            <div className="flex-shrink-0 text-right">
                <p className={`text-2xl font-bold tabular-nums ${metricColor}`}>{metric}</p>
                {metricLabel && <p className="text-[10px] text-on-surface-variant/50">{metricLabel}</p>}
            </div>
        )}
    </div>
);

const A_Section: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div className="px-5 py-3 border-t border-outline-variant/10">{children}</div>
);

const A_Actions: React.FC = () => (
    <div className="px-5 py-3 border-t border-outline-variant/10 flex gap-2">
        <button className="px-4 py-2 text-xs font-semibold rounded-xl bg-primary text-on-primary hover:bg-primary/90 transition-colors">
            Primary Action
        </button>
        <button className="px-4 py-2 text-xs font-semibold rounded-xl bg-surface-container-high text-on-surface hover:bg-surface-container-highest transition-colors">
            Secondary
        </button>
    </div>
);

const A_TechRow: React.FC<{ id: string; name: string; trailing?: React.ReactNode; accent?: string }> = ({ id, name, trailing, accent = 'text-on-surface-variant' }) => (
    <div className="flex items-center gap-3 px-3 py-2 rounded-xl bg-surface-container-high/40 hover:bg-surface-container-high/60 transition-colors">
        <code className={`text-xs font-semibold font-mono ${accent} shrink-0`}>{id}</code>
        <span className="text-xs text-on-surface-variant truncate flex-1">{name}</span>
        {trailing}
    </div>
);

const A_ProgressBar: React.FC<{ segments: Array<{ percent: number; color: string }> }> = ({ segments }) => (
    <div className="h-1.5 rounded-full bg-surface-container-highest overflow-hidden flex">
        {segments.map((s, i) => (
            <div key={i} className={`h-full ${s.color}`} style={{ width: `${s.percent}%` }} />
        ))}
    </div>
);

const OptionA: React.FC = () => (
    <div className="space-y-8">
        {/* Threat Actor */}
        <A_Card>
            <A_Header
                icon="crosshairs" label="Threat Actor" title="Scattered Spider"
                subtitle="G1015 · UNC3944, Starfraud, Octo Tempest"
                metric="92%" metricLabel="coverage" metricColor="text-secondary"
            />
            <A_Section>
                <A_ProgressBar segments={[
                    { percent: 92, color: 'bg-primary' },
                    { percent: 3, color: 'bg-secondary' },
                ]} />
                <div className="flex items-center gap-4 mt-2 text-[10px] text-on-surface-variant/60">
                    <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-primary" />59 production</span>
                    <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-secondary" />2 in library</span>
                    <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-surface-container-highest border border-outline-variant/30" />3 gaps</span>
                </div>
            </A_Section>
            <A_Section>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-error/80 mb-2 flex items-center gap-1.5">
                    <Icon name="alert-triangle" className="w-3 h-3" /> Coverage Gaps
                    <span className="text-[9px] font-medium normal-case tracking-normal bg-error/10 text-error px-1.5 py-0.5 rounded-md ml-1">3</span>
                </p>
                <div className="space-y-1.5">
                    {MOCK_THREAT_ACTOR.gaps.techniques.map(t => (
                        <A_TechRow key={t.id} id={t.id} name={t.name} accent="text-error"
                            trailing={<button className="text-[10px] font-semibold text-primary hover:text-primary/80 transition-colors shrink-0">Draft</button>}
                        />
                    ))}
                </div>
            </A_Section>
            <A_Actions />
        </A_Card>

        {/* Coverage Report */}
        <A_Card>
            <A_Header
                icon="shield" label="Coverage Report" title="Overall MITRE ATT&CK Coverage"
                subtitle="201 techniques evaluated"
                metric="43%" metricLabel="production" metricColor="text-primary"
            />
            <A_Section>
                <A_ProgressBar segments={[
                    { percent: 43, color: 'bg-primary' },
                    { percent: 17, color: 'bg-secondary' },
                ]} />
                <div className="flex items-center gap-4 mt-2 text-[10px] text-on-surface-variant/60">
                    <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-primary" />87 production</span>
                    <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-secondary" />34 in library</span>
                    <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-surface-container-highest border border-outline-variant/30" />80 gaps</span>
                </div>
            </A_Section>
            {/* Tiers */}
            {([
                { label: 'Production', sub: '87 deployed and active', pct: 43, color: 'text-primary', badge: 'bg-primary/15 text-primary', techs: MOCK_COVERAGE.production.techniques },
                { label: 'In Library', sub: '34 ready to deploy', pct: 17, color: 'text-secondary', badge: 'bg-secondary/15 text-secondary', techs: MOCK_COVERAGE.inLibrary.techniques },
                { label: 'Gaps', sub: '80 need new detections', pct: 40, color: 'text-error', badge: 'bg-error/15 text-error', techs: MOCK_COVERAGE.gaps.techniques },
            ]).map(tier => (
                <A_Section key={tier.label}>
                    <div className="flex items-center justify-between mb-2">
                        <div>
                            <p className="text-xs font-medium text-on-surface">{tier.label}</p>
                            <p className="text-[10px] text-on-surface-variant/50">{tier.sub}</p>
                        </div>
                        <span className={`text-sm font-bold tabular-nums ${tier.color}`}>{tier.pct}%</span>
                    </div>
                    <div className="space-y-1">
                        {tier.techs.slice(0, 2).map((t: any) => (
                            <A_TechRow key={t.id} id={t.id} name={t.name} accent={tier.color} />
                        ))}
                    </div>
                </A_Section>
            ))}
            <A_Actions />
        </A_Card>

        {/* Search Results */}
        <A_Card>
            <A_Header
                icon="search" label="Search Results" title={`"${MOCK_SEARCH.query}"`}
                subtitle={`${MOCK_SEARCH.total} detections found`}
            />
            <div className="px-5 pb-3 space-y-1.5">
                {MOCK_SEARCH.results.map(r => {
                    const sc = statusColor(r.status);
                    return (
                        <div key={r.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-surface-container-high/40 hover:bg-surface-container-high/60 transition-colors cursor-pointer">
                            <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium text-on-surface truncate">{r.name}</p>
                                <div className="flex items-center gap-1.5 mt-1.5">
                                    <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded border ${sc}`}>{r.status}</span>
                                    {r.mitreIds.slice(0, 3).map(id => (
                                        <span key={id} className="text-[9px] font-mono px-1.5 py-0.5 bg-tertiary/10 text-tertiary rounded">{id}</span>
                                    ))}
                                </div>
                            </div>
                            <Icon name="chevron-right" className="w-3.5 h-3.5 text-on-surface-variant/30 shrink-0" />
                        </div>
                    );
                })}
            </div>
            <A_Actions />
        </A_Card>

        {/* Gap Analysis */}
        <A_Card>
            <A_Header
                icon="lock" label="Gap Analysis" title="Ransomware Profile"
                subtitle="47 techniques in profile"
                metric="60%" metricLabel="28/47 covered" metricColor={coverageColor(60).text}
            />
            <A_Section>
                <A_ProgressBar segments={[{ percent: 60, color: coverageColor(60).bg }]} />
                <p className="text-xs text-on-surface-variant mt-2">{MOCK_GAPS.recommendation}</p>
            </A_Section>
            <A_Section>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-secondary/80 mb-2 flex items-center gap-1.5">
                    <Icon name="zap" className="w-3 h-3" /> Quick Wins
                </p>
                <div className="space-y-1.5">
                    {MOCK_GAPS.quickWins.map(w => (
                        <A_TechRow key={w.id} id={w.id} name={w.name} accent="text-secondary"
                            trailing={<span className="text-[9px] text-on-surface-variant/50 shrink-0 max-w-[140px] truncate">{w.reason}</span>}
                        />
                    ))}
                </div>
            </A_Section>
            <A_Section>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-error/80 mb-2 flex items-center gap-1.5">
                    <Icon name="alert-triangle" className="w-3 h-3" /> Gaps ({MOCK_GAPS.gaps.length})
                </p>
                <div className="space-y-1.5">
                    {MOCK_GAPS.gaps.map(g => (
                        <A_TechRow key={g.id} id={g.id} name={g.name} accent="text-error"
                            trailing={<span className={`text-[8px] font-semibold uppercase px-1.5 py-0.5 rounded border ${priorityColor(g.priority)}`}>{g.priority}</span>}
                        />
                    ))}
                </div>
            </A_Section>
            <A_Actions />
        </A_Card>
    </div>
);

// =============================================================================
// OPTION B — "Elevated Premium"
// Gradient accent bar on the left, floating metric badge, richer visual hierarchy.
// Inspired by Stripe/Raycast. More visual weight, premium feel.
// =============================================================================

const B_Card: React.FC<{ children: React.ReactNode; accentColor?: string }> = ({ children, accentColor = 'bg-primary' }) => (
    <div className="w-full bg-surface-container-low rounded-2xl border border-outline-variant/15 overflow-hidden flex">
        <div className={`w-1 ${accentColor} shrink-0`} />
        <div className="flex-1 min-w-0">{children}</div>
    </div>
);

const B_Header: React.FC<{ icon: string; title: string; subtitle?: string; badge?: React.ReactNode }> = ({
    icon, title, subtitle, badge
}) => (
    <div className="px-5 py-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/15 to-primary/5 border border-primary/15 flex items-center justify-center flex-shrink-0">
                <Icon name={icon} className="w-5 h-5 text-primary" />
            </div>
            <div className="min-w-0">
                <h3 className="text-base font-semibold text-on-surface leading-tight">{title}</h3>
                {subtitle && <p className="text-xs text-on-surface-variant/60 mt-0.5 truncate">{subtitle}</p>}
            </div>
        </div>
        {badge}
    </div>
);

const B_MetricBadge: React.FC<{ value: string; label: string; variant?: 'primary' | 'secondary' | 'error' }> = ({
    value, label, variant = 'primary'
}) => {
    const styles = {
        primary: 'bg-primary/10 text-primary border-primary/20',
        secondary: 'bg-secondary/10 text-secondary border-secondary/20',
        error: 'bg-error/10 text-error border-error/20',
    }[variant];
    return (
        <div className={`px-3 py-2 rounded-xl border text-center ${styles}`}>
            <p className="text-lg font-bold tabular-nums leading-none">{value}</p>
            <p className="text-[9px] font-medium uppercase tracking-wider mt-1 opacity-70">{label}</p>
        </div>
    );
};

const B_DataRow: React.FC<{ id: string; name: string; trailing?: React.ReactNode }> = ({ id, name, trailing }) => (
    <div className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-surface-container-high/50 transition-colors group">
        <code className="text-[11px] font-semibold font-mono text-on-surface-variant/70 shrink-0 w-20">{id}</code>
        <span className="text-xs text-on-surface-variant truncate flex-1">{name}</span>
        {trailing}
    </div>
);

const B_SectionHeader: React.FC<{ icon: string; label: string; count?: number; color?: string }> = ({
    icon, label, count, color = 'text-on-surface-variant'
}) => (
    <div className="flex items-center gap-1.5 px-1 mb-2">
        <Icon name={icon} className={`w-3.5 h-3.5 ${color}`} />
        <span className={`text-[10px] font-semibold uppercase tracking-wider ${color}`}>{label}</span>
        {count !== undefined && (
            <span className="text-[9px] font-medium bg-surface-container-highest text-on-surface-variant px-1.5 py-0.5 rounded-md ml-auto">{count}</span>
        )}
    </div>
);

const B_Actions: React.FC = () => (
    <div className="px-5 py-3 border-t border-outline-variant/10 flex gap-2">
        <button className="px-4 py-2 text-xs font-semibold rounded-xl bg-primary text-on-primary hover:bg-primary/90 shadow-sm shadow-primary/20 transition-all">
            Primary Action
        </button>
        <button className="px-4 py-2 text-xs font-semibold rounded-xl border border-outline-variant/20 text-on-surface hover:bg-surface-container-high transition-colors">
            Secondary
        </button>
    </div>
);

const B_SegmentBar: React.FC<{ segments: Array<{ pct: number; color: string; label: string }> }> = ({ segments }) => (
    <div>
        <div className="h-2 rounded-full bg-surface-container-highest overflow-hidden flex">
            {segments.map((s, i) => (
                <div key={i} className={`h-full ${s.color}`} style={{ width: `${s.pct}%` }} />
            ))}
        </div>
        <div className="flex items-center gap-4 mt-2 text-[10px] text-on-surface-variant/50">
            {segments.map((s, i) => (
                <span key={i} className="flex items-center gap-1">
                    <span className={`w-1.5 h-1.5 rounded-full ${s.color}`} />{s.label}
                </span>
            ))}
        </div>
    </div>
);

const OptionB: React.FC = () => (
    <div className="space-y-8">
        {/* Threat Actor */}
        <B_Card accentColor="bg-secondary">
            <B_Header icon="crosshairs" title="Scattered Spider"
                subtitle="G1015 · UNC3944, Starfraud"
                badge={<B_MetricBadge value="92%" label="Covered" variant="secondary" />}
            />
            <div className="px-5 pb-4">
                <B_SegmentBar segments={[
                    { pct: 92, color: 'bg-primary', label: '59 production' },
                    { pct: 3, color: 'bg-secondary', label: '2 library' },
                    { pct: 5, color: 'bg-surface-container-highest', label: '3 gaps' },
                ]} />
            </div>
            <div className="px-5 pb-4">
                <B_SectionHeader icon="alert-triangle" label="Coverage Gaps" count={3} color="text-error" />
                <div className="space-y-1 bg-error/5 rounded-xl p-2">
                    {MOCK_THREAT_ACTOR.gaps.techniques.map(t => (
                        <B_DataRow key={t.id} id={t.id} name={t.name}
                            trailing={<button className="text-[10px] font-semibold text-primary opacity-0 group-hover:opacity-100 transition-opacity">Draft</button>}
                        />
                    ))}
                </div>
            </div>
            <B_Actions />
        </B_Card>

        {/* Coverage Report */}
        <B_Card>
            <B_Header icon="shield" title="Overall MITRE ATT&CK Coverage"
                subtitle="201 techniques evaluated"
                badge={<B_MetricBadge value="43%" label="Protected" />}
            />
            <div className="px-5 pb-4">
                <B_SegmentBar segments={[
                    { pct: 43, color: 'bg-primary', label: '87 production' },
                    { pct: 17, color: 'bg-secondary', label: '34 library' },
                    { pct: 40, color: 'bg-surface-container-highest', label: '80 gaps' },
                ]} />
            </div>
            {/* Tier rows */}
            <div className="px-5 pb-4 space-y-3">
                {([
                    { icon: 'shield-check', label: 'Production', count: 87, pct: 43, color: 'text-primary', techs: MOCK_COVERAGE.production.techniques },
                    { icon: 'package', label: 'In Library', count: 34, pct: 17, color: 'text-secondary', techs: MOCK_COVERAGE.inLibrary.techniques },
                    { icon: 'alert-triangle', label: 'Gaps', count: 80, pct: 40, color: 'text-error', techs: MOCK_COVERAGE.gaps.techniques },
                ]).map(tier => (
                    <div key={tier.label} className="rounded-xl border border-outline-variant/10 overflow-hidden">
                        <div className="flex items-center gap-3 px-4 py-2.5 bg-surface-container-high/30">
                            <Icon name={tier.icon} className={`w-4 h-4 ${tier.color}`} />
                            <span className="text-xs font-medium text-on-surface flex-1">{tier.label}</span>
                            <span className={`text-sm font-bold tabular-nums ${tier.color}`}>{tier.pct}%</span>
                            <span className="text-[10px] text-on-surface-variant/50">{tier.count}</span>
                        </div>
                        <div className="px-3 py-2 space-y-0.5">
                            {tier.techs.slice(0, 2).map((t: any) => (
                                <B_DataRow key={t.id} id={t.id} name={t.name} />
                            ))}
                        </div>
                    </div>
                ))}
            </div>
            <B_Actions />
        </B_Card>

        {/* Search Results */}
        <B_Card accentColor="bg-tertiary">
            <B_Header icon="search" title="Search Results"
                subtitle={`"${MOCK_SEARCH.query}" — ${MOCK_SEARCH.total} found`}
            />
            <div className="px-5 pb-4 space-y-1.5">
                {MOCK_SEARCH.results.map(r => {
                    const sc = statusColor(r.status);
                    return (
                        <div key={r.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-outline-variant/10 hover:bg-surface-container-high/40 transition-colors cursor-pointer group">
                            <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium text-on-surface truncate">{r.name}</p>
                                <div className="flex items-center gap-1.5 mt-1.5">
                                    <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded border ${sc}`}>{r.status}</span>
                                    {r.mitreIds.map(id => (
                                        <span key={id} className="text-[9px] font-mono px-1.5 py-0.5 bg-tertiary/10 text-tertiary rounded">{id}</span>
                                    ))}
                                </div>
                            </div>
                            <Icon name="chevron-right" className="w-3.5 h-3.5 text-on-surface-variant/20 group-hover:text-on-surface-variant/50 transition-colors shrink-0" />
                        </div>
                    );
                })}
            </div>
            <B_Actions />
        </B_Card>

        {/* Gap Analysis */}
        <B_Card accentColor="bg-error">
            <B_Header icon="lock" title="Ransomware Readiness"
                subtitle="47 techniques in profile"
                badge={<B_MetricBadge value="60%" label="Covered" variant={60 >= 75 ? 'secondary' : 60 >= 50 ? 'primary' : 'error'} />}
            />
            <div className="px-5 pb-4">
                <div className="h-2 rounded-full bg-surface-container-highest overflow-hidden">
                    <div className="h-full bg-primary rounded-full" style={{ width: '60%' }} />
                </div>
                <p className="text-xs text-on-surface-variant mt-3">{MOCK_GAPS.recommendation}</p>
            </div>
            <div className="px-5 pb-4">
                <B_SectionHeader icon="zap" label="Quick Wins" count={2} color="text-secondary" />
                <div className="space-y-1 bg-secondary/5 rounded-xl p-2">
                    {MOCK_GAPS.quickWins.map(w => (
                        <B_DataRow key={w.id} id={w.id} name={w.name}
                            trailing={<span className="text-[9px] text-on-surface-variant/40 max-w-[120px] truncate">{w.reason}</span>}
                        />
                    ))}
                </div>
            </div>
            <div className="px-5 pb-4">
                <B_SectionHeader icon="alert-triangle" label="Critical Gaps" count={4} color="text-error" />
                <div className="space-y-1 bg-error/5 rounded-xl p-2">
                    {MOCK_GAPS.gaps.map(g => (
                        <B_DataRow key={g.id} id={g.id} name={g.name}
                            trailing={<span className={`text-[8px] font-semibold uppercase px-1.5 py-0.5 rounded border ${priorityColor(g.priority)}`}>{g.priority}</span>}
                        />
                    ))}
                </div>
            </div>
            <B_Actions />
        </B_Card>
    </div>
);

// =============================================================================
// OPTION C — "Compact Chat-Native"
// Tighter spacing, smaller radius, maximum data density.
// Optimized for chat message flow. Inspired by Perplexity/ChatGPT.
// =============================================================================

const C_Card: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div className="w-full bg-surface-container rounded-xl border border-outline-variant/15 overflow-hidden">
        {children}
    </div>
);

const C_Header: React.FC<{ icon: string; title: string; meta?: string; metricValue?: string; metricColor?: string }> = ({
    icon, title, meta, metricValue, metricColor = 'text-on-surface'
}) => (
    <div className="px-4 py-3 flex items-center gap-3 border-b border-outline-variant/10">
        <Icon name={icon} className="w-4 h-4 text-primary shrink-0" />
        <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2">
                <h3 className="text-sm font-semibold text-on-surface truncate">{title}</h3>
                {meta && <span className="text-[10px] text-on-surface-variant/50 shrink-0">{meta}</span>}
            </div>
        </div>
        {metricValue && (
            <span className={`text-lg font-bold tabular-nums ${metricColor} shrink-0`}>{metricValue}</span>
        )}
    </div>
);

const C_Row: React.FC<{ children: React.ReactNode; onClick?: () => void }> = ({ children, onClick }) => (
    <div onClick={onClick} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-surface-container-high/50 transition-colors ${onClick ? 'cursor-pointer' : ''}`}>
        {children}
    </div>
);

const OptionC: React.FC = () => (
    <div className="space-y-6">
        {/* Threat Actor */}
        <C_Card>
            <C_Header icon="crosshairs" title="Scattered Spider" meta="G1015" metricValue="92%" metricColor="text-secondary" />
            <div className="px-4 py-2.5">
                <div className="h-1.5 rounded-full bg-surface-container-highest overflow-hidden flex">
                    <div className="h-full bg-primary" style={{ width: '92%' }} />
                    <div className="h-full bg-secondary" style={{ width: '3%' }} />
                </div>
                <div className="flex gap-3 mt-1.5 text-[10px] text-on-surface-variant/50">
                    <span>59 production</span><span>2 library</span><span>3 gaps</span>
                </div>
            </div>
            <div className="px-3 pb-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-error/70 px-1 mb-1">Gaps</p>
                {MOCK_THREAT_ACTOR.gaps.techniques.map(t => (
                    <C_Row key={t.id}>
                        <span className="w-1 h-1 rounded-full bg-error shrink-0" />
                        <code className="text-[10px] font-mono font-semibold text-error shrink-0">{t.id}</code>
                        <span className="text-[11px] text-on-surface-variant truncate flex-1">{t.name}</span>
                    </C_Row>
                ))}
            </div>
            <div className="px-4 py-2.5 border-t border-outline-variant/10 flex gap-2">
                <button className="px-3 py-1.5 text-[11px] font-semibold rounded-lg bg-primary text-on-primary">Primary</button>
                <button className="px-3 py-1.5 text-[11px] font-semibold rounded-lg text-on-surface-variant hover:bg-surface-container-high">Secondary</button>
            </div>
        </C_Card>

        {/* Coverage Report */}
        <C_Card>
            <C_Header icon="shield" title="MITRE ATT&CK Coverage" meta="201 techniques" metricValue="43%" metricColor="text-primary" />
            <div className="px-4 py-2.5">
                <div className="h-1.5 rounded-full bg-surface-container-highest overflow-hidden flex">
                    <div className="h-full bg-primary" style={{ width: '43%' }} />
                    <div className="h-full bg-secondary" style={{ width: '17%' }} />
                </div>
            </div>
            <div className="px-3 pb-2 space-y-0.5">
                {([
                    { label: 'Production', pct: 43, count: 87, color: 'text-primary', dot: 'bg-primary' },
                    { label: 'In Library', pct: 17, count: 34, color: 'text-secondary', dot: 'bg-secondary' },
                    { label: 'Gaps', pct: 40, count: 80, color: 'text-error', dot: 'bg-error' },
                ]).map(tier => (
                    <div key={tier.label} className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-surface-container-high/50 transition-colors cursor-pointer">
                        <span className={`w-1.5 h-1.5 rounded-full ${tier.dot} shrink-0`} />
                        <span className="text-[11px] text-on-surface-variant flex-1">{tier.label}</span>
                        <span className={`text-xs font-bold tabular-nums ${tier.color}`}>{tier.pct}%</span>
                        <span className="text-[10px] text-on-surface-variant/40 w-8 text-right">{tier.count}</span>
                    </div>
                ))}
            </div>
            <div className="px-4 py-2.5 border-t border-outline-variant/10 flex gap-2">
                <button className="px-3 py-1.5 text-[11px] font-semibold rounded-lg bg-primary text-on-primary">Primary</button>
                <button className="px-3 py-1.5 text-[11px] font-semibold rounded-lg text-on-surface-variant hover:bg-surface-container-high">Secondary</button>
            </div>
        </C_Card>

        {/* Search Results */}
        <C_Card>
            <C_Header icon="search" title={`"${MOCK_SEARCH.query}"`} meta={`${MOCK_SEARCH.total} results`} />
            <div className="px-3 py-2 space-y-0.5">
                {MOCK_SEARCH.results.map(r => {
                    const sc = statusColor(r.status);
                    return (
                        <div key={r.id} className="flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-surface-container-high/50 transition-colors cursor-pointer">
                            <div className="flex-1 min-w-0">
                                <p className="text-[11px] font-medium text-on-surface truncate">{r.name}</p>
                            </div>
                            <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded border shrink-0 ${sc}`}>{r.status}</span>
                            <span className="text-[9px] font-mono text-tertiary/60 shrink-0">{r.mitreIds[0]}</span>
                        </div>
                    );
                })}
            </div>
            <div className="px-4 py-2.5 border-t border-outline-variant/10 flex gap-2">
                <button className="px-3 py-1.5 text-[11px] font-semibold rounded-lg bg-primary text-on-primary">Primary</button>
                <button className="px-3 py-1.5 text-[11px] font-semibold rounded-lg text-on-surface-variant hover:bg-surface-container-high">Secondary</button>
            </div>
        </C_Card>

        {/* Gap Analysis */}
        <C_Card>
            <C_Header icon="lock" title="Ransomware Readiness" meta="47 techniques" metricValue="60%" metricColor={coverageColor(60).text} />
            <div className="px-4 py-2.5">
                <div className="h-1.5 rounded-full bg-surface-container-highest overflow-hidden">
                    <div className={`h-full ${coverageColor(60).bg}`} style={{ width: '60%' }} />
                </div>
            </div>
            <div className="px-3 pb-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-secondary/70 px-1 mb-1">Quick Wins</p>
                {MOCK_GAPS.quickWins.map(w => (
                    <C_Row key={w.id}>
                        <span className="w-1 h-1 rounded-full bg-secondary shrink-0" />
                        <code className="text-[10px] font-mono font-semibold text-secondary shrink-0">{w.id}</code>
                        <span className="text-[11px] text-on-surface-variant truncate flex-1">{w.name}</span>
                    </C_Row>
                ))}
                <p className="text-[10px] font-semibold uppercase tracking-wider text-error/70 px-1 mb-1 mt-2">Gaps</p>
                {MOCK_GAPS.gaps.map(g => (
                    <C_Row key={g.id}>
                        <span className="w-1 h-1 rounded-full bg-error shrink-0" />
                        <code className="text-[10px] font-mono font-semibold text-error shrink-0">{g.id}</code>
                        <span className="text-[11px] text-on-surface-variant truncate flex-1">{g.name}</span>
                        <span className={`text-[8px] font-semibold uppercase px-1 py-0.5 rounded border shrink-0 ${priorityColor(g.priority)}`}>{g.priority}</span>
                    </C_Row>
                ))}
            </div>
            <div className="px-4 py-2.5 border-t border-outline-variant/10">
                <p className="text-[11px] text-on-surface-variant leading-relaxed">{MOCK_GAPS.recommendation}</p>
            </div>
            <div className="px-4 py-2.5 border-t border-outline-variant/10 flex gap-2">
                <button className="px-3 py-1.5 text-[11px] font-semibold rounded-lg bg-primary text-on-primary">Primary</button>
                <button className="px-3 py-1.5 text-[11px] font-semibold rounded-lg text-on-surface-variant hover:bg-surface-container-high">Secondary</button>
            </div>
        </C_Card>
    </div>
);

// =============================================================================
// MAIN PAGE
// =============================================================================

export const AIChatCardsPage: React.FC = () => {
    const [activeOption, setActiveOption] = useState<'A' | 'B' | 'C'>('A');

    const options = [
        { id: 'A' as const, label: 'Option A: Clean Uniform', desc: 'Flat, consistent containers. Linear/Vercel inspired. Maximum consistency.' },
        { id: 'B' as const, label: 'Option B: Elevated Premium', desc: 'Left accent bar, floating badges, richer hierarchy. Stripe/Raycast inspired.' },
        { id: 'C' as const, label: 'Option C: Compact Chat-Native', desc: 'Tighter spacing, smaller radius, data-dense. Perplexity/ChatGPT inspired.' },
    ];

    return (
        <DesignSystemPage
            title="AI Chat Cards — Redesign"
            description="Three design options for Optimus Prime AI response cards. Each option renders all 4 card types (Threat Actor, Coverage Report, Search Results, Gap Analysis) with unified styling."
        >
            {/* Design Spec Summary */}
            <Section title="Design Standardizations" description="All options enforce these shared rules">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 max-w-3xl">
                    {([
                        { label: 'Colors', value: 'M3 tokens only', detail: 'primary, secondary, tertiary, error — no hardcoded emerald/amber/rose' },
                        { label: 'Border Radius', value: 'Uniform per option', detail: 'A: 2xl, B: 2xl + accent bar, C: xl (compact)' },
                        { label: 'Border', value: 'outline-variant/15', detail: 'Consistent across all cards' },
                        { label: 'Actions', value: 'Same pattern', detail: 'Primary filled + secondary outlined, same sizing' },
                    ]).map(spec => (
                        <div key={spec.label} className="p-3 bg-surface-container rounded-xl border border-outline-variant/10">
                            <p className="text-[10px] font-semibold text-on-surface-variant/60 uppercase tracking-wider">{spec.label}</p>
                            <p className="text-sm font-semibold text-on-surface mt-1">{spec.value}</p>
                            <p className="text-[10px] text-on-surface-variant/50 mt-1">{spec.detail}</p>
                        </div>
                    ))}
                </div>
            </Section>

            {/* Option Selector */}
            <div className="flex gap-2 mb-8">
                {options.map(opt => (
                    <button
                        key={opt.id}
                        onClick={() => setActiveOption(opt.id)}
                        className={`flex-1 text-left p-3 rounded-xl border transition-all ${
                            activeOption === opt.id
                                ? 'bg-primary/10 border-primary/30 shadow-sm'
                                : 'bg-surface-container border-outline-variant/15 hover:border-outline-variant/30'
                        }`}
                    >
                        <p className={`text-xs font-semibold ${activeOption === opt.id ? 'text-primary' : 'text-on-surface'}`}>
                            {opt.label}
                        </p>
                        <p className="text-[10px] text-on-surface-variant/60 mt-0.5">{opt.desc}</p>
                    </button>
                ))}
            </div>

            {/* Render selected option */}
            <Section
                title={options.find(o => o.id === activeOption)!.label}
                description={options.find(o => o.id === activeOption)!.desc}
            >
                <div className="max-w-xl">
                    {activeOption === 'A' && <OptionA />}
                    {activeOption === 'B' && <OptionB />}
                    {activeOption === 'C' && <OptionC />}
                </div>
            </Section>

            {/* Side-by-side comparison of a single card type */}
            <Section title="Side-by-Side: Threat Actor Card" description="Compare all three options for the same data">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {(['A', 'B', 'C'] as const).map(opt => (
                        <div key={opt}>
                            <p className="text-xs font-semibold text-on-surface mb-2">Option {opt}</p>
                            <div className="max-w-sm">
                                {opt === 'A' && (
                                    <A_Card>
                                        <A_Header icon="crosshairs" label="Threat Actor" title="Scattered Spider"
                                            subtitle="G1015" metric="92%" metricLabel="coverage" metricColor="text-secondary" />
                                        <A_Section>
                                            <A_ProgressBar segments={[{ percent: 92, color: 'bg-primary' }, { percent: 3, color: 'bg-secondary' }]} />
                                        </A_Section>
                                        <A_Section>
                                            <div className="space-y-1.5">
                                                {MOCK_THREAT_ACTOR.gaps.techniques.slice(0, 2).map(t => (
                                                    <A_TechRow key={t.id} id={t.id} name={t.name} accent="text-error" />
                                                ))}
                                            </div>
                                        </A_Section>
                                    </A_Card>
                                )}
                                {opt === 'B' && (
                                    <B_Card accentColor="bg-secondary">
                                        <B_Header icon="crosshairs" title="Scattered Spider"
                                            subtitle="G1015" badge={<B_MetricBadge value="92%" label="Covered" variant="secondary" />} />
                                        <div className="px-5 pb-3">
                                            <B_SegmentBar segments={[
                                                { pct: 92, color: 'bg-primary', label: '59 prod' },
                                                { pct: 3, color: 'bg-secondary', label: '2 lib' },
                                            ]} />
                                        </div>
                                        <div className="px-5 pb-3">
                                            <div className="space-y-1 bg-error/5 rounded-xl p-2">
                                                {MOCK_THREAT_ACTOR.gaps.techniques.slice(0, 2).map(t => (
                                                    <B_DataRow key={t.id} id={t.id} name={t.name} />
                                                ))}
                                            </div>
                                        </div>
                                    </B_Card>
                                )}
                                {opt === 'C' && (
                                    <C_Card>
                                        <C_Header icon="crosshairs" title="Scattered Spider" meta="G1015" metricValue="92%" metricColor="text-secondary" />
                                        <div className="px-4 py-2">
                                            <div className="h-1.5 rounded-full bg-surface-container-highest overflow-hidden flex">
                                                <div className="h-full bg-primary" style={{ width: '92%' }} />
                                            </div>
                                        </div>
                                        <div className="px-3 pb-2">
                                            {MOCK_THREAT_ACTOR.gaps.techniques.slice(0, 2).map(t => (
                                                <C_Row key={t.id}>
                                                    <span className="w-1 h-1 rounded-full bg-error shrink-0" />
                                                    <code className="text-[10px] font-mono font-semibold text-error shrink-0">{t.id}</code>
                                                    <span className="text-[11px] text-on-surface-variant truncate">{t.name}</span>
                                                </C_Row>
                                            ))}
                                        </div>
                                    </C_Card>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </Section>
        </DesignSystemPage>
    );
};

export default AIChatCardsPage;
