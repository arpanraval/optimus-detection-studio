import React, { useState } from 'react';
import { DesignSystemPage, Section, ComponentRow, CodeSnippet } from '../shared';
import { Icon } from '../../Icon';

export const NavigationPage: React.FC = () => {
    const [selectedComponents, setSelectedComponents] = useState<Set<string>>(new Set());

    const toggleSelection = (id: string) => {
        setSelectedComponents(prev => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    const sidebarCode = "// Sidebar.tsx structure\n<nav className=\"w-20 bg-[#0d0e10] flex flex-col\">\n  <NavRailItem icon=\"shield\" label=\"Library\" active />\n  <NavRailItem icon=\"folder\" label=\"Packs\" />\n</nav>\n<aside className=\"w-48 bg-[#0d0e10]\">\n  <DrawerContent />\n</aside>";
    const navRailCode = "/* M3 Navigation Rail CSS */\n.m3-nav-rail {\n  width: 80px;\n  transition: width 0.3s ease;\n}\n.m3-nav-rail:hover { width: 224px; }\n.m3-nav-rail-item {\n  border-radius: 9999px; /* rounded-full */\n  padding: 12px;\n}";
    const scrollbarCode = "/* Custom Scrollbar CSS */\n.custom-scrollbar::-webkit-scrollbar {\n  width: 6px;\n  height: 6px;\n}\n.custom-scrollbar::-webkit-scrollbar-track {\n  background: transparent;\n}\n.custom-scrollbar::-webkit-scrollbar-thumb {\n  background: rgba(255,255,255,0.1);\n  border-radius: 3px;\n}\n.custom-scrollbar::-webkit-scrollbar-thumb:hover {\n  background: rgba(255,255,255,0.2);\n}\n/* Firefox */\n.custom-scrollbar {\n  scrollbar-width: thin;\n  scrollbar-color: rgba(255,255,255,0.1) transparent;\n}";

    return (
        <DesignSystemPage
            title="Navigation"
            description="Sidebar, Navigation Rail, and scrollbar styles"
        >
            <Section title="Navigation Patterns" description="Sidebar, Navigation Rail, and scrollbar styles">

                {/* Detection Studio Sidebar */}
                <div className="mb-8">
                    <h3 className="text-sm font-semibold text-on-surface-variant mb-4 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-tertiary"></span>
                        Detection Studio - Navigation Rail (Current)
                    </h3>
                    <p className="text-xs text-on-surface-variant/70 mb-4">
                        80px rail with icon+label, 192px expandable drawer panel. Color-coded sections.
                    </p>

                    <div className="flex gap-4">
                        {/* Mini Nav Rail Preview */}
                        <div className="w-20 bg-[#0d0e10] rounded-xl overflow-hidden border border-outline-variant/20">
                            <div className="p-3 flex flex-col items-center gap-1">
                                {([
                                    { icon: 'dashboard', label: 'Dashboard', active: false },
                                    { icon: 'shield', label: 'Library', active: true },
                                    { icon: 'package', label: 'Packs', active: false },
                                    { icon: 'box', label: 'Workspaces', active: false },
                                ] as const).map(item => (
                                    <button
                                        key={item.label}
                                        className={`w-full py-2.5 px-1.5 rounded-xl flex flex-col items-center gap-1 transition-colors ${
                                            item.active
                                                ? 'bg-primary/15 text-primary'
                                                : 'text-on-surface-variant/70 hover:text-on-surface hover:bg-surface-container'
                                        }`}
                                    >
                                        <Icon name={item.icon} className="w-5 h-5" />
                                        <span className="text-[9px] font-medium">{item.label}</span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Expanded Drawer Preview */}
                        <div className="w-48 bg-[#0d0e10] rounded-xl overflow-hidden border border-outline-variant/20">
                            <div className="p-3 border-b border-outline-variant/10">
                                <p className="text-xs font-semibold text-primary">Library</p>
                            </div>
                            <div className="p-2 space-y-0.5">
                                {['All Detections', 'My Detections', 'Favorites', 'Recently Edited'].map((item, i) => (
                                    <button
                                        key={item}
                                        className={`w-full text-left px-3 py-2 text-[11px] rounded-lg transition-colors ${
                                            i === 0
                                                ? 'bg-primary/10 text-primary font-medium'
                                                : 'text-on-surface-variant/70 hover:text-on-surface hover:bg-surface-container-high'
                                        }`}
                                    >
                                        {item}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    <CodeSnippet code={sidebarCode} />
                </div>

                {/* SOC-Compass Navigation Rail */}
                <div className="mb-8">
                    <h3 className="text-sm font-semibold text-on-surface-variant mb-4 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                        SOC-Compass - M3 Navigation Rail (CSS-based)
                    </h3>
                    <p className="text-xs text-on-surface-variant/70 mb-4">
                        CSS class-based M3 navigation with auto-expand on hover. Simpler implementation.
                    </p>

                    <div className="flex gap-4">
                        <div className="w-20 hover:w-56 bg-surface-container-low rounded-xl border border-outline-variant/20 transition-all duration-300 overflow-hidden group">
                            <div className="p-2">
                                {([
                                    { icon: 'target', label: 'Incidents', badge: 3 },
                                    { icon: 'file-text', label: 'Reports', badge: 0 },
                                    { icon: 'users', label: 'Team', badge: 0 },
                                    { icon: 'settings', label: 'Settings', badge: 0 },
                                ] as const).map((item, i) => (
                                    <div
                                        key={item.label}
                                        className={`flex items-center gap-3 px-3 py-3 rounded-full transition-colors ${
                                            i === 0 ? 'bg-secondary-container text-on-secondary-container' : 'text-on-surface-variant hover:bg-surface-container-high'
                                        }`}
                                    >
                                        <Icon name={item.icon} className="w-5 h-5 flex-shrink-0" />
                                        <span className="text-sm font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity">
                                            {item.label}
                                        </span>
                                        {item.badge > 0 && (
                                            <span className="ml-auto text-[10px] font-bold bg-error text-on-error px-1.5 py-0.5 rounded-full opacity-0 group-hover:opacity-100">
                                                {item.badge}
                                            </span>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    <CodeSnippet code={navRailCode} />
                </div>

                {/* Scrollbar Patterns */}
                <div className="mb-8">
                    <h3 className="text-sm font-semibold text-on-surface-variant mb-4 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-green-500"></span>
                        Scrollbar Styles
                    </h3>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Default Custom Scrollbar */}
                        <div>
                            <p className="text-xs font-medium text-on-surface mb-2">Default Custom (.custom-scrollbar)</p>
                            <div className="h-32 bg-surface-container rounded-xl border border-outline-variant/20 overflow-auto custom-scrollbar p-3">
                                <div className="space-y-2">
                                    {Array.from({ length: 12 }).map((_, i) => (
                                        <div key={i} className="h-6 bg-surface-container-high rounded" />
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* AI Chat Scrollbar */}
                        <div>
                            <p className="text-xs font-medium text-on-surface mb-2">AI Chat Style (.ai-scroll)</p>
                            <div className="h-32 bg-surface-container rounded-xl border border-outline-variant/20 overflow-auto ai-scroll p-3">
                                <div className="space-y-2">
                                    {Array.from({ length: 12 }).map((_, i) => (
                                        <div key={i} className="h-6 bg-surface-container-high rounded" />
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>

                    <CodeSnippet code={scrollbarCode} />
                </div>

                {/* Breadcrumb */}
                <ComponentRow
                    id="nav-breadcrumb"
                    label="Breadcrumb Navigation"
                    description="Hierarchical path indicator"
                    source="detection-studio"
                    page="DetailPages"
                    isSelected={selectedComponents.has('nav-breadcrumb')}
                    onToggleSelect={toggleSelection}
                >
                    <nav className="flex items-center gap-1 text-sm">
                        <a href="#" className="text-on-surface-variant hover:text-on-surface transition-colors">Library</a>
                        <Icon name="chevron-right" className="w-4 h-4 text-on-surface-variant/50" />
                        <a href="#" className="text-on-surface-variant hover:text-on-surface transition-colors">Detections</a>
                        <Icon name="chevron-right" className="w-4 h-4 text-on-surface-variant/50" />
                        <span className="text-on-surface font-medium">Suspicious PowerShell</span>
                    </nav>
                </ComponentRow>

                {/* Page Header */}
                <ComponentRow
                    id="nav-page-header"
                    label="Page Header"
                    description="Standard page header with back button"
                    source="detection-studio"
                    page="DetailPages"
                    isSelected={selectedComponents.has('nav-page-header')}
                    onToggleSelect={toggleSelection}
                >
                    <div className="flex items-center gap-4">
                        <button className="p-2 text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high rounded-lg transition-colors">
                            <Icon name="arrow-left" className="w-5 h-5" />
                        </button>
                        <div>
                            <h1 className="text-xl font-bold text-on-surface">Detection Details</h1>
                            <p className="text-sm text-on-surface-variant/70">View and manage detection configuration</p>
                        </div>
                    </div>
                </ComponentRow>

                {/* Segmented Control */}
                <ComponentRow
                    id="nav-segmented-control"
                    label="Segmented Control"
                    description="View mode switcher"
                    source="detection-studio"
                    page="UseCaseLibrary"
                    isSelected={selectedComponents.has('nav-segmented-control')}
                    onToggleSelect={toggleSelection}
                >
                    <div className="inline-flex bg-surface-container-high rounded-lg p-1">
                        {([
                            { icon: 'grid', label: 'Grid' },
                            { icon: 'list', label: 'List' },
                            { icon: 'matrix', label: 'Table' },
                        ] as const).map((item, i) => (
                            <button
                                key={item.label}
                                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                                    i === 0
                                        ? 'bg-primary text-on-primary'
                                        : 'text-on-surface-variant hover:text-on-surface'
                                }`}
                            >
                                <Icon name={item.icon} className="w-3.5 h-3.5" />
                                {item.label}
                            </button>
                        ))}
                    </div>
                </ComponentRow>

                {/* Tab Navigation */}
                <ComponentRow
                    id="nav-tabs"
                    label="Tab Navigation"
                    description="Horizontal tab strip with underline indicator"
                    isSelected={selectedComponents.has('nav-tabs')}
                    onToggleSelect={toggleSelection}
                >
                    <div className="flex flex-col gap-4">
                        {/* Underline Tabs */}
                        <div>
                            <p className="text-[10px] font-medium text-on-surface-variant/50 uppercase tracking-wider mb-2">Underline Style</p>
                            <div className="flex border-b border-outline-variant/20">
                                {['Overview', 'Logic', 'Testing', 'History'].map((tab, i) => (
                                    <button
                                        key={tab}
                                        className={`px-4 py-3 text-sm font-medium transition-colors border-b-2 -mb-px ${
                                            i === 0
                                                ? 'text-[#783264] border-[#783264]'
                                                : 'text-on-surface-variant border-transparent hover:text-on-surface hover:border-outline-variant/40'
                                        }`}
                                    >
                                        {tab}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Contained Tabs */}
                        <div>
                            <p className="text-[10px] font-medium text-on-surface-variant/50 uppercase tracking-wider mb-2">Contained Style</p>
                            <div className="inline-flex bg-surface-container-high rounded-xl p-1 gap-1">
                                {['All', 'Active', 'Draft', 'Archived'].map((tab, i) => (
                                    <button
                                        key={tab}
                                        className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                                            i === 0
                                                ? 'bg-surface-container text-on-surface shadow-sm'
                                                : 'text-on-surface-variant hover:text-on-surface'
                                        }`}
                                    >
                                        {tab}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </ComponentRow>

                {/* Pagination */}
                <ComponentRow
                    id="nav-pagination"
                    label="Pagination"
                    description="Page navigation controls"
                    isSelected={selectedComponents.has('nav-pagination')}
                    onToggleSelect={toggleSelection}
                >
                    <div className="flex items-center gap-2">
                        <button className="w-9 h-9 flex items-center justify-center rounded-lg border border-outline-variant/20 text-on-surface-variant hover:bg-surface-container-high transition-colors">
                            <Icon name="chevron-left" className="w-4 h-4" />
                        </button>
                        {[1, 2, 3, '...', 12].map((page, i) => (
                            <button
                                key={i}
                                className={`w-9 h-9 flex items-center justify-center rounded-lg text-sm font-medium transition-colors ${
                                    page === 1
                                        ? 'bg-[#783264] text-white'
                                        : page === '...'
                                            ? 'text-on-surface-variant cursor-default'
                                            : 'text-on-surface-variant hover:bg-surface-container-high'
                                }`}
                            >
                                {page}
                            </button>
                        ))}
                        <button className="w-9 h-9 flex items-center justify-center rounded-lg border border-outline-variant/20 text-on-surface-variant hover:bg-surface-container-high transition-colors">
                            <Icon name="chevron-right" className="w-4 h-4" />
                        </button>
                    </div>
                </ComponentRow>

                {/* Step Indicator */}
                <ComponentRow
                    id="nav-steps"
                    label="Step Indicator"
                    description="Multi-step process navigation"
                    isSelected={selectedComponents.has('nav-steps')}
                    onToggleSelect={toggleSelection}
                >
                    <div className="flex items-center gap-2">
                        {[
                            { label: 'Details', completed: true },
                            { label: 'Logic', completed: true },
                            { label: 'Testing', active: true },
                            { label: 'Review', pending: true },
                        ].map((step, i, arr) => (
                            <div key={step.label} className="flex items-center gap-2">
                                <div className="flex items-center gap-2">
                                    <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                                        step.completed
                                            ? 'bg-[#4D7C6F] text-white'
                                            : step.active
                                                ? 'bg-[#783264] text-white'
                                                : 'bg-surface-container-high text-on-surface-variant/50'
                                    }`}>
                                        {step.completed ? '✓' : i + 1}
                                    </span>
                                    <span className={`text-sm font-medium ${
                                        step.active ? 'text-on-surface' : 'text-on-surface-variant/60'
                                    }`}>{step.label}</span>
                                </div>
                                {i < arr.length - 1 && (
                                    <div className={`w-12 h-0.5 mx-2 rounded-full ${
                                        step.completed ? 'bg-[#4D7C6F]' : 'bg-outline-variant/30'
                                    }`}></div>
                                )}
                            </div>
                        ))}
                    </div>
                </ComponentRow>

                {/* === Suggestions & Improvements === */}
                <div className="mt-10 p-6 bg-[#0284C7]/5 border border-[#0284C7]/20 rounded-2xl">
                    <h4 className="text-sm font-semibold text-[#0284C7] mb-4">Suggestions & Improvements</h4>
                    <div className="grid grid-cols-2 gap-6 text-xs">
                        <div>
                            <p className="font-semibold text-on-surface mb-2">Recommended Patterns</p>
                            <ul className="space-y-1.5 text-on-surface-variant">
                                <li className="flex items-start gap-2">
                                    <span className="text-[#4D7C6F] mt-0.5">•</span>
                                    <span>Use underline tabs for page-level navigation</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <span className="text-[#4D7C6F] mt-0.5">•</span>
                                    <span>Contained tabs for filtering within sections</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <span className="text-[#4D7C6F] mt-0.5">•</span>
                                    <span>Step indicators for multi-page wizards</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <span className="text-[#4D7C6F] mt-0.5">•</span>
                                    <span>Breadcrumbs only for 3+ level hierarchies</span>
                                </li>
                            </ul>
                        </div>
                        <div>
                            <p className="font-semibold text-on-surface mb-2">Future Enhancements</p>
                            <ul className="space-y-1.5 text-on-surface-variant">
                                <li className="flex items-start gap-2">
                                    <span className="text-[#783264] mt-0.5">•</span>
                                    <span>Command palette (Cmd+K) for quick navigation</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <span className="text-[#783264] mt-0.5">•</span>
                                    <span>Keyboard shortcuts for common actions</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <span className="text-[#783264] mt-0.5">•</span>
                                    <span>Recent items quick-access panel</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <span className="text-[#783264] mt-0.5">•</span>
                                    <span>Mobile-responsive bottom navigation</span>
                                </li>
                            </ul>
                        </div>
                    </div>
                </div>
            </Section>
        </DesignSystemPage>
    );
};

export default NavigationPage;
