import React, { useState } from 'react';
import { DesignSystemPage, Section, ComponentRow } from '../shared';
import { Icon } from '../../Icon';

export const ModalsPage: React.FC = () => {
    const [isModalOpen, setIsModalOpen] = useState(false);

    return (
        <DesignSystemPage
            title="Modals & Dialogs"
            description="Overlay dialogs for focused interactions"
        >
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

            {/* Modal Overlay - shown when isModalOpen is true */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center">
                    <div
                        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                        onClick={() => setIsModalOpen(false)}
                    />
                    <div className="relative w-[420px] bg-surface-container rounded-2xl shadow-2xl border border-outline-variant/20 overflow-hidden">
                        {/* Header */}
                        <div className="flex items-center justify-between px-5 py-4 border-b border-outline-variant/20">
                            <h3 className="text-base font-semibold text-on-surface">Modal Title</h3>
                            <button
                                onClick={() => setIsModalOpen(false)}
                                className="p-1 text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high rounded-lg transition-colors"
                            >
                                <Icon name="x" className="w-5 h-5" />
                            </button>
                        </div>
                        {/* Content */}
                        <div className="px-5 py-4">
                            <p className="text-sm text-on-surface-variant">This is the modal content area. You can put any content here including forms, lists, or other components.</p>
                        </div>
                        {/* Footer */}
                        <div className="flex justify-end gap-2 px-5 py-4 border-t border-outline-variant/20 bg-surface-container-low/50">
                            <button
                                onClick={() => setIsModalOpen(false)}
                                className="px-4 py-2 text-sm font-medium text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high rounded-xl transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => setIsModalOpen(false)}
                                className="px-4 py-2 bg-primary text-on-primary rounded-xl font-medium text-sm hover:bg-primary/90 transition-colors"
                            >
                                Confirm
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </DesignSystemPage>
    );
};

export default ModalsPage;
