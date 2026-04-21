import React, { useState } from 'react';
import { DesignSystemPage, Section, ComponentRow } from '../shared';
import { Icon } from '../../Icon';
import { Dropdown } from '../../ui';

export const DropdownsPage: React.FC = () => {
    const [selectedDropdown, setSelectedDropdown] = useState('');
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);

    // Demo state for the shared Dropdown component
    const [platform, setPlatform] = useState<string | undefined>();
    const [source, setSource] = useState<string | undefined>();
    const [technique, setTechnique] = useState<string | undefined>();

    return (
        <DesignSystemPage
            title="Dropdowns & Menus"
            description="Core dropdown patterns for the design system"
        >
            <Section
                title="Filter Dropdown (shared component)"
                description="components/ui/Dropdown — the canonical filter dropdown used in page toolbars. Matches the MITRE filter visual language."
            >
                <ComponentRow label="Simple list with All reset" description="Icon-first trigger, secondary-container active state, spark on selected row">
                    <Dropdown
                        triggerIcon="systems"
                        placeholder="All Platforms"
                        value={platform}
                        onChange={setPlatform}
                        includeAllOption={{ label: 'All Platforms' }}
                        options={[
                            { value: 'windows', label: 'Windows' },
                            { value: 'linux', label: 'Linux' },
                            { value: 'macos', label: 'macOS' },
                            { value: 'aws', label: 'AWS' },
                            { value: 'azure', label: 'Azure' },
                        ]}
                    />
                </ComponentRow>

                <ComponentRow label="With leading badges" description="Per-option leading chip — useful for source/type dropdowns">
                    <Dropdown
                        triggerIcon="globe"
                        placeholder="All Sources"
                        value={source}
                        onChange={setSource}
                        includeAllOption={{ label: 'All Sources' }}
                        options={[
                            {
                                value: 'community',
                                label: 'Community',
                                leadingBadge: <span className="w-2 h-2 rounded-full bg-primary" />,
                            },
                            {
                                value: 'custom',
                                label: 'Custom',
                                leadingBadge: <span className="w-2 h-2 rounded-full bg-tertiary" />,
                            },
                            {
                                value: 'official',
                                label: 'Official',
                                leadingBadge: <span className="w-2 h-2 rounded-full bg-secondary" />,
                            },
                        ]}
                    />
                </ComponentRow>

                <ComponentRow label="Searchable list" description="Search input auto-enables past 10 options, or opt in with `searchable`">
                    <Dropdown
                        triggerIcon="matrix"
                        placeholder="All Techniques"
                        value={technique}
                        onChange={setTechnique}
                        searchable
                        panelWidth="w-72"
                        options={[
                            { value: 'T1566', label: 'T1566 — Phishing' },
                            { value: 'T1059', label: 'T1059 — Command and Scripting' },
                            { value: 'T1078', label: 'T1078 — Valid Accounts' },
                            { value: 'T1071', label: 'T1071 — Application Layer Protocol' },
                            { value: 'T1055', label: 'T1055 — Process Injection' },
                            { value: 'T1053', label: 'T1053 — Scheduled Task/Job' },
                            { value: 'T1021', label: 'T1021 — Remote Services' },
                            { value: 'T1018', label: 'T1018 — Remote System Discovery' },
                            { value: 'T1003', label: 'T1003 — OS Credential Dumping' },
                            { value: 'T1047', label: 'T1047 — Windows Management' },
                            { value: 'T1105', label: 'T1105 — Ingress Tool Transfer' },
                            { value: 'T1027', label: 'T1027 — Obfuscated Files' },
                        ]}
                    />
                </ComponentRow>
            </Section>

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
                        {/* Trigger Button */}
                        <div className="relative">
                            <button
                                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                                className="flex items-center gap-2 px-4 py-2.5 bg-surface-container border border-outline-variant/30 text-on-surface rounded-xl font-medium text-sm hover:bg-surface-container-high transition-colors"
                            >
                                {selectedDropdown || 'Select option'}
                                <Icon name="chevron-down" className="w-4 h-4 text-on-surface-variant" />
                            </button>
                            {isDropdownOpen && (
                                <div className="absolute top-full left-0 mt-2 w-52 bg-surface-container border border-outline-variant/20 rounded-xl shadow-xl z-50 overflow-hidden py-1">
                                    {['Production', 'Testing', 'Development', 'Draft'].map((opt, i) => (
                                        <button
                                            key={opt}
                                            onClick={() => { setSelectedDropdown(opt); setIsDropdownOpen(false); }}
                                            className={`w-full flex items-center justify-between px-4 py-2.5 text-sm transition-colors ${
                                                i === 0 ? 'bg-[#783264]/10 text-on-surface' : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
                                            }`}
                                        >
                                            {opt}
                                            {i === 0 && <Icon name="check" className="w-4 h-4 text-[#783264]" />}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

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
                        {[
                            { icon: 'edit', label: 'Edit' },
                            { icon: 'copy', label: 'Duplicate' },
                            { icon: 'external-link', label: 'Share' },
                            { divider: true },
                            { icon: 'trash', label: 'Delete', danger: true },
                        ].map((item, i) =>
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
