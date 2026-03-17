/**
 * Quality Weights Configuration Page
 *
 * Allows admins to configure quality scoring weight profiles.
 * Full-width layout with weight sliders, total validation, and impact preview.
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Icon } from '../Icon';
import { Button } from '../ui/Button';
import { useScoring } from '../../context/ScoringContext';
import { useAppData } from '../../router/AppDataContext';
import { useToast } from '../../hooks/useToast';
import { logAuditEvent } from '../../lib/audit';
import {
  QualityWeights,
  DEFAULT_WEIGHTS,
  WEIGHT_DIMENSIONS,
  DIMENSION_LABELS,
  DIMENSION_DESCRIPTIONS,
  weightsSum,
  validateWeights,
  scoreDetection,
} from '../../lib/quality';
import { ScoringProfile } from '../../hooks/useScoringProfile';
import { ScoringProfileModal } from './ScoringProfileModal';

// Max weight per dimension — shared by slider and number input
const MAX_WEIGHT = 50;

// Grade colors using brand severity palette
const GRADE_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  A: { bg: 'bg-[#4D7C6F]/15', text: 'text-[#4D7C6F]', border: 'border-[#4D7C6F]/20' },
  B: { bg: 'bg-[#0284C7]/15', text: 'text-[#0284C7]', border: 'border-[#0284C7]/20' },
  C: { bg: 'bg-[#D97706]/15', text: 'text-[#D97706]', border: 'border-[#D97706]/20' },
  D: { bg: 'bg-[#D97706]/10', text: 'text-[#D97706]/70', border: 'border-[#D97706]/15' },
  F: { bg: 'bg-[#A63D40]/15', text: 'text-[#A63D40]', border: 'border-[#A63D40]/20' },
};

// ============================================
// MAIN COMPONENT
// ============================================

export const QualityWeightsPage: React.FC = () => {
  const {
    profiles,
    activeProfile,
    activeWeights,
    isLoading,
    error,
    updateProfile,
    deleteProfile,
    setActiveProfile,
  } = useScoring();
  const { detections } = useAppData();
  const { showToast } = useToast();

  const [draftWeights, setDraftWeights] = useState<QualityWeights>(activeWeights);
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [editingProfile, setEditingProfile] = useState<ScoringProfile | null>(null);

  // Sync draft weights when active profile changes
  useEffect(() => {
    setDraftWeights(activeWeights);
    setIsDirty(false);
  }, [activeWeights]);

  // Warn before navigating away with unsaved changes
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  const total = weightsSum(draftWeights);
  const isValid = validateWeights(draftWeights);

  // Impact preview: score all detections with draft vs active weights
  const impactPreview = useMemo(() => {
    const allDetections = detections || [];
    if (allDetections.length === 0) return null;

    const beforeGrades: Record<string, number> = { A: 0, B: 0, C: 0, D: 0, F: 0 };
    const afterGrades: Record<string, number> = { A: 0, B: 0, C: 0, D: 0, F: 0 };
    let totalDelta = 0;

    for (const det of allDetections) {
      const before = scoreDetection(det, activeWeights);
      const after = scoreDetection(det, draftWeights);
      beforeGrades[before.grade]++;
      afterGrades[after.grade]++;
      totalDelta += after.score - before.score;
    }

    return {
      count: allDetections.length,
      beforeGrades,
      afterGrades,
      avgDelta: Math.round(totalDelta / allDetections.length),
    };
  }, [detections, activeWeights, draftWeights]);

  const handleWeightChange = (dimension: keyof QualityWeights, value: number) => {
    setDraftWeights(prev => ({ ...prev, [dimension]: value }));
    setIsDirty(true);
  };

  const handleProfileSwitch = useCallback((profileId: string) => {
    if (isDirty) {
      if (!confirm('You have unsaved weight changes. Discard them and switch profile?')) return;
    }
    setActiveProfile(profileId);
  }, [isDirty, setActiveProfile]);

  const handleReset = () => {
    setDraftWeights(activeWeights);
    setIsDirty(false);
  };

  const handleResetToDefault = () => {
    setDraftWeights(DEFAULT_WEIGHTS);
    setIsDirty(true);
  };

  const handleSave = async () => {
    if (!activeProfile || !isValid) return;
    setIsSaving(true);
    const success = await updateProfile(activeProfile.id, { weights: draftWeights });
    if (success) {
      setIsDirty(false);
      showToast('success', 'Weights Saved', `Profile "${activeProfile.name}" updated.`);
      logAuditEvent({
        action: 'settings.quality_weights_changed',
        entity_type: 'scoring_profile',
        entity_id: activeProfile.id,
        entity_name: activeProfile.name,
        details: { weights: draftWeights },
      });
    } else {
      showToast('error', 'Save Failed', 'Could not update the scoring profile. Please try again.');
    }
    setIsSaving(false);
  };

  const handleDeleteProfile = async (profile: ScoringProfile) => {
    if (profile.is_default) return;
    // Guard: prevent deleting the last profile
    if (profiles.length <= 1) {
      showToast('error', 'Cannot Delete', 'You must have at least one scoring profile.');
      return;
    }
    if (!confirm(`Delete profile "${profile.name}"? This cannot be undone.`)) return;
    const success = await deleteProfile(profile.id);
    if (success) {
      showToast('info', 'Profile Deleted', `"${profile.name}" has been removed.`);
      logAuditEvent({
        action: 'settings.quality_weights_changed',
        entity_type: 'scoring_profile',
        entity_id: profile.id,
        entity_name: profile.name,
        details: { action: 'deleted' },
      });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary/30"></div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {error && (
        <div className="bg-[#A63D40]/10 border border-[#A63D40]/20 rounded-xl p-4 text-sm text-[#A63D40]">
          {error}
        </div>
      )}

      {/* Profile Selector Bar */}
      <div className="flex items-center justify-between bg-surface-container rounded-2xl border border-outline-variant/10 px-5 py-3">
        <div className="flex items-center gap-3">
          <span className="text-xs font-bold text-on-surface-variant/50 uppercase tracking-wider">Profile</span>
          <select
            value={activeProfile?.id || ''}
            onChange={(e) => handleProfileSwitch(e.target.value)}
            className="px-3 py-1.5 rounded-lg bg-surface-container-highest border border-outline-variant/15 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40"
          >
            {profiles.map(p => (
              <option key={p.id} value={p.id}>
                {p.name}{p.is_default ? ' (Default)' : ''}
              </option>
            ))}
          </select>
          {activeProfile?.description && (
            <span className="text-xs text-on-surface-variant/40 hidden lg:inline">{activeProfile.description}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {activeProfile && !activeProfile.is_default && (
            <Button
              variant="outlined"
              color="error"
              size="sm"
              leadingIcon="trash"
              onClick={() => handleDeleteProfile(activeProfile)}
            >
              Delete
            </Button>
          )}
          <Button
            variant="filled"
            color="secondary"
            size="sm"
            leadingIcon="plus"
            onClick={() => { setEditingProfile(null); setShowProfileModal(true); }}
          >
            New Profile
          </Button>
        </div>
      </div>

      {/* Weight Editor + Preview - full width grid */}
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-5">
        {/* Weight Sliders - takes 3/4 of space */}
        <div className="xl:col-span-3 bg-surface-container rounded-2xl border border-outline-variant/10 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-outline-variant/10 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-on-surface">Dimension Weights</h3>
              <p className="text-xs text-on-surface-variant/40 mt-0.5">Adjust how each quality dimension contributes to the total score</p>
            </div>
            <div className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${
              isValid
                ? 'bg-[#4D7C6F]/10 text-[#4D7C6F] border-[#4D7C6F]/20'
                : 'bg-[#A63D40]/10 text-[#A63D40] border-[#A63D40]/20'
            }`}>
              <span className="font-mono">{total}</span> / 100
            </div>
          </div>

          <div className="p-5">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-4">
              {WEIGHT_DIMENSIONS.map((dim) => (
                <WeightSliderRow
                  key={dim}
                  dimension={dim}
                  label={DIMENSION_LABELS[dim]}
                  description={DIMENSION_DESCRIPTIONS[dim]}
                  value={draftWeights[dim]}
                  defaultValue={DEFAULT_WEIGHTS[dim]}
                  onChange={(v) => handleWeightChange(dim, v)}
                />
              ))}
            </div>
          </div>

          <div className="px-5 py-3.5 border-t border-outline-variant/10 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button
                variant="text"
                color="surface"
                size="sm"
                leadingIcon="rotate-ccw"
                onClick={handleReset}
                disabled={!isDirty}
              >
                Undo Changes
              </Button>
              <Button
                variant="text"
                color="surface"
                size="sm"
                leadingIcon="refresh-cw"
                onClick={handleResetToDefault}
              >
                Reset to Defaults
              </Button>
            </div>
            <Button
              variant="filled"
              color="primary"
              size="sm"
              leadingIcon="check"
              onClick={handleSave}
              disabled={!isDirty || !isValid}
              loading={isSaving}
            >
              Save Weights
            </Button>
          </div>
        </div>

        {/* Impact Preview - takes 1/4 */}
        <div className="xl:col-span-1 bg-surface-container rounded-2xl border border-outline-variant/10 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-outline-variant/10">
            <h3 className="text-sm font-semibold text-on-surface">Impact Preview</h3>
            <p className="text-xs text-on-surface-variant/40 mt-0.5">How changes affect grades</p>
          </div>
          <div className="p-5">
            {impactPreview ? (
              <div className="space-y-5">
                {/* Average delta */}
                <div className="text-center p-4 rounded-xl bg-surface-container-high/50 border border-outline-variant/5">
                  <p className="text-[10px] font-bold text-on-surface-variant/40 uppercase tracking-wider mb-1">Avg Score Change</p>
                  <p className={`text-2xl font-bold ${
                    impactPreview.avgDelta > 0 ? 'text-[#4D7C6F]' :
                    impactPreview.avgDelta < 0 ? 'text-[#A63D40]' : 'text-on-surface-variant'
                  }`}>
                    {impactPreview.avgDelta > 0 ? '+' : ''}{impactPreview.avgDelta}
                  </p>
                  <p className="text-[10px] text-on-surface-variant/40 mt-1">
                    across {impactPreview.count} detection{impactPreview.count !== 1 ? 's' : ''}
                  </p>
                </div>

                {/* Grade migration table */}
                <div>
                  <p className="text-[10px] font-bold text-on-surface-variant/40 uppercase tracking-wider mb-3">Grade Distribution</p>
                  <div className="space-y-2">
                    {(['A', 'B', 'C', 'D', 'F'] as const).map(grade => {
                      const before = impactPreview.beforeGrades[grade];
                      const after = impactPreview.afterGrades[grade];
                      const delta = after - before;
                      const style = GRADE_STYLES[grade];
                      return (
                        <div key={grade} className="flex items-center gap-2 text-xs">
                          <span className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold font-mono border ${style.bg} ${style.text} ${style.border}`}>
                            {grade}
                          </span>
                          <span className="text-on-surface-variant/50 w-6 text-right font-mono">{before}</span>
                          <Icon name="chevron-right" className="w-3 h-3 text-on-surface-variant/20" />
                          <span className="text-on-surface font-mono w-6">{after}</span>
                          <span className="flex-1" />
                          {delta !== 0 && (
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                              delta > 0 ? 'bg-[#4D7C6F]/10 text-[#4D7C6F] border-[#4D7C6F]/20' : 'bg-[#A63D40]/10 text-[#A63D40] border-[#A63D40]/20'
                            }`}>
                              {delta > 0 ? '+' : ''}{delta}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-8">
                <div className="w-10 h-10 mx-auto mb-3 rounded-full bg-surface-container-high flex items-center justify-center">
                  <Icon name="chart-bar" className="w-5 h-5 text-on-surface-variant/30" />
                </div>
                <p className="text-xs text-on-surface-variant/40">Add detections to see impact preview</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Grade Thresholds */}
      <div className="flex items-center gap-3 px-1">
        <span className="text-[10px] font-bold text-on-surface-variant/30 uppercase tracking-wider">Grades:</span>
        {[
          { grade: 'A', min: 90, label: 'Excellent' },
          { grade: 'B', min: 75, label: 'Good' },
          { grade: 'C', min: 60, label: 'Fair' },
          { grade: 'D', min: 40, label: 'Needs Work' },
          { grade: 'F', min: 0, label: 'Critical' },
        ].map(({ grade, min, label }) => {
          const style = GRADE_STYLES[grade];
          return (
            <div key={grade} className="flex items-center gap-1.5">
              <span className={`w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold border ${style.bg} ${style.text} ${style.border}`}>
                {grade}
              </span>
              <span className="text-[10px] text-on-surface-variant/40">{min}+ {label}</span>
            </div>
          );
        })}
      </div>

      {/* Profile Modal */}
      {showProfileModal && (
        <ScoringProfileModal
          profile={editingProfile}
          onClose={() => { setShowProfileModal(false); setEditingProfile(null); }}
        />
      )}
    </div>
  );
};

// ============================================
// WEIGHT SLIDER ROW — compact 2-column layout
// ============================================

const WeightSliderRow: React.FC<{
  dimension: keyof QualityWeights;
  label: string;
  description: string;
  value: number;
  defaultValue: number;
  onChange: (value: number) => void;
}> = ({ dimension, label, description, value, defaultValue, onChange }) => {
  const pct = (value / MAX_WEIGHT) * 100;
  const isModified = value !== defaultValue;

  return (
    <div className="flex items-center gap-3">
      <div className="w-40 flex-shrink-0">
        <p className="text-xs font-medium text-on-surface">{label}</p>
        <p className="text-[10px] text-on-surface-variant/35 mt-0.5 leading-tight">{description}</p>
      </div>
      <div className="flex-1 relative group/slider h-5 flex items-center">
        {/* Visual track */}
        <div className="absolute left-0 right-0 h-1.5 rounded-full bg-primary/10 overflow-hidden pointer-events-none">
          <div
            className="h-full bg-primary rounded-full transition-all duration-100"
            style={{ width: `${pct}%` }}
          />
        </div>
        {/* Thumb indicator — appears on hover */}
        <div
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 pointer-events-none
            w-1 h-4 rounded-full bg-primary shadow-sm
            opacity-0 group-hover/slider:opacity-100
            transition-opacity duration-150"
          style={{ left: `${pct}%` }}
        />
        {/* Invisible native range for interaction */}
        <input
          type="range"
          min={0}
          max={MAX_WEIGHT}
          value={value}
          onChange={(e) => onChange(parseInt(e.target.value, 10))}
          className="absolute inset-0 w-full h-full opacity-0 cursor-grab active:cursor-grabbing"
        />
      </div>
      <div className="w-12 flex-shrink-0">
        <input
          type="number"
          min={0}
          max={MAX_WEIGHT}
          value={value}
          onChange={(e) => onChange(Math.max(0, Math.min(MAX_WEIGHT, parseInt(e.target.value, 10) || 0)))}
          className="w-full h-8 rounded-md bg-surface-container-highest border border-outline-variant/10 text-xs text-on-surface font-mono focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        />
      </div>
      {isModified ? (
        <button
          onClick={() => onChange(defaultValue)}
          className="p-1 rounded-lg text-on-surface-variant/40 hover:text-on-surface hover:bg-surface-container-highest transition-colors flex-shrink-0"
          title={`Reset to ${defaultValue}`}
        >
          <Icon name="rotate-ccw" className="w-3 h-3" />
        </button>
      ) : (
        <div className="w-[20px] flex-shrink-0" />
      )}
    </div>
  );
};

export default QualityWeightsPage;
