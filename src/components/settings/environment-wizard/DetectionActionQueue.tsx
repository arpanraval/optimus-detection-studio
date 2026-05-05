import React, { useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../../lib/supabaseClient';
import { useToast } from '../../../hooks/useToast';
import { routeHelpers, ROUTES } from '../../../router/routes';
import { scoreToGrade, type QualityGrade } from '../../../lib/quality/scoringEngine';
import { Icon } from '../../Icon';
import type { RecommendedDetection, PriorityBreakdown } from '../../../hooks/useProfileIntelligence';

const SEVERITY_ORDER: Record<string, number> = { Critical: 4, High: 3, Medium: 2, Low: 1 };

// Severity → single accent color for the text only
const SEV_TEXT: Record<string, string> = {
  Critical: 'text-ext-coral',
  High: 'text-ext-orange',
  Medium: 'text-ext-amber',
  Low: 'text-ext-blue',
};

// Quality grade → subtle colored circle
const GRADE_STYLE: Record<QualityGrade, string> = {
  A: 'border-ext-green/60 text-ext-green',
  B: 'border-ext-teal/60 text-ext-teal',
  C: 'border-ext-amber/60 text-ext-amber',
  D: 'border-ext-orange/60 text-ext-orange',
  F: 'border-ext-coral/60 text-ext-coral',
};

const BREAKDOWN_LABELS: Record<keyof PriorityBreakdown, string> = {
  severity: 'Severity',
  threatGroups: 'Threat Groups',
  quality: 'Quality',
  siemReady: 'SIEM Ready',
  crownJewel: 'Crown Jewel',
  validated: 'Validated',
  confidence: 'Confidence',
};

interface DetectionActionQueueProps {
  detections: RecommendedDetection[];
  userQueryLanguages: string[];
  loading: boolean;
}

interface ExpandedRowData {
  investigationSteps: Array<{ id: string; order: number; title: string; description: string; query?: string }>;
  query: string;
  queryExplanation: string;
}

export const DetectionActionQueue: React.FC<DetectionActionQueueProps> = ({
  detections,
  userQueryLanguages,
  loading,
}) => {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedData, setExpandedData] = useState<ExpandedRowData | null>(null);
  const [expandLoading, setExpandLoading] = useState(false);
  const [sortBy, setSortBy] = useState<'priority' | 'quality' | 'severity'>('priority');
  const [pipelining, setPipelining] = useState(false);

  // Show top 50 priority detections, not the full matched set
  const TOP_N = 50;

  const sorted = useMemo(() => {
    const all = [...detections].sort((a, b) => {
      if (sortBy === 'quality') return (b.qualityScore ?? 0) - (a.qualityScore ?? 0);
      if (sortBy === 'severity') return (SEVERITY_ORDER[b.severity] ?? 0) - (SEVERITY_ORDER[a.severity] ?? 0);
      return b.priorityScore - a.priorityScore;
    });
    return all.slice(0, TOP_N);
  }, [detections, sortBy]);

  const totalMatched = detections.length;

  const techniqueDetectionCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const d of sorted) {
      for (const id of d.mitreAttackIds) {
        if (id) counts.set(id, (counts.get(id) || 0) + 1);
      }
    }
    return counts;
  }, [sorted]);

  const lowQualityCount = useMemo(() => {
    return sorted.filter(d => {
      const g = scoreToGrade(d.qualityScore ?? 0);
      return g === 'D' || g === 'F';
    }).length;
  }, [sorted]);

  const handleExpand = useCallback(async (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
      setExpandedData(null);
      return;
    }
    setExpandedId(id);
    setExpandedData(null);
    setExpandLoading(true);
    try {
      const { data, error } = await supabase
        .from('detections')
        .select('investigationSteps,detectionQuery,queryExplanation')
        .eq('id', id)
        .single();
      if (error) throw error;
      setExpandedData({
        investigationSteps: (data as any)?.investigationSteps || [],
        query: (data as any)?.detectionQuery || '',
        queryExplanation: (data as any)?.queryExplanation || '',
      });
    } catch {
      setExpandedData({ investigationSteps: [], query: '', queryExplanation: '' });
    } finally {
      setExpandLoading(false);
    }
  }, [expandedId]);

  const toggleSelect = useCallback((id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const allSelected = sorted.length > 0 && sorted.every(d => selected.has(d.id));

  const toggleSelectAll = useCallback(() => {
    setSelected(prev => {
      const next = new Set(prev);
      if (allSelected) {
        for (const d of sorted) next.delete(d.id);
      } else {
        for (const d of sorted) next.add(d.id);
      }
      return next;
    });
  }, [allSelected, sorted]);

  const handleAddToPipeline = useCallback(async (ids: string[]) => {
    if (ids.length === 0) return;
    setPipelining(true);
    try {
      // Only promote Idea/Draft into Backlog. Detections already in
      // Review/Testing/Production must not be demoted.
      const { data: eligibleData, error: queryError } = await supabase
        .from('detections')
        .select('id')
        .in('id', ids)
        .in('status', ['Idea', 'Draft']);
      if (queryError) throw queryError;
      const eligibleIds = (eligibleData ?? []).map((r: { id: string }) => r.id);
      const skipped = ids.length - eligibleIds.length;
      if (eligibleIds.length === 0) {
        showToast('info', 'Nothing to add', `All ${ids.length} are already in pipeline or production`);
        return;
      }
      const { error } = await supabase
        .from('detections')
        .update({ status: 'Backlog' })
        .in('id', eligibleIds);
      if (error) throw error;
      const skipMsg = skipped > 0 ? ` (${skipped} skipped — already past Draft)` : '';
      showToast('success', 'Added to Pipeline', `${eligibleIds.length} detection${eligibleIds.length === 1 ? '' : 's'} moved to Backlog${skipMsg}`);
      setSelected(new Set());
    } catch (err) {
      showToast('error', 'Failed', err instanceof Error ? err.message : 'Could not update');
    } finally {
      setPipelining(false);
    }
  }, [showToast]);

  if (loading) {
    return (
      <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: 'rgb(var(--md-sys-color-surface-container-high))' }}>
        <div className="p-5">
          <div className="h-4 w-40 bg-surface-container rounded animate-pulse mb-4" />
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-11 bg-surface-container/50 rounded-lg animate-pulse mb-1" style={{ opacity: 1 - i * 0.15 }} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: 'rgb(var(--md-sys-color-surface-container-high))' }}>

      {/* Header bar */}
      <div className="flex items-center justify-between px-5 py-3">
        <div>
          <div className="flex items-baseline gap-3">
            <h2 className="text-[10px] font-brand font-bold text-on-surface tracking-[0.2em] uppercase">
              Top {Math.min(TOP_N, totalMatched)} Priority Detections
            </h2>
            <span className="text-[10px] text-on-surface-variant">
              of {totalMatched.toLocaleString()} matched
            </span>
          </div>
          <p className="text-[10px] text-outline mt-0.5">
            Ranked by threat group relevance, SIEM readiness, and quality score
          </p>
        </div>
        <div className="flex items-center gap-4">
          {/* Sort toggle */}
          <div className="flex items-center gap-0.5">
            {(['priority', 'quality', 'severity'] as const).map(s => (
              <button
                key={s}
                onClick={() => setSortBy(s)}
                className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider transition-colors ${
                  sortBy === s
                    ? 'text-on-surface bg-surface-container-highest'
                    : 'text-outline hover:text-on-surface-variant'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
          <button
            onClick={() => navigate(`${ROUTES.LIBRARY}?severity=Critical,High`)}
            className="text-[10px] font-bold text-ext-teal uppercase tracking-wider hover:opacity-70 transition-opacity"
          >
            Full Library
          </button>
        </div>
      </div>

      {/* Quality gate warning */}
      {lowQualityCount > 0 && (
        <div
          className="flex items-center gap-2 px-5 py-2 border-b"
          style={{
            borderColor: 'rgb(var(--md-ext-color-amber) / 0.15)',
            backgroundColor: 'rgb(var(--md-ext-color-amber) / 0.06)',
          }}
        >
          <Icon name="alert-triangle" className="w-3.5 h-3.5 text-ext-amber flex-shrink-0" />
          <span className="text-[10px] text-ext-amber">
            {lowQualityCount} of {sorted.length} detections have low quality (D/F) — consider reviewing before deployment
          </span>
        </div>
      )}

      {/* Batch actions */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 px-5 py-2 border-y" style={{ borderColor: 'rgb(var(--md-ext-color-teal) / 0.15)', backgroundColor: 'rgb(var(--md-ext-color-teal) / 0.05)' }}>
          <button onClick={toggleSelectAll} className="text-[10px] font-bold text-ext-teal uppercase tracking-wider">
            {allSelected ? 'Deselect' : 'Select All'}
          </button>
          <span className="text-[11px] font-mono text-on-surface-variant">{selected.size} selected</span>
          <button
            onClick={() => handleAddToPipeline(Array.from(selected))}
            disabled={pipelining}
            className="ml-auto px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded"
            style={{
              background: 'rgb(var(--md-ext-color-teal))',
              color: 'rgb(var(--md-ext-color-on-teal))',
            }}
          >
            {pipelining ? 'Adding...' : `Pipeline ${selected.size}`}
          </button>
          <button onClick={() => setSelected(new Set())} className="text-[10px] text-outline hover:text-on-surface-variant">
            Clear
          </button>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-outline-variant/10">
              <th className="w-8 px-2 py-2" />
              <th className="w-8 px-1 py-2 text-[9px] font-bold text-outline uppercase tracking-widest">Quality</th>
              <th className="px-2 py-2 text-[9px] font-bold text-outline uppercase tracking-widest">Detection</th>
              <th className="w-20 px-2 py-2 text-[9px] font-bold text-outline uppercase tracking-widest hidden md:table-cell">Technique</th>
              <th className="w-16 px-2 py-2 text-[9px] font-bold text-outline uppercase tracking-widest hidden lg:table-cell">Language</th>
              <th className="w-16 px-2 py-2 text-[9px] font-bold text-outline uppercase tracking-widest text-right">Severity</th>
              <th className="w-8 px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-5 py-12 text-center text-[12px] text-outline">
                  No matched detections for your environment.
                </td>
              </tr>
            ) : (
              sorted.map((d, i) => {
                const grade = scoreToGrade(d.qualityScore ?? 0);
                const isNative = userQueryLanguages.includes(d.queryLanguage);
                const isExpanded = expandedId === d.id;
                const isSelected = selected.has(d.id);

                return (
                  <React.Fragment key={d.id}>
                    <tr
                      className={`border-b border-outline-variant/5 cursor-pointer transition-colors ${
                        isSelected ? 'bg-ext-teal/[0.04]' : 'hover:bg-surface-container-highest/40'
                      }`}
                      onClick={() => handleExpand(d.id)}
                      style={{ opacity: 0, animation: `slideUp 120ms ease ${i * 12}ms forwards` }}
                    >
                      {/* Checkbox */}
                      <td className="px-2 py-2.5">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(d.id)}
                          onClick={e => e.stopPropagation()}
                          className="w-3.5 h-3.5 rounded border-outline-variant/30 text-ext-teal focus:ring-ext-teal/30 cursor-pointer"
                        />
                      </td>

                      {/* Grade circle */}
                      <td className="px-1 py-2.5">
                        <span
                          className={`w-6 h-6 rounded-full border-2 flex items-center justify-center text-[10px] font-bold ${GRADE_STYLE[grade]}`}
                          title={`Quality grade: ${grade} (${d.qualityScore ?? 0}/100). A=Excellent, B=Good, C=Adequate, D=Poor, F=Failing`}
                        >
                          {grade}
                        </span>
                      </td>

                      {/* Detection name + sub-info */}
                      <td className="px-2 py-2.5 max-w-0">
                        <button
                          onClick={e => { e.stopPropagation(); navigate(routeHelpers.detectionDetail(d.id)); }}
                          className="text-[12px] font-medium text-on-surface hover:text-ext-teal transition-colors truncate block w-full text-left"
                        >
                          {d.name}
                        </button>
                        <div className="flex items-center gap-2 mt-0.5">
                          {d.threatGroupNames.length > 0 && (
                            <span className="text-[10px] text-ext-rose truncate max-w-[140px]" title={d.threatGroupNames.join(', ')}>
                              {d.threatGroupNames.length <= 2 ? d.threatGroupNames.join(', ') : `${d.threatGroupNames[0]} +${d.threatGroupNames.length - 1}`}
                            </span>
                          )}
                          {d.crownJewelMatch && (
                            <span className="text-[10px] text-ext-amber flex items-center gap-0.5">
                              <Icon name="shield" className="w-2.5 h-2.5" /> {d.crownJewelMatch}
                            </span>
                          )}
                          {d.testedAndValidated && (
                            <span className="text-[10px] text-ext-green flex items-center gap-0.5">
                              <Icon name="check-circle" className="w-2.5 h-2.5" /> Validated
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Technique */}
                      <td className="px-2 py-2.5 hidden md:table-cell">
                        <span className="text-[10px] font-mono text-on-surface-variant">
                          {d.mitreAttackIds.length > 0 ? d.mitreAttackIds[0] : '—'}
                        </span>
                        {d.mitreAttackIds.length > 1 && (
                          <span className="text-[10px] text-outline ml-0.5">+{d.mitreAttackIds.length - 1}</span>
                        )}
                        {d.mitreAttackIds.length > 0 && (techniqueDetectionCounts.get(d.mitreAttackIds[0]) ?? 0) > 1 && (
                          <span className="text-[9px] text-outline ml-1">
                            1 of {techniqueDetectionCounts.get(d.mitreAttackIds[0])}
                          </span>
                        )}
                      </td>

                      {/* Language */}
                      <td className="px-2 py-2.5 hidden lg:table-cell">
                        {isNative ? (
                          <span className="text-[10px] font-mono font-bold text-ext-teal">
                            {d.queryLanguage} <span className="text-[9px] font-normal opacity-70">(Native)</span>
                          </span>
                        ) : d.queryLanguage === 'Sigma' ? (
                          <span className="text-[10px] font-mono font-bold">
                            <span className="text-ext-indigo">Sigma</span>
                            <span className="text-outline mx-0.5">{'\u2192'}</span>
                            <span className="text-ext-teal">{userQueryLanguages.join(', ') || '?'}</span>
                          </span>
                        ) : (
                          <span className="text-[10px] font-mono text-on-surface-variant">
                            {d.queryLanguage}
                          </span>
                        )}
                      </td>

                      {/* Severity */}
                      <td className="px-2 py-2.5 text-right">
                        <span className={`text-[10px] font-bold uppercase tracking-wider ${SEV_TEXT[d.severity] || 'text-on-surface-variant'}`}>
                          {d.severity}
                        </span>
                      </td>

                      {/* Expand icon */}
                      <td className="px-2 py-2.5">
                        <Icon
                          name={isExpanded ? 'chevron-up' : 'chevron-down'}
                          className="w-3.5 h-3.5 text-outline"
                        />
                      </td>
                    </tr>

                    {/* Expanded detail row */}
                    {isExpanded && (
                      <tr>
                        <td colSpan={7} className="px-5 pb-4 pt-2">
                          {expandLoading ? (
                            <div className="flex items-center gap-2 py-3">
                              <div className="animate-spin w-4 h-4 border-2 border-ext-teal border-t-transparent rounded-full" />
                              <span className="text-[11px] text-outline">Loading...</span>
                            </div>
                          ) : expandedData ? (
                            <div className="ml-12">
                              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                                {/* Investigation steps */}
                                <div>
                                  <h4 className="text-[9px] font-brand font-bold text-on-surface-variant tracking-[0.15em] uppercase mb-2">
                                    Investigation Steps
                                  </h4>
                                  {expandedData.investigationSteps.length > 0 ? (
                                    <ol className="space-y-1.5">
                                      {expandedData.investigationSteps.slice(0, 4).map((step, idx) => (
                                        <li key={step.id || idx} className="flex items-start gap-2">
                                          <span className="text-[10px] font-mono font-bold text-ext-teal w-4 flex-shrink-0">{step.order || idx + 1}.</span>
                                          <div>
                                            <div className="text-[11px] font-medium text-on-surface">{step.title}</div>
                                            <div className="text-[11px] text-on-surface-variant line-clamp-2">{step.description}</div>
                                          </div>
                                        </li>
                                      ))}
                                    </ol>
                                  ) : (
                                    <p className="text-[11px] text-outline">No steps defined</p>
                                  )}
                                </div>

                                {/* Query */}
                                <div>
                                  <h4 className="text-[9px] font-brand font-bold text-on-surface-variant tracking-[0.15em] uppercase mb-2">
                                    Detection Query
                                  </h4>
                                  {expandedData.query ? (
                                    <pre className="p-3 rounded-lg text-[10px] font-mono text-on-surface-variant overflow-x-auto max-h-28 leading-relaxed"
                                      style={{ backgroundColor: 'rgb(var(--md-sys-color-surface-container))' }}
                                    >
                                      {expandedData.query.slice(0, 400)}{expandedData.query.length > 400 ? '...' : ''}
                                    </pre>
                                  ) : (
                                    <p className="text-[11px] text-outline">No query available</p>
                                  )}
                                  {d.mitreAttackIds.length > 0 && (
                                    <div className="flex flex-wrap gap-1 mt-2">
                                      {d.mitreAttackIds.map(id => (
                                        <span key={id} className="font-mono text-[9px] font-bold px-1.5 py-0.5 rounded text-ext-teal" style={{ backgroundColor: 'rgb(var(--md-ext-color-teal) / 0.1)' }}>
                                          {id}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* Priority score breakdown */}
                              {d.priorityBreakdown && (
                                <div className="mt-3 pt-2 border-t border-outline-variant/10">
                                  <h4 className="text-[9px] font-brand font-bold text-on-surface-variant tracking-[0.15em] uppercase mb-1">
                                    Priority Score
                                  </h4>
                                  <span className="text-[11px] text-on-surface-variant">
                                    {(Object.keys(BREAKDOWN_LABELS) as Array<keyof PriorityBreakdown>)
                                      .filter(k => d.priorityBreakdown[k] !== 0)
                                      .map(k => `${BREAKDOWN_LABELS[k]} +${d.priorityBreakdown[k]}`)
                                      .join(', ')}
                                    {' = '}
                                    <span className="font-bold text-on-surface">{d.priorityScore}</span>
                                  </span>
                                </div>
                              )}

                              <div className="flex items-center gap-4 mt-3 pt-2 border-t border-outline-variant/10">
                                <button
                                  onClick={() => navigate(routeHelpers.detectionDetail(d.id))}
                                  className="text-[10px] font-bold text-ext-teal hover:opacity-70 transition-opacity flex items-center gap-1 uppercase tracking-wider"
                                >
                                  Open Detection <Icon name="external-link" className="w-3 h-3" />
                                </button>
                                <button
                                  onClick={() => handleAddToPipeline([d.id])}
                                  className="text-[10px] font-bold text-on-surface-variant hover:text-on-surface transition-colors uppercase tracking-wider"
                                >
                                  Add to Pipeline
                                </button>
                              </div>
                            </div>
                          ) : null}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>

    </div>
  );
};
