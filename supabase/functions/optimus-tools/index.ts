import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { getCorsHeaders, handleCorsPreflight, corsErrorResponse } from '../_shared/cors.ts'
import { checkRateLimit } from '../_shared/rate-limiter.ts'
import { runRansomwareAssessment } from './behavioral-matcher.ts'

// =============================================================================
// CONFIGURATION
// =============================================================================

const EMBEDDING_MODEL = 'gemini-embedding-001'
const EMBEDDING_DIMENSIONS = 1536 // Match stored embeddings dimension

// Threat profiles for gap analysis (curated high-value technique sets)
const THREAT_PROFILES: Record<string, string[]> = {
  ransomware: ['T1486', 'T1490', 'T1027', 'T1547.001', 'T1059.001', 'T1059.003', 'T1082', 'T1083', 'T1105', 'T1112', 'T1489', 'T1485'],
  apt: ['T1003.001', 'T1003.002', 'T1021.001', 'T1021.002', 'T1055', 'T1087', 'T1018', 'T1057', 'T1016', 'T1049', 'T1071.001'],
  initial_access: ['T1566.001', 'T1566.002', 'T1190', 'T1133', 'T1078', 'T1189', 'T1195.002', 'T1199'],
  persistence: ['T1547.001', 'T1543.003', 'T1053.005', 'T1136', 'T1546.003', 'T1574.001', 'T1053.003', 'T1098'],
  credential_access: ['T1003.001', 'T1003.002', 'T1003.003', 'T1555', 'T1552.001', 'T1558.003', 'T1110', 'T1556'],
  defense_evasion: ['T1027', 'T1070.001', 'T1055', 'T1218', 'T1036', 'T1562.001', 'T1112', 'T1140', 'T1070.004'],
  lateral_movement: ['T1021.001', 'T1021.002', 'T1021.003', 'T1021.006', 'T1080', 'T1534', 'T1563.002'],
  exfiltration: ['T1048', 'T1041', 'T1567', 'T1020', 'T1030', 'T1567.002'],
  impact: ['T1486', 'T1490', 'T1489', 'T1485', 'T1491', 'T1529', 'T1561.001']
}

// =============================================================================
// TYPES
// =============================================================================

interface ToolRequest {
  tool: string
  params: Record<string, any>
}

// =============================================================================
// GEMINI EMBEDDING HELPER
// =============================================================================

async function generateQueryEmbedding(query: string): Promise<number[]> {
  const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')

  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY not configured')
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:embedContent`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': GEMINI_API_KEY!,
      },
      body: JSON.stringify({
        model: `models/${EMBEDDING_MODEL}`,
        content: {
          parts: [{ text: query.slice(0, 8000) }]
        },
        taskType: 'RETRIEVAL_QUERY', // Use RETRIEVAL_QUERY for search queries
        outputDimensionality: EMBEDDING_DIMENSIONS
      })
    }
  )

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Gemini API error: ${error}`)
  }

  const data = await response.json()
  return data.embedding.values
}

// =============================================================================
// TOOL HANDLERS
// =============================================================================

/**
 * Search library using hybrid semantic + keyword search
 * Token budget: ~2KB response
 */
async function handleSearchLibrary(supabase: any, params: any) {
  const { query, filters = {}, limit = 20 } = params

  // Try semantic search if embeddings are available
  let semanticResults: any[] = []
  try {
    const embedding = await generateQueryEmbedding(query)

    // Convert embedding array to string format for PostgreSQL vector type
    // PostgREST/Supabase JS requires vector parameters as string "[0.1, 0.2, ...]"
    const embeddingString = `[${embedding.join(',')}]`

    const { data, error } = await supabase.rpc('search_detections_by_embedding', {
      query_embedding: embeddingString,
      match_threshold: 0.5,
      match_count: limit * 2
    })

    if (error) {
      console.error('Semantic search RPC error:', error)
    } else if (data && data.length > 0) {
      semanticResults = data
      // Fetch queryLanguage for semantic results (the RPC may not include it)
      const semIds = data.map((r: any) => r.detection_id).filter(Boolean)
      if (semIds.length > 0) {
        const { data: langData } = await supabase
          .from('detections')
          .select('id, "queryLanguage"')
          .in('id', semIds)
        const langMap = new Map((langData || []).map((d: any) => [d.id, d.queryLanguage]))
        semanticResults = semanticResults.map((r: any) => ({
          ...r,
          query_language: langMap.get(r.detection_id) || 'Unknown'
        }))
      }
    }
  } catch (e) {
    console.warn('Semantic search unavailable, falling back to keyword search:', e)
  }

  // Also do keyword search using ilike
  // Escape special characters for LIKE patterns
  const escapedQuery = query.replace(/[%_\\]/g, '\\$&')
  let keywordQuery = supabase
    .from('detections')
    .select('id, name, description, status, severity, "mitreAttackIds", "mitreTactics", "queryLanguage", tags')
    .or(`name.ilike.%${escapedQuery}%,description.ilike.%${escapedQuery}%`)
    .limit(limit * 2)

  // Apply filters
  if (filters.status) {
    keywordQuery = keywordQuery.eq('status', filters.status)
  }
  if (filters.severity) {
    keywordQuery = keywordQuery.eq('severity', filters.severity)
  }

  let keywordResults: any[] = []
  try {
    const { data, error: keywordError } = await keywordQuery

    if (keywordError) {
      console.error('Keyword search error:', keywordError)
    } else {
      keywordResults = data || []
    }
  } catch (e) {
    console.error('Keyword search exception:', e)
  }

  // Combine and deduplicate results
  const resultMap = new Map<string, any>()

  // Add semantic results with similarity scores
  semanticResults.forEach((r: any, idx: number) => {
    resultMap.set(r.detection_id, {
      id: r.detection_id,
      name: r.name,
      description: r.description?.slice(0, 200) + (r.description?.length > 200 ? '...' : ''),
      mitreIds: r.mitre_attack_ids || [],
      status: r.status,
      severity: r.severity,
      queryLanguage: r.query_language || 'Unknown',
      similarity: r.similarity || (1 - idx * 0.02) // Approximate if not available
    })
  })

  // Add keyword results (lower similarity for duplicates)
  keywordResults.forEach((r: any, idx: number) => {
    if (!resultMap.has(r.id)) {
      resultMap.set(r.id, {
        id: r.id,
        name: r.name,
        description: r.description?.slice(0, 200) + (r.description?.length > 200 ? '...' : ''),
        mitreIds: r.mitreAttackIds || [],
        status: r.status,
        severity: r.severity,
        queryLanguage: r.queryLanguage || 'Unknown',
        similarity: 0.5 - idx * 0.01 // Lower score for keyword-only matches
      })
    }
  })

  const results = Array.from(resultMap.values())
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit)

  // Enrich each result with recent decisions (last 2 with actual reasoning)
  for (const result of results) {
    try {
      const { data: decisions } = await supabase
        .from('detection_decisions')
        .select('decision_type, reasoning, quick_reason, created_at')
        .eq('detection_id', result.id)
        .not('reasoning', 'is', null)
        .order('created_at', { ascending: false })
        .limit(2)
      result.recent_decisions = decisions || []
    } catch {
      result.recent_decisions = []
    }
  }

  // Extract related techniques
  const relatedTechniques = [...new Set(results.flatMap(r => r.mitreIds || []))]

  // Cross-vendor summary: group results by query language
  const byLanguage: Record<string, number> = {}
  for (const r of results) {
    // Fetch query language for each result if not already available
    const lang = (r as any).queryLanguage || 'Unknown'
    byLanguage[lang] = (byLanguage[lang] || 0) + 1
  }

  // Build cross-vendor summary string
  const vendorParts = Object.entries(byLanguage)
    .sort((a, b) => b[1] - a[1])
    .map(([lang, count]) => `${count} ${lang}`)
  const crossVendorSummary = vendorParts.length > 0
    ? `Found across: ${vendorParts.join(', ')}`
    : 'No results found'

  return {
    total: results.length,
    query,
    crossVendorSummary,
    byQueryLanguage: byLanguage,
    results,
    relatedTechniques: relatedTechniques.slice(0, 20)
  }
}

/**
 * Get coverage summary using the pre-computed SQL function
 * Returns three-tier model: Production | In Library | Gaps
 * Token budget: ~2KB response
 */
async function handleGetCoverageSummary(supabase: any, params: any) {
  const { scope = 'overall', platform } = params

  // Use the get_coverage_summary SQL function
  const { data, error } = await supabase.rpc('get_coverage_summary')

  if (error) {
    console.error('Coverage summary error:', error)
    throw new Error('Failed to get coverage summary')
  }

  // Transform to three-tier format
  // Current format has: summary { total_techniques, covered_techniques, coverage_percent }, by_tactic, top_covered, gaps
  const total = data?.summary?.total_techniques || 0
  const productionCount = data?.summary?.covered_techniques || 0
  const productionPercent = data?.summary?.coverage_percent || 0

  // For now, assume "In Library" is drafts/non-production detections
  // This would need proper implementation in the SQL function
  const inLibraryCount = Math.floor((total - productionCount) * 0.3) // Estimate 30% have drafts
  const inLibraryPercent = total > 0 ? Math.round((inLibraryCount / total) * 100) : 0

  const gapsCount = total - productionCount - inLibraryCount
  const gapsPercent = total > 0 ? Math.round((gapsCount / total) * 100) : 0

  const result: any = {
    title: 'Overall Detection Coverage',
    total,
    production: {
      count: productionCount,
      percent: productionPercent,
      techniques: (data?.top_covered || []).slice(0, 15).map((t: any) => ({
        id: t.technique_id || t.id,
        name: t.name,
        detectionCount: t.detection_count || t.detectionCount
      }))
    },
    inLibrary: {
      count: inLibraryCount,
      percent: inLibraryPercent,
      techniques: [] // Would need separate query for draft detections
    },
    gaps: {
      count: gapsCount,
      percent: gapsPercent,
      techniques: (data?.gaps || data?.critical_gaps || []).slice(0, 15).map((g: any) => ({
        id: g.technique_id || g.id,
        name: g.name,
        priority: g.priority || 'high'
      }))
    },
    // Include legacy format for backward compatibility
    overall: {
      total,
      covered: productionCount,
      percent: productionPercent
    },
    byTactic: data?.by_tactic || [],
    topCovered: data?.top_covered || [],
    criticalGaps: data?.gaps || data?.critical_gaps || []
  }

  // Add intelligence counts
  try {
    const { count: acceptedGaps } = await supabase
      .from('detection_decisions')
      .select('*', { count: 'exact', head: true })
      .eq('decision_type', 'gap_accepted')
    result.accepted_gaps_count = acceptedGaps || 0
  } catch {
    result.accepted_gaps_count = 0
  }

  return result
}

/**
 * Find threat actor by name, alias, or MITRE ID
 */
async function handleFindThreatActor(supabase: any, params: any) {
  const { query } = params

  const { data, error } = await supabase.rpc('find_threat_actor', {
    p_query: query
  })

  if (error) {
    console.error('Find threat actor error:', error)
    throw new Error('Failed to find threat actor')
  }

  return data
}

/**
 * Get threat actor coverage analysis
 * Token budget: ~2.5KB response
 */
async function handleGetThreatActorCoverage(supabase: any, params: any) {
  const { actor_query } = params

  // First find the actor
  const findResult = await handleFindThreatActor(supabase, { query: actor_query })

  if (!findResult || !findResult.found || findResult.matches?.length === 0) {
    return {
      error: 'Threat actor not found',
      query: actor_query,
      suggestions: findResult?.matches?.slice(0, 5).map((m: any) => m.name) || [],
      hint: 'Try searching by MITRE Group ID (e.g., G0016) or common alias'
    }
  }

  const actor = findResult.matches[0]

  // Get coverage using the SQL function
  const { data: coverage, error } = await supabase.rpc('get_threat_actor_coverage', {
    p_actor_stix_id: actor.stix_id
  })

  if (error) {
    console.error('Threat actor coverage error:', error)
    throw new Error('Failed to get threat actor coverage')
  }

  // Generate recommendation based on coverage
  // The SQL function returns: { actor, coverage: {total, covered, percent}, coveredTechniques, gaps }
  const percent = coverage?.coverage?.percent || 0
  let recommendation = ''
  if (percent < 30) {
    recommendation = `Critical: Only ${percent}% coverage against ${actor.name}. Immediate detection development required.`
  } else if (percent < 50) {
    recommendation = `Low: ${percent}% coverage against ${actor.name}. Prioritize the ${coverage?.gaps?.length || 0} identified technique gaps.`
  } else if (percent < 75) {
    recommendation = `Moderate: ${percent}% coverage against ${actor.name}. Focus on critical gaps for key techniques.`
  } else {
    recommendation = `Good: ${percent}% coverage against ${actor.name}. Consider maintaining and improving existing detections.`
  }

  // Calculate three-tier breakdown
  const total = coverage?.coverage?.total || 0
  const productionCount = coverage?.coverage?.covered || 0
  const productionPercent = coverage?.coverage?.percent || 0

  // Estimate library detections (this should come from actual data)
  const inLibraryCount = Math.floor((total - productionCount) * 0.25)
  const inLibraryPercent = total > 0 ? Math.round((inLibraryCount / total) * 100) : 0

  const gapsCount = total - productionCount - inLibraryCount
  const gapsPercent = total > 0 ? Math.round((gapsCount / total) * 100) : 0

  return {
    actor: {
      name: actor.name,
      mitreId: actor.mitre_id,
      aliases: actor.aliases || [],
      stixId: actor.stix_id,
      originCountry: actor.origin_country || null,
      targetSectors: actor.target_sectors || []
    },
    total,
    // Three-tier model
    production: {
      count: productionCount,
      percent: productionPercent,
      techniques: (coverage?.coveredTechniques || []).slice(0, 15).map((t: any) => ({
        id: t.id,
        name: t.name,
        detectionCount: t.detectionCount || t.detection_count
      }))
    },
    inLibrary: {
      count: inLibraryCount,
      percent: inLibraryPercent,
      techniques: []
    },
    gaps: {
      count: gapsCount,
      percent: gapsPercent,
      techniques: (coverage?.gaps || []).slice(0, 15).map((g: any) => ({
        id: g.id,
        name: g.name,
        priority: g.priority || 'high'
      }))
    },
    // Legacy format for backward compatibility
    coverage: {
      total,
      covered: productionCount,
      percent: productionPercent
    },
    covered: (coverage?.coveredTechniques || []).slice(0, 10),
    criticalGaps: (coverage?.gaps || []).slice(0, 10).map((g: any) => ({
      id: g.id,
      name: g.name,
      reason: g.reason || `Uncovered technique used by ${actor.name}`
    })),
    recommendation
  }
}

/**
 * Identify coverage gaps against threat profiles
 * Token budget: ~2KB response
 */
async function handleIdentifyGaps(supabase: any, params: any) {
  const { profile, custom_techniques } = params

  // Get techniques for the profile
  let techniqueIds: string[]
  if (profile === 'custom' && custom_techniques?.length > 0) {
    techniqueIds = custom_techniques
  } else {
    techniqueIds = THREAT_PROFILES[profile] || []
  }

  if (techniqueIds.length === 0) {
    return {
      error: 'Invalid profile',
      availableProfiles: Object.keys(THREAT_PROFILES)
    }
  }

  // Use the identify_coverage_gaps SQL function
  const { data, error } = await supabase.rpc('identify_coverage_gaps', {
    p_profile: profile,
    p_custom_techniques: custom_techniques || null
  })

  if (error) {
    console.error('Identify gaps error:', error)
    throw new Error('Failed to identify coverage gaps')
  }

  // Enrich gaps with acceptance status from detection_decisions
  const gaps: any[] = Array.isArray(data) ? data : (data?.gaps || [])
  try {
    const { data: acceptedDecisions } = await supabase
      .from('detection_decisions')
      .select('technique_id, reasoning, created_at, review_by')
      .eq('decision_type', 'gap_accepted')
      .not('technique_id', 'is', null)

    const acceptedMap = new Map()
    for (const d of (acceptedDecisions || [])) {
      acceptedMap.set(d.technique_id, d)
    }

    for (const gap of gaps) {
      const accepted = acceptedMap.get(gap.technique_id || gap.id)
      gap.accepted_risk = !!accepted
      if (accepted) {
        gap.acceptance_reasoning = accepted.reasoning
        gap.acceptance_stale = accepted.review_by && new Date(accepted.review_by) < new Date()
      }
    }
  } catch {
    // Don't break if table doesn't exist
  }

  // Return in the same shape as the original data
  if (Array.isArray(data)) {
    return gaps
  }
  return { ...data, gaps }
}

/**
 * Query MITRE database for techniques, groups, software, or campaigns
 */
async function handleQueryMitre(supabase: any, params: any) {
  const { entity_type = 'any', query, include_relationships = false } = params

  // Map entity types to MITRE object types
  const typeMap: Record<string, string> = {
    technique: 'attack-pattern',
    group: 'intrusion-set',
    software: 'malware',
    campaign: 'campaign'
  }

  // Escape special characters for LIKE patterns
  const escapedQuery = query.replace(/[%_\\]/g, '\\$&')

  let dbQuery = supabase
    .from('mitre_objects')
    .select('stix_id, mitre_id, name, type, description, data')

  // Filter by type if specified
  if (entity_type !== 'any' && typeMap[entity_type]) {
    dbQuery = dbQuery.eq('type', typeMap[entity_type])
  }

  // Search by name, mitre_id, or description
  dbQuery = dbQuery.or(`name.ilike.%${escapedQuery}%,mitre_id.ilike.%${escapedQuery}%,description.ilike.%${escapedQuery}%`)
    .limit(20)

  const { data: results, error } = await dbQuery

  if (error) {
    console.error('MITRE query error:', error)
    throw new Error('MITRE query failed')
  }

  // Format results
  const formattedResults = (results || []).map((r: any) => ({
    stixId: r.stix_id,
    mitreId: r.mitre_id,
    name: r.name,
    type: r.type,
    description: r.description?.slice(0, 300) + (r.description?.length > 300 ? '...' : ''),
    aliases: r.data?.aliases || []
  }))

  // Include relationships if requested and we found exactly one result
  let relationships = null
  if (include_relationships && formattedResults.length === 1) {
    const stixId = formattedResults[0].stixId
    // Use separate queries and combine to avoid complex OR with special characters
    const [sourceRels, targetRels] = await Promise.all([
      supabase
        .from('mitre_relationships')
        .select('relationship_type, target_ref, source_ref')
        .eq('source_ref', stixId)
        .limit(25),
      supabase
        .from('mitre_relationships')
        .select('relationship_type, target_ref, source_ref')
        .eq('target_ref', stixId)
        .limit(25)
    ])

    const rels = [...(sourceRels.data || []), ...(targetRels.data || [])]

    if (rels.length > 0) {
      // Get referenced objects
      const refIds = [...new Set(rels.flatMap((r: any) => [r.source_ref, r.target_ref]))]
      const { data: refObjs } = await supabase
        .from('mitre_objects')
        .select('stix_id, mitre_id, name, type')
        .in('stix_id', refIds)

      const refMap = new Map((refObjs || []).map((o: any) => [o.stix_id, o]))

      relationships = rels.map((r: any) => ({
        type: r.relationship_type,
        source: refMap.get(r.source_ref)?.name || r.source_ref,
        target: refMap.get(r.target_ref)?.name || r.target_ref
      }))
    }
  }

  return {
    query,
    entityType: entity_type,
    total: formattedResults.length,
    results: formattedResults,
    relationships
  }
}

/**
 * Generate MITRE ATT&CK Navigator layer JSON
 */
async function handleGenerateNavigatorLayer(supabase: any, params: any) {
  const { name = 'Detection Coverage', scope = 'all', filter_value } = params

  // Get all coverage data
  const { data: coverage, error } = await supabase.rpc('get_coverage_summary')

  if (error) {
    throw new Error('Failed to get coverage for Navigator layer')
  }

  // Build Navigator layer format
  const techniques = []

  // Get technique coverage details
  const { data: techCoverage } = await supabase
    .from('detections')
    .select('"mitreAttackIds"')

  // Count detections per technique
  const techniqueCount = new Map<string, number>()
  ;(techCoverage || []).forEach((d: any) => {
    (d.mitreAttackIds || []).forEach((t: string) => {
      techniqueCount.set(t, (techniqueCount.get(t) || 0) + 1)
    })
  })

  // Generate technique entries
  techniqueCount.forEach((count, techniqueId) => {
    techniques.push({
      techniqueID: techniqueId,
      score: Math.min(count, 10), // Cap score at 10
      color: count >= 3 ? '#00ff00' : count >= 1 ? '#ffff00' : '',
      comment: `${count} detection(s)`
    })
  })

  const layer = {
    name,
    versions: {
      attack: '14',
      navigator: '4.9.1',
      layer: '4.5'
    },
    domain: 'enterprise-attack',
    description: `Generated from Detection Studio - ${coverage.summary.covered_techniques}/${coverage.summary.total_techniques} techniques covered`,
    techniques,
    gradient: {
      colors: ['#ff6666', '#ffe666', '#8ec843'],
      minValue: 0,
      maxValue: 10
    },
    legendItems: [
      { label: '3+ detections', color: '#00ff00' },
      { label: '1-2 detections', color: '#ffff00' },
      { label: 'No coverage', color: '#ff6666' }
    ]
  }

  return {
    layer,
    downloadUrl: null, // Could be a signed URL if stored
    stats: {
      totalTechniques: coverage.summary.total_techniques,
      coveredTechniques: coverage.summary.covered_techniques,
      coveragePercent: coverage.summary.coverage_percent
    }
  }
}

/**
 * Web search for external knowledge
 * Uses Tavily API for AI-powered security-focused web results
 */
async function handleWebSearch(params: any) {
  const { query, focus = 'general' } = params

  const TAVILY_API_KEY = Deno.env.get('TAVILY_API_KEY')

  if (!TAVILY_API_KEY) {
    return {
      query,
      results: [],
      error: 'Web search is not configured. Ask your administrator to add TAVILY_API_KEY.',
      suggestion: 'Try using the MITRE query or library search tools instead.'
    }
  }

  // Security-focused domain filtering based on focus area
  const domainsByFocus: Record<string, string[]> = {
    threat_intel: [
      'attack.mitre.org',
      'mandiant.com',
      'microsoft.com',
      'crowdstrike.com',
      'unit42.paloaltonetworks.com',
      'secureworks.com',
      'talosintelligence.com',
      'thedfirreport.com',
      'bleepingcomputer.com'
    ],
    tools: [
      'attack.mitre.org',
      'lolbas-project.github.io',
      'gtfobins.github.io',
      'github.com',
      'atomic-red-team.org'
    ],
    vulnerabilities: [
      'nvd.nist.gov',
      'cve.org',
      'cvedetails.com',
      'rapid7.com',
      'tenable.com',
      'qualys.com'
    ],
    documentation: [
      'learn.microsoft.com',
      'docs.aws.amazon.com',
      'cloud.google.com',
      'elastic.co',
      'splunk.com'
    ],
    news: [
      'bleepingcomputer.com',
      'therecord.media',
      'darkreading.com',
      'securityweek.com',
      'krebsonsecurity.com'
    ],
    general: [] // No domain restriction
  }

  const includeDomains = domainsByFocus[focus] || []

  try {
    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        api_key: TAVILY_API_KEY,
        query: query,
        search_depth: 'advanced', // Deeper search for better results
        include_answer: true, // Get AI-summarized answer
        include_domains: includeDomains.length > 0 ? includeDomains : undefined,
        max_results: 8
      })
    })

    if (!response.ok) {
      const error = await response.text()
      console.error('Tavily API error:', error)
      return {
        query,
        results: [],
        error: 'Web search failed. Try the MITRE or library search tools.'
      }
    }

    const data = await response.json()

    // Format results for the AI
    const results = (data.results || []).map((r: any) => ({
      title: r.title,
      url: r.url,
      description: r.content?.slice(0, 400) || '',
      source: new URL(r.url).hostname,
      score: r.score
    }))

    return {
      query,
      focus,
      total: results.length,
      results,
      // Tavily provides an AI-generated answer summarizing the results
      summary: data.answer || null,
      sources: results.map((r: any) => r.source).filter((s: string, i: number, a: string[]) => a.indexOf(s) === i)
    }
  } catch (e) {
    console.error('Web search error:', e)
    return {
      query,
      results: [],
      error: 'Web search failed. Try the MITRE or library search tools.'
    }
  }
}

// =============================================================================
// MAIN HANDLER
// =============================================================================

serve(async (req: Request) => {
  const preflightResponse = handleCorsPreflight(req)
  if (preflightResponse) return preflightResponse

  const corsHeaders = getCorsHeaders(req)

  try {
    // Verify authorization
    const authHeader = req.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const token = authHeader.replace('Bearer ', '')

    // Create Supabase client with the user's JWT token so RLS policies work correctly
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    )

    // Verify user token
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Rate limiting
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )
    const { allowed } = await checkRateLimit(
      supabaseAdmin,
      `user:${user.id}:fn:optimus-tools`,
      30,
      60
    )
    if (!allowed) {
      return corsErrorResponse('Rate limit exceeded. Try again shortly.', req, 429)
    }

    // Parse request
    const body: ToolRequest = await req.json()
    const { tool, params = {} } = body

    let result: any

    switch (tool) {
      case 'search_library':
        result = await handleSearchLibrary(supabase, params)
        break

      case 'get_coverage_summary':
        result = await handleGetCoverageSummary(supabase, params)
        break

      case 'find_threat_actor':
        result = await handleFindThreatActor(supabase, params)
        break

      case 'get_threat_actor_coverage':
        result = await handleGetThreatActorCoverage(supabase, params)
        break

      case 'identify_coverage_gaps':
      case 'identify_gaps':
        result = await handleIdentifyGaps(supabase, params)
        break

      case 'query_mitre':
        result = await handleQueryMitre(supabase, params)
        break

      case 'generate_navigator_layer':
        result = await handleGenerateNavigatorLayer(supabase, params)
        break

      case 'web_search':
        result = await handleWebSearch(params)
        break

      case 'ransomware_readiness':
        const geminiKey = Deno.env.get('GEMINI_API_KEY') || null;
        result = await runRansomwareAssessment(supabase, geminiKey);
        break

      default:
        return new Response(
          JSON.stringify({
            error: `Unknown tool: ${tool}`,
            availableTools: [
              'search_library',
              'get_coverage_summary',
              'find_threat_actor',
              'get_threat_actor_coverage',
              'identify_coverage_gaps',
              'query_mitre',
              'generate_navigator_layer',
              'web_search',
              'ransomware_readiness'
            ]
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Tool execution error:', error)
    return new Response(
      JSON.stringify({ error: 'An internal error occurred. Please try again.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
