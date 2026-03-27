import React, { useMemo } from 'react';
import type { WidgetComponentProps } from './types';
import { useDashboardDetections } from '../useDashboardDetections';
import { useLibrary } from '../../../../context/LibraryContext';
import { useDefensivePosture } from '../../../../hooks/useImpactScores';
import WidgetEmptyState from './WidgetEmptyState';

const MaturityRadarWidget: React.FC<WidgetComponentProps> = ({ config, timeRange }) => {
  const { detections: allDetections } = useDashboardDetections();
  const { userId } = useLibrary();
  const { posture } = useDefensivePosture(userId);

  const detections = useMemo(() => {
    if (!timeRange.startDate) return allDetections;
    const start = new Date(timeRange.startDate).getTime();
    const end = timeRange.endDate ? new Date(timeRange.endDate).getTime() : Infinity;
    return allDetections.filter(d => {
      const ts = d.createdDate ? new Date(d.createdDate).getTime() : 0;
      return ts >= start && ts <= end;
    });
  }, [allDetections, timeRange]);

  const dimensions = useMemo(() => {
    if (detections.length === 0) return null;
    const total = detections.length;
    const coverage = posture?.technique_coverage_pct ?? 0;
    const validated = detections.filter(d => d.testedAndValidated).length;
    const validation = Math.round((validated / total) * 100);
    const qualitySum = detections.reduce((s, d) => s + (d.qualityScore || 0), 0);
    const quality = Math.round(qualitySum / total);
    const linked = detections.filter(d => (d.linkedGroups && d.linkedGroups.length > 0) || (d.linkedSoftware && d.linkedSoftware.length > 0)).length;
    const threatIntel = Math.round((linked / total) * 100);
    const prod = detections.filter(d => d.status === 'Production').length;
    const production = Math.round((prod / total) * 100);
    const langCounts: Record<string, number> = {};
    detections.forEach(d => { if (d.queryLanguage) langCounts[d.queryLanguage] = (langCounts[d.queryLanguage] || 0) + 1; });
    const langs = Object.values(langCounts);
    let entropy = 0;
    if (langs.length > 1) {
      const t = langs.reduce((a, b) => a + b, 0);
      entropy = -langs.reduce((s, c) => { const p = c / t; return s + (p > 0 ? p * Math.log2(p) : 0); }, 0);
    }
    const maxEntropy = langs.length > 1 ? Math.log2(langs.length) : 1;
    const sourceDiversity = Math.round((entropy / maxEntropy) * 100);
    return [
      { label: 'Coverage', value: coverage },
      { label: 'Validation', value: validation },
      { label: 'Quality', value: quality },
      { label: 'Threat Intel', value: threatIntel },
      { label: 'Production', value: production },
      { label: 'Diversity', value: sourceDiversity },
    ];
  }, [detections, posture]);

  if (!dimensions) return <WidgetEmptyState message="No detections to compute maturity" />;

  const SIZE = 340;
  const CX = SIZE / 2;
  const CY = SIZE / 2;
  const R = 130;
  const axes = dimensions.length;
  const angleStep = (2 * Math.PI) / axes;
  const composite = Math.round(dimensions.reduce((s, d) => s + d.value, 0) / axes);
  const getPoint = (index: number, value: number) => {
    const angle = -Math.PI / 2 + index * angleStep;
    const r = (value / 100) * R;
    return { x: CX + r * Math.cos(angle), y: CY + r * Math.sin(angle) };
  };
  const polygonPoints = dimensions.map((d, i) => { const p = getPoint(i, d.value); return `${p.x},${p.y}`; }).join(' ');
  const accent = config.accentColor;

  return (
    <div className="p-5 flex flex-col items-center h-full">
      <svg width={SIZE} height={SIZE} className="overflow-visible">
        {[25, 50, 75, 100].map(pct => (
          <polygon key={pct} points={Array.from({ length: axes }, (_, i) => { const p = getPoint(i, pct); return `${p.x},${p.y}`; }).join(' ')} fill="none" stroke="currentColor" strokeOpacity={0.06} strokeWidth={1} />
        ))}
        {dimensions.map((_, i) => { const p = getPoint(i, 100); return <line key={i} x1={CX} y1={CY} x2={p.x} y2={p.y} stroke="currentColor" strokeOpacity={0.08} strokeWidth={1} />; })}
        <polygon points={polygonPoints} fill={accent || 'rgb(var(--md-sys-color-primary))'} fillOpacity={0.15} stroke={accent || 'rgb(var(--md-sys-color-primary))'} strokeWidth={2} strokeLinejoin="round" />
        {dimensions.map((d, i) => { const p = getPoint(i, d.value); return <circle key={i} cx={p.x} cy={p.y} r={4} fill={accent || 'rgb(var(--md-sys-color-primary))'} />; })}
        {dimensions.map((d, i) => { const p = getPoint(i, 118); return <text key={i} x={p.x} y={p.y} textAnchor="middle" dominantBaseline="middle" className="fill-on-surface-variant/60 font-brand font-medium" style={{ fontSize: '11px' }}>{d.label}<title>{`${d.label}: ${d.value}%`}</title></text>; })}
        <text x={CX} y={CY - 8} textAnchor="middle" className="fill-primary font-brand font-bold" style={{ fontSize: 30 }}>{composite}</text>
        <text x={CX} y={CY + 14} textAnchor="middle" className="fill-on-surface-variant/40 font-brand font-bold uppercase tracking-widest" style={{ fontSize: '9px' }}>Score</text>
      </svg>
    </div>
  );
};

export default MaturityRadarWidget;
