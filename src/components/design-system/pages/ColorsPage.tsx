import React from 'react';
import { DesignSystemPage, Section, ComponentRow } from '../shared';

export const ColorsPage: React.FC = () => {
    return (
        <DesignSystemPage
            title="Color System"
            description="Detection Studio color palette for buttons, inputs, and UI components"
        >
            <Section title="Detection Studio Color System" description="Selected color palette for buttons, inputs, and UI components">

                {/* Large Color Swatches */}
                <div className="flex flex-wrap justify-center gap-6 mb-12">
                    <div className="w-40 h-40 rounded-3xl shadow-xl flex items-center justify-center" style={{ backgroundColor: '#783264' }}>
                        <span className="text-white text-2xl font-bold">#783264</span>
                    </div>
                    <div className="w-40 h-40 rounded-3xl shadow-xl flex items-center justify-center" style={{ backgroundColor: '#4D7C6F' }}>
                        <span className="text-white text-2xl font-bold">#4D7C6F</span>
                    </div>
                    <div className="w-40 h-40 rounded-3xl shadow-xl flex items-center justify-center" style={{ backgroundColor: '#A63D40' }}>
                        <span className="text-white text-2xl font-bold">#A63D40</span>
                    </div>
                    <div className="w-40 h-40 rounded-3xl shadow-xl flex items-center justify-center" style={{ backgroundColor: '#6B7280' }}>
                        <span className="text-white text-2xl font-bold">#6B7280</span>
                    </div>
                    <div className="w-40 h-40 rounded-3xl shadow-xl flex items-center justify-center relative overflow-hidden">
                        <div className="absolute inset-0 bg-surface-container"></div>
                        <div className="absolute inset-0 bg-[#783264]/10"></div>
                        <span className="relative text-[#783264] text-xl font-bold">10%</span>
                    </div>
                </div>

                {/* Color Details List */}
                <div className="space-y-4">
                    {/* Primary */}
                    <div className="flex items-center gap-5 p-5 bg-surface-container rounded-2xl border border-outline-variant/20">
                        <div className="w-16 h-16 rounded-xl shadow-md flex-shrink-0" style={{ backgroundColor: '#783264' }}></div>
                        <div className="flex-1">
                            <div className="flex items-baseline gap-3 mb-1">
                                <h4 className="text-xl font-bold text-on-surface">Primary</h4>
                                <span className="text-lg text-[#783264] font-semibold">Magenta</span>
                                <span className="text-sm text-on-surface-variant">#783264</span>
                            </div>
                            <p className="text-sm text-on-surface-variant mb-2">Main brand color for primary actions and focus states.</p>
                            <div className="flex flex-wrap gap-2">
                                <span className="px-2.5 py-1 text-xs rounded-md bg-[#783264]/10 text-[#783264] font-medium">Save</span>
                                <span className="px-2.5 py-1 text-xs rounded-md bg-[#783264]/10 text-[#783264] font-medium">Submit</span>
                                <span className="px-2.5 py-1 text-xs rounded-md bg-[#783264]/10 text-[#783264] font-medium">Create</span>
                                <span className="px-2.5 py-1 text-xs rounded-md bg-[#783264]/10 text-[#783264] font-medium">Confirm</span>
                                <span className="px-2.5 py-1 text-xs rounded-md bg-[#783264]/10 text-[#783264] font-medium">Publish</span>
                                <span className="px-2.5 py-1 text-xs rounded-md bg-[#783264]/10 text-[#783264] font-medium">Focus States</span>
                            </div>
                        </div>
                    </div>

                    {/* Secondary */}
                    <div className="flex items-center gap-5 p-5 bg-surface-container rounded-2xl border border-outline-variant/20">
                        <div className="w-16 h-16 rounded-xl shadow-md flex-shrink-0" style={{ backgroundColor: '#4D7C6F' }}></div>
                        <div className="flex-1">
                            <div className="flex items-baseline gap-3 mb-1">
                                <h4 className="text-xl font-bold text-on-surface">Secondary</h4>
                                <span className="text-lg text-[#4D7C6F] font-semibold">Sage Green</span>
                                <span className="text-sm text-on-surface-variant">#4D7C6F</span>
                            </div>
                            <p className="text-sm text-on-surface-variant mb-2">Secondary actions and success states. Complements primary.</p>
                            <div className="flex flex-wrap gap-2">
                                <span className="px-2.5 py-1 text-xs rounded-md bg-[#4D7C6F]/10 text-[#4D7C6F] font-medium">Export</span>
                                <span className="px-2.5 py-1 text-xs rounded-md bg-[#4D7C6F]/10 text-[#4D7C6F] font-medium">Filter</span>
                                <span className="px-2.5 py-1 text-xs rounded-md bg-[#4D7C6F]/10 text-[#4D7C6F] font-medium">Sort</span>
                                <span className="px-2.5 py-1 text-xs rounded-md bg-[#4D7C6F]/10 text-[#4D7C6F] font-medium">Settings</span>
                                <span className="px-2.5 py-1 text-xs rounded-md bg-[#4D7C6F]/10 text-[#4D7C6F] font-medium">Success</span>
                                <span className="px-2.5 py-1 text-xs rounded-md bg-[#4D7C6F]/10 text-[#4D7C6F] font-medium">Draft</span>
                            </div>
                        </div>
                    </div>

                    {/* Error */}
                    <div className="flex items-center gap-5 p-5 bg-surface-container rounded-2xl border border-outline-variant/20">
                        <div className="w-16 h-16 rounded-xl shadow-md flex-shrink-0" style={{ backgroundColor: '#A63D40' }}></div>
                        <div className="flex-1">
                            <div className="flex items-baseline gap-3 mb-1">
                                <h4 className="text-xl font-bold text-on-surface">Error</h4>
                                <span className="text-lg text-[#A63D40] font-semibold">Brick Red</span>
                                <span className="text-sm text-on-surface-variant">#A63D40</span>
                            </div>
                            <p className="text-sm text-on-surface-variant mb-2">Destructive actions and error states. Muted but clear.</p>
                            <div className="flex flex-wrap gap-2">
                                <span className="px-2.5 py-1 text-xs rounded-md bg-[#A63D40]/10 text-[#A63D40] font-medium">Delete</span>
                                <span className="px-2.5 py-1 text-xs rounded-md bg-[#A63D40]/10 text-[#A63D40] font-medium">Remove</span>
                                <span className="px-2.5 py-1 text-xs rounded-md bg-[#A63D40]/10 text-[#A63D40] font-medium">Clear All</span>
                                <span className="px-2.5 py-1 text-xs rounded-md bg-[#A63D40]/10 text-[#A63D40] font-medium">Validation Errors</span>
                            </div>
                        </div>
                    </div>

                    {/* Surface */}
                    <div className="flex items-center gap-5 p-5 bg-surface-container rounded-2xl border border-outline-variant/20">
                        <div className="w-16 h-16 rounded-xl shadow-md flex-shrink-0" style={{ backgroundColor: '#6B7280' }}></div>
                        <div className="flex-1">
                            <div className="flex items-baseline gap-3 mb-1">
                                <h4 className="text-xl font-bold text-on-surface">Surface</h4>
                                <span className="text-lg text-[#6B7280] font-semibold">Neutral Gray</span>
                                <span className="text-sm text-on-surface-variant">#6B7280</span>
                            </div>
                            <p className="text-sm text-on-surface-variant mb-2">Neutral actions and default states. Low emphasis.</p>
                            <div className="flex flex-wrap gap-2">
                                <span className="px-2.5 py-1 text-xs rounded-md bg-[#6B7280]/10 text-[#6B7280] font-medium">Cancel</span>
                                <span className="px-2.5 py-1 text-xs rounded-md bg-[#6B7280]/10 text-[#6B7280] font-medium">Dismiss</span>
                                <span className="px-2.5 py-1 text-xs rounded-md bg-[#6B7280]/10 text-[#6B7280] font-medium">Close</span>
                                <span className="px-2.5 py-1 text-xs rounded-md bg-[#6B7280]/10 text-[#6B7280] font-medium">Default Borders</span>
                            </div>
                        </div>
                    </div>

                    {/* Accent Muted */}
                    <div className="flex items-center gap-5 p-5 bg-surface-container rounded-2xl border border-outline-variant/20">
                        <div className="w-16 h-16 rounded-xl shadow-md flex-shrink-0 relative overflow-hidden">
                            <div className="absolute inset-0 bg-surface-container"></div>
                            <div className="absolute inset-0 bg-[#783264]/10"></div>
                        </div>
                        <div className="flex-1">
                            <div className="flex items-baseline gap-3 mb-1">
                                <h4 className="text-xl font-bold text-on-surface">Accent Muted</h4>
                                <span className="text-lg text-[#783264] font-semibold">#783264 @ 10%</span>
                            </div>
                            <p className="text-sm text-on-surface-variant mb-2">Subtle backgrounds and soft accents. Primary at 10% opacity.</p>
                            <div className="flex flex-wrap gap-2">
                                <span className="px-2.5 py-1 text-xs rounded-md bg-[#783264]/10 text-[#783264] font-medium">Icon Backgrounds</span>
                                <span className="px-2.5 py-1 text-xs rounded-md bg-[#783264]/10 text-[#783264] font-medium">Hover States</span>
                                <span className="px-2.5 py-1 text-xs rounded-md bg-[#783264]/10 text-[#783264] font-medium">Selected Items</span>
                                <span className="px-2.5 py-1 text-xs rounded-md bg-[#783264]/10 text-[#783264] font-medium">Decorative</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* MITRE & Badge Colors Section */}
                <div className="mt-12 mb-6">
                    <h3 className="text-lg font-bold text-on-surface mb-2">MITRE ATT&CK & Badge Colors</h3>
                    <p className="text-sm text-on-surface-variant">Semantic colors for entity types, status indicators, and severity levels.</p>
                </div>

                {/* Large Color Swatches - MITRE */}
                <div className="flex flex-wrap justify-center gap-4 mb-8">
                    <div className="w-28 h-28 rounded-2xl shadow-lg flex flex-col items-center justify-center" style={{ backgroundColor: '#005091' }}>
                        <span className="text-white text-sm font-bold">#005091</span>
                        <span className="text-white/70 text-[10px] mt-1">Primary Blue</span>
                    </div>
                    <div className="w-28 h-28 rounded-2xl shadow-lg flex flex-col items-center justify-center" style={{ backgroundColor: '#0284C7' }}>
                        <span className="text-white text-sm font-bold">#0284C7</span>
                        <span className="text-white/70 text-[10px] mt-1">Sky Blue</span>
                    </div>
                    <div className="w-28 h-28 rounded-2xl shadow-lg flex flex-col items-center justify-center" style={{ backgroundColor: '#8B5CF6' }}>
                        <span className="text-white text-sm font-bold">#8B5CF6</span>
                        <span className="text-white/70 text-[10px] mt-1">Purple</span>
                    </div>
                    <div className="w-28 h-28 rounded-2xl shadow-lg flex flex-col items-center justify-center" style={{ backgroundColor: '#F97316' }}>
                        <span className="text-white text-sm font-bold">#F97316</span>
                        <span className="text-white/70 text-[10px] mt-1">Orange</span>
                    </div>
                    <div className="w-28 h-28 rounded-2xl shadow-lg flex flex-col items-center justify-center" style={{ backgroundColor: '#EAB308' }}>
                        <span className="text-black/80 text-sm font-bold">#EAB308</span>
                        <span className="text-black/60 text-[10px] mt-1">Yellow</span>
                    </div>
                    <div className="w-28 h-28 rounded-2xl shadow-lg flex flex-col items-center justify-center" style={{ backgroundColor: '#10B981' }}>
                        <span className="text-white text-sm font-bold">#10B981</span>
                        <span className="text-white/70 text-[10px] mt-1">Emerald</span>
                    </div>
                </div>

                {/* Color Details - Extended */}
                <div className="space-y-4">
                    {/* Primary Blue */}
                    <div className="flex items-center gap-5 p-5 bg-surface-container rounded-2xl border border-outline-variant/20">
                        <div className="w-16 h-16 rounded-xl shadow-md flex-shrink-0" style={{ backgroundColor: '#005091' }}></div>
                        <div className="flex-1">
                            <div className="flex items-baseline gap-3 mb-1">
                                <h4 className="text-xl font-bold text-on-surface">Primary Blue</h4>
                                <span className="text-lg text-[#005091] font-semibold">Ocean</span>
                                <span className="text-sm text-on-surface-variant">#005091</span>
                            </div>
                            <p className="text-sm text-on-surface-variant mb-2">System primary color. Used for primary UI elements and focus states.</p>
                            <div className="flex flex-wrap gap-2">
                                <span className="px-2.5 py-1 text-xs rounded-md bg-[#005091]/10 text-[#005091] font-medium">Links</span>
                                <span className="px-2.5 py-1 text-xs rounded-md bg-[#005091]/10 text-[#005091] font-medium">Focus Rings</span>
                                <span className="px-2.5 py-1 text-xs rounded-md bg-[#005091]/10 text-[#005091] font-medium">Active States</span>
                                <span className="px-2.5 py-1 text-xs rounded-md bg-[#005091]/10 text-[#005091] font-medium">Selection</span>
                            </div>
                        </div>
                    </div>

                    {/* Sky Blue */}
                    <div className="flex items-center gap-5 p-5 bg-surface-container rounded-2xl border border-outline-variant/20">
                        <div className="w-16 h-16 rounded-xl shadow-md flex-shrink-0" style={{ backgroundColor: '#0284C7' }}></div>
                        <div className="flex-1">
                            <div className="flex items-baseline gap-3 mb-1">
                                <h4 className="text-xl font-bold text-on-surface">Info / Campaign</h4>
                                <span className="text-lg text-[#0284C7] font-semibold">Sky Blue</span>
                                <span className="text-sm text-on-surface-variant">#0284C7</span>
                            </div>
                            <p className="text-sm text-on-surface-variant mb-2">Information and campaign indicators. Testing status and C#### entities.</p>
                            <div className="flex flex-wrap gap-2">
                                <span className="px-2.5 py-1 text-xs rounded-md bg-[#0284C7]/10 text-[#0284C7] font-medium">Testing Status</span>
                                <span className="px-2.5 py-1 text-xs rounded-md bg-[#0284C7]/10 text-[#0284C7] font-medium">Campaigns (C####)</span>
                                <span className="px-2.5 py-1 text-xs rounded-md bg-[#0284C7]/10 text-[#0284C7] font-medium">Info Alerts</span>
                                <span className="px-2.5 py-1 text-xs rounded-md bg-[#0284C7]/10 text-[#0284C7] font-medium">Progress</span>
                            </div>
                        </div>
                    </div>

                    {/* Purple */}
                    <div className="flex items-center gap-5 p-5 bg-surface-container rounded-2xl border border-outline-variant/20">
                        <div className="w-16 h-16 rounded-xl shadow-md flex-shrink-0" style={{ backgroundColor: '#8B5CF6' }}></div>
                        <div className="flex-1">
                            <div className="flex items-baseline gap-3 mb-1">
                                <h4 className="text-xl font-bold text-on-surface">Technique</h4>
                                <span className="text-lg text-purple-500 font-semibold">Purple</span>
                                <span className="text-sm text-on-surface-variant">#8B5CF6</span>
                            </div>
                            <p className="text-sm text-on-surface-variant mb-2">MITRE techniques and development status. T#### entities and tags.</p>
                            <div className="flex flex-wrap gap-2">
                                <span className="px-2.5 py-1 text-xs rounded-md bg-purple-500/10 text-purple-500 font-medium">Techniques (T####)</span>
                                <span className="px-2.5 py-1 text-xs rounded-md bg-purple-500/10 text-purple-500 font-medium">Development Status</span>
                                <span className="px-2.5 py-1 text-xs rounded-md bg-purple-500/10 text-purple-500 font-medium">Tags</span>
                                <span className="px-2.5 py-1 text-xs rounded-md bg-purple-500/10 text-purple-500 font-medium">Sub-techniques</span>
                            </div>
                        </div>
                    </div>

                    {/* Orange */}
                    <div className="flex items-center gap-5 p-5 bg-surface-container rounded-2xl border border-outline-variant/20">
                        <div className="w-16 h-16 rounded-xl shadow-md flex-shrink-0" style={{ backgroundColor: '#F97316' }}></div>
                        <div className="flex-1">
                            <div className="flex items-baseline gap-3 mb-1">
                                <h4 className="text-xl font-bold text-on-surface">Software / High</h4>
                                <span className="text-lg text-orange-500 font-semibold">Orange</span>
                                <span className="text-sm text-on-surface-variant">#F97316</span>
                            </div>
                            <p className="text-sm text-on-surface-variant mb-2">Software/malware entities and high severity. S#### identifiers.</p>
                            <div className="flex flex-wrap gap-2">
                                <span className="px-2.5 py-1 text-xs rounded-md bg-orange-500/10 text-orange-500 font-medium">Software (S####)</span>
                                <span className="px-2.5 py-1 text-xs rounded-md bg-orange-500/10 text-orange-500 font-medium">Malware</span>
                                <span className="px-2.5 py-1 text-xs rounded-md bg-orange-500/10 text-orange-500 font-medium">High Severity</span>
                                <span className="px-2.5 py-1 text-xs rounded-md bg-orange-500/10 text-orange-500 font-medium">Tools</span>
                            </div>
                        </div>
                    </div>

                    {/* Yellow */}
                    <div className="flex items-center gap-5 p-5 bg-surface-container rounded-2xl border border-outline-variant/20">
                        <div className="w-16 h-16 rounded-xl shadow-md flex-shrink-0" style={{ backgroundColor: '#EAB308' }}></div>
                        <div className="flex-1">
                            <div className="flex items-baseline gap-3 mb-1">
                                <h4 className="text-xl font-bold text-on-surface">Warning / Medium</h4>
                                <span className="text-lg text-yellow-500 font-semibold">Yellow</span>
                                <span className="text-sm text-on-surface-variant">#EAB308</span>
                            </div>
                            <p className="text-sm text-on-surface-variant mb-2">Warnings and medium severity indicators. Pending states.</p>
                            <div className="flex flex-wrap gap-2">
                                <span className="px-2.5 py-1 text-xs rounded-md bg-yellow-500/10 text-yellow-600 font-medium">Medium Severity</span>
                                <span className="px-2.5 py-1 text-xs rounded-md bg-yellow-500/10 text-yellow-600 font-medium">Warnings</span>
                                <span className="px-2.5 py-1 text-xs rounded-md bg-yellow-500/10 text-yellow-600 font-medium">Pending</span>
                                <span className="px-2.5 py-1 text-xs rounded-md bg-yellow-500/10 text-yellow-600 font-medium">Review Needed</span>
                            </div>
                        </div>
                    </div>

                    {/* Emerald */}
                    <div className="flex items-center gap-5 p-5 bg-surface-container rounded-2xl border border-outline-variant/20">
                        <div className="w-16 h-16 rounded-xl shadow-md flex-shrink-0" style={{ backgroundColor: '#10B981' }}></div>
                        <div className="flex-1">
                            <div className="flex items-baseline gap-3 mb-1">
                                <h4 className="text-xl font-bold text-on-surface">Mitigation</h4>
                                <span className="text-lg text-emerald-500 font-semibold">Emerald</span>
                                <span className="text-sm text-on-surface-variant">#10B981</span>
                            </div>
                            <p className="text-sm text-on-surface-variant mb-2">Mitigation controls and defensive measures. M#### identifiers.</p>
                            <div className="flex flex-wrap gap-2">
                                <span className="px-2.5 py-1 text-xs rounded-md bg-emerald-500/10 text-emerald-500 font-medium">Mitigations (M####)</span>
                                <span className="px-2.5 py-1 text-xs rounded-md bg-emerald-500/10 text-emerald-500 font-medium">Controls</span>
                                <span className="px-2.5 py-1 text-xs rounded-md bg-emerald-500/10 text-emerald-500 font-medium">Defenses</span>
                                <span className="px-2.5 py-1 text-xs rounded-md bg-emerald-500/10 text-emerald-500 font-medium">Countermeasures</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Color Usage Reference Table */}
                <div className="mt-12 mb-6">
                    <h3 className="text-lg font-bold text-on-surface mb-4">Quick Reference: Entity Color Mapping</h3>
                    <div className="overflow-hidden rounded-xl border border-outline-variant/30">
                        <table className="w-full text-sm">
                            <thead className="bg-surface-container-high">
                                <tr>
                                    <th className="text-left px-4 py-3 font-semibold text-on-surface">Entity Type</th>
                                    <th className="text-left px-4 py-3 font-semibold text-on-surface">ID Pattern</th>
                                    <th className="text-left px-4 py-3 font-semibold text-on-surface">Color</th>
                                    <th className="text-left px-4 py-3 font-semibold text-on-surface">Hex</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-outline-variant/20">
                                <tr>
                                    <td className="px-4 py-2.5">Tactic</td>
                                    <td className="px-4 py-2.5 font-mono text-xs">TA####</td>
                                    <td className="px-4 py-2.5"><span className="inline-flex items-center gap-2"><span className="w-3 h-3 rounded bg-[#783264]"></span>Magenta</span></td>
                                    <td className="px-4 py-2.5 font-mono text-xs">#783264</td>
                                </tr>
                                <tr>
                                    <td className="px-4 py-2.5">Technique</td>
                                    <td className="px-4 py-2.5 font-mono text-xs">T####</td>
                                    <td className="px-4 py-2.5"><span className="inline-flex items-center gap-2"><span className="w-3 h-3 rounded bg-purple-500"></span>Purple</span></td>
                                    <td className="px-4 py-2.5 font-mono text-xs">#8B5CF6</td>
                                </tr>
                                <tr>
                                    <td className="px-4 py-2.5">Threat Group</td>
                                    <td className="px-4 py-2.5 font-mono text-xs">G####</td>
                                    <td className="px-4 py-2.5"><span className="inline-flex items-center gap-2"><span className="w-3 h-3 rounded bg-[#A63D40]"></span>Brick Red</span></td>
                                    <td className="px-4 py-2.5 font-mono text-xs">#A63D40</td>
                                </tr>
                                <tr>
                                    <td className="px-4 py-2.5">Software</td>
                                    <td className="px-4 py-2.5 font-mono text-xs">S####</td>
                                    <td className="px-4 py-2.5"><span className="inline-flex items-center gap-2"><span className="w-3 h-3 rounded bg-orange-500"></span>Orange</span></td>
                                    <td className="px-4 py-2.5 font-mono text-xs">#F97316</td>
                                </tr>
                                <tr>
                                    <td className="px-4 py-2.5">Campaign</td>
                                    <td className="px-4 py-2.5 font-mono text-xs">C####</td>
                                    <td className="px-4 py-2.5"><span className="inline-flex items-center gap-2"><span className="w-3 h-3 rounded bg-[#0284C7]"></span>Sky Blue</span></td>
                                    <td className="px-4 py-2.5 font-mono text-xs">#0284C7</td>
                                </tr>
                                <tr>
                                    <td className="px-4 py-2.5">Mitigation</td>
                                    <td className="px-4 py-2.5 font-mono text-xs">M####</td>
                                    <td className="px-4 py-2.5"><span className="inline-flex items-center gap-2"><span className="w-3 h-3 rounded bg-emerald-500"></span>Emerald</span></td>
                                    <td className="px-4 py-2.5 font-mono text-xs">#10B981</td>
                                </tr>
                                <tr>
                                    <td className="px-4 py-2.5">Data Source</td>
                                    <td className="px-4 py-2.5 font-mono text-xs">DS####</td>
                                    <td className="px-4 py-2.5"><span className="inline-flex items-center gap-2"><span className="w-3 h-3 rounded bg-[#4D7C6F]"></span>Sage Green</span></td>
                                    <td className="px-4 py-2.5 font-mono text-xs">#4D7C6F</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Severity Color Scale */}
                <div className="mt-8">
                    <h3 className="text-lg font-bold text-on-surface mb-4">Severity Color Scale</h3>
                    <div className="flex gap-2">
                        <div className="flex-1 h-16 rounded-xl flex items-center justify-center" style={{ backgroundColor: '#A63D40' }}>
                            <span className="text-white text-sm font-bold">Critical</span>
                        </div>
                        <div className="flex-1 h-16 rounded-xl flex items-center justify-center" style={{ backgroundColor: '#F97316' }}>
                            <span className="text-white text-sm font-bold">High</span>
                        </div>
                        <div className="flex-1 h-16 rounded-xl flex items-center justify-center" style={{ backgroundColor: '#EAB308' }}>
                            <span className="text-black/80 text-sm font-bold">Medium</span>
                        </div>
                        <div className="flex-1 h-16 rounded-xl flex items-center justify-center" style={{ backgroundColor: '#4D7C6F' }}>
                            <span className="text-white text-sm font-bold">Low</span>
                        </div>
                        <div className="flex-1 h-16 rounded-xl flex items-center justify-center bg-surface-container-highest">
                            <span className="text-on-surface-variant text-sm font-bold">Info</span>
                        </div>
                    </div>
                </div>

            </Section>
        </DesignSystemPage>
    );
};

export default ColorsPage;
