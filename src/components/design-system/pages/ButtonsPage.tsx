import React, { useState } from 'react';
import { Section, ComponentRow, DesignSystemPage } from '../shared';
import { Button, FAB } from '../../ui';

export const ButtonsPage: React.FC = () => {
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

    return (
        <DesignSystemPage
            title="Button System"
            description="Detection Studio button components with brand color palette"
        >
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

            <Section title="Filled Buttons by Color">
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
            </Section>

            <Section title="Button Variants (Primary)">
                <ComponentRow id="btn-variants-primary" label="All Variants" description="Filled, Tonal, Outlined, Elevated, Text" source="detection-studio" page="Button.tsx" isSelected={selectedComponents.has('btn-variants-primary')} onToggleSelect={toggleSelection}>
                    <Button color="primary" variant="filled">Filled</Button>
                    <Button color="primary" variant="tonal">Tonal</Button>
                    <Button color="primary" variant="outlined">Outlined</Button>
                    <Button color="primary" variant="elevated">Elevated</Button>
                    <Button color="primary" variant="text">Text</Button>
                </ComponentRow>
            </Section>

            <Section title="Button Variants (Secondary)">
                <ComponentRow id="btn-variants-secondary" label="All Variants" description="Filled, Tonal, Outlined, Elevated, Text" source="detection-studio" page="Button.tsx" isSelected={selectedComponents.has('btn-variants-secondary')} onToggleSelect={toggleSelection}>
                    <Button color="secondary" variant="filled">Filled</Button>
                    <Button color="secondary" variant="tonal">Tonal</Button>
                    <Button color="secondary" variant="outlined">Outlined</Button>
                    <Button color="secondary" variant="elevated">Elevated</Button>
                    <Button color="secondary" variant="text">Text</Button>
                </ComponentRow>
            </Section>

            <Section title="Button Variants (Error)">
                <ComponentRow id="btn-variants-error" label="All Variants" description="Filled, Tonal, Outlined, Elevated, Text" source="detection-studio" page="Button.tsx" isSelected={selectedComponents.has('btn-variants-error')} onToggleSelect={toggleSelection}>
                    <Button color="error" variant="filled">Filled</Button>
                    <Button color="error" variant="tonal">Tonal</Button>
                    <Button color="error" variant="outlined">Outlined</Button>
                    <Button color="error" variant="elevated">Elevated</Button>
                    <Button color="error" variant="text">Text</Button>
                </ComponentRow>
            </Section>

            <Section title="Button Sizes">
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
            </Section>

            <Section title="Buttons with Icons">
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
            </Section>

            <Section title="Button States">
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
            </Section>

            <Section title="Floating Action Button (FAB)">
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
            </Section>

            <Section title="Real-World Examples">
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
            </Section>

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
        </DesignSystemPage>
    );
};

export default ButtonsPage;
