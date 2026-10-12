import { PagePending } from '@/components/ui/PagePending';
import { LoadError } from '@/components/ui/LoadError';
import { LoadingStatus } from '@/components/ui/LoadingStatus';
import { Spinner } from '@/components/ui/Spinner';
import React, { useState } from 'react';
import { Icon } from '../../Icon';
import { Button } from '../../ui/Button';
import { useAiBudgets } from '../../../hooks/useAiBudgets';
import { CostCenterTile } from '../../cost-center/charts/CostCenterTile';
import { BudgetGauge } from '../../cost-center/charts/BudgetGauge';
import { BudgetEditModal } from './BudgetEditModal';
import { OverrideModal } from './OverrideModal';
import type { BudgetWithCurrent } from '../../../types/costCenter';
import { FEATURE_DISPLAY } from '../../../lib/ai/featureCodes';

function scopeLabel(b: BudgetWithCurrent): string {
  switch (b.scope) {
    case 'org':     return 'Organization';
    case 'feature': return FEATURE_DISPLAY[b.scope_value as keyof typeof FEATURE_DISPLAY]?.label ?? b.scope_value!;
    case 'user':    return `User: ${b.scope_value!.slice(0, 8)}…`;
    case 'model':   return `Model: ${b.scope_value!}`;
  }
}

export const BudgetsTab: React.FC = () => {
  const { budgets, isLoading, error, refetch, deleteBudget, updateBudget } = useAiBudgets();
  const [editing, setEditing] = useState<BudgetWithCurrent | 'new' | null>(null);
  const [overriding, setOverriding] = useState<BudgetWithCurrent | null>(null);

  return (
    <>
      <CostCenterTile
        title="Active budgets"
        icon="shield"
        action={
          <Button color="primary" size="sm" onClick={() => setEditing('new')} leadingIcon="plus">
            New budget
          </Button>
        }
      >
        {isLoading && budgets.length > 0 && <LoadingStatus />}
        {error && <LoadError onRetry={() => void refetch()} />}
        {isLoading && budgets.length === 0 ? (
          <PagePending layout="list" />
        ) : error && budgets.length === 0 ? null : budgets.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Icon name="shield" className="w-8 h-8 text-on-surface-variant/20 mb-3" />
            <p className="text-sm text-on-surface-variant/40">No budgets configured</p>
            <p className="text-xs text-on-surface-variant/25 mt-1">
              Click "New budget" to set hard spending caps
            </p>
          </div>
        ) : (
          <div className="divide-y divide-outline-variant/5">
            {budgets.map(b => (
              <div key={b.id} className="px-4 py-3 hover:bg-surface-container-low/30">
                <div className="flex items-center gap-4 mb-2">
                  <span className="text-xs font-medium text-on-surface w-48 truncate">{scopeLabel(b)}</span>
                  <span className="text-[10px] uppercase tracking-wider text-on-surface-variant/60 w-20">{b.period}</span>
                  <div className="flex-1">
                    <BudgetGauge currentUsd={b.current_usd} limitUsd={b.limit_usd} />
                  </div>
                  <button onClick={() => setEditing(b)} className="text-[11px] text-on-surface-variant hover:text-on-surface px-2 py-1 rounded hover:bg-surface-container-high">
                    Edit
                  </button>
                  {b.pct_used >= 1 && !b.override_active && (
                    <button onClick={() => setOverriding(b)} className="text-[11px] text-violet-400 hover:text-violet-300 px-2 py-1 rounded bg-violet-500/10">
                      Override
                    </button>
                  )}
                  <button onClick={() => updateBudget(b.id, { enabled: !b.enabled })} className="text-[11px] text-on-surface-variant hover:text-on-surface px-2 py-1 rounded hover:bg-surface-container-high">
                    {b.enabled ? 'Disable' : 'Enable'}
                  </button>
                  <button onClick={() => { if (confirm('Delete budget?')) deleteBudget(b.id); }} className="text-[11px] text-red-400/70 hover:text-red-400 px-2 py-1 rounded hover:bg-red-500/10">
                    Delete
                  </button>
                </div>
                {b.override_active && (
                  <div className="text-[10px] text-violet-400 ml-52">
                    🔓 Override active — expires {new Date(b.override_active.expires_at).toLocaleString()}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CostCenterTile>

      {editing && <BudgetEditModal budget={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      {overriding && <OverrideModal budget={overriding} onClose={() => setOverriding(null)} />}
    </>
  );
};
