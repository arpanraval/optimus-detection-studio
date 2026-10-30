/**
 * Library Matcher Module
 *
 * Decides which library detections cover the TTPs a report describes.
 *
 * Coverage is CONTEXTUAL. "The report mentions T1059 and we have 40 T1059
 * rules" is not coverage -- most of those rules look for something other than
 * what this adversary did. A rule covers a TTP only when its query logic checks
 * the concrete identifiers the report's evidence names: the process, file,
 * command fragment, registry key or event ID. That comparison is done by
 * ./observables.ts (threat intel's own copy of the Threat Research module).
 *
 * The technique family (T1059 for T1059.001) only scopes which rules are
 * compared. Without it a rule checking `svchost.exe` for credential theft
 * "covered" sandbox evasion evidence that also named svchost.exe.
 *
 * Rule lifecycle status is NOT a condition. Draft through Production all count;
 * the UI shows each match's status so a reader can tell deployed from untested.
 *
 * Detections linked to a threat group the report names are still listed, but
 * they never count as coverage.
 */

import type {
  CoverageGrade,
  ExtractedTTP,
  MitreMapping,
  LibraryMatch
} from './types.ts'

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import {
  compareObservables,
  extractQueryObservables,
  observableAnchors,
  type QueryObservables,
} from './observables.ts'

/**
 * The outcome of a coverage search.
 *
 * `matches: []` used to mean two different things: "searched the library and
 * nothing covers these techniques" and "there was nothing to search". The
 * second is what an empty library (or a failed read) produces, and rendered as
 * "0 Covered" it reads as an answer.
 *
 * `computed` says whether a question was actually asked. When it is false the
 * caller must record absence, not zero (constraint 5).
 */
export interface LibraryMatchResult {
  matches: LibraryMatch[]
  /** False when no detection was eligible to be searched at all. */
  computed: boolean
  /** Detections that passed the eligibility gate. */
  candidatePoolSize: number
  /** Rows considered before the gate, for an honest "0 of N" message. */
  librarySize: number
}

/** A library row as the matcher needs it. Query text is only required for
 *  rules in a technique family the report mentions. */
export interface LibraryDetection {
  id: string
  name: string
  mitreAttackIds?: string[] | null
  linkedGroups?: string[] | null
  status?: string | null
  severity?: string | null
  user_id?: string | null
  visibility?: string | null
  detectionQuery?: string | null
  queryLanguage?: string | null
}

/** Lifecycle states that retire a rule. Compared case-insensitively: `status`
 *  is free text and the library stores 'Deprecated', not 'deprecated'. */
const RETIRED_STATUSES = new Set(['deprecated', 'archived', 'inactive'])

/** PostgREST caps a response at `max_rows` (1000), so a single select silently
 *  returned the first 1000 of 4,212 detections. Read in pages of that size. */
const PAGE_SIZE = 1000

/** Ids per `in` filter when fetching query text, to keep the URL bounded. */
const QUERY_FETCH_CHUNK = 150

/**
 * Whether a detection may be offered as coverage for this user's report.
 *
 * Every lifecycle stage counts -- Draft, Development, Review, Testing and
 * Production. Maturity is shown to the reader as a status badge on each match
 * instead of deciding visibility.
 *
 * Visibility is still enforced here because the auto-digest path calls in with
 * the service-role key, which bypasses RLS: another user's private rule must
 * never appear in this user's report.
 */
export function isCoverageEligible(
  detection: { status?: string | null; visibility?: string | null; user_id?: string | null },
  userId: string,
): boolean {
  if (RETIRED_STATUSES.has((detection.status ?? '').trim().toLowerCase())) return false
  return detection.visibility !== 'private' || detection.user_id === userId
}

/** T1059.001 -> T1059. */
export function techniqueFamily(id: string | null | undefined): string {
  return (id ?? '').trim().toUpperCase().split('.')[0]
}

/**
 * Grade one rule against one TTP's evidence.
 *
 * Only identifiers that cannot be English words count -- `rundll32.exe`,
 * `ProcessVersionInfoOriginalFileName`, `4688` -- because a rule that omits
 * "fetching" tells us nothing. Returns null when the rule checks none of them.
 */
export function gradeRuleAgainstEvidence(
  ruleObservables: QueryObservables,
  evidence: string | null | undefined,
): { grade: 'covered' | 'partial'; matchedIdentifiers: string[] } | null {
  const anchors = observableAnchors([evidence ?? ''])
  const strong = anchors.filter(a => a.strong).map(a => a.token)
  if (strong.length === 0) return null
  // No table side: a report quote declares no telemetry, so the comparison's
  // own `overlaps` (which requires a shared table) cannot be used. The
  // identifier fields it computes are what carry the context here.
  const comparison = compareObservables(ruleObservables, { tables: new Set(), anchors })
  const matchedIdentifiers = strong.filter(token => comparison.matchedAnchors.includes(token))
  if (matchedIdentifiers.length === 0) return null
  return {
    grade: comparison.missingStrongAnchors.length === 0 ? 'covered' : 'partial',
    matchedIdentifiers,
  }
}

/** Whether a TTP's evidence names anything a rule could be checked against. */
export function isEvidenceAssessable(evidence: string | null | undefined): boolean {
  return observableAnchors([evidence ?? '']).some(a => a.strong)
}

/**
 * Match already-loaded library rows against a report. Pure: no I/O, so the
 * backfill script and tests run exactly the logic the digest runs.
 *
 * Mutates each TTP's coverage fields, as the digest has always done.
 */
export function matchLibrary(
  ttps: ExtractedTTP[],
  mitreMapping: MitreMapping,
  detections: LibraryDetection[],
  userId: string,
): LibraryMatchResult {
  const eligible = detections.filter(d => isCoverageEligible(d, userId))
  const techniqueIds = [...new Set(ttps.map(t => t.mitreId).filter(Boolean))]

  const byDetection = new Map<string, {
    detection: LibraryDetection
    covered: Set<string>
    partial: Set<string>
    identifiers: Set<string>
  }>()
  const observablesCache = new Map<string, QueryObservables>()
  const observablesFor = (d: LibraryDetection) => {
    let obs = observablesCache.get(d.id)
    if (!obs) {
      obs = extractQueryObservables(d.detectionQuery, d.queryLanguage)
      observablesCache.set(d.id, obs)
    }
    return obs
  }

  for (const ttp of ttps) {
    const coveredIds: string[] = []
    const partialIds: string[] = []

    if (!isEvidenceAssessable(ttp.evidence)) {
      ttp.coverageGrade = 'not_assessable'
    } else {
      const family = techniqueFamily(ttp.mitreId)
      for (const detection of eligible) {
        if (!family || !(detection.mitreAttackIds ?? []).some(id => techniqueFamily(id) === family)) continue
        const result = gradeRuleAgainstEvidence(observablesFor(detection), ttp.evidence)
        if (!result) continue

        let entry = byDetection.get(detection.id)
        if (!entry) {
          entry = { detection, covered: new Set(), partial: new Set(), identifiers: new Set() }
          byDetection.set(detection.id, entry)
        }
        result.matchedIdentifiers.forEach(token => entry!.identifiers.add(token))
        if (result.grade === 'covered') {
          entry.covered.add(ttp.mitreId)
          coveredIds.push(detection.id)
        } else {
          entry.partial.add(ttp.mitreId)
          partialIds.push(detection.id)
        }
      }
      const grade: CoverageGrade = coveredIds.length > 0 ? 'covered' : partialIds.length > 0 ? 'partial' : 'not_covered'
      ttp.coverageGrade = grade
    }

    ttp.hasExistingDetection = coveredIds.length > 0
    ttp.existingDetectionCount = coveredIds.length
    ttp.existingDetectionIds = coveredIds
    ttp.partialDetectionIds = partialIds
  }

  const matches: LibraryMatch[] = []
  for (const { detection, covered, partial, identifiers } of byDetection.values()) {
    // A TTP the rule fully covers is not also listed as partial.
    const partialOnly = [...partial].filter(id => !covered.has(id))
    matches.push({
      detectionId: detection.id,
      detectionName: detection.name,
      matchType: covered.size > 0 ? 'contextual' : 'partial_context',
      matchedTTPs: [...covered],
      partialTTPs: partialOnly,
      matchedIdentifiers: [...identifiers],
      coverageScore: techniqueIds.length ? Math.round((covered.size / techniqueIds.length) * 100) : 0,
      status: detection.status ?? '',
      severity: detection.severity ?? '',
    })
  }

  // Detections linked to a threat group the report names. Listed for context;
  // they claim no TTP, so they never count toward coverage.
  const matchedGroups = mitreMapping?.matchedGroups || []
  if (matchedGroups.length > 0) {
    const groupNameMap = new Map(matchedGroups.map((g: any) => [g.stixId, g.name]))
    for (const detection of eligible) {
      const linkedGroupId = (detection.linkedGroups ?? []).find(id => groupNameMap.has(id))
      if (!linkedGroupId) continue
      const existing = matches.find(m => m.detectionId === detection.id)
      if (existing) {
        existing.relatedGroupStixId = linkedGroupId
        existing.relatedGroupName = groupNameMap.get(linkedGroupId)
      } else {
        matches.push({
          detectionId: detection.id,
          detectionName: detection.name,
          matchType: 'group_related',
          matchedTTPs: [],
          coverageScore: 0,
          status: detection.status ?? '',
          severity: detection.severity ?? '',
          relatedGroupStixId: linkedGroupId,
          relatedGroupName: groupNameMap.get(linkedGroupId),
        })
      }
    }
  }

  // Coverage was only actually assessed if something was eligible to assess it
  // against. An empty candidate pool yields `matches: []`, which is absence of
  // an answer, not an answer of zero.
  return { matches, computed: eligible.length > 0, candidatePoolSize: eligible.length, librarySize: detections.length }
}

/**
 * Finds detections in the library that contextually cover the extracted TTPs.
 *
 * Reads the light columns for the whole library, then query text only for the
 * eligible rules in a technique family the report mentions -- the full query
 * corpus is ~3.5 MB and most of it is irrelevant to any one report.
 */
export async function findLibraryMatches(
  ttps: ExtractedTTP[],
  mitreMapping: MitreMapping,
  supabaseClient: SupabaseClient,
  userId: string,
): Promise<LibraryMatchResult> {
  const failed: LibraryMatchResult = { matches: [], computed: false, candidatePoolSize: 0, librarySize: 0 }

  try {
    const detections: LibraryDetection[] = []
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data: page, error } = await supabaseClient
        .from('detections')
        .select('id, name, mitreAttackIds, linkedGroups, status, severity, user_id, visibility')
        .order('id', { ascending: true })
        .range(from, from + PAGE_SIZE - 1)

      if (error) {
        console.error('Library matching query error:', error)
        // A failed query is not a coverage answer either.
        return failed
      }
      detections.push(...((page || []) as LibraryDetection[]))
      if (!page || page.length < PAGE_SIZE) break
    }

    const families = new Set(ttps.map(t => techniqueFamily(t.mitreId)).filter(Boolean))
    const candidates = detections.filter(d =>
      isCoverageEligible(d, userId) && (d.mitreAttackIds ?? []).some(id => families.has(techniqueFamily(id))),
    )
    const byId = new Map(detections.map(d => [d.id, d]))
    for (let i = 0; i < candidates.length; i += QUERY_FETCH_CHUNK) {
      const ids = candidates.slice(i, i + QUERY_FETCH_CHUNK).map(d => d.id)
      const { data, error } = await supabaseClient
        .from('detections')
        .select('id, detectionQuery, queryLanguage')
        .in('id', ids)
      if (error) {
        console.error('Library query-text fetch error:', error)
        return failed
      }
      for (const row of (data || []) as LibraryDetection[]) {
        const target = byId.get(row.id)
        if (target) {
          target.detectionQuery = row.detectionQuery
          target.queryLanguage = row.queryLanguage
        }
      }
    }

    const result = matchLibrary(ttps, mitreMapping, detections, userId)
    console.log(`findLibraryMatches: ${result.matches.length} matches from ${candidates.length} candidate rules of ${detections.length}`)
    return result
  } catch (error) {
    console.error('Library matching error:', error)
    return failed
  }
}
