import React, { useId, useMemo } from 'react';
import type { WidgetComponentProps } from './types';
import { useDashboardDetections } from '../useDashboardDetections';
import { useLibrary } from '../../../../context/LibraryContext';
import { useDefensivePosture, useThreatActorWeights } from '../../../../hooks/useImpactScores';
import { useCommandCenterData } from '../../../../hooks/useCommandCenterData';
import WidgetEmptyState from './WidgetEmptyState';

const MONTH_MAP: Record<string, number> = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
  Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
};

const CoverageTrendWidget: React.FC<WidgetComponentProps> = ({ config, timeRange }) => {
  const gradientId = useId();
  const { detections, scopeFilter } = useDashboardDetections();
  const { userId } = useLibrary();
  const { posture } = useDefensivePosture(userId, scopeFilter);
  const { actors } = useThreatActorWeights();
  const { coverageTrend: rawData } = useCommandCenterData(actors, detections, posture?.total_techniques);

  const data = useMemo(() => {
    if (!rawData || !timeRange.startDate) return rawData;
    const rangeStart = new Date(timeRange.startDate).getTime();
    const rangeEnd = timeRange.endDate ? new Date(timeRange.endDate).getTime() : Infinity;
    // coverageTrend items have a `month` field (e.g. "Jan 2025") — parse to approximate date
    return rawData.filter(d => {
      const parts = d.month.split(' ');
      const monthIdx = MONTH_MAP[parts[0]];
      const year = parseInt(parts[1], 10);
      if (monthIdx === undefined || isNaN(year)) return true;
      const t = new Date(year, monthIdx, 1).getTime();
      return t >= rangeStart && t <= rangeEnd;
    });
  }, [rawData, timeRange]);

  if (!data || data.length === 0 || data.every(d => d.coveragePct === 0)) {
    return <WidgetEmptyState message="No coverage trend data yet" />;
  }

  const CHART_H = 140;
  const PAD_L_PCT = 4;
  const PAD_R_PCT = 1;
  const maxVal = 100;
  const latest = data[data.length - 1];
  const first = data[0];
  const delta = latest.coveragePct - first.coveragePct;

  const count = Math.max(data.length - 1, 1);
  const getXPct = (i: number) => PAD_L_PCT + (i / count) * (100 - PAD_L_PCT - PAD_R_PCT);
  const getYPct = (v: number) => ((maxVal - v) / maxVal) * 100;
  const svgW = 100;
  const svgH = 100;
  const toSvgX = (i: number) => (PAD_L_PCT / 100) * svgW + (i / count) * ((100 - PAD_L_PCT - PAD_R_PCT) / 100) * svgW;
  const toSvgY = (v: number) => svgH - (v / maxVal) * svgH;

  const points = data.map((d, i) => `${toSvgX(i)},${toSvgY(d.coveragePct)}`).join(' ');
  const fillPath = `M ${toSvgX(0)},${svgH} ${points.split(' ').map(p => `L ${p}`).join(' ')} L ${toSvgX(data.length - 1)},${svgH} Z`;
  const linePath = `M ${points.split(' ').join(' L ')}`;
  const yTicks = [0, 25, 50, 75, 100];
  const accent = config.accentColor;

  return (
    <div className="p-5 h-full">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <span className="text-[11px] font-brand font-bold text-on-surface uppercase tracking-wider">Coverage Trend</span>
          {delta > 0 && <span className="text-[11px] font-brand font-bold text-green-400">+{delta.toFixed(1)}%</span>}
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-xl font-brand font-bold text-on-surface">{latest.coveragePct}%</span>
          <span className="text-[10px] font-brand font-medium text-on-surface-variant/40">{latest.totalRules} rules</span>
        </div>
      </div>
      <div className="w-full relative group" style={{ height: CHART_H }}>
        <svg viewBox={`0 0 ${svgW} ${svgH}`} className="absolute inset-0 w-full h-full overflow-visible" preserveAspectRatio="none">
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={accent || 'rgb(var(--md-sys-color-primary))'} stopOpacity="0.20" />
              <stop offset="100%" stopColor={accent || 'rgb(var(--md-sys-color-primary))'} stopOpacity="0.01" />
            </linearGradient>
          </defs>
          {yTicks.map(pct => (
            <line key={pct} x1={(PAD_L_PCT / 100) * svgW} y1={toSvgY(pct)} x2={svgW - (PAD_R_PCT / 100) * svgW} y2={toSvgY(pct)} stroke="currentColor" strokeOpacity={pct === 0 ? 0.1 : 0.04} vectorEffect="non-scaling-stroke" />
          ))}
          <path d={fillPath} fill={`url(#${gradientId})`} />
          <path d={linePath} fill="none" stroke={accent || 'rgb(var(--md-sys-color-primary))'} strokeWidth="2.5" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {yTicks.map(pct => (
          <span key={pct} className="absolute text-[9px] font-brand font-medium text-on-surface-variant/30 pointer-events-none" style={{ left: 0, top: `${getYPct(pct)}%`, transform: 'translateY(-50%)' }}>{pct}%</span>
        ))}
        {data.map((d, i) => (
          <div key={i} className="absolute opacity-0 group-hover:opacity-100 hover:!opacity-100 transition-opacity cursor-crosshair z-10"
            style={{ left: `${getXPct(i)}%`, top: `${getYPct(d.coveragePct)}%`, transform: 'translate(-50%, -50%)' }}
            title={`${d.month}: ${d.coveragePct}% coverage (${d.totalRules} rules)`}>
            <div className="w-2.5 h-2.5 rounded-full bg-primary ring-2 ring-white/80" />
          </div>
        ))}
      </div>
      <div className="flex justify-between text-[10px] text-on-surface-variant/40 font-brand font-medium mt-1.5" style={{ paddingLeft: `${PAD_L_PCT}%`, paddingRight: `${PAD_R_PCT}%` }}>
        {data.map((d, i) => <span key={i}>{d.month}</span>)}
      </div>
    </div>
  );
};

export default CoverageTrendWidget;
