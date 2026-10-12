// src/hooks/useMyAiUsage.ts
// Personal usage view for the signed-in user. Aggregates ai_usage_daily
// (past full days) and ai_usage_events (today) into byFeature and byDay
// series, plus the user's optional user-scoped budget.

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import type { AiUsageDaily, AiUsageEvent, AiBudget } from '../types/costCenter';

export interface MyUsageWindow { days: 7 | 30 | 90 }

export function useMyAiUsage(window: MyUsageWindow = { days: 30 }) {
  const [isLoading, setIsLoading] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);
  const requestId = useRef(0);
  const [error, setError] = useState<Error | null>(null);
  const [rollup, setRollup] = useState<AiUsageDaily[]>([]);
  const [today, setToday] = useState<AiUsageEvent[]>([]);
  const [myBudget, setMyBudget] = useState<{ budget: AiBudget; current: number } | null>(null);

  const fetchAll = useCallback(async () => {
    const ticket = ++requestId.current;
    setIsLoading(true);
    setError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const start = new Date(Date.now() - window.days * 24 * 3600 * 1000);
      const todayStart = new Date();
      todayStart.setUTCHours(0, 0, 0, 0);

      const [rollupRes, todayRes, budgetRes] = await Promise.all([
        supabase
          .from('ai_usage_daily')
          .select('*')
          .eq('user_id', user.id)
          .gte('day', start.toISOString().slice(0, 10))
          .lt('day', todayStart.toISOString().slice(0, 10)),
        supabase
          .from('ai_usage_events')
          .select('*')
          .eq('user_id', user.id)
          .gte('created_at', todayStart.toISOString()),
        supabase
          .from('ai_budgets')
          .select('*')
          .eq('scope', 'user')
          .eq('scope_value', user.id)
          .eq('enabled', true)
          .maybeSingle(),
      ]);
      if (rollupRes.error) throw rollupRes.error;
      if (todayRes.error)  throw todayRes.error;
      if (ticket !== requestId.current) return;
      setRollup((rollupRes.data ?? []) as AiUsageDaily[]);
      setToday((todayRes.data ?? []) as AiUsageEvent[]);

      if (budgetRes.data) {
        const b = budgetRes.data as AiBudget;
        const { data: cur } = await supabase.rpc('get_current_spend', {
          p_scope: 'user', p_scope_value: user.id, p_period: b.period,
        });
        if (ticket !== requestId.current) return;
        setMyBudget({ budget: b, current: Number(cur ?? 0) });
      } else {
        setMyBudget(null);
      }
      setHasLoaded(true);
    } catch (e) {
      if (ticket === requestId.current) setError(e as Error);
    } finally {
      if (ticket === requestId.current) setIsLoading(false);
    }
  }, [window.days]);

  useEffect(() => { void fetchAll(); return () => { requestId.current += 1; }; }, [fetchAll]);

  const totals = useMemo(() => {
    let cost = 0, calls = 0;
    const byFeature = new Map<string, { cost: number; calls: number }>();
    const byDay = new Map<string, number>();
    const accum = (key: string, c: number, n: number) => {
      const v = byFeature.get(key) ?? { cost: 0, calls: 0 };
      v.cost += c; v.calls += n;
      byFeature.set(key, v);
    };
    for (const r of rollup) {
      cost += Number(r.cost_usd);
      calls += r.call_count;
      accum(r.feature, Number(r.cost_usd), r.call_count);
      const d = byDay.get(r.day) ?? 0;
      byDay.set(r.day, d + Number(r.cost_usd));
    }
    for (const e of today) {
      cost += Number(e.cost_usd);
      calls += 1;
      accum(e.feature, Number(e.cost_usd), 1);
      const d = e.created_at.slice(0, 10);
      byDay.set(d, (byDay.get(d) ?? 0) + Number(e.cost_usd));
    }
    return {
      totalCostUsd: cost,
      totalCalls: calls,
      byFeature: [...byFeature.entries()]
        .map(([feature, v]) => ({ feature, ...v }))
        .sort((a, b) => b.cost - a.cost),
      byDay: [...byDay.entries()]
        .map(([day, dayCost]) => ({ day, cost: dayCost }))
        .sort((a, b) => a.day.localeCompare(b.day)),
    };
  }, [rollup, today]);

  return { isLoading, hasLoaded, error, ...totals, myBudget, refetch: fetchAll };
}
