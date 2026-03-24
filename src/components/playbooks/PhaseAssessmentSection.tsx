// src/components/playbooks/PhaseAssessmentSection.tsx

import React from 'react';
import { Icon } from '../Icon';

interface MatchedDetection {
  detection_id: string;
  name: string;
  status: string;
  quality_score: number;
  query_language: string;
  behavior_matched: string;
  match_source: 'keyword' | 'ai';
  additional_count: number;
}

interface PhaseResult {
  phase_id: string;
  phase_name: string;
  phase_number: number;
  status: 'covered' | 'partially_covered' | 'blind_spot';
  detections: MatchedDetection[];
  gaps: string[];
  phase_context: string;
}

interface PhaseAssessmentSectionProps {
  data: {
    phases: PhaseResult[];
    metadata?: {
      total_detections_scanned: number;
      total_matched: number;
      keyword_matches: number;
      ai_matches: number;
      phases_with_coverage: number;
      phases_blind: number;
    };
  };
}

const STATUS_CONFIG = {
  covered: { label: 'Covered', color: 'text-green-400', bg: 'bg-green-500/10', border: 'border-green-500/20', icon: 'check-circle' },
  partially_covered: { label: 'Partially Covered', color: 'text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/20', icon: 'alert-circle' },
  blind_spot: { label: 'Blind Spot', color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/20', icon: 'x-circle' },
};

export const PhaseAssessmentSection: React.FC<PhaseAssessmentSectionProps> = ({ data }) => {
  const { phases, metadata } = data;

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      {metadata && (
        <div className="flex items-center gap-4 text-xs text-on-surface-variant mb-2">
          <span>{metadata.total_detections_scanned} detections scanned</span>
          <span>·</span>
          <span>{metadata.total_matched} matched</span>
          <span>·</span>
          <span className="text-green-400">{metadata.phases_with_coverage} phases covered</span>
          <span>·</span>
          <span className="text-red-400">{metadata.phases_blind} blind spots</span>
        </div>
      )}

      {/* Phase cards */}
      {phases.map((phase) => {
        const config = STATUS_CONFIG[phase.status];
        return (
          <div key={phase.phase_id} className={`rounded-xl border ${config.border} overflow-hidden`}>
            {/* Phase header */}
            <div className={`px-5 py-3 ${config.bg} flex items-center justify-between`}>
              <div className="flex items-center gap-3">
                <span className="text-xs font-mono text-on-surface-variant/60">
                  {String(phase.phase_number).padStart(2, '0')}
                </span>
                <h4 className="text-sm font-semibold text-on-surface">{phase.phase_name}</h4>
              </div>
              <div className={`flex items-center gap-1.5 ${config.color}`}>
                <Icon name={config.icon} className="w-4 h-4" />
                <span className="text-xs font-medium">{config.label}</span>
              </div>
            </div>

            <div className="px-5 py-4 space-y-4">
              {/* Phase context */}
              <p className="text-xs text-on-surface-variant/70 italic">{phase.phase_context}</p>

              {/* What you detect */}
              {phase.detections.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-green-400 mb-2 flex items-center gap-1.5">
                    <Icon name="check" className="w-3.5 h-3.5" />
                    What you detect
                  </p>
                  <div className="space-y-1.5">
                    {phase.detections.map((d) => (
                      <div key={`${d.detection_id}-${d.behavior_matched}`} className="flex items-center gap-2 text-xs">
                        <span className="text-on-surface-variant/60">•</span>
                        <span className="text-on-surface-variant">{d.behavior_matched}</span>
                        <span className="text-on-surface-variant/40">—</span>
                        <span className="text-on-surface font-medium truncate">{d.name}</span>
                        <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                          d.status === 'Production' ? 'bg-green-500/10 text-green-400' :
                          d.status === 'Testing' ? 'bg-blue-500/10 text-blue-400' :
                          'bg-surface-container text-on-surface-variant'
                        }`}>
                          {d.status}
                        </span>
                        <span className="text-on-surface-variant/40">{d.query_language}</span>
                        {d.match_source === 'ai' && (
                          <span className="px-1 py-0.5 rounded text-[9px] bg-primary/10 text-primary">AI</span>
                        )}
                        {d.additional_count > 0 && (
                          <span className="text-on-surface-variant/40 text-[10px]">+{d.additional_count} more</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* What you're missing */}
              {phase.gaps.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-red-400 mb-2 flex items-center gap-1.5">
                    <Icon name="x" className="w-3.5 h-3.5" />
                    What you&apos;re missing
                  </p>
                  <div className="space-y-1">
                    {phase.gaps.map((gap) => (
                      <div key={gap} className="flex items-center gap-2 text-xs">
                        <span className="text-red-400/40">•</span>
                        <span className="text-on-surface-variant">{gap}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Blind spot message */}
              {phase.detections.length === 0 && (
                <p className="text-xs text-red-400/70">
                  No ransomware-relevant detections found for this phase.
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
