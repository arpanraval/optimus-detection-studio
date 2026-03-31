import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { Icon } from '../Icon';
import { ROUTES } from '../../router/routes';

interface ThreatIntelWidgetProps {
  userId: string;
}

interface WidgetState {
  pendingCount: number;
  deferredCount: number;
  oldestDeferredDays: number;
  weekDigested: number;
  weekActioned: number;
  lowestCoverage: { name: string; percent: number } | null;
  loading: boolean;
}

export const ThreatIntelWidget: React.FC<ThreatIntelWidgetProps> = ({ userId }) => {
  const navigate = useNavigate();
  const [state, setState] = useState<WidgetState>({
    pendingCount: 0,
    deferredCount: 0,
    oldestDeferredDays: 0,
    weekDigested: 0,
    weekActioned: 0,
    lowestCoverage: null,
    loading: true,
  });

  useEffect(() => {
    let cancelled = false;

    async function fetchData() {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const sevenDaysAgoISO = sevenDaysAgo.toISOString();

      const [pendingRes, deferredRes, weekRes] = await Promise.all([
        // 1. Pending count
        supabase
          .from('threat_intel_reports')
          .select('*', { count: 'exact', head: true })
          .eq('source', 'auto')
          .eq('review_status', 'pending')
          .eq('user_id', userId),
        // 2. Deferred — oldest first
        supabase
          .from('threat_intel_reports')
          .select('id, created_at')
          .eq('review_status', 'deferred')
          .eq('user_id', userId)
          .order('created_at', { ascending: true })
          .limit(1),
        // 3. Week reports
        supabase
          .from('threat_intel_reports')
          .select('id, review_status, report_title, coverage_percent')
          .eq('source', 'auto')
          .eq('user_id', userId)
          .gte('created_at', sevenDaysAgoISO),
      ]);

      if (cancelled) return;

      const pendingCount = pendingRes.count ?? 0;

      const deferredRows = deferredRes.data ?? [];
      const deferredCount = deferredRows.length;
      let oldestDeferredDays = 0;
      if (deferredCount > 0 && deferredRows[0]?.created_at) {
        const oldest = new Date(deferredRows[0].created_at);
        oldestDeferredDays = Math.floor((Date.now() - oldest.getTime()) / (1000 * 60 * 60 * 24));
      }

      // For deferred count we need the total count, not just the oldest row
      const deferredCountRes = await supabase
        .from('threat_intel_reports')
        .select('*', { count: 'exact', head: true })
        .eq('review_status', 'deferred')
        .eq('user_id', userId);

      if (cancelled) return;

      const totalDeferred = deferredCountRes.count ?? 0;

      const weekRows = weekRes.data ?? [];
      const weekDigested = weekRows.length;
      const weekActioned = weekRows.filter((r: any) => r.review_status === 'actioned').length;

      let lowestCoverage: { name: string; percent: number } | null = null;
      for (const r of weekRows as any[]) {
        if (r.coverage_percent != null) {
          if (!lowestCoverage || r.coverage_percent < lowestCoverage.percent) {
            lowestCoverage = { name: r.report_title ?? 'Untitled', percent: r.coverage_percent };
          }
        }
      }

      setState({
        pendingCount,
        deferredCount: totalDeferred,
        oldestDeferredDays,
        weekDigested,
        weekActioned,
        lowestCoverage,
        loading: false,
      });
    }

    fetchData();
    return () => { cancelled = true; };
  }, [userId]);

  if (state.loading) {
    return (
      <div className="bg-surface-container rounded-2xl border border-outline-variant/10 p-5 animate-pulse">
        <div className="h-4 w-24 bg-outline-variant/10 rounded mb-4" />
        <div className="h-3 w-40 bg-outline-variant/10 rounded mb-2" />
        <div className="h-3 w-32 bg-outline-variant/10 rounded" />
      </div>
    );
  }

  const showLowCoverage = state.lowestCoverage && state.lowestCoverage.percent < 50;
  const showDeferred = state.deferredCount > 0;

  return (
    <div className="bg-surface-container rounded-2xl border border-outline-variant/10 p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold text-on-surface">Threat Intel</span>
        <button
          onClick={() => navigate(ROUTES.THREAT_INTEL)}
          className="text-xs text-primary hover:underline"
        >
          View All &rarr;
        </button>
      </div>

      {/* Stats */}
      <div className="space-y-1.5">
        <p className="text-sm text-on-surface">
          <span className="inline-block w-2 h-2 rounded-full bg-primary mr-2 align-middle" />
          {state.pendingCount} report{state.pendingCount !== 1 ? 's' : ''} pending review
        </p>

        {showLowCoverage && (
          <p className="text-sm text-on-surface">
            <span className="inline-block w-2 h-2 rounded-full bg-amber-500 mr-2 align-middle" />
            Lowest: {state.lowestCoverage!.percent}% ({state.lowestCoverage!.name.length > 30
              ? state.lowestCoverage!.name.slice(0, 30) + '...'
              : state.lowestCoverage!.name})
          </p>
        )}

        {showDeferred && (
          <p className="text-sm text-on-surface/70">
            {state.deferredCount} deferred (oldest: {state.oldestDeferredDays}d)
          </p>
        )}
      </div>

      {/* Divider */}
      <div className="border-t border-outline-variant/10 my-3" />

      {/* Weekly summary */}
      <p className="text-sm text-on-surface/70">
        Last 7d: {state.weekDigested} digested, {state.weekActioned} actioned
      </p>
    </div>
  );
};
