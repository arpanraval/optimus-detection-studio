/**
 * MITRE Matcher Module
 *
 * Validates extracted TTPs against the MITRE ATT&CK database and
 * matches threat groups, software, and campaigns mentioned in reports.
 *
 */

import type {
  ExtractedTTP,
  MitreMapping,
  MitreEntityMatch,
  TechniqueMatch,
  TacticCoverage
} from './types.ts'

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

/**
 * Performs MITRE ATT&CK matching for extracted TTPs and content.
 * - Validates technique IDs against the database
 * - Matches threat groups, software, and campaigns
 * - Calculates tactic coverage
 */
export async function performMitreMatching(
  ttps: ExtractedTTP[],
  content: string,
  supabaseClient: SupabaseClient
): Promise<MitreMapping> {
  const result: MitreMapping = {
    matchedGroups: [],
    matchedCampaigns: [],
    matchedSoftware: [],
    matchedTechniques: [],
    tacticCoverage: []
  }

  try {
    // Validate technique IDs
    const techniqueIds = ttps.map(t => t.mitreId).filter(Boolean)
    if (techniqueIds.length > 0) {
      const { data: techniques } = await supabaseClient
        .from('mitre_objects')
        .select('stix_id, mitre_id, name, data')
        .eq('type', 'attack-pattern')
        .eq('deprecated', false)
        .in('mitre_id', techniqueIds)

      if (techniques) {
        result.matchedTechniques = techniques.map((t: any): TechniqueMatch => ({
          mitreId: t.mitre_id,
          techniqueName: t.name,
          stixId: t.stix_id,
          isValid: true,
          existsInDb: true,
          platforms: t.data?.x_mitre_platforms || [],
          dataSources: t.data?.x_mitre_data_sources || []
        }))
      }
    }

    // Calculate tactic coverage
    const tacticMap = new Map<string, { name: string; techniques: string[] }>()
    for (const ttp of ttps) {
      if (!tacticMap.has(ttp.tacticId)) {
        tacticMap.set(ttp.tacticId, { name: ttp.tacticName, techniques: [] })
      }
      tacticMap.get(ttp.tacticId)!.techniques.push(ttp.mitreId)
    }
    result.tacticCoverage = Array.from(tacticMap.entries()).map(([tacticId, data]): TacticCoverage => ({
      tacticId,
      tacticName: data.name,
      techniqueCount: data.techniques.length,
      techniques: data.techniques
    }))

    // Match groups
    const { data: groups } = await supabaseClient
      .from('mitre_objects')
      .select('stix_id, mitre_id, name, data')
      .eq('type', 'intrusion-set')
      .eq('deprecated', false)

    if (groups) {
      const contentLower = content.toLowerCase()
      for (const group of groups) {
        const nameLower = group.name.toLowerCase()
        const aliases = (group.data?.aliases || []).map((a: string) => a.toLowerCase())
        if (contentLower.includes(nameLower) || aliases.some((a: string) => contentLower.includes(a))) {
          result.matchedGroups.push({
            stixId: group.stix_id,
            mitreId: group.mitre_id,
            name: group.name,
            type: 'intrusion-set',
            matchConfidence: contentLower.includes(nameLower) ? 'high' : 'medium',
            matchReason: 'Name or alias found in report',
            aliases: group.data?.aliases || [],
            existsInDb: true
          })
        }
      }
    }

    // Match software/malware
    const { data: software } = await supabaseClient
      .from('mitre_objects')
      .select('stix_id, mitre_id, name, type, data')
      .in('type', ['malware', 'tool'])
      .eq('deprecated', false)

    if (software) {
      const contentLower = content.toLowerCase()
      for (const sw of software) {
        const nameLower = sw.name.toLowerCase()
        const aliases = (sw.data?.aliases || []).map((a: string) => a.toLowerCase())
        if (contentLower.includes(nameLower) || aliases.some((a: string) => contentLower.includes(a))) {
          result.matchedSoftware.push({
            stixId: sw.stix_id,
            mitreId: sw.mitre_id,
            name: sw.name,
            type: sw.type,
            matchConfidence: contentLower.includes(nameLower) ? 'high' : 'medium',
            matchReason: 'Name or alias found in report',
            aliases: sw.data?.aliases || [],
            existsInDb: true
          })
        }
      }
    }

    // Match campaigns
    const { data: campaigns } = await supabaseClient
      .from('mitre_objects')
      .select('stix_id, mitre_id, name, data')
      .eq('type', 'campaign')
      .eq('deprecated', false)

    if (campaigns) {
      const contentLower = content.toLowerCase()
      for (const campaign of campaigns) {
        if (contentLower.includes(campaign.name.toLowerCase())) {
          result.matchedCampaigns.push({
            stixId: campaign.stix_id,
            mitreId: campaign.mitre_id,
            name: campaign.name,
            type: 'campaign',
            matchConfidence: 'medium',
            matchReason: 'Campaign name found in report',
            existsInDb: true
          })
        }
      }
    }
  } catch (error) {
    console.error('MITRE matching error:', error)
  }

  return result
}
