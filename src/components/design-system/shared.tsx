import React from 'react';
import { Icon } from '../Icon';

// =============================================================================
// SHARED DESIGN SYSTEM COMPONENTS
// =============================================================================

// Source badge - indicates which project/page the component comes from
export type SourceType = 'detection-studio' | 'soc-compass' | 'shared';

export const SourceBadge: React.FC<{ source: SourceType; page?: string }> = ({ source, page }) => {
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
export const Section: React.FC<{ title: string; description?: string; children: React.ReactNode }> = ({
    title, description, children
}) => (
    <div className="mb-12">
        <h2 className="text-xl font-semibold text-on-surface mb-1">{title}</h2>
        {description && <p className="text-sm text-on-surface-variant/70 mb-6">{description}</p>}
        <div className="space-y-6">{children}</div>
    </div>
);

// Component variant display with source indication and selection
export const ComponentRow: React.FC<{
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
export const CodeSnippet: React.FC<{ code: string }> = ({ code }) => (
    <pre className="mt-2 p-3 bg-surface-container rounded-lg text-xs font-mono text-on-surface-variant overflow-x-auto">
        {code}
    </pre>
);

// Page layout wrapper for design system pages
export const DesignSystemPage: React.FC<{
    title: string;
    description: string;
    children: React.ReactNode
}> = ({ title, description, children }) => (
    <div className="h-full flex flex-col bg-background">
        <div className="flex-1 overflow-y-auto">
            <div className="max-w-6xl mx-auto px-6 py-8">
                <div className="mb-8">
                    <h1 className="text-2xl font-bold text-on-surface">{title}</h1>
                    <p className="text-sm text-on-surface-variant/70 mt-1">{description}</p>
                </div>
                {children}
            </div>
        </div>
    </div>
);

// M3 Official Button Styles - Following official Material Design 3 specifications
export const m3ButtonBase = "h-10 px-6 rounded-[20px] text-sm font-medium transition-all duration-200 flex items-center justify-center gap-2 min-w-[48px]";
export const m3ButtonWithIcon = "h-10 pl-4 pr-6 rounded-[20px] text-sm font-medium transition-all duration-200 flex items-center justify-center gap-2";
export const m3IconButton = "w-10 h-10 rounded-full flex items-center justify-center transition-all duration-200";
export const m3FabSmall = "w-10 h-10 rounded-xl flex items-center justify-center shadow-md transition-all duration-200";
export const m3FabMedium = "w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg transition-all duration-200";
export const m3FabLarge = "w-24 h-24 rounded-[28px] flex items-center justify-center shadow-xl transition-all duration-200";
export const m3SegmentedButton = "h-10 px-4 text-sm font-medium transition-all duration-200 flex items-center justify-center gap-2 border border-outline";
