import type { FieldDefinition } from './types';

export const DETECTION_FIELDS: FieldDefinition[] = [
  // Identity / Dates
  { name: 'createdDate',        label: 'Created Date',        type: 'date',    groupable: true,  aggregatable: false, filterable: true },
  { name: 'updatedDate',        label: 'Updated Date',        type: 'date',    groupable: true,  aggregatable: false, filterable: true },

  // Basic Information
  { name: 'name',               label: 'Detection Name',      type: 'string',  groupable: false, aggregatable: false, filterable: true },
  { name: 'author',             label: 'Author',              type: 'string',  groupable: true,  aggregatable: false, filterable: true },
  { name: 'status',             label: 'Status',              type: 'string',  groupable: true,  aggregatable: false, filterable: true,  values: ['Draft', 'Development', 'Review', 'Testing', 'Production'] },
  { name: 'maturity',           label: 'Maturity',            type: 'string',  groupable: true,  aggregatable: false, filterable: true,  values: ['Proof of Concept', 'Baseline', 'Tuned', 'Stable'] },
  { name: 'detectionType',      label: 'Detection Type',      type: 'string',  groupable: true,  aggregatable: false, filterable: true },
  { name: 'severity',           label: 'Severity',            type: 'string',  groupable: true,  aggregatable: false, filterable: true,  values: ['Critical', 'High', 'Medium', 'Low', 'Informational'] },
  { name: 'confidence',         label: 'Confidence',          type: 'string',  groupable: true,  aggregatable: false, filterable: true,  values: ['High', 'Medium', 'Low'] },

  // Data Sources
  { name: 'logSource',          label: 'Log Source',           type: 'string',  groupable: true,  aggregatable: false, filterable: true },
  { name: 'logSources',         label: 'Log Sources',          type: 'array',   groupable: true,  aggregatable: false, filterable: true },
  { name: 'platforms',          label: 'Platform',             type: 'array',   groupable: true,  aggregatable: false, filterable: true },
  { name: 'queryLanguage',      label: 'Query Language',       type: 'string',  groupable: true,  aggregatable: false, filterable: true },

  // MITRE
  { name: 'mitreAttackIds',     label: 'MITRE Technique',      type: 'array',   groupable: true,  aggregatable: false, filterable: true },
  { name: 'mitreTactics',       label: 'MITRE Tactic',         type: 'array',   groupable: true,  aggregatable: false, filterable: true },

  // Validation & Quality
  { name: 'testedAndValidated', label: 'Validated',            type: 'boolean', groupable: true,  aggregatable: false, filterable: true },
  { name: 'qualityScore',       label: 'Quality Score',        type: 'number',  groupable: false, aggregatable: true,  filterable: true },

  // Metadata
  { name: 'tags',               label: 'Tags',                 type: 'array',   groupable: true,  aggregatable: false, filterable: true },
  { name: 'library_type',       label: 'Library',              type: 'string',  groupable: true,  aggregatable: false, filterable: true,  values: ['development', 'production'] },
  { name: 'source',             label: 'Source',               type: 'string',  groupable: true,  aggregatable: false, filterable: true },

  // Assignment
  { name: 'assigned_to',        label: 'Assigned To',          type: 'string',  groupable: true,  aggregatable: false, filterable: true },
  { name: 'review_status',      label: 'Review Status',        type: 'string',  groupable: true,  aggregatable: false, filterable: true },
];

/** Lookup a field definition by name */
export function getField(name: string): FieldDefinition | undefined {
  return DETECTION_FIELDS.find(f => f.name === name);
}

/** Get all fields that are groupable */
export function getGroupableFields(): FieldDefinition[] {
  return DETECTION_FIELDS.filter(f => f.groupable);
}

/** Get all fields that are aggregatable (number fields) */
export function getAggregatableFields(): FieldDefinition[] {
  return DETECTION_FIELDS.filter(f => f.aggregatable);
}

/** Get all fields usable with distinct_count (everything except dates) */
export function getDistinctableFields(): FieldDefinition[] {
  return DETECTION_FIELDS.filter(f => f.type !== 'date');
}

/** Get all fields that are filterable */
export function getFilterableFields(): FieldDefinition[] {
  return DETECTION_FIELDS.filter(f => f.filterable);
}
