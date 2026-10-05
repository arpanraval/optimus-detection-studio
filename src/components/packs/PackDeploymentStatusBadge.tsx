import React from 'react';
import { Icon } from '../Icon';
import { PackDeploymentStatus } from '../../hooks/usePackDeploymentStatus';

interface Props {
  status: PackDeploymentStatus;
}

export const PackDeploymentStatusBadge: React.FC<Props> = ({ status }) => {
  const { deployed_count, total_detections, failed_count, integration_name } = status;
  const pct = total_detections > 0 ? Math.round((deployed_count / total_detections) * 100) : 0;

  let color: string;
  let bg: string;
  let label: string;
  let iconName: 'circle' | 'check-circle' | 'alert-circle' | 'clock';

  if (failed_count > 0) {
    color = 'text-error';
    bg = 'bg-error/10 border border-error/20';
    label = `${failed_count} failed`;
    iconName = 'alert-circle';
  } else if (deployed_count === 0) {
    color = 'text-on-surface-variant';
    bg = 'bg-surface-container';
    label = 'Not Deployed';
    iconName = 'circle';
  } else if (deployed_count === total_detections && failed_count === 0) {
    color = 'text-on-surface';
    bg = 'bg-secondary/10 border border-outline-variant/20';
    label = 'Fully Deployed';
    iconName = 'check-circle';
  } else {
    color = 'text-on-surface';
    bg = 'bg-surface-container-highest border border-outline-variant/30';
    label = `${pct}% deployed`;
    iconName = 'clock';
  }

  return (
    <div
      className={`inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5 px-2 py-1 rounded-md text-xs font-medium min-w-0 max-w-full ${bg} ${color}`}
      title={`${integration_name || 'SIEM'}: ${label} (${deployed_count}/${total_detections})`}
    >
      <Icon name={iconName} className="w-3.5 h-3.5 flex-shrink-0" />
      <span className="hidden sm:inline truncate min-w-0">{integration_name || 'SIEM'}:</span>
      <span className="truncate min-w-0">{label}</span>
      <span className="text-on-surface-variant tabular-nums flex-shrink-0">
        ({deployed_count}/{total_detections})
      </span>
    </div>
  );
};
