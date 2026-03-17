import React from 'react';
import { Icon } from '../Icon';
import { UseThreatActorFilterReturn } from '../../hooks/useThreatActorFilter';

interface ThreatActorFilterBannerProps {
  filter: UseThreatActorFilterReturn;
  coveredCount: number;
  totalFilteredCount: number;
}

export function ThreatActorFilterBanner({
  filter,
  coveredCount,
  totalFilteredCount,
}: ThreatActorFilterBannerProps) {
  if (!filter.isActive) return null;

  const coveragePercent = totalFilteredCount > 0
    ? Math.round((coveredCount / totalFilteredCount) * 100)
    : 0;

  // Build filter summary chips
  const filterChips: { label: string; type: string }[] = [];

  // Groups
  if (filter.state.selectedGroups.length > 0) {
    if (filter.state.selectedGroups.length === 1) {
      filterChips.push({ label: filter.state.selectedGroups[0].name, type: 'group' });
    } else {
      filterChips.push({ label: `${filter.state.selectedGroups.length} groups`, type: 'group' });
    }
  }

  // Campaigns
  if (filter.state.selectedCampaigns.length > 0) {
    if (filter.state.selectedCampaigns.length === 1) {
      filterChips.push({ label: filter.state.selectedCampaigns[0].name, type: 'campaign' });
    } else {
      filterChips.push({ label: `${filter.state.selectedCampaigns.length} campaigns`, type: 'campaign' });
    }
  }

  // Software
  if (filter.state.selectedSoftware.length > 0) {
    if (filter.state.selectedSoftware.length === 1) {
      filterChips.push({ label: filter.state.selectedSoftware[0].name, type: 'software' });
    } else {
      filterChips.push({ label: `${filter.state.selectedSoftware.length} software`, type: 'software' });
    }
  }

  // Origin countries
  if (filter.state.selectedOriginCountries.length > 0) {
    if (filter.state.selectedOriginCountries.length === 1) {
      filterChips.push({ label: `From: ${filter.state.selectedOriginCountries[0]}`, type: 'origin' });
    } else {
      filterChips.push({ label: `From: ${filter.state.selectedOriginCountries.length} countries`, type: 'origin' });
    }
  }

  // Target countries
  if (filter.state.selectedTargetCountries.length > 0) {
    if (filter.state.selectedTargetCountries.length === 1) {
      filterChips.push({ label: `Targeting: ${filter.state.selectedTargetCountries[0]}`, type: 'target' });
    } else {
      filterChips.push({ label: `Targeting: ${filter.state.selectedTargetCountries.length} countries`, type: 'target' });
    }
  }

  // Target sectors
  if (filter.state.selectedTargetSectors.length > 0) {
    if (filter.state.selectedTargetSectors.length === 1) {
      filterChips.push({ label: filter.state.selectedTargetSectors[0], type: 'sector' });
    } else {
      filterChips.push({ label: `${filter.state.selectedTargetSectors.length} sectors`, type: 'sector' });
    }
  }

  return (
    <div className="bg-secondary-container/30 border-b border-outline-variant/30 px-6 py-2.5 flex items-center justify-between">
      <div className="flex items-center gap-3">
        {/* Icon */}
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-secondary-container">
          <Icon name="filter" className="w-4 h-4 text-on-secondary-container" />
        </div>

        {/* Filter chips */}
        <div className="flex items-center gap-2 flex-wrap">
          {filterChips.map((chip, index) => (
            <span
              key={index}
              className="px-2.5 py-1 text-xs font-medium bg-surface-container text-on-surface rounded-lg"
            >
              {chip.label}
            </span>
          ))}
        </div>

        {/* Divider */}
        <div className="h-6 w-px bg-outline-variant/30 mx-1" />

        {/* Stats */}
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-on-surface">{filter.state.filteredTechniqueIds.size}</span>
            <span className="text-on-surface-variant">TTPs</span>
          </div>

          <div className="flex items-center gap-1.5">
            <Icon name="shield-check" className="w-3.5 h-3.5 text-primary" />
            <span className="font-bold text-primary">{coveragePercent}%</span>
            <span className="text-on-surface-variant">covered</span>
          </div>
        </div>
      </div>

      {/* Clear Button */}
      <button
        onClick={filter.clearFilter}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest transition-all"
      >
        <Icon name="x" className="w-3.5 h-3.5" />
        <span>Clear</span>
      </button>
    </div>
  );
}
