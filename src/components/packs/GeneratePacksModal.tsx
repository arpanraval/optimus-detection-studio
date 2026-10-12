import { Select } from '@/components/ui/Select';
import React, { useState, useMemo, useEffect } from 'react';
import { Icon } from '../Icon';
import { Detection } from '../../types';
import { PackCandidate, PackType, generatePacks } from '../../services/packGeneratorService';
import { supabase } from '../../lib/supabaseClient';

interface GeneratePacksModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGenerate: (candidates: PackCandidate[]) => Promise<void>;
}

const PACK_TYPE_LABELS: Record<string, string> = {
  ransomware: 'Use Case — Ransomware',
  use_case: 'Use Case Packs',
  siem_ready: 'SIEM-Ready Packs',
  tactic: 'Tactic + Platform Packs',
  threat_actor: 'Threat Actor Packs',
  campaign: 'Campaign Packs',
  technology: 'Platform Packs',
};

const PACK_TYPE_SHORT: Record<string, string> = {
  ransomware: 'Use Case',
  use_case: 'Use Case',
  siem_ready: 'SIEM',
  tactic: 'Tactic',
  threat_actor: 'Threat Actor',
  campaign: 'Campaign',
  technology: 'Platform',
};

const PACK_TYPE_ORDER: PackType[] = [
  'ransomware',
  'use_case',
  'siem_ready',
  'tactic',
  'threat_actor',
  'campaign',
  'technology',
];

const SEVERITY_TEXT: Record<string, string> = {
  Critical: 'text-error',
  High: 'text-orange-400',
  Medium: 'text-on-surface',
  Low: 'text-on-surface',
  Informational: 'text-gray-400',
};

interface CandidateWithDetails extends PackCandidate {
  queryLanguages: string[];
  severityCounts: Record<string, number>;
}

function enrichCandidate(candidate: PackCandidate, detectionMap: Map<string, Detection>): CandidateWithDetails {
  const languages = new Set<string>();
  const severityCounts: Record<string, number> = {};

  for (const id of candidate.detection_ids) {
    const det = detectionMap.get(id);
    if (!det) continue;
    if (det.queryLanguage) languages.add(det.queryLanguage);
    const sev = det.severity || 'Unknown';
    severityCounts[sev] = (severityCounts[sev] || 0) + 1;
  }

  return {
    ...candidate,
    queryLanguages: Array.from(languages).sort(),
    severityCounts,
  };
}

function SeverityPills({ counts }: { counts: Record<string, number> }) {
  const order = ['Critical', 'High', 'Medium', 'Low', 'Informational'];
  const active = order.filter((s) => (counts[s] || 0) > 0);
  if (active.length === 0) return <span className="text-xs text-on-surface-variant">--</span>;
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {active.map((sev) => (
        <span key={sev} className={`text-[11px] font-medium ${SEVERITY_TEXT[sev]}`}>
          {counts[sev]}
          {sev[0]}
        </span>
      ))}
    </div>
  );
}

export const GeneratePacksModal: React.FC<GeneratePacksModalProps> = ({ isOpen, onClose, onGenerate }) => {
  const [candidates, setCandidates] = useState<CandidateWithDetails[]>([]);
  const [selectedNames, setSelectedNames] = useState<Set<string>>(new Set());
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [libraryTruncated, setLibraryTruncated] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setSelectedNames(new Set());
    setSearch('');
    setTypeFilter('all');
    setLibraryTruncated(false);

    const analyze = async () => {
      setIsAnalyzing(true);
      try {
        // Paginate to handle libraries with more than Supabase's default row limit (1000).
        // Cap at 10k to prevent browser memory issues — warn user if library is bigger.
        const PAGE_SIZE = 1000;
        const MAX_DETECTIONS = 10000;
        let allRows: unknown[] = [];
        let offset = 0;

        while (offset < MAX_DETECTIONS) {
          const { data, error } = await supabase
            .from('detections')
            .select(
              'id, name, status, severity, queryLanguage, mitreAttackIds, mitreTactics, platforms, linkedGroups, linkedCampaigns, library_type',
            )
            .order('name')
            .range(offset, offset + PAGE_SIZE - 1);

          if (error) {
            setCandidates([]);
            return;
          }
          if (!data || data.length === 0) break;
          allRows = allRows.concat(data);
          if (data.length < PAGE_SIZE) break; // last page
          offset += PAGE_SIZE;
        }

        const detections = allRows as unknown as Detection[];
        const detectionMap = new Map<string, Detection>();
        detections.forEach((d) => detectionMap.set(d.id, d));

        const rawCandidates = generatePacks(detections);
        const enriched = rawCandidates.map((c) => enrichCandidate(c, detectionMap));

        setLibraryTruncated(detections.length >= 10000);
        setCandidates(enriched);
        // Pre-select use_case and ransomware packs, deselect the rest
        const autoSelect = new Set(
          enriched
            .filter((c) => c.pack_type === 'use_case' || c.pack_type === 'ransomware' || c.pack_type === 'siem_ready')
            .map((c) => c.name),
        );
        setSelectedNames(autoSelect);
      } catch {
        setCandidates([]);
      } finally {
        setIsAnalyzing(false);
      }
    };

    analyze();
  }, [isOpen]);

  // Filter candidates
  const filteredCandidates = useMemo(() => {
    let result = candidates;

    if (typeFilter !== 'all') {
      result = result.filter((c) => c.pack_type === typeFilter);
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.platforms.some((p) => p.toLowerCase().includes(q)) ||
          c.queryLanguages.some((l) => l.toLowerCase().includes(q)),
      );
    }

    return result;
  }, [candidates, search, typeFilter]);

  // Available pack types for filter dropdown
  const availableTypes = useMemo(() => {
    const types = new Set(candidates.map((c) => c.pack_type));
    return PACK_TYPE_ORDER.filter((t) => types.has(t));
  }, [candidates]);

  const selectedCount = selectedNames.size;
  const totalCount = candidates.length;
  const filteredCount = filteredCandidates.length;

  const toggleCandidate = (name: string) => {
    setSelectedNames((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const selectAll = () => setSelectedNames(new Set(candidates.map((c) => c.name)));
  const selectNone = () => setSelectedNames(new Set());
  const selectByType = (packType: string) =>
    setSelectedNames(new Set(candidates.filter((c) => c.pack_type === packType).map((c) => c.name)));

  const handleGenerate = async () => {
    const selected = candidates.filter((c) => selectedNames.has(c.name));
    if (selected.length === 0) return;
    setIsGenerating(true);
    try {
      await onGenerate(selected);
      onClose();
    } finally {
      setIsGenerating(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-5xl max-h-[85vh] flex flex-col bg-surface rounded-2xl border border-outline-variant/30 shadow-lg overflow-hidden">
        {/* Header */}
        <div className="px-6 py-5 border-b border-outline-variant/20">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-on-surface">Generate Detection Packs</h2>
              <p className="text-sm text-on-surface-variant mt-1">
                Review suggested packs and select which ones to create
              </p>
            </div>
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-surface-container transition-colors">
              <Icon name="x" className="w-5 h-5 text-on-surface-variant" />
            </button>
          </div>

          {/* Toolbar: search + filters + select controls */}
          {!isAnalyzing && candidates.length > 0 && (
            <div className="flex items-center gap-3 mt-4">
              {/* Search */}
              <div className="relative flex-1 max-w-xs">
                <Icon
                  name="search"
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant"
                />
                <input
                  type="text"
                  placeholder="Search packs..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full h-9 pl-9 pr-8 bg-surface-container rounded-lg text-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:ring-1 focus:ring-primary/50"
                  aria-label="Search pack suggestions"
                />
                {search && (
                  <button
                    onClick={() => setSearch('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-surface-container-high"
                  >
                    <Icon name="x" className="w-3.5 h-3.5 text-on-surface-variant" />
                  </button>
                )}
              </div>

              {/* Type filter */}
              <Select
                value={typeFilter}
                onChange={(nextValue) => setTypeFilter(nextValue)}
                aria-label="Type"
                size="sm"
                options={[
                  { value: 'all', label: 'All Types' },
                  ...availableTypes.map((t) => ({ value: t, label: PACK_TYPE_LABELS[t] || t })),
                ]}
              />

              {/* Selection controls */}
              <div className="flex items-center gap-2 ml-auto text-sm">
                <span className="text-on-surface-variant">
                  {selectedCount}/{totalCount}
                </span>
                <button onClick={selectAll} className="text-primary hover:underline text-xs font-medium">
                  All
                </button>
                <span className="text-on-surface-variant">|</span>
                <button
                  onClick={() => selectByType('use_case')}
                  className="text-on-surface-variant hover:text-on-surface text-xs font-medium"
                >
                  Use cases
                </button>
                <span className="text-on-surface-variant">|</span>
                <button
                  onClick={() => selectByType('siem_ready')}
                  className="text-on-surface-variant hover:text-on-surface text-xs font-medium"
                >
                  SIEM-ready
                </button>
                <span className="text-on-surface-variant">|</span>
                <button
                  onClick={selectNone}
                  className="text-on-surface-variant hover:text-on-surface text-xs font-medium"
                >
                  None
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto">
          {libraryTruncated && !isAnalyzing && (
            <div className="mx-6 mt-3 mb-1 p-2.5 bg-surface-container-highest border border-outline-variant/30 rounded-lg flex items-start gap-2">
              <Icon name="alert-triangle" className="w-4 h-4 text-on-surface flex-shrink-0 mt-0.5" />
              <p className="text-xs text-on-surface">
                Library has 10,000+ detections. Analysis used only the first 10,000 rows; candidates may not reflect the
                full catalog.
              </p>
            </div>
          )}
          {isAnalyzing ? (
            <div className="flex flex-col items-center justify-center py-20">
              <Icon name="spinner" className="w-8 h-8 animate-spin text-primary mb-4" />
              <p className="text-on-surface-variant font-medium">Analyzing your detection library...</p>
            </div>
          ) : candidates.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20">
              <Icon name="inbox" className="w-12 h-12 text-on-surface-variant mb-4" />
              <p className="text-on-surface-variant font-medium">No packs can be generated</p>
              <p className="text-sm text-on-surface-variant mt-1">Need at least 3 detections with shared attributes</p>
            </div>
          ) : filteredCount === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <p className="text-on-surface-variant">No packs match your filters</p>
              <button
                onClick={() => {
                  setSearch('');
                  setTypeFilter('all');
                }}
                className="text-primary text-sm mt-2 hover:underline"
              >
                Clear filters
              </button>
            </div>
          ) : (
            <div>
              {/* Single column header row */}
              <div className="grid grid-cols-[40px_1fr_90px_64px_64px_140px_100px_90px] gap-0 px-6 py-2 text-[10px] font-medium text-on-surface-variant uppercase tracking-wider border-b border-outline-variant/10 bg-surface-container/30 sticky top-0 z-10">
                <div />
                <div className="pl-1">Name</div>
                <div>Type</div>
                <div className="text-right pr-2">Rules</div>
                <div className="text-right pr-2">TTPs</div>
                <div>Platforms</div>
                <div>Languages</div>
                <div>Severity</div>
              </div>

              {/* Flat rows */}
              {filteredCandidates.map((candidate) => {
                const isSelected = selectedNames.has(candidate.name);
                const detCount = candidate.detection_ids.length;
                const techCount = candidate.mitre_technique_ids.length;
                const typeLabel = PACK_TYPE_SHORT[candidate.pack_type] || candidate.pack_type;

                return (
                  <div
                    key={candidate.name}
                    className={`grid grid-cols-[40px_1fr_90px_64px_64px_140px_100px_90px] gap-0 px-6 py-2.5 items-center cursor-pointer border-b border-outline-variant/5 transition-colors ${
                      isSelected ? 'bg-primary/5 hover:bg-primary/8' : 'hover:bg-surface-container/30'
                    }`}
                    onClick={() => toggleCandidate(candidate.name)}
                  >
                    <div>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleCandidate(candidate.name)}
                        onClick={(e) => e.stopPropagation()}
                        className="w-4 h-4 rounded border-outline-variant accent-primary"
                      />
                    </div>

                    <div className="flex items-center gap-2 pl-1 pr-3 min-w-0">
                      <span className="font-medium text-sm text-on-surface truncate" title={candidate.name}>
                        {candidate.name}
                      </span>
                      {candidate.labCount > 0 && (
                        <span
                          role="img"
                          aria-label={`${candidate.labCount} detection${candidate.labCount !== 1 ? 's' : ''} in Development library`}
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-surface-container-highest text-on-surface border border-outline-variant/30 flex-shrink-0"
                          title={`${candidate.labCount} rule${candidate.labCount !== 1 ? 's' : ''} in Development library — won't deploy to SIEM`}
                        >
                          <Icon name="alert-triangle" className="w-3 h-3" />
                          {candidate.labCount} Lab
                        </span>
                      )}
                    </div>

                    <div className="text-[11px] text-on-surface-variant">{typeLabel}</div>

                    <div className="text-right text-sm tabular-nums text-on-surface pr-2">{detCount}</div>

                    <div className="text-right text-sm tabular-nums text-on-surface-variant pr-2">{techCount}</div>

                    <div className="text-xs text-on-surface-variant truncate" title={candidate.platforms.join(', ')}>
                      {candidate.platforms.slice(0, 3).join(', ')}
                      {candidate.platforms.length > 3 && ` +${candidate.platforms.length - 3}`}
                    </div>

                    <div className="flex items-center gap-1 overflow-hidden">
                      {candidate.queryLanguages.slice(0, 2).map((lang) => (
                        <span
                          key={lang}
                          className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-surface-container text-on-surface-variant whitespace-nowrap"
                        >
                          {lang}
                        </span>
                      ))}
                      {candidate.queryLanguages.length > 2 && (
                        <span className="text-[10px] text-on-surface-variant">
                          +{candidate.queryLanguages.length - 2}
                        </span>
                      )}
                    </div>

                    <div>
                      <SeverityPills counts={candidate.severityCounts} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-outline-variant/20 bg-surface-container/30">
          <div className="text-sm text-on-surface-variant">
            {selectedCount > 0 ? (
              <>
                {selectedCount} pack{selectedCount !== 1 ? 's' : ''} selected
                {' · '}
                {candidates
                  .filter((c) => selectedNames.has(c.name))
                  .reduce((s, c) => s + c.detection_ids.length, 0)
                  .toLocaleString()}{' '}
                detections
              </>
            ) : (
              <span>Select packs to generate</span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl text-sm font-medium text-on-surface-variant hover:bg-surface-container transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleGenerate}
              disabled={selectedCount === 0 || isGenerating || isAnalyzing}
              className="flex items-center gap-2 px-6 py-2.5 bg-primary text-on-primary font-bold rounded-xl  transition-all shadow-lg  disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isGenerating ? (
                <>
                  <Icon name="spinner" className="w-4 h-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>Generate{selectedCount > 0 ? ` (${selectedCount})` : ''}</>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
