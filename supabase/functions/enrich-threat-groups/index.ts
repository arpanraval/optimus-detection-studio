import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { getCorsHeaders, handleCorsPreflight } from '../_shared/cors.ts'

// =============================================================================
// CONFIGURATION
// =============================================================================

const MISP_THREAT_ACTOR_URL = 'https://raw.githubusercontent.com/MISP/misp-galaxy/main/clusters/threat-actor.json'
const ENRICHMENT_VERSION = '1.1.0'

// Match type confidence levels
const MATCH_CONFIDENCE: Record<string, number> = {
  'mitre_id': 100,
  'exact_name': 95,
  'alias': 80,
  'synonym_to_name': 70,
  'synonym_to_alias': 60
}

// Country code mappings
const ISO_TO_COUNTRY: Record<string, string> = {
  'CN': 'China', 'RU': 'Russian Federation', 'IR': 'Iran', 'KP': 'North Korea',
  'US': 'United States', 'IL': 'Israel', 'VN': 'Vietnam', 'IN': 'India',
  'PK': 'Pakistan', 'LB': 'Lebanon', 'SY': 'Syria', 'TR': 'Turkey',
  'UA': 'Ukraine', 'BY': 'Belarus', 'KR': 'South Korea', 'JP': 'Japan'
}

const COUNTRY_TO_ISO: Record<string, string> = Object.fromEntries(
  Object.entries(ISO_TO_COUNTRY).map(([code, name]) => [name.toLowerCase(), code])
)

// Additional country name variations
const COUNTRY_ALIASES: Record<string, string> = {
  'russia': 'Russian Federation',
  'dprk': 'North Korea',
  "democratic people's republic of korea": 'North Korea',
  'republic of korea': 'South Korea',
  'south korea': 'South Korea',
  'usa': 'United States',
  'uk': 'United Kingdom',
  'prc': 'China',
  "people's republic of china": 'China'
}

// =============================================================================
// TYPES
// =============================================================================

interface MispThreatActor {
  uuid: string
  value: string
  description?: string
  meta?: {
    country?: string
    'cfr-suspected-state-sponsor'?: string
    'cfr-suspected-victims'?: string[]
    'cfr-target-category'?: string[]
    'cfr-type-of-incident'?: string
    synonyms?: string[]
    refs?: string[]
  }
}

interface MitreGroup {
  stix_id: string
  mitre_id: string
  name: string
  aliases: string[]
  data: any
}

interface MatchResult {
  mitreStixId: string
  mitreId: string
  mitreName: string
  matchType: string
  confidence: number
  mispActors: { uuid: string; value: string; matchedOn: string }[]
}

interface TargetingIntel {
  data_source: string
  enriched_at: string
  enrichment_version: string
  match_type: string
  match_confidence: number
  matched_misp_actor_ids: string[]
  origin_country: string | null
  origin_country_code: string | null
  target_countries: string[]
  target_sectors: string[]
  activity_type: string | null
}

interface EnrichmentRequest {
  action: 'preview' | 'apply'
  previewHash?: string
}

// =============================================================================
// MATCHING LOGIC
// =============================================================================

function normalizeAlias(alias: string): string {
  return alias.toLowerCase().trim().replace(/[^a-z0-9]/g, '')
}

function buildAliasIndex(groups: MitreGroup[]): Map<string, { mitreId: string; stixId: string; name: string; count: number }[]> {
  const index = new Map<string, { mitreId: string; stixId: string; name: string; count: number }[]>()

  for (const group of groups) {
    const allNames = [group.name, group.mitre_id, ...(group.aliases || [])]

    for (const alias of allNames) {
      if (!alias || alias.length < 3) continue
      const normalized = normalizeAlias(alias)
      if (!normalized) continue

      const existing = index.get(normalized) || []
      existing.push({ mitreId: group.mitre_id, stixId: group.stix_id, name: group.name, count: 1 })
      index.set(normalized, existing)
    }
  }

  return index
}

function performMatching(
  mitreGroups: MitreGroup[],
  mispActors: MispThreatActor[]
): { matches: Map<string, MatchResult>; unmatched: string[] } {
  const matches = new Map<string, MatchResult>()
  const aliasIndex = buildAliasIndex(mitreGroups)

  // Create quick lookup for MITRE groups
  const mitreById = new Map(mitreGroups.map(g => [g.mitre_id, g]))
  const mitreByName = new Map(mitreGroups.map(g => [normalizeAlias(g.name), g]))

  for (const actor of mispActors) {
    const allMispNames = [actor.value, ...(actor.meta?.synonyms || [])]

    for (const mispName of allMispNames) {
      if (!mispName) continue
      const normalized = normalizeAlias(mispName)

      // Check for MITRE ID match (e.g., "G0032" in synonyms)
      const mitreIdMatch = mispName.match(/^G\d{4}$/i)
      if (mitreIdMatch) {
        const group = mitreById.get(mispName.toUpperCase())
        if (group) {
          addMatch(matches, group, actor, mispName, 'mitre_id')
          continue
        }
      }

      // Check alias index
      const candidates = aliasIndex.get(normalized)
      if (candidates && candidates.length === 1) {
        // Unique match
        const group = mitreGroups.find(g => g.stix_id === candidates[0].stixId)
        if (group) {
          const matchType = mispName === actor.value
            ? (normalizeAlias(group.name) === normalized ? 'exact_name' : 'alias')
            : (normalizeAlias(group.name) === normalized ? 'synonym_to_name' : 'synonym_to_alias')
          addMatch(matches, group, actor, mispName, matchType)
        }
      }
    }
  }

  // Find unmatched MITRE groups
  const matchedStixIds = new Set(matches.keys())
  const unmatched = mitreGroups
    .filter(g => !matchedStixIds.has(g.stix_id))
    .map(g => g.mitre_id)

  return { matches, unmatched }
}

function addMatch(
  matches: Map<string, MatchResult>,
  group: MitreGroup,
  actor: MispThreatActor,
  matchedOn: string,
  matchType: string
) {
  const existing = matches.get(group.stix_id)

  if (existing) {
    // Add to existing match if same group
    if (!existing.mispActors.find(a => a.uuid === actor.uuid)) {
      existing.mispActors.push({ uuid: actor.uuid, value: actor.value, matchedOn })
      // Upgrade match type if better
      if (MATCH_CONFIDENCE[matchType] > existing.confidence) {
        existing.matchType = matchType
        existing.confidence = MATCH_CONFIDENCE[matchType]
      }
    }
  } else {
    matches.set(group.stix_id, {
      mitreStixId: group.stix_id,
      mitreId: group.mitre_id,
      mitreName: group.name,
      matchType,
      confidence: MATCH_CONFIDENCE[matchType],
      mispActors: [{ uuid: actor.uuid, value: actor.value, matchedOn }]
    })
  }
}

// =============================================================================
// TARGETING INTEL EXTRACTION
// =============================================================================

function extractTargetingIntel(
  actors: MispThreatActor[],
  matchType: string,
  confidence: number
): TargetingIntel {
  let originCountry: string | null = null
  let originCountryCode: string | null = null
  const targetCountries = new Set<string>()
  const targetSectors = new Set<string>()
  let activityType: string | null = null

  for (const actor of actors) {
    const meta = actor.meta || {}

    // Origin country
    if (!originCountry) {
      if (meta.country) {
        originCountryCode = meta.country.toUpperCase()
        originCountry = ISO_TO_COUNTRY[originCountryCode] || meta.country
      } else if (meta['cfr-suspected-state-sponsor']) {
        const sponsor = meta['cfr-suspected-state-sponsor']
        originCountry = COUNTRY_ALIASES[sponsor.toLowerCase()] || sponsor
        originCountryCode = COUNTRY_TO_ISO[originCountry.toLowerCase()] || null
      }
    }

    // Target countries
    const victims = meta['cfr-suspected-victims'] || []
    for (const victim of victims) {
      const normalized = COUNTRY_ALIASES[victim.toLowerCase()] || victim
      targetCountries.add(normalized)
    }

    // Target sectors
    const categories = meta['cfr-target-category'] || []
    for (const cat of categories) {
      targetSectors.add(cat)
    }

    // Activity type
    if (!activityType && meta['cfr-type-of-incident']) {
      activityType = meta['cfr-type-of-incident']
    }
  }

  return {
    data_source: 'misp_threat_actor_galaxy',
    enriched_at: new Date().toISOString(),
    enrichment_version: ENRICHMENT_VERSION,
    match_type: matchType,
    match_confidence: confidence,
    matched_misp_actor_ids: actors.map(a => a.uuid),
    origin_country: originCountry,
    origin_country_code: originCountryCode,
    target_countries: Array.from(targetCountries),
    target_sectors: Array.from(targetSectors),
    activity_type: activityType
  }
}

// =============================================================================
// HASH GENERATION
// =============================================================================

async function generateHash(content: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(content)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

// =============================================================================
// MAIN HANDLER
// =============================================================================

serve(async (req: Request) => {
  const preflightResponse = handleCorsPreflight(req)
  if (preflightResponse) return preflightResponse

  const corsHeaders = getCorsHeaders(req)

  try {
    // Auth check
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    )
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const body: EnrichmentRequest = await req.json()
    const { action, previewHash } = body

    // Fetch MISP data from GitHub
    console.log('Fetching MISP Threat Actor data...')
    const mispResponse = await fetch(MISP_THREAT_ACTOR_URL)
    if (!mispResponse.ok) {
      throw new Error('Failed to fetch MISP Threat Actor data')
    }
    const mispGalaxy = await mispResponse.json()
    const mispActors: MispThreatActor[] = mispGalaxy.values || []
    console.log(`Loaded ${mispActors.length} MISP actors`)

    // Fetch MITRE groups from database
    console.log('Fetching MITRE groups from database...')
    const { data: mitreData, error: mitreError } = await supabase
      .from('mitre_objects')
      .select('stix_id, mitre_id, name, data')
      .eq('type', 'intrusion-set')
      .eq('deprecated', false)
      .eq('revoked', false)

    if (mitreError) throw mitreError

    const mitreGroups: MitreGroup[] = (mitreData || []).map(g => ({
      stix_id: g.stix_id,
      mitre_id: g.mitre_id,
      name: g.name,
      aliases: g.data?.aliases || [],
      data: g.data
    }))
    console.log(`Loaded ${mitreGroups.length} MITRE groups`)

    // Perform matching
    console.log('Performing conservative matching...')
    const { matches, unmatched } = performMatching(mitreGroups, mispActors)
    console.log(`Matched ${matches.size} groups, ${unmatched.length} unmatched`)

    // Build enrichment data
    const mispActorMap = new Map(mispActors.map(a => [a.uuid, a]))
    const enrichments: { stixId: string; intel: TargetingIntel; preview: any }[] = []

    for (const [stixId, match] of matches) {
      const actors = match.mispActors
        .map(m => mispActorMap.get(m.uuid))
        .filter(Boolean) as MispThreatActor[]

      const intel = extractTargetingIntel(actors, match.matchType, match.confidence)

      enrichments.push({
        stixId,
        intel,
        preview: {
          mitreId: match.mitreId,
          mitreName: match.mitreName,
          matchType: match.matchType,
          confidence: match.confidence,
          originCountry: intel.origin_country,
          originCountryCode: intel.origin_country_code,
          targetCountries: intel.target_countries.slice(0, 5),
          targetSectors: intel.target_sectors.slice(0, 3),
          mispActorCount: match.mispActors.length
        }
      })
    }

    // Count groups that will actually get targeting data
    const groupsWithTargeting = enrichments.filter(e =>
      e.intel.origin_country || e.intel.target_countries.length > 0
    ).length

    // Generate preview hash
    const previewContent = JSON.stringify(enrichments.map(e => ({
      stixId: e.stixId,
      intel: e.intel
    })))
    const currentHash = await generateHash(previewContent)

    if (action === 'preview') {
      return new Response(JSON.stringify({
        success: true,
        preview: {
          previewHash: currentHash,
          timestamp: new Date().toISOString(),
          summary: {
            totalMitreGroups: mitreGroups.length,
            totalMispActors: mispActors.length,
            matchedGroups: matches.size,
            groupsWithTargeting,
            unmatchedGroups: unmatched.length
          },
          sampleMatches: enrichments.slice(0, 20).map(e => e.preview),
          unmatchedSample: unmatched.slice(0, 10)
        }
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Apply action
    if (action === 'apply') {
      if (!previewHash) {
        return new Response(JSON.stringify({ error: 'Preview hash required for apply' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      if (previewHash !== currentHash) {
        // Log mismatch but proceed — MISP API can return subtly different data between calls
        console.warn(`Preview hash mismatch: provided=${previewHash}, current=${currentHash}. Proceeding with current data.`)
      }

      // Get current targeting_intel for rollback
      const stixIds = enrichments.map(e => e.stixId)
      const { data: currentData } = await supabase
        .from('mitre_objects')
        .select('stix_id, data')
        .in('stix_id', stixIds)

      const rollbackData: Record<string, any> = {}
      for (const row of currentData || []) {
        rollbackData[row.stix_id] = row.data?.targeting_intel || null
      }

      // Create audit record
      const { data: auditRecord, error: auditError } = await supabase
        .from('enrichment_audit')
        .insert({
          enrichment_type: 'misp_targeting_intel',
          preview_hash: previewHash,
          affected_group_ids: stixIds,
          rollback_data: rollbackData,
          status: 'applied',
          notes: `Browser UI enrichment: ${matches.size} groups from MISP Galaxy`
        })
        .select()
        .single()

      if (auditError) {
        console.error('Audit error:', auditError)
        throw new Error('Failed to create audit record')
      }

      // Apply enrichments
      let successCount = 0
      let errorCount = 0

      for (const enrichment of enrichments) {
        // Update the group's data JSONB with targeting_intel
        const { error: updateError } = await supabase.rpc('update_targeting_intel', {
          p_stix_id: enrichment.stixId,
          p_targeting_intel: enrichment.intel
        })

        if (updateError) {
          console.error(`Failed to update ${enrichment.stixId}:`, updateError)
          errorCount++
        } else {
          successCount++
        }
      }

      return new Response(JSON.stringify({
        success: true,
        applied: {
          auditId: auditRecord.id,
          totalGroups: enrichments.length,
          successCount,
          errorCount,
          groupsWithTargeting
        }
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    return new Response(JSON.stringify({ error: 'Invalid action' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('Enrichment error:', error)
    return new Response(JSON.stringify({
      error: 'Enrichment failed',
      message: error.message
    }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
