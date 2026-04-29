import React, { useState } from 'react';
import { Button } from '../../ui/Button';
import { Select } from '../../ui/Select';
import { useAiBudgets } from '../../../hooks/useAiBudgets';
import { useUserManagement } from '../../../context/UserManagementContext';
import { LLM_MODELS } from '../../../lib/aiService';
import { AI_FEATURE_CODE_VALUES, FEATURE_DISPLAY } from '../../../lib/ai/featureCodes';
import type { BudgetWithCurrent, BudgetScope, BudgetPeriod } from '../../../types/costCenter';

interface Props {
  budget: BudgetWithCurrent | null;       // null = create new
  onClose: () => void;
}

export const BudgetEditModal: React.FC<Props> = ({ budget, onClose }) => {
  const { createBudget, updateBudget } = useAiBudgets();
  const { allUsers } = useUserManagement();
  const [scope, setScope] = useState<BudgetScope>(budget?.scope ?? 'org');
  const [scopeValue, setScopeValue] = useState<string | null>(budget?.scope_value ?? null);
  const [period, setPeriod] = useState<BudgetPeriod>(budget?.period ?? 'monthly');
  const [limit, setLimit] = useState<string>(budget ? String(budget.limit_usd) : '500');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const limitUsd = Number(limit);
      if (!isFinite(limitUsd) || limitUsd <= 0) {
        alert('Limit must be a positive number');
        return;
      }
      if (scope !== 'org' && !scopeValue) {
        alert('Pick a scope value');
        return;
      }
      if (budget) {
        await updateBudget(budget.id, { scope, scope_value: scope === 'org' ? null : scopeValue, period, limit_usd: limitUsd });
      } else {
        await createBudget({ scope, scope_value: scope === 'org' ? null : scopeValue, period, limit_usd: limitUsd });
      }
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center" onClick={onClose}>
      <div className="bg-surface-container rounded-2xl shadow-xl w-full max-w-md p-5" onClick={e => e.stopPropagation()}>
        <h3 className="text-base font-bold text-on-surface mb-4">{budget ? 'Edit budget' : 'New budget'}</h3>

        <div className="space-y-3">
          <div>
            <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">Scope</label>
            <div className="flex gap-1.5 mt-1">
              {(['org', 'feature', 'user', 'model'] as BudgetScope[]).map(s => (
                <button
                  key={s}
                  onClick={() => { setScope(s); setScopeValue(s === 'org' ? null : ''); }}
                  className={`px-2.5 py-1 text-[11px] font-medium rounded-lg ${
                    scope === s ? 'bg-on-surface text-surface' : 'bg-surface-container-highest text-on-surface-variant'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {scope === 'feature' && (
            <Select
              label="Feature"
              options={AI_FEATURE_CODE_VALUES.map(c => ({ value: c, label: FEATURE_DISPLAY[c].label }))}
              value={scopeValue ?? ''}
              onChange={v => setScopeValue(v)}
              size="sm"
            />
          )}
          {scope === 'user' && (
            <Select
              label="User"
              options={(allUsers ?? []).map(u => ({ value: u.id, label: u.email ?? u.full_name ?? u.id }))}
              value={scopeValue ?? ''}
              onChange={v => setScopeValue(v)}
              size="sm"
            />
          )}
          {scope === 'model' && (
            <Select
              label="Model"
              options={LLM_MODELS.map(m => ({ value: m.id, label: m.name }))}
              value={scopeValue ?? ''}
              onChange={v => setScopeValue(v)}
              size="sm"
            />
          )}

          <Select
            label="Period"
            options={[
              { value: 'daily',       label: 'Daily' },
              { value: 'monthly',     label: 'Monthly' },
              { value: 'rolling_30d', label: 'Rolling 30 days' },
            ]}
            value={period}
            onChange={v => setPeriod(v as BudgetPeriod)}
            size="sm"
          />

          <div>
            <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">Limit (USD)</label>
            <input
              type="number" min="0" step="0.01"
              value={limit}
              onChange={e => setLimit(e.target.value)}
              className="mt-1 w-full px-3 py-1.5 rounded-lg bg-surface-container-highest border border-outline-variant/15 text-sm text-on-surface focus:outline-none"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-3 py-1.5 text-xs text-on-surface-variant hover:text-on-surface rounded-lg">Cancel</button>
          <Button color="primary" size="sm" loading={saving} onClick={handleSave}>Save</Button>
        </div>
      </div>
    </div>
  );
};
