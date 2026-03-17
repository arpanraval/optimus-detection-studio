import React, { useMemo } from 'react';
import type { WidgetComponentProps } from './types';
import { FONT_SIZE_CLASS, formatWidgetNumber } from './types';
import { useAppData } from '../../../../router/AppDataContext';
import WidgetEmptyState from './WidgetEmptyState';

interface HygieneAlert {
  key: string; count: number; label: string; filterView: string; filterParams: any;
}

const HygieneAlertsWidget: React.FC<WidgetComponentProps> = ({ config, onNavigate, timeRange }) => {
  const { detections } = useAppData();

  const filtered = useMemo(() => {
    if (!timeRange.startDate) return detections;
    const rangeStart = new Date(timeRange.startDate).getTime();
    const rangeEnd = timeRange.endDate ? new Date(timeRange.endDate).getTime() : Infinity;
    return detections.filter(d => {
      const ts = d.createdDate;
      if (!ts) return true;
      const t = new Date(ts).getTime();
      return t >= rangeStart && t <= rangeEnd;
    });
  }, [detections, timeRange]);

  const alerts = useMemo<HygieneAlert[]>(() => {
    const now = Date.now();
    const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
    const notValidated = filtered.filter(d => d.status === 'Production' && !d.testedAndValidated).length;
    const staleDrafts = filtered.filter(d => {
      if (d.status !== 'Draft' && d.status !== 'Backlog') return false;
      if (!d.createdDate) return false;
      return (now - new Date(d.createdDate).getTime()) > THIRTY_DAYS;
    }).length;
    const missingLogSources = filtered.filter(d => !d.logSources || d.logSources.length === 0).length;
    const lowQuality = filtered.filter(d => (d.qualityScore || 0) < 40).length;
    const staleCutoff = new Date(now - THIRTY_DAYS).toISOString();

    const ALERT_PRIORITY: Record<string, number> = { 'not-validated': 4, 'low-quality': 3, 'no-logsrc': 2, 'stale': 1 };
    const all: HygieneAlert[] = [];
    if (notValidated > 0) all.push({ key: 'not-validated', count: notValidated, label: 'Not Validated', filterView: 'library', filterParams: { status: 'Production', testedAndValidated: 'false' } });
    if (staleDrafts > 0) all.push({ key: 'stale', count: staleDrafts, label: 'Stale Drafts', filterView: 'library', filterParams: { status: 'Draft,Backlog', createdBefore: staleCutoff } });
    if (missingLogSources > 0) all.push({ key: 'no-logsrc', count: missingLogSources, label: 'Missing Log Sources', filterView: 'library', filterParams: { missingField: 'logSources' } });
    if (lowQuality > 0) all.push({ key: 'low-quality', count: lowQuality, label: 'Low Quality', filterView: 'library', filterParams: { qualityGrade: 'F' } });
    all.sort((a, b) => (ALERT_PRIORITY[b.key] || 0) - (ALERT_PRIORITY[a.key] || 0) || b.count - a.count);
    return all;
  }, [filtered]);

  if (alerts.length === 0) return <WidgetEmptyState message="No hygiene issues detected" />;

  return (
    <div className="px-4 py-3 h-full flex flex-col justify-center">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {alerts.map((a, i) => {
          const priorityColor = a.key === 'not-validated' ? 'text-red-400' : a.key === 'low-quality' ? 'text-amber-400' : a.key === 'no-logsrc' ? 'text-orange-400' : 'text-primary';
          return (
            <div key={a.key} onClick={() => onNavigate(a.filterView, a.filterParams)}
              className="rounded-xl px-4 py-3 cursor-pointer hover:bg-surface-container-low transition-colors h-full flex flex-col items-center text-center"
              style={{ backgroundColor: 'rgb(var(--md-sys-color-primary) / 0.06)', opacity: 0, animation: `slideUp 200ms ease ${i * 60}ms forwards` }}>
              <div className="text-[13px] font-brand font-extrabold text-on-surface uppercase tracking-wider">{a.label}</div>
              <div className={`${FONT_SIZE_CLASS[config.fontSize || 'xl']} font-brand font-bold flex-1 flex items-center ${priorityColor}`}>{formatWidgetNumber(a.count, config.numberFormat)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default HygieneAlertsWidget;
