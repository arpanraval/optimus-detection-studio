import React from 'react';
import { DesignSystemPage, Section } from '../shared';
import { Icon } from '../../Icon';
import { useNavigate } from 'react-router-dom';
import type { IconName } from '../../Icon';

const categories: { id: string; label: string; icon: IconName; description: string; path: string }[] = [
    { id: 'buttons', label: 'Buttons', icon: 'zap', description: 'Button variants, FABs, and action components', path: '/design-system/buttons' },
    { id: 'inputs', label: 'Inputs', icon: 'edit', description: 'Text fields, selects, and form controls', path: '/design-system/inputs' },
    { id: 'badges', label: 'Badges & Chips', icon: 'flag', description: 'Status badges, tags, and filter chips', path: '/design-system/badges' },
    { id: 'cards', label: 'Cards', icon: 'box', description: 'Card layouts and content containers', path: '/design-system/cards' },
    { id: 'navigation', label: 'Navigation', icon: 'layers', description: 'Tabs, sidebars, and navigation patterns', path: '/design-system/navigation' },
    { id: 'modals', label: 'Modals', icon: 'package', description: 'Dialogs, sheets, and overlay components', path: '/design-system/modals' },
    { id: 'dropdowns', label: 'Dropdowns', icon: 'chevron-down', description: 'Menus, selects, and popovers', path: '/design-system/dropdowns' },
    { id: 'loading', label: 'Loading', icon: 'loader', description: 'Spinners, skeletons, and progress indicators', path: '/design-system/loading' },
    { id: 'misc', label: 'Miscellaneous', icon: 'grid', description: 'Icons, tooltips, and utility components', path: '/design-system/misc' },
    { id: 'colors', label: 'Color System', icon: 'palette', description: 'Theme colors, palettes, and semantic tokens', path: '/design-system/colors' },
    { id: 'login', label: 'Login Redesign', icon: 'lock', description: '4 login page design options — minimal, aesthetic, branded', path: '/design-system/login' },
    { id: 'mitre-tooltip', label: 'MITRE Tooltip', icon: 'shield', description: 'Technique tooltip redesign — 3 cyber-themed options', path: '/design-system/mitre-tooltip' },
    { id: 'onboarding-animation', label: 'Onboarding Animation', icon: 'activity', description: 'Pipeline visualization options — 4 design directions for the star feature', path: '/design-system/onboarding-animation' },
    { id: 'intel-cards', label: 'Intel Cards', icon: 'crosshairs', description: 'Threat group, campaign, and software card design — 3 approaches', path: '/design-system/intel-cards' },
    { id: 'ai-chat-cards', label: 'AI Chat Cards', icon: 'spark', description: 'Optimus Prime AI response cards — threat actor, coverage, search, gap analysis', path: '/design-system/ai-chat-cards' },
];

export const OverviewPage: React.FC = () => {
    const navigate = useNavigate();

    return (
        <DesignSystemPage
            title="M3 Component Library"
            description="Design system components following Material Design 3 principles"
        >
            <Section title="Component Categories" description="Browse components by category">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {categories.map((category) => (
                        <button
                            key={category.id}
                            onClick={() => navigate(category.path)}
                            className="p-4 bg-surface-container rounded-xl border border-outline-variant/20 hover:border-primary/30 hover:bg-surface-container-high transition-all text-left group"
                        >
                            <div className="flex items-start gap-3">
                                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary group-hover:bg-primary/20 transition-colors">
                                    <Icon name={category.icon} className="w-5 h-5" />
                                </div>
                                <div className="flex-1">
                                    <h3 className="text-sm font-semibold text-on-surface group-hover:text-primary transition-colors">{category.label}</h3>
                                    <p className="text-xs text-on-surface-variant mt-1">{category.description}</p>
                                </div>
                                <Icon name="chevron-right" className="w-4 h-4 text-on-surface-variant/50 group-hover:text-primary transition-colors" />
                            </div>
                        </button>
                    ))}
                </div>
            </Section>

            <Section title="Design Principles" description="Core principles guiding our component design">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="p-4 bg-surface-container rounded-xl">
                        <h4 className="text-sm font-semibold text-on-surface mb-2">Consistency</h4>
                        <p className="text-xs text-on-surface-variant">Components follow consistent patterns for spacing, typography, and interaction.</p>
                    </div>
                    <div className="p-4 bg-surface-container rounded-xl">
                        <h4 className="text-sm font-semibold text-on-surface mb-2">Accessibility</h4>
                        <p className="text-xs text-on-surface-variant">Built with WCAG compliance, keyboard navigation, and screen reader support.</p>
                    </div>
                    <div className="p-4 bg-surface-container rounded-xl">
                        <h4 className="text-sm font-semibold text-on-surface mb-2">Theming</h4>
                        <p className="text-xs text-on-surface-variant">Full dark/light mode support with semantic color tokens.</p>
                    </div>
                </div>
            </Section>

            <Section title="Brand Colors" description="Primary color palette used throughout the application">
                <div className="flex flex-wrap gap-4">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-xl shadow-lg" style={{ backgroundColor: '#783264' }} />
                        <div>
                            <p className="text-sm font-semibold text-on-surface">Primary</p>
                            <p className="text-xs text-on-surface-variant">#783264</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-xl shadow-lg" style={{ backgroundColor: '#4D7C6F' }} />
                        <div>
                            <p className="text-sm font-semibold text-on-surface">Secondary</p>
                            <p className="text-xs text-on-surface-variant">#4D7C6F</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-xl shadow-lg" style={{ backgroundColor: '#005091' }} />
                        <div>
                            <p className="text-sm font-semibold text-on-surface">Tertiary</p>
                            <p className="text-xs text-on-surface-variant">#005091</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-xl shadow-lg" style={{ backgroundColor: '#A63D40' }} />
                        <div>
                            <p className="text-sm font-semibold text-on-surface">Error</p>
                            <p className="text-xs text-on-surface-variant">#A63D40</p>
                        </div>
                    </div>
                </div>
            </Section>
        </DesignSystemPage>
    );
};

export default OverviewPage;
