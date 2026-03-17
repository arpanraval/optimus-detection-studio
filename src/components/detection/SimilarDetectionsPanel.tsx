import React, { useState } from 'react';
import { useSimilarDetections } from '../../hooks/useSimilarDetections';
import { Icon } from '../Icon';
import { SEVERITY_COLORS } from '../../constants';
import type { SimilarDetection } from '../../lib/similarDetectionsService';

interface SimilarDetectionsPanelProps {
  detectionId: string;
  onNavigateToDetection?: (detectionId: string) => void;
}

// Language badge colors
const LANGUAGE_COLORS: Record<string, string> = {
  SPL: 'bg-green-500/15 text-green-400 border-green-500/20',
  KQL: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
  Sigma: 'bg-purple-500/15 text-purple-400 border-purple-500/20',
  EQL: 'bg-orange-500/15 text-orange-400 border-orange-500/20',
  'YARA-L': 'bg-red-500/15 text-red-400 border-red-500/20',
  CQL: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/20',
  Lucene: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/20',
  'ES|QL': 'bg-pink-500/15 text-pink-400 border-pink-500/20',
};

function SimilarityBadge({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const color =
    pct >= 90 ? 'text-green-400' : pct >= 70 ? 'text-yellow-400' : 'text-on-surface-variant';
  return <span className={`text-xs font-mono ${color}`}>{pct}%</span>;
}

function DetectionCard({
  detection,
  onNavigate,
}: {
  detection: SimilarDetection;
  onNavigate?: (id: string) => void;
}) {
  const lang = detection.query_language || 'Unknown';
  const langClass = LANGUAGE_COLORS[lang] || 'bg-surface-container-highest text-on-surface-variant border-outline-variant/20';

  return (
    <button
      onClick={() => onNavigate?.(detection.detection_id)}
      className="w-full text-left p-3 rounded-lg bg-surface-container hover:bg-surface-container-high border border-outline-variant/20 hover:border-outline-variant/40 transition-all group"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-on-surface truncate group-hover:text-primary transition-colors">
            {detection.name}
          </p>
          {detection.description && (
            <p className="text-xs text-on-surface-variant mt-1 line-clamp-2">
              {detection.description.slice(0, 150)}
              {detection.description.length > 150 ? '...' : ''}
            </p>
          )}
        </div>
        <SimilarityBadge score={detection.similarity} />
      </div>

      <div className="flex items-center gap-2 mt-2">
        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${langClass}`}>
          {lang}
        </span>
        <span
          className={`px-1.5 py-0.5 rounded text-[10px] font-bold border uppercase tracking-wide ${
            SEVERITY_COLORS[detection.severity] || ''
          }`}
        >
          {detection.severity}
        </span>
        {detection.source && detection.source !== 'custom' && (
          <span className="text-[10px] text-on-surface-variant/60">{detection.source}</span>
        )}
      </div>
    </button>
  );
}

export const SimilarDetectionsPanel: React.FC<SimilarDetectionsPanelProps> = ({
  detectionId,
  onNavigateToDetection,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const { similar, grouped, loading, error } = useSimilarDetections(
    isExpanded ? detectionId : null,
    { matchThreshold: 0.3, matchCount: 15 }
  );

  const languageCount = Object.keys(grouped).length;
  const totalCount = similar.length;

  return (
    <div className="border border-outline-variant/20 rounded-xl overflow-hidden">
      {/* Header / Toggle */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-5 py-3.5 bg-surface-container hover:bg-surface-container-high transition-colors"
      >
        <div className="flex items-center gap-3">
          <Icon
            name="layers"
            className="w-4 h-4 text-on-surface-variant"
          />
          <span className="text-sm font-medium text-on-surface">
            Similar Detections
          </span>
          {isExpanded && !loading && totalCount > 0 && (
            <span className="text-xs text-on-surface-variant bg-surface-container-highest px-2 py-0.5 rounded-full">
              {totalCount} found across {languageCount} language{languageCount !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        <Icon
          name={isExpanded ? 'chevron-up' : 'chevron-down'}
          className="w-4 h-4 text-on-surface-variant"
        />
      </button>

      {/* Content */}
      {isExpanded && (
        <div className="border-t border-outline-variant/20">
          {loading && (
            <div className="flex items-center justify-center py-8 gap-2">
              <Icon name="loader" className="w-4 h-4 animate-spin text-on-surface-variant" />
              <span className="text-sm text-on-surface-variant">Finding similar detections...</span>
            </div>
          )}

          {error && (
            <div className="px-5 py-4">
              <p className="text-sm text-error">{error}</p>
            </div>
          )}

          {!loading && !error && totalCount === 0 && (
            <div className="px-5 py-6 text-center">
              <p className="text-sm text-on-surface-variant">
                No similar detections found. This detection may not have an embedding yet.
              </p>
            </div>
          )}

          {!loading && !error && totalCount > 0 && (
            <div className="px-5 py-4 space-y-4">
              {/* Group by language */}
              {Object.entries(grouped)
                .sort(([, a], [, b]) => b.length - a.length)
                .map(([language, detections]) => (
                  <div key={language}>
                    <div className="flex items-center gap-2 mb-2">
                      <span
                        className={`px-2 py-0.5 rounded text-[11px] font-bold border ${
                          LANGUAGE_COLORS[language] || 'bg-surface-container-highest text-on-surface-variant border-outline-variant/20'
                        }`}
                      >
                        {language}
                      </span>
                      <span className="text-xs text-on-surface-variant">
                        {detections.length} detection{detections.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                    <div className="space-y-2">
                      {detections.map((det) => (
                        <DetectionCard
                          key={det.detection_id}
                          detection={det}
                          onNavigate={onNavigateToDetection}
                        />
                      ))}
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
