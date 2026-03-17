// Impact Score Components
export { 
  ImpactScoreBadge, 
  ImpactScorePill, 
  ImpactScoreBar 
} from './ImpactScoreBadge';

// Stats Components
export { 
  StatCard, 
  ImpactStatsRow, 
  DefenseDepthIndicator 
} from './ImpactStatsRow';

// Group Tables
export { 
  DisruptedGroupsTable, 
  DetectedGroupsTable, 
  TawBadge 
} from './DisruptedGroupsTable';

// Detail Panels
export { 
  MitigationImpactPanel, 
  MitigationImpactCompact 
} from './MitigationImpactPanel';

export { 
  StrategyImpactPanel, 
  StrategyImpactCard, 
  StrategyImpactMini 
} from './StrategyImpactPanel';

// Dashboard
export { 
  DefensivePostureDashboard 
} from './DefensivePostureDashboard';

// Philosophy Selector
export {
  PhilosophySelector,
  PhilosophyBadge,
  type DetectionPhilosophy
} from './PhilosophySelector';

// Note: ImpactRankedMitigations and ImpactRankedStrategies were removed
// as this functionality is now integrated into MitigationsLibrary and
// DetectionStrategiesLibrary with "Impact Score" sorting option.
