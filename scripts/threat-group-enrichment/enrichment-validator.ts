/**
 * Enrichment Validator
 *
 * Pre-apply validation checks to prevent dangerous over-clustering of threat groups.
 * These checks are CRITICAL to ensure data integrity before applying enrichment.
 */

import {
  EnrichmentPreview,
  EnrichmentPreviewMatch,
  ValidationResult,
} from './types';

// =============================================================================
// KNOWN PROBLEM CLUSTERS
// These groups MUST remain separate - they are distinct entities that share aliases
// =============================================================================

interface KnownCluster {
  name: string;
  mitreIds: string[];
  description: string;
}

const KNOWN_PROBLEM_CLUSTERS: KnownCluster[] = [
  {
    name: 'Lazarus Complex',
    mitreIds: ['G0032', 'G0138', 'G0082'],
    description: 'Lazarus Group, Andariel, and APT38 are distinct North Korean groups with overlapping aliases',
  },
  {
    name: 'APT28/APT29',
    mitreIds: ['G0007', 'G0016'],
    description: 'APT28 (Fancy Bear) and APT29 (Cozy Bear) are DIFFERENT Russian groups often confused',
  },
  {
    name: 'APT41 Complex',
    mitreIds: ['G0096', 'G0044', 'G0001'],
    description: 'APT41, Winnti Group, and Axiom are related but distinct Chinese groups',
  },
  {
    name: 'Iranian Groups',
    mitreIds: ['G0059', 'G0064', 'G0130'],
    description: 'Magic Hound, APT33, and HAFNIUM/Ajax Security Team must remain separate',
  },
];

// =============================================================================
// VALIDATION FUNCTIONS
// =============================================================================

function findSharedMispActors(matches: EnrichmentPreviewMatch[]): string[] {
  const actorToGroups = new Map<string, string[]>();

  for (const match of matches) {
    for (const actor of match.mispActors) {
      const existing = actorToGroups.get(actor.uuid);
      if (existing) {
        existing.push(match.mitreId);
      } else {
        actorToGroups.set(actor.uuid, [match.mitreId]);
      }
    }
  }

  // Return UUIDs that appear in multiple groups
  const shared: string[] = [];
  for (const [uuid, groups] of actorToGroups) {
    if (groups.length > 1) {
      shared.push(uuid);
    }
  }

  return shared;
}

function validateKnownClusters(preview: EnrichmentPreview): {
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const cluster of KNOWN_PROBLEM_CLUSTERS) {
    // Get matches for this cluster's groups
    const clusterMatches = preview.matches.filter(m =>
      cluster.mitreIds.includes(m.mitreId)
    );

    if (clusterMatches.length < 2) continue; // Not enough groups matched to check

    // Check for shared MISP actors
    const sharedActors = findSharedMispActors(clusterMatches);

    if (sharedActors.length > 0) {
      errors.push(
        `CRITICAL: ${cluster.name} incorrectly merged! ` +
        `Groups ${cluster.mitreIds.join(', ')} share ${sharedActors.length} MISP actor(s). ` +
        `${cluster.description}`
      );
    }

    // Check for significant targeting data overlap (warning only)
    const originCountries = new Set<string>();
    for (const match of clusterMatches) {
      if (match.enrichment.originCountry) {
        originCountries.add(match.enrichment.originCountry);
      }
    }
    // This is expected for nation-state groups from the same country
    // so we don't warn about it
  }

  return { errors, warnings };
}

function validateOverMatching(preview: EnrichmentPreview): {
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const match of preview.matches) {
    // Warn if a group has too many MISP actors (possible over-matching)
    if (match.mispActors.length > 5) {
      warnings.push(
        `${match.mitreName} (${match.mitreId}) has ${match.mispActors.length} MISP actors matched - ` +
        `verify this is correct`
      );
    }

    // Error if a group has WAY too many (almost certainly wrong)
    if (match.mispActors.length > 10) {
      errors.push(
        `${match.mitreName} (${match.mitreId}) has ${match.mispActors.length} MISP actors - ` +
        `this is almost certainly over-matching`
      );
    }
  }

  return { errors, warnings };
}

function validateConfidenceThresholds(preview: EnrichmentPreview): {
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  const lowConfidenceMatches = preview.matches.filter(m => m.confidence < 70);

  if (lowConfidenceMatches.length > 0) {
    warnings.push(
      `${lowConfidenceMatches.length} matches have confidence < 70% - review manually: ` +
      lowConfidenceMatches.map(m => `${m.mitreName} (${m.confidence}%)`).join(', ')
    );
  }

  return { errors, warnings };
}

function validateCrossContamination(preview: EnrichmentPreview): {
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Build a map of MISP UUID -> which MITRE groups it's matched to
  const mispToMitreGroups = new Map<string, { mitreId: string; mitreName: string }[]>();

  for (const match of preview.matches) {
    for (const actor of match.mispActors) {
      const existing = mispToMitreGroups.get(actor.uuid);
      const entry = { mitreId: match.mitreId, mitreName: match.mitreName };

      if (existing) {
        existing.push(entry);
      } else {
        mispToMitreGroups.set(actor.uuid, [entry]);
      }
    }
  }

  // Check for MISP actors matched to multiple MITRE groups
  for (const [uuid, groups] of mispToMitreGroups) {
    if (groups.length > 1) {
      const groupList = groups.map(g => `${g.mitreName} (${g.mitreId})`).join(', ');
      errors.push(
        `MISP actor ${uuid} is matched to multiple MITRE groups: ${groupList}. ` +
        `This indicates the matching algorithm failed to maintain group separation.`
      );
    }
  }

  return { errors, warnings };
}

function validateSpecificGroups(preview: EnrichmentPreview): {
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Specific validations for well-known groups

  // Check APT28 and APT29 specifically
  const apt28 = preview.matches.find(m => m.mitreId === 'G0007');
  const apt29 = preview.matches.find(m => m.mitreId === 'G0016');

  if (apt28 && apt29) {
    // They should have DIFFERENT MISP actors
    const apt28Uuids = new Set(apt28.mispActors.map(a => a.uuid));
    const sharedWithApt29 = apt29.mispActors.filter(a => apt28Uuids.has(a.uuid));

    if (sharedWithApt29.length > 0) {
      errors.push(
        `APT28 (G0007) and APT29 (G0016) share ${sharedWithApt29.length} MISP actor(s). ` +
        `These are DIFFERENT Russian groups that must not share attribution data.`
      );
    }

    // They should have different origin (both Russia, so this is OK)
    // But their target profiles might differ
  }

  // Check Lazarus cluster
  const lazarusGroup = preview.matches.find(m => m.mitreId === 'G0032');
  const andariel = preview.matches.find(m => m.mitreId === 'G0138');
  const apt38 = preview.matches.find(m => m.mitreId === 'G0082');

  const lazarusCluster = [lazarusGroup, andariel, apt38].filter(Boolean) as EnrichmentPreviewMatch[];

  if (lazarusCluster.length >= 2) {
    const sharedActors = findSharedMispActors(lazarusCluster);
    if (sharedActors.length > 0) {
      errors.push(
        `Lazarus cluster groups share ${sharedActors.length} MISP actor(s). ` +
        `Lazarus Group (G0032), Andariel (G0138), and APT38 (G0082) must remain separate.`
      );
    }
  }

  return { errors, warnings };
}

// =============================================================================
// MAIN VALIDATION FUNCTION
// =============================================================================

export function validateEnrichmentPreview(preview: EnrichmentPreview): ValidationResult {
  const allErrors: string[] = [];
  const allWarnings: string[] = [];

  // Run all validation checks
  const validations = [
    validateKnownClusters(preview),
    validateOverMatching(preview),
    validateConfidenceThresholds(preview),
    validateCrossContamination(preview),
    validateSpecificGroups(preview),
  ];

  for (const result of validations) {
    allErrors.push(...result.errors);
    allWarnings.push(...result.warnings);
  }

  // Add summary warnings
  if (preview.summary.matchedGroups === 0) {
    allErrors.push('No MITRE groups were matched - this indicates a problem with the source data');
  }

  if (preview.ambiguous.length > 10) {
    allWarnings.push(
      `${preview.ambiguous.length} MISP actors were rejected as ambiguous - ` +
      `this may indicate alias pollution in the data sources`
    );
  }

  const matchRate = (preview.summary.matchedGroups / preview.summary.totalMitreGroups) * 100;
  if (matchRate < 50) {
    allWarnings.push(
      `Only ${matchRate.toFixed(1)}% of MITRE groups were matched - ` +
      `expected ~86% based on data analysis`
    );
  }

  return {
    valid: allErrors.length === 0,
    errors: allErrors,
    warnings: allWarnings,
  };
}

// =============================================================================
// DETAILED VALIDATION REPORT
// =============================================================================

export interface ValidationReport {
  valid: boolean;
  timestamp: string;
  summary: {
    totalChecks: number;
    passed: number;
    failed: number;
    warnings: number;
  };
  checks: Array<{
    name: string;
    status: 'passed' | 'failed' | 'warning';
    message: string;
  }>;
}

export function generateValidationReport(preview: EnrichmentPreview): ValidationReport {
  const checks: ValidationReport['checks'] = [];

  // Check 1: Known problem clusters
  const clusterResult = validateKnownClusters(preview);
  if (clusterResult.errors.length > 0) {
    for (const error of clusterResult.errors) {
      checks.push({ name: 'Known Cluster Separation', status: 'failed', message: error });
    }
  } else {
    checks.push({
      name: 'Known Cluster Separation',
      status: 'passed',
      message: 'All known problem clusters (Lazarus, APT28/29, etc.) are properly separated',
    });
  }

  // Check 2: Over-matching
  const overMatchResult = validateOverMatching(preview);
  if (overMatchResult.errors.length > 0) {
    for (const error of overMatchResult.errors) {
      checks.push({ name: 'Over-matching Prevention', status: 'failed', message: error });
    }
  } else if (overMatchResult.warnings.length > 0) {
    for (const warning of overMatchResult.warnings) {
      checks.push({ name: 'Over-matching Prevention', status: 'warning', message: warning });
    }
  } else {
    checks.push({
      name: 'Over-matching Prevention',
      status: 'passed',
      message: 'No groups have excessive MISP actor matches',
    });
  }

  // Check 3: Cross-contamination
  const crossResult = validateCrossContamination(preview);
  if (crossResult.errors.length > 0) {
    for (const error of crossResult.errors) {
      checks.push({ name: 'Cross-contamination Check', status: 'failed', message: error });
    }
  } else {
    checks.push({
      name: 'Cross-contamination Check',
      status: 'passed',
      message: 'No MISP actors are matched to multiple MITRE groups',
    });
  }

  // Check 4: Confidence thresholds
  const confResult = validateConfidenceThresholds(preview);
  if (confResult.warnings.length > 0) {
    for (const warning of confResult.warnings) {
      checks.push({ name: 'Confidence Threshold', status: 'warning', message: warning });
    }
  } else {
    checks.push({
      name: 'Confidence Threshold',
      status: 'passed',
      message: 'All matches have confidence >= 70%',
    });
  }

  // Check 5: Specific groups (APT28/29, Lazarus)
  const specificResult = validateSpecificGroups(preview);
  if (specificResult.errors.length > 0) {
    for (const error of specificResult.errors) {
      checks.push({ name: 'Specific Group Validation', status: 'failed', message: error });
    }
  } else {
    checks.push({
      name: 'Specific Group Validation',
      status: 'passed',
      message: 'APT28/APT29 and Lazarus cluster groups are properly separated',
    });
  }

  // Calculate summary
  const passed = checks.filter(c => c.status === 'passed').length;
  const failed = checks.filter(c => c.status === 'failed').length;
  const warnings = checks.filter(c => c.status === 'warning').length;

  return {
    valid: failed === 0,
    timestamp: new Date().toISOString(),
    summary: {
      totalChecks: checks.length,
      passed,
      failed,
      warnings,
    },
    checks,
  };
}
