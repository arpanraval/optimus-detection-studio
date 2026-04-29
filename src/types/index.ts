// Domain modules (split from monolithic types.ts)
export * from './enums';
export * from './rbac';
export * from './detection';
export * from './user';
export * from './workflow';
export * from './integration';
export * from './environment';

// NOTE: optimus.ts, mitre-stix.ts, attack-rule-map.ts, threatIntel.ts
// are NOT re-exported here to avoid name collisions (e.g., TacticCoverage).
// Import them directly: import { ... } from '@/types/optimus'

export * from './threatResearch';
