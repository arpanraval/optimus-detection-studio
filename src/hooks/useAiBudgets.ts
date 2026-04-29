// src/hooks/useAiBudgets.ts
// Admin CRUD for ai_budgets, plus 24h grant overrides. Joins each budget with
// its current spend via the get_current_spend RPC and any active override row.

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import type { AiBudget, AiBudgetOverride, BudgetWithCurrent } from '../types/costCenter';

export function useAiBudgets() {
  const [budgets, setBudgets] = useState<BudgetWithCurrent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchAll = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { data: rows, error: bErr } = await supabase.from('ai_budgets').select('*');
      if (bErr) throw bErr;
      const budgetRows = (rows ?? []) as AiBudget[];

      const ids = budgetRows.map(b => b.id);
      const { data: overrides } = ids.length
        ? await supabase
            .from('ai_budget_overrides')
            .select('*')
            .in('budget_id', ids)
            .gt('expires_at', new Date().toISOString())
        : { data: [] as AiBudgetOverride[] };

      const overrideMap = new Map<string, AiBudgetOverride>();
      for (const o of (overrides ?? []) as AiBudgetOverride[]) overrideMap.set(o.budget_id, o);

      const enriched: BudgetWithCurrent[] = await Promise.all(
        budgetRows.map(async b => {
          const { data: current } = await supabase.rpc('get_current_spend', {
            p_scope: b.scope,
            p_scope_value: b.scope_value,
            p_period: b.period,
          });
          const cur = Number(current ?? 0);
          return {
            ...b,
            current_usd: cur,
            pct_used: b.limit_usd > 0 ? cur / Number(b.limit_usd) : 0,
            override_active: overrideMap.get(b.id),
          };
        })
      );
      setBudgets(enriched);
    } catch (e) {
      setError(e as Error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const createBudget = useCallback(
    async (b: Omit<AiBudget, 'id' | 'created_at' | 'updated_at' | 'created_by' | 'enabled'> & { enabled?: boolean }) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { error: e } = await supabase
        .from('ai_budgets')
        .insert({ ...b, enabled: b.enabled ?? true, created_by: user?.id ?? null });
      if (e) throw e;
      await fetchAll();
    },
    [fetchAll]
  );

  const updateBudget = useCallback(async (id: string, patch: Partial<AiBudget>) => {
    const { error: e } = await supabase
      .from('ai_budgets')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (e) throw e;
    await fetchAll();
  }, [fetchAll]);

  const deleteBudget = useCallback(async (id: string) => {
    const { error: e } = await supabase.from('ai_budgets').delete().eq('id', id);
    if (e) throw e;
    await fetchAll();
  }, [fetchAll]);

  const grantOverride = useCallback(async (budget_id: string, reason: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');
    const { error: e } = await supabase.from('ai_budget_overrides').insert({
      budget_id,
      granted_by: user.id,
      expires_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
      reason,
    });
    if (e) throw e;
    await fetchAll();
  }, [fetchAll]);

  return { budgets, isLoading, error, refetch: fetchAll, createBudget, updateBudget, deleteBudget, grantOverride };
}
