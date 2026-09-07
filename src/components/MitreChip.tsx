import React from 'react';
import { Icon } from './Icon';
import type { IconName } from './Icon';

export type MitreEntityType =
  | 'tactic'
  | 'technique'
  | 'threat-group'
  | 'software'
  | 'campaign'
  | 'mitigation'
  | 'data-source'
  | 'detection-strategy';

export type ChipSize = 'xs' | 'sm' | 'md' | 'lg';

interface MitreChipProps {
  type: MitreEntityType;
  id?: string;
  name?: string;
  size?: ChipSize;
  className?: string;
}

/**
 * MitreChip Component - Detection Studio Design System
 *
 * Entity Types and Colors:
 * - Tactic (TA####): #783264 (Magenta) - target icon
 * - Technique (T####): Purple - zap icon
 * - Threat Group (G####): #A63D40 (Brick Red) - users icon
 * - Software (S####): Orange - package icon
 * - Campaign (C####): #0284C7 (Sky Blue) - flag icon
 * - Mitigation (M####): Emerald - shield icon
 * - Data Source (DS####): #4D7C6F (Sage Green) - database icon
 * - Detection Strategy: #783264 (Magenta) - crosshair icon
 *
 * Sizes: xs (16px), sm (20px), md (24px), lg (28px)
 */
export const MitreChip: React.FC<MitreChipProps> = ({
  type,
  id,
  name,
  size = 'md',
  className = ''
}) => {
  // Size configurations
  const sizeConfig: Record<ChipSize, {
    padding: string;
    text: string;
    radius: string;
    iconSize: string;
    gap: string;
  }> = {
    xs: { padding: 'px-1.5 py-0.5', text: 'text-[8px]', radius: 'rounded', iconSize: 'w-2 h-2', gap: 'gap-1' },
    sm: { padding: 'px-2 py-0.5', text: 'text-[9px]', radius: 'rounded-md', iconSize: 'w-2.5 h-2.5', gap: 'gap-1' },
    md: { padding: 'px-2.5 py-1', text: 'text-[10px]', radius: 'rounded-lg', iconSize: 'w-3 h-3', gap: 'gap-1.5' },
    lg: { padding: 'px-3 py-1.5', text: 'text-[11px]', radius: 'rounded-lg', iconSize: 'w-3.5 h-3.5', gap: 'gap-1.5' },
  };

  // Entity type configurations
  const typeConfig: Record<MitreEntityType, {
    icon: IconName;
    bgColor: string;
    textColor: string;
    borderColor: string;
  }> = {
    'tactic': {
      icon: 'target',
      bgColor: 'bg-[#783264]/10',
      textColor: 'text-[#783264]',
      borderColor: 'border-[#783264]/20',
    },
    'technique': {
      icon: 'zap',
      bgColor: 'bg-purple-500/10',
      textColor: 'text-purple-600 dark:text-purple-400',
      borderColor: 'border-purple-500/20',
    },
    'threat-group': {
      icon: 'users',
      bgColor: 'bg-[#A63D40]/10',
      textColor: 'text-[#A63D40]',
      borderColor: 'border-[#A63D40]/20',
    },
    'software': {
      icon: 'package',
      bgColor: 'bg-orange-500/10',
      textColor: 'text-orange-600 dark:text-orange-400',
      borderColor: 'border-orange-500/20',
    },
    'campaign': {
      icon: 'flag',
      bgColor: 'bg-[#0284C7]/10',
      textColor: 'text-[#0284C7]',
      borderColor: 'border-[#0284C7]/20',
    },
    'mitigation': {
      icon: 'shield',
      bgColor: 'bg-emerald-500/10',
      textColor: 'text-emerald-600 dark:text-emerald-400',
      borderColor: 'border-emerald-500/20',
    },
    'data-source': {
      icon: 'database',
      bgColor: 'bg-[#4D7C6F]/10',
      textColor: 'text-[#4D7C6F]',
      borderColor: 'border-[#4D7C6F]/20',
    },
    'detection-strategy': {
      icon: 'crosshair',
      bgColor: 'bg-[#783264]/10',
      textColor: 'text-[#783264]',
      borderColor: 'border-[#783264]/20',
    },
  };

  const sizeStyles = sizeConfig[size];
  const typeStyles = typeConfig[type];

  // Determine if ID should be mono font (MITRE IDs are)
  const showId = id && !['detection-strategy'].includes(type);
  const idClass = showId ? 'font-mono' : '';

  return (
    <span
      className={[
        'inline-flex items-center border',
        sizeStyles.padding,
        sizeStyles.text,
        sizeStyles.radius,
        sizeStyles.gap,
        typeStyles.bgColor,
        typeStyles.textColor,
        typeStyles.borderColor,
        'font-bold',
        className,
      ].filter(Boolean).join(' ')}
    >
      <Icon name={typeStyles.icon} className={sizeStyles.iconSize} />
      {showId && <span className={idClass}>{id}</span>}
      {name && <span className="font-medium">{name}</span>}
      {!showId && !name && type === 'detection-strategy' && (
        <span>Detection Strategy</span>
      )}
    </span>
  );
};

export default MitreChip;
