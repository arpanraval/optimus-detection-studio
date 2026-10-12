import { Select } from '@/components/ui/Select';
import React, { useState } from 'react';
import type { IconName } from '../../Icon';
import { DesignSystemPage, Section, ComponentRow } from '../shared';
import { Icon } from '../../Icon';

export const DropdownsPage: React.FC = () => {
    const [selectedDropdown, setSelectedDropdown] = useState('');

    return (
        <DesignSystemPage
            title="Dropdowns & Menus"
            description="Core dropdown patterns for the design system"
        >
            <Section title="Dropdowns & Menus" description="Core dropdown patterns for the design system">

                {/* DS Color Reference */}
                <div className="mb-6 p-4 bg-[#783264]/5 border border-[#783264]/20 rounded-xl">
                    <p className="text-xs font-medium text-[#783264] mb-2">DS Dropdown Style Guide:</p>
                    <div className="flex flex-wrap gap-3 text-[10px]">
                        <span className="px-2 py-1 rounded bg-[#783264]/10 text-[#783264]">Selected: bg-[#783264]/10</span>
                        <span className="px-2 py-1 rounded bg-[#A63D40]/10 text-[#A63D40]">Destructive: text-[#A63D40]</span>
                        <span className="px-2 py-1 rounded bg-surface-container-high text-on-surface-variant">Hover: bg-surface-container-high</span>
                    </div>
                </div>

                <ComponentRow label="Dropdown Menu" description="Standard dropdown with trigger button">
                    <div className="flex gap-8 items-start">
                        <Select
                            aria-label="Status"
                            value={selectedDropdown}
                            onChange={setSelectedDropdown}
                            placeholder="Select option"
                            className="w-52"
                            options={['Production', 'Testing', 'Development', 'Draft'].map(value => ({ value, label: value }))}
                        />

                        {/* Static Menu Preview */}
                        <div className="w-52 bg-surface-container border border-outline-variant/20 rounded-xl shadow-xl overflow-hidden py-1">
                            <div className="px-3 py-2 border-b border-outline-variant/10">
                                <span className="text-[10px] font-medium text-on-surface-variant/60 uppercase tracking-wide">Status</span>
                            </div>
                            {['Production', 'Testing', 'Development', 'Draft'].map((opt, i) => (
                                <button
                                    key={opt}
                                    className={`w-full flex items-center justify-between px-4 py-2.5 text-sm transition-colors ${
                                        i === 0 ? 'bg-[#783264]/10 text-on-surface' : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
                                    }`}
                                >
                                    {opt}
                                    {i === 0 && <Icon name="check" className="w-4 h-4 text-[#783264]" />}
                                </button>
                            ))}
                        </div>
                    </div>
                </ComponentRow>

                <ComponentRow label="Action Menu" description="Context menu with icons and destructive action">
                    <div className="w-52 bg-surface-container border border-outline-variant/20 rounded-xl shadow-xl overflow-hidden py-1">
                        {([
                            { icon: 'edit', label: 'Edit' },
                            { icon: 'copy', label: 'Duplicate' },
                            { icon: 'external-link', label: 'Share' },
                            { divider: true },
                            { icon: 'trash', label: 'Delete', danger: true },
                        ] satisfies { icon?: IconName; label?: string; divider?: boolean; danger?: boolean }[]).map((item, i) =>
                            item.divider ? (
                                <div key={i} className="border-t border-outline-variant/20 my-1" />
                            ) : (
                                <button
                                    key={item.label}
                                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                                        item.danger
                                            ? 'text-[#A63D40] hover:bg-[#A63D40]/10'
                                            : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
                                    }`}
                                >
                                    <Icon name={item.icon!} className="w-4 h-4" />
                                    {item.label}
                                </button>
                            )
                        )}
                    </div>
                </ComponentRow>

                <ComponentRow label="Scrollable Dropdown" description="Long list with custom scrollbar">
                    <div className="w-56 bg-surface-container border border-outline-variant/20 rounded-xl shadow-xl overflow-hidden">
                        <div className="px-3 py-2 border-b border-outline-variant/10">
                            <span className="text-[10px] font-medium text-on-surface-variant/60 uppercase tracking-wide">Select MITRE Technique</span>
                        </div>
                        <div className="max-h-[200px] overflow-y-auto scrollbar-minimal py-1">
                            {[
                                { id: 'T1566', name: 'Phishing' },
                                { id: 'T1059', name: 'Command and Scripting' },
                                { id: 'T1078', name: 'Valid Accounts' },
                                { id: 'T1071', name: 'Application Layer Protocol' },
                                { id: 'T1055', name: 'Process Injection' },
                                { id: 'T1053', name: 'Scheduled Task/Job' },
                                { id: 'T1021', name: 'Remote Services' },
                                { id: 'T1018', name: 'Remote System Discovery' },
                                { id: 'T1003', name: 'OS Credential Dumping' },
                                { id: 'T1047', name: 'Windows Management' },
                                { id: 'T1105', name: 'Ingress Tool Transfer' },
                                { id: 'T1027', name: 'Obfuscated Files' },
                            ].map((tech, i) => (
                                <button
                                    key={tech.id}
                                    className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors ${
                                        i === 0 ? 'bg-[#783264]/10 text-on-surface' : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
                                    }`}
                                >
                                    <span className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-purple-500/10 text-purple-600 border border-purple-500/20 font-mono">
                                        {tech.id}
                                    </span>
                                    <span className="flex-1 text-left truncate">{tech.name}</span>
                                    {i === 0 && <Icon name="check" className="w-4 h-4 text-[#783264]" />}
                                </button>
                            ))}
                        </div>
                        <div className="px-3 py-2 border-t border-outline-variant/10 bg-surface-container-low/50">
                            <p className="text-[9px] text-on-surface-variant/50 text-center">Scroll to see more • Uses scrollbar-minimal</p>
                        </div>
                    </div>
                </ComponentRow>
            </Section>
        </DesignSystemPage>
    );
};

export default DropdownsPage;
