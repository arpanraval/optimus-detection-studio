import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Icon } from '../Icon';
import { Group } from '../../hooks/useGroups';
import { UseThreatActorFilterReturn, SimpleCampaign, SimpleSoftware } from '../../hooks/useThreatActorFilter';

interface ThreatActorCommandFilterProps {
  filter: UseThreatActorFilterReturn;
}

type FilterTab = 'groups' | 'origin' | 'targets' | 'sectors' | 'campaigns' | 'software';

// Display names for countries (shorter versions)
const COUNTRY_DISPLAY_NAMES: Record<string, string> = {
  'Russian Federation': 'Russia',
  'North Korea': 'DPRK',
  'United States': 'USA',
  'United Kingdom': 'UK',
};

function getDisplayName(name: string): string {
  return COUNTRY_DISPLAY_NAMES[name] || name;
}

export function ThreatActorCommandFilter({ filter }: ThreatActorCommandFilterProps) {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<FilterTab>('groups');
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Click outside handler
  useEffect(() => {
    const listener = (event: MouseEvent) => {
      if (!ref.current || ref.current.contains(event.target as Node)) {
        return;
      }
      setOpen(false);
    };
    document.addEventListener('mousedown', listener);
    return () => document.removeEventListener('mousedown', listener);
  }, []);

  // Focus input when opening
  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  // Reset search when closing or changing tabs
  useEffect(() => {
    if (!open) {
      setSearch('');
    }
  }, [open]);

  useEffect(() => {
    setSearch('');
  }, [activeTab]);

  // Keyboard handler
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  // Filtered data based on search
  const filteredGroups = useMemo(() => filter.searchGroups(search), [filter, search]);
  const filteredCampaigns = useMemo(() => filter.searchCampaigns(search), [filter, search]);
  const filteredSoftware = useMemo(() => filter.searchSoftware(search), [filter, search]);

  const filteredOriginCountries = useMemo(() => {
    if (!search.trim()) return filter.availableOriginCountries;
    const searchLower = search.toLowerCase();
    return filter.availableOriginCountries.filter(c =>
      c.name.toLowerCase().includes(searchLower) ||
      c.code.toLowerCase().includes(searchLower)
    );
  }, [filter.availableOriginCountries, search]);

  const filteredTargetCountries = useMemo(() => {
    if (!search.trim()) return filter.availableTargetCountries;
    const searchLower = search.toLowerCase();
    return filter.availableTargetCountries.filter(c =>
      c.toLowerCase().includes(searchLower)
    );
  }, [filter.availableTargetCountries, search]);

  const filteredSectors = useMemo(() => {
    if (!search.trim()) return filter.availableSectors;
    const searchLower = search.toLowerCase();
    return filter.availableSectors.filter(s =>
      s.toLowerCase().includes(searchLower)
    );
  }, [filter.availableSectors, search]);

  // Button label
  const buttonLabel = useMemo(() => {
    if (!filter.isActive) return 'Threat Intel';
    if (filter.activeFilterCount === 1) {
      if (filter.state.selectedGroups.length === 1) return filter.state.selectedGroups[0].name;
      if (filter.state.selectedOriginCountries.length === 1) return getDisplayName(filter.state.selectedOriginCountries[0]);
      if (filter.state.selectedTargetCountries.length === 1) return getDisplayName(filter.state.selectedTargetCountries[0]);
      if (filter.state.selectedTargetSectors.length === 1) return filter.state.selectedTargetSectors[0];
      if (filter.state.selectedCampaigns.length === 1) return filter.state.selectedCampaigns[0].name;
      if (filter.state.selectedSoftware.length === 1) return filter.state.selectedSoftware[0].name;
    }
    return `${filter.activeFilterCount} filters`;
  }, [filter.isActive, filter.activeFilterCount, filter.state]);

  const tabs: { id: FilterTab; label: string; count: number }[] = [
    { id: 'groups', label: 'Groups', count: filter.state.selectedGroups.length },
    { id: 'campaigns', label: 'Campaigns', count: filter.state.selectedCampaigns.length },
    { id: 'software', label: 'Software', count: filter.state.selectedSoftware.length },
    { id: 'origin', label: 'Origin', count: filter.state.selectedOriginCountries.length },
    { id: 'targets', label: 'Targets', count: filter.state.selectedTargetCountries.length },
    { id: 'sectors', label: 'Sectors', count: filter.state.selectedTargetSectors.length },
  ];

  return (
    <div className="relative" ref={ref}>
      {/* Trigger Button */}
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all ${
          open || filter.isActive
            ? 'bg-secondary-container text-on-secondary-container'
            : 'bg-surface-container-high text-on-surface-variant hover:text-on-surface'
        }`}
      >
        <Icon name="users" className="w-4 h-4" />
        <span className="hidden md:inline max-w-[140px] truncate">{buttonLabel}</span>
        {filter.state.isLoading ? (
          <Icon name="spinner" className="w-3 h-3 animate-spin" />
        ) : (
          <Icon name="chevron-down" className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute top-full right-0 mt-2 w-[480px] bg-surface-container-high border border-outline-variant rounded-xl shadow-lg z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-100">
          {/* Tabs */}
          <div className="flex border-b border-outline-variant/30 overflow-x-auto">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-shrink-0 px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider transition-all relative ${
                  activeTab === tab.id
                    ? 'text-on-surface bg-surface-container'
                    : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container/50'
                }`}
              >
                {tab.label}
                {tab.count > 0 && (
                  <span className="ml-1 px-1.5 py-0.5 text-[9px] rounded bg-secondary-container text-on-secondary-container">
                    {tab.count}
                  </span>
                )}
                {activeTab === tab.id && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
                )}
              </button>
            ))}
          </div>

          {/* Search Input */}
          <div className="p-3 border-b border-outline-variant/30">
            <div className="relative">
              <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant" />
              <input
                ref={inputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={`Search ${activeTab}...`}
                className="w-full pl-10 pr-12 py-2 bg-surface-container text-on-surface placeholder-on-surface-variant/50 rounded-lg text-sm font-medium border border-outline-variant/30 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
              />
              <kbd className="absolute right-3 top-1/2 -translate-y-1/2 px-1.5 py-0.5 text-[10px] font-bold text-on-surface-variant bg-surface-container-highest rounded border border-outline-variant/30">
                ESC
              </kbd>
            </div>
          </div>

          {/* Content based on active tab */}
          <div className="max-h-[320px] overflow-y-auto custom-scrollbar">
            {activeTab === 'groups' && (
              <GroupsTabContent
                groups={filteredGroups}
                selectedGroups={filter.state.selectedGroups}
                onToggle={filter.toggleGroup}
                isLoading={filter.isLoadingGroups}
                search={search}
              />
            )}

            {activeTab === 'campaigns' && (
              <CampaignsTabContent
                campaigns={filteredCampaigns}
                selectedCampaigns={filter.state.selectedCampaigns}
                onToggle={filter.toggleCampaign}
                isLoading={filter.isLoadingCampaigns}
                search={search}
              />
            )}

            {activeTab === 'software' && (
              <SoftwareTabContent
                software={filteredSoftware}
                selectedSoftware={filter.state.selectedSoftware}
                onToggle={filter.toggleSoftware}
                isLoading={filter.isLoadingSoftware}
                search={search}
              />
            )}

            {activeTab === 'origin' && (
              <CountryTabContent
                countries={filteredOriginCountries.map(c => c.name)}
                selectedCountries={filter.state.selectedOriginCountries}
                onToggle={filter.toggleOriginCountry}
                emptyMessage="No origin countries found"
                search={search}
              />
            )}

            {activeTab === 'targets' && (
              <CountryTabContent
                countries={filteredTargetCountries}
                selectedCountries={filter.state.selectedTargetCountries}
                onToggle={filter.toggleTargetCountry}
                emptyMessage="No target countries found"
                search={search}
              />
            )}

            {activeTab === 'sectors' && (
              <SectorTabContent
                sectors={filteredSectors}
                selectedSectors={filter.state.selectedTargetSectors}
                onToggle={filter.toggleTargetSector}
                search={search}
              />
            )}
          </div>

          {/* Footer */}
          <div className="px-3 py-2.5 border-t border-outline-variant/30 bg-surface-container flex items-center justify-between">
            <div className="text-[11px] text-on-surface-variant">
              {filter.isActive ? (
                <>
                  <span className="font-bold text-on-surface">{filter.state.filteredTechniqueIds.size}</span> TTPs
                  {filter.state.matchingGroupCount > 0 && (
                    <>
                      <span className="mx-1.5">from</span>
                      <span className="font-bold text-on-surface">{filter.state.matchingGroupCount}</span> groups
                    </>
                  )}
                  {filter.state.selectedCampaigns.length > 0 && (
                    <>
                      <span className="mx-1.5">+</span>
                      <span className="font-bold text-on-surface">{filter.state.selectedCampaigns.length}</span> campaigns
                    </>
                  )}
                  {filter.state.selectedSoftware.length > 0 && (
                    <>
                      <span className="mx-1.5">+</span>
                      <span className="font-bold text-on-surface">{filter.state.selectedSoftware.length}</span> software
                    </>
                  )}
                </>
              ) : (
                <span>{filter.groups.length} groups | {filter.campaigns.length} campaigns | {filter.software.length} software</span>
              )}
            </div>

            {filter.isActive && (
              <button
                onClick={() => filter.clearFilter()}
                className="text-[11px] font-bold text-on-surface-variant hover:text-error transition-colors"
              >
                Clear All
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Groups tab content
interface GroupsTabContentProps {
  groups: Group[];
  selectedGroups: Group[];
  onToggle: (group: Group) => void;
  isLoading: boolean;
  search: string;
}

function GroupsTabContent({ groups, selectedGroups, onToggle, isLoading, search }: GroupsTabContentProps) {
  const selectedIds = new Set(selectedGroups.map(g => g.id));

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8 text-on-surface-variant">
        <Icon name="spinner" className="w-5 h-5 animate-spin mr-2" />
        <span className="text-sm">Loading groups...</span>
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <div className="py-8 text-center text-on-surface-variant text-sm">
        No groups found {search && `matching "${search}"`}
      </div>
    );
  }

  return (
    <div className="p-2 space-y-1">
      {groups.map(group => {
        const isSelected = selectedIds.has(group.id);
        const targeting = group.data.targeting_intel;
        const originCountry = targeting?.origin_country;

        return (
          <button
            key={group.id}
            onClick={() => onToggle(group)}
            className={`w-full text-left p-2.5 rounded-lg transition-all flex items-center gap-3 ${
              isSelected ? 'bg-secondary-container' : 'hover:bg-surface-container-highest'
            }`}
          >
            <div className={`flex-shrink-0 w-4 h-4 rounded border-2 flex items-center justify-center transition-all ${
              isSelected ? 'bg-secondary border-secondary' : 'border-outline-variant'
            }`}>
              {isSelected && <Icon name="check" className="w-3 h-3 text-on-secondary" />}
            </div>

            <div className="flex-grow min-w-0">
              <div className="flex items-center gap-2">
                <span className={`font-bold text-sm truncate ${isSelected ? 'text-on-secondary-container' : 'text-on-surface'}`}>
                  {group.name}
                </span>
                <span className="text-[10px] font-mono text-on-surface-variant bg-surface-container px-1.5 py-0.5 rounded flex-shrink-0">
                  {group.mitre_id}
                </span>
              </div>
              {originCountry && (
                <span className="text-[10px] text-on-surface-variant/70">{originCountry}</span>
              )}
            </div>

            <span className="flex-shrink-0 text-xs text-on-surface-variant font-medium">
              {group.technique_count}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// Campaigns tab content
interface CampaignsTabContentProps {
  campaigns: SimpleCampaign[];
  selectedCampaigns: SimpleCampaign[];
  onToggle: (campaign: SimpleCampaign) => void;
  isLoading: boolean;
  search: string;
}

function CampaignsTabContent({ campaigns, selectedCampaigns, onToggle, isLoading, search }: CampaignsTabContentProps) {
  const selectedIds = new Set(selectedCampaigns.map(c => c.id));

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8 text-on-surface-variant">
        <Icon name="spinner" className="w-5 h-5 animate-spin mr-2" />
        <span className="text-sm">Loading campaigns...</span>
      </div>
    );
  }

  if (campaigns.length === 0) {
    return (
      <div className="py-8 text-center text-on-surface-variant text-sm">
        No campaigns found {search && `matching "${search}"`}
      </div>
    );
  }

  return (
    <div className="p-2 space-y-1">
      {campaigns.map(campaign => {
        const isSelected = selectedIds.has(campaign.id);

        return (
          <button
            key={campaign.id}
            onClick={() => onToggle(campaign)}
            className={`w-full text-left p-2.5 rounded-lg transition-all flex items-center gap-3 ${
              isSelected ? 'bg-secondary-container' : 'hover:bg-surface-container-highest'
            }`}
          >
            <div className={`flex-shrink-0 w-4 h-4 rounded border-2 flex items-center justify-center transition-all ${
              isSelected ? 'bg-secondary border-secondary' : 'border-outline-variant'
            }`}>
              {isSelected && <Icon name="check" className="w-3 h-3 text-on-secondary" />}
            </div>

            <div className="flex-grow min-w-0">
              <div className="flex items-center gap-2">
                <span className={`font-bold text-sm truncate ${isSelected ? 'text-on-secondary-container' : 'text-on-surface'}`}>
                  {campaign.name}
                </span>
                <span className="text-[10px] font-mono text-on-surface-variant bg-surface-container px-1.5 py-0.5 rounded flex-shrink-0">
                  {campaign.mitre_id}
                </span>
              </div>
              {(campaign.first_seen || campaign.last_seen) && (
                <span className="text-[10px] text-on-surface-variant/70">
                  {campaign.first_seen && `${campaign.first_seen.substring(0, 7)}`}
                  {campaign.first_seen && campaign.last_seen && ' - '}
                  {campaign.last_seen && `${campaign.last_seen.substring(0, 7)}`}
                </span>
              )}
            </div>

            <span className="flex-shrink-0 text-xs text-on-surface-variant font-medium">
              {campaign.technique_count}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// Software tab content
interface SoftwareTabContentProps {
  software: SimpleSoftware[];
  selectedSoftware: SimpleSoftware[];
  onToggle: (sw: SimpleSoftware) => void;
  isLoading: boolean;
  search: string;
}

function SoftwareTabContent({ software, selectedSoftware, onToggle, isLoading, search }: SoftwareTabContentProps) {
  const selectedIds = new Set(selectedSoftware.map(s => s.id));

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8 text-on-surface-variant">
        <Icon name="spinner" className="w-5 h-5 animate-spin mr-2" />
        <span className="text-sm">Loading software...</span>
      </div>
    );
  }

  if (software.length === 0) {
    return (
      <div className="py-8 text-center text-on-surface-variant text-sm">
        No software found {search && `matching "${search}"`}
      </div>
    );
  }

  return (
    <div className="p-2 space-y-1">
      {software.map(sw => {
        const isSelected = selectedIds.has(sw.id);

        return (
          <button
            key={sw.id}
            onClick={() => onToggle(sw)}
            className={`w-full text-left p-2.5 rounded-lg transition-all flex items-center gap-3 ${
              isSelected ? 'bg-secondary-container' : 'hover:bg-surface-container-highest'
            }`}
          >
            <div className={`flex-shrink-0 w-4 h-4 rounded border-2 flex items-center justify-center transition-all ${
              isSelected ? 'bg-secondary border-secondary' : 'border-outline-variant'
            }`}>
              {isSelected && <Icon name="check" className="w-3 h-3 text-on-secondary" />}
            </div>

            <div className="flex-grow min-w-0">
              <div className="flex items-center gap-2">
                <span className={`font-bold text-sm truncate ${isSelected ? 'text-on-secondary-container' : 'text-on-surface'}`}>
                  {sw.name}
                </span>
                <span className="text-[10px] font-mono text-on-surface-variant bg-surface-container px-1.5 py-0.5 rounded flex-shrink-0">
                  {sw.mitre_id}
                </span>
                <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase ${
                  sw.software_type === 'malware'
                    ? 'bg-error/10 text-error'
                    : 'bg-secondary/10 text-secondary'
                }`}>
                  {sw.software_type}
                </span>
              </div>
            </div>

            <span className="flex-shrink-0 text-xs text-on-surface-variant font-medium">
              {sw.technique_count}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// Country tab content
interface CountryTabContentProps {
  countries: string[];
  selectedCountries: string[];
  onToggle: (country: string) => void;
  emptyMessage: string;
  search: string;
}

function CountryTabContent({ countries, selectedCountries, onToggle, emptyMessage, search }: CountryTabContentProps) {
  if (countries.length === 0) {
    return (
      <div className="py-8 text-center text-on-surface-variant text-sm">
        {search ? `No countries found matching "${search}"` : emptyMessage}
      </div>
    );
  }

  return (
    <div className="p-2 space-y-1">
      {countries.map(country => {
        const isSelected = selectedCountries.includes(country);

        return (
          <button
            key={country}
            onClick={() => onToggle(country)}
            className={`w-full text-left px-3 py-2.5 rounded-lg transition-all flex items-center gap-3 ${
              isSelected ? 'bg-secondary-container' : 'hover:bg-surface-container-highest'
            }`}
          >
            <div className={`flex-shrink-0 w-4 h-4 rounded border-2 flex items-center justify-center transition-all ${
              isSelected ? 'bg-secondary border-secondary' : 'border-outline-variant'
            }`}>
              {isSelected && <Icon name="check" className="w-3 h-3 text-on-secondary" />}
            </div>

            <span className={`font-medium text-sm ${isSelected ? 'text-on-secondary-container' : 'text-on-surface'}`}>
              {getDisplayName(country)}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// Sector tab content
interface SectorTabContentProps {
  sectors: string[];
  selectedSectors: string[];
  onToggle: (sector: string) => void;
  search: string;
}

function SectorTabContent({ sectors, selectedSectors, onToggle, search }: SectorTabContentProps) {
  if (sectors.length === 0) {
    return (
      <div className="py-8 text-center text-on-surface-variant text-sm">
        {search ? `No sectors found matching "${search}"` : 'No sectors available'}
      </div>
    );
  }

  return (
    <div className="p-2 space-y-1">
      {sectors.map(sector => {
        const isSelected = selectedSectors.includes(sector);

        return (
          <button
            key={sector}
            onClick={() => onToggle(sector)}
            className={`w-full text-left px-3 py-2.5 rounded-lg transition-all flex items-center gap-3 ${
              isSelected ? 'bg-secondary-container' : 'hover:bg-surface-container-highest'
            }`}
          >
            <div className={`flex-shrink-0 w-4 h-4 rounded border-2 flex items-center justify-center transition-all ${
              isSelected ? 'bg-secondary border-secondary' : 'border-outline-variant'
            }`}>
              {isSelected && <Icon name="check" className="w-3 h-3 text-on-secondary" />}
            </div>

            <span className={`font-medium text-sm ${isSelected ? 'text-on-secondary-container' : 'text-on-surface'}`}>
              {sector}
            </span>
          </button>
        );
      })}
    </div>
  );
}
