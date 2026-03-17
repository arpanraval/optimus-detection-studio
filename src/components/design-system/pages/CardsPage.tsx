import React from 'react';
import { DesignSystemPage, Section, ComponentRow } from '../shared';

export const CardsPage: React.FC = () => {
    return (
        <DesignSystemPage
            title="Cards"
            description="Content containers and card layouts"
        >
            <Section title="Cards & Containers" description="Content containers and card layouts">

                {/* Design Philosophy */}
                <div className="mb-10 p-6 bg-surface-container border border-outline-variant/20 rounded-2xl">
                    <h4 className="text-sm font-semibold text-on-surface mb-3">Card Design Principles</h4>
                    <div className="grid grid-cols-4 gap-6 text-xs">
                        <div>
                            <span className="block w-8 h-1 bg-[#783264] rounded-full mb-2"></span>
                            <p className="font-medium text-on-surface">Primary</p>
                            <p className="text-on-surface-variant/60">Interactive, focus</p>
                        </div>
                        <div>
                            <span className="block w-8 h-1 bg-[#4D7C6F] rounded-full mb-2"></span>
                            <p className="font-medium text-on-surface">Success</p>
                            <p className="text-on-surface-variant/60">Positive states</p>
                        </div>
                        <div>
                            <span className="block w-8 h-1 bg-[#A63D40] rounded-full mb-2"></span>
                            <p className="font-medium text-on-surface">Error</p>
                            <p className="text-on-surface-variant/60">Critical alerts</p>
                        </div>
                        <div>
                            <span className="block w-8 h-1 bg-[#0284C7] rounded-full mb-2"></span>
                            <p className="font-medium text-on-surface">Info</p>
                            <p className="text-on-surface-variant/60">Neutral info</p>
                        </div>
                    </div>
                </div>

                {/* === SECTION: Basic Cards === */}
                <div className="mb-10">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-on-surface-variant/50 mb-6">Basic Cards</h3>

                    <ComponentRow label="Elevated Card" description="Subtle shadow for depth hierarchy">
                        <div className="flex gap-4">
                            <div className="w-72 bg-surface-container rounded-2xl p-5 shadow-sm">
                                <p className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant/50 mb-2">Elevation 1</p>
                                <h3 className="text-base font-semibold text-on-surface mb-1">Card Title</h3>
                                <p className="text-sm text-on-surface-variant leading-relaxed">Content with subtle depth using shadow-sm for visual hierarchy.</p>
                            </div>
                            <div className="w-72 bg-surface-container rounded-2xl p-5 shadow-md">
                                <p className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant/50 mb-2">Elevation 2</p>
                                <h3 className="text-base font-semibold text-on-surface mb-1">Card Title</h3>
                                <p className="text-sm text-on-surface-variant leading-relaxed">Higher elevation with shadow-md for prominent elements.</p>
                            </div>
                        </div>
                    </ComponentRow>

                    <ComponentRow label="Outlined Card" description="Border-defined containers">
                        <div className="flex gap-4">
                            <div className="w-72 bg-transparent border border-outline-variant/30 rounded-2xl p-5">
                                <p className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant/50 mb-2">Standard</p>
                                <h3 className="text-base font-semibold text-on-surface mb-1">Outlined Card</h3>
                                <p className="text-sm text-on-surface-variant leading-relaxed">Transparent background with visible border.</p>
                            </div>
                            <div className="w-72 bg-surface-container-low border border-outline-variant/20 rounded-2xl p-5">
                                <p className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant/50 mb-2">Filled</p>
                                <h3 className="text-base font-semibold text-on-surface mb-1">Filled Card</h3>
                                <p className="text-sm text-on-surface-variant leading-relaxed">Subtle background fill with light border.</p>
                            </div>
                        </div>
                    </ComponentRow>
                </div>

                {/* === SECTION: Interactive Cards === */}
                <div className="mb-10">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-on-surface-variant/50 mb-6">Interactive Cards</h3>

                    <ComponentRow label="Hover Card" description="Cards with interactive hover states">
                        <div className="flex gap-4">
                            {/* Standard Hover */}
                            <div className="w-72 bg-surface-container border border-outline-variant/20 rounded-2xl p-5 cursor-pointer transition-all duration-200 hover:bg-surface-container-high hover:border-outline-variant/40 hover:shadow-md">
                                <div className="flex items-center justify-between mb-3">
                                    <span className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide rounded-lg bg-[#4D7C6F]/15 text-[#4D7C6F]">Active</span>
                                    <span className="text-xs text-on-surface-variant/50">T1059.001</span>
                                </div>
                                <h3 className="text-sm font-semibold text-on-surface mb-1">PowerShell Execution</h3>
                                <p className="text-xs text-on-surface-variant line-clamp-2">Detects suspicious PowerShell commands and encoded scripts.</p>
                            </div>

                            {/* Primary Border Hover */}
                            <div className="w-72 bg-surface-container-low border-2 border-transparent rounded-2xl p-5 cursor-pointer transition-all duration-200 hover:border-[#783264]/50 hover:shadow-lg hover:shadow-[#783264]/5">
                                <div className="flex items-center justify-between mb-3">
                                    <span className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide rounded-lg bg-[#0284C7]/15 text-[#0284C7]">Testing</span>
                                    <span className="text-xs text-on-surface-variant/50">T1003.001</span>
                                </div>
                                <h3 className="text-sm font-semibold text-on-surface mb-1">LSASS Memory Access</h3>
                                <p className="text-xs text-on-surface-variant line-clamp-2">Monitors for credential dumping attempts targeting LSASS.</p>
                            </div>
                        </div>
                    </ComponentRow>

                    <ComponentRow label="Selectable Card" description="Card with selected state indicator">
                        <div className="flex gap-4">
                            {/* Unselected */}
                            <div className="w-64 bg-surface-container border border-outline-variant/20 rounded-2xl p-4 cursor-pointer transition-all">
                                <div className="flex items-start justify-between mb-2">
                                    <h4 className="text-sm font-semibold text-on-surface">Detection Pack</h4>
                                    <span className="w-5 h-5 rounded-full border-2 border-outline-variant/40"></span>
                                </div>
                                <p className="text-xs text-on-surface-variant mb-3">Windows security monitoring essentials</p>
                                <p className="text-[10px] text-on-surface-variant/50">24 detections</p>
                            </div>

                            {/* Selected */}
                            <div className="w-64 bg-[#783264]/5 border-2 border-[#783264]/40 rounded-2xl p-4 cursor-pointer transition-all">
                                <div className="flex items-start justify-between mb-2">
                                    <h4 className="text-sm font-semibold text-on-surface">Detection Pack</h4>
                                    <span className="w-5 h-5 rounded-full bg-[#783264] flex items-center justify-center">
                                        <span className="w-2 h-2 bg-white rounded-full"></span>
                                    </span>
                                </div>
                                <p className="text-xs text-on-surface-variant mb-3">Cloud infrastructure monitoring</p>
                                <p className="text-[10px] text-[#783264]">18 detections</p>
                            </div>
                        </div>
                    </ComponentRow>
                </div>

                {/* === SECTION: Status Cards === */}
                <div className="mb-10">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-on-surface-variant/50 mb-6">Status Cards</h3>

                    <ComponentRow label="Alert Cards" description="Status notifications with left accent bar">
                        <div className="flex flex-col gap-3">
                            {/* Critical */}
                            <div className="w-96 bg-surface-container rounded-xl overflow-hidden flex">
                                <div className="w-1 bg-[#A63D40]"></div>
                                <div className="p-4 flex-1">
                                    <div className="flex items-center justify-between mb-1">
                                        <h4 className="text-sm font-semibold text-[#A63D40]">Critical Error</h4>
                                        <span className="text-[10px] text-on-surface-variant/50">2 min ago</span>
                                    </div>
                                    <p className="text-xs text-on-surface-variant">Detection validation failed. Syntax error on line 42.</p>
                                </div>
                            </div>

                            {/* Warning */}
                            <div className="w-96 bg-surface-container rounded-xl overflow-hidden flex">
                                <div className="w-1 bg-yellow-500"></div>
                                <div className="p-4 flex-1">
                                    <div className="flex items-center justify-between mb-1">
                                        <h4 className="text-sm font-semibold text-yellow-600 dark:text-yellow-400">Warning</h4>
                                        <span className="text-[10px] text-on-surface-variant/50">5 min ago</span>
                                    </div>
                                    <p className="text-xs text-on-surface-variant">Query performance may be impacted by broad field selection.</p>
                                </div>
                            </div>

                            {/* Success */}
                            <div className="w-96 bg-surface-container rounded-xl overflow-hidden flex">
                                <div className="w-1 bg-[#4D7C6F]"></div>
                                <div className="p-4 flex-1">
                                    <div className="flex items-center justify-between mb-1">
                                        <h4 className="text-sm font-semibold text-[#4D7C6F]">Published</h4>
                                        <span className="text-[10px] text-on-surface-variant/50">Just now</span>
                                    </div>
                                    <p className="text-xs text-on-surface-variant">Detection successfully deployed to production.</p>
                                </div>
                            </div>

                            {/* Info */}
                            <div className="w-96 bg-surface-container rounded-xl overflow-hidden flex">
                                <div className="w-1 bg-[#0284C7]"></div>
                                <div className="p-4 flex-1">
                                    <div className="flex items-center justify-between mb-1">
                                        <h4 className="text-sm font-semibold text-[#0284C7]">Tip</h4>
                                        <span className="text-[10px] text-on-surface-variant/50">Suggestion</span>
                                    </div>
                                    <p className="text-xs text-on-surface-variant">Map to MITRE techniques for better coverage tracking.</p>
                                </div>
                            </div>
                        </div>
                    </ComponentRow>

                    <ComponentRow label="Inline Status Card" description="Compact status indicators">
                        <div className="flex gap-3">
                            <div className="px-4 py-3 bg-[#4D7C6F]/10 border border-[#4D7C6F]/20 rounded-xl">
                                <span className="text-sm font-semibold text-[#4D7C6F]">3 Active</span>
                            </div>
                            <div className="px-4 py-3 bg-[#0284C7]/10 border border-[#0284C7]/20 rounded-xl">
                                <span className="text-sm font-semibold text-[#0284C7]">7 Testing</span>
                            </div>
                            <div className="px-4 py-3 bg-[#A63D40]/10 border border-[#A63D40]/20 rounded-xl">
                                <span className="text-sm font-semibold text-[#A63D40]">2 Failed</span>
                            </div>
                            <div className="px-4 py-3 bg-surface-container-high border border-outline-variant/20 rounded-xl">
                                <span className="text-sm font-semibold text-on-surface-variant">12 Draft</span>
                            </div>
                        </div>
                    </ComponentRow>
                </div>

                {/* === SECTION: Stat Cards === */}
                <div className="mb-10">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-on-surface-variant/50 mb-6">Stat Cards</h3>

                    <ComponentRow label="Metric Cards" description="Clean numeric displays with context">
                        <div className="grid grid-cols-4 gap-3">
                            <div className="bg-surface-container border border-outline-variant/20 rounded-xl p-4">
                                <p className="text-[10px] font-medium uppercase tracking-wider text-on-surface-variant/60 mb-1">Detections</p>
                                <p className="text-3xl font-bold text-on-surface tracking-tight">234</p>
                                <p className="text-xs text-[#4D7C6F] font-medium mt-1">+12 this week</p>
                            </div>
                            <div className="bg-surface-container border border-outline-variant/20 rounded-xl p-4">
                                <p className="text-[10px] font-medium uppercase tracking-wider text-on-surface-variant/60 mb-1">Coverage</p>
                                <p className="text-3xl font-bold text-on-surface tracking-tight">67%</p>
                                <p className="text-xs text-[#4D7C6F] font-medium mt-1">+5% improvement</p>
                            </div>
                            <div className="bg-surface-container border border-outline-variant/20 rounded-xl p-4">
                                <p className="text-[10px] font-medium uppercase tracking-wider text-on-surface-variant/60 mb-1">Open Issues</p>
                                <p className="text-3xl font-bold text-on-surface tracking-tight">18</p>
                                <p className="text-xs text-[#A63D40] font-medium mt-1">3 critical</p>
                            </div>
                            <div className="bg-surface-container border border-outline-variant/20 rounded-xl p-4">
                                <p className="text-[10px] font-medium uppercase tracking-wider text-on-surface-variant/60 mb-1">Avg Score</p>
                                <p className="text-3xl font-bold text-on-surface tracking-tight">82</p>
                                <p className="text-xs text-on-surface-variant/50 font-medium mt-1">Out of 100</p>
                            </div>
                        </div>
                    </ComponentRow>

                    <ComponentRow label="Large Stat Card" description="Prominent metric with visual bar">
                        <div className="w-80 bg-surface-container border border-outline-variant/20 rounded-2xl p-6">
                            <div className="flex items-start justify-between mb-4">
                                <div>
                                    <p className="text-xs font-medium text-on-surface-variant/60 uppercase tracking-wider">MITRE Coverage</p>
                                    <p className="text-4xl font-bold text-on-surface mt-1">73%</p>
                                </div>
                                <span className="px-2 py-1 text-[10px] font-bold rounded-md bg-[#4D7C6F]/15 text-[#4D7C6F]">Good</span>
                            </div>
                            <div className="h-2 bg-surface-container-highest rounded-full overflow-hidden">
                                <div className="h-full w-[73%] bg-[#4D7C6F] rounded-full"></div>
                            </div>
                            <p className="text-xs text-on-surface-variant/60 mt-3">146 of 201 techniques covered</p>
                        </div>
                    </ComponentRow>
                </div>

                {/* === SECTION: Content Cards === */}
                <div className="mb-10">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-on-surface-variant/50 mb-6">Content Cards</h3>

                    <ComponentRow label="Detection Card" description="Domain-specific content card">
                        <div className="w-96 bg-surface-container border border-outline-variant/20 rounded-2xl overflow-hidden">
                            {/* Header */}
                            <div className="px-5 py-4 border-b border-outline-variant/10 flex items-center justify-between">
                                <div>
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="text-[10px] font-mono text-on-surface-variant/50">T1059.001</span>
                                        <span className="w-1.5 h-1.5 rounded-full bg-[#4D7C6F]"></span>
                                        <span className="text-[10px] text-[#4D7C6F] font-medium">Production</span>
                                    </div>
                                    <h3 className="text-sm font-semibold text-on-surface">PowerShell Script Block Logging</h3>
                                </div>
                                <span className="text-2xl font-bold text-[#4D7C6F]">85</span>
                            </div>
                            {/* Body */}
                            <div className="p-5">
                                <p className="text-xs text-on-surface-variant leading-relaxed mb-4">Monitors for potentially malicious PowerShell script execution using Windows Event Logging.</p>
                                <div className="flex gap-2">
                                    <span className="px-2 py-1 text-[9px] font-medium rounded bg-surface-container-high text-on-surface-variant">Windows</span>
                                    <span className="px-2 py-1 text-[9px] font-medium rounded bg-surface-container-high text-on-surface-variant">PowerShell</span>
                                    <span className="px-2 py-1 text-[9px] font-medium rounded bg-surface-container-high text-on-surface-variant">Execution</span>
                                </div>
                            </div>
                        </div>
                    </ComponentRow>

                    <ComponentRow label="List Item Card" description="Compact row-style cards">
                        <div className="w-[500px] space-y-2">
                            {[
                                { name: 'Credential Dumping via LSASS', id: 'T1003.001', status: 'Production', score: 92, statusColor: '#4D7C6F' },
                                { name: 'Suspicious Scheduled Task', id: 'T1053.005', status: 'Testing', score: 78, statusColor: '#0284C7' },
                                { name: 'Registry Run Key Persistence', id: 'T1547.001', status: 'Draft', score: 45, statusColor: '#6b7280' },
                            ].map((item) => (
                                <div key={item.id} className="flex items-center gap-4 px-4 py-3 bg-surface-container border border-outline-variant/20 rounded-xl hover:bg-surface-container-high transition-colors cursor-pointer">
                                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: item.statusColor }}></span>
                                    <div className="flex-1 min-w-0">
                                        <h4 className="text-sm font-medium text-on-surface truncate">{item.name}</h4>
                                        <p className="text-[10px] text-on-surface-variant/60 font-mono">{item.id}</p>
                                    </div>
                                    <span className="text-[10px] font-medium px-2 py-0.5 rounded" style={{ backgroundColor: `${item.statusColor}15`, color: item.statusColor }}>{item.status}</span>
                                    <span className="text-lg font-bold text-on-surface w-10 text-right">{item.score}</span>
                                </div>
                            ))}
                        </div>
                    </ComponentRow>

                    <ComponentRow label="Feature Highlight Card" description="Promotional content without images">
                        <div className="w-96 border-2 border-[#783264]/20 rounded-2xl p-6 bg-[#783264]/[0.02]">
                            <span className="inline-block px-2 py-1 text-[9px] font-bold uppercase tracking-wider rounded bg-[#783264]/15 text-[#783264] mb-3">New Feature</span>
                            <h3 className="text-lg font-semibold text-on-surface mb-2">AI-Powered Analysis</h3>
                            <p className="text-sm text-on-surface-variant leading-relaxed mb-4">Automatically analyze detection coverage gaps and get intelligent suggestions based on threat intelligence.</p>
                            <button className="px-4 py-2 text-sm font-medium bg-[#783264] text-white rounded-xl hover:bg-[#783264]/90 transition-colors">Learn More</button>
                        </div>
                    </ComponentRow>
                </div>

                {/* === SECTION: Container Cards === */}
                <div className="mb-10">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-on-surface-variant/50 mb-6">Container Cards</h3>

                    <ComponentRow label="Form Section Card" description="Grouped form container">
                        <div className="w-96 rounded-2xl border border-outline-variant/20 bg-surface-container overflow-hidden">
                            <div className="px-5 py-4 border-b border-outline-variant/10">
                                <h3 className="text-sm font-semibold text-on-surface">Basic Information</h3>
                                <p className="text-xs text-on-surface-variant/60 mt-0.5">Enter the detection metadata</p>
                            </div>
                            <div className="p-5 space-y-4">
                                <div>
                                    <label className="block text-xs font-medium text-on-surface mb-1.5">Name</label>
                                    <input type="text" placeholder="Enter name..." className="w-full h-10 px-3 rounded-xl text-sm bg-surface-container-high border border-outline-variant/20 text-on-surface focus:border-[#783264] focus:ring-2 focus:ring-[#783264]/20 outline-none transition-all" />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-on-surface mb-1.5">Description</label>
                                    <textarea placeholder="Enter description..." rows={2} className="w-full px-3 py-2.5 rounded-xl text-sm bg-surface-container-high border border-outline-variant/20 text-on-surface focus:border-[#783264] focus:ring-2 focus:ring-[#783264]/20 outline-none transition-all resize-none" />
                                </div>
                            </div>
                        </div>
                    </ComponentRow>

                    <ComponentRow label="Empty State Card" description="Placeholder for empty content">
                        <div className="w-96 bg-surface-container border-2 border-dashed border-outline-variant/30 rounded-2xl p-10 flex flex-col items-center justify-center text-center">
                            <div className="w-16 h-16 rounded-full bg-surface-container-high flex items-center justify-center mb-4">
                                <span className="text-2xl font-bold text-on-surface-variant/30">0</span>
                            </div>
                            <h3 className="text-base font-semibold text-on-surface mb-1">No Detections Yet</h3>
                            <p className="text-sm text-on-surface-variant/60 mb-6 max-w-[240px]">Create your first detection rule to start monitoring threats.</p>
                            <button className="px-5 py-2.5 text-sm font-medium bg-[#783264] text-white rounded-xl hover:bg-[#783264]/90 transition-colors">
                                Create Detection
                            </button>
                        </div>
                    </ComponentRow>

                    <ComponentRow label="Expandable Section" description="Collapsible content container">
                        <div className="w-96 bg-surface-container border border-outline-variant/20 rounded-2xl overflow-hidden">
                            <button className="w-full px-5 py-4 flex items-center justify-between hover:bg-surface-container-high transition-colors">
                                <span className="text-sm font-semibold text-on-surface">Advanced Options</span>
                                <span className="text-xs text-on-surface-variant/50">Click to expand</span>
                            </button>
                            <div className="px-5 py-4 border-t border-outline-variant/10 bg-surface-container-low">
                                <p className="text-xs text-on-surface-variant">Expanded content would appear here with additional configuration options.</p>
                            </div>
                        </div>
                    </ComponentRow>
                </div>

            </Section>
        </DesignSystemPage>
    );
};

export default CardsPage;
