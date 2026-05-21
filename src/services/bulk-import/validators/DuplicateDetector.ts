/**
 * DuplicateDetector - Detects duplicate rules based on external ID
 *
 * Checks if a rule already exists in the database based on external_id.
 * Supports field-level diffing to categorize rules as net_new, updated_upstream,
 * or unchanged during pre-check analysis.
 */

import { supabase } from '../../../lib/supabaseClient';
import type { Detection, LibraryType } from '../../../types';
import type {
  ParsedRule,
  FieldDiff,
  PreCheckRuleResult,
  PreCheckSummary,
} from '../types';
import { mapSeverity } from '../types';

/**
 * Duplicate check result
 */
export interface DuplicateCheckResult {
  isDuplicate: boolean;
  existingId?: string;
  existingName?: string;
}

/**
 * Tag prefixes / values that BulkImportJobManager injects onto every imported
 * detection (`import:<jobId>`, `source:<vendor>`, `import-date:<date>`,
 * `bulk-updated`, `needs-*`). These never appear upstream — we strip them
 * before comparing so drift doesn't spuriously fire on every check.
 */
const SYNTHETIC_TAG_PREFIXES = ['import:', 'source:', 'import-date:'];
const SYNTHETIC_TAG_EXACT = new Set(['bulk-updated', 'needs-enrichment', 'needs-mitre', 'needs-description', 'needs-references']);

function isSyntheticTag(tag: string): boolean {
  if (SYNTHETIC_TAG_EXACT.has(tag)) return true;
  for (const p of SYNTHETIC_TAG_PREFIXES) {
    if (tag.startsWith(p)) return true;
  }
  return false;
}

function stripSyntheticTags(tags: string[]): string[] {
  return tags.filter((t) => !isSyntheticTag(t));
}

/**
 * Detects duplicate rules
 */
export class DuplicateDetector {
  private cachedExternalIds: Map<string, { id: string; name: string }> | null = null;
  private existingDetectionsCache: Map<string, Partial<Detection>> = new Map();

  /**
   * Check if a single external ID is a duplicate
   */
  checkDuplicate(
    externalId: string,
    existingIds: Set<string>
  ): DuplicateCheckResult {
    if (existingIds.has(externalId)) {
      return {
        isDuplicate: true,
        existingId: externalId,
      };
    }
    return { isDuplicate: false };
  }

  /**
   * Load all existing external IDs from database
   */
  async loadExistingExternalIds(
    libraryType?: string
  ): Promise<Set<string>> {
    try {
      let query = supabase
        .from('detections')
        .select('external_id, id, name')
        .not('external_id', 'is', null);

      if (libraryType) {
        query = query.eq('library_type', libraryType);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error loading existing external IDs:', error);
        return new Set();
      }

      // Cache the results for lookups
      this.cachedExternalIds = new Map();
      const externalIds = new Set<string>();

      for (const row of data || []) {
        if (row.external_id) {
          externalIds.add(row.external_id);
          this.cachedExternalIds.set(row.external_id, {
            id: row.id,
            name: row.name,
          });
        }
      }

      return externalIds;
    } catch (error) {
      console.error('Error loading existing external IDs:', error);
      return new Set();
    }
  }

  /**
   * Get details about an existing detection by external ID
   */
  getExistingDetectionInfo(externalId: string): { id: string; name: string } | undefined {
    return this.cachedExternalIds?.get(externalId);
  }

  /**
   * Check multiple external IDs at once
   */
  async checkBatchDuplicates(
    externalIds: string[],
    libraryType?: 'universal' | 'user'
  ): Promise<Map<string, DuplicateCheckResult>> {
    const results = new Map<string, DuplicateCheckResult>();

    // Load existing IDs if not cached
    const existingIds = await this.loadExistingExternalIds(libraryType);

    for (const externalId of externalIds) {
      const existing = this.cachedExternalIds?.get(externalId);
      if (existing) {
        results.set(externalId, {
          isDuplicate: true,
          existingId: existing.id,
          existingName: existing.name,
        });
      } else {
        results.set(externalId, { isDuplicate: false });
      }
    }

    return results;
  }

  /**
   * Clear the cache (call after import completes)
   */
  clearCache(): void {
    this.cachedExternalIds = null;
    this.existingDetectionsCache.clear();
  }

  /**
   * Load existing detections with field data for comparison.
   * Results are cached in existingDetectionsCache keyed by external_id.
   */
  async loadExistingDetections(
    userId: string,
    libraryType?: LibraryType
  ): Promise<Map<string, Partial<Detection>>> {
    let query = supabase
      .from('detections')
      .select('id, external_id, "detectionQuery", severity, description, "mitreTactics", "mitreTechniques", "mitreAttackIds", references, tags')
      .eq('user_id', userId)
      .not('external_id', 'is', null);

    if (libraryType) {
      query = query.eq('library_type', libraryType);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error loading existing detections for pre-check:', error);
      return this.existingDetectionsCache;
    }

    this.existingDetectionsCache.clear();

    for (const row of data ?? []) {
      if (row.external_id) {
        this.existingDetectionsCache.set(row.external_id, row as Partial<Detection>);
      }
    }

    return this.existingDetectionsCache;
  }

  /**
   * Compare incoming parsed rule fields against an existing detection.
   * Returns an array of diffs for fields that differ.
   */
  compareFields(incoming: ParsedRule, existing: Partial<Detection>): FieldDiff[] {
    const diffs: FieldDiff[] = [];

    // detectionQuery
    if (incoming.query !== (existing.detectionQuery ?? '')) {
      diffs.push({
        field: 'detectionQuery',
        oldValue: existing.detectionQuery ?? '',
        newValue: incoming.query,
      });
    }

    // severity (map incoming vendor level to our Severity enum)
    const incomingSeverity = mapSeverity(incoming.level, incoming.riskScore);
    if (existing.severity !== undefined && incomingSeverity !== existing.severity) {
      diffs.push({
        field: 'severity',
        oldValue: existing.severity,
        newValue: incomingSeverity,
      });
    }

    // description
    if (incoming.description !== (existing.description ?? '')) {
      diffs.push({
        field: 'description',
        oldValue: existing.description ?? '',
        newValue: incoming.description,
      });
    }

    // MITRE techniques (compare as sorted arrays).
    // Compare ATT&CK IDs to ATT&CK IDs — `existing.mitreTechniques` holds the
    // resolver's human-readable technique NAMES (e.g. "Windows Command Shell"),
    // not IDs, so comparing incoming.mitreAttackIds against it always reported
    // a fake diff for any MITRE-tagged rule. The right comparison is against
    // existing.mitreAttackIds (the canonical IDs as imported).
    const incomingTechniques = JSON.stringify([...incoming.mitreAttackIds].sort());
    const existingTechniques = JSON.stringify([...((existing.mitreAttackIds as string[] | undefined) ?? [])].sort());
    if (incomingTechniques !== existingTechniques) {
      diffs.push({
        field: 'mitreTechniques',
        oldValue: (existing.mitreAttackIds as string[] | undefined) ?? [],
        newValue: incoming.mitreAttackIds,
      });
    }

    // tags (compare as sorted arrays).
    // BulkImportJobManager injects bookkeeping tags onto every imported detection
    // (`import:<jobId>`, `source:<vendor>`, `import-date:<date>`, `bulk-updated`,
    // `needs-enrichment`, `needs-mitre`, `needs-description`, `needs-references`).
    // None of those exist upstream — comparing raw tag arrays would always report
    // a fake diff. Strip the synthetic tags from BOTH sides before comparing so
    // drift only fires when the actual content tags change.
    const cleanedIncoming = stripSyntheticTags(incoming.tags);
    const cleanedExisting = stripSyntheticTags(existing.tags ?? []);
    const incomingTags = JSON.stringify([...cleanedIncoming].sort());
    const existingTags = JSON.stringify([...cleanedExisting].sort());
    if (incomingTags !== existingTags) {
      diffs.push({
        field: 'tags',
        oldValue: cleanedExisting,
        newValue: cleanedIncoming,
      });
    }

    return diffs;
  }

  /**
   * Run a full pre-check across parsed rules, categorizing each as
   * net_new, updated_upstream, or unchanged. Rules without a detection
   * query are placed into hardRejects.
   */
  async runPreCheck(
    parsedRules: ParsedRule[],
    userId: string,
    libraryType?: LibraryType
  ): Promise<PreCheckSummary> {
    await this.loadExistingDetections(userId, libraryType);

    const summary: PreCheckSummary = {
      netNew: [],
      updatedUpstream: [],
      unchanged: [],
      hardRejects: [],
      totalScanned: parsedRules.length,
    };

    for (const rule of parsedRules) {
      // Hard reject: no detection query
      if (!rule.query) {
        summary.hardRejects.push({ rule, reason: 'Missing detection query' });
        continue;
      }

      const existing = this.existingDetectionsCache.get(rule.sourceId);

      // Net new: no match by external_id
      if (!existing) {
        const result: PreCheckRuleResult = {
          externalId: rule.sourceId,
          category: 'net_new',
          incomingRule: rule,
        };
        summary.netNew.push(result);
        continue;
      }

      // Compare fields to determine updated vs unchanged
      const diffs = this.compareFields(rule, existing);

      if (diffs.length === 0) {
        const result: PreCheckRuleResult = {
          externalId: rule.sourceId,
          category: 'unchanged',
          existingDetectionId: (existing as { id?: string }).id,
          incomingRule: rule,
        };
        summary.unchanged.push(result);
      } else {
        const result: PreCheckRuleResult = {
          externalId: rule.sourceId,
          category: 'updated_upstream',
          existingDetectionId: (existing as { id?: string }).id,
          diffs,
          incomingRule: rule,
        };
        summary.updatedUpstream.push(result);
      }
    }

    return summary;
  }

  /**
   * Find potential duplicates by name similarity
   * Uses simple substring matching for now
   */
  async findSimilarByName(
    name: string,
    threshold: number = 0.8
  ): Promise<Array<{ id: string; name: string; similarity: number }>> {
    try {
      // Load all detection names
      const { data, error } = await supabase
        .from('detections')
        .select('id, name');

      if (error || !data) {
        return [];
      }

      // Simple similarity check - could be improved with Levenshtein distance
      const normalizedSearch = name.toLowerCase().trim();
      const similar: Array<{ id: string; name: string; similarity: number }> = [];

      for (const detection of data) {
        const normalizedName = detection.name.toLowerCase().trim();

        // Exact match
        if (normalizedName === normalizedSearch) {
          similar.push({ id: detection.id, name: detection.name, similarity: 1.0 });
          continue;
        }

        // Substring match
        if (
          normalizedName.includes(normalizedSearch) ||
          normalizedSearch.includes(normalizedName)
        ) {
          const longer = Math.max(normalizedName.length, normalizedSearch.length);
          const shorter = Math.min(normalizedName.length, normalizedSearch.length);
          const similarity = shorter / longer;

          if (similarity >= threshold) {
            similar.push({ id: detection.id, name: detection.name, similarity });
          }
        }
      }

      return similar.sort((a, b) => b.similarity - a.similarity);
    } catch (error) {
      console.error('Error finding similar detections:', error);
      return [];
    }
  }
}

// Singleton instance
export const duplicateDetector = new DuplicateDetector();
