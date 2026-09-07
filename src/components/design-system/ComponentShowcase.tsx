import React, { useState, useEffect } from 'react';
import { Icon } from '../Icon';
import { useTheme } from '../../context/ThemeContext';
import { ScrollArea, Button, FAB } from '../ui';

// =============================================================================
// M3 COMPONENT SHOWCASE PAGE
// =============================================================================

// Source badge - indicates which project/page the component comes from
type SourceType = 'detection-studio' | 'soc-compass' | 'shared';
const SourceBadge: React.FC<{ source: SourceType; page?: string }> = ({ source, page }) => {
    const config = {
        'detection-studio': { bg: 'bg-tertiary/15', text: 'text-tertiary', label: 'Detection Studio' },
        'soc-compass': { bg: 'bg-blue-500/15', text: 'text-blue-500', label: 'SOC-Compass' },
        'shared': { bg: 'bg-green-500/15', text: 'text-green-500', label: 'Shared' },
    }[source];
    return (
        <div className="flex items-center gap-2">
            <span className={`px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide rounded ${config.bg} ${config.text}`}>
                {config.label}
            </span>
            {page && <span className="text-[9px] text-on-surface-variant/50">{page}</span>}
        </div>
    );
};

// Section wrapper for consistent styling
const Section: React.FC<{ title: string; description?: string; children: React.ReactNode }> = ({
    title, description, children
}) => (
    <div className="mb-12">
        <h2 className="text-xl font-semibold text-on-surface mb-1">{title}</h2>
        {description && <p className="text-sm text-on-surface-variant/70 mb-6">{description}</p>}
        <div className="space-y-6">{children}</div>
    </div>
);

// Component variant display with source indication and selection
const ComponentRow: React.FC<{
    id?: string;
    label: string;
    description?: string;
    source?: SourceType;
    page?: string;
    children: React.ReactNode;
    isSelected?: boolean;
    onToggleSelect?: (id: string) => void;
}> = ({ id, label, description, source, page, children, isSelected, onToggleSelect }) => {
    const componentId = id || `component-${label.toLowerCase().replace(/\s+/g, '-')}`;
    return (
        <div className={`py-4 border-b border-outline-variant/10 last:border-0 rounded-lg transition-all ${isSelected ? 'bg-primary/5 border-primary/20' : ''}`}>
            <div className="flex items-start justify-between gap-4 mb-3">
                <div className="flex items-center gap-3">
                    {onToggleSelect && (
                        <button
                            onClick={() => onToggleSelect(componentId)}
                            className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
                                isSelected
                                    ? 'bg-primary border-primary text-on-primary'
                                    : 'border-outline-variant/40 hover:border-primary/50'
                            }`}
                        >
                            {isSelected && <Icon name="check" className="w-3 h-3" />}
                        </button>
                    )}
                    <div>
                        <p className="text-sm font-medium text-on-surface">{label}</p>
                        {description && <p className="text-xs text-on-surface-variant/60 mt-0.5">{description}</p>}
                        {onToggleSelect && <p className="text-[9px] font-mono text-on-surface-variant/40 mt-0.5">{componentId}</p>}
                    </div>
                </div>
                {source && <SourceBadge source={source} page={page} />}
            </div>
            <div className={`flex flex-wrap items-center gap-3 ${onToggleSelect ? 'ml-8' : ''}`}>{children}</div>
        </div>
    );
};

// Code snippet display
const CodeSnippet: React.FC<{ code: string }> = ({ code }) => (
    <pre className="mt-2 p-3 bg-surface-container rounded-lg text-xs font-mono text-on-surface-variant overflow-x-auto">
        {code}
    </pre>
);

interface ComponentShowcaseProps {
    initialTab?: string;
}

export const ComponentShowcase: React.FC<ComponentShowcaseProps> = ({ initialTab }) => {
    const { theme, setTheme } = useTheme();
    const [activeTab, setActiveTab] = useState<string>(initialTab || 'selected-components');
    const [isModalOpen, setIsModalOpen] = useState(false);

    // Sync activeTab with initialTab when route changes
    useEffect(() => {
        if (initialTab) {
            setActiveTab(initialTab);
        }
    }, [initialTab]);
    const [inputValue, setInputValue] = useState('');
    const [isToggled, setIsToggled] = useState(false);
    const [selectedDropdown, setSelectedDropdown] = useState('');
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);

    const [selectedComponents, setSelectedComponents] = useState<Set<string>>(new Set());
    const [showExportPanel, setShowExportPanel] = useState(false);

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

    const exportSelection = () => {
        const data = {
            selectedComponents: Array.from(selectedComponents),
            exportedAt: new Date().toISOString(),
            totalSelected: selectedComponents.size,
        };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'selected-components.json';
        a.click();
        URL.revokeObjectURL(url);
    };

    const copySelectionToClipboard = () => {
        const text = Array.from(selectedComponents).join('\n');
        navigator.clipboard.writeText(text);
    };

    const tabs = [
        { id: 'selected-components', label: 'Selected Components', icon: 'star' },
        { id: 'buttons', label: 'Buttons', icon: 'zap' },
        { id: 'inputs', label: 'Inputs', icon: 'edit' },
        { id: 'badges', label: 'Badges & Chips', icon: 'flag' },
        { id: 'cards', label: 'Cards', icon: 'box' },
        { id: 'navigation', label: 'Navigation', icon: 'layers' },
        { id: 'modals', label: 'Modals', icon: 'package' },
        { id: 'dropdowns', label: 'Dropdowns', icon: 'chevron-down' },
        { id: 'loading', label: 'Loading', icon: 'loader' },
        { id: 'misc', label: 'Misc', icon: 'grid' },
        { id: 'color-system', label: 'Color System', icon: 'palette' },
    ];

    // M3 Official Button Styles - Following official Material Design 3 specifications
    // Reference: https://m3.material.io/components/buttons/specs
    const m3ButtonBase = "h-10 px-6 rounded-[20px] text-sm font-medium transition-all duration-200 flex items-center justify-center gap-2 min-w-[48px]";
    const m3ButtonWithIcon = "h-10 pl-4 pr-6 rounded-[20px] text-sm font-medium transition-all duration-200 flex items-center justify-center gap-2";
    const m3IconButton = "w-10 h-10 rounded-full flex items-center justify-center transition-all duration-200";
    const m3FabSmall = "w-10 h-10 rounded-xl flex items-center justify-center shadow-md transition-all duration-200";
    const m3FabMedium = "w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg transition-all duration-200";
    const m3FabLarge = "w-24 h-24 rounded-[28px] flex items-center justify-center shadow-xl transition-all duration-200";
    const m3SegmentedButton = "h-10 px-4 text-sm font-medium transition-all duration-200 flex items-center justify-center gap-2 border border-outline";

    return (
        <div className="h-full flex flex-col bg-background">
            {/* Header - Fixed, not scrollable */}
            <div className="flex-shrink-0 bg-surface-container-low border-b border-outline-variant/20">
                <div className="max-w-7xl mx-auto px-6 py-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <h1 className="text-2xl font-bold text-on-surface">M3 Component Library</h1>
                            <p className="text-sm text-on-surface-variant/70 mt-1">
                                Design system components following Material Design 3
                            </p>
                        </div>
                        <div className="flex items-center gap-3">
                            {selectedComponents.size > 0 && (
                                <>
                                    <span className="text-sm text-on-surface-variant">
                                        {selectedComponents.size} selected
                                    </span>
                                    <button
                                        onClick={copySelectionToClipboard}
                                        className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-on-surface-variant hover:text-on-surface hover:bg-surface-container rounded-lg transition-colors"
                                        title="Copy IDs to clipboard"
                                    >
                                        <Icon name="copy" className="w-4 h-4" />
                                        Copy IDs
                                    </button>
                                    <button
                                        onClick={exportSelection}
                                        className="flex items-center gap-2 px-4 py-2 bg-primary text-on-primary rounded-lg font-medium text-sm hover:bg-primary/90 transition-colors"
                                    >
                                        <Icon name="download" className="w-4 h-4" />
                                        Export Selection
                                    </button>
                                    <button
                                        onClick={() => setSelectedComponents(new Set())}
                                        className="p-2 text-on-surface-variant hover:text-error hover:bg-error/10 rounded-lg transition-colors"
                                        title="Clear selection"
                                    >
                                        <Icon name="x" className="w-4 h-4" />
                                    </button>
                                </>
                            )}
                            <button
                                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                                className="p-2 rounded-lg bg-surface-container hover:bg-surface-container-high transition-colors"
                            >
                                <Icon name={theme === 'dark' ? 'sun' : 'moon'} className="w-5 h-5 text-on-surface-variant" />
                            </button>
                        </div>
                    </div>

                    {/* Tab Navigation */}
                    <div className="flex gap-1 mt-4 overflow-x-auto">
                        {tabs.map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
                                    activeTab === tab.id
                                        ? 'bg-primary text-on-primary'
                                        : 'text-on-surface-variant hover:bg-surface-container-high'
                                }`}
                            >
                                <Icon name={tab.icon} className="w-4 h-4" />
                                {tab.label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Content - Scrollable area */}
            <div className="flex-1 overflow-y-auto scrollbar-page">
                <div className="max-w-7xl mx-auto px-6 py-8">

                {/* ========== SELECTED COMPONENTS ========== */}
                {activeTab === 'selected-components' && (() => {
                    const scrollbarCss = `/* Minimal - for components (8px, 8% opacity) */
.scrollbar-minimal::-webkit-scrollbar {
  width: 8px;
}
.scrollbar-minimal::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.08);
  border-radius: 4px;
}

/* Page - for full pages (12px, 20% opacity) */
.scrollbar-page::-webkit-scrollbar {
  width: 12px;
}
.scrollbar-page::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.2);
  border-radius: 5px;
}`;

                    return (
                    <Section title="Selected Components" description="Curated components from the Detection Studio codebase">

                        {/* AI Chat Scrollbar */}
                        <div className="mb-10 p-6 bg-surface-container-low border border-outline-variant/20 rounded-2xl">
                            <h3 className="text-sm font-semibold text-on-surface mb-2 flex items-center gap-2">
                                <Icon name="code" className="w-4 h-4 text-tertiary" />
                                ScrollArea Component
                            </h3>
                            <p className="text-xs text-on-surface-variant/60 mb-6">
                                A thin, elegant scrollbar for chat interfaces and content areas. Adapts to light/dark theme.
                            </p>

                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                                {/* Live Preview */}
                                <div className="rounded-2xl overflow-hidden border border-outline-variant/20">
                                    <div className="p-3 bg-surface-container-high border-b border-outline-variant/20">
                                        <p className="text-xs font-medium text-on-surface">Live Preview</p>
                                    </div>
                                    <div className="p-4 bg-surface-container" style={{ background: theme === 'dark' ? '#0d0e10' : '#f5f5f5' }}>
                                        {/* Chat container mock */}
                                        <div
                                            className="h-48 rounded-xl p-3 overflow-hidden"
                                            style={{
                                                background: theme === 'dark' ? '#141517' : '#ffffff',
                                                border: `1px solid ${theme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`
                                            }}
                                        >
                                            <ScrollArea maxHeight="100%" className="h-full pr-2 space-y-3">
                                                {[1,2,3,4,5,6,7,8].map((i) => (
                                                    <div key={i} className="flex gap-2">
                                                        <div className="w-6 h-6 rounded-full flex-shrink-0" style={{ background: i % 2 === 0 ? '#783264' : '#005091' }}></div>
                                                        <div className="flex-1 p-2 rounded-lg text-xs" style={{
                                                            background: theme === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
                                                            color: theme === 'dark' ? '#e5e5e5' : '#333'
                                                        }}>
                                                            {i % 2 === 0 ? 'AI response message...' : 'User message here...'}
                                                        </div>
                                                    </div>
                                                ))}
                                            </ScrollArea>
                                        </div>
                                        <p className="text-[10px] text-on-surface-variant/50 mt-2 text-center">Scroll to see the minimal scrollbar</p>
                                    </div>
                                </div>

                                {/* CSS Code */}
                                <div className="rounded-2xl overflow-hidden border border-outline-variant/20">
                                    <div className="p-3 bg-surface-container-high border-b border-outline-variant/20">
                                        <p className="text-xs font-medium text-on-surface">CSS Code</p>
                                    </div>
                                    <div className="p-4 bg-surface-container">
                                        <pre className="text-[11px] font-mono text-on-surface-variant overflow-x-auto whitespace-pre-wrap">{scrollbarCss}</pre>
                                    </div>
                                </div>

                            </div>

                            {/* Usage Notes */}
                            <div className="mt-6 pt-6 border-t border-outline-variant/20">
                                <h4 className="text-xs font-semibold text-on-surface mb-3">Usage</h4>
                                <div className="space-y-4">
                                    <div>
                                        <p className="text-[10px] font-medium text-on-surface-variant mb-2">Option 1: CSS Class (Recommended)</p>
                                        <code className="block px-3 py-2 bg-surface-container-high rounded-lg text-[11px] font-mono text-on-surface-variant">
                                            {'<div className="scrollbar-minimal overflow-y-auto">...</div>'}
                                        </code>
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-medium text-on-surface-variant mb-2">Option 2: React Component</p>
                                        <code className="block px-3 py-2 bg-surface-container-high rounded-lg text-[11px] font-mono text-on-surface-variant">
                                            {"import { ScrollArea } from '@/components/ui';\n\n<ScrollArea maxHeight=\"300px\">...</ScrollArea>"}
                                        </code>
                                    </div>
                                </div>
                                <div className="mt-4 pt-4 border-t border-outline-variant/10">
                                    <p className="text-[10px] text-on-surface-variant/60">
                                        Available variants: <code className="text-on-surface-variant">scrollbar-minimal</code> (8px, 8% - components), <code className="text-on-surface-variant">scrollbar-page</code> (12px, 20% - pages), <code className="text-on-surface-variant">scrollbar-hidden</code>
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Button Component */}
                        <div className="mb-10 p-6 bg-surface-container-low border border-outline-variant/20 rounded-2xl">
                            <h3 className="text-sm font-semibold text-on-surface mb-2 flex items-center gap-2">
                                <Icon name="square" className="w-4 h-4 text-primary" />
                                Button Component
                            </h3>
                            <p className="text-xs text-on-surface-variant/60 mb-6">
                                M3-style button with Detection Studio color system. Supports 4 colors, 5 variants, 3 sizes, icons, and states.
                            </p>

                            {/* Color Palette */}
                            <div className="mb-6 p-4 bg-surface-container rounded-xl">
                                <p className="text-[10px] font-semibold text-on-surface-variant uppercase tracking-wide mb-3">Color Palette</p>
                                <div className="flex flex-wrap gap-3">
                                    <div className="flex items-center gap-2">
                                        <div className="w-6 h-6 rounded" style={{ backgroundColor: '#783264' }} />
                                        <span className="text-xs text-on-surface">Primary #783264</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <div className="w-6 h-6 rounded" style={{ backgroundColor: '#4D7C6F' }} />
                                        <span className="text-xs text-on-surface">Secondary #4D7C6F</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <div className="w-6 h-6 rounded bg-gray-400" />
                                        <span className="text-xs text-on-surface">Surface Grey</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <div className="w-6 h-6 rounded" style={{ backgroundColor: '#A63D40' }} />
                                        <span className="text-xs text-on-surface">Error #A63D40</span>
                                    </div>
                                </div>
                            </div>

                            {/* Live Preview - All Colors */}
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                                <div className="rounded-2xl overflow-hidden border border-outline-variant/20">
                                    <div className="p-3 bg-surface-container-high border-b border-outline-variant/20">
                                        <p className="text-xs font-medium text-on-surface">Filled Buttons</p>
                                    </div>
                                    <div className="p-4 bg-surface-container flex flex-wrap gap-3">
                                        <Button color="primary" leadingIcon="plus">Create</Button>
                                        <Button color="secondary" leadingIcon="download">Export</Button>
                                        <Button color="surface">Cancel</Button>
                                        <Button color="error" leadingIcon="trash">Delete</Button>
                                    </div>
                                </div>

                                <div className="rounded-2xl overflow-hidden border border-outline-variant/20">
                                    <div className="p-3 bg-surface-container-high border-b border-outline-variant/20">
                                        <p className="text-xs font-medium text-on-surface">Variants (Primary)</p>
                                    </div>
                                    <div className="p-4 bg-surface-container flex flex-wrap gap-3">
                                        <Button color="primary" variant="filled">Filled</Button>
                                        <Button color="primary" variant="tonal">Tonal</Button>
                                        <Button color="primary" variant="outlined">Outlined</Button>
                                        <Button color="primary" variant="text">Text</Button>
                                    </div>
                                </div>
                            </div>

                            {/* Usage Code */}
                            <div className="rounded-2xl overflow-hidden border border-outline-variant/20">
                                <div className="p-3 bg-surface-container-high border-b border-outline-variant/20">
                                    <p className="text-xs font-medium text-on-surface">Usage</p>
                                </div>
                                <div className="p-4 bg-surface-container">
                                    <pre className="text-[11px] font-mono text-on-surface-variant overflow-x-auto">{`import { Button } from '@/components/ui';

// Primary actions
<Button color="primary">Save</Button>
<Button color="primary" leadingIcon="plus">Create</Button>

// Secondary actions
<Button color="secondary" variant="outlined" leadingIcon="download">Export</Button>

// Destructive
<Button color="error" leadingIcon="trash">Delete</Button>

// Low emphasis
<Button color="surface" variant="text">Cancel</Button>`}</pre>
                                </div>
                            </div>

                            {/* Props Reference */}
                            <div className="mt-6 pt-6 border-t border-outline-variant/20">
                                <h4 className="text-xs font-semibold text-on-surface mb-3">Props</h4>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-[11px]">
                                    <div>
                                        <p className="text-on-surface-variant/60 mb-1">color</p>
                                        <p className="text-on-surface font-medium">primary | secondary | surface | error</p>
                                    </div>
                                    <div>
                                        <p className="text-on-surface-variant/60 mb-1">variant</p>
                                        <p className="text-on-surface font-medium">filled | tonal | outlined | elevated | text</p>
                                    </div>
                                    <div>
                                        <p className="text-on-surface-variant/60 mb-1">size</p>
                                        <p className="text-on-surface font-medium">sm | md | lg</p>
                                    </div>
                                    <div>
                                        <p className="text-on-surface-variant/60 mb-1">icons</p>
                                        <p className="text-on-surface font-medium">leadingIcon | trailingIcon</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* FAB Component */}
                        <div className="mb-10 p-6 bg-surface-container-low border border-outline-variant/20 rounded-2xl">
                            <h3 className="text-sm font-semibold text-on-surface mb-2 flex items-center gap-2">
                                <Icon name="circle" className="w-4 h-4 text-primary" />
                                FAB Component
                            </h3>
                            <p className="text-xs text-on-surface-variant/60 mb-6">
                                Floating Action Button with Detection Studio colors. Supports standard and extended variants.
                            </p>

                            {/* Live Preview */}
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                                <div className="rounded-2xl overflow-hidden border border-outline-variant/20">
                                    <div className="p-3 bg-surface-container-high border-b border-outline-variant/20">
                                        <p className="text-xs font-medium text-on-surface">FAB Colors</p>
                                    </div>
                                    <div className="p-4 bg-surface-container flex items-center gap-4">
                                        <FAB color="primary" icon="plus" />
                                        <FAB color="secondary" icon="filter" />
                                        <FAB color="surface" icon="settings" />
                                        <FAB color="error" icon="trash" />
                                    </div>
                                </div>

                                <div className="rounded-2xl overflow-hidden border border-outline-variant/20">
                                    <div className="p-3 bg-surface-container-high border-b border-outline-variant/20">
                                        <p className="text-xs font-medium text-on-surface">FAB Sizes</p>
                                    </div>
                                    <div className="p-4 bg-surface-container flex items-center gap-4">
                                        <FAB size="small" icon="plus" color="primary" />
                                        <FAB size="medium" icon="plus" color="primary" />
                                        <FAB size="large" icon="plus" color="primary" />
                                    </div>
                                </div>
                            </div>

                            {/* Extended FAB */}
                            <div className="rounded-2xl overflow-hidden border border-outline-variant/20 mb-6">
                                <div className="p-3 bg-surface-container-high border-b border-outline-variant/20">
                                    <p className="text-xs font-medium text-on-surface">Extended FAB</p>
                                </div>
                                <div className="p-4 bg-surface-container flex items-center gap-4">
                                    <FAB icon="plus" label="Create Detection" color="primary" />
                                    <FAB icon="download" label="Export" color="secondary" />
                                </div>
                            </div>

                            {/* Usage Code */}
                            <div className="rounded-2xl overflow-hidden border border-outline-variant/20">
                                <div className="p-3 bg-surface-container-high border-b border-outline-variant/20">
                                    <p className="text-xs font-medium text-on-surface">Usage</p>
                                </div>
                                <div className="p-4 bg-surface-container">
                                    <pre className="text-[11px] font-mono text-on-surface-variant overflow-x-auto">{`import { FAB } from '@/components/ui';

// Standard FAB
<FAB icon="plus" color="primary" />

// Extended FAB
<FAB icon="plus" label="Create Detection" color="primary" />

// Fixed position (bottom-right)
<FAB icon="plus" color="primary" fixed position="bottom-right" />`}</pre>
                                </div>
                            </div>
                        </div>

                        {/* Quick Reference Card */}
                        <div className="p-5 bg-surface-container-high/30 rounded-xl border border-outline-variant/20">
                            <h3 className="text-sm font-semibold text-on-surface mb-4">Button Color Usage Guide</h3>
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-outline-variant/20">
                                        <th className="text-left py-2 font-semibold text-on-surface">Color</th>
                                        <th className="text-left py-2 font-semibold text-on-surface">Hex</th>
                                        <th className="text-left py-2 font-semibold text-on-surface">Use For</th>
                                    </tr>
                                </thead>
                                <tbody className="text-on-surface-variant">
                                    <tr className="border-b border-outline-variant/10">
                                        <td className="py-2"><span className="inline-flex items-center gap-2"><span className="w-3 h-3 rounded-full" style={{ backgroundColor: '#783264' }} /> Primary</span></td>
                                        <td className="py-2 font-mono text-xs">#783264</td>
                                        <td className="py-2">Save, Submit, Create, Confirm, Publish</td>
                                    </tr>
                                    <tr className="border-b border-outline-variant/10">
                                        <td className="py-2"><span className="inline-flex items-center gap-2"><span className="w-3 h-3 rounded-full" style={{ backgroundColor: '#4D7C6F' }} /> Secondary</span></td>
                                        <td className="py-2 font-mono text-xs">#4D7C6F</td>
                                        <td className="py-2">Export, Filter, Sort, Settings, Draft</td>
                                    </tr>
                                    <tr className="border-b border-outline-variant/10">
                                        <td className="py-2"><span className="inline-flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-gray-400" /> Surface</span></td>
                                        <td className="py-2 font-mono text-xs">Grey</td>
                                        <td className="py-2">Cancel, Dismiss, Close</td>
                                    </tr>
                                    <tr>
                                        <td className="py-2"><span className="inline-flex items-center gap-2"><span className="w-3 h-3 rounded-full" style={{ backgroundColor: '#A63D40' }} /> Error</span></td>
                                        <td className="py-2 font-mono text-xs">#A63D40</td>
                                        <td className="py-2">Delete, Remove, Clear All</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </Section>
                    );
                })()}

                {/* ========== BUTTONS ========== */}
                {activeTab === 'buttons' && (
                    <Section title="Button System" description="Detection Studio button components with brand color palette">

                        {/* Color Palette Reference */}
                        <div className="mb-8 p-5 bg-surface-container rounded-xl border border-outline-variant/20">
                            <h3 className="text-sm font-semibold text-on-surface mb-4">Button Color Palette</h3>
                            <div className="flex flex-wrap gap-4">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-lg shadow-sm" style={{ backgroundColor: '#783264' }} />
                                    <div>
                                        <p className="text-xs font-semibold text-on-surface">Primary</p>
                                        <p className="text-[10px] text-on-surface-variant">#783264 • Save, Create, Confirm</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-lg shadow-sm" style={{ backgroundColor: '#4D7C6F' }} />
                                    <div>
                                        <p className="text-xs font-semibold text-on-surface">Secondary</p>
                                        <p className="text-[10px] text-on-surface-variant">#4D7C6F • Export, Filter, Sort</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-lg shadow-sm bg-gray-400" />
                                    <div>
                                        <p className="text-xs font-semibold text-on-surface">Surface</p>
                                        <p className="text-[10px] text-on-surface-variant">Grey • Cancel, Dismiss</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-lg shadow-sm" style={{ backgroundColor: '#A63D40' }} />
                                    <div>
                                        <p className="text-xs font-semibold text-on-surface">Error</p>
                                        <p className="text-[10px] text-on-surface-variant">#A63D40 • Delete, Remove</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Button Colors - Filled Variant */}
                        <div className="mb-8">
                            <h3 className="text-sm font-semibold text-on-surface mb-4 flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: '#783264' }}></span>
                                Filled Buttons by Color
                            </h3>

                            <ComponentRow id="btn-primary-filled" label="Primary Filled" description="Main CTAs - Save, Create, Confirm" source="detection-studio" page="Button.tsx" isSelected={selectedComponents.has('btn-primary-filled')} onToggleSelect={toggleSelection}>
                                <Button color="primary" variant="filled">Create Detection</Button>
                                <Button color="primary" variant="filled">Save</Button>
                                <Button color="primary" variant="filled" leadingIcon="check">Confirm</Button>
                            </ComponentRow>

                            <ComponentRow id="btn-secondary-filled" label="Secondary Filled" description="Secondary actions - Export, Filter, Sort" source="detection-studio" page="Button.tsx" isSelected={selectedComponents.has('btn-secondary-filled')} onToggleSelect={toggleSelection}>
                                <Button color="secondary" variant="filled" leadingIcon="download">Export</Button>
                                <Button color="secondary" variant="filled" leadingIcon="filter">Filter</Button>
                                <Button color="secondary" variant="filled" leadingIcon="arrow-up-down">Sort</Button>
                            </ComponentRow>

                            <ComponentRow id="btn-surface-filled" label="Surface Filled" description="Low emphasis - Cancel, Dismiss" source="detection-studio" page="Button.tsx" isSelected={selectedComponents.has('btn-surface-filled')} onToggleSelect={toggleSelection}>
                                <Button color="surface" variant="filled">Cancel</Button>
                                <Button color="surface" variant="filled">Dismiss</Button>
                                <Button color="surface" variant="filled" leadingIcon="x">Close</Button>
                            </ComponentRow>

                            <ComponentRow id="btn-error-filled" label="Error Filled" description="Destructive actions - Delete, Remove" source="detection-studio" page="Button.tsx" isSelected={selectedComponents.has('btn-error-filled')} onToggleSelect={toggleSelection}>
                                <Button color="error" variant="filled" leadingIcon="trash">Delete</Button>
                                <Button color="error" variant="filled" leadingIcon="x">Remove</Button>
                                <Button color="error" variant="filled">Clear All</Button>
                            </ComponentRow>
                        </div>

                        {/* Button Variants - Primary Color */}
                        <div className="mb-8">
                            <h3 className="text-sm font-semibold text-on-surface mb-4 flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: '#783264' }}></span>
                                Button Variants (Primary)
                            </h3>

                            <ComponentRow id="btn-variants-primary" label="All Variants" description="Filled, Tonal, Outlined, Elevated, Text" source="detection-studio" page="Button.tsx" isSelected={selectedComponents.has('btn-variants-primary')} onToggleSelect={toggleSelection}>
                                <Button color="primary" variant="filled">Filled</Button>
                                <Button color="primary" variant="tonal">Tonal</Button>
                                <Button color="primary" variant="outlined">Outlined</Button>
                                <Button color="primary" variant="elevated">Elevated</Button>
                                <Button color="primary" variant="text">Text</Button>
                            </ComponentRow>
                        </div>

                        {/* Button Variants - Secondary Color */}
                        <div className="mb-8">
                            <h3 className="text-sm font-semibold text-on-surface mb-4 flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: '#4D7C6F' }}></span>
                                Button Variants (Secondary)
                            </h3>

                            <ComponentRow id="btn-variants-secondary" label="All Variants" description="Filled, Tonal, Outlined, Elevated, Text" source="detection-studio" page="Button.tsx" isSelected={selectedComponents.has('btn-variants-secondary')} onToggleSelect={toggleSelection}>
                                <Button color="secondary" variant="filled">Filled</Button>
                                <Button color="secondary" variant="tonal">Tonal</Button>
                                <Button color="secondary" variant="outlined">Outlined</Button>
                                <Button color="secondary" variant="elevated">Elevated</Button>
                                <Button color="secondary" variant="text">Text</Button>
                            </ComponentRow>
                        </div>

                        {/* Button Variants - Error Color */}
                        <div className="mb-8">
                            <h3 className="text-sm font-semibold text-on-surface mb-4 flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: '#A63D40' }}></span>
                                Button Variants (Error)
                            </h3>

                            <ComponentRow id="btn-variants-error" label="All Variants" description="Filled, Tonal, Outlined, Elevated, Text" source="detection-studio" page="Button.tsx" isSelected={selectedComponents.has('btn-variants-error')} onToggleSelect={toggleSelection}>
                                <Button color="error" variant="filled">Filled</Button>
                                <Button color="error" variant="tonal">Tonal</Button>
                                <Button color="error" variant="outlined">Outlined</Button>
                                <Button color="error" variant="elevated">Elevated</Button>
                                <Button color="error" variant="text">Text</Button>
                            </ComponentRow>
                        </div>

                        {/* Button Sizes */}
                        <div className="mb-8">
                            <h3 className="text-sm font-semibold text-on-surface mb-4 flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-gray-400"></span>
                                Button Sizes
                            </h3>

                            <ComponentRow id="btn-sizes-new" label="Size Variants" description="Small (32px), Medium (40px), Large (48px)" source="detection-studio" page="Button.tsx" isSelected={selectedComponents.has('btn-sizes-new')} onToggleSelect={toggleSelection}>
                                <Button color="primary" size="sm">Small</Button>
                                <Button color="primary" size="md">Medium</Button>
                                <Button color="primary" size="lg">Large</Button>
                            </ComponentRow>

                            <ComponentRow id="btn-sizes-with-icons" label="Sizes with Icons" description="Icons scale with button size" source="detection-studio" page="Button.tsx" isSelected={selectedComponents.has('btn-sizes-with-icons')} onToggleSelect={toggleSelection}>
                                <Button color="primary" size="sm" leadingIcon="plus">Small</Button>
                                <Button color="primary" size="md" leadingIcon="plus">Medium</Button>
                                <Button color="primary" size="lg" leadingIcon="plus">Large</Button>
                            </ComponentRow>
                        </div>

                        {/* Buttons with Icons */}
                        <div className="mb-8">
                            <h3 className="text-sm font-semibold text-on-surface mb-4 flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: '#783264' }}></span>
                                Buttons with Icons
                            </h3>

                            <ComponentRow id="btn-icons-leading" label="Leading Icon" description="Icon before label" source="detection-studio" page="Button.tsx" isSelected={selectedComponents.has('btn-icons-leading')} onToggleSelect={toggleSelection}>
                                <Button color="primary" leadingIcon="plus">New Detection</Button>
                                <Button color="secondary" leadingIcon="download">Export</Button>
                                <Button color="error" leadingIcon="trash">Delete</Button>
                            </ComponentRow>

                            <ComponentRow id="btn-icons-trailing" label="Trailing Icon" description="Icon after label" source="detection-studio" page="Button.tsx" isSelected={selectedComponents.has('btn-icons-trailing')} onToggleSelect={toggleSelection}>
                                <Button color="primary" trailingIcon="arrow-right">Continue</Button>
                                <Button color="secondary" trailingIcon="external-link">Open</Button>
                            </ComponentRow>

                            <ComponentRow id="btn-icons-both" label="Both Icons" description="Leading and trailing icons" source="detection-studio" page="Button.tsx" isSelected={selectedComponents.has('btn-icons-both')} onToggleSelect={toggleSelection}>
                                <Button color="primary" leadingIcon="shield" trailingIcon="arrow-right">Secure</Button>
                            </ComponentRow>
                        </div>

                        {/* Button States */}
                        <div className="mb-8">
                            <h3 className="text-sm font-semibold text-on-surface mb-4 flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-gray-400"></span>
                                Button States
                            </h3>

                            <ComponentRow id="btn-states-disabled" label="Disabled State" description="Non-interactive state" source="detection-studio" page="Button.tsx" isSelected={selectedComponents.has('btn-states-disabled')} onToggleSelect={toggleSelection}>
                                <Button color="primary" disabled>Disabled Primary</Button>
                                <Button color="secondary" disabled>Disabled Secondary</Button>
                                <Button color="error" disabled>Disabled Error</Button>
                            </ComponentRow>

                            <ComponentRow id="btn-states-loading" label="Loading State" description="Shows spinner, disables interaction" source="detection-studio" page="Button.tsx" isSelected={selectedComponents.has('btn-states-loading')} onToggleSelect={toggleSelection}>
                                <Button color="primary" loading>Saving...</Button>
                                <Button color="secondary" loading>Exporting...</Button>
                                <Button color="error" loading>Deleting...</Button>
                            </ComponentRow>

                            <ComponentRow id="btn-full-width-new" label="Full Width" description="Stretches to container width" source="detection-studio" page="Button.tsx" isSelected={selectedComponents.has('btn-full-width-new')} onToggleSelect={toggleSelection}>
                                <div className="w-64">
                                    <Button color="primary" fullWidth>Full Width Button</Button>
                                </div>
                            </ComponentRow>
                        </div>

                        {/* FAB - Floating Action Button */}
                        <div className="mb-8">
                            <h3 className="text-sm font-semibold text-on-surface mb-4 flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: '#783264' }}></span>
                                Floating Action Button (FAB)
                            </h3>

                            <ComponentRow id="fab-colors-new" label="FAB Colors" description="Primary, Secondary, Surface, Error" source="detection-studio" page="FAB.tsx" isSelected={selectedComponents.has('fab-colors-new')} onToggleSelect={toggleSelection}>
                                <FAB color="primary" icon="plus" />
                                <FAB color="secondary" icon="filter" />
                                <FAB color="surface" icon="settings" />
                                <FAB color="error" icon="trash" />
                            </ComponentRow>

                            <ComponentRow id="fab-sizes-new" label="FAB Sizes" description="Small (40px), Medium (56px), Large (96px)" source="detection-studio" page="FAB.tsx" isSelected={selectedComponents.has('fab-sizes-new')} onToggleSelect={toggleSelection}>
                                <FAB size="small" icon="plus" color="primary" />
                                <FAB size="medium" icon="plus" color="primary" />
                                <FAB size="large" icon="plus" color="primary" />
                            </ComponentRow>

                            <ComponentRow id="fab-extended-new" label="Extended FAB" description="FAB with label text" source="detection-studio" page="FAB.tsx" isSelected={selectedComponents.has('fab-extended-new')} onToggleSelect={toggleSelection}>
                                <FAB icon="plus" label="Create Detection" color="primary" />
                                <FAB icon="download" label="Export" color="secondary" />
                            </ComponentRow>

                            <ComponentRow id="fab-extended-sizes" label="Extended FAB Sizes" description="Extended with different sizes" source="detection-studio" page="FAB.tsx" isSelected={selectedComponents.has('fab-extended-sizes')} onToggleSelect={toggleSelection}>
                                <FAB icon="plus" label="New" color="primary" size="small" />
                                <FAB icon="plus" label="Create" color="primary" size="medium" />
                            </ComponentRow>
                        </div>

                        {/* Real-World Examples */}
                        <div className="mb-8">
                            <h3 className="text-sm font-semibold text-on-surface mb-4 flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: '#783264' }}></span>
                                Real-World Examples
                            </h3>

                            <ComponentRow id="btn-example-form" label="Form Actions" description="Typical form footer buttons" source="detection-studio" page="Button.tsx" isSelected={selectedComponents.has('btn-example-form')} onToggleSelect={toggleSelection}>
                                <div className="flex gap-3 p-4 bg-surface-container-low rounded-lg w-full justify-end">
                                    <Button color="surface" variant="text">Cancel</Button>
                                    <Button color="secondary" variant="outlined" leadingIcon="save">Save Draft</Button>
                                    <Button color="primary" leadingIcon="check">Save & Publish</Button>
                                </div>
                            </ComponentRow>

                            <ComponentRow id="btn-example-toolbar" label="Toolbar Actions" description="List page toolbar" source="detection-studio" page="Button.tsx" isSelected={selectedComponents.has('btn-example-toolbar')} onToggleSelect={toggleSelection}>
                                <div className="flex gap-2 p-4 bg-surface-container-low rounded-lg w-full justify-between">
                                    <div className="flex gap-2">
                                        <Button color="secondary" variant="outlined" size="sm" leadingIcon="filter">Filter</Button>
                                        <Button color="secondary" variant="outlined" size="sm" leadingIcon="arrow-up-down">Sort</Button>
                                        <Button color="secondary" variant="outlined" size="sm" leadingIcon="download">Export</Button>
                                    </div>
                                    <Button color="primary" size="sm" leadingIcon="plus">Create Detection</Button>
                                </div>
                            </ComponentRow>

                            <ComponentRow id="btn-example-modal" label="Modal Actions" description="Delete confirmation dialog" source="detection-studio" page="Button.tsx" isSelected={selectedComponents.has('btn-example-modal')} onToggleSelect={toggleSelection}>
                                <div className="p-4 bg-surface-container-low rounded-lg max-w-xs">
                                    <p className="text-sm font-semibold text-on-surface mb-2">Delete Detection?</p>
                                    <p className="text-xs text-on-surface-variant mb-4">This action cannot be undone.</p>
                                    <div className="flex gap-2 justify-end">
                                        <Button color="surface" variant="text" size="sm">Cancel</Button>
                                        <Button color="error" size="sm" leadingIcon="trash">Delete</Button>
                                    </div>
                                </div>
                            </ComponentRow>
                        </div>

                        {/* Code Reference */}
                        <div className="p-4 bg-surface-container-low rounded-xl border border-outline-variant/20">
                            <h4 className="text-xs font-semibold text-on-surface mb-3">Usage Examples</h4>
                            <pre className="text-[11px] text-on-surface-variant bg-surface-container p-3 rounded-lg overflow-x-auto">
{`// Primary actions
<Button color="primary">Save</Button>
<Button color="primary" leadingIcon="plus">Create Detection</Button>

// Secondary actions
<Button color="secondary" variant="outlined" leadingIcon="download">Export</Button>

// Destructive actions
<Button color="error" leadingIcon="trash">Delete</Button>

// Low emphasis
<Button color="surface" variant="text">Cancel</Button>

// FAB
<FAB icon="plus" color="primary" />
<FAB icon="plus" label="Create" color="primary" />`}
                            </pre>
                        </div>

                        {/* Specs Reference */}
                        <div className="p-4 bg-surface-container-low rounded-xl border border-outline-variant/20 mt-4">
                            <h4 className="text-xs font-semibold text-on-surface mb-3">Component Specs</h4>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-[11px]">
                                <div>
                                    <p className="text-on-surface-variant/60 mb-1">Button Heights</p>
                                    <p className="text-on-surface font-medium">32/40/48px</p>
                                </div>
                                <div>
                                    <p className="text-on-surface-variant/60 mb-1">Corner Radius</p>
                                    <p className="text-on-surface font-medium">12px (rounded-xl)</p>
                                </div>
                                <div>
                                    <p className="text-on-surface-variant/60 mb-1">FAB Sizes</p>
                                    <p className="text-on-surface font-medium">40/56/96px</p>
                                </div>
                                <div>
                                    <p className="text-on-surface-variant/60 mb-1">Icon Sizes</p>
                                    <p className="text-on-surface font-medium">14/16/18px</p>
                                </div>
                            </div>
                        </div>
                    </Section>
                )}

                {/* ========== INPUTS ========== */}
                {activeTab === 'inputs' && (
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
                )}

                {/* ========== BADGES & CHIPS ========== */}
                {activeTab === 'badges' && (
                    <Section title="Badges & Chips" description="Status indicators and labels">

                        {/* Color System Reference */}
                        <div className="mb-8 p-4 bg-[#783264]/5 border border-[#783264]/20 rounded-xl">
                            <h4 className="text-sm font-semibold text-[#783264] mb-2 flex items-center gap-2">
                                <Icon name="palette" className="w-4 h-4" />
                                Detection Studio Color System
                            </h4>
                            <div className="flex flex-wrap gap-4 text-xs text-on-surface-variant">
                                <span className="flex items-center gap-2"><span className="w-3 h-3 rounded bg-[#783264]"></span><strong>#783264</strong> Primary Magenta</span>
                                <span className="flex items-center gap-2"><span className="w-3 h-3 rounded bg-[#4D7C6F]"></span><strong>#4D7C6F</strong> Sage Green</span>
                                <span className="flex items-center gap-2"><span className="w-3 h-3 rounded bg-[#A63D40]"></span><strong>#A63D40</strong> Brick Red</span>
                                <span className="flex items-center gap-2"><span className="w-3 h-3 rounded bg-[#0284C7]"></span><strong>#0284C7</strong> Sky Blue</span>
                                <span className="flex items-center gap-2"><span className="w-3 h-3 rounded bg-purple-500"></span><strong>Purple</strong> MITRE/Tags</span>
                                <span className="flex items-center gap-2"><span className="w-3 h-3 rounded bg-orange-500"></span><strong>Orange</strong> High/Software</span>
                                <span className="flex items-center gap-2"><span className="w-3 h-3 rounded bg-yellow-500"></span><strong>Yellow</strong> Medium/Warning</span>
                                <span className="flex items-center gap-2"><span className="w-3 h-3 rounded bg-emerald-500"></span><strong>Emerald</strong> Mitigation</span>
                            </div>
                        </div>

                        {/* ===== STATUS BADGES ===== */}
                        <ComponentRow label="Status Badges" description="Sage (Production), Sky Blue (Testing), Purple (Dev), Brick Red (Deprecated)">
                            <span className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide rounded-lg bg-[#4D7C6F]/15 text-[#4D7C6F]">
                                Production
                            </span>
                            <span className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide rounded-lg bg-[#0284C7]/15 text-[#0284C7]">
                                Testing
                            </span>
                            <span className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide rounded-lg bg-purple-500/15 text-purple-600 dark:text-purple-400">
                                Development
                            </span>
                            <span className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide rounded-lg bg-surface-container-highest text-on-surface-variant">
                                Draft
                            </span>
                            <span className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide rounded-lg bg-[#A63D40]/15 text-[#A63D40]">
                                Deprecated
                            </span>
                        </ComponentRow>

                        {/* ===== SEVERITY BADGES ===== */}
                        <ComponentRow label="Severity Badges" description="Brick Red (Critical) → Orange → Yellow → Sage (Low)">
                            <span className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide rounded-lg bg-[#A63D40]/15 text-[#A63D40] border border-[#A63D40]/20">
                                Critical
                            </span>
                            <span className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide rounded-lg bg-orange-500/15 text-orange-500 border border-orange-500/20">
                                High
                            </span>
                            <span className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide rounded-lg bg-yellow-500/15 text-yellow-600 dark:text-yellow-400 border border-yellow-500/20">
                                Medium
                            </span>
                            <span className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide rounded-lg bg-[#4D7C6F]/15 text-[#4D7C6F] border border-[#4D7C6F]/20">
                                Low
                            </span>
                            <span className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide rounded-lg bg-surface-container-highest text-on-surface-variant border border-outline-variant/20">
                                Info
                            </span>
                        </ComponentRow>

                        {/* ===== MITRE CHIPS ===== */}
                        <div className="mb-4 p-3 bg-surface-container rounded-xl border border-outline-variant/20">
                            <p className="text-xs text-on-surface-variant">
                                <strong>MITRE ATT&CK Entity Types:</strong> Tactic (TA), Technique (T), Threat Group (G), Software (S), Campaign (C), Mitigation (M), Data Source (DS)
                            </p>
                        </div>

                        <ComponentRow label="Tactic Chips" description="TA#### - Kill chain phases (Magenta)">
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-mono font-bold rounded-lg bg-[#783264]/10 text-[#783264] border border-[#783264]/20">
                                <Icon name="target" className="w-3 h-3" />
                                TA0001
                            </span>
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-mono font-bold rounded-lg bg-[#783264]/10 text-[#783264] border border-[#783264]/20">
                                <Icon name="target" className="w-3 h-3" />
                                TA0002
                            </span>
                            <span className="text-[10px] text-on-surface-variant ml-2">Initial Access, Execution</span>
                        </ComponentRow>

                        <ComponentRow label="Technique Chips" description="T#### / T####.### - Attack techniques (Purple)">
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-mono font-bold rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
                                <Icon name="zap" className="w-3 h-3" />
                                T1059
                            </span>
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-mono font-bold rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
                                <Icon name="zap" className="w-3 h-3" />
                                T1059.001
                            </span>
                            <span className="text-[10px] text-on-surface-variant ml-2">Command and Scripting Interpreter</span>
                        </ComponentRow>

                        <ComponentRow label="Threat Group Chips" description="G#### - APT and threat actor groups (Brick Red)">
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-bold rounded-lg bg-[#A63D40]/10 text-[#A63D40] border border-[#A63D40]/20">
                                <Icon name="users" className="w-3 h-3" />
                                <span className="font-mono">G0016</span>
                                <span className="font-medium">APT29</span>
                            </span>
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-bold rounded-lg bg-[#A63D40]/10 text-[#A63D40] border border-[#A63D40]/20">
                                <Icon name="users" className="w-3 h-3" />
                                <span className="font-mono">G0032</span>
                                <span className="font-medium">Lazarus</span>
                            </span>
                        </ComponentRow>

                        <ComponentRow label="Software Chips" description="S#### - Malware and tools (Orange)">
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-bold rounded-lg bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/20">
                                <Icon name="package" className="w-3 h-3" />
                                <span className="font-mono">S0154</span>
                                <span className="font-medium">Cobalt Strike</span>
                            </span>
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-bold rounded-lg bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/20">
                                <Icon name="package" className="w-3 h-3" />
                                <span className="font-mono">S0002</span>
                                <span className="font-medium">Mimikatz</span>
                            </span>
                        </ComponentRow>

                        <ComponentRow label="Campaign Chips" description="C#### - Threat campaigns (Sky Blue)">
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-bold rounded-lg bg-[#0284C7]/10 text-[#0284C7] border border-[#0284C7]/20">
                                <Icon name="flag" className="w-3 h-3" />
                                <span className="font-mono">C0001</span>
                                <span className="font-medium">Frankenstein</span>
                            </span>
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-bold rounded-lg bg-[#0284C7]/10 text-[#0284C7] border border-[#0284C7]/20">
                                <Icon name="flag" className="w-3 h-3" />
                                <span className="font-mono">C0018</span>
                                <span className="font-medium">SolarWinds</span>
                            </span>
                        </ComponentRow>

                        <ComponentRow label="Mitigation Chips" description="M#### - Security controls (Emerald)">
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-bold rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                                <Icon name="shield" className="w-3 h-3" />
                                <span className="font-mono">M1026</span>
                                <span className="font-medium">Privileged Account Mgmt</span>
                            </span>
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-bold rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                                <Icon name="shield" className="w-3 h-3" />
                                <span className="font-mono">M1049</span>
                                <span className="font-medium">Antivirus</span>
                            </span>
                        </ComponentRow>

                        <ComponentRow label="Data Source Chips" description="DS#### - Telemetry sources (Sage Green)">
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-bold rounded-lg bg-[#4D7C6F]/10 text-[#4D7C6F] border border-[#4D7C6F]/20">
                                <Icon name="database" className="w-3 h-3" />
                                <span className="font-mono">DS0009</span>
                                <span className="font-medium">Process</span>
                            </span>
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-bold rounded-lg bg-[#4D7C6F]/10 text-[#4D7C6F] border border-[#4D7C6F]/20">
                                <Icon name="database" className="w-3 h-3" />
                                <span className="font-mono">DS0017</span>
                                <span className="font-medium">Command</span>
                            </span>
                        </ComponentRow>

                        <ComponentRow label="Detection Strategy Chips" description="Custom detection categorization (Magenta)">
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-bold rounded-lg bg-[#783264]/10 text-[#783264] border border-[#783264]/20">
                                <Icon name="crosshair" className="w-3 h-3" />
                                Behavioral
                            </span>
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-bold rounded-lg bg-[#783264]/10 text-[#783264] border border-[#783264]/20">
                                <Icon name="crosshair" className="w-3 h-3" />
                                Signature
                            </span>
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-bold rounded-lg bg-[#783264]/10 text-[#783264] border border-[#783264]/20">
                                <Icon name="crosshair" className="w-3 h-3" />
                                Anomaly
                            </span>
                        </ComponentRow>

                        {/* ===== DOT INDICATORS ===== */}
                        <ComponentRow label="Dot Indicator" description="Sage (Active), Yellow (Pending), Brick Red (Error)">
                            <span className="flex items-center gap-1.5 text-xs text-on-surface-variant">
                                <span className="w-2 h-2 rounded-full bg-[#4D7C6F]"></span>
                                Active
                            </span>
                            <span className="flex items-center gap-1.5 text-xs text-on-surface-variant">
                                <span className="w-2 h-2 rounded-full bg-yellow-500"></span>
                                Pending
                            </span>
                            <span className="flex items-center gap-1.5 text-xs text-on-surface-variant">
                                <span className="w-2 h-2 rounded-full bg-[#A63D40]"></span>
                                Error
                            </span>
                        </ComponentRow>

                        <ComponentRow label="Pulsing Dot Indicator" description="Animated status dots for real-time status">
                            <span className="flex items-center gap-1.5 text-xs text-on-surface-variant">
                                <span className="relative flex h-2 w-2">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#4D7C6F] opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-[#4D7C6F]"></span>
                                </span>
                                Live
                            </span>
                            <span className="flex items-center gap-1.5 text-xs text-on-surface-variant">
                                <span className="relative flex h-2 w-2">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-500 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-yellow-500"></span>
                                </span>
                                Processing
                            </span>
                            <span className="flex items-center gap-1.5 text-xs text-on-surface-variant">
                                <span className="relative flex h-2 w-2">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#A63D40] opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-[#A63D40]"></span>
                                </span>
                                Alert
                            </span>
                        </ComponentRow>

                        {/* ===== COUNT BADGES ===== */}
                        <ComponentRow label="Count Badges" description="Primary for default, Brick Red for alerts/errors">
                            <span className="inline-flex items-center justify-center w-6 h-6 text-[11px] font-bold rounded-full bg-primary text-on-primary">
                                5
                            </span>
                            <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-[10px] font-bold rounded-full bg-[#A63D40] text-white">
                                12
                            </span>
                            <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-[10px] font-bold rounded-full bg-surface-container-highest text-on-surface-variant">
                                99+
                            </span>
                        </ComponentRow>

                        {/* ===== REMOVABLE CHIPS ===== */}
                        <ComponentRow label="Removable Chips" description="Tags with close button">
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg bg-surface-container-highest text-on-surface-variant">
                                PowerShell
                                <button className="hover:text-[#A63D40] transition-colors">
                                    <Icon name="x" className="w-3 h-3" />
                                </button>
                            </span>
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-500/20">
                                Credential Access
                                <button className="hover:text-[#A63D40] transition-colors">
                                    <Icon name="x" className="w-3 h-3" />
                                </button>
                            </span>
                        </ComponentRow>

                        {/* ===== QUALITY SCORE ===== */}
                        <ComponentRow label="Quality Score" description="Sage (80+), Sky Blue (60+), Orange (40+), Brick Red (<40)">
                            <div className="flex items-center gap-4">
                                {[85, 65, 42, 25].map(score => {
                                    const color = score >= 80 ? '#4D7C6F' : score >= 60 ? '#0284C7' : score >= 40 ? '#D97706' : '#A63D40';
                                    const circumference = 2 * Math.PI * 18;
                                    const offset = circumference - (score / 100) * circumference;
                                    return (
                                        <div key={score} className="relative w-12 h-12 rounded-full" style={{ backgroundColor: `${color}10` }}>
                                            <svg className="w-12 h-12 -rotate-90">
                                                <circle cx="24" cy="24" r="18" fill="none" strokeWidth="5" stroke={`${color}20`} />
                                                <circle cx="24" cy="24" r="18" fill="none" strokeWidth="5" stroke={color} strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" />
                                            </svg>
                                            <span className="absolute inset-0 flex items-center justify-center text-sm font-bold" style={{ color }}>{score}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        </ComponentRow>

                        {/* ===== ADDITIONAL COMPONENTS ===== */}
                        <div className="mt-8 pt-6 border-t border-outline-variant/20">
                            <h3 className="text-sm font-semibold text-on-surface-variant mb-4">Additional Components</h3>
                        </div>

                        <ComponentRow label="Notification Badges" description="Small indicator badges for icons/buttons">
                            <div className="flex items-center gap-6">
                                <div className="relative">
                                    <div className="p-2 bg-surface-container-highest rounded-lg">
                                        <Icon name="bell" className="w-5 h-5 text-on-surface-variant" />
                                    </div>
                                    <span className="absolute -top-1 -right-1 w-4 h-4 flex items-center justify-center text-[9px] font-bold rounded-full bg-[#A63D40] text-white">3</span>
                                </div>
                                <div className="relative">
                                    <div className="p-2 bg-surface-container-highest rounded-lg">
                                        <Icon name="mail" className="w-5 h-5 text-on-surface-variant" />
                                    </div>
                                    <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-primary"></span>
                                </div>
                                <div className="relative">
                                    <div className="p-2 bg-surface-container-highest rounded-lg">
                                        <Icon name="shield" className="w-5 h-5 text-on-surface-variant" />
                                    </div>
                                    <span className="absolute -top-1 -right-1 w-4 h-4 flex items-center justify-center text-[9px] font-bold rounded-full bg-[#4D7C6F] text-white">
                                        <Icon name="check" className="w-2.5 h-2.5" />
                                    </span>
                                </div>
                            </div>
                        </ComponentRow>

                        <ComponentRow label="Version Badges" description="Software version and release tags">
                            <span className="inline-flex items-center text-[10px] font-mono rounded-md overflow-hidden border border-outline-variant/30">
                                <span className="px-2 py-1 bg-[#4D7C6F] text-white">stable</span>
                                <span className="px-2 py-1 bg-surface-container-highest text-on-surface-variant">1.0.0</span>
                            </span>
                            <span className="inline-flex items-center text-[10px] font-mono rounded-md overflow-hidden border border-outline-variant/30">
                                <span className="px-2 py-1 bg-yellow-500 text-white">beta</span>
                                <span className="px-2 py-1 bg-surface-container-highest text-on-surface-variant">2.0.0-rc1</span>
                            </span>
                            <span className="inline-flex items-center text-[10px] font-mono rounded-md overflow-hidden border border-outline-variant/30">
                                <span className="px-2 py-1 bg-[#A63D40] text-white">deprecated</span>
                                <span className="px-2 py-1 bg-surface-container-highest text-on-surface-variant">0.9.0</span>
                            </span>
                        </ComponentRow>

                        <ComponentRow label="Progress Bar Badges" description="Inline progress indicators">
                            <div className="flex items-center gap-3 px-3 py-2 bg-surface-container-highest rounded-lg">
                                <span className="text-xs text-on-surface-variant">Coverage</span>
                                <div className="w-24 h-1.5 bg-surface-container rounded-full overflow-hidden">
                                    <div className="h-full bg-[#4D7C6F] rounded-full" style={{ width: '75%' }}></div>
                                </div>
                                <span className="text-xs font-semibold text-[#4D7C6F]">75%</span>
                            </div>
                            <div className="flex items-center gap-3 px-3 py-2 bg-surface-container-highest rounded-lg">
                                <span className="text-xs text-on-surface-variant">Risk</span>
                                <div className="w-24 h-1.5 bg-surface-container rounded-full overflow-hidden">
                                    <div className="h-full bg-[#A63D40] rounded-full" style={{ width: '85%' }}></div>
                                </div>
                                <span className="text-xs font-semibold text-[#A63D40]">85%</span>
                            </div>
                        </ComponentRow>

                        <ComponentRow label="Avatar Chips" description="User/author attribution chips">
                            <span className="inline-flex items-center gap-2 px-1 pr-3 py-1 text-xs font-medium rounded-full bg-surface-container-highest text-on-surface-variant">
                                <span className="w-6 h-6 rounded-full bg-primary flex items-center justify-center text-white text-[10px] font-bold">JD</span>
                                John Doe
                            </span>
                            <span className="inline-flex items-center gap-2 px-1 pr-3 py-1 text-xs font-medium rounded-full bg-surface-container-highest text-on-surface-variant">
                                <span className="w-6 h-6 rounded-full bg-purple-500 flex items-center justify-center text-white text-[10px] font-bold">
                                    <Icon name="user" className="w-3.5 h-3.5" />
                                </span>
                                Unassigned
                            </span>
                        </ComponentRow>

                        {/* ===== SIZE GUIDE ===== */}
                        <div className="mt-10 pt-8 border-t-2 border-[#783264]/20">
                            <h3 className="text-base font-semibold text-[#783264] mb-2">Size Guide</h3>
                            <p className="text-sm text-on-surface-variant mb-6">Standardized sizing specifications for consistent badge and chip usage across the application</p>
                        </div>

                        {/* Size Specifications Table */}
                        <div className="mb-8 overflow-hidden rounded-xl border border-outline-variant/30">
                            <table className="w-full text-xs">
                                <thead className="bg-surface-container">
                                    <tr>
                                        <th className="px-4 py-3 text-left font-semibold text-on-surface border-b border-outline-variant/20">Size</th>
                                        <th className="px-4 py-3 text-left font-semibold text-on-surface border-b border-outline-variant/20">Padding</th>
                                        <th className="px-4 py-3 text-left font-semibold text-on-surface border-b border-outline-variant/20">Text</th>
                                        <th className="px-4 py-3 text-left font-semibold text-on-surface border-b border-outline-variant/20">Height</th>
                                        <th className="px-4 py-3 text-left font-semibold text-on-surface border-b border-outline-variant/20">Icon</th>
                                        <th className="px-4 py-3 text-left font-semibold text-on-surface border-b border-outline-variant/20">Border Radius</th>
                                        <th className="px-4 py-3 text-left font-semibold text-on-surface border-b border-outline-variant/20">Use Case</th>
                                    </tr>
                                </thead>
                                <tbody className="font-mono text-on-surface-variant">
                                    <tr className="bg-surface-container-low">
                                        <td className="px-4 py-2.5 font-semibold text-on-surface">xs</td>
                                        <td className="px-4 py-2.5">px-1.5 py-0.5</td>
                                        <td className="px-4 py-2.5">text-[8px]</td>
                                        <td className="px-4 py-2.5">~16px</td>
                                        <td className="px-4 py-2.5">w-2 h-2</td>
                                        <td className="px-4 py-2.5">rounded</td>
                                        <td className="px-4 py-2.5 text-on-surface-variant/60 font-sans">Inline meta, tight spaces</td>
                                    </tr>
                                    <tr>
                                        <td className="px-4 py-2.5 font-semibold text-on-surface">sm</td>
                                        <td className="px-4 py-2.5">px-2 py-0.5</td>
                                        <td className="px-4 py-2.5">text-[9px]</td>
                                        <td className="px-4 py-2.5">~20px</td>
                                        <td className="px-4 py-2.5">w-2.5 h-2.5</td>
                                        <td className="px-4 py-2.5">rounded-md</td>
                                        <td className="px-4 py-2.5 text-on-surface-variant/60 font-sans">Cards, compact lists</td>
                                    </tr>
                                    <tr className="bg-surface-container-low">
                                        <td className="px-4 py-2.5 font-semibold text-[#783264]">md (default)</td>
                                        <td className="px-4 py-2.5">px-2.5 py-1</td>
                                        <td className="px-4 py-2.5">text-[10px]</td>
                                        <td className="px-4 py-2.5">~24px</td>
                                        <td className="px-4 py-2.5">w-3 h-3</td>
                                        <td className="px-4 py-2.5">rounded-lg</td>
                                        <td className="px-4 py-2.5 text-on-surface-variant/60 font-sans">Standard usage, forms</td>
                                    </tr>
                                    <tr>
                                        <td className="px-4 py-2.5 font-semibold text-on-surface">lg</td>
                                        <td className="px-4 py-2.5">px-3 py-1.5</td>
                                        <td className="px-4 py-2.5">text-[11px]</td>
                                        <td className="px-4 py-2.5">~28px</td>
                                        <td className="px-4 py-2.5">w-3.5 h-3.5</td>
                                        <td className="px-4 py-2.5">rounded-lg</td>
                                        <td className="px-4 py-2.5 text-on-surface-variant/60 font-sans">Headers, hero sections</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>

                        {/* Size Comparison - Status Badges */}
                        <ComponentRow label="Status Badges - All Sizes" description="xs → sm → md → lg progression">
                            <div className="flex items-center gap-4">
                                <div className="flex flex-col items-center gap-1">
                                    <span className="px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide rounded bg-[#4D7C6F]/15 text-[#4D7C6F]">Production</span>
                                    <span className="text-[8px] text-on-surface-variant/60">xs</span>
                                </div>
                                <div className="flex flex-col items-center gap-1">
                                    <span className="px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide rounded-md bg-[#4D7C6F]/15 text-[#4D7C6F]">Production</span>
                                    <span className="text-[8px] text-on-surface-variant/60">sm</span>
                                </div>
                                <div className="flex flex-col items-center gap-1">
                                    <span className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide rounded-lg bg-[#4D7C6F]/15 text-[#4D7C6F]">Production</span>
                                    <span className="text-[8px] text-on-surface-variant/60">md</span>
                                </div>
                                <div className="flex flex-col items-center gap-1">
                                    <span className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide rounded-lg bg-[#4D7C6F]/15 text-[#4D7C6F]">Production</span>
                                    <span className="text-[8px] text-on-surface-variant/60">lg</span>
                                </div>
                            </div>
                        </ComponentRow>

                        {/* Size Comparison - Severity Badges */}
                        <ComponentRow label="Severity Badges - All Sizes" description="Consistent border across all sizes">
                            <div className="flex items-center gap-4">
                                <div className="flex flex-col items-center gap-1">
                                    <span className="px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide rounded bg-[#A63D40]/15 text-[#A63D40] border border-[#A63D40]/20">Critical</span>
                                    <span className="text-[8px] text-on-surface-variant/60">xs</span>
                                </div>
                                <div className="flex flex-col items-center gap-1">
                                    <span className="px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide rounded-md bg-[#A63D40]/15 text-[#A63D40] border border-[#A63D40]/20">Critical</span>
                                    <span className="text-[8px] text-on-surface-variant/60">sm</span>
                                </div>
                                <div className="flex flex-col items-center gap-1">
                                    <span className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide rounded-lg bg-[#A63D40]/15 text-[#A63D40] border border-[#A63D40]/20">Critical</span>
                                    <span className="text-[8px] text-on-surface-variant/60">md</span>
                                </div>
                                <div className="flex flex-col items-center gap-1">
                                    <span className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide rounded-lg bg-[#A63D40]/15 text-[#A63D40] border border-[#A63D40]/20">Critical</span>
                                    <span className="text-[8px] text-on-surface-variant/60">lg</span>
                                </div>
                            </div>
                        </ComponentRow>

                        {/* Size Comparison - MITRE Chips */}
                        <ComponentRow label="MITRE Chips - All Sizes" description="Icon scales proportionally with text">
                            <div className="flex items-center gap-4">
                                <div className="flex flex-col items-center gap-1">
                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[8px] font-mono font-bold rounded bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
                                        <Icon name="zap" className="w-2 h-2" />
                                        T1059
                                    </span>
                                    <span className="text-[8px] text-on-surface-variant/60">xs</span>
                                </div>
                                <div className="flex flex-col items-center gap-1">
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[9px] font-mono font-bold rounded-md bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
                                        <Icon name="zap" className="w-2.5 h-2.5" />
                                        T1059
                                    </span>
                                    <span className="text-[8px] text-on-surface-variant/60">sm</span>
                                </div>
                                <div className="flex flex-col items-center gap-1">
                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-mono font-bold rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
                                        <Icon name="zap" className="w-3 h-3" />
                                        T1059
                                    </span>
                                    <span className="text-[8px] text-on-surface-variant/60">md</span>
                                </div>
                                <div className="flex flex-col items-center gap-1">
                                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-mono font-bold rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
                                        <Icon name="zap" className="w-3.5 h-3.5" />
                                        T1059
                                    </span>
                                    <span className="text-[8px] text-on-surface-variant/60">lg</span>
                                </div>
                            </div>
                        </ComponentRow>

                        {/* Quality Score Sizes */}
                        <ComponentRow label="Quality Score - All Sizes" description="32px → 40px → 48px → 56px">
                            <div className="flex items-end gap-6">
                                {[
                                    { size: 'xs', width: 32, radius: 11, stroke: 3, fontSize: 'text-[8px]' },
                                    { size: 'sm', width: 40, radius: 14, stroke: 4, fontSize: 'text-[9px]' },
                                    { size: 'md', width: 48, radius: 18, stroke: 5, fontSize: 'text-sm' },
                                    { size: 'lg', width: 56, radius: 21, stroke: 5, fontSize: 'text-base' },
                                ].map(({ size, width, radius, stroke, fontSize }) => {
                                    const score = 85;
                                    const color = '#4D7C6F';
                                    const circumference = 2 * Math.PI * radius;
                                    const offset = circumference - (score / 100) * circumference;
                                    return (
                                        <div key={size} className="flex flex-col items-center gap-1">
                                            <div className="relative rounded-full" style={{ width, height: width, backgroundColor: `${color}10` }}>
                                                <svg className="-rotate-90" style={{ width, height: width }}>
                                                    <circle cx={width/2} cy={width/2} r={radius} fill="none" strokeWidth={stroke} stroke={`${color}20`} />
                                                    <circle cx={width/2} cy={width/2} r={radius} fill="none" strokeWidth={stroke} stroke={color} strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" />
                                                </svg>
                                                <span className={`absolute inset-0 flex items-center justify-center font-bold ${fontSize}`} style={{ color }}>{score}</span>
                                            </div>
                                            <span className="text-[8px] text-on-surface-variant/60">{size}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        </ComponentRow>

                        {/* Usage Guidelines Box */}
                        <div className="mb-8 p-4 bg-[#783264]/5 border border-[#783264]/20 rounded-xl">
                            <h4 className="text-sm font-semibold text-[#783264] mb-3 flex items-center gap-2">
                                <Icon name="info" className="w-4 h-4" />
                                Size Selection Guidelines
                            </h4>
                            <div className="grid grid-cols-2 gap-4 text-xs text-on-surface-variant">
                                <div>
                                    <p className="font-semibold text-on-surface mb-2">When to use each size:</p>
                                    <ul className="space-y-1.5">
                                        <li className="flex items-start gap-2">
                                            <span className="font-mono font-bold text-on-surface-variant/80">xs</span>
                                            <span>Inline metadata, table cells, very compact cards</span>
                                        </li>
                                        <li className="flex items-start gap-2">
                                            <span className="font-mono font-bold text-on-surface-variant/80">sm</span>
                                            <span>Detection cards, list items, secondary information</span>
                                        </li>
                                        <li className="flex items-start gap-2">
                                            <span className="font-mono font-bold text-[#783264]">md</span>
                                            <span>Default - detail pages, forms, primary UI elements</span>
                                        </li>
                                        <li className="flex items-start gap-2">
                                            <span className="font-mono font-bold text-on-surface-variant/80">lg</span>
                                            <span>Page headers, hero sections, prominent callouts</span>
                                        </li>
                                    </ul>
                                </div>
                                <div>
                                    <p className="font-semibold text-on-surface mb-2">Consistency rules:</p>
                                    <ul className="space-y-1.5">
                                        <li className="flex items-start gap-2">
                                            <Icon name="check" className="w-3 h-3 text-[#4D7C6F] flex-shrink-0 mt-0.5" />
                                            <span>Use same size for badges in the same row/context</span>
                                        </li>
                                        <li className="flex items-start gap-2">
                                            <Icon name="check" className="w-3 h-3 text-[#4D7C6F] flex-shrink-0 mt-0.5" />
                                            <span>Cards use sm, detail headers use md</span>
                                        </li>
                                        <li className="flex items-start gap-2">
                                            <Icon name="check" className="w-3 h-3 text-[#4D7C6F] flex-shrink-0 mt-0.5" />
                                            <span>Keep icon-to-text ratio proportional</span>
                                        </li>
                                        <li className="flex items-start gap-2">
                                            <Icon name="check" className="w-3 h-3 text-[#4D7C6F] flex-shrink-0 mt-0.5" />
                                            <span>Quality scores: md for cards, lg for detail pages</span>
                                        </li>
                                    </ul>
                                </div>
                            </div>
                        </div>

                        {/* ===== REFERENCE MOCKUPS ===== */}
                        <div className="mt-10 pt-8 border-t-2 border-[#783264]/20">
                            <h3 className="text-base font-semibold text-[#783264] mb-2">Reference Mockups</h3>
                            <p className="text-sm text-on-surface-variant mb-6">See how all badge and chip components work together with correct sizing in real UI contexts</p>
                        </div>

                        {/* Detection Card Mockup */}
                        <div className="mb-8">
                            <label className="block text-xs font-bold uppercase tracking-widest text-on-surface-variant mb-3">Detection Card (sm)</label>
                            <div className="w-full max-w-md bg-surface-container-low border border-outline-variant/30 rounded-2xl p-5 hover:border-primary/40 transition-all">
                                {/* Header */}
                                <div className="flex items-start justify-between mb-3">
                                    <div className="flex-1 min-w-0">
                                        <h3 className="text-sm font-semibold text-on-surface truncate mb-1.5">Suspicious PowerShell Execution</h3>
                                        <div className="flex flex-wrap items-center gap-1.5">
                                            {/* Status Badge - SM */}
                                            <span className="px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide rounded-md bg-[#4D7C6F]/15 text-[#4D7C6F]">Production</span>
                                            {/* Severity Badge - SM */}
                                            <span className="px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide rounded-md bg-[#A63D40]/15 text-[#A63D40] border border-[#A63D40]/20">Critical</span>
                                        </div>
                                    </div>
                                    {/* Quality Score - SM (40px) */}
                                    <div className="relative w-10 h-10 flex-shrink-0 rounded-full" style={{ backgroundColor: '#4D7C6F10' }}>
                                        <svg className="w-10 h-10 -rotate-90" viewBox="0 0 40 40">
                                            <circle cx="20" cy="20" r="14" fill="none" strokeWidth="4" stroke="#4D7C6F20" />
                                            <circle cx="20" cy="20" r="14" fill="none" strokeWidth="4" stroke="#4D7C6F" strokeDasharray={`${0.85 * 2 * Math.PI * 14} ${2 * Math.PI * 14}`} strokeLinecap="round" />
                                        </svg>
                                        <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold text-[#4D7C6F]">85</span>
                                    </div>
                                </div>

                                {/* Description */}
                                <p className="text-xs text-on-surface-variant mb-3 line-clamp-2">Detects suspicious PowerShell command execution patterns commonly used by threat actors for initial access and execution.</p>

                                {/* MITRE Chips - SM */}
                                <div className="flex flex-wrap gap-1.5 mb-3">
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[9px] font-mono font-bold rounded-md bg-[#783264]/10 text-[#783264] border border-[#783264]/20">
                                        <Icon name="target" className="w-2.5 h-2.5" />
                                        TA0002
                                    </span>
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[9px] font-mono font-bold rounded-md bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
                                        <Icon name="zap" className="w-2.5 h-2.5" />
                                        T1059.001
                                    </span>
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[9px] font-bold rounded-md bg-[#A63D40]/10 text-[#A63D40] border border-[#A63D40]/20">
                                        <Icon name="users" className="w-2.5 h-2.5" />
                                        APT29
                                    </span>
                                </div>

                                {/* Footer */}
                                <div className="flex items-center justify-between pt-3 border-t border-outline-variant/20">
                                    <span className="inline-flex items-center gap-1.5 text-[10px] text-on-surface-variant">
                                        <span className="w-5 h-5 rounded-full bg-primary flex items-center justify-center text-white text-[8px] font-bold">JD</span>
                                        John Doe
                                    </span>
                                    <span className="text-[10px] text-on-surface-variant/60">Updated 2h ago</span>
                                </div>
                            </div>
                        </div>

                        {/* Detection Details Title Bar Mockup */}
                        <div className="mb-8">
                            <label className="block text-xs font-bold uppercase tracking-widest text-on-surface-variant mb-3">Detection Details - Title Bar (md)</label>
                            <div className="w-full bg-surface-container border border-outline-variant/30 rounded-2xl overflow-hidden">
                                {/* Title Bar */}
                                <div className="px-5 py-4 border-b border-outline-variant/20">
                                    <div className="flex items-start justify-between gap-4">
                                        {/* Left: Title + Badges */}
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-2">
                                                <button className="p-1 rounded hover:bg-surface-container-highest text-on-surface-variant">
                                                    <Icon name="arrow-left" className="w-4 h-4" />
                                                </button>
                                                <h1 className="text-lg font-semibold text-on-surface truncate">Suspicious PowerShell Execution with Encoded Commands</h1>
                                            </div>
                                            <div className="flex flex-wrap items-center gap-2 ml-7">
                                                <span className="font-mono text-[10px] text-on-surface-variant/60">#a1b2c3d4</span>
                                                {/* Status - MD */}
                                                <span className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide rounded-lg bg-[#4D7C6F]/15 text-[#4D7C6F]">Production</span>
                                                {/* Severity - MD */}
                                                <span className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide rounded-lg bg-[#A63D40]/15 text-[#A63D40] border border-[#A63D40]/20">Critical</span>
                                                {/* Library Type - MD */}
                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-bold rounded-lg bg-[#783264]/10 text-[#783264] border border-[#783264]/20">
                                                    <Icon name="globe" className="w-3 h-3" />
                                                    Universal
                                                </span>
                                            </div>
                                        </div>

                                        {/* Right: Quality Score + Actions */}
                                        <div className="flex items-center gap-3 flex-shrink-0">
                                            {/* Quality Score - MD (48px) */}
                                            <div className="relative w-12 h-12 rounded-full" style={{ backgroundColor: '#4D7C6F10' }}>
                                                <svg className="w-12 h-12 -rotate-90" viewBox="0 0 48 48">
                                                    <circle cx="24" cy="24" r="18" fill="none" strokeWidth="5" stroke="#4D7C6F20" />
                                                    <circle cx="24" cy="24" r="18" fill="none" strokeWidth="5" stroke="#4D7C6F" strokeDasharray={`${0.85 * 2 * Math.PI * 18} ${2 * Math.PI * 18}`} strokeLinecap="round" />
                                                </svg>
                                                <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-[#4D7C6F]">85</span>
                                            </div>
                                            {/* Actions */}
                                            <button className="p-2 rounded-full hover:bg-surface-container-highest text-on-surface-variant">
                                                <Icon name="download" className="w-4 h-4" />
                                            </button>
                                            <button className="px-4 py-2 text-xs font-medium bg-primary text-on-primary rounded-full">
                                                Edit
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                {/* MITRE Context Row - SM (compact secondary info) */}
                                <div className="px-5 py-3 bg-surface-container-low/50 flex flex-wrap items-center gap-2">
                                    <span className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mr-2">MITRE ATT&CK:</span>
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[9px] font-mono font-bold rounded-md bg-[#783264]/10 text-[#783264] border border-[#783264]/20">
                                        <Icon name="target" className="w-2.5 h-2.5" />
                                        TA0002
                                    </span>
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[9px] font-mono font-bold rounded-md bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
                                        <Icon name="zap" className="w-2.5 h-2.5" />
                                        T1059.001
                                    </span>
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[9px] font-bold rounded-md bg-[#A63D40]/10 text-[#A63D40] border border-[#A63D40]/20">
                                        <Icon name="users" className="w-2.5 h-2.5" />
                                        <span className="font-mono">G0016</span>
                                        APT29
                                    </span>
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[9px] font-bold rounded-md bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/20">
                                        <Icon name="package" className="w-2.5 h-2.5" />
                                        <span className="font-mono">S0154</span>
                                        Cobalt Strike
                                    </span>
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[9px] font-bold rounded-md bg-[#4D7C6F]/10 text-[#4D7C6F] border border-[#4D7C6F]/20">
                                        <Icon name="database" className="w-2.5 h-2.5" />
                                        <span className="font-mono">DS0009</span>
                                        Process
                                    </span>
                                </div>
                            </div>
                        </div>
                    </Section>
                )}

                {/* ========== CARDS ========== */}
                {activeTab === 'cards' && (
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
                )}

                {/* ========== NAVIGATION ========== */}
                {activeTab === 'navigation' && (() => {
                    const sidebarCode = "// Sidebar.tsx structure\n<nav className=\"w-20 bg-[#0d0e10] flex flex-col\">\n  <NavRailItem icon=\"shield\" label=\"Library\" active />\n  <NavRailItem icon=\"folder\" label=\"Packs\" />\n</nav>\n<aside className=\"w-48 bg-[#0d0e10]\">\n  <DrawerContent />\n</aside>";
                    const navRailCode = "/* M3 Navigation Rail CSS */\n.m3-nav-rail {\n  width: 80px;\n  transition: width 0.3s ease;\n}\n.m3-nav-rail:hover { width: 224px; }\n.m3-nav-rail-item {\n  border-radius: 9999px; /* rounded-full */\n  padding: 12px;\n}";
                    const scrollbarCode = "/* Custom Scrollbar CSS */\n.custom-scrollbar::-webkit-scrollbar {\n  width: 6px;\n  height: 6px;\n}\n.custom-scrollbar::-webkit-scrollbar-track {\n  background: transparent;\n}\n.custom-scrollbar::-webkit-scrollbar-thumb {\n  background: rgba(255,255,255,0.1);\n  border-radius: 3px;\n}\n.custom-scrollbar::-webkit-scrollbar-thumb:hover {\n  background: rgba(255,255,255,0.2);\n}\n/* Firefox */\n.custom-scrollbar {\n  scrollbar-width: thin;\n  scrollbar-color: rgba(255,255,255,0.1) transparent;\n}";
                    return (
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
                                        {[
                                            { icon: 'dashboard', label: 'Dashboard', active: false },
                                            { icon: 'shield', label: 'Library', active: true },
                                            { icon: 'package', label: 'Packs', active: false },
                                            { icon: 'box', label: 'Workspaces', active: false },
                                        ].map(item => (
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
                                        {[
                                            { icon: 'target', label: 'Incidents', badge: 3 },
                                            { icon: 'file-text', label: 'Reports', badge: 0 },
                                            { icon: 'users', label: 'Team', badge: 0 },
                                            { icon: 'settings', label: 'Settings', badge: 0 },
                                        ].map((item, i) => (
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
                                {[
                                    { icon: 'grid', label: 'Grid' },
                                    { icon: 'list', label: 'List' },
                                    { icon: 'matrix', label: 'Table' },
                                ].map((item, i) => (
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
                    );
                })()}

                {/* ========== MODALS ========== */}
                {activeTab === 'modals' && (
                    <Section title="Modals & Dialogs" description="Overlay dialogs for focused interactions">

                        {/* DS Color Reference */}
                        <div className="mb-6 p-4 bg-[#783264]/5 border border-[#783264]/20 rounded-xl">
                            <p className="text-xs font-medium text-[#783264] mb-2">DS Color System for Modals:</p>
                            <div className="flex flex-wrap gap-3 text-[10px]">
                                <span className="px-2 py-1 rounded bg-[#783264]/10 text-[#783264]">Primary: #783264</span>
                                <span className="px-2 py-1 rounded bg-[#4D7C6F]/10 text-[#4D7C6F]">Success: #4D7C6F</span>
                                <span className="px-2 py-1 rounded bg-[#0284C7]/10 text-[#0284C7]">Info: #0284C7</span>
                                <span className="px-2 py-1 rounded bg-orange-500/10 text-orange-500">Warning: Orange</span>
                                <span className="px-2 py-1 rounded bg-[#A63D40]/10 text-[#A63D40]">Error: #A63D40</span>
                            </div>
                        </div>

                        <ComponentRow
                            id="modal-trigger"
                            label="Modal Trigger"
                            description="Click to open modal"
                            isSelected={selectedComponents.has('modal-trigger')}
                            onToggleSelect={toggleSelection}
                        >
                            <button
                                onClick={() => setIsModalOpen(true)}
                                className="px-4 py-2 bg-primary text-on-primary rounded-xl font-medium text-sm hover:bg-primary/90 transition-colors"
                            >
                                Open Modal
                            </button>
                        </ComponentRow>

                        <ComponentRow label="Modal Structure" description="Standard modal layout">
                            <div className="w-[420px] bg-surface-container rounded-2xl shadow-2xl border border-outline-variant/20 overflow-hidden">
                                {/* Header */}
                                <div className="flex items-center justify-between px-5 py-4 border-b border-outline-variant/20">
                                    <h3 className="text-base font-semibold text-on-surface">Modal Title</h3>
                                    <button className="p-1 text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high rounded-lg transition-colors">
                                        <Icon name="x" className="w-5 h-5" />
                                    </button>
                                </div>
                                {/* Content */}
                                <div className="px-5 py-4">
                                    <p className="text-sm text-on-surface-variant">This is the modal content area. You can put any content here including forms, lists, or other components.</p>
                                </div>
                                {/* Footer */}
                                <div className="flex justify-end gap-2 px-5 py-4 border-t border-outline-variant/20 bg-surface-container-low/50">
                                    <button className="px-4 py-2 text-sm font-medium text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high rounded-xl transition-colors">
                                        Cancel
                                    </button>
                                    <button className="px-4 py-2 bg-primary text-on-primary rounded-xl font-medium text-sm hover:bg-primary/90 transition-colors">
                                        Confirm
                                    </button>
                                </div>
                            </div>
                        </ComponentRow>

                        <ComponentRow label="Confirmation Dialog" description="Destructive action (Brick Red)">
                            <div className="w-[380px] bg-surface-container rounded-2xl shadow-2xl border border-outline-variant/20 p-5">
                                <div className="flex items-center gap-3 mb-4">
                                    <div className="p-2 bg-[#A63D40]/10 rounded-full">
                                        <Icon name="alert-triangle" className="w-5 h-5 text-[#A63D40]" />
                                    </div>
                                    <h3 className="text-base font-semibold text-on-surface">Delete Detection?</h3>
                                </div>
                                <p className="text-sm text-on-surface-variant mb-5">This action cannot be undone. The detection and all associated data will be permanently removed.</p>
                                <div className="flex justify-end gap-2">
                                    <button className="px-4 py-2 text-sm font-medium text-on-surface-variant hover:bg-surface-container-high rounded-xl transition-colors">
                                        Cancel
                                    </button>
                                    <button className="px-4 py-2 bg-[#A63D40] text-white rounded-xl font-medium text-sm hover:bg-[#A63D40]/90 transition-colors">
                                        Delete
                                    </button>
                                </div>
                            </div>
                        </ComponentRow>

                        <ComponentRow label="Success Dialog" description="Success confirmation (Sage Green)">
                            <div className="w-[380px] bg-surface-container rounded-2xl shadow-2xl border border-outline-variant/20 p-5">
                                <div className="flex items-center gap-3 mb-4">
                                    <div className="p-2 bg-[#4D7C6F]/10 rounded-full">
                                        <Icon name="check-circle" className="w-5 h-5 text-[#4D7C6F]" />
                                    </div>
                                    <h3 className="text-base font-semibold text-on-surface">Detection Published!</h3>
                                </div>
                                <p className="text-sm text-on-surface-variant mb-5">Your detection rule has been successfully published to production. It will start monitoring events immediately.</p>
                                <div className="flex justify-end gap-2">
                                    <button className="px-4 py-2 text-sm font-medium text-on-surface-variant hover:bg-surface-container-high rounded-xl transition-colors">
                                        View Details
                                    </button>
                                    <button className="px-4 py-2 bg-[#4D7C6F] text-white rounded-xl font-medium text-sm hover:bg-[#4D7C6F]/90 transition-colors">
                                        Done
                                    </button>
                                </div>
                            </div>
                        </ComponentRow>

                        <ComponentRow label="Info Dialog" description="Information notice (Sky Blue)">
                            <div className="w-[380px] bg-surface-container rounded-2xl shadow-2xl border border-outline-variant/20 p-5">
                                <div className="flex items-center gap-3 mb-4">
                                    <div className="p-2 bg-[#0284C7]/10 rounded-full">
                                        <Icon name="info" className="w-5 h-5 text-[#0284C7]" />
                                    </div>
                                    <h3 className="text-base font-semibold text-on-surface">New Feature Available</h3>
                                </div>
                                <p className="text-sm text-on-surface-variant mb-5">AI-assisted detection tuning is now available. This feature can help optimize your detection rules for better accuracy.</p>
                                <div className="flex justify-end gap-2">
                                    <button className="px-4 py-2 text-sm font-medium text-on-surface-variant hover:bg-surface-container-high rounded-xl transition-colors">
                                        Maybe Later
                                    </button>
                                    <button className="px-4 py-2 bg-[#0284C7] text-white rounded-xl font-medium text-sm hover:bg-[#0284C7]/90 transition-colors">
                                        Learn More
                                    </button>
                                </div>
                            </div>
                        </ComponentRow>

                        <ComponentRow label="Warning Dialog" description="Warning notice (Orange)">
                            <div className="w-[380px] bg-surface-container rounded-2xl shadow-2xl border border-outline-variant/20 p-5">
                                <div className="flex items-center gap-3 mb-4">
                                    <div className="p-2 bg-orange-500/10 rounded-full">
                                        <Icon name="alert-triangle" className="w-5 h-5 text-orange-500" />
                                    </div>
                                    <h3 className="text-base font-semibold text-on-surface">Unsaved Changes</h3>
                                </div>
                                <p className="text-sm text-on-surface-variant mb-5">You have unsaved changes that will be lost if you leave this page. Do you want to save your work first?</p>
                                <div className="flex justify-end gap-2">
                                    <button className="px-4 py-2 text-sm font-medium text-on-surface-variant hover:bg-surface-container-high rounded-xl transition-colors">
                                        Discard
                                    </button>
                                    <button className="px-4 py-2 bg-orange-500 text-white rounded-xl font-medium text-sm hover:bg-orange-500/90 transition-colors">
                                        Save Changes
                                    </button>
                                </div>
                            </div>
                        </ComponentRow>

                        <ComponentRow label="Form Modal" description="Modal with form inputs">
                            <div className="w-[420px] bg-surface-container rounded-2xl shadow-2xl border border-outline-variant/20 overflow-hidden">
                                <div className="flex items-center justify-between px-5 py-4 border-b border-outline-variant/20">
                                    <h3 className="text-base font-semibold text-on-surface">Create Detection</h3>
                                    <button className="p-1 text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high rounded-lg transition-colors">
                                        <Icon name="x" className="w-5 h-5" />
                                    </button>
                                </div>
                                <div className="px-5 py-4 space-y-4">
                                    <div>
                                        <label className="block text-xs font-medium text-on-surface-variant mb-1.5">Detection Name</label>
                                        <input
                                            type="text"
                                            placeholder="Enter detection name"
                                            className="w-full px-3 py-2 text-sm bg-surface-container-lowest border border-outline-variant/30 rounded-lg text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:ring-2 focus:ring-[#783264]/30 focus:border-[#783264]"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-on-surface-variant mb-1.5">Severity</label>
                                        <div className="relative">
                                            <button className="w-full px-3 py-2 text-sm bg-surface-container border border-outline-variant/20 rounded-lg text-on-surface text-left flex items-center justify-between hover:bg-surface-container-high transition-colors">
                                                High
                                                <Icon name="chevron-down" className="w-4 h-4 text-on-surface-variant/50" />
                                            </button>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-on-surface-variant mb-1.5">Description</label>
                                        <textarea
                                            placeholder="Describe the detection..."
                                            rows={3}
                                            className="w-full px-3 py-2 text-sm bg-surface-container-lowest border border-outline-variant/30 rounded-lg text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:ring-2 focus:ring-[#783264]/30 focus:border-[#783264] resize-none"
                                        />
                                    </div>
                                </div>
                                <div className="flex justify-end gap-2 px-5 py-4 border-t border-outline-variant/20 bg-surface-container-low/50">
                                    <button className="px-4 py-2 text-sm font-medium text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high rounded-xl transition-colors">
                                        Cancel
                                    </button>
                                    <button className="px-4 py-2 bg-[#783264] text-white rounded-xl font-medium text-sm hover:bg-[#783264]/90 transition-colors">
                                        Create Detection
                                    </button>
                                </div>
                            </div>
                        </ComponentRow>

                        <ComponentRow label="Side Panel" description="Slide-in drawer for detail views">
                            <div className="w-[320px] h-[400px] bg-surface-container rounded-l-2xl shadow-2xl border border-outline-variant/20 border-r-0 overflow-hidden flex flex-col">
                                <div className="flex items-center justify-between px-4 py-3 border-b border-outline-variant/20">
                                    <h3 className="text-sm font-semibold text-on-surface">Detection Details</h3>
                                    <button className="p-1 text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high rounded-lg transition-colors">
                                        <Icon name="x" className="w-4 h-4" />
                                    </button>
                                </div>
                                <div className="flex-1 px-4 py-3 space-y-4 overflow-auto">
                                    <div>
                                        <span className="text-[10px] font-medium text-on-surface-variant uppercase tracking-wide">Status</span>
                                        <div className="mt-1">
                                            <span className="px-2 py-0.5 text-[9px] font-bold uppercase rounded-md bg-[#4D7C6F]/15 text-[#4D7C6F]">Production</span>
                                        </div>
                                    </div>
                                    <div>
                                        <span className="text-[10px] font-medium text-on-surface-variant uppercase tracking-wide">Severity</span>
                                        <div className="mt-1">
                                            <span className="px-2 py-0.5 text-[9px] font-bold uppercase rounded-md bg-[#A63D40]/15 text-[#A63D40]">Critical</span>
                                        </div>
                                    </div>
                                    <div>
                                        <span className="text-[10px] font-medium text-on-surface-variant uppercase tracking-wide">MITRE Mapping</span>
                                        <div className="mt-1 flex flex-wrap gap-1">
                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[9px] font-bold rounded-md bg-[#783264]/10 text-[#783264] border border-[#783264]/20">
                                                <Icon name="target" className="w-2.5 h-2.5" />TA0001
                                            </span>
                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[9px] font-bold rounded-md bg-purple-500/10 text-purple-600 border border-purple-500/20">
                                                <Icon name="zap" className="w-2.5 h-2.5" />T1566
                                            </span>
                                        </div>
                                    </div>
                                    <div>
                                        <span className="text-[10px] font-medium text-on-surface-variant uppercase tracking-wide">Description</span>
                                        <p className="mt-1 text-xs text-on-surface-variant/80">Detects potential phishing attempts through email attachment analysis.</p>
                                    </div>
                                </div>
                                <div className="px-4 py-3 border-t border-outline-variant/20 bg-surface-container-low/50">
                                    <button className="w-full px-3 py-2 bg-[#783264] text-white rounded-lg font-medium text-xs hover:bg-[#783264]/90 transition-colors">
                                        Edit Detection
                                    </button>
                                </div>
                            </div>
                        </ComponentRow>
                    </Section>
                )}

                {/* ========== DROPDOWNS ========== */}
                {activeTab === 'dropdowns' && (
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
                )}

                {/* ========== LOADING ========== */}
                {activeTab === 'loading' && (
                    <Section title="Loading States" description="Innovative and expressive loading indicators">

                        {/* DS Color Reference */}
                        <div className="mb-6 p-4 bg-[#783264]/5 border border-[#783264]/20 rounded-xl">
                            <p className="text-xs font-medium text-[#783264] mb-2">DS Loading Color System:</p>
                            <div className="flex flex-wrap gap-3 text-[10px]">
                                <span className="px-2 py-1 rounded bg-[#783264]/10 text-[#783264]">Tertiary: #783264</span>
                                <span className="px-2 py-1 rounded bg-[#005091]/10 text-[#005091]">Primary: #005091</span>
                                <span className="px-2 py-1 rounded bg-[#4D7C6F]/10 text-[#4D7C6F]">Secondary: #4D7C6F</span>
                            </div>
                        </div>

                        <ComponentRow label="Orbital Loader (App Loader)" description="Main application loading animation with multi-ring orbital motion">
                            <div className="flex gap-12 items-center">
                                {/* Dark variant */}
                                <div className="flex flex-col items-center">
                                    <div className="bg-[#0a0c0f] rounded-2xl p-8">
                                        <div className="relative w-32 h-32">
                                            {/* Center breathing core - Tertiary */}
                                            <div
                                                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-[#783264]"
                                                style={{ animation: 'breathe 2s ease-in-out infinite' }}
                                            />
                                            {/* Inner orbit ring - Primary */}
                                            <div
                                                className="absolute inset-4 rounded-full border border-[#005091]/20"
                                                style={{ animation: 'orbit 3s linear infinite' }}
                                            >
                                                <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-[#005091]" />
                                            </div>
                                            {/* Middle orbit ring - Tertiary */}
                                            <div
                                                className="absolute inset-2 rounded-full border border-[#783264]/15"
                                                style={{ animation: 'orbitReverse 5s linear infinite' }}
                                            >
                                                <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-[#783264]/80" />
                                            </div>
                                            {/* Outer orbit ring - Secondary */}
                                            <div
                                                className="absolute inset-0 rounded-full border border-[#4D7C6F]/10"
                                                style={{ animation: 'orbit 8s linear infinite' }}
                                            >
                                                <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-[#4D7C6F]/70" />
                                            </div>
                                        </div>
                                    </div>
                                    <span className="text-[10px] text-on-surface-variant mt-2">Dark Theme</span>
                                </div>

                                {/* Light variant preview */}
                                <div className="flex flex-col items-center">
                                    <div className="bg-[#fafcff] rounded-2xl p-8 border border-outline-variant/30">
                                        <div className="relative w-32 h-32">
                                            <div
                                                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-[#783264]"
                                                style={{ animation: 'breathe 2s ease-in-out infinite' }}
                                            />
                                            <div
                                                className="absolute inset-4 rounded-full border border-[#005091]/30"
                                                style={{ animation: 'orbit 3s linear infinite' }}
                                            >
                                                <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-[#005091]" />
                                            </div>
                                            <div
                                                className="absolute inset-2 rounded-full border border-[#783264]/20"
                                                style={{ animation: 'orbitReverse 5s linear infinite' }}
                                            >
                                                <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-[#783264]/80" />
                                            </div>
                                            <div
                                                className="absolute inset-0 rounded-full border border-[#4D7C6F]/15"
                                                style={{ animation: 'orbit 8s linear infinite' }}
                                            >
                                                <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-[#4D7C6F]/70" />
                                            </div>
                                        </div>
                                    </div>
                                    <span className="text-[10px] text-on-surface-variant mt-2">Light Theme</span>
                                </div>
                            </div>
                        </ComponentRow>

                        <ComponentRow label="Orbital Loader Specs" description="Animation timing and structure">
                            <div className="bg-surface-container-low rounded-xl p-4 border border-outline-variant/20">
                                <table className="w-full text-xs">
                                    <thead>
                                        <tr className="border-b border-outline-variant/20">
                                            <th className="text-left py-2 text-on-surface-variant font-medium">Element</th>
                                            <th className="text-left py-2 text-on-surface-variant font-medium">Color</th>
                                            <th className="text-left py-2 text-on-surface-variant font-medium">Animation</th>
                                            <th className="text-left py-2 text-on-surface-variant font-medium">Duration</th>
                                        </tr>
                                    </thead>
                                    <tbody className="text-on-surface">
                                        <tr className="border-b border-outline-variant/10">
                                            <td className="py-2">Center Core</td>
                                            <td className="py-2"><span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-[#783264]" /> Tertiary</span></td>
                                            <td className="py-2 font-mono text-[10px]">breathe (scale + opacity)</td>
                                            <td className="py-2">2s</td>
                                        </tr>
                                        <tr className="border-b border-outline-variant/10">
                                            <td className="py-2">Inner Orbit</td>
                                            <td className="py-2"><span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-[#005091]" /> Primary</span></td>
                                            <td className="py-2 font-mono text-[10px]">orbit (clockwise)</td>
                                            <td className="py-2">3s</td>
                                        </tr>
                                        <tr className="border-b border-outline-variant/10">
                                            <td className="py-2">Middle Orbit</td>
                                            <td className="py-2"><span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-[#783264]/80" /> Tertiary/80</span></td>
                                            <td className="py-2 font-mono text-[10px]">orbitReverse (counter-clockwise)</td>
                                            <td className="py-2">5s</td>
                                        </tr>
                                        <tr>
                                            <td className="py-2">Outer Orbit</td>
                                            <td className="py-2"><span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-[#4D7C6F]/70" /> Secondary/70</span></td>
                                            <td className="py-2 font-mono text-[10px]">orbit (clockwise)</td>
                                            <td className="py-2">8s</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </ComponentRow>

                        <ComponentRow label="Pulsing Ring" description="Expanding ring animation">
                            <div className="flex gap-8 items-center">
                                <div className="relative w-12 h-12">
                                    <div className="absolute inset-0 rounded-full bg-[#783264]/20 animate-ping" />
                                    <div className="absolute inset-2 rounded-full bg-[#783264]/40 animate-ping" style={{ animationDelay: '150ms' }} />
                                    <div className="absolute inset-4 rounded-full bg-[#783264]" />
                                </div>
                                <div className="relative w-12 h-12">
                                    <div className="absolute inset-0 rounded-full bg-[#4D7C6F]/20 animate-ping" />
                                    <div className="absolute inset-2 rounded-full bg-[#4D7C6F]/40 animate-ping" style={{ animationDelay: '150ms' }} />
                                    <div className="absolute inset-4 rounded-full bg-[#4D7C6F]" />
                                </div>
                                <div className="relative w-12 h-12">
                                    <div className="absolute inset-0 rounded-full bg-[#0284C7]/20 animate-ping" />
                                    <div className="absolute inset-2 rounded-full bg-[#0284C7]/40 animate-ping" style={{ animationDelay: '150ms' }} />
                                    <div className="absolute inset-4 rounded-full bg-[#0284C7]" />
                                </div>
                            </div>
                        </ComponentRow>

                        <ComponentRow label="AI Thinking Dots" description="Expressive AI processing indicator">
                            <div className="flex flex-col gap-4">
                                {/* Gradient dots */}
                                <div className="flex items-center gap-4 px-5 py-3 bg-gradient-to-r from-[#783264]/10 to-[#4D7C6F]/10 rounded-2xl border border-[#783264]/20">
                                    <div className="flex gap-1.5">
                                        <span className="w-3 h-3 rounded-full bg-gradient-to-br from-[#783264] to-[#4D7C6F] animate-bounce" style={{ animationDelay: '0ms' }} />
                                        <span className="w-3 h-3 rounded-full bg-gradient-to-br from-[#783264] to-[#4D7C6F] animate-bounce" style={{ animationDelay: '150ms' }} />
                                        <span className="w-3 h-3 rounded-full bg-gradient-to-br from-[#783264] to-[#4D7C6F] animate-bounce" style={{ animationDelay: '300ms' }} />
                                    </div>
                                    <span className="text-sm text-on-surface-variant">AI is analyzing...</span>
                                </div>
                                {/* Typing indicator style */}
                                <div className="flex items-center gap-3 px-4 py-3 bg-surface-container rounded-2xl w-fit">
                                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#783264] to-[#4D7C6F] flex items-center justify-center">
                                        <Icon name="spark" className="w-4 h-4 text-white" />
                                    </div>
                                    <div className="flex gap-1">
                                        <span className="w-2 h-2 rounded-full bg-[#783264] animate-pulse" style={{ animationDelay: '0ms' }} />
                                        <span className="w-2 h-2 rounded-full bg-[#783264]/70 animate-pulse" style={{ animationDelay: '200ms' }} />
                                        <span className="w-2 h-2 rounded-full bg-[#783264]/40 animate-pulse" style={{ animationDelay: '400ms' }} />
                                    </div>
                                </div>
                            </div>
                        </ComponentRow>

                        <ComponentRow label="Gradient Progress Ring" description="Circular progress with gradient">
                            <div className="flex gap-6 items-center">
                                {[
                                    { score: 85, from: '#4D7C6F', to: '#0284C7' },
                                    { score: 65, from: '#783264', to: '#A63D40' },
                                    { score: 45, from: '#0284C7', to: '#4D7C6F' },
                                ].map((item, idx) => {
                                    const radius = 22;
                                    const circumference = 2 * Math.PI * radius;
                                    const offset = circumference - (item.score / 100) * circumference;
                                    return (
                                        <div key={idx} className="relative" style={{ width: 64, height: 64 }}>
                                            <svg className="-rotate-90" style={{ width: 64, height: 64 }}>
                                                <defs>
                                                    <linearGradient id={`grad-${idx}`} x1="0%" y1="0%" x2="100%" y2="0%">
                                                        <stop offset="0%" stopColor={item.from} />
                                                        <stop offset="100%" stopColor={item.to} />
                                                    </linearGradient>
                                                </defs>
                                                <circle cx={32} cy={32} r={radius} fill="none" strokeWidth={6} stroke={`${item.from}15`} />
                                                <circle cx={32} cy={32} r={radius} fill="none" strokeWidth={6} stroke={`url(#grad-${idx})`} strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" />
                                            </svg>
                                            <span className="absolute inset-0 flex items-center justify-center font-bold text-base" style={{ color: item.from }}>
                                                {item.score}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        </ComponentRow>

                        <ComponentRow label="Shimmer Skeleton" description="Skeleton with shimmer effect">
                            <div className="w-[360px] bg-surface-container border border-outline-variant/30 rounded-2xl p-4 overflow-hidden">
                                <div className="flex items-start gap-3 mb-4">
                                    <div className="w-12 h-12 bg-surface-container-highest rounded-full relative overflow-hidden">
                                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full animate-[shimmer_2s_infinite]" style={{ animation: 'shimmer 2s infinite' }} />
                                    </div>
                                    <div className="flex-1 space-y-2">
                                        <div className="h-4 bg-surface-container-highest rounded w-2/3 relative overflow-hidden">
                                            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-pulse" />
                                        </div>
                                        <div className="h-3 bg-surface-container-highest rounded w-1/3 relative overflow-hidden">
                                            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-pulse" style={{ animationDelay: '150ms' }} />
                                        </div>
                                    </div>
                                </div>
                                <div className="space-y-2 mb-4">
                                    <div className="h-3 bg-surface-container-highest rounded w-full animate-pulse" />
                                    <div className="h-3 bg-surface-container-highest rounded w-4/5 animate-pulse" style={{ animationDelay: '100ms' }} />
                                </div>
                                <div className="flex gap-2">
                                    <div className="h-6 bg-surface-container-highest rounded-lg w-20 animate-pulse" />
                                    <div className="h-6 bg-surface-container-highest rounded-lg w-16 animate-pulse" style={{ animationDelay: '200ms' }} />
                                </div>
                            </div>
                        </ComponentRow>

                        <ComponentRow label="Progress Steps" description="Multi-step loading indicator">
                            <div className="w-[400px] bg-surface-container rounded-2xl p-5 border border-outline-variant/20">
                                <div className="flex items-center justify-between mb-4">
                                    <span className="text-sm font-medium text-on-surface">Publishing Detection</span>
                                    <span className="text-xs text-[#783264] font-bold">Step 2/4</span>
                                </div>
                                <div className="flex items-center gap-2 mb-3">
                                    {[
                                        { done: true },
                                        { active: true },
                                        { pending: true },
                                        { pending: true },
                                    ].map((step, i) => (
                                        <div key={i} className="flex-1 flex items-center gap-2">
                                            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                                                step.done ? 'bg-[#4D7C6F]' :
                                                step.active ? 'bg-[#783264] animate-pulse' :
                                                'bg-surface-container-highest'
                                            }`}>
                                                {step.done ? (
                                                    <Icon name="check" className="w-4 h-4 text-white" />
                                                ) : step.active ? (
                                                    <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                    </svg>
                                                ) : (
                                                    <span className="text-xs text-on-surface-variant">{i + 1}</span>
                                                )}
                                            </div>
                                            {i < 3 && (
                                                <div className={`flex-1 h-1 rounded-full ${
                                                    step.done ? 'bg-[#4D7C6F]' : 'bg-surface-container-highest'
                                                }`} />
                                            )}
                                        </div>
                                    ))}
                                </div>
                                <p className="text-xs text-on-surface-variant">Validating detection rules...</p>
                            </div>
                        </ComponentRow>

                        <ComponentRow label="Branded Loading Card" description="Full-featured loading state">
                            <div className="w-[320px] bg-gradient-to-br from-[#783264]/5 to-[#4D7C6F]/5 rounded-2xl p-6 border border-[#783264]/20">
                                <div className="flex flex-col items-center text-center">
                                    <div className="relative w-20 h-20 mb-4">
                                        <div className="absolute inset-0 rounded-full bg-gradient-to-br from-[#783264]/20 to-[#4D7C6F]/20 animate-pulse" />
                                        <div className="absolute inset-2 rounded-full bg-gradient-to-br from-[#783264]/30 to-[#4D7C6F]/30 animate-pulse" style={{ animationDelay: '150ms' }} />
                                        <div className="absolute inset-4 rounded-full bg-gradient-to-br from-[#783264] to-[#4D7C6F] flex items-center justify-center">
                                            <Icon name="shield" className="w-6 h-6 text-white" />
                                        </div>
                                    </div>
                                    <h3 className="text-base font-semibold text-on-surface mb-1">Analyzing Threats</h3>
                                    <p className="text-xs text-on-surface-variant mb-4">Scanning detection coverage...</p>
                                    <div className="w-full h-1.5 bg-surface-container-highest rounded-full overflow-hidden">
                                        <div className="h-full bg-gradient-to-r from-[#783264] to-[#4D7C6F] rounded-full w-2/3 animate-pulse" />
                                    </div>
                                </div>
                            </div>
                        </ComponentRow>

                        <ComponentRow label="Button Loading States" description="Loading indicators in buttons">
                            <div className="flex flex-wrap gap-3">
                                <button className="px-5 py-2.5 bg-gradient-to-r from-[#783264] to-[#783264]/80 text-white rounded-xl font-medium text-sm flex items-center gap-2">
                                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                    </svg>
                                    Saving...
                                </button>
                                <button className="px-5 py-2.5 bg-[#4D7C6F] text-white rounded-xl font-medium text-sm flex items-center gap-2">
                                    <div className="flex gap-0.5">
                                        <span className="w-1.5 h-1.5 rounded-full bg-white animate-bounce" style={{ animationDelay: '0ms' }} />
                                        <span className="w-1.5 h-1.5 rounded-full bg-white/70 animate-bounce" style={{ animationDelay: '150ms' }} />
                                        <span className="w-1.5 h-1.5 rounded-full bg-white/40 animate-bounce" style={{ animationDelay: '300ms' }} />
                                    </div>
                                    Publishing
                                </button>
                                <button className="px-5 py-2.5 border-2 border-[#783264]/30 text-[#783264] rounded-xl font-medium text-sm flex items-center gap-2 bg-[#783264]/5">
                                    <div className="w-4 h-4 rounded-full border-2 border-[#783264]/30 border-t-[#783264] animate-spin" />
                                    Loading...
                                </button>
                            </div>
                        </ComponentRow>

                        <ComponentRow label="Inline Loading" description="Compact inline indicators">
                            <div className="flex flex-col gap-3">
                                <div className="flex items-center gap-2 text-sm text-on-surface-variant">
                                    <div className="w-4 h-4 rounded-full border-2 border-[#783264]/30 border-t-[#783264] animate-spin" />
                                    Fetching detections...
                                </div>
                                <div className="flex items-center gap-2 text-sm text-on-surface-variant">
                                    <div className="flex gap-0.5">
                                        <span className="w-1.5 h-1.5 rounded-full bg-[#4D7C6F] animate-pulse" />
                                        <span className="w-1.5 h-1.5 rounded-full bg-[#4D7C6F]/60 animate-pulse" style={{ animationDelay: '200ms' }} />
                                        <span className="w-1.5 h-1.5 rounded-full bg-[#4D7C6F]/30 animate-pulse" style={{ animationDelay: '400ms' }} />
                                    </div>
                                    Processing query...
                                </div>
                            </div>
                        </ComponentRow>
                    </Section>
                )}

                {/* ========== MISC ========== */}
                {activeTab === 'misc' && (
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

                        <ComponentRow label="Option A: Floating Card Toast" description="Elevated card with glow effect">
                            <div className="flex flex-col gap-4">
                                {/* Success with glow */}
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
                                {/* Error with glow */}
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
                            </div>
                        </ComponentRow>

                        <ComponentRow label="Option B: Pill Toast" description="Minimal floating pill style">
                            <div className="flex flex-col gap-3">
                                <div className="inline-flex items-center gap-2 pl-1.5 pr-4 py-1.5 bg-[#4D7C6F] rounded-full shadow-lg w-fit">
                                    <div className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center">
                                        <Icon name="check" className="w-3.5 h-3.5 text-white" />
                                    </div>
                                    <span className="text-sm font-medium text-white">Detection published</span>
                                </div>
                                <div className="inline-flex items-center gap-2 pl-1.5 pr-4 py-1.5 bg-[#A63D40] rounded-full shadow-lg w-fit">
                                    <div className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center">
                                        <Icon name="alert-circle" className="w-3.5 h-3.5 text-white" />
                                    </div>
                                    <span className="text-sm font-medium text-white">Failed to save</span>
                                </div>
                                <div className="inline-flex items-center gap-2 pl-1.5 pr-4 py-1.5 bg-[#0284C7] rounded-full shadow-lg w-fit">
                                    <div className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center">
                                        <Icon name="info" className="w-3.5 h-3.5 text-white" />
                                    </div>
                                    <span className="text-sm font-medium text-white">New version available</span>
                                </div>
                            </div>
                        </ComponentRow>

                        <ComponentRow label="Option C: Gradient Border Toast" description="Glass effect with gradient border">
                            <div className="flex flex-col gap-4">
                                <div className="relative w-[340px]">
                                    <div className="absolute inset-0 bg-gradient-to-r from-[#4D7C6F] to-[#0284C7] rounded-2xl" />
                                    <div className="relative m-[2px] p-4 bg-surface-container rounded-[14px] flex items-center gap-3">
                                        <Icon name="spark" className="w-6 h-6 text-[#4D7C6F]" />
                                        <div className="flex-1">
                                            <p className="text-sm font-semibold text-on-surface">AI Analysis Complete</p>
                                            <p className="text-xs text-on-surface-variant">3 optimization suggestions found</p>
                                        </div>
                                        <button className="px-3 py-1.5 text-xs font-medium text-white bg-[#4D7C6F] rounded-lg">View</button>
                                    </div>
                                </div>
                                <div className="relative w-[340px]">
                                    <div className="absolute inset-0 bg-gradient-to-r from-[#A63D40] to-orange-500 rounded-2xl" />
                                    <div className="relative m-[2px] p-4 bg-surface-container rounded-[14px] flex items-center gap-3">
                                        <Icon name="alert-triangle" className="w-6 h-6 text-[#A63D40]" />
                                        <div className="flex-1">
                                            <p className="text-sm font-semibold text-on-surface">Query Error</p>
                                            <p className="text-xs text-on-surface-variant">Syntax error on line 12</p>
                                        </div>
                                        <button className="px-3 py-1.5 text-xs font-medium text-white bg-[#A63D40] rounded-lg">Fix</button>
                                    </div>
                                </div>
                            </div>
                        </ComponentRow>

                        <ComponentRow label="Option D: Icon-Forward Toast" description="Large icon emphasis style">
                            <div className="flex gap-4">
                                <div className="flex flex-col items-center gap-2 p-5 bg-[#4D7C6F]/10 rounded-2xl border border-[#4D7C6F]/20 w-[140px]">
                                    <div className="w-14 h-14 rounded-2xl bg-[#4D7C6F] flex items-center justify-center shadow-lg">
                                        <Icon name="check" className="w-7 h-7 text-white" />
                                    </div>
                                    <p className="text-sm font-semibold text-[#4D7C6F] text-center">Saved!</p>
                                </div>
                                <div className="flex flex-col items-center gap-2 p-5 bg-[#A63D40]/10 rounded-2xl border border-[#A63D40]/20 w-[140px]">
                                    <div className="w-14 h-14 rounded-2xl bg-[#A63D40] flex items-center justify-center shadow-lg">
                                        <Icon name="x" className="w-7 h-7 text-white" />
                                    </div>
                                    <p className="text-sm font-semibold text-[#A63D40] text-center">Error</p>
                                </div>
                                <div className="flex flex-col items-center gap-2 p-5 bg-[#783264]/10 rounded-2xl border border-[#783264]/20 w-[140px]">
                                    <div className="w-14 h-14 rounded-2xl bg-[#783264] flex items-center justify-center shadow-lg">
                                        <Icon name="download" className="w-7 h-7 text-white" />
                                    </div>
                                    <p className="text-sm font-semibold text-[#783264] text-center">Ready</p>
                                </div>
                            </div>
                        </ComponentRow>

                        <ComponentRow label="Option E: Snackbar with Progress" description="Auto-dismiss with progress indicator">
                            <div className="flex flex-col gap-3">
                                <div className="w-[360px] bg-surface-container-highest rounded-xl shadow-xl overflow-hidden">
                                    <div className="flex items-center gap-3 px-4 py-3">
                                        <Icon name="check-circle" className="w-5 h-5 text-[#4D7C6F]" />
                                        <span className="flex-1 text-sm text-on-surface">Detection saved successfully</span>
                                        <button className="text-xs font-semibold text-[#783264] hover:underline">UNDO</button>
                                    </div>
                                    <div className="h-1 bg-[#4D7C6F]/20">
                                        <div className="h-full bg-[#4D7C6F] w-3/4" />
                                    </div>
                                </div>
                                <div className="w-[360px] bg-surface-container-highest rounded-xl shadow-xl overflow-hidden">
                                    <div className="flex items-center gap-3 px-4 py-3">
                                        <Icon name="alert-circle" className="w-5 h-5 text-[#A63D40]" />
                                        <span className="flex-1 text-sm text-on-surface">Failed to connect to server</span>
                                        <button className="text-xs font-semibold text-[#783264] hover:underline">RETRY</button>
                                    </div>
                                    <div className="h-1 bg-[#A63D40]/20">
                                        <div className="h-full bg-[#A63D40] w-1/2" />
                                    </div>
                                </div>
                            </div>
                        </ComponentRow>

                        <ComponentRow label="Option F: Minimal Line Toast" description="Ultra-minimal notification">
                            <div className="flex flex-col gap-2">
                                <div className="flex items-center gap-3 px-4 py-3 bg-surface-container rounded-xl border-l-4 border-[#4D7C6F] shadow-md w-[300px]">
                                    <span className="text-sm text-on-surface">Changes saved</span>
                                    <Icon name="check" className="w-4 h-4 text-[#4D7C6F] ml-auto" />
                                </div>
                                <div className="flex items-center gap-3 px-4 py-3 bg-surface-container rounded-xl border-l-4 border-[#A63D40] shadow-md w-[300px]">
                                    <span className="text-sm text-on-surface">Connection lost</span>
                                    <Icon name="wifi-off" className="w-4 h-4 text-[#A63D40] ml-auto" />
                                </div>
                                <div className="flex items-center gap-3 px-4 py-3 bg-surface-container rounded-xl border-l-4 border-[#0284C7] shadow-md w-[300px]">
                                    <span className="text-sm text-on-surface">Update available</span>
                                    <Icon name="download" className="w-4 h-4 text-[#0284C7] ml-auto" />
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
                )}

                {/* MITRE Tooltip designs moved to dedicated page: /design-system/mitre-tooltip */}


                {activeTab === 'color-system' && (
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
                )}

                </div>
            </div>

            {/* Modal Overlay */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-scrim/50 flex items-center justify-center z-50" onClick={() => setIsModalOpen(false)}>
                    <div className="bg-surface-container rounded-2xl shadow-2xl w-[420px] border border-outline-variant/20" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between px-5 py-4 border-b border-outline-variant/20">
                            <h3 className="text-base font-semibold text-on-surface">Example Modal</h3>
                            <button onClick={() => setIsModalOpen(false)} className="p-1 text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high rounded-lg transition-colors">
                                <Icon name="x" className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="px-5 py-4">
                            <p className="text-sm text-on-surface-variant">This is a working modal dialog. Click outside or the X button to close it.</p>
                        </div>
                        <div className="flex justify-end gap-2 px-5 py-4 border-t border-outline-variant/20 bg-surface-container-low/50">
                            <button onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-sm font-medium text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high rounded-xl transition-colors">
                                Cancel
                            </button>
                            <button onClick={() => setIsModalOpen(false)} className="px-4 py-2 bg-primary text-on-primary rounded-xl font-medium text-sm hover:bg-primary/90 transition-colors">
                                Confirm
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ComponentShowcase;
