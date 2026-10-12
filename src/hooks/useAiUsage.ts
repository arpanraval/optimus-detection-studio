// src/hooks/useAiUsage.ts
// Admin-facing usage breakdown. Fetches past full days from the rollup table
// (ai_usage_daily) and the current day from raw events, then aggregates them
// per the requested groupBy. RLS gates non-admin access.

import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import type { AiUsageDaily, AiUsageEvent, UsageBreakdownRow, AiCategory, AiCallStatus } from '../types/costCenter';

export interface UsageFilters {
  startDate?: string; // ISO
  endDate?: string; // ISO
  features?: string[];
  models?: string[];
  userIds?: string[]; // null = include system rows
  categories?: AiCategory[];
  statuses?: AiCallStatus[];
}

export type GroupBy = 'feature' | 'user' | 'model' | 'day' | 'category';

export interface UseAiUsageResult {
  isLoading: boolean;
  hasLoaded: boolean;
  error: Error | null;
  totalCostUsd: number;
  totalCalls: number;
  failedCostUsd: number;
  failedCalls: number;
  breakdown: UsageBreakdownRow[];
  refetch: () => Promise<void>;
}

export function usageFilterKey(filters: UsageFilters): string {
  return JSON.stringify([
    filters.startDate,
    filters.endDate,
    filters.features,
    filters.models,
    filters.userIds,
    filters.categories,
    filters.statuses,
  ]);
}

export function useAiUsageData(filters: UsageFilters, enabled = true) {
  const [defaults] = useState(() => ({
    start: new Date(Date.now() - 30 * 86400000).toISOString(),
    end: new Date().toISOString(),
  }));
  const key = usageFilterKey(filters);
  const stableFilters = useMemo(() => filters, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const [isLoading, setIsLoading] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [rows, setRows] = useState<{ rollupRows: AiUsageDaily[]; todayRows: AiUsageEvent[] }>({
    rollupRows: [],
    todayRows: [],
  });
  const request = useRef<AbortController | null>(null);
  const fetchAll = useCallback(async () => {
    if (!enabled) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const timer = globalThis.setTimeout(() => controller.abort(), 30000);
    setIsLoading(true);
    setError(null);
    try {
      const startISO = stableFilters.startDate ?? defaults.start;
      const endISO = stableFilters.endDate ?? defaults.end;
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      let dailyQ = supabase
        .from('ai_usage_daily')
        .select('*')
        .gte('day', startISO.slice(0, 10))
        .lt('day', today.toISOString().slice(0, 10));
      let eventQ = supabase
        .from('ai_usage_events')
        .select('*')
        .gte('created_at', today.toISOString())
        .lte('created_at', endISO);
      if (stableFilters.features?.length) {
        dailyQ = dailyQ.in('feature', stableFilters.features);
        eventQ = eventQ.in('feature', stableFilters.features);
      }
      if (stableFilters.models?.length) {
        dailyQ = dailyQ.in('model', stableFilters.models);
        eventQ = eventQ.in('model', stableFilters.models);
      }
      if (stableFilters.userIds?.length) {
        dailyQ = dailyQ.in('user_id', stableFilters.userIds);
        eventQ = eventQ.in('user_id', stableFilters.userIds);
      }
      if (stableFilters.categories?.length) {
        dailyQ = dailyQ.in('category', stableFilters.categories);
        eventQ = eventQ.in('category', stableFilters.categories);
      }
      if (stableFilters.statuses?.length) eventQ = eventQ.in('status', stableFilters.statuses);
      const [daily, events] = await Promise.all([
        dailyQ.abortSignal(controller.signal),
        eventQ.abortSignal(controller.signal),
      ]);
      if (request.current !== controller) return;
      if (controller.signal.aborted) throw new Error('Usage request timed out. Try again.');
      if (daily.error) throw daily.error;
      if (events.error) throw events.error;
      setRows({ rollupRows: (daily.data ?? []) as AiUsageDaily[], todayRows: (events.data ?? []) as AiUsageEvent[] });
      setHasLoaded(true);
    } catch (e) {
      if (request.current === controller) setError(e instanceof Error ? e : new Error('Couldn’t load usage data.'));
    } finally {
      globalThis.clearTimeout(timer);
      if (request.current === controller) setIsLoading(false);
    }
  }, [enabled, stableFilters, defaults]);
  useEffect(() => {
    void fetchAll();
    return () => {
      const previous = request.current;
      request.current = null;
      previous?.abort();
    };
  }, [fetchAll]);
  return { key, isLoading, hasLoaded, error, ...rows, refetch: fetchAll };
}

export const AiUsageContext = createContext<ReturnType<typeof useAiUsageData> | null>(null);

export function useAiUsage(filters: UsageFilters, groupBy: GroupBy): UseAiUsageResult {
  const shared = useContext(AiUsageContext);
  const useShared = shared?.key === usageFilterKey(filters);
  const own = useAiUsageData(filters, !useShared);
  return useAiUsageResult(useShared && shared ? shared : own, groupBy);
}

export function useAiUsageResult(data: ReturnType<typeof useAiUsageData>, groupBy: GroupBy): UseAiUsageResult {
  const { rollupRows, todayRows, isLoading, hasLoaded, error, refetch } = data;
  const totals = useMemo(() => {
    let cost = 0,
      calls = 0,
      failedCost = 0,
      failedCalls = 0;
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
        row = {
          group_key: key,
          group_label: label,
          call_count: 0,
          cost_usd: 0,
          input_tokens: 0,
          output_tokens: 0,
          failure_count: 0,
          avg_latency_ms: null,
        };
        map.set(key, row);
      }
      mut(row);
    };

    const keyFor = (r: {
      user_id: string | null;
      feature: string;
      model: string;
      day?: string;
      category: AiCategory;
    }): [string, string] => {
      switch (groupBy) {
        case 'feature':
          return [r.feature, r.feature];
        case 'user':
          return [r.user_id ?? 'system', r.user_id ?? 'System'];
        case 'model':
          return [r.model, r.model];
        case 'day':
          return [r.day ?? '', r.day ?? ''];
        case 'category':
          return [r.category, r.category];
      }
    };

    for (const r of rollupRows) {
      const [key, label] = keyFor(r);
      upsert(key, label, (row) => {
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
      upsert(key, label, (row) => {
        row.call_count += 1;
        row.cost_usd += Number(e.cost_usd);
        row.input_tokens += e.input_tokens;
        row.output_tokens += e.output_tokens;
        if (e.status !== 'success') row.failure_count += 1;
      });
    }

    return [...map.values()].sort((a, b) => b.cost_usd - a.cost_usd);
  }, [rollupRows, todayRows, groupBy]);

  return { isLoading, hasLoaded, error, ...totals, breakdown, refetch };
}
