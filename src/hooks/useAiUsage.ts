// src/hooks/useAiUsage.ts
// Admin-facing usage breakdown. Fetches past full days from the rollup table
// (ai_usage_daily) and the current day from raw events, then aggregates them
// per the requested groupBy. RLS gates non-admin access.

import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabaseClient';
import type {
  AiUsageDaily, AiUsageEvent, UsageBreakdownRow, AiCategory, AiCallStatus,
} from '../types/costCenter';

export interface UsageFilters {
  startDate?: string;          // ISO
  endDate?: string;            // ISO
  features?: string[];
  models?: string[];
  userIds?: string[];          // null = include system rows
  categories?: AiCategory[];
  statuses?: AiCallStatus[];
}

export type GroupBy = 'feature' | 'user' | 'model' | 'day' | 'category';

export interface UseAiUsageResult {
  isLoading: boolean;
  error: Error | null;
  totalCostUsd: number;
  totalCalls: number;
  failedCostUsd: number;
  failedCalls: number;
  breakdown: UsageBreakdownRow[];
  refetch: () => Promise<void>;
}

export function useAiUsage(filters: UsageFilters, groupBy: GroupBy): UseAiUsageResult {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [rollupRows, setRollupRows] = useState<AiUsageDaily[]>([]);
  const [todayRows, setTodayRows] = useState<AiUsageEvent[]>([]);

  const startISO = filters.startDate ?? new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
  const endISO = filters.endDate ?? new Date().toISOString();

  const fetchAll = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      // Past full days from rollup
      const todayDate = new Date();
      todayDate.setUTCHours(0, 0, 0, 0);
      const todayDateStr = todayDate.toISOString().slice(0, 10);

      let dailyQ = supabase
        .from('ai_usage_daily')
        .select('*')
        .gte('day', startISO.slice(0, 10))
        .lt('day', todayDateStr);

      if (filters.features?.length) dailyQ = dailyQ.in('feature', filters.features);
      if (filters.models?.length)   dailyQ = dailyQ.in('model', filters.models);
      if (filters.userIds?.length)  dailyQ = dailyQ.in('user_id', filters.userIds);
      if (filters.categories?.length) dailyQ = dailyQ.in('category', filters.categories);

      const { data: rollupData, error: dailyErr } = await dailyQ;
      if (dailyErr) throw dailyErr;
      setRollupRows((rollupData ?? []) as AiUsageDaily[]);

      // Today's raw rows
      let evQ = supabase
        .from('ai_usage_events')
        .select('*')
        .gte('created_at', todayDate.toISOString())
        .lte('created_at', endISO);

      if (filters.features?.length)   evQ = evQ.in('feature', filters.features);
      if (filters.models?.length)     evQ = evQ.in('model', filters.models);
      if (filters.userIds?.length)    evQ = evQ.in('user_id', filters.userIds);
      if (filters.categories?.length) evQ = evQ.in('category', filters.categories);
      if (filters.statuses?.length)   evQ = evQ.in('status', filters.statuses);

      const { data: evData, error: evErr } = await evQ;
      if (evErr) throw evErr;
      setTodayRows((evData ?? []) as AiUsageEvent[]);
    } catch (e) {
      setError(e as Error);
    } finally {
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    startISO, endISO,
    filters.features?.join(','), filters.models?.join(','),
    filters.userIds?.join(','), filters.categories?.join(','),
    filters.statuses?.join(','),
  ]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const totals = useMemo(() => {
    let cost = 0, calls = 0, failedCost = 0, failedCalls = 0;
    for (const r of rollupRows) {
      cost += Number(r.cost_usd);
      calls += r.call_count;
      if (r.category === 'failed') {
        failedCost += Number(r.cost_usd);
        failedCalls += r.call_count;
      }
    }
    for (const e of todayRows) {
      cost += Number(e.cost_usd);
      calls += 1;
      if (e.status !== 'success') {
        failedCost += Number(e.cost_usd);
        failedCalls += 1;
      }
    }
    return { totalCostUsd: cost, totalCalls: calls, failedCostUsd: failedCost, failedCalls };
  }, [rollupRows, todayRows]);

  const breakdown = useMemo<UsageBreakdownRow[]>(() => {
    const map = new Map<string, UsageBreakdownRow>();
    const upsert = (key: string, label: string, mut: (r: UsageBreakdownRow) => void) => {
      let row = map.get(key);
      if (!row) {
        row = { group_key: key, group_label: label, call_count: 0, cost_usd: 0, input_tokens: 0, output_tokens: 0, failure_count: 0, avg_latency_ms: null };
        map.set(key, row);
      }
      mut(row);
    };

    const keyFor = (
      r: { user_id: string | null; feature: string; model: string; day?: string; category: AiCategory }
    ): [string, string] => {
      switch (groupBy) {
        case 'feature':  return [r.feature, r.feature];
        case 'user':     return [r.user_id ?? 'system', r.user_id ?? 'System'];
        case 'model':    return [r.model, r.model];
        case 'day':      return [r.day ?? '', r.day ?? ''];
        case 'category': return [r.category, r.category];
      }
    };

    for (const r of rollupRows) {
      const [key, label] = keyFor(r);
      upsert(key, label, row => {
        row.call_count += r.call_count;
        row.cost_usd += Number(r.cost_usd);
        row.input_tokens += r.input_tokens;
        row.output_tokens += r.output_tokens;
        row.failure_count += r.failure_count;
      });
    }

    for (const e of todayRows) {
      const day = e.created_at.slice(0, 10);
      const [key, label] = keyFor({ ...e, day });
      upsert(key, label, row => {
        row.call_count += 1;
        row.cost_usd += Number(e.cost_usd);
        row.input_tokens += e.input_tokens;
        row.output_tokens += e.output_tokens;
        if (e.status !== 'success') row.failure_count += 1;
      });
    }

    return [...map.values()].sort((a, b) => b.cost_usd - a.cost_usd);
  }, [rollupRows, todayRows, groupBy]);

  return { isLoading, error, ...totals, breakdown, refetch: fetchAll };
}
