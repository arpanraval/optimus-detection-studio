import React, { useState, useEffect } from 'react';
import { Icon } from '../Icon';
import { DetectionPack } from '../../types';
import { useBeforeUnload } from '../../hooks/useBeforeUnload';

interface CreatePackModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (pack: Partial<DetectionPack>) => Promise<void>;
  editPack?: DetectionPack | null;
}

const EMOJI_OPTIONS = ['📦', '🛡️', '☁️', '🔐', '🕷️', '🎯', '⚡', '🔥', '💀', '🚨', '🔍', '🛠️', '📊', '🌐', '💻', '🖥️'];

const SOURCE_OPTIONS = [
  { value: 'custom', label: 'Custom', description: 'Created by your team' },
  { value: 'community', label: 'Community', description: 'Shared community pack' },
  { value: 'official', label: 'Official', description: 'Official Optimus pack' },
];

const PLATFORM_OPTIONS = ['Windows', 'Linux', 'macOS', 'AWS', 'Azure', 'GCP', 'Office 365', 'Kubernetes', 'Network', 'IaaS', 'SaaS', 'Containers'];

export const CreatePackModal: React.FC<CreatePackModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  editPack,
}) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [icon, setIcon] = useState('📦');
  const [source, setSource] = useState('custom');
  const [platforms, setPlatforms] = useState<string[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  const isEditMode = !!editPack;

  // Warn on refresh when form has content
  useBeforeUnload(isOpen && (name.trim().length > 0 || description.trim().length > 0));

  useEffect(() => {
    if (editPack) {
      setName(editPack.name);
      setDescription(editPack.description || '');
      setIcon(editPack.icon || '📦');
      setSource(editPack.source || 'custom');
      setPlatforms(editPack.platforms || []);
      setTags(editPack.tags || []);
    } else {
      resetForm();
    }
  }, [editPack, isOpen]);

  const resetForm = () => {
    setName('');
    setDescription('');
    setIcon('📦');
    setSource('custom');
    setPlatforms([]);
    setTags([]);
    setTagInput('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsSubmitting(true);
    try {
      await onSubmit({
        id: editPack?.id,
        name: name.trim(),
        description: description.trim() || null,
        icon,
        source,
        platforms,
        tags,
      });
      onClose();
      resetForm();
    } catch (error) {
      console.error('Failed to save pack:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddTag = () => {
    const tag = tagInput.trim();
    if (tag && !tags.includes(tag)) {
      setTags([...tags, tag]);
      setTagInput('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter(t => t !== tagToRemove));
  };

  const handleTagKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddTag();
    }
  };

  const togglePlatform = (platform: string) => {
    if (platforms.includes(platform)) {
      setPlatforms(platforms.filter(p => p !== platform));
    } else {
      setPlatforms([...platforms, platform]);
    }
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
          <h2 className="text-lg font-semibold text-on-surface">
            {isEditMode ? 'Edit Pack' : 'Create Detection Pack'}
          </h2>
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
                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                className="w-16 h-16 rounded-xl bg-surface-container-high border border-outline-variant/30 flex items-center justify-center text-3xl hover:border-primary/50 transition-colors"
              >
                {icon}
              </button>
              {showEmojiPicker && (
                <div className="absolute top-full left-0 mt-2 p-3 bg-surface-container-highest rounded-xl border border-outline-variant/30 shadow-xl z-10 grid grid-cols-8 gap-2">
                  {EMOJI_OPTIONS.map(emoji => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => { setIcon(emoji); setShowEmojiPicker(false); }}
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
              placeholder="e.g., Scattered Spider Detection Pack"
              className="w-full px-4 py-3 bg-surface-container-high border border-outline-variant/30 rounded-xl text-on-surface placeholder-on-surface-variant/50 focus:outline-none focus:border-primary transition-colors"
              required
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-on-surface-variant mb-2">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of what this pack covers..."
              rows={3}
              className="w-full px-4 py-3 bg-surface-container-high border border-outline-variant/30 rounded-xl text-on-surface placeholder-on-surface-variant/50 focus:outline-none focus:border-primary transition-colors resize-none"
            />
          </div>

          {/* Source */}
          <div>
            <label className="block text-sm font-medium text-on-surface-variant mb-2">Source</label>
            <div className="grid grid-cols-3 gap-2">
              {SOURCE_OPTIONS.map(option => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setSource(option.value)}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    source === option.value
                      ? 'bg-primary/10 border-primary text-on-surface'
                      : 'bg-surface-container-high border-outline-variant/30 text-on-surface-variant hover:border-primary/30'
                  }`}
                >
                  <div className="text-sm font-medium">{option.label}</div>
                  <div className="text-[10px] opacity-60">{option.description}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Platforms */}
          <div>
            <label className="block text-sm font-medium text-on-surface-variant mb-2">Platforms</label>
            <div className="flex flex-wrap gap-2">
              {PLATFORM_OPTIONS.map(platform => (
                <button
                  key={platform}
                  type="button"
                  onClick={() => togglePlatform(platform)}
                  className={`px-3 py-1.5 text-sm rounded-lg border transition-all ${
                    platforms.includes(platform)
                      ? 'bg-tertiary/10 border-tertiary text-tertiary'
                      : 'bg-surface-container-high border-outline-variant/30 text-on-surface-variant hover:border-tertiary/30'
                  }`}
                >
                  {platform}
                </button>
              ))}
            </div>
          </div>

          {/* Tags */}
          <div>
            <label className="block text-sm font-medium text-on-surface-variant mb-2">Tags</label>
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={handleTagKeyDown}
                placeholder="Add a tag..."
                className="flex-1 px-4 py-2 bg-surface-container-high border border-outline-variant/30 rounded-lg text-sm text-on-surface placeholder-on-surface-variant/50 focus:outline-none focus:border-primary transition-colors"
              />
              <button
                type="button"
                onClick={handleAddTag}
                disabled={!tagInput.trim()}
                className="px-4 py-2 bg-surface-container-highest text-on-surface-variant rounded-lg hover:bg-primary/10 hover:text-primary disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Add
              </button>
            </div>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {tags.map(tag => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1.5 px-3 py-1 bg-primary/10 text-primary text-sm rounded-lg"
                  >
                    {tag}
                    <button
                      type="button"
                      onClick={() => handleRemoveTag(tag)}
                      className="hover:text-error transition-colors"
                    >
                      <Icon name="x" className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
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
            disabled={!name.trim() || isSubmitting}
            className="px-6 py-2.5 bg-tertiary text-on-tertiary text-sm font-semibold rounded-xl hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-tertiary/20"
          >
            {isSubmitting ? (
              <Icon name="spinner" className="w-4 h-4 animate-spin" />
            ) : isEditMode ? (
              'Save Changes'
            ) : (
              'Create Pack'
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CreatePackModal;
