import React, { useState } from 'react';
import { DesignSystemPage, Section, ComponentRow } from '../shared';
import { Icon } from '../../Icon';

export const InputsPage: React.FC = () => {
    const [inputValue, setInputValue] = useState('');
    const [isToggled, setIsToggled] = useState(false);
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
            title="Input Fields"
            description="Form controls for user input with Detection Studio color system"
        >
            <Section title="Input Fields" description="Form controls for user input with Detection Studio color system">

                {/* Color Palette Reference */}
                <div className="mb-8 p-4 bg-gradient-to-r from-[#783264]/5 via-[#4D7C6F]/5 to-[#A63D40]/5 rounded-2xl border border-outline-variant/10">
                    <p className="text-xs font-medium text-on-surface-variant mb-3">Input Color Palette</p>
                    <div className="flex flex-wrap gap-4">
                        <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-lg shadow-sm" style={{ backgroundColor: '#783264' }}></div>
                            <div>
                                <p className="text-xs font-semibold text-on-surface">Primary</p>
                                <p className="text-[10px] text-on-surface-variant/60">Focus & Active</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-lg shadow-sm" style={{ backgroundColor: '#4D7C6F' }}></div>
                            <div>
                                <p className="text-xs font-semibold text-on-surface">Secondary</p>
                                <p className="text-[10px] text-on-surface-variant/60">Success States</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-lg shadow-sm" style={{ backgroundColor: '#A63D40' }}></div>
                            <div>
                                <p className="text-xs font-semibold text-on-surface">Error</p>
                                <p className="text-[10px] text-on-surface-variant/60">Validation Errors</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-lg shadow-sm bg-surface-container-high border border-outline-variant/30"></div>
                            <div>
                                <p className="text-xs font-semibold text-on-surface">Surface</p>
                                <p className="text-[10px] text-on-surface-variant/60">Default State</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-lg shadow-sm relative overflow-hidden">
                                <div className="absolute inset-0 bg-surface-container"></div>
                                <div className="absolute inset-0 bg-[#783264]/10"></div>
                            </div>
                            <div>
                                <p className="text-xs font-semibold text-on-surface">Accent Muted</p>
                                <p className="text-[10px] text-on-surface-variant/60">#783264 @ 10%</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* ===== TEXT INPUTS ===== */}
                <div className="mb-8">
                    <h3 className="text-sm font-semibold text-on-surface mb-4 flex items-center gap-2 pb-2 border-b border-outline-variant/10">
                        <span className="w-2.5 h-2.5 rounded-full shadow-sm" style={{ backgroundColor: '#783264' }}></span>
                        Text Inputs
                        <span className="text-[10px] font-normal text-on-surface-variant/50 ml-auto">Core text entry components</span>
                    </h3>

                    <ComponentRow id="input-text" label="Text Input" description="Standard text field" source="detection-studio" isSelected={selectedComponents.has('input-text')} onToggleSelect={toggleSelection}>
                        <span className="px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide rounded bg-blue-500/15 text-blue-500 mr-2">CURRENT</span>
                        <input
                            type="text"
                            placeholder="Enter text..."
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            className="h-10 w-64 px-4 rounded-xl text-sm bg-surface-container-high border border-outline-variant/30 text-on-surface placeholder-on-surface-variant/50 focus:outline-none focus:border-[#783264] focus:ring-2 focus:ring-[#783264]/20 transition-all"
                        />
                    </ComponentRow>

                    <ComponentRow id="input-labeled" label="Labeled Input" description="With label, required indicator, and helper text" source="detection-studio" isSelected={selectedComponents.has('input-labeled')} onToggleSelect={toggleSelection}>
                        <span className="px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide rounded bg-blue-500/15 text-blue-500 mr-2">CURRENT</span>
                        <div className="w-64">
                            <label className="block text-sm font-medium text-on-surface mb-1.5">
                                Detection Name <span className="text-[#A63D40]">*</span>
                            </label>
                            <input
                                type="text"
                                placeholder="e.g., Suspicious PowerShell"
                                className="w-full h-10 px-4 rounded-xl text-sm bg-surface-container-high border border-outline-variant/30 text-on-surface placeholder-on-surface-variant/50 focus:outline-none focus:border-[#783264] focus:ring-2 focus:ring-[#783264]/20 transition-all"
                            />
                            <p className="text-xs text-on-surface-variant/60 mt-1.5">
                                Unique name for this detection rule
                            </p>
                        </div>
                    </ComponentRow>

                    <ComponentRow id="input-search" label="Search Input" description="With search icon and clear button" source="detection-studio" isSelected={selectedComponents.has('input-search')} onToggleSelect={toggleSelection}>
                        <span className="px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide rounded bg-[#783264]/15 text-[#783264] mr-2">IMPROVED</span>
                        <div className="relative w-64">
                            <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant/50" />
                            <input
                                type="text"
                                defaultValue="powershell.exe"
                                placeholder="Search detections..."
                                className="w-full h-10 pl-10 pr-10 rounded-xl text-sm bg-surface-container border border-outline-variant/30 text-on-surface placeholder-on-surface-variant/50 focus:outline-none focus:border-[#783264] focus:ring-2 focus:ring-[#783264]/20 transition-all"
                            />
                            <button className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-surface-container-highest hover:bg-surface-container-high flex items-center justify-center transition-colors">
                                <Icon name="x" className="w-3 h-3 text-on-surface-variant" />
                            </button>
                        </div>
                    </ComponentRow>

                    <ComponentRow id="input-password" label="Password Input" description="With show/hide toggle" source="detection-studio" isSelected={selectedComponents.has('input-password')} onToggleSelect={toggleSelection}>
                        <span className="px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide rounded bg-[#4D7C6F]/15 text-[#4D7C6F] mr-2">NEW</span>
                        <div className="relative w-64">
                            <input
                                type="password"
                                defaultValue="secretpassword"
                                className="w-full h-10 pl-4 pr-10 rounded-xl text-sm bg-surface-container-high border border-outline-variant/30 text-on-surface placeholder-on-surface-variant/50 focus:outline-none focus:border-[#783264] focus:ring-2 focus:ring-[#783264]/20 transition-all"
                            />
                            <button className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant/50 hover:text-on-surface-variant transition-colors">
                                <Icon name="eye" className="w-4 h-4" />
                            </button>
                        </div>
                    </ComponentRow>

                    <ComponentRow id="input-number" label="Number Input" description="With increment/decrement" source="detection-studio" isSelected={selectedComponents.has('input-number')} onToggleSelect={toggleSelection}>
                        <span className="px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide rounded bg-[#4D7C6F]/15 text-[#4D7C6F] mr-2">NEW</span>
                        <div className="flex items-center gap-0 w-32">
                            <button className="h-10 w-10 rounded-l-xl bg-surface-container-high border border-outline-variant/30 border-r-0 flex items-center justify-center hover:bg-surface-container-highest transition-colors">
                                <Icon name="minus" className="w-4 h-4 text-on-surface-variant" />
                            </button>
                            <input
                                type="number"
                                defaultValue="5"
                                className="h-10 w-full px-3 text-center text-sm bg-surface-container-high border-y border-outline-variant/30 text-on-surface focus:outline-none focus:border-[#783264] transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            />
                            <button className="h-10 w-10 rounded-r-xl bg-surface-container-high border border-outline-variant/30 border-l-0 flex items-center justify-center hover:bg-surface-container-highest transition-colors">
                                <Icon name="plus" className="w-4 h-4 text-on-surface-variant" />
                            </button>
                        </div>
                    </ComponentRow>

                    <ComponentRow id="input-date" label="Date Input" description="Date picker field" source="detection-studio" isSelected={selectedComponents.has('input-date')} onToggleSelect={toggleSelection}>
                        <span className="px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide rounded bg-[#4D7C6F]/15 text-[#4D7C6F] mr-2">NEW</span>
                        <div className="relative w-48">
                            <input
                                type="date"
                                defaultValue="2024-01-15"
                                className="w-full h-10 px-4 rounded-xl text-sm bg-surface-container-high border border-outline-variant/30 text-on-surface focus:outline-none focus:border-[#783264] focus:ring-2 focus:ring-[#783264]/20 transition-all"
                            />
                        </div>
                    </ComponentRow>

                    <ComponentRow id="input-textarea" label="Textarea" description="Multi-line text input" source="detection-studio" isSelected={selectedComponents.has('input-textarea')} onToggleSelect={toggleSelection}>
                        <span className="px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide rounded bg-blue-500/15 text-blue-500 mr-2">CURRENT</span>
                        <textarea
                            placeholder="Enter description..."
                            rows={3}
                            className="w-80 px-4 py-3 rounded-xl text-sm bg-surface-container-high border border-outline-variant/30 text-on-surface placeholder-on-surface-variant/50 focus:outline-none focus:border-[#783264] focus:ring-2 focus:ring-[#783264]/20 transition-all resize-none"
                        />
                    </ComponentRow>

                    <ComponentRow id="input-textarea-count" label="Textarea with Count" description="Character count display" source="detection-studio" isSelected={selectedComponents.has('input-textarea-count')} onToggleSelect={toggleSelection}>
                        <span className="px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide rounded bg-[#4D7C6F]/15 text-[#4D7C6F] mr-2">NEW</span>
                        <div className="w-80">
                            <textarea
                                placeholder="Enter description..."
                                rows={3}
                                defaultValue="This is a sample description text."
                                maxLength={200}
                                className="w-full px-4 py-3 rounded-xl text-sm bg-surface-container-high border border-outline-variant/30 text-on-surface placeholder-on-surface-variant/50 focus:outline-none focus:border-[#783264] focus:ring-2 focus:ring-[#783264]/20 transition-all resize-none"
                            />
                            <p className="text-xs text-on-surface-variant/50 mt-1 text-right">35/200</p>
                        </div>
                    </ComponentRow>
                </div>

                {/* ===== SELECTION INPUTS ===== */}
                <div className="mb-8">
                    <h3 className="text-sm font-semibold text-on-surface mb-4 flex items-center gap-2 pb-2 border-b border-outline-variant/10">
                        <span className="w-2.5 h-2.5 rounded-full shadow-sm" style={{ backgroundColor: '#4D7C6F' }}></span>
                        Selection Inputs
                        <span className="text-[10px] font-normal text-on-surface-variant/50 ml-auto">Dropdowns, checkboxes, radios, toggles</span>
                    </h3>

                    <ComponentRow id="input-select" label="Select Dropdown" description="Custom dropdown (DS style)" source="detection-studio" isSelected={selectedComponents.has('input-select')} onToggleSelect={toggleSelection}>
                        <div className="flex gap-6 items-start">
                            {/* Trigger + Static Menu Preview */}
                            <div className="relative w-48">
                                <button className="w-full h-10 px-4 pr-10 rounded-xl text-sm bg-surface-container border border-outline-variant/20 text-on-surface text-left flex items-center hover:bg-surface-container-high transition-colors">
                                    Select severity
                                </button>
                                <Icon name="chevron-down" className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant/50 pointer-events-none" />
                                {/* Dropdown Menu */}
                                <div className="absolute top-full left-0 mt-2 w-full bg-surface-container border border-outline-variant/20 rounded-xl shadow-xl z-50 overflow-hidden py-1">
                                    {['Critical', 'High', 'Medium', 'Low'].map((opt, i) => (
                                        <button
                                            key={opt}
                                            className={`w-full flex items-center justify-between px-4 py-2.5 text-sm transition-colors ${
                                                i === 1 ? 'bg-[#783264]/10 text-on-surface' : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
                                            }`}
                                        >
                                            {opt}
                                            {i === 1 && <Icon name="check" className="w-4 h-4 text-[#783264]" />}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            {/* Filled State */}
                            <div className="relative w-48">
                                <button className="w-full h-10 px-4 pr-10 rounded-xl text-sm bg-surface-container border border-outline-variant/20 text-on-surface text-left flex items-center hover:bg-surface-container-high transition-colors">
                                    High
                                </button>
                                <Icon name="chevron-down" className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant/50 pointer-events-none" />
                            </div>
                        </div>
                    </ComponentRow>

                    <ComponentRow id="input-select-labeled" label="Labeled Select" description="With label and icon" source="detection-studio" isSelected={selectedComponents.has('input-select-labeled')} onToggleSelect={toggleSelection}>
                        <div className="w-56">
                            <label className="block text-sm font-medium text-on-surface mb-1.5">
                                Data Source
                            </label>
                            <div className="relative">
                                <Icon name="database" className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant/50 z-10" />
                                <button className="w-full h-10 pl-10 pr-10 rounded-xl text-sm bg-surface-container border border-outline-variant/20 text-on-surface text-left flex items-center hover:bg-surface-container-high transition-colors">
                                    Sysmon
                                </button>
                                <Icon name="chevron-down" className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant/50 pointer-events-none" />
                            </div>
                        </div>
                    </ComponentRow>

                    <ComponentRow id="input-checkbox" label="Checkbox" description="Boolean selection" source="detection-studio" isSelected={selectedComponents.has('input-checkbox')} onToggleSelect={toggleSelection}>
                        <span className="px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide rounded bg-blue-500/15 text-blue-500 mr-2">CURRENT</span>
                        <div className="flex gap-6">
                            <label className="flex items-center gap-2.5 cursor-pointer">
                                <input type="checkbox" className="w-4 h-4 rounded accent-[#783264]" />
                                <span className="text-sm text-on-surface">Unchecked</span>
                            </label>
                            <label className="flex items-center gap-2.5 cursor-pointer">
                                <input type="checkbox" defaultChecked className="w-4 h-4 rounded accent-[#783264]" />
                                <span className="text-sm text-on-surface">Checked</span>
                            </label>
                        </div>
                    </ComponentRow>

                    <ComponentRow id="input-checkbox-group" label="Checkbox Group" description="Multiple selections" source="detection-studio" isSelected={selectedComponents.has('input-checkbox-group')} onToggleSelect={toggleSelection}>
                        <span className="px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide rounded bg-[#4D7C6F]/15 text-[#4D7C6F] mr-2">NEW</span>
                        <div className="space-y-2">
                            <p className="text-sm font-medium text-on-surface mb-2">Notification Channels</p>
                            <label className="flex items-center gap-2.5 cursor-pointer">
                                <input type="checkbox" defaultChecked className="w-4 h-4 rounded accent-[#783264]" />
                                <span className="text-sm text-on-surface">Email</span>
                            </label>
                            <label className="flex items-center gap-2.5 cursor-pointer">
                                <input type="checkbox" defaultChecked className="w-4 h-4 rounded accent-[#783264]" />
                                <span className="text-sm text-on-surface">Slack</span>
                            </label>
                            <label className="flex items-center gap-2.5 cursor-pointer">
                                <input type="checkbox" className="w-4 h-4 rounded accent-[#783264]" />
                                <span className="text-sm text-on-surface">Webhook</span>
                            </label>
                        </div>
                    </ComponentRow>

                    <ComponentRow id="input-radio" label="Radio Buttons" description="Single selection from options" source="detection-studio" isSelected={selectedComponents.has('input-radio')} onToggleSelect={toggleSelection}>
                        <span className="px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide rounded bg-blue-500/15 text-blue-500 mr-2">CURRENT</span>
                        <div className="flex gap-4">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input type="radio" name="severity-demo" value="high" className="w-4 h-4 accent-[#783264]" />
                                <span className="text-sm text-on-surface">High</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input type="radio" name="severity-demo" value="medium" defaultChecked className="w-4 h-4 accent-[#783264]" />
                                <span className="text-sm text-on-surface">Medium</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input type="radio" name="severity-demo" value="low" className="w-4 h-4 accent-[#783264]" />
                                <span className="text-sm text-on-surface">Low</span>
                            </label>
                        </div>
                    </ComponentRow>

                    <ComponentRow id="input-radio-cards" label="Radio Cards" description="Card-style radio selection" source="detection-studio" isSelected={selectedComponents.has('input-radio-cards')} onToggleSelect={toggleSelection}>
                        <span className="px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide rounded bg-[#4D7C6F]/15 text-[#4D7C6F] mr-2">NEW</span>
                        <div className="flex gap-3">
                            {[
                                { value: 'siem', label: 'SIEM', desc: 'Splunk, Elastic' },
                                { value: 'edr', label: 'EDR', desc: 'CrowdStrike, Carbon Black' },
                                { value: 'custom', label: 'Custom', desc: 'API Integration' },
                            ].map((opt, i) => (
                                <label key={opt.value} className={`flex flex-col p-3 rounded-xl border-2 cursor-pointer transition-all w-32 ${i === 0 ? 'border-[#783264] bg-[#783264]/5' : 'border-outline-variant/30 hover:border-outline-variant/50'}`}>
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="text-sm font-medium text-on-surface">{opt.label}</span>
                                        <input type="radio" name="platform" value={opt.value} defaultChecked={i === 0} className="w-4 h-4 accent-[#783264]" />
                                    </div>
                                    <span className="text-[10px] text-on-surface-variant">{opt.desc}</span>
                                </label>
                            ))}
                        </div>
                    </ComponentRow>

                    <ComponentRow id="input-toggle" label="Toggle Switch" description="On/off toggle" source="detection-studio" isSelected={selectedComponents.has('input-toggle')} onToggleSelect={toggleSelection}>
                        <span className="px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide rounded bg-blue-500/15 text-blue-500 mr-2">CURRENT</span>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input
                                type="checkbox"
                                checked={isToggled}
                                onChange={() => setIsToggled(!isToggled)}
                                className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-surface-container-highest border border-outline-variant rounded-full peer peer-checked:bg-[#783264] peer-checked:border-[#783264] after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-on-surface-variant/60 peer-checked:after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full"></div>
                            <span className="ml-3 text-sm text-on-surface">{isToggled ? 'Enabled' : 'Disabled'}</span>
                        </label>
                    </ComponentRow>

                    <ComponentRow id="input-toggle-labeled" label="Labeled Toggle" description="Toggle with description" source="detection-studio" isSelected={selectedComponents.has('input-toggle-labeled')} onToggleSelect={toggleSelection}>
                        <span className="px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide rounded bg-[#4D7C6F]/15 text-[#4D7C6F] mr-2">NEW</span>
                        <div className="flex items-start justify-between w-80 p-4 rounded-xl bg-surface-container border border-outline-variant/20">
                            <div>
                                <p className="text-sm font-medium text-on-surface">Auto-deploy to production</p>
                                <p className="text-xs text-on-surface-variant/60 mt-0.5">Automatically deploy passing detections</p>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input type="checkbox" defaultChecked className="sr-only peer" />
                                <div className="w-11 h-6 bg-surface-container-highest border border-outline-variant rounded-full peer peer-checked:bg-[#783264] peer-checked:border-[#783264] after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-on-surface-variant/60 peer-checked:after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full"></div>
                            </label>
                        </div>
                    </ComponentRow>
                </div>

                {/* ===== SPECIAL INPUTS ===== */}
                <div className="mb-8">
                    <h3 className="text-sm font-semibold text-on-surface mb-4 flex items-center gap-2 pb-2 border-b border-outline-variant/10">
                        <span className="w-2.5 h-2.5 rounded-full shadow-sm" style={{ backgroundColor: '#A63D40' }}></span>
                        Special Inputs
                        <span className="text-[10px] font-normal text-on-surface-variant/50 ml-auto">File uploads, tags, specialized fields</span>
                    </h3>

                    <ComponentRow id="input-file" label="File Upload" description="File selection input" source="detection-studio" isSelected={selectedComponents.has('input-file')} onToggleSelect={toggleSelection}>
                        <span className="px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide rounded bg-[#4D7C6F]/15 text-[#4D7C6F] mr-2">NEW</span>
                        <div className="w-80">
                            <div className="flex items-center justify-center w-full h-24 border-2 border-dashed border-outline-variant/30 rounded-xl bg-surface-container hover:bg-surface-container-high hover:border-[#783264]/30 transition-all cursor-pointer">
                                <div className="text-center">
                                    <Icon name="upload" className="w-6 h-6 text-on-surface-variant/50 mx-auto mb-2" />
                                    <p className="text-sm text-on-surface-variant">Drop file or <span className="text-[#783264] font-medium">browse</span></p>
                                    <p className="text-[10px] text-on-surface-variant/50 mt-1">YAML, JSON up to 5MB</p>
                                </div>
                            </div>
                        </div>
                    </ComponentRow>

                    <ComponentRow id="input-file-selected" label="File Selected" description="File upload with selection" source="detection-studio" isSelected={selectedComponents.has('input-file-selected')} onToggleSelect={toggleSelection}>
                        <span className="px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide rounded bg-[#4D7C6F]/15 text-[#4D7C6F] mr-2">NEW</span>
                        <div className="w-80">
                            <div className="flex items-center gap-3 p-3 border border-outline-variant/30 rounded-xl bg-surface-container">
                                <div className="w-10 h-10 rounded-lg bg-[#783264]/10 flex items-center justify-center">
                                    <Icon name="file-text" className="w-5 h-5 text-[#783264]" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-on-surface truncate">detection_rule.yaml</p>
                                    <p className="text-[10px] text-on-surface-variant/60">2.4 KB</p>
                                </div>
                                <button className="p-1.5 rounded-lg hover:bg-surface-container-high transition-colors">
                                    <Icon name="x" className="w-4 h-4 text-on-surface-variant" />
                                </button>
                            </div>
                        </div>
                    </ComponentRow>

                    <ComponentRow id="input-tags" label="Tag Input" description="Multiple tag entry" source="detection-studio" isSelected={selectedComponents.has('input-tags')} onToggleSelect={toggleSelection}>
                        <span className="px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide rounded bg-[#4D7C6F]/15 text-[#4D7C6F] mr-2">NEW</span>
                        <div className="w-80">
                            <div className="flex flex-wrap gap-2 p-2 min-h-[42px] rounded-xl bg-surface-container-high border border-outline-variant/30 focus-within:border-[#783264] focus-within:ring-2 focus-within:ring-[#783264]/20 transition-all">
                                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-[#783264]/15 text-[#783264] text-xs font-medium">
                                    malware
                                    <button className="hover:text-[#783264]/70"><Icon name="x" className="w-3 h-3" /></button>
                                </span>
                                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-[#783264]/15 text-[#783264] text-xs font-medium">
                                    powershell
                                    <button className="hover:text-[#783264]/70"><Icon name="x" className="w-3 h-3" /></button>
                                </span>
                                <input
                                    type="text"
                                    placeholder="Add tag..."
                                    className="flex-1 min-w-[80px] bg-transparent text-sm text-on-surface placeholder-on-surface-variant/50 focus:outline-none"
                                />
                            </div>
                        </div>
                    </ComponentRow>
                </div>

                {/* ===== INPUT STATES ===== */}
                <div className="mb-8">
                    <h3 className="text-sm font-semibold text-on-surface mb-4 flex items-center gap-2 pb-2 border-b border-outline-variant/10">
                        <span className="w-2.5 h-2.5 rounded-full shadow-sm bg-gray-400"></span>
                        Input States
                        <span className="text-[10px] font-normal text-on-surface-variant/50 ml-auto">Disabled, readonly, error, success</span>
                    </h3>

                    <ComponentRow id="input-disabled" label="Disabled State" description="Non-interactive input" source="detection-studio" isSelected={selectedComponents.has('input-disabled')} onToggleSelect={toggleSelection}>
                        <span className="px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide rounded bg-[#4D7C6F]/15 text-[#4D7C6F] mr-2">NEW</span>
                        <input
                            type="text"
                            disabled
                            defaultValue="Cannot edit this"
                            className="h-10 w-64 px-4 rounded-xl text-sm bg-surface-container border border-outline-variant/20 text-on-surface-variant/50 cursor-not-allowed"
                        />
                        <div className="relative w-48 ml-4">
                            <button disabled className="w-full h-10 px-4 pr-10 rounded-xl text-sm bg-surface-container border border-outline-variant/20 text-on-surface-variant/50 cursor-not-allowed text-left">
                                Disabled select
                            </button>
                            <Icon name="chevron-down" className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant/30 pointer-events-none" />
                        </div>
                    </ComponentRow>

                    <ComponentRow id="input-readonly" label="Read-only State" description="Viewable but not editable" source="detection-studio" isSelected={selectedComponents.has('input-readonly')} onToggleSelect={toggleSelection}>
                        <span className="px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide rounded bg-[#4D7C6F]/15 text-[#4D7C6F] mr-2">NEW</span>
                        <div className="w-64">
                            <label className="block text-sm font-medium text-on-surface mb-1.5">Detection ID</label>
                            <input
                                type="text"
                                readOnly
                                defaultValue="DET-2024-00142"
                                className="w-full h-10 px-4 rounded-xl text-sm bg-surface-container border border-outline-variant/20 text-on-surface cursor-default focus:outline-none"
                            />
                        </div>
                    </ComponentRow>

                    <ComponentRow id="input-error" label="Error State" description="Validation error display" source="detection-studio" isSelected={selectedComponents.has('input-error')} onToggleSelect={toggleSelection}>
                        <span className="px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide rounded bg-blue-500/15 text-blue-500 mr-2">CURRENT</span>
                        <div className="w-64">
                            <label className="block text-sm font-medium text-on-surface mb-1.5">Detection Name</label>
                            <input
                                type="text"
                                defaultValue=""
                                placeholder="Required field"
                                className="w-full h-10 px-4 rounded-xl text-sm bg-surface-container-high border-2 border-[#A63D40] text-on-surface placeholder-on-surface-variant/50 focus:outline-none focus:ring-2 focus:ring-[#A63D40]/20 transition-all"
                            />
                            <p className="text-xs text-[#A63D40] mt-1.5 flex items-center gap-1">
                                <Icon name="alert-circle" className="w-3 h-3" />
                                This field is required
                            </p>
                        </div>
                    </ComponentRow>

                    <ComponentRow id="input-success" label="Success State" description="Validated input" source="detection-studio" isSelected={selectedComponents.has('input-success')} onToggleSelect={toggleSelection}>
                        <span className="px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide rounded bg-[#4D7C6F]/15 text-[#4D7C6F] mr-2">NEW</span>
                        <div className="w-64">
                            <label className="block text-sm font-medium text-on-surface mb-1.5">Detection Name</label>
                            <div className="relative">
                                <input
                                    type="text"
                                    defaultValue="Suspicious PowerShell Execution"
                                    className="w-full h-10 px-4 pr-10 rounded-xl text-sm bg-surface-container-high border-2 border-[#4D7C6F] text-on-surface focus:outline-none focus:ring-2 focus:ring-[#4D7C6F]/20 transition-all"
                                />
                                <Icon name="check-circle" className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#4D7C6F]" />
                            </div>
                            <p className="text-xs text-[#4D7C6F] mt-1.5 flex items-center gap-1">
                                <Icon name="check" className="w-3 h-3" />
                                Name is available
                            </p>
                        </div>
                    </ComponentRow>
                </div>

                {/* ===== INPUT SIZES ===== */}
                <div className="mb-8">
                    <h3 className="text-sm font-semibold text-on-surface mb-4 flex items-center gap-2 pb-2 border-b border-outline-variant/10">
                        <span className="w-2.5 h-2.5 rounded-full shadow-sm bg-gray-400"></span>
                        Input Sizes
                        <span className="text-[10px] font-normal text-on-surface-variant/50 ml-auto">Small (32px), Medium (40px), Large (48px)</span>
                    </h3>

                    <ComponentRow id="input-sizes" label="Size Variants" description="Small, Medium, Large" source="detection-studio" isSelected={selectedComponents.has('input-sizes')} onToggleSelect={toggleSelection}>
                        <span className="px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide rounded bg-[#4D7C6F]/15 text-[#4D7C6F] mr-2">NEW</span>
                        <div className="flex items-end gap-4">
                            <div>
                                <p className="text-[10px] text-on-surface-variant mb-1">Small (32px)</p>
                                <input
                                    type="text"
                                    placeholder="Small input"
                                    className="h-8 w-40 px-3 rounded-lg text-xs bg-surface-container-high border border-outline-variant/30 text-on-surface placeholder-on-surface-variant/50 focus:outline-none focus:border-[#783264] focus:ring-2 focus:ring-[#783264]/20 transition-all"
                                />
                            </div>
                            <div>
                                <p className="text-[10px] text-on-surface-variant mb-1">Medium (40px)</p>
                                <input
                                    type="text"
                                    placeholder="Medium input"
                                    className="h-10 w-48 px-4 rounded-xl text-sm bg-surface-container-high border border-outline-variant/30 text-on-surface placeholder-on-surface-variant/50 focus:outline-none focus:border-[#783264] focus:ring-2 focus:ring-[#783264]/20 transition-all"
                                />
                            </div>
                            <div>
                                <p className="text-[10px] text-on-surface-variant mb-1">Large (48px)</p>
                                <input
                                    type="text"
                                    placeholder="Large input"
                                    className="h-12 w-56 px-5 rounded-xl text-base bg-surface-container-high border border-outline-variant/30 text-on-surface placeholder-on-surface-variant/50 focus:outline-none focus:border-[#783264] focus:ring-2 focus:ring-[#783264]/20 transition-all"
                                />
                            </div>
                        </div>
                    </ComponentRow>
                </div>

                {/* ===== SPECS REFERENCE ===== */}
                <div className="p-5 bg-gradient-to-br from-surface-container to-surface-container-low rounded-2xl border border-outline-variant/20 shadow-sm">
                    <div className="flex items-center gap-2 mb-4">
                        <div className="w-8 h-8 rounded-lg bg-[#783264]/10 flex items-center justify-center">
                            <Icon name="ruler" className="w-4 h-4 text-[#783264]" />
                        </div>
                        <h4 className="text-sm font-semibold text-on-surface">Input Specifications</h4>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-6 gap-3 text-[11px]">
                        <div className="p-3 rounded-xl bg-surface-container-high/50">
                            <p className="text-on-surface-variant/60 mb-1">Heights</p>
                            <p className="text-on-surface font-semibold">32 / 40 / 48px</p>
                        </div>
                        <div className="p-3 rounded-xl bg-surface-container-high/50">
                            <p className="text-on-surface-variant/60 mb-1">Corner Radius</p>
                            <p className="text-on-surface font-semibold">8 / 12px</p>
                        </div>
                        <div className="p-3 rounded-xl bg-surface-container-high/50">
                            <p className="text-on-surface-variant/60 mb-1">Focus Color</p>
                            <p className="text-on-surface font-semibold flex items-center gap-1.5">
                                <span className="w-3 h-3 rounded-full" style={{ backgroundColor: '#783264' }}></span>
                                #783264
                            </p>
                        </div>
                        <div className="p-3 rounded-xl bg-surface-container-high/50">
                            <p className="text-on-surface-variant/60 mb-1">Success Color</p>
                            <p className="text-on-surface font-semibold flex items-center gap-1.5">
                                <span className="w-3 h-3 rounded-full" style={{ backgroundColor: '#4D7C6F' }}></span>
                                #4D7C6F
                            </p>
                        </div>
                        <div className="p-3 rounded-xl bg-surface-container-high/50">
                            <p className="text-on-surface-variant/60 mb-1">Error Color</p>
                            <p className="text-on-surface font-semibold flex items-center gap-1.5">
                                <span className="w-3 h-3 rounded-full" style={{ backgroundColor: '#A63D40' }}></span>
                                #A63D40
                            </p>
                        </div>
                        <div className="p-3 rounded-xl bg-surface-container-high/50">
                            <p className="text-on-surface-variant/60 mb-1">Surface Color</p>
                            <p className="text-on-surface font-semibold flex items-center gap-1.5">
                                <span className="w-3 h-3 rounded-full" style={{ backgroundColor: '#6B7280' }}></span>
                                #6B7280
                            </p>
                        </div>
                    </div>
                    <div className="mt-4 pt-4 border-t border-outline-variant/10">
                        <p className="text-[10px] text-on-surface-variant/60">
                            <span className="font-medium text-on-surface-variant">Focus:</span> 2px border + ring shadow •
                            <span className="font-medium text-on-surface-variant ml-2">Padding:</span> 12-20px horizontal •
                            <span className="font-medium text-on-surface-variant ml-2">Background:</span> surface-container-high
                        </p>
                    </div>
                </div>

                {/* Legend */}
                <div className="mt-4 p-4 bg-surface-container rounded-2xl border border-outline-variant/10 flex flex-wrap items-center gap-6 text-[11px]">
                    <span className="text-on-surface-variant font-medium">Legend:</span>
                    <span className="flex items-center gap-2">
                        <span className="px-2.5 py-1 font-bold uppercase tracking-wide rounded-lg bg-blue-500/15 text-blue-500">CURRENT</span>
                        <span className="text-on-surface-variant/70">Existing, accepted as-is</span>
                    </span>
                    <span className="flex items-center gap-2">
                        <span className="px-2.5 py-1 font-bold uppercase tracking-wide rounded-lg bg-[#783264]/15 text-[#783264]">IMPROVED</span>
                        <span className="text-on-surface-variant/70">Enhanced existing</span>
                    </span>
                    <span className="flex items-center gap-2">
                        <span className="px-2.5 py-1 font-bold uppercase tracking-wide rounded-lg bg-[#4D7C6F]/15 text-[#4D7C6F]">NEW</span>
                        <span className="text-on-surface-variant/70">New addition</span>
                    </span>
                </div>
            </Section>
        </DesignSystemPage>
    );
};

export default InputsPage;
