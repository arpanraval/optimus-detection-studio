/**
 * Library Matcher Module
 *
 * Finds existing detections in the library that cover extracted TTPs.
 * Matches detections by TTP overlap and group relationships.
 *
 */

import type {
  ExtractedTTP,
  MitreMapping,
  LibraryMatch
} from './types.ts'

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

/**
 * Finds detections in the library that match the extracted TTPs.
 * Returns detections with TTP overlap and group-related coverage.
 */
export async function findLibraryMatches(
  ttps: ExtractedTTP[],
  mitreMapping: MitreMapping,
  supabaseClient: SupabaseClient
): Promise<LibraryMatch[]> {
  const matches: LibraryMatch[] = []
  const seenDetectionIds = new Set<string>()

  try {
    // Part 1: Find detections by TTP overlap
    const techniqueIds = ttps.map(t => t.mitreId).filter(Boolean)

    console.log(`findLibraryMatches: Searching for ${techniqueIds.length} techniques:`, techniqueIds.slice(0, 10))

    // Fetch all detections with mitreAttackIds and filter in JS
    const { data: detections, error } = await supabaseClient
      .from('detections')
      .select('id, name, mitreAttackIds, linkedGroups, status, severity')
      .neq('status', 'deprecated')

    if (error) {
      console.error('Library matching query error:', error)
      return matches
    }

    console.log(`findLibraryMatches: Fetched ${detections?.length || 0} detections`)

    if (detections && detections.length > 0) {
      // Part 1a: Filter detections that have overlapping TTPs
      if (techniqueIds.length > 0) {
        const techniqueIdSet = new Set(techniqueIds)

        for (const detection of detections) {
          const detectionTTPs = detection.mitreAttackIds || []
          const matchedTTPs = detectionTTPs.filter((id: string) => techniqueIdSet.has(id))

          if (matchedTTPs.length > 0) {
            matches.push({
              detectionId: detection.id,
              detectionName: detection.name,
              matchType: 'ttp_match',
              matchedTTPs,
              coverageScore: Math.round((matchedTTPs.length / techniqueIds.length) * 100),
              status: detection.status,
              severity: detection.severity
            })
            seenDetectionIds.add(detection.id)
          }
        }

        console.log(`findLibraryMatches: ${matches.length} detections have overlapping TTPs`)
      }

      // Part 1b: Find detections linked to matched groups
      const matchedGroups = mitreMapping?.matchedGroups || []
      if (matchedGroups.length > 0) {
        const groupStixIds = matchedGroups.map((g: any) => g.stixId).filter(Boolean)
        const groupNameMap = new Map(matchedGroups.map((g: any) => [g.stixId, g.name]))

        console.log(`findLibraryMatches: Searching for detections linked to ${groupStixIds.length} groups:`, groupStixIds)

        let groupRelatedCount = 0
        for (const detection of detections) {
          const linkedGroups = detection.linkedGroups || []

          // Check if any linkedGroup matches our matched groups
          for (const linkedGroupId of linkedGroups) {
            if (groupStixIds.includes(linkedGroupId)) {
              // Check if we already have this detection from TTP match
              if (seenDetectionIds.has(detection.id)) {
                // Add group relation info to existing match
                const existingMatch = matches.find(m => m.detectionId === detection.id)
                if (existingMatch) {
                  existingMatch.relatedGroupStixId = linkedGroupId
                  existingMatch.relatedGroupName = groupNameMap.get(linkedGroupId)
                }
              } else {
                // New match via group relation
                matches.push({
                  detectionId: detection.id,
                  detectionName: detection.name,
                  matchType: 'group_related',
                  matchedTTPs: [],
                  coverageScore: 0,
                  status: detection.status,
                  severity: detection.severity,
                  relatedGroupStixId: linkedGroupId,
                  relatedGroupName: groupNameMap.get(linkedGroupId)
                })
                seenDetectionIds.add(detection.id)
                groupRelatedCount++
              }
              break // Only need one group match per detection
            }
          }
        }

        console.log(`findLibraryMatches: ${groupRelatedCount} additional detections via group relations`)
      }

      // Update TTP coverage info
      for (const ttp of ttps) {
        const coveringDetections = matches.filter((m: LibraryMatch) =>
          m.matchedTTPs?.includes(ttp.mitreId)
        )
        ttp.hasExistingDetection = coveringDetections.length > 0
        ttp.existingDetectionCount = coveringDetections.length
        ttp.existingDetectionIds = coveringDetections.map((m: LibraryMatch) => m.detectionId)
      }

      console.log(`findLibraryMatches: TTPs with coverage updated. Total matches: ${matches.length}`)
    }
  } catch (error) {
    console.error('Library matching error:', error)
  }

  return matches
}
