import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from './Icon';
import { useMyAiUsage } from '../hooks/useMyAiUsage';
import { ROUTES } from '../router/routes';

export const BudgetIndicator: React.FC = () => {
  const { myBudget, refetch } = useMyAiUsage({ days: 30 });

  // Poll every 60s while mounted
  useEffect(() => {
    const t = setInterval(refetch, 60_000);
    return () => clearInterval(t);
  }, [refetch]);

  if (!myBudget) return null;  // No personal budget → nothing to show

  const pct = myBudget.current / myBudget.budget.limit_usd;
  const periodLabel =
    myBudget.budget.period === 'daily' ? 'today' :
    myBudget.budget.period === 'monthly' ? 'this month' :
    'last 30d';

  let cls = 'text-on-surface-variant';
  let prefix = '';
  if (pct >= 1) {
    cls = 'bg-red-500/10 text-red-400 px-2 py-0.5 rounded-full';
    prefix = '✗ ';
  } else if (pct >= 0.8) {
    cls = 'bg-amber-500/10 text-amber-400 px-2 py-0.5 rounded-full';
    prefix = '⚠ ';
  }

  return (
    <Link
      to={ROUTES.MY_AI_USAGE}
      className={`flex items-center gap-1 text-[11px] font-medium ${cls} hover:opacity-80`}
      title="View my AI usage"
    >
      <Icon name="dollar-sign" className="w-3 h-3" />
      <span className="tabular-nums">
        {prefix}${myBudget.current.toFixed(2)} / ${myBudget.budget.limit_usd.toFixed(2)} {periodLabel}
      </span>
    </Link>
  );
};
