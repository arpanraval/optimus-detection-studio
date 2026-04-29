import React, { useState } from 'react';
import { Button } from '../../ui/Button';
import { useAiBudgets } from '../../../hooks/useAiBudgets';
import type { BudgetWithCurrent } from '../../../types/costCenter';

interface Props { budget: BudgetWithCurrent; onClose: () => void; }

export const OverrideModal: React.FC<Props> = ({ budget, onClose }) => {
  const { grantOverride } = useAiBudgets();
  const [reason, setReason] = useState('');
  const [granting, setGranting] = useState(false);

  const grant = async () => {
    setGranting(true);
    try {
      await grantOverride(budget.id, reason);
      onClose();
    } finally {
      setGranting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center" onClick={onClose}>
      <div className="bg-surface-container rounded-2xl shadow-xl w-full max-w-md p-5" onClick={e => e.stopPropagation()}>
        <h3 className="text-base font-bold text-on-surface mb-2">Grant 24h override</h3>
        <p className="text-xs text-on-surface-variant mb-4">
          This budget is at <span className="text-red-400 font-bold">{Math.round(budget.pct_used * 100)}%</span> (${budget.current_usd.toFixed(2)} / ${budget.limit_usd.toFixed(2)}).
          Granting an override allows AI calls under this budget for the next 24 hours.
        </p>
        <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">Reason (optional)</label>
        <textarea
          value={reason}
          onChange={e => setReason(e.target.value.slice(0, 280))}
          rows={3}
          className="mt-1 w-full px-3 py-2 rounded-lg bg-surface-container-highest border border-outline-variant/15 text-sm text-on-surface focus:outline-none"
          placeholder="Why is this override needed?"
        />
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-3 py-1.5 text-xs text-on-surface-variant hover:text-on-surface rounded-lg">Cancel</button>
          <Button color="primary" size="sm" loading={granting} onClick={grant}>Grant 24h override</Button>
        </div>
      </div>
    </div>
  );
};
