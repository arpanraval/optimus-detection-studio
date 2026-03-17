// ============================================
// ENUMS
// ============================================

export enum Status {
  Backlog = 'Backlog',
  Draft = 'Draft',
  Development = 'Development',
  Review = 'Review',
  Testing = 'Testing',
  Production = 'Production',
  Deprecated = 'Deprecated',
  Archived = 'Archived'
}

export enum Maturity {
  Experimental = 'Experimental',
  Beta = 'Beta',
  Production = 'Production',
  Stable = 'Stable'
}

export enum DetectionType {
  Detection = 'Detection',
  Hunting = 'Threat Hunting',
  Correlation = 'Correlation',
  Anomaly = 'Anomaly'
}

export enum Severity {
  Critical = 'Critical',
  High = 'High',
  Medium = 'Medium',
  Low = 'Low',
  Informational = 'Informational'
}

export enum Confidence {
  High = 'High',
  Medium = 'Medium',
  Low = 'Low'
}
