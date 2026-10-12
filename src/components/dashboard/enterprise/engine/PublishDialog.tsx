import { Select } from '@/components/ui/Select';
import React, { useState } from 'react';
import type { EngineWidgetConfig } from './types';

const CATEGORIES = [
  { value: 'overview', label: 'Overview' },
  { value: 'coverage', label: 'Coverage' },
  { value: 'threat-intel', label: 'Threat Intelligence' },
  { value: 'quality', label: 'Quality & Hygiene' },
  { value: 'operations', label: 'Operations' },
  { value: 'mitre', label: 'MITRE ATT&CK' },
];

interface PublishDialogProps {
  config: EngineWidgetConfig;
  onPublish: (name: string, description: string, category: string) => void;
  onCancel: () => void;
}

export function PublishDialog({ config, onPublish, onCancel }: PublishDialogProps): React.ReactElement {
  const [name, setName] = useState(config.title || '');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('overview');

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center" onClick={onCancel}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="relative bg-surface-container rounded-2xl shadow-2xl w-[400px] max-w-[90vw] overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-outline-variant/10">
          <h3 className="text-[14px] font-brand font-bold text-on-surface">Publish to Widget Catalog</h3>
          <p className="text-[11px] font-brand text-on-surface-variant mt-1">Share this widget configuration with your team.</p>
        </div>

        <div className="px-6 py-4 space-y-4">
          <div>
            <label className="text-[10px] font-brand font-bold text-on-surface-variant/60 uppercase tracking-wider">Name</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g., Production by Platform"
              className="w-full mt-1 px-3 py-2 text-[12px] font-brand bg-surface-container-lowest border border-outline-variant/20 rounded-lg text-on-surface outline-none focus:border-primary transition-colors"
            />
          </div>

          <div>
            <label className="text-[10px] font-brand font-bold text-on-surface-variant/60 uppercase tracking-wider">Description</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="What does this widget show?"
              rows={3}
              className="w-full mt-1 px-3 py-2 text-[12px] font-brand bg-surface-container-lowest border border-outline-variant/20 rounded-lg text-on-surface outline-none focus:border-primary transition-colors resize-none"
            />
          </div>

          <div>
            <label className="text-[10px] font-brand font-bold text-on-surface-variant/60 uppercase tracking-wider">Category</label>
            <Select
              value={category}
              onChange={(nextValue) => setCategory(nextValue)}
              aria-label="Category"
              size="sm"
              className="w-full mt-1"
              options={[...CATEGORIES.map((c) => ({ value: c.value, label: c.label }))]}
            />
          </div>
        </div>

        <div className="px-6 py-4 border-t border-outline-variant/10 flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-[12px] font-brand font-medium text-on-surface-variant hover:text-on-surface transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onPublish(name, description, category)}
            disabled={!name.trim()}
            className="px-4 py-2 text-[12px] font-brand font-bold text-on-primary bg-primary rounded-lg hover:opacity-90 transition-opacity disabled:opacity-40"
          >
            Publish
          </button>
        </div>
      </div>
    </div>
  );
}

export default PublishDialog;
