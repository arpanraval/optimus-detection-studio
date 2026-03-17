/**
 * Conservative MITRE-MISP Matching Algorithm
 *
 * This module implements a safe matching algorithm that prevents dangerous
 * over-clustering of distinct threat groups. Key principles:
 *
 * 1. MITRE ID is canonical - each MITRE group is a distinct entity
 * 2. No transitive matching - A=B and B=C does NOT mean A=C
 * 3. Unique alias requirement - only match if alias appears in exactly ONE MITRE group
 * 4. Microsoft is display-only - weather names shown but NOT used for matching
 */

import {
  MitreIntrusionSet,
  ParsedMitreGroup,
  MispThreatActor,
  MispThreatActorGalaxy,
  MicrosoftThreatActor,
  MatchResult,
  AmbiguousMatch,
  MatchType,
  MATCH_CONFIDENCE,
  AliasIndex,
  AliasIndexEntry,
  TargetingIntel,
  ISO_TO_COUNTRY,
  COUNTRY_TO_ISO,
  COUNTRY_NAME_ALIASES,
  EXCLUDED_ALIAS_TERMS,
  EXCLUDED_COUNTRY_CODES,
  MIN_ALIAS_LENGTH,
} from './types';

// =============================================================================
// MITRE ID EXTRACTION
// =============================================================================

const MITRE_ID_PATTERN = /^G\d{4}$/;

function extractMitreId(intrusionSet: MitreIntrusionSet): string | null {
  const mitreRef = intrusionSet.external_references?.find(
    ref => ref.source_name === 'mitre-attack' && ref.external_id?.match(MITRE_ID_PATTERN)
  );
  return mitreRef?.external_id || null;
}

// =============================================================================
// ALIAS NORMALIZATION
// =============================================================================

function normalizeAlias(alias: string): string {
  return alias.toLowerCase().trim();
}

function isValidAlias(alias: string): boolean {
  const normalized = normalizeAlias(alias);

  // Skip too short
  if (normalized.length < MIN_ALIAS_LENGTH) {
    return false;
  }

  // Skip generic terms
  if (EXCLUDED_ALIAS_TERMS.has(normalized)) {
    return false;
  }

  // Skip country codes alone
  if (EXCLUDED_COUNTRY_CODES.has(normalized)) {
    return false;
  }

  return true;
}

// =============================================================================
// ALIAS INDEX BUILDING
// =============================================================================

export function buildAliasIndex(mitreGroups: ParsedMitreGroup[]): AliasIndex {
  const index: AliasIndex = new Map();

  for (const group of mitreGroups) {
    // Collect all names for this group
    const allNames = [group.name, ...group.aliases];

    for (const name of allNames) {
      if (!isValidAlias(name)) continue;

      const normalized = normalizeAlias(name);
      const entry: AliasIndexEntry = {
        mitreId: group.mitreId,
        mitreStixId: group.stixId,
        mitreName: group.name,
        isShared: false, // Will be updated below
      };

      const existing = index.get(normalized);
      if (existing) {
        existing.push(entry);
      } else {
        index.set(normalized, [entry]);
      }
    }
  }

  // Mark shared aliases (appear in multiple MITRE groups)
  for (const [alias, entries] of index) {
    if (entries.length > 1) {
      // Check if entries refer to different MITRE groups
      const uniqueGroups = new Set(entries.map(e => e.mitreId));
      if (uniqueGroups.size > 1) {
        for (const entry of entries) {
          entry.isShared = true;
        }
      }
    }
  }

  return index;
}

// =============================================================================
// MITRE DATA PARSING
// =============================================================================

export function parseMitreIntrusionSets(stixBundle: { objects: any[] }): ParsedMitreGroup[] {
  const groups: ParsedMitreGroup[] = [];

  for (const obj of stixBundle.objects) {
    if (obj.type !== 'intrusion-set') continue;

    const intrusionSet = obj as MitreIntrusionSet;
    const mitreId = extractMitreId(intrusionSet);

    if (!mitreId) {
      console.warn(`Skipping intrusion-set without MITRE ID: ${intrusionSet.name}`);
      continue;
    }

    groups.push({
      stixId: intrusionSet.id,
      mitreId,
      name: intrusionSet.name,
      aliases: intrusionSet.aliases || [],
      description: intrusionSet.description,
      deprecated: intrusionSet.x_mitre_deprecated || false,
      revoked: intrusionSet.revoked || false,
      modified: intrusionSet.modified,
    });
  }

  return groups;
}

// =============================================================================
// MISP DATA PARSING
// =============================================================================

export function parseMispThreatActors(galaxy: MispThreatActorGalaxy): MispThreatActor[] {
  return galaxy.values || [];
}

// =============================================================================
// MICROSOFT DATA PARSING
// =============================================================================

export interface MicrosoftNameIndex {
  // Maps various names to Microsoft weather names
  aliasToMicrosoftName: Map<string, string>;
  // Maps MITRE-compatible aliases to origin
  aliasToOrigin: Map<string, string>;
}

export function buildMicrosoftIndex(actors: MicrosoftThreatActor[]): MicrosoftNameIndex {
  const aliasToMicrosoftName = new Map<string, string>();
  const aliasToOrigin = new Map<string, string>();

  for (const actor of actors) {
    const msName = actor['Threat actor name'];
    const origin = actor['Origin/Threat'];
    const otherNames = actor['Other names'];

    // Index the Microsoft name itself
    const msNormalized = normalizeAlias(msName);
    aliasToMicrosoftName.set(msNormalized, msName);
    if (origin) {
      aliasToOrigin.set(msNormalized, origin);
    }

    // Index all other names
    if (otherNames) {
      const names = otherNames.split(',').map(n => n.trim()).filter(n => n);
      for (const name of names) {
        const normalized = normalizeAlias(name);
        if (normalized) {
          aliasToMicrosoftName.set(normalized, msName);
          if (origin) {
            aliasToOrigin.set(normalized, origin);
          }
        }
      }
    }
  }

  return { aliasToMicrosoftName, aliasToOrigin };
}

// =============================================================================
// CONSERVATIVE MATCHING ALGORITHM
// =============================================================================

export interface MatchingResult {
  matches: Map<string, MatchResult>;  // MITRE ID -> Match Result
  ambiguous: AmbiguousMatch[];
  unmatched: string[];                // MITRE IDs with no match
}

export function performConservativeMatching(
  mitreGroups: ParsedMitreGroup[],
  mispActors: MispThreatActor[],
  msIndex: MicrosoftNameIndex
): MatchingResult {
  const aliasIndex = buildAliasIndex(mitreGroups);
  const matches = new Map<string, MatchResult>();
  const ambiguous: AmbiguousMatch[] = [];
  const matchedMispUuids = new Set<string>();

  // Build MITRE name index for quick lookup
  const mitreNameIndex = new Map<string, ParsedMitreGroup>();
  const mitreIdIndex = new Map<string, ParsedMitreGroup>();
  for (const group of mitreGroups) {
    mitreNameIndex.set(normalizeAlias(group.name), group);
    mitreIdIndex.set(group.mitreId, group);
  }

  // Helper to add/update a match
  function addMatch(
    group: ParsedMitreGroup,
    mispActor: MispThreatActor,
    matchType: MatchType,
    matchedOn: string
  ) {
    const existing = matches.get(group.mitreId);
    const newConfidence = MATCH_CONFIDENCE[matchType];

    const mispMatch = {
      uuid: mispActor.uuid,
      value: mispActor.value,
      matchedOn,
    };

    if (existing) {
      // Only add if this MISP actor isn't already matched
      if (!existing.matchedMispActors.some(m => m.uuid === mispActor.uuid)) {
        existing.matchedMispActors.push(mispMatch);
        // Keep highest confidence
        if (newConfidence > existing.confidence) {
          existing.matchType = matchType;
          existing.confidence = newConfidence;
        }
      }
    } else {
      matches.set(group.mitreId, {
        mitreId: group.mitreId,
        mitreStixId: group.stixId,
        mitreName: group.name,
        matchType,
        confidence: newConfidence,
        matchedMispActors: [mispMatch],
      });
    }

    matchedMispUuids.add(mispActor.uuid);
  }

  // STEP 1: MITRE ID Matching (Confidence: 100%)
  // Look for MITRE IDs (G0032) in MISP synonyms
  for (const mispActor of mispActors) {
    const synonyms = mispActor.meta?.synonyms || [];

    for (const synonym of synonyms) {
      if (MITRE_ID_PATTERN.test(synonym)) {
        const group = mitreIdIndex.get(synonym);
        if (group) {
          addMatch(group, mispActor, 'mitre_id', synonym);
          break; // Only match once per MISP actor for MITRE ID
        }
      }
    }
  }

  // STEP 2: Exact Name Matching (Confidence: 95%)
  // Match MISP value exactly to MITRE group name
  for (const mispActor of mispActors) {
    if (matchedMispUuids.has(mispActor.uuid)) continue;

    const normalized = normalizeAlias(mispActor.value);
    const group = mitreNameIndex.get(normalized);

    if (group) {
      addMatch(group, mispActor, 'exact_name', mispActor.value);
    }
  }

  // STEP 3: Alias-to-Primary Matching (Confidence: 80%)
  // Match MISP value to unique MITRE alias
  for (const mispActor of mispActors) {
    if (matchedMispUuids.has(mispActor.uuid)) continue;

    const normalized = normalizeAlias(mispActor.value);
    const entries = aliasIndex.get(normalized);

    if (entries && entries.length > 0) {
      // Check if any entries are shared (ambiguous)
      const uniqueEntries = entries.filter(e => !e.isShared);

      if (uniqueEntries.length === 1) {
        const group = mitreIdIndex.get(uniqueEntries[0].mitreId);
        if (group) {
          addMatch(group, mispActor, 'alias', mispActor.value);
        }
      } else if (entries.some(e => e.isShared)) {
        // Ambiguous - log for review
        ambiguous.push({
          mispValue: mispActor.value,
          mispUuid: mispActor.uuid,
          reason: 'Alias appears in multiple MITRE groups',
          candidateGroups: [...new Set(entries.map(e => e.mitreId))],
        });
      }
    }
  }

  // STEP 4: Synonym-to-Name Matching (Confidence: 70%)
  // Match MISP synonyms to MITRE group names
  for (const mispActor of mispActors) {
    if (matchedMispUuids.has(mispActor.uuid)) continue;

    const synonyms = mispActor.meta?.synonyms || [];

    for (const synonym of synonyms) {
      if (!isValidAlias(synonym)) continue;
      if (MITRE_ID_PATTERN.test(synonym)) continue; // Already handled in step 1

      const normalized = normalizeAlias(synonym);
      const group = mitreNameIndex.get(normalized);

      if (group) {
        addMatch(group, mispActor, 'synonym_to_name', synonym);
        break; // First match wins
      }
    }
  }

  // STEP 5: Synonym-to-Alias Matching (Confidence: 60%)
  // Match MISP synonyms to unique MITRE aliases
  for (const mispActor of mispActors) {
    if (matchedMispUuids.has(mispActor.uuid)) continue;

    const synonyms = mispActor.meta?.synonyms || [];

    for (const synonym of synonyms) {
      if (!isValidAlias(synonym)) continue;
      if (MITRE_ID_PATTERN.test(synonym)) continue;

      const normalized = normalizeAlias(synonym);
      const entries = aliasIndex.get(normalized);

      if (entries && entries.length > 0) {
        const uniqueEntries = entries.filter(e => !e.isShared);

        if (uniqueEntries.length === 1) {
          const group = mitreIdIndex.get(uniqueEntries[0].mitreId);
          if (group) {
            addMatch(group, mispActor, 'synonym_to_alias', synonym);
            break;
          }
        }
      }
    }
  }

  // Identify unmatched MITRE groups
  const unmatched: string[] = [];
  for (const group of mitreGroups) {
    if (!matches.has(group.mitreId)) {
      unmatched.push(group.mitreId);
    }
  }

  return { matches, ambiguous, unmatched };
}

// =============================================================================
// TARGETING INTELLIGENCE EXTRACTION
// =============================================================================

function normalizeCountryName(name: string | undefined): string | null {
  if (!name) return null;

  // Check aliases first
  if (COUNTRY_NAME_ALIASES[name]) {
    return COUNTRY_NAME_ALIASES[name];
  }

  // Check if it's already a valid country name
  if (COUNTRY_TO_ISO[name]) {
    return name;
  }

  // Check if it's an ISO code
  if (ISO_TO_COUNTRY[name.toUpperCase()]) {
    return ISO_TO_COUNTRY[name.toUpperCase()];
  }

  return name; // Return as-is if we can't normalize
}

function getCountryCode(countryName: string | null): string | null {
  if (!countryName) return null;

  const normalizedName = normalizeCountryName(countryName);
  if (normalizedName && COUNTRY_TO_ISO[normalizedName]) {
    return COUNTRY_TO_ISO[normalizedName];
  }

  // Try finding by checking if the country name is actually a code
  if (countryName.length === 2 && ISO_TO_COUNTRY[countryName.toUpperCase()]) {
    return countryName.toUpperCase();
  }

  return null;
}

export function extractTargetingIntel(
  mispActors: MispThreatActor[],
  msIndex: MicrosoftNameIndex,
  matchType: MatchType,
  confidence: number
): TargetingIntel {
  // Merge targeting data from all matched MISP actors
  const targetCountries = new Set<string>();
  const targetSectors = new Set<string>();
  let originCountry: string | null = null;
  let originCountryCode: string | null = null;
  let activityType: string | null = null;
  let microsoftName: string | undefined;

  for (const actor of mispActors) {
    const meta = actor.meta;
    if (!meta) continue;

    // Origin country (priority: cfr-suspected-state-sponsor > country)
    if (!originCountry && meta['cfr-suspected-state-sponsor']) {
      originCountry = normalizeCountryName(meta['cfr-suspected-state-sponsor']);
    }
    if (!originCountry && meta.country) {
      originCountry = normalizeCountryName(ISO_TO_COUNTRY[meta.country.toUpperCase()] || meta.country);
      if (!originCountryCode && meta.country.length === 2) {
        originCountryCode = meta.country.toUpperCase();
      }
    }

    // Target countries
    if (meta['cfr-suspected-victims']) {
      for (const victim of meta['cfr-suspected-victims']) {
        const normalized = normalizeCountryName(victim);
        if (normalized) {
          targetCountries.add(normalized);
        }
      }
    }

    // Target sectors (combine cfr-target-category and targeted-sector)
    if (meta['cfr-target-category']) {
      for (const sector of meta['cfr-target-category']) {
        targetSectors.add(sector);
      }
    }
    if (meta['targeted-sector']) {
      for (const sector of meta['targeted-sector']) {
        targetSectors.add(sector);
      }
    }

    // Activity type
    if (!activityType && meta['cfr-type-of-incident']) {
      activityType = meta['cfr-type-of-incident'];
    }

    // Try to find Microsoft name from actor aliases
    if (!microsoftName) {
      const allNames = [actor.value, ...(meta.synonyms || [])];
      for (const name of allNames) {
        const normalized = normalizeAlias(name);
        const msName = msIndex.aliasToMicrosoftName.get(normalized);
        if (msName) {
          microsoftName = msName;
          break;
        }
      }
    }
  }

  // Resolve origin country code if we have a country name but no code
  if (originCountry && !originCountryCode) {
    originCountryCode = getCountryCode(originCountry);
  }

  return {
    data_source: 'misp_threat_actor_galaxy',
    enriched_at: new Date().toISOString(),
    enrichment_version: '1.0.0',
    match_type: matchType,
    match_confidence: confidence,
    matched_misp_actor_ids: mispActors.map(a => a.uuid),
    origin_country: originCountry,
    origin_country_code: originCountryCode,
    target_countries: Array.from(targetCountries).sort(),
    target_sectors: Array.from(targetSectors).sort(),
    activity_type: activityType,
    vendor_names: microsoftName ? { microsoft: microsoftName } : undefined,
  };
}

// =============================================================================
// COMPLETE ENRICHMENT BUILDER
// =============================================================================

export interface EnrichedGroup {
  mitreId: string;
  mitreStixId: string;
  mitreName: string;
  targetingIntel: TargetingIntel | null;
  warnings: string[];
}

export function buildEnrichedGroups(
  matchResult: MatchingResult,
  mispActors: MispThreatActor[],
  msIndex: MicrosoftNameIndex
): EnrichedGroup[] {
  const enrichedGroups: EnrichedGroup[] = [];
  const mispActorMap = new Map(mispActors.map(a => [a.uuid, a]));

  for (const [mitreId, match] of matchResult.matches) {
    const warnings: string[] = [];

    // Get the actual MISP actor objects
    const matchedActors = match.matchedMispActors
      .map(m => mispActorMap.get(m.uuid))
      .filter((a): a is MispThreatActor => a !== undefined);

    // Warn if too many actors matched (possible over-matching)
    if (matchedActors.length > 5) {
      warnings.push(`${matchedActors.length} MISP actors matched - verify this is correct`);
    }

    // Extract targeting intelligence
    const targetingIntel = matchedActors.length > 0
      ? extractTargetingIntel(matchedActors, msIndex, match.matchType, match.confidence)
      : null;

    // Warn if no targeting data despite having matches
    if (targetingIntel && !targetingIntel.origin_country && targetingIntel.target_countries.length === 0) {
      warnings.push('MISP actors matched but no targeting data available');
    }

    enrichedGroups.push({
      mitreId: match.mitreId,
      mitreStixId: match.mitreStixId,
      mitreName: match.mitreName,
      targetingIntel,
      warnings,
    });
  }

  return enrichedGroups;
}
