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
                    <div className="w-28 h-28 rounded-2xl shadow-lg flex flex-col items-center justify-center" style={{ backgroundColor: '#4D7C6F' }}>
                        <span className="text-white text-sm font-bold">#4D7C6F</span>
                        <span className="text-white/70 text-[10px] mt-1">Sage</span>
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

                    {/* Sage */}
                    <div className="flex items-center gap-5 p-5 bg-surface-container rounded-2xl border border-outline-variant/20">
                        <div className="w-16 h-16 rounded-xl shadow-md flex-shrink-0" style={{ backgroundColor: '#4D7C6F' }}></div>
                        <div className="flex-1">
                            <div className="flex items-baseline gap-3 mb-1">
                                <h4 className="text-xl font-bold text-on-surface">Mitigation</h4>
                                <span className="text-lg text-emerald-500 font-semibold">Sage</span>
                                <span className="text-sm text-on-surface-variant">#4D7C6F</span>
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
                                    <td className="px-4 py-2.5"><span className="inline-flex items-center gap-2"><span className="w-3 h-3 rounded bg-emerald-500"></span>Sage</span></td>
                                    <td className="px-4 py-2.5 font-mono text-xs">#4D7C6F</td>
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

            {/* ════════════════════════════════════════════════
                ACTION PLAN PAGE — COLOR TOKEN EXTRACTION
                ════════════════════════════════════════════════ */}
            <Section title="Action Plan Page — Color Tokens" description="All color tokens extracted from the /action-plan page and its sub-components (DetectionActionPlan, DetectionActionQueue, ThreatGroupCards, CriticalGapsList, TacticCoverageHeatmap, MiniMitreMatrix, SiemReadinessBar).">

                {/* ── Extended Palette (ext-* tokens) ── */}
                <div className="mb-8">
                    <h3 className="text-lg font-bold text-on-surface mb-2">Extended Palette (ext-* tokens)</h3>
                    <p className="text-sm text-on-surface-variant mb-4">
                        These are the custom extended-color CSS variables defined via <code className="text-xs px-1 py-0.5 rounded bg-surface-container-high font-mono">--md-ext-color-*</code>.
                        They adapt between light and dark themes. Shown here in their current theme value.
                    </p>

                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                        {/* Teal — primary accent across the entire page */}
                        <div className="rounded-xl overflow-hidden border border-outline-variant/20">
                            <div className="h-20 flex items-center justify-center" style={{ backgroundColor: 'rgb(var(--md-ext-color-teal))' }}>
                                <span style={{ color: 'rgb(var(--md-ext-color-on-teal))' }} className="text-sm font-bold">ext-teal</span>
                            </div>
                            <div className="p-3 bg-surface-container">
                                <div className="text-[11px] font-bold text-on-surface">Teal</div>
                                <div className="text-[10px] font-mono text-on-surface-variant">--md-ext-color-teal</div>
                                <div className="text-[9px] text-outline mt-1">Light: 0 104 119 · Dark: 131 210 228</div>
                                <div className="flex flex-wrap gap-1 mt-2">
                                    <span className="px-1.5 py-0.5 text-[8px] rounded bg-ext-teal/10 text-ext-teal font-medium">Hero ring</span>
                                    <span className="px-1.5 py-0.5 text-[8px] rounded bg-ext-teal/10 text-ext-teal font-medium">Coverage bars</span>
                                    <span className="px-1.5 py-0.5 text-[8px] rounded bg-ext-teal/10 text-ext-teal font-medium">CTA buttons</span>
                                    <span className="px-1.5 py-0.5 text-[8px] rounded bg-ext-teal/10 text-ext-teal font-medium">Links</span>
                                    <span className="px-1.5 py-0.5 text-[8px] rounded bg-ext-teal/10 text-ext-teal font-medium">SIEM bars</span>
                                    <span className="px-1.5 py-0.5 text-[8px] rounded bg-ext-teal/10 text-ext-teal font-medium">Heatmap cells</span>
                                </div>
                            </div>
                        </div>

                        {/* Coral — gaps, critical risk, uncovered techniques */}
                        <div className="rounded-xl overflow-hidden border border-outline-variant/20">
                            <div className="h-20 flex items-center justify-center" style={{ backgroundColor: 'rgb(var(--md-ext-color-coral))' }}>
                                <span style={{ color: 'rgb(var(--md-ext-color-on-coral))' }} className="text-sm font-bold">ext-coral</span>
                            </div>
                            <div className="p-3 bg-surface-container">
                                <div className="text-[11px] font-bold text-on-surface">Coral</div>
                                <div className="text-[10px] font-mono text-on-surface-variant">--md-ext-color-coral</div>
                                <div className="text-[9px] text-outline mt-1">Light: 144 75 63 · Dark: 255 180 167</div>
                                <div className="flex flex-wrap gap-1 mt-2">
                                    <span className="px-1.5 py-0.5 text-[8px] rounded bg-ext-coral/10 text-ext-coral font-medium">Coverage gaps</span>
                                    <span className="px-1.5 py-0.5 text-[8px] rounded bg-ext-coral/10 text-ext-coral font-medium">Critical severity</span>
                                    <span className="px-1.5 py-0.5 text-[8px] rounded bg-ext-coral/10 text-ext-coral font-medium">Gap heat bg</span>
                                    <span className="px-1.5 py-0.5 text-[8px] rounded bg-ext-coral/10 text-ext-coral font-medium">Quality F grade</span>
                                    <span className="px-1.5 py-0.5 text-[8px] rounded bg-ext-coral/10 text-ext-coral font-medium">HIGH RISK badge</span>
                                </div>
                            </div>
                        </div>

                        {/* Amber — warnings, medium risk, crown jewel indicator */}
                        <div className="rounded-xl overflow-hidden border border-outline-variant/20">
                            <div className="h-20 flex items-center justify-center" style={{ backgroundColor: 'rgb(var(--md-ext-color-amber))' }}>
                                <span style={{ color: 'rgb(var(--md-ext-color-on-amber))' }} className="text-sm font-bold">ext-amber</span>
                            </div>
                            <div className="p-3 bg-surface-container">
                                <div className="text-[11px] font-bold text-on-surface">Amber</div>
                                <div className="text-[10px] font-mono text-on-surface-variant">--md-ext-color-amber</div>
                                <div className="text-[9px] text-outline mt-1">Light: 113 92 12 · Dark: 225 196 109</div>
                                <div className="flex flex-wrap gap-1 mt-2">
                                    <span className="px-1.5 py-0.5 text-[8px] rounded bg-ext-amber/10 text-ext-amber font-medium">Quality warnings</span>
                                    <span className="px-1.5 py-0.5 text-[8px] rounded bg-ext-amber/10 text-ext-amber font-medium">Medium severity</span>
                                    <span className="px-1.5 py-0.5 text-[8px] rounded bg-ext-amber/10 text-ext-amber font-medium">Crown jewel icon</span>
                                    <span className="px-1.5 py-0.5 text-[8px] rounded bg-ext-amber/10 text-ext-amber font-medium">MEDIUM risk badge</span>
                                    <span className="px-1.5 py-0.5 text-[8px] rounded bg-ext-amber/10 text-ext-amber font-medium">C grade quality</span>
                                </div>
                            </div>
                        </div>

                        {/* Green — success, "After Week 1" section, covered badges */}
                        <div className="rounded-xl overflow-hidden border border-outline-variant/20">
                            <div className="h-20 flex items-center justify-center" style={{ backgroundColor: 'rgb(var(--md-ext-color-green))' }}>
                                <span style={{ color: 'rgb(var(--md-ext-color-on-green))' }} className="text-sm font-bold">ext-green</span>
                            </div>
                            <div className="p-3 bg-surface-container">
                                <div className="text-[11px] font-bold text-on-surface">Green</div>
                                <div className="text-[10px] font-mono text-on-surface-variant">--md-ext-color-green</div>
                                <div className="text-[9px] text-outline mt-1">Light: 65 104 53 · Dark: 166 211 149</div>
                                <div className="flex flex-wrap gap-1 mt-2">
                                    <span className="px-1.5 py-0.5 text-[8px] rounded bg-ext-green/10 text-ext-green font-medium">Week 1 impact</span>
                                    <span className="px-1.5 py-0.5 text-[8px] rounded bg-ext-green/10 text-ext-green font-medium">Covered badge</span>
                                    <span className="px-1.5 py-0.5 text-[8px] rounded bg-ext-green/10 text-ext-green font-medium">Validated check</span>
                                    <span className="px-1.5 py-0.5 text-[8px] rounded bg-ext-green/10 text-ext-green font-medium">Quality A grade</span>
                                </div>
                            </div>
                        </div>

                        {/* Rose — threat group count accent */}
                        <div className="rounded-xl overflow-hidden border border-outline-variant/20">
                            <div className="h-20 flex items-center justify-center" style={{ backgroundColor: 'rgb(var(--md-ext-color-rose))' }}>
                                <span style={{ color: 'rgb(var(--md-ext-color-on-rose))' }} className="text-sm font-bold">ext-rose</span>
                            </div>
                            <div className="p-3 bg-surface-container">
                                <div className="text-[11px] font-bold text-on-surface">Rose</div>
                                <div className="text-[10px] font-mono text-on-surface-variant">--md-ext-color-rose</div>
                                <div className="text-[9px] text-outline mt-1">Light: 139 74 98 · Dark: 255 176 202</div>
                                <div className="flex flex-wrap gap-1 mt-2">
                                    <span className="px-1.5 py-0.5 text-[8px] rounded bg-ext-rose/10 text-ext-rose font-medium">Threat group count</span>
                                    <span className="px-1.5 py-0.5 text-[8px] rounded bg-ext-rose/10 text-ext-rose font-medium">Group names in queue</span>
                                </div>
                            </div>
                        </div>

                        {/* Orange — high severity text */}
                        <div className="rounded-xl overflow-hidden border border-outline-variant/20">
                            <div className="h-20 flex items-center justify-center" style={{ backgroundColor: 'rgb(var(--md-ext-color-orange))' }}>
                                <span style={{ color: 'rgb(var(--md-ext-color-on-orange))' }} className="text-sm font-bold">ext-orange</span>
                            </div>
                            <div className="p-3 bg-surface-container">
                                <div className="text-[11px] font-bold text-on-surface">Orange</div>
                                <div className="text-[10px] font-mono text-on-surface-variant">--md-ext-color-orange</div>
                                <div className="text-[9px] text-outline mt-1">Light: 141 78 43 · Dark: 255 182 146</div>
                                <div className="flex flex-wrap gap-1 mt-2">
                                    <span className="px-1.5 py-0.5 text-[8px] rounded bg-ext-orange/10 text-ext-orange font-medium">High severity text</span>
                                    <span className="px-1.5 py-0.5 text-[8px] rounded bg-ext-orange/10 text-ext-orange font-medium">Quality D grade</span>
                                </div>
                            </div>
                        </div>

                        {/* Indigo — Sigma language indicator */}
                        <div className="rounded-xl overflow-hidden border border-outline-variant/20">
                            <div className="h-20 flex items-center justify-center" style={{ backgroundColor: 'rgb(var(--md-ext-color-indigo))' }}>
                                <span style={{ color: 'rgb(var(--md-ext-color-on-indigo))' }} className="text-sm font-bold">ext-indigo</span>
                            </div>
                            <div className="p-3 bg-surface-container">
                                <div className="text-[11px] font-bold text-on-surface">Indigo</div>
                                <div className="text-[10px] font-mono text-on-surface-variant">--md-ext-color-indigo</div>
                                <div className="text-[9px] text-outline mt-1">Light: 92 88 145 · Dark: 197 192 255</div>
                                <div className="flex flex-wrap gap-1 mt-2">
                                    <span className="px-1.5 py-0.5 text-[8px] rounded bg-ext-indigo/10 text-ext-indigo font-medium">Sigma language</span>
                                    <span className="px-1.5 py-0.5 text-[8px] rounded bg-ext-indigo/10 text-ext-indigo font-medium">Convertible count</span>
                                </div>
                            </div>
                        </div>

                        {/* Blue — low severity text */}
                        <div className="rounded-xl overflow-hidden border border-outline-variant/20">
                            <div className="h-20 flex items-center justify-center" style={{ backgroundColor: 'rgb(var(--md-ext-color-blue))' }}>
                                <span style={{ color: 'rgb(var(--md-ext-color-on-blue))' }} className="text-sm font-bold">ext-blue</span>
                            </div>
                            <div className="p-3 bg-surface-container">
                                <div className="text-[11px] font-bold text-on-surface">Blue</div>
                                <div className="text-[10px] font-mono text-on-surface-variant">--md-ext-color-blue</div>
                                <div className="text-[9px] text-outline mt-1">Light: 46 98 140 · Dark: 154 203 250</div>
                                <div className="flex flex-wrap gap-1 mt-2">
                                    <span className="px-1.5 py-0.5 text-[8px] rounded bg-ext-blue/10 text-ext-blue font-medium">Low severity text</span>
                                </div>
                            </div>
                        </div>

                        {/* Cyan — gradient partner for CTA */}
                        <div className="rounded-xl overflow-hidden border border-outline-variant/20">
                            <div className="h-20 flex items-center justify-center" style={{ backgroundColor: 'rgb(var(--md-ext-color-cyan))' }}>
                                <span style={{ color: 'rgb(var(--md-ext-color-on-cyan))' }} className="text-sm font-bold">ext-cyan</span>
                            </div>
                            <div className="p-3 bg-surface-container">
                                <div className="text-[11px] font-bold text-on-surface">Cyan</div>
                                <div className="text-[10px] font-mono text-on-surface-variant">--md-ext-color-cyan</div>
                                <div className="text-[9px] text-outline mt-1">Light: 25 101 132 · Dark: 142 207 242</div>
                                <div className="flex flex-wrap gap-1 mt-2">
                                    <span className="px-1.5 py-0.5 text-[8px] rounded bg-ext-cyan/10 text-ext-cyan font-medium">CTA gradient end</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* ── System Surface & Text Tokens ── */}
                <div className="mb-8">
                    <h3 className="text-lg font-bold text-on-surface mb-2">System Surface & Text Tokens</h3>
                    <p className="text-sm text-on-surface-variant mb-4">
                        M3 system tokens used for backgrounds, text, and structural UI via <code className="text-xs px-1 py-0.5 rounded bg-surface-container-high font-mono">--md-sys-color-*</code>.
                    </p>

                    <div className="overflow-hidden rounded-xl border border-outline-variant/30">
                        <table className="w-full text-sm">
                            <thead className="bg-surface-container-high">
                                <tr>
                                    <th className="text-left px-4 py-3 font-semibold text-on-surface">Token</th>
                                    <th className="text-left px-4 py-3 font-semibold text-on-surface">Swatch</th>
                                    <th className="text-left px-4 py-3 font-semibold text-on-surface">CSS Variable</th>
                                    <th className="text-left px-4 py-3 font-semibold text-on-surface">Light Hex</th>
                                    <th className="text-left px-4 py-3 font-semibold text-on-surface">Dark Hex</th>
                                    <th className="text-left px-4 py-3 font-semibold text-on-surface">Usage on Action Plan</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-outline-variant/20">
                                <tr>
                                    <td className="px-4 py-2.5 font-medium">background</td>
                                    <td className="px-4 py-2.5"><span className="inline-block w-6 h-6 rounded border border-outline-variant/30 bg-background"></span></td>
                                    <td className="px-4 py-2.5 font-mono text-xs">--md-sys-color-background</td>
                                    <td className="px-4 py-2.5 font-mono text-xs">#ECECEF</td>
                                    <td className="px-4 py-2.5 font-mono text-xs">#08080A</td>
                                    <td className="px-4 py-2.5 text-xs text-on-surface-variant">Page background</td>
                                </tr>
                                <tr>
                                    <td className="px-4 py-2.5 font-medium">surface-container-lowest</td>
                                    <td className="px-4 py-2.5"><span className="inline-block w-6 h-6 rounded border border-outline-variant/30 bg-surface-container-lowest"></span></td>
                                    <td className="px-4 py-2.5 font-mono text-xs">--md-sys-color-surface-container-lowest</td>
                                    <td className="px-4 py-2.5 font-mono text-xs">#F2F2F5</td>
                                    <td className="px-4 py-2.5 font-mono text-xs">#040405</td>
                                    <td className="px-4 py-2.5 text-xs text-on-surface-variant">Subtlest elevation (closest to page bg)</td>
                                </tr>
                                <tr>
                                    <td className="px-4 py-2.5 font-medium">surface-container-low</td>
                                    <td className="px-4 py-2.5"><span className="inline-block w-6 h-6 rounded border border-outline-variant/30 bg-surface-container-low"></span></td>
                                    <td className="px-4 py-2.5 font-mono text-xs">--md-sys-color-surface-container-low</td>
                                    <td className="px-4 py-2.5 font-mono text-xs">#F6F6F9</td>
                                    <td className="px-4 py-2.5 font-mono text-xs">#0B0B0D</td>
                                    <td className="px-4 py-2.5 text-xs text-on-surface-variant">Low elevation (sidebar, secondary panels)</td>
                                </tr>
                                <tr>
                                    <td className="px-4 py-2.5 font-medium">surface-container</td>
                                    <td className="px-4 py-2.5"><span className="inline-block w-6 h-6 rounded border border-outline-variant/30 bg-surface-container"></span></td>
                                    <td className="px-4 py-2.5 font-mono text-xs">--md-sys-color-surface-container</td>
                                    <td className="px-4 py-2.5 font-mono text-xs">#FAFAFC</td>
                                    <td className="px-4 py-2.5 font-mono text-xs">#121214</td>
                                    <td className="px-4 py-2.5 text-xs text-on-surface-variant">Metrics bar, progress bar track, code blocks, SIEM bar track</td>
                                </tr>
                                <tr>
                                    <td className="px-4 py-2.5 font-medium">surface-container-high</td>
                                    <td className="px-4 py-2.5"><span className="inline-block w-6 h-6 rounded border border-outline-variant/30 bg-surface-container-high"></span></td>
                                    <td className="px-4 py-2.5 font-mono text-xs">--md-sys-color-surface-container-high</td>
                                    <td className="px-4 py-2.5 font-mono text-xs">#FDFDFF</td>
                                    <td className="px-4 py-2.5 font-mono text-xs">#1A1A1D</td>
                                    <td className="px-4 py-2.5 text-xs text-on-surface-variant">Hero funnel bg, card panels, priority queue, gaps list, heatmap, SIEM panel</td>
                                </tr>
                                <tr>
                                    <td className="px-4 py-2.5 font-medium">surface-container-highest</td>
                                    <td className="px-4 py-2.5"><span className="inline-block w-6 h-6 rounded border border-outline-variant/30 bg-surface-container-highest"></span></td>
                                    <td className="px-4 py-2.5 font-mono text-xs">--md-sys-color-surface-container-highest</td>
                                    <td className="px-4 py-2.5 font-mono text-xs">#FFFFFF</td>
                                    <td className="px-4 py-2.5 font-mono text-xs">#232326</td>
                                    <td className="px-4 py-2.5 text-xs text-on-surface-variant">Active sort button, expanded group bg, hover states</td>
                                </tr>
                                <tr>
                                    <td className="px-4 py-2.5 font-medium">on-surface</td>
                                    <td className="px-4 py-2.5"><span className="inline-block w-6 h-6 rounded border border-outline-variant/30 bg-on-surface"></span></td>
                                    <td className="px-4 py-2.5 font-mono text-xs">--md-sys-color-on-surface</td>
                                    <td className="px-4 py-2.5 font-mono text-xs">#18181A</td>
                                    <td className="px-4 py-2.5 font-mono text-xs">#E6E6E8</td>
                                    <td className="px-4 py-2.5 text-xs text-on-surface-variant">Headings, detection names, counts, technique coverage</td>
                                </tr>
                                <tr>
                                    <td className="px-4 py-2.5 font-medium">on-surface-variant</td>
                                    <td className="px-4 py-2.5"><span className="inline-block w-6 h-6 rounded border border-outline-variant/30 bg-on-surface-variant"></span></td>
                                    <td className="px-4 py-2.5 font-mono text-xs">--md-sys-color-on-surface-variant</td>
                                    <td className="px-4 py-2.5 font-mono text-xs">#444448</td>
                                    <td className="px-4 py-2.5 font-mono text-xs">#BEBEC3</td>
                                    <td className="px-4 py-2.5 text-xs text-on-surface-variant">Secondary labels, descriptions, profile tags, edit button</td>
                                </tr>
                                <tr>
                                    <td className="px-4 py-2.5 font-medium">outline</td>
                                    <td className="px-4 py-2.5"><span className="inline-block w-6 h-6 rounded border border-outline-variant/30 bg-outline"></span></td>
                                    <td className="px-4 py-2.5 font-mono text-xs">--md-sys-color-outline</td>
                                    <td className="px-4 py-2.5 font-mono text-xs">#6E6E73</td>
                                    <td className="px-4 py-2.5 font-mono text-xs">#828287</td>
                                    <td className="px-4 py-2.5 text-xs text-on-surface-variant">Tertiary labels ("In Library"), table headers, arrows, "No steps" text</td>
                                </tr>
                                <tr>
                                    <td className="px-4 py-2.5 font-medium">outline-variant</td>
                                    <td className="px-4 py-2.5"><span className="inline-block w-6 h-6 rounded border border-outline-variant/30 bg-outline-variant"></span></td>
                                    <td className="px-4 py-2.5 font-mono text-xs">--md-sys-color-outline-variant</td>
                                    <td className="px-4 py-2.5 font-mono text-xs">#C8C8CD</td>
                                    <td className="px-4 py-2.5 font-mono text-xs">#323237</td>
                                    <td className="px-4 py-2.5 text-xs text-on-surface-variant">Table borders, dividers, edit button border, checkbox borders</td>
                                </tr>
                                <tr>
                                    <td className="px-4 py-2.5 font-medium">primary</td>
                                    <td className="px-4 py-2.5"><span className="inline-block w-6 h-6 rounded border border-outline-variant/30 bg-primary"></span></td>
                                    <td className="px-4 py-2.5 font-mono text-xs">--md-sys-color-primary</td>
                                    <td className="px-4 py-2.5 font-mono text-xs">#783264</td>
                                    <td className="px-4 py-2.5 font-mono text-xs">#783264</td>
                                    <td className="px-4 py-2.5 text-xs text-on-surface-variant">Progress bar fill, "Create" button in gaps, batch action bar, expanded ring highlight</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* ── Semantic Usage: Severity Mapping ── */}
                <div className="mb-8">
                    <h3 className="text-lg font-bold text-on-surface mb-2">Severity Color Mapping (Action Plan)</h3>
                    <p className="text-sm text-on-surface-variant mb-4">
                        How the DetectionActionQueue maps severity levels to ext-* color tokens.
                    </p>
                    <div className="flex gap-2">
                        <div className="flex-1 h-14 rounded-xl flex flex-col items-center justify-center" style={{ backgroundColor: 'rgb(var(--md-ext-color-coral) / 0.15)' }}>
                            <span className="text-ext-coral text-sm font-bold">Critical</span>
                            <span className="text-[9px] text-on-surface-variant mt-0.5">text-ext-coral</span>
                        </div>
                        <div className="flex-1 h-14 rounded-xl flex flex-col items-center justify-center" style={{ backgroundColor: 'rgb(var(--md-ext-color-orange) / 0.15)' }}>
                            <span className="text-ext-orange text-sm font-bold">High</span>
                            <span className="text-[9px] text-on-surface-variant mt-0.5">text-ext-orange</span>
                        </div>
                        <div className="flex-1 h-14 rounded-xl flex flex-col items-center justify-center" style={{ backgroundColor: 'rgb(var(--md-ext-color-amber) / 0.15)' }}>
                            <span className="text-ext-amber text-sm font-bold">Medium</span>
                            <span className="text-[9px] text-on-surface-variant mt-0.5">text-ext-amber</span>
                        </div>
                        <div className="flex-1 h-14 rounded-xl flex flex-col items-center justify-center" style={{ backgroundColor: 'rgb(var(--md-ext-color-blue) / 0.15)' }}>
                            <span className="text-ext-blue text-sm font-bold">Low</span>
                            <span className="text-[9px] text-on-surface-variant mt-0.5">text-ext-blue</span>
                        </div>
                    </div>
                </div>

                {/* ── Quality Grade Colors ── */}
                <div className="mb-8">
                    <h3 className="text-lg font-bold text-on-surface mb-2">Quality Grade Colors (Action Plan)</h3>
                    <p className="text-sm text-on-surface-variant mb-4">
                        Circle badges in the priority queue use grade-specific border and text colors.
                    </p>
                    <div className="flex gap-3">
                        {[
                            { grade: 'A', border: 'border-ext-green/60', text: 'text-ext-green', label: 'ext-green' },
                            { grade: 'B', border: 'border-ext-teal/60', text: 'text-ext-teal', label: 'ext-teal' },
                            { grade: 'C', border: 'border-ext-amber/60', text: 'text-ext-amber', label: 'ext-amber' },
                            { grade: 'D', border: 'border-ext-orange/60', text: 'text-ext-orange', label: 'ext-orange' },
                            { grade: 'F', border: 'border-ext-coral/60', text: 'text-ext-coral', label: 'ext-coral' },
                        ].map(({ grade, border, text, label }) => (
                            <div key={grade} className="flex flex-col items-center gap-2">
                                <span className={`w-10 h-10 rounded-full border-2 flex items-center justify-center text-sm font-bold ${border} ${text}`}>
                                    {grade}
                                </span>
                                <span className="text-[9px] text-on-surface-variant">{label}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* ── Risk Level Badges ── */}
                <div className="mb-8">
                    <h3 className="text-lg font-bold text-on-surface mb-2">Risk Level Badges (Threat Group Cards)</h3>
                    <p className="text-sm text-on-surface-variant mb-4">
                        Coverage-percentage-based risk labels and progress bar colors used in ThreatGroupCards.
                    </p>
                    <div className="flex gap-4 items-center">
                        <div className="flex flex-col items-center gap-1.5">
                            <span className="text-[8px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-ext-coral/15 text-ext-coral">HIGH RISK</span>
                            <span className="text-[9px] text-on-surface-variant">&lt;50% coverage</span>
                            <div className="w-20 h-1.5 rounded-full bg-surface-container overflow-hidden">
                                <div className="h-full rounded-full bg-ext-coral" style={{ width: '30%' }} />
                            </div>
                        </div>
                        <div className="flex flex-col items-center gap-1.5">
                            <span className="text-[8px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-ext-amber/15 text-ext-amber">MEDIUM</span>
                            <span className="text-[9px] text-on-surface-variant">50–79% coverage</span>
                            <div className="w-20 h-1.5 rounded-full bg-surface-container overflow-hidden">
                                <div className="h-full rounded-full bg-ext-amber" style={{ width: '65%' }} />
                            </div>
                        </div>
                        <div className="flex flex-col items-center gap-1.5">
                            <span className="text-[8px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-ext-teal/15 text-ext-teal">COVERED</span>
                            <span className="text-[9px] text-on-surface-variant">&ge;80% coverage</span>
                            <div className="w-20 h-1.5 rounded-full bg-surface-container overflow-hidden">
                                <div className="h-full rounded-full bg-ext-teal" style={{ width: '90%' }} />
                            </div>
                        </div>
                    </div>
                </div>

                {/* ── Coverage Dot & Matrix Colors ── */}
                <div className="mb-8">
                    <h3 className="text-lg font-bold text-on-surface mb-2">Matrix & Coverage Indicators</h3>
                    <p className="text-sm text-on-surface-variant mb-4">
                        Mini dots, heatmap cells, and progress bars in the MITRE matrix and technique lists.
                    </p>
                    <div className="flex gap-6 items-start">
                        {/* Coverage dots */}
                        <div className="flex flex-col items-center gap-2">
                            <div className="flex items-center gap-3">
                                <div className="flex items-center gap-1.5">
                                    <div className="w-3 h-3 rounded-full bg-ext-teal" />
                                    <span className="text-[10px] text-on-surface-variant">Covered</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <div className="w-3 h-3 rounded-full bg-ext-coral" />
                                    <span className="text-[10px] text-on-surface-variant">Gap</span>
                                </div>
                            </div>
                            <span className="text-[9px] text-outline">Used in: TechniqueList, ExpandedTacticPanel</span>
                        </div>
                        {/* Mini matrix cells */}
                        <div className="flex flex-col items-center gap-2">
                            <div className="flex items-center gap-3">
                                <div className="flex items-center gap-1.5">
                                    <div className="w-3 h-3 rounded-[2px]" style={{ backgroundColor: 'rgb(var(--md-ext-color-teal) / 0.7)' }} />
                                    <span className="text-[10px] text-on-surface-variant">Covered cell</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <div className="w-3 h-3 rounded-[2px]" style={{ backgroundColor: 'rgb(var(--md-ext-color-coral) / 0.5)' }} />
                                    <span className="text-[10px] text-on-surface-variant">Gap cell</span>
                                </div>
                            </div>
                            <span className="text-[9px] text-outline">Used in: MiniMitreMatrix technique blocks</span>
                        </div>
                        {/* Heatmap opacity scale */}
                        <div className="flex flex-col items-center gap-2">
                            <div className="flex gap-0.5">
                                {[0.1, 0.2, 0.3, 0.4, 0.5].map((a) => (
                                    <div key={a} className="w-5 h-5 rounded" style={{ backgroundColor: `rgb(var(--md-ext-color-teal) / ${a})` }} />
                                ))}
                            </div>
                            <span className="text-[9px] text-outline">Heatmap intensity scale (TacticCoverageHeatmap)</span>
                        </div>
                    </div>
                </div>

                {/* ── CTA Gradient ── */}
                <div>
                    <h3 className="text-lg font-bold text-on-surface mb-2">CTA Button Gradient</h3>
                    <p className="text-sm text-on-surface-variant mb-4">
                        The "Add All to Backlog" button uses a teal→cyan 135deg gradient.
                    </p>
                    <div className="flex items-center gap-4">
                        <button
                            className="py-2.5 px-8 rounded-lg font-bold text-[11px] tracking-wide uppercase"
                            style={{
                                background: 'linear-gradient(135deg, rgb(var(--md-ext-color-teal)), rgb(var(--md-ext-color-cyan)))',
                                color: 'rgb(var(--md-ext-color-on-teal))',
                            }}
                        >
                            Add All to Backlog
                        </button>
                        <div className="text-[10px] text-on-surface-variant">
                            <code className="font-mono text-[9px] px-1.5 py-0.5 rounded bg-surface-container-high">
                                linear-gradient(135deg, ext-teal, ext-cyan)
                            </code>
                        </div>
                    </div>
                </div>

            </Section>
        </DesignSystemPage>
    );
};

export default ColorsPage;
