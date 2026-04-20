import React from 'react';
import { Icon } from '../Icon';
import { PackDeploymentStatus } from '../../hooks/usePackDeploymentStatus';

interface Props {
  status: PackDeploymentStatus;
}

export const PackDeploymentStatusBadge: React.FC<Props> = ({ status }) => {
  const { deployed_count, total_detections, failed_count, integration_name } = status;
  const pct = total_detections > 0 ? Math.round((deployed_count / total_detections) * 100) : 0;

  let color = 'text-on-surface-variant';
  let bg = 'bg-surface-container';
  let label = 'Not Deployed';
  let iconName: 'circle' | 'check-circle' | 'alert-circle' | 'clock' = 'circle';

  if (deployed_count === 0) {
    color = 'text-on-surface-variant/70';
    bg = 'bg-surface-container';
    label = 'Not Deployed';
    iconName = 'circle';
  } else if (deployed_count === total_detections && failed_count === 0) {
    color = 'text-emerald-400';
    bg = 'bg-emerald-500/10 border border-emerald-500/20';
    label = 'Fully Deployed';
    iconName = 'check-circle';
  } else if (failed_count > 0) {
    color = 'text-red-400';
    bg = 'bg-red-500/10 border border-red-500/20';
    label = `${failed_count} failed`;
    iconName = 'alert-circle';
  } else {
    color = 'text-yellow-400';
    bg = 'bg-yellow-500/10 border border-yellow-500/20';
    label = `${pct}% deployed`;
    iconName = 'clock';
  }

  return (
    <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium ${bg} ${color}`}>
      <Icon name={iconName} className="w-3.5 h-3.5" />
      <span>{integration_name || 'SIEM'}: {label}</span>
      <span className="text-on-surface-variant/50 tabular-nums">({deployed_count}/{total_detections})</span>
    </div>
  );
};
