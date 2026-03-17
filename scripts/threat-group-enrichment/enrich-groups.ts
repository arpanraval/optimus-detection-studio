#!/usr/bin/env npx tsx
/**
 * Threat Group Targeting Enrichment Script
 *
 * Enriches MITRE threat groups with targeting intelligence from MISP Threat Actor Galaxy.
 *
 * Usage:
 *   npx tsx scripts/threat-group-enrichment/enrich-groups.ts --dry-run
 *   npx tsx scripts/threat-group-enrichment/enrich-groups.ts --apply --preview-hash <sha256>
 *   npx tsx scripts/threat-group-enrichment/enrich-groups.ts --rollback <audit-id>
 *
 * Options:
 *   --dry-run       Generate preview without applying changes
 *   --apply         Apply enrichment (requires --preview-hash)
 *   --preview-hash  SHA256 hash of the preview to apply (ensures reviewed version)
 *   --rollback      Rollback a previous enrichment using audit record ID
 *   --output        Output directory for preview files (default: ./enrichment-output)
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { fileURLToPath } from 'url';
// @ts-ignore - dotenv types not installed for script
import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

// ES Module compatibility
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from .env.local
const projectRoot = path.resolve(__dirname, '../..');
config({ path: path.join(projectRoot, '.env.local') });

import {
  EnrichmentPreview,
  EnrichmentPreviewMatch,
  MispThreatActorGalaxy,
  MicrosoftThreatActor,
  TargetingIntel,
  AmbiguousMatch,
} from './types';

import {
  parseMitreIntrusionSets,
  parseMispThreatActors,
  buildMicrosoftIndex,
  performConservativeMatching,
  extractTargetingIntel,
  buildEnrichedGroups,
} from './mitre-misp-matcher';

import {
  validateEnrichmentPreview,
  generateValidationReport,
  ValidationReport,
} from './enrichment-validator';

// =============================================================================
// CONFIGURATION
// =============================================================================

const CONFIG = {
  dataDir: path.resolve(__dirname, '../../Vendor Detection Content'),
  outputDir: path.resolve(__dirname, './enrichment-output'),
  attackEnterpriseFile: 'attack-enterprise.json',
  mispThreatActorFile: 'misp-threat-actor.json',
  microsoftMappingFile: 'MicrosoftMapping.json',
  enrichmentVersion: '1.0.0',
};

// =============================================================================
// DATA LOADING
// =============================================================================

function loadAttackEnterprise(): { objects: any[] } {
  const filePath = path.join(CONFIG.dataDir, CONFIG.attackEnterpriseFile);
  console.log(`Loading MITRE ATT&CK data from: ${filePath}`);

  const content = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(content);
}

function loadMispThreatActors(): MispThreatActorGalaxy {
  const filePath = path.join(CONFIG.dataDir, CONFIG.mispThreatActorFile);
  console.log(`Loading MISP Threat Actor data from: ${filePath}`);

  const content = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(content);
}

function loadMicrosoftMapping(): MicrosoftThreatActor[] {
  const filePath = path.join(CONFIG.dataDir, CONFIG.microsoftMappingFile);
  console.log(`Loading Microsoft mapping data from: ${filePath}`);

  const content = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(content);
}

// =============================================================================
// PREVIEW GENERATION
// =============================================================================

function generatePreview(): EnrichmentPreview {
  console.log('\n=== GENERATING ENRICHMENT PREVIEW ===\n');

  // Load data sources
  const attackData = loadAttackEnterprise();
  const mispGalaxy = loadMispThreatActors();
  const microsoftActors = loadMicrosoftMapping();

  // Parse data
  const mitreGroups = parseMitreIntrusionSets(attackData);
  const mispActors = parseMispThreatActors(mispGalaxy);
  const msIndex = buildMicrosoftIndex(microsoftActors);

  console.log(`Parsed ${mitreGroups.length} MITRE intrusion sets`);
  console.log(`Parsed ${mispActors.length} MISP threat actors`);
  console.log(`Parsed ${microsoftActors.length} Microsoft threat actors`);

  // Filter to non-deprecated, non-revoked groups
  const activeGroups = mitreGroups.filter(g => !g.deprecated && !g.revoked);
  console.log(`Active MITRE groups (not deprecated/revoked): ${activeGroups.length}`);

  // Perform conservative matching
  console.log('\nPerforming conservative matching...');
  const matchResult = performConservativeMatching(activeGroups, mispActors, msIndex);

  console.log(`Matched ${matchResult.matches.size} groups`);
  console.log(`Ambiguous matches (rejected): ${matchResult.ambiguous.length}`);
  console.log(`Unmatched groups: ${matchResult.unmatched.length}`);

  // Build enriched groups
  const mispActorMap = new Map(mispActors.map(a => [a.uuid, a]));

  // Build preview matches
  const previewMatches: EnrichmentPreviewMatch[] = [];
  let groupsWithTargeting = 0;

  for (const [mitreId, match] of matchResult.matches) {
    // Get actual MISP actors
    const matchedActors = match.matchedMispActors
      .map(m => mispActorMap.get(m.uuid))
      .filter(Boolean) as any[];

    // Extract targeting intel
    const targetingIntel = matchedActors.length > 0
      ? extractTargetingIntel(matchedActors, msIndex, match.matchType, match.confidence)
      : null;

    const hasTargetingData =
      targetingIntel &&
      (targetingIntel.origin_country || targetingIntel.target_countries.length > 0);

    if (hasTargetingData) {
      groupsWithTargeting++;
    }

    const warnings: string[] = [];
    if (matchedActors.length > 5) {
      warnings.push(`${matchedActors.length} MISP actors matched - verify correctness`);
    }
    if (targetingIntel && !hasTargetingData) {
      warnings.push('No targeting data available from matched MISP actors');
    }

    previewMatches.push({
      mitreId: match.mitreId,
      mitreName: match.mitreName,
      mitreStixId: match.mitreStixId,
      matchType: match.matchType,
      confidence: match.confidence,
      mispActors: match.matchedMispActors,
      enrichment: {
        originCountry: targetingIntel?.origin_country || null,
        originCountryCode: targetingIntel?.origin_country_code || null,
        targetCountries: targetingIntel?.target_countries || [],
        targetSectors: targetingIntel?.target_sectors || [],
        activityType: targetingIntel?.activity_type || null,
        vendorNames: targetingIntel?.vendor_names,
      },
      warnings,
    });
  }

  // Build preview object
  const preview: EnrichmentPreview = {
    timestamp: new Date().toISOString(),
    version: CONFIG.enrichmentVersion,
    previewHash: '', // Will be set below

    summary: {
      totalMitreGroups: activeGroups.length,
      totalMispActors: mispActors.length,
      matchedGroups: matchResult.matches.size,
      groupsWithTargeting,
      unmatchedGroups: matchResult.unmatched.length,
      rejectedAmbiguous: matchResult.ambiguous.length,
    },

    matches: previewMatches,
    ambiguous: matchResult.ambiguous,
    unmatchedMitre: matchResult.unmatched,
  };

  // Calculate hash of preview content (for verification)
  const previewContent = JSON.stringify({
    matches: preview.matches,
    ambiguous: preview.ambiguous,
    unmatchedMitre: preview.unmatchedMitre,
  });
  preview.previewHash = crypto.createHash('sha256').update(previewContent).digest('hex');

  return preview;
}

// =============================================================================
// PREVIEW OUTPUT
// =============================================================================

function writePreviewFiles(preview: EnrichmentPreview, outputDir: string): void {
  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Write full preview
  const previewPath = path.join(outputDir, 'enrichment-preview.json');
  fs.writeFileSync(previewPath, JSON.stringify(preview, null, 2));
  console.log(`\nWrote preview to: ${previewPath}`);

  // Write validation report
  const validationReport = generateValidationReport(preview);
  const validationPath = path.join(outputDir, 'validation-report.json');
  fs.writeFileSync(validationPath, JSON.stringify(validationReport, null, 2));
  console.log(`Wrote validation report to: ${validationPath}`);

  // Write human-readable summary
  const summaryPath = path.join(outputDir, 'enrichment-summary.txt');
  const summary = generateHumanReadableSummary(preview, validationReport);
  fs.writeFileSync(summaryPath, summary);
  console.log(`Wrote summary to: ${summaryPath}`);
}

function generateHumanReadableSummary(
  preview: EnrichmentPreview,
  validation: ValidationReport
): string {
  const lines: string[] = [
    '='.repeat(80),
    'THREAT GROUP TARGETING ENRICHMENT PREVIEW',
    '='.repeat(80),
    '',
    `Generated: ${preview.timestamp}`,
    `Version: ${preview.version}`,
    `Preview Hash: ${preview.previewHash}`,
    '',
    '-'.repeat(80),
    'SUMMARY',
    '-'.repeat(80),
    '',
    `Total MITRE Groups: ${preview.summary.totalMitreGroups}`,
    `Total MISP Actors: ${preview.summary.totalMispActors}`,
    `Matched Groups: ${preview.summary.matchedGroups} (${((preview.summary.matchedGroups / preview.summary.totalMitreGroups) * 100).toFixed(1)}%)`,
    `Groups with Targeting Data: ${preview.summary.groupsWithTargeting} (${((preview.summary.groupsWithTargeting / preview.summary.totalMitreGroups) * 100).toFixed(1)}%)`,
    `Unmatched Groups: ${preview.summary.unmatchedGroups}`,
    `Rejected (Ambiguous): ${preview.summary.rejectedAmbiguous}`,
    '',
    '-'.repeat(80),
    'VALIDATION RESULT',
    '-'.repeat(80),
    '',
    `Status: ${validation.valid ? 'PASSED' : 'FAILED'}`,
    `Checks: ${validation.summary.passed} passed, ${validation.summary.failed} failed, ${validation.summary.warnings} warnings`,
    '',
  ];

  // Add validation check details
  for (const check of validation.checks) {
    const icon = check.status === 'passed' ? '[OK]' : check.status === 'failed' ? '[FAIL]' : '[WARN]';
    lines.push(`${icon} ${check.name}`);
    lines.push(`    ${check.message}`);
  }

  lines.push('');
  lines.push('-'.repeat(80));
  lines.push('MATCH BREAKDOWN BY TYPE');
  lines.push('-'.repeat(80));
  lines.push('');

  // Count by match type
  const byType = new Map<string, number>();
  for (const match of preview.matches) {
    byType.set(match.matchType, (byType.get(match.matchType) || 0) + 1);
  }

  for (const [type, count] of byType) {
    lines.push(`${type}: ${count}`);
  }

  lines.push('');
  lines.push('-'.repeat(80));
  lines.push('SAMPLE MATCHES (First 20)');
  lines.push('-'.repeat(80));
  lines.push('');

  for (const match of preview.matches.slice(0, 20)) {
    lines.push(`${match.mitreId} ${match.mitreName}`);
    lines.push(`  Match: ${match.matchType} (${match.confidence}% confidence)`);
    lines.push(`  Origin: ${match.enrichment.originCountry || 'Unknown'} (${match.enrichment.originCountryCode || '??'})`);
    lines.push(`  Targets: ${match.enrichment.targetCountries.slice(0, 5).join(', ') || 'None'}`);
    lines.push(`  Sectors: ${match.enrichment.targetSectors.slice(0, 3).join(', ') || 'None'}`);
    if (match.warnings.length > 0) {
      lines.push(`  Warnings: ${match.warnings.join('; ')}`);
    }
    lines.push('');
  }

  if (preview.ambiguous.length > 0) {
    lines.push('-'.repeat(80));
    lines.push('AMBIGUOUS MATCHES (Rejected)');
    lines.push('-'.repeat(80));
    lines.push('');

    for (const amb of preview.ambiguous.slice(0, 10)) {
      lines.push(`${amb.mispValue}`);
      lines.push(`  Reason: ${amb.reason}`);
      lines.push(`  Candidates: ${amb.candidateGroups.join(', ')}`);
      lines.push('');
    }
  }

  if (preview.unmatchedMitre.length > 0) {
    lines.push('-'.repeat(80));
    lines.push('UNMATCHED MITRE GROUPS');
    lines.push('-'.repeat(80));
    lines.push('');
    lines.push(preview.unmatchedMitre.join(', '));
  }

  lines.push('');
  lines.push('='.repeat(80));
  lines.push(`To apply this enrichment, run:`);
  lines.push(`  npx tsx scripts/threat-group-enrichment/enrich-groups.ts --apply --preview-hash ${preview.previewHash}`);
  lines.push('='.repeat(80));

  return lines.join('\n');
}

// =============================================================================
// DATABASE APPLICATION
// =============================================================================

async function applyEnrichment(previewHash: string, outputDir: string): Promise<void> {
  console.log('\n=== APPLYING ENRICHMENT ===\n');

  // Load the preview file
  const previewPath = path.join(outputDir, 'enrichment-preview.json');
  if (!fs.existsSync(previewPath)) {
    throw new Error(`Preview file not found: ${previewPath}. Run with --dry-run first.`);
  }

  const preview: EnrichmentPreview = JSON.parse(fs.readFileSync(previewPath, 'utf-8'));

  // Verify hash
  if (preview.previewHash !== previewHash) {
    throw new Error(
      `Preview hash mismatch!\n` +
      `Expected: ${previewHash}\n` +
      `Actual:   ${preview.previewHash}\n` +
      `The preview may have been regenerated. Run --dry-run again and use the new hash.`
    );
  }

  // Validate
  const validation = validateEnrichmentPreview(preview);
  if (!validation.valid) {
    console.error('Validation FAILED:');
    for (const error of validation.errors) {
      console.error(`  - ${error}`);
    }
    throw new Error('Cannot apply enrichment due to validation failures');
  }

  if (validation.warnings.length > 0) {
    console.warn('Validation warnings:');
    for (const warning of validation.warnings) {
      console.warn(`  - ${warning}`);
    }
  }

  // Initialize Supabase client
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error(
      'Missing Supabase credentials. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables.'
    );
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  console.log('Connected to Supabase');

  // Collect rollback data
  const rollbackData: Record<string, TargetingIntel | null> = {};
  const affectedGroupIds: string[] = [];

  // Get current targeting_intel values for affected groups
  const stixIds = preview.matches.map(m => m.mitreStixId);

  console.log(`Fetching current data for ${stixIds.length} groups...`);

  const { data: currentGroups, error: fetchError } = await supabase
    .from('mitre_objects')
    .select('stix_id, data')
    .in('stix_id', stixIds);

  if (fetchError) {
    throw new Error(`Failed to fetch current groups: ${fetchError.message}`);
  }

  for (const group of currentGroups || []) {
    rollbackData[group.stix_id] = group.data?.targeting_intel || null;
    affectedGroupIds.push(group.stix_id);
  }

  // Create audit record
  console.log('Creating audit record...');

  const { data: auditRecord, error: auditError } = await supabase
    .from('enrichment_audit')
    .insert({
      enrichment_type: 'misp_targeting_intel',
      preview_hash: previewHash,
      affected_group_ids: affectedGroupIds,
      rollback_data: rollbackData,
      status: 'applied',
      notes: `Applied ${preview.matches.length} group enrichments from MISP Threat Actor Galaxy`,
    })
    .select()
    .single();

  if (auditError) {
    throw new Error(`Failed to create audit record: ${auditError.message}`);
  }

  console.log(`Created audit record: ${auditRecord.id}`);

  // Apply enrichment to each group
  console.log(`Applying enrichment to ${preview.matches.length} groups...`);

  let successCount = 0;
  let errorCount = 0;

  for (const match of preview.matches) {
    // Build targeting_intel object
    const targetingIntel: TargetingIntel = {
      data_source: 'misp_threat_actor_galaxy',
      enriched_at: new Date().toISOString(),
      enrichment_version: CONFIG.enrichmentVersion,
      match_type: match.matchType,
      match_confidence: match.confidence,
      matched_misp_actor_ids: match.mispActors.map(a => a.uuid),
      origin_country: match.enrichment.originCountry,
      origin_country_code: match.enrichment.originCountryCode,
      target_countries: match.enrichment.targetCountries,
      target_sectors: match.enrichment.targetSectors,
      activity_type: match.enrichment.activityType,
      vendor_names: match.enrichment.vendorNames,
    };

    // Update the group's data JSONB with targeting_intel key
    const { error: updateError } = await supabase.rpc('update_targeting_intel', {
      p_stix_id: match.mitreStixId,
      p_targeting_intel: targetingIntel,
    });

    if (updateError) {
      console.error(`Failed to update ${match.mitreId}: ${updateError.message}`);
      errorCount++;
    } else {
      successCount++;
    }
  }

  console.log(`\nEnrichment complete:`);
  console.log(`  Successful: ${successCount}`);
  console.log(`  Errors: ${errorCount}`);
  console.log(`  Audit ID: ${auditRecord.id}`);

  if (errorCount > 0) {
    console.warn(`\nSome updates failed. Use --rollback ${auditRecord.id} to revert all changes.`);
  }
}

// =============================================================================
// ROLLBACK
// =============================================================================

async function rollbackEnrichment(auditId: string): Promise<void> {
  console.log(`\n=== ROLLING BACK ENRICHMENT: ${auditId} ===\n`);

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error(
      'Missing Supabase credentials. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables.'
    );
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Fetch audit record
  const { data: audit, error: fetchError } = await supabase
    .from('enrichment_audit')
    .select('*')
    .eq('id', auditId)
    .single();

  if (fetchError || !audit) {
    throw new Error(`Audit record not found: ${auditId}`);
  }

  if (audit.status === 'rolled_back') {
    throw new Error('This enrichment has already been rolled back');
  }

  console.log(`Rolling back ${Object.keys(audit.rollback_data).length} groups...`);

  let successCount = 0;
  let errorCount = 0;

  for (const [stixId, previousTargeting] of Object.entries(audit.rollback_data)) {
    if (previousTargeting === null) {
      // Remove targeting_intel entirely
      const { error } = await supabase.rpc('remove_targeting_intel', {
        p_stix_id: stixId,
      });

      if (error) {
        console.error(`Failed to remove targeting_intel for ${stixId}: ${error.message}`);
        errorCount++;
      } else {
        successCount++;
      }
    } else {
      // Restore previous value
      const { error } = await supabase.rpc('update_targeting_intel', {
        p_stix_id: stixId,
        p_targeting_intel: previousTargeting,
      });

      if (error) {
        console.error(`Failed to restore ${stixId}: ${error.message}`);
        errorCount++;
      } else {
        successCount++;
      }
    }
  }

  // Mark audit as rolled back
  const { error: updateError } = await supabase
    .from('enrichment_audit')
    .update({
      status: 'rolled_back',
      rolled_back_at: new Date().toISOString(),
    })
    .eq('id', auditId);

  if (updateError) {
    console.error(`Failed to update audit status: ${updateError.message}`);
  }

  console.log(`\nRollback complete:`);
  console.log(`  Restored: ${successCount}`);
  console.log(`  Errors: ${errorCount}`);
}

// =============================================================================
// MAIN ENTRY POINT
// =============================================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  const dryRun = args.includes('--dry-run');
  const apply = args.includes('--apply');
  const rollback = args.includes('--rollback');

  const previewHashIndex = args.indexOf('--preview-hash');
  const previewHash = previewHashIndex >= 0 ? args[previewHashIndex + 1] : null;

  const rollbackIndex = args.indexOf('--rollback');
  const rollbackId = rollbackIndex >= 0 ? args[rollbackIndex + 1] : null;

  const outputIndex = args.indexOf('--output');
  const outputDir = outputIndex >= 0 ? args[outputIndex + 1] : CONFIG.outputDir;

  if (dryRun) {
    // Generate preview
    const preview = generatePreview();
    writePreviewFiles(preview, outputDir);

    // Print validation result
    const validation = validateEnrichmentPreview(preview);
    console.log('\n=== VALIDATION RESULT ===\n');
    console.log(`Status: ${validation.valid ? 'PASSED' : 'FAILED'}`);

    if (validation.errors.length > 0) {
      console.log('\nErrors:');
      for (const error of validation.errors) {
        console.log(`  - ${error}`);
      }
    }

    if (validation.warnings.length > 0) {
      console.log('\nWarnings:');
      for (const warning of validation.warnings) {
        console.log(`  - ${warning}`);
      }
    }

    console.log(`\nPreview hash: ${preview.previewHash}`);
    console.log(`\nTo apply, run:`);
    console.log(`  npx tsx scripts/threat-group-enrichment/enrich-groups.ts --apply --preview-hash ${preview.previewHash}`);

  } else if (apply) {
    if (!previewHash) {
      console.error('Error: --apply requires --preview-hash <sha256>');
      process.exit(1);
    }

    await applyEnrichment(previewHash, outputDir);

  } else if (rollback) {
    if (!rollbackId) {
      console.error('Error: --rollback requires an audit ID');
      process.exit(1);
    }

    await rollbackEnrichment(rollbackId);

  } else {
    console.log('Threat Group Targeting Enrichment Script');
    console.log('');
    console.log('Usage:');
    console.log('  npx tsx scripts/threat-group-enrichment/enrich-groups.ts --dry-run');
    console.log('  npx tsx scripts/threat-group-enrichment/enrich-groups.ts --apply --preview-hash <sha256>');
    console.log('  npx tsx scripts/threat-group-enrichment/enrich-groups.ts --rollback <audit-id>');
    console.log('');
    console.log('Options:');
    console.log('  --dry-run       Generate preview without applying changes');
    console.log('  --apply         Apply enrichment (requires --preview-hash)');
    console.log('  --preview-hash  SHA256 hash of the preview to apply');
    console.log('  --rollback      Rollback a previous enrichment');
    console.log('  --output        Output directory for preview files');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
