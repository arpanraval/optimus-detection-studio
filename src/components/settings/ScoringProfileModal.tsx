/**
 * Scoring Profile Modal
 *
 * Modal for creating or editing a scoring profile.
 * Includes name, description, and the full weight editor.
 */

import React, { useState } from 'react';
import { Button } from '../ui/Button';
import { Icon } from '../Icon';
import { useScoring } from '../../context/ScoringContext';
import {
  QualityWeights,
  DEFAULT_WEIGHTS,
  WEIGHT_DIMENSIONS,
  DIMENSION_LABELS,
  weightsSum,
  validateWeights,
} from '../../lib/quality';
import { ScoringProfile } from '../../hooks/useScoringProfile';

interface ScoringProfileModalProps {
  profile: ScoringProfile | null; // null = create mode
  onClose: () => void;
}

export const ScoringProfileModal: React.FC<ScoringProfileModalProps> = ({ profile, onClose }) => {
  const { createProfile, updateProfile } = useScoring();
  const isEditing = !!profile;

  const [name, setName] = useState(profile?.name || '');
  const [description, setDescription] = useState(profile?.description || '');
  const [isDefault, setIsDefault] = useState(profile?.is_default || false);
  const [weights, setWeights] = useState<QualityWeights>(profile?.weights || { ...DEFAULT_WEIGHTS });
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const total = weightsSum(weights);
  const isValid = validateWeights(weights) && name.trim().length > 0;

  const handleSave = async () => {
    if (!isValid) return;
    setIsSaving(true);
    setError(null);

    try {
      if (isEditing && profile) {
        const success = await updateProfile(profile.id, {
          name: name.trim(),
          description: description.trim() || undefined,
          is_default: isDefault,
          weights,
        });
        if (!success) {
          setError('Failed to update profile');
          return;
        }
      } else {
        const result = await createProfile({
          name: name.trim(),
          description: description.trim() || undefined,
          is_default: isDefault,
          weights,
        });
        if (!result) {
          setError('Failed to create profile');
          return;
        }
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-surface-container rounded-2xl border border-outline-variant/20 shadow-2xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-outline-variant/10 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-on-surface">
            {isEditing ? 'Edit Scoring Profile' : 'New Scoring Profile'}
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-on-surface-variant/60 hover:text-on-surface hover:bg-surface-container-highest transition-colors"
          >
            <Icon name="x" className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {error && (
            <div className="bg-error/10 border border-error/20 rounded-xl p-3 text-sm text-error">
              {error}
            </div>
          )}

          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-on-surface mb-1.5">Profile Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., SOC Team Weights"
              className="w-full px-4 py-2.5 rounded-xl bg-surface-container-highest border border-outline-variant/20 text-sm text-on-surface placeholder:text-on-surface-variant/30 focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-on-surface mb-1.5">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe when this profile should be used..."
              rows={2}
              className="w-full px-4 py-2.5 rounded-xl bg-surface-container-highest border border-outline-variant/20 text-sm text-on-surface placeholder:text-on-surface-variant/30 focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
            />
          </div>

          {/* Default toggle */}
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
              className="w-4 h-4 rounded border-outline-variant/30 text-primary focus:ring-primary/30"
            />
            <span className="text-sm text-on-surface">Set as default profile</span>
          </label>

          {/* Weights */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-medium text-on-surface">Weights</label>
              <span className={`text-sm font-mono font-bold px-2 py-0.5 rounded-md border ${
                total === 100
                  ? 'bg-[#4D7C6F]/10 text-[#4D7C6F] border-[#4D7C6F]/20'
                  : 'bg-[#A63D40]/10 text-[#A63D40] border-[#A63D40]/20'
              }`}>
                {total} / 100
              </span>
            </div>
            <div className="space-y-3">
              {WEIGHT_DIMENSIONS.map(dim => (
                <div key={dim} className="flex items-center gap-3">
                  <span className="text-sm text-on-surface-variant w-40 flex-shrink-0 truncate">{DIMENSION_LABELS[dim]}</span>
                  <div className="flex-1 relative group/slider h-5 flex items-center">
                    <div className="absolute left-0 right-0 h-1.5 rounded-full bg-primary/10 overflow-hidden pointer-events-none">
                      <div
                        className="h-full bg-primary rounded-full transition-all duration-100"
                        style={{ width: `${(weights[dim] / 50) * 100}%` }}
                      />
                    </div>
                    <div
                      className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 pointer-events-none
                        w-1 h-4 rounded-full bg-primary shadow-sm
                        opacity-0 group-hover/slider:opacity-100
                        transition-opacity duration-150"
                      style={{ left: `${(weights[dim] / 50) * 100}%` }}
                    />
                    <input
                      type="range"
                      min={0}
                      max={50}
                      value={weights[dim]}
                      onChange={(e) => setWeights(prev => ({ ...prev, [dim]: parseInt(e.target.value, 10) }))}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-grab active:cursor-grabbing"
                    />
                  </div>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={weights[dim]}
                    onChange={(e) => setWeights(prev => ({ ...prev, [dim]: Math.max(0, Math.min(100, parseInt(e.target.value, 10) || 0)) }))}
                    className="w-12 h-8 rounded-md bg-surface-container-highest border border-outline-variant/10 text-xs text-center font-mono text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-outline-variant/10 flex items-center justify-end gap-3">
          <Button variant="text" color="surface" size="md" onClick={onClose}>Cancel</Button>
          <Button variant="filled" color="primary" size="md" onClick={handleSave} disabled={!isValid} loading={isSaving}>{isEditing ? 'Update Profile' : 'Create Profile'}</Button>
        </div>
      </div>
    </div>
  );
};
