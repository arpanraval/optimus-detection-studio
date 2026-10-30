/**
 * Design System: Badge & Chip Constants
 *
 * Standardized sizing and color specifications for consistent badge/chip usage.
 * Based on M3 Component Library specifications.
 */

// =============================================================================
// SIZE SPECIFICATIONS
// =============================================================================

export const badgeSizes = {
  xs: 'px-1.5 py-0.5 text-[8px] rounded',
  sm: 'px-2 py-0.5 text-[9px] rounded-md',
  md: 'px-2.5 py-1 text-[10px] rounded-lg',
  lg: 'px-3 py-1.5 text-[11px] rounded-lg',
} as const;

export const badgeIconSizes = {
  xs: 'w-2 h-2',
  sm: 'w-2.5 h-2.5',
  md: 'w-3 h-3',
  lg: 'w-3.5 h-3.5',
} as const;

export type BadgeSize = keyof typeof badgeSizes;

// =============================================================================
// THREAT LEVEL COLORS
// =============================================================================

export const threatLevelColors = {
  Critical: {
    bg: 'bg-[#A63D40]/15',
    text: 'text-[#A63D40]',
    border: 'border-[#A63D40]/20',
    dot: 'bg-[#A63D40]',
    glow: 'shadow-[0_0_8px_rgba(166,61,64,0.4)]',
  },
  High: {
    bg: 'bg-orange-500/15',
    text: 'text-orange-600 dark:text-orange-400',
    border: 'border-orange-500/20',
    dot: 'bg-orange-500',
    glow: 'shadow-[0_0_8px_rgba(249,115,22,0.4)]',
  },
  Medium: {
    bg: 'bg-yellow-500/15',
    text: 'text-yellow-600 dark:text-yellow-400',
    border: 'border-yellow-500/20',
    dot: 'bg-yellow-500',
    glow: 'shadow-[0_0_8px_rgba(234,179,8,0.4)]',
  },
  Low: {
    bg: 'bg-[#4D7C6F]/15',
    text: 'text-[#4D7C6F]',
    border: 'border-[#4D7C6F]/20',
    dot: 'bg-[#4D7C6F]',
    glow: 'shadow-[0_0_8px_rgba(77,124,111,0.4)]',
  },
  Informational: {
    bg: 'bg-surface-container-highest',
    text: 'text-on-surface-variant',
    border: 'border-outline-variant/20',
    dot: 'bg-on-surface-variant/50',
    glow: '',
  },
} as const;

export type ThreatLevelKey = keyof typeof threatLevelColors;

// =============================================================================
// MITRE CHIP COLORS
// =============================================================================

export const mitreChipColors = {
  // Technique (T####) - Purple
  technique: {
    bg: 'bg-purple-500/10',
    text: 'text-purple-600 dark:text-purple-400',
    border: 'border-purple-500/20',
    icon: 'zap',
  },
  // Tactic (TA####) - Magenta
  tactic: {
    bg: 'bg-[#783264]/10',
    text: 'text-[#783264]',
    border: 'border-[#783264]/20',
    icon: 'target',
  },
  // Threat Group (G####) - Brick Red
  group: {
    bg: 'bg-[#A63D40]/10',
    text: 'text-[#A63D40]',
    border: 'border-[#A63D40]/20',
    icon: 'users',
  },
  // Software (S####) - Orange
  software: {
    bg: 'bg-orange-500/10',
    text: 'text-orange-600 dark:text-orange-400',
    border: 'border-orange-500/20',
    icon: 'package',
  },
  // Campaign (C####) - Sky Blue
  campaign: {
    bg: 'bg-[#0284C7]/10',
    text: 'text-[#0284C7]',
    border: 'border-[#0284C7]/20',
    icon: 'flag',
  },
  // Mitigation (M####) - Emerald
  mitigation: {
    bg: 'bg-emerald-500/10',
    text: 'text-emerald-600 dark:text-emerald-400',
    border: 'border-emerald-500/20',
    icon: 'shield',
  },
  // Data Source (DS####) - Sage Green
  dataSource: {
    bg: 'bg-[#4D7C6F]/10',
    text: 'text-[#4D7C6F]',
    border: 'border-[#4D7C6F]/20',
    icon: 'database',
  },
} as const;

export type MitreChipType = keyof typeof mitreChipColors;

// =============================================================================
// ATTACK TYPE COLORS
// =============================================================================
// IMPORTANT: Attack types should be NEUTRAL - they describe the type of attack,
// not severity. Using different colors would imply one type is "worse" than another.
// All attack types use the same neutral purple/violet color for consistency.

const neutralAttackType = {
  bg: 'bg-purple-500/10',
  text: 'text-purple-600 dark:text-purple-400',
  border: 'border-purple-500/20',
};

export const attackTypeColors = {
  APT: neutralAttackType,
  Ransomware: neutralAttackType,
  Malware: neutralAttackType,
  Phishing: neutralAttackType,
  'Supply Chain': neutralAttackType,
  Vulnerability: neutralAttackType,
  'Financial Crime': neutralAttackType,
  'Zero Day': neutralAttackType,
  Espionage: neutralAttackType,
  Botnet: neutralAttackType,
  DDoS: neutralAttackType,
  Unknown: {
    bg: 'bg-surface-container-highest',
    text: 'text-on-surface-variant',
    border: 'border-outline-variant/20',
  },
} as const;

export type AttackTypeKey = keyof typeof attackTypeColors;

// =============================================================================
// RULE TYPE COLORS
// =============================================================================

export const ruleTypeColors = {
  kql: {
    bg: 'bg-sky-500/20',
    text: 'text-sky-600 dark:text-sky-400',
  },
  sigma: {
    bg: 'bg-amber-500/20',
    text: 'text-amber-600 dark:text-amber-400',
  },
  yara: {
    bg: 'bg-violet-500/20',
    text: 'text-violet-600 dark:text-violet-400',
  },
  spl: {
    bg: 'bg-emerald-500/20',
    text: 'text-emerald-600 dark:text-emerald-400',
  },
  snort: {
    bg: 'bg-rose-500/20',
    text: 'text-rose-600 dark:text-rose-400',
  },
  github_reference: {
    bg: 'bg-purple-500/20',
    text: 'text-purple-600 dark:text-purple-400',
  },
  yaml: {
    bg: 'bg-cyan-500/20',
    text: 'text-cyan-600 dark:text-cyan-400',
  },
  json: {
    bg: 'bg-blue-500/20',
    text: 'text-blue-600 dark:text-blue-400',
  },
  other: {
    bg: 'bg-zinc-500/20',
    text: 'text-zinc-600 dark:text-zinc-400',
  },
} as const;

export type RuleTypeKey = keyof typeof ruleTypeColors;

// =============================================================================
// STATUS COLORS
// =============================================================================

export const statusColors = {
  active: {
    bg: 'bg-[#4D7C6F]/15',
    text: 'text-[#4D7C6F]',
    border: 'border-[#4D7C6F]/20',
    dot: 'bg-[#4D7C6F]',
  },
  pending: {
    bg: 'bg-yellow-500/15',
    text: 'text-yellow-600 dark:text-yellow-400',
    border: 'border-yellow-500/20',
    dot: 'bg-yellow-500',
  },
  error: {
    bg: 'bg-[#A63D40]/15',
    text: 'text-[#A63D40]',
    border: 'border-[#A63D40]/20',
    dot: 'bg-[#A63D40]',
  },
  disabled: {
    bg: 'bg-surface-container-highest',
    text: 'text-on-surface-variant/50',
    border: 'border-outline-variant/10',
    dot: 'bg-on-surface-variant/30',
  },
} as const;

// =============================================================================
// TTP METADATA BADGES (SUB, EXPLICIT, CONTEXTUAL, etc.)
// =============================================================================
// These are metadata labels, NOT severity indicators. Use neutral subtle colors.

export const ttpMetaBadgeColors = {
  // Sub-technique indicator - subtle neutral
  sub: {
    bg: 'bg-surface-container-highest',
    text: 'text-on-surface-variant',
    border: 'border-outline-variant/30',
  },
  // Source type badges - subtle neutral (NOT green for explicit!)
  explicit: {
    bg: 'bg-surface-container-highest',
    text: 'text-on-surface-variant',
    border: 'border-outline-variant/30',
  },
  contextual: {
    bg: 'bg-surface-container-highest',
    text: 'text-on-surface-variant/70',
    border: 'border-outline-variant/20',
  },
  // Confidence levels - subtle, don't use severity colors
  highConfidence: {
    bg: 'bg-surface-container-highest',
    text: 'text-on-surface-variant',
    border: 'border-outline-variant/30',
  },
  mediumConfidence: {
    bg: 'bg-surface-container-highest',
    text: 'text-on-surface-variant/70',
    border: 'border-outline-variant/20',
  },
  lowConfidence: {
    bg: 'bg-surface-container-highest',
    text: 'text-on-surface-variant/50',
    border: 'border-outline-variant/10',
  },
} as const;

// =============================================================================
// TTP COVERAGE COLORS
// =============================================================================
// Only TWO states: Covered (has detection) vs Gap (needs detection)

export const ttpCoverageColors = {
  // Covered - Sage Green (positive, has protection)
  covered: {
    bg: 'bg-[#4D7C6F]/10',
    text: 'text-[#4D7C6F]',
    border: 'border-[#4D7C6F]/20',
    cardBg: 'bg-[#4D7C6F]/5',
    cardBorder: 'border-[#4D7C6F]/20',
  },
  // Partial - Amber (a rule checks some, not all, of what the report describes)
  partial: {
    bg: 'bg-ext-amber/10',
    text: 'text-ext-amber',
    border: 'border-ext-amber/30',
    cardBg: 'bg-surface-container',
    cardBorder: 'border-ext-amber/30',
  },
  // Gap - Neutral (not alarming red, just indicates work needed)
  gap: {
    bg: 'bg-surface-container',
    text: 'text-on-surface-variant',
    border: 'border-outline-variant/30',
    cardBg: 'bg-surface-container',
    cardBorder: 'border-outline-variant/30',
  },
} as const;

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Get threat level color config with fallback
 */
export function getThreatLevelConfig(level?: string) {
  if (level && level in threatLevelColors) {
    return threatLevelColors[level as ThreatLevelKey];
  }
  return threatLevelColors.Informational;
}

/**
 * Get attack type color config with fallback
 */
export function getAttackTypeConfig(type?: string) {
  if (type && type in attackTypeColors) {
    return attackTypeColors[type as AttackTypeKey];
  }
  return attackTypeColors.Unknown;
}

/**
 * Get rule type color config with fallback
 */
export function getRuleTypeConfig(type?: string) {
  if (type && type in ruleTypeColors) {
    return ruleTypeColors[type as RuleTypeKey];
  }
  return ruleTypeColors.other;
}

/**
 * Get MITRE chip type from ID prefix
 */
export function getMitreChipType(mitreId: string): MitreChipType {
  if (mitreId.startsWith('T')) return 'technique';
  if (mitreId.startsWith('TA')) return 'tactic';
  if (mitreId.startsWith('G')) return 'group';
  if (mitreId.startsWith('S')) return 'software';
  if (mitreId.startsWith('C')) return 'campaign';
  if (mitreId.startsWith('M')) return 'mitigation';
  if (mitreId.startsWith('DS')) return 'dataSource';
  return 'technique'; // fallback
}
