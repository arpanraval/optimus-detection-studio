import React from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../Icon';
import { ROUTES } from '../../router/routes';
import { useEnvironmentProfile } from '../../hooks/useEnvironmentProfile';

interface FeasibilityEmptyStateProps {
  uncoveredCount: number;
}

export const FeasibilityEmptyState: React.FC<FeasibilityEmptyStateProps> = ({ uncoveredCount }) => {
  const { profile, isLoading } = useEnvironmentProfile();

  if (isLoading) return null;

  const hasProfile = !!profile;

  return (
    <div className="flex items-start gap-3 mb-4 px-4 py-3 rounded-xl bg-surface-container-high border border-outline-variant/20">
      <Icon name="info" className="w-4 h-4 mt-0.5 text-on-surface-variant/60 flex-shrink-0" />
      <div className="flex-1 text-sm">
        <p className="text-on-surface-variant">
          {uncoveredCount} uncovered technique{uncoveredCount === 1 ? '' : 's'} — feasibility not computed.
        </p>
        <p className="text-on-surface-variant/70 text-xs mt-1">
          {hasProfile
            ? 'Re-run extraction to compute which gaps are actionable in your environment.'
            : 'Set up your environment profile to see which gaps you can detect this week.'}
        </p>
      </div>
      {!hasProfile && (
        <Link
          to={ROUTES.ENVIRONMENT_PROFILE}
          className="text-xs font-medium text-primary hover:underline whitespace-nowrap flex-shrink-0"
        >
          Set up →
        </Link>
      )}
    </div>
  );
};
