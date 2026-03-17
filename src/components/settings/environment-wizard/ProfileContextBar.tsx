import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Icon } from '../../Icon';
import type { EnvironmentProfile } from '../../../types/environment';
import type { RecommendedDetection } from '../../../hooks/useProfileIntelligence';
import { NavigatorService } from '../../../lib/mitre/NavigatorService';
import type { CoverageMap } from '../../../hooks/useMitreCoverage';
import { downloadCSV } from '../../export-utils';
import type { Detection } from '../../../types/detection';

interface ProfileContextBarProps {
  profile: EnvironmentProfile;
  matchedCount: number;
  totalCount: number;
  recommendedDetections: RecommendedDetection[];
  onEditProfile: () => void;
  showSavedBadge?: boolean;
}

export const ProfileContextBar: React.FC<ProfileContextBarProps> = ({
  profile,
  matchedCount,
  totalCount,
  recommendedDetections,
  onEditProfile,
  showSavedBadge = false,
}) => {
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!exportOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setExportOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [exportOpen]);

  // Build CoverageMap from recommendedDetections for Navigator export
  const buildCoverageMap = useCallback((): CoverageMap => {
    const map: CoverageMap = {};
    for (const d of recommendedDetections) {
      for (const mitreId of d.mitreAttackIds) {
        if (!mitreId) continue;
        if (!map[mitreId]) {
          map[mitreId] = { covered: true, detectionCount: 0, detections: [] };
        }
        map[mitreId].detectionCount++;
        map[mitreId].detections.push({
          id: d.id,
          name: d.name,
          status: d.status,
          severity: d.severity,
          qualityScore: d.qualityScore,
        });
      }
    }
    return map;
  }, [recommendedDetections]);

  const handleExportNavigator = useCallback(async () => {
    setExporting(true);
    try {
      const coverage = buildCoverageMap();
      const layer = NavigatorService.generateNavigatorLayer(
        coverage,
        `${profile.sectors?.slice(0, 2).join(', ') || 'Environment'} Detection Coverage`,
        `Matched ${matchedCount} of ${totalCount} detections based on environment profile`
      );
      NavigatorService.downloadJson(layer, 'optimus-navigator-layer.json');
    } finally {
      setExporting(false);
      setExportOpen(false);
    }
  }, [buildCoverageMap, profile.sectors, matchedCount, totalCount]);

  const handleExportCSV = useCallback(() => {
    // Convert RecommendedDetection[] to minimal Detection-like objects for CSV export
    const detections = recommendedDetections.map(d => ({
      id: d.id,
      name: d.name,
      severity: d.severity,
      confidence: d.confidence,
      queryLanguage: d.queryLanguage,
      mitreAttackIds: d.mitreAttackIds,
      mitreTechniques: d.mitreTechniques,
      status: d.status,
      qualityScore: d.qualityScore,
      testedAndValidated: d.testedAndValidated,
    })) as unknown as Detection[];
    downloadCSV(detections, 'optimus-matched-detections.csv', [
      'name', 'severity', 'confidence', 'queryLanguage', 'mitreAttackIds', 'status', 'qualityScore',
    ]);
    setExportOpen(false);
  }, [recommendedDetections]);

  // Profile chips
  const sectorLabel = profile.sectors && profile.sectors.length > 0
    ? `${profile.sectors.slice(0, 2).join(', ')}${profile.sectors.length > 2 ? ` +${profile.sectors.length - 2}` : ''}`
    : profile.industry || null;
  const countryLabel = profile.user_country || null;
  const siemLabel = profile.siem_platforms.length > 0
    ? profile.siem_platforms.join(', ')
    : null;
  const logSourceLabel = `${(profile.log_sources || []).length} log sources`;
  const crownJewelCount = profile.crown_jewels?.length ?? 0;
  const crownJewelLabel = crownJewelCount > 0
    ? `${crownJewelCount} crown jewels`
    : null;

  const coveragePct = totalCount > 0 ? Math.round((matchedCount / totalCount) * 100) : 0;

  return (
    <div className="flex items-center gap-3 flex-wrap">
      {/* Saved badge */}
      {showSavedBadge && (
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-tertiary/10 border border-tertiary/20 text-tertiary text-[10px] font-brand font-bold uppercase tracking-wider flex-shrink-0">
          <Icon name="check-circle" className="w-3 h-3" />
          Saved
        </div>
      )}

      {/* Profile chips */}
      <div className="flex items-center gap-1.5 flex-wrap flex-1 min-w-0">
        {sectorLabel && (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-surface-container text-[10px] font-brand font-medium text-on-surface-variant truncate max-w-[200px]">
            {sectorLabel}
          </span>
        )}
        {countryLabel && (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-surface-container text-[10px] font-brand font-medium text-on-surface-variant">
            {countryLabel}
          </span>
        )}
        {siemLabel && (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-surface-container text-[10px] font-brand font-medium text-on-surface-variant truncate max-w-[200px]">
            {siemLabel}
          </span>
        )}
        <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-surface-container text-[10px] font-brand font-medium text-on-surface-variant">
          {logSourceLabel}
        </span>
        {crownJewelLabel && (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-surface-container text-[10px] font-brand font-medium text-on-surface-variant">
            {crownJewelLabel}
          </span>
        )}
      </div>

      {/* Match summary */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <span className="text-[11px] font-brand font-bold text-on-surface-variant">
          <span className="text-primary">{matchedCount.toLocaleString()}</span>
          <span className="text-on-surface-variant/50"> of {totalCount.toLocaleString()}</span>
          <span className="text-on-surface-variant/30"> detections</span>
        </span>
        <span className="text-[10px] font-brand font-bold text-primary/70">{coveragePct}%</span>
      </div>

      {/* Export dropdown */}
      <div className="relative flex-shrink-0" ref={menuRef}>
        <button
          onClick={() => setExportOpen(prev => !prev)}
          className="p-2 rounded-lg hover:bg-surface-container-high transition-colors"
          title="Export"
        >
          <Icon name="download" className="w-4 h-4 text-on-surface-variant" />
        </button>
        {exportOpen && (
          <div className="absolute right-0 top-full mt-1 w-56 bg-surface-container-high rounded-xl shadow-lg border border-outline-variant/10 z-20 py-1">
            <button
              onClick={handleExportNavigator}
              disabled={exporting}
              className="w-full px-4 py-2.5 text-left text-[11px] font-brand font-medium text-on-surface hover:bg-surface-container-highest transition-colors flex items-center gap-2"
            >
              <Icon name="map" className="w-3.5 h-3.5 text-on-surface-variant" />
              MITRE Navigator Layer (JSON)
            </button>
            <button
              onClick={handleExportCSV}
              className="w-full px-4 py-2.5 text-left text-[11px] font-brand font-medium text-on-surface hover:bg-surface-container-highest transition-colors flex items-center gap-2"
            >
              <Icon name="file-text" className="w-3.5 h-3.5 text-on-surface-variant" />
              Matched Detections (CSV)
            </button>
          </div>
        )}
      </div>

      {/* Edit profile */}
      <button
        onClick={onEditProfile}
        className="flex-shrink-0 px-3 py-1.5 text-[11px] font-brand font-bold text-primary hover:bg-primary/10 rounded-lg transition-colors tracking-wide"
      >
        EDIT PROFILE
      </button>
    </div>
  );
};
