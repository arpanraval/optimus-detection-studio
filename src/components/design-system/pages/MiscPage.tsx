import React from 'react';
import { DesignSystemPage, Section, ComponentRow } from '../shared';
import { Icon } from '../../Icon';

export const MiscPage: React.FC = () => {
    return (
        <DesignSystemPage
            title="Miscellaneous"
            description="Other UI patterns and components"
        >
            <Section title="Miscellaneous" description="Other UI patterns and components">

                {/* DS Color Reference */}
                <div className="mb-6 p-4 bg-[#783264]/5 border border-[#783264]/20 rounded-xl">
                    <p className="text-xs font-medium text-[#783264] mb-2">DS Color System for Misc Components:</p>
                    <div className="flex flex-wrap gap-3 text-[10px]">
                        <span className="px-2 py-1 rounded bg-[#783264]/10 text-[#783264]">Primary: #783264</span>
                        <span className="px-2 py-1 rounded bg-[#4D7C6F]/10 text-[#4D7C6F]">Success: #4D7C6F</span>
                        <span className="px-2 py-1 rounded bg-[#0284C7]/10 text-[#0284C7]">Info: #0284C7</span>
                        <span className="px-2 py-1 rounded bg-orange-500/10 text-orange-500">Warning: Orange</span>
                        <span className="px-2 py-1 rounded bg-[#A63D40]/10 text-[#A63D40]">Error: #A63D40</span>
                    </div>
                </div>

                <ComponentRow label="Pill Tabs" description="Rounded tab navigation">
                    <div className="flex gap-1 p-1 bg-surface-container-low rounded-xl">
                        {['All', 'Active', 'Archived'].map((tab, i) => (
                            <button
                                key={tab}
                                className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                                    i === 0
                                        ? 'bg-[#783264] text-white'
                                        : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
                                }`}
                            >
                                {tab}
                            </button>
                        ))}
                    </div>
                </ComponentRow>

                <ComponentRow label="Notification Badge" description="Count indicators">
                    <div className="flex items-center gap-6">
                        <div className="relative">
                            <button className="p-2 bg-surface-container-high rounded-lg">
                                <Icon name="bell" className="w-5 h-5 text-on-surface-variant" />
                            </button>
                            <span className="absolute -top-1 -right-1 w-5 h-5 bg-[#A63D40] text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                                5
                            </span>
                        </div>
                        <div className="relative">
                            <button className="p-2 bg-surface-container-high rounded-lg">
                                <Icon name="inbox" className="w-5 h-5 text-on-surface-variant" />
                            </button>
                            <span className="absolute -top-1 -right-1 w-5 h-5 bg-[#783264] text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                                12
                            </span>
                        </div>
                        <div className="relative">
                            <button className="p-2 bg-surface-container-high rounded-lg">
                                <Icon name="alert-triangle" className="w-5 h-5 text-on-surface-variant" />
                            </button>
                            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-[#A63D40] rounded-full" />
                        </div>
                    </div>
                </ComponentRow>

                <ComponentRow label="Tooltip" description="Hover information">
                    <div className="relative group">
                        <button className="p-2 text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high rounded-lg transition-colors">
                            <Icon name="info" className="w-5 h-5" />
                        </button>
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 bg-surface-container-highest text-xs text-on-surface rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                            This is a tooltip
                            <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-surface-container-highest" />
                        </div>
                    </div>
                </ComponentRow>

                <ComponentRow label="Avatar" description="User representation">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-[#783264] flex items-center justify-center text-white font-semibold">
                            JD
                        </div>
                        <div className="w-10 h-10 rounded-full bg-[#4D7C6F] flex items-center justify-center text-white font-semibold">
                            AB
                        </div>
                        <div className="w-10 h-10 rounded-full bg-[#0284C7] flex items-center justify-center text-white font-semibold">
                            CL
                        </div>
                        <div className="w-10 h-10 rounded-full bg-surface-container-highest flex items-center justify-center">
                            <Icon name="user" className="w-5 h-5 text-on-surface-variant" />
                        </div>
                    </div>
                </ComponentRow>

                <ComponentRow label="Avatar Group" description="Stacked user avatars">
                    <div className="flex -space-x-3">
                        <div className="w-10 h-10 rounded-full bg-[#783264] flex items-center justify-center text-white font-semibold border-2 border-surface">
                            JD
                        </div>
                        <div className="w-10 h-10 rounded-full bg-[#4D7C6F] flex items-center justify-center text-white font-semibold border-2 border-surface">
                            AB
                        </div>
                        <div className="w-10 h-10 rounded-full bg-[#0284C7] flex items-center justify-center text-white font-semibold border-2 border-surface">
                            CL
                        </div>
                        <div className="w-10 h-10 rounded-full bg-surface-container-highest flex items-center justify-center text-on-surface-variant text-xs font-bold border-2 border-surface">
                            +3
                        </div>
                    </div>
                </ComponentRow>

                <ComponentRow label="Divider" description="Content separator">
                    <div className="w-80 space-y-3">
                        <div className="border-t border-outline-variant/20" />
                        <div className="flex items-center gap-3">
                            <div className="flex-1 border-t border-outline-variant/20" />
                            <span className="text-xs text-on-surface-variant/50">or</span>
                            <div className="flex-1 border-t border-outline-variant/20" />
                        </div>
                    </div>
                </ComponentRow>

                <ComponentRow label="Toast Notifications" description="Floating card with glow effect">
                    <div className="flex flex-col gap-4">
                        {/* Success */}
                        <div className="w-[320px] p-4 bg-surface-container rounded-2xl shadow-[0_8px_32px_rgba(77,124,111,0.25)] border border-[#4D7C6F]/30">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#4D7C6F] to-[#3d6358] flex items-center justify-center shadow-lg">
                                    <Icon name="check" className="w-5 h-5 text-white" />
                                </div>
                                <div className="flex-1">
                                    <p className="text-sm font-semibold text-on-surface">Published!</p>
                                    <p className="text-xs text-on-surface-variant">Detection is now live</p>
                                </div>
                            </div>
                        </div>
                        {/* Error */}
                        <div className="w-[320px] p-4 bg-surface-container rounded-2xl shadow-[0_8px_32px_rgba(166,61,64,0.25)] border border-[#A63D40]/30">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#A63D40] to-[#8a3234] flex items-center justify-center shadow-lg">
                                    <Icon name="x" className="w-5 h-5 text-white" />
                                </div>
                                <div className="flex-1">
                                    <p className="text-sm font-semibold text-on-surface">Save Failed</p>
                                    <p className="text-xs text-on-surface-variant">Check connection</p>
                                </div>
                            </div>
                        </div>
                        {/* Warning */}
                        <div className="w-[320px] p-4 bg-surface-container rounded-2xl shadow-[0_8px_32px_rgba(249,115,22,0.25)] border border-[#F97316]/30">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#F97316] to-[#ea580c] flex items-center justify-center shadow-lg">
                                    <Icon name="alert-triangle" className="w-5 h-5 text-white" />
                                </div>
                                <div className="flex-1">
                                    <p className="text-sm font-semibold text-on-surface">Unsaved Changes</p>
                                    <p className="text-xs text-on-surface-variant">You have pending edits</p>
                                </div>
                            </div>
                        </div>
                        {/* Info */}
                        <div className="w-[320px] p-4 bg-surface-container rounded-2xl shadow-[0_8px_32px_rgba(0,80,145,0.25)] border border-[#005091]/30">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#005091] to-[#003d6e] flex items-center justify-center shadow-lg">
                                    <Icon name="info" className="w-5 h-5 text-white" />
                                </div>
                                <div className="flex-1">
                                    <p className="text-sm font-semibold text-on-surface">New Version</p>
                                    <p className="text-xs text-on-surface-variant">Update available</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </ComponentRow>

                <ComponentRow label="Tag Input" description="Multi-value input with chips">
                    <div className="w-80 flex flex-wrap gap-2 p-3 bg-surface-container-lowest border border-outline-variant/30 rounded-xl focus-within:ring-2 focus-within:ring-[#783264]/30 focus-within:border-[#783264]">
                        {['T1566', 'T1059', 'T1078'].map((tag) => (
                            <span key={tag} className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded-md bg-purple-500/10 text-purple-600 border border-purple-500/20">
                                <Icon name="zap" className="w-2.5 h-2.5" />{tag}
                                <button className="ml-1 hover:text-purple-800">
                                    <Icon name="x" className="w-2.5 h-2.5" />
                                </button>
                            </span>
                        ))}
                        <input
                            type="text"
                            placeholder="Add technique..."
                            className="flex-1 min-w-[100px] bg-transparent border-none outline-none text-xs text-on-surface placeholder:text-on-surface-variant/50"
                        />
                    </div>
                </ComponentRow>
            </Section>
        </DesignSystemPage>
    );
};

export default MiscPage;
