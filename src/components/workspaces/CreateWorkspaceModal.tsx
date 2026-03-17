import React, { useState, useEffect } from 'react';
import { Icon } from '../Icon';
import { useWorkspace } from '../../context/WorkspaceContext';
import { generateWorkspaceSlug } from '../../types';

interface CreateWorkspaceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (workspaceId: string) => void;
}

const ICON_OPTIONS = ['🏢', '🛡️', '🔒', '⚡', '🎯', '🔍', '📊', '🚀', '💼', '🌐', '☁️', '🔐', '📦', '🖥️', '💻', '🛠️'];

export const CreateWorkspaceModal: React.FC<CreateWorkspaceModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { createWorkspace } = useWorkspace();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [icon, setIcon] = useState('🏢');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showIconPicker, setShowIconPicker] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset form when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      resetForm();
    }
  }, [isOpen]);

  // Auto-generate slug from name
  useEffect(() => {
    if (name) {
      setSlug(generateWorkspaceSlug(name));
    }
  }, [name]);

  const resetForm = () => {
    setName('');
    setSlug('');
    setDescription('');
    setIcon('🏢');
    setError(null);
    setShowIconPicker(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !slug.trim()) {
      setError('Name and slug are required');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    const result = await createWorkspace(name.trim(), slug.trim(), description.trim() || undefined, icon);
    
    if (result.success && result.workspace_id) {
      onSuccess(result.workspace_id);
      resetForm();
    } else {
      setError(result.error || 'Failed to create workspace');
    }
    
    setIsSubmitting(false);
  };

  const handleSlugChange = (value: string) => {
    // Only allow lowercase letters, numbers, and hyphens
    const sanitized = value.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-');
    setSlug(sanitized);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-lg bg-surface-container rounded-2xl shadow-2xl border border-outline-variant/20 overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-outline-variant/20 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-on-surface">Create Workspace</h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-on-surface-variant hover:bg-surface-container-high transition-colors"
          >
            <Icon name="x" className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">
          {/* Icon Selector */}
          <div>
            <label className="block text-sm font-medium text-on-surface-variant mb-2">Icon</label>
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowIconPicker(!showIconPicker)}
                className="w-16 h-16 rounded-xl bg-surface-container-high border border-outline-variant/30 flex items-center justify-center text-3xl hover:border-primary/50 transition-colors"
              >
                {icon}
              </button>
              {showIconPicker && (
                <div className="absolute top-full left-0 mt-2 p-3 bg-surface-container-highest rounded-xl border border-outline-variant/30 shadow-xl z-10 grid grid-cols-8 gap-2">
                  {ICON_OPTIONS.map(emoji => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => { setIcon(emoji); setShowIconPicker(false); }}
                      className={`w-10 h-10 rounded-lg flex items-center justify-center text-xl hover:bg-primary/10 transition-colors ${icon === emoji ? 'bg-primary/20 ring-2 ring-primary' : ''}`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-on-surface-variant mb-2">
              Name <span className="text-error">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Client XYZ SOC"
              className="w-full px-4 py-3 bg-surface-container-high border border-outline-variant/30 rounded-xl text-on-surface placeholder-on-surface-variant/50 focus:outline-none focus:border-primary transition-colors"
              required
            />
          </div>

          {/* Slug */}
          <div>
            <label className="block text-sm font-medium text-on-surface-variant mb-2">
              Slug <span className="text-error">*</span>
            </label>
            <input
              type="text"
              value={slug}
              onChange={(e) => handleSlugChange(e.target.value)}
              placeholder="client-xyz-soc"
              className="w-full px-4 py-3 bg-surface-container-high border border-outline-variant/30 rounded-xl text-on-surface placeholder-on-surface-variant/50 focus:outline-none focus:border-primary transition-colors font-mono text-sm"
              required
            />
            <p className="mt-1.5 text-xs text-on-surface-variant/60">
              URL-safe identifier. Only lowercase letters, numbers, and hyphens.
            </p>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-on-surface-variant mb-2">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of this workspace..."
              rows={3}
              className="w-full px-4 py-3 bg-surface-container-high border border-outline-variant/30 rounded-xl text-on-surface placeholder-on-surface-variant/50 focus:outline-none focus:border-primary transition-colors resize-none"
            />
          </div>

          {/* Error */}
          {error && (
            <div className="p-4 bg-error-container rounded-xl border border-error/30">
              <div className="flex items-center gap-3">
                <Icon name="alert-circle" className="w-5 h-5 text-error flex-shrink-0" />
                <p className="text-sm text-error">{error}</p>
              </div>
            </div>
          )}
        </form>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-outline-variant/20 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 text-sm font-medium text-on-surface-variant hover:text-on-surface transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!name.trim() || !slug.trim() || isSubmitting}
            className="px-6 py-2.5 bg-secondary text-on-secondary text-sm font-semibold rounded-xl hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-secondary/20"
          >
            {isSubmitting ? (
              <Icon name="spinner" className="w-4 h-4 animate-spin" />
            ) : (
              'Create Workspace'
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CreateWorkspaceModal;
