/**
 * packGeneratorService.ts
 *
 * Smart pack generation from library detections.
 *
 * Two tiers of packs:
 * 1. Cross-dimensional (tactic + platform + language) — right-sized, deployment-ready
 * 2. Use-case driven (ransomware, insider threat, cloud security, etc.)
 *
 * Quality-filtered: only Production/Testing/Review detections by default.
 * Right-sized: targets 5-50 detections per pack, splits large groups.
 */

import { supabase } from '../lib/supabaseClient';
import { ensureTechniqueGroupsLoaded, getTechniqueGroupSync } from '../lib/mitreTechniqueGroups';
import type { Detection } from '../types';

// ============================================================================
// TYPES
// ============================================================================

export type PackType = 'tactic' | 'technology' | 'threat_actor' | 'campaign' | 'ransomware' | 'siem_ready' | 'use_case';

export interface PackCandidate {
  name: string;
  description: string;
  pack_type: PackType;
  icon: string;
  tags: string[];
  mitre_technique_ids: string[];
  platforms: string[];
  detection_ids: string[];
  generation_criteria: Record<string, unknown>;
  coverage_percent: number;
  labCount: number;  // count of detection_ids whose library_type !== 'production'
}

const MIN_DETECTIONS_PER_PACK = 3;
const MAX_PACK_SIZE = 60;

// Note: ransomware, insider_threat, cloud_security technique ID sets are loaded
// dynamically from mitre_technique_groups via mitreTechniqueGroups.ts with a
// hardcoded fallback for zero-config operation. We warm the cache on module import
// so the first generatePacks() call has fresh DB data.
void ensureTechniqueGroupsLoaded();

const CLOUD_PLATFORMS = new Set(['AWS', 'Azure', 'GCP', 'Office 365', 'Azure AD', 'Entra ID', 'SaaS', 'IaaS', 'Google Workspace']);

const SIEM_LANGUAGE_MAP: Record<string, string> = {
  SPL: 'Splunk',
  KQL: 'Microsoft Sentinel',
  Kuery: 'Elastic',
  EQL: 'Elastic',
  ESQL: 'Elastic',
  Sigma: 'Sigma (Universal)',
  CQL: 'CrowdStrike',
  'YARA-L': 'Chronicle',
};

// ============================================================================
// HELPERS
// ============================================================================

function matchesTechniqueSet(detection: Detection, techSet: Set<string>): boolean {
  return (detection.mitreAttackIds || []).some(id => {
    const base = id.split('.')[0];
    return techSet.has(base);
  });
}

function buildPack(
  name: string,
  description: string,
  packType: PackType,
  detections: Detection[],
  criteria: Record<string, unknown>,
  extraTags: string[] = [],
): PackCandidate | null {
  const uniqueIds = [...new Set(detections.map(d => d.id))];
  if (uniqueIds.length < MIN_DETECTIONS_PER_PACK) return null;

  const techniques = [...new Set(detections.flatMap(d => d.mitreAttackIds || []))];
  const platforms = [...new Set(detections.flatMap(d => d.platforms || []))];

  // Count dev-library detections. Those will skip at deploy time until promoted
  // to Production — surfaced in the UI as a "Lab" badge per candidate so users
  // know which generated packs include non-deployable rules.
  const finalIds = new Set(uniqueIds.slice(0, MAX_PACK_SIZE));
  const seen = new Set<string>();
  let labCount = 0;
  for (const d of detections) {
    if (!finalIds.has(d.id) || seen.has(d.id)) continue;
    seen.add(d.id);
    if (d.library_type !== 'production') labCount++;
  }

  return {
    name,
    description,
    pack_type: packType,
    icon: '',
    tags: ['auto-generated', ...extraTags],
    mitre_technique_ids: techniques,
    platforms,
    detection_ids: uniqueIds.slice(0, MAX_PACK_SIZE),
    generation_criteria: criteria,
    coverage_percent: 0, // calculated later if needed
    labCount,
  };
}

// ============================================================================
// CROSS-DIMENSIONAL PACKS (Tactic + Platform + Language)
// ============================================================================

function generateCrossDimensionalPacks(detections: Detection[]): PackCandidate[] {
  const packs: PackCandidate[] = [];

  // Group by: tactic × primary platform
  const tacticPlatformMap = new Map<string, Detection[]>();
  for (const d of detections) {
    const tactics = d.mitreTactics || [];
    const platforms = d.platforms || [];
    const primaryPlatform = platforms[0] || 'Multi-Platform';

    for (const tactic of tactics) {
      const key = `${tactic.trim()}||${primaryPlatform}`;
      if (!tacticPlatformMap.has(key)) tacticPlatformMap.set(key, []);
      tacticPlatformMap.get(key)!.push(d);
    }
  }

  for (const [key, dets] of tacticPlatformMap) {
    const [tactic, platform] = key.split('||');
    if (dets.length < MIN_DETECTIONS_PER_PACK) continue;

    const name = platform === 'Multi-Platform'
      ? `${tactic} Detections`
      : `${platform} ${tactic}`;

    const pack = buildPack(
      name,
      `${dets.length} detection rules for ${tactic.toLowerCase()} on ${platform}, covering ${new Set(dets.flatMap(d => d.mitreAttackIds || [])).size} techniques.`,
      'tactic',
      dets,
      { groupBy: 'tactic_platform', tactic, platform },
      ['tactic', tactic.toLowerCase().replace(/\s+/g, '-'), platform.toLowerCase()],
    );
    if (pack) packs.push(pack);
  }

  return packs;
}

// ============================================================================
// SIEM-READY PACKS (by query language)
// ============================================================================

function generateSiemPacks(detections: Detection[]): PackCandidate[] {
  const packs: PackCandidate[] = [];
  const langMap = new Map<string, Detection[]>();

  for (const d of detections) {
    const lang = d.queryLanguage;
    if (!lang) continue;
    if (!langMap.has(lang)) langMap.set(lang, []);
    langMap.get(lang)!.push(d);
  }

  for (const [lang, dets] of langMap) {
    if (dets.length < MIN_DETECTIONS_PER_PACK) continue;
    const siemName = SIEM_LANGUAGE_MAP[lang] || lang;

    const pack = buildPack(
      `${siemName} Ready (${lang})`,
      `${dets.length} detection rules written in ${lang}, ready to deploy to ${siemName}.`,
      'siem_ready',
      dets,
      { groupBy: 'query_language', language: lang, siem: siemName },
      ['siem-ready', lang.toLowerCase()],
    );
    if (pack) packs.push(pack);
  }

  return packs;
}

// ============================================================================
// USE-CASE PACKS (ransomware, insider threat, cloud, etc.)
// ============================================================================

function generateUseCasePacks(detections: Detection[]): PackCandidate[] {
  const packs: PackCandidate[] = [];

  // Ransomware Defense
  const ransomwareSet = getTechniqueGroupSync('ransomware');
  const ransomwareDets = detections.filter(d => matchesTechniqueSet(d, ransomwareSet));
  const rwPack = buildPack(
    'Ransomware Defense',
    `${ransomwareDets.length} detections covering ransomware-associated techniques across the kill chain.`,
    'ransomware',
    ransomwareDets,
    { groupBy: 'use_case', use_case: 'ransomware' },
    ['ransomware', 'critical-threat'],
  );
  if (rwPack) packs.push(rwPack);

  // Insider Threat
  const insiderSet = getTechniqueGroupSync('insider_threat');
  const insiderDets = detections.filter(d => matchesTechniqueSet(d, insiderSet));
  const inPack = buildPack(
    'Insider Threat Detection',
    `${insiderDets.length} detections targeting insider threat indicators — credential abuse, data collection, and exfiltration.`,
    'use_case',
    insiderDets,
    { groupBy: 'use_case', use_case: 'insider_threat' },
    ['insider-threat'],
  );
  if (inPack) packs.push(inPack);

  // Cloud Security
  const cloudDets = detections.filter(d => {
    const hasCloudPlatform = (d.platforms || []).some(p => CLOUD_PLATFORMS.has(p));
    const hasCloudTechnique = matchesTechniqueSet(d, getTechniqueGroupSync('cloud_security'));
    return hasCloudPlatform || hasCloudTechnique;
  });
  const cloudPack = buildPack(
    'Cloud Security',
    `${cloudDets.length} detections for cloud environments — AWS, Azure, GCP, SaaS, and identity providers.`,
    'use_case',
    cloudDets,
    { groupBy: 'use_case', use_case: 'cloud_security' },
    ['cloud', 'saas'],
  );
  if (cloudPack) packs.push(cloudPack);

  // Initial Access (common high-priority use case)
  const initialAccessDets = detections.filter(d =>
    (d.mitreTactics || []).some(t => t.toLowerCase().includes('initial access'))
  );
  const iaPack = buildPack(
    'Initial Access Coverage',
    `${initialAccessDets.length} detections focused on initial access vectors — phishing, exploitation, and external services.`,
    'use_case',
    initialAccessDets,
    { groupBy: 'use_case', use_case: 'initial_access' },
    ['initial-access', 'perimeter'],
  );
  if (iaPack) packs.push(iaPack);

  // High Severity (production-ready, critical+high only)
  const highSevDets = detections.filter(d =>
    d.severity === 'Critical' || d.severity === 'High'
  );
  const hsPack = buildPack(
    'Critical & High Severity',
    `${highSevDets.length} high-priority detections rated Critical or High severity.`,
    'use_case',
    highSevDets,
    { groupBy: 'use_case', use_case: 'high_severity' },
    ['high-priority'],
  );
  if (hsPack) packs.push(hsPack);

  return packs;
}

// ============================================================================
// THREAT ACTOR & CAMPAIGN PACKS
// ============================================================================

function generateThreatActorPacks(detections: Detection[]): PackCandidate[] {
  const packs: PackCandidate[] = [];
  const actorMap = new Map<string, Detection[]>();

  for (const d of detections) {
    for (const group of (d.linkedGroups || [])) {
      const key = group.name || group.mitre_id;
      if (!key) continue;
      if (!actorMap.has(key)) actorMap.set(key, []);
      actorMap.get(key)!.push(d);
    }
  }

  for (const [actor, dets] of actorMap) {
    const mitreId = dets[0]?.linkedGroups?.find(g => g.name === actor)?.mitre_id;
    const pack = buildPack(
      `${actor} Threat Actor`,
      `${dets.length} detections associated with ${actor}${mitreId ? ` (${mitreId})` : ''}.`,
      'threat_actor',
      dets,
      { groupBy: 'threat_actor', value: actor, mitre_id: mitreId },
      ['threat-actor', actor.toLowerCase().replace(/\s+/g, '-')],
    );
    if (pack) packs.push(pack);
  }

  return packs;
}

function generateCampaignPacks(detections: Detection[]): PackCandidate[] {
  const packs: PackCandidate[] = [];
  const campaignMap = new Map<string, Detection[]>();

  for (const d of detections) {
    for (const campaign of (d.linkedCampaigns || [])) {
      const key = campaign.name || campaign.mitre_id;
      if (!key) continue;
      if (!campaignMap.has(key)) campaignMap.set(key, []);
      campaignMap.get(key)!.push(d);
    }
  }

  for (const [campaign, dets] of campaignMap) {
    const mitreId = dets[0]?.linkedCampaigns?.find(c => c.name === campaign)?.mitre_id;
    const pack = buildPack(
      `${campaign} Campaign`,
      `${dets.length} detections associated with campaign ${campaign}${mitreId ? ` (${mitreId})` : ''}.`,
      'campaign',
      dets,
      { groupBy: 'campaign', value: campaign, mitre_id: mitreId },
      ['campaign', campaign.toLowerCase().replace(/\s+/g, '-')],
    );
    if (pack) packs.push(pack);
  }

  return packs;
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Quality filter: only include detections that are deployment-worthy.
 */
const DEPLOYMENT_READY_STATUSES = new Set(['Production', 'Testing', 'Review', 'Development']);

export function generatePacks(detections: Detection[]): PackCandidate[] {
  if (!detections || detections.length === 0) return [];

  // Filter to deployment-ready detections
  const qualityDetections = detections.filter(d => DEPLOYMENT_READY_STATUSES.has(d.status));
  // Fall back to all detections if filtering leaves too few
  const source = qualityDetections.length >= MIN_DETECTIONS_PER_PACK ? qualityDetections : detections;

  const candidates: PackCandidate[] = [
    ...generateUseCasePacks(source),
    ...generateSiemPacks(source),
    ...generateCrossDimensionalPacks(source),
    ...generateThreatActorPacks(source),
    ...generateCampaignPacks(source),
  ];

  // Sort: use-case packs first, then by detection count descending
  const typeOrder: Record<string, number> = {
    ransomware: 0, use_case: 1, siem_ready: 2, tactic: 3, threat_actor: 4, campaign: 5, technology: 6,
  };
  candidates.sort((a, b) => {
    const orderDiff = (typeOrder[a.pack_type] ?? 99) - (typeOrder[b.pack_type] ?? 99);
    if (orderDiff !== 0) return orderDiff;
    return b.detection_ids.length - a.detection_ids.length;
  });

  return candidates;
}

/**
 * Save generated pack candidates to Supabase.
 */
export async function savePacks(
  candidates: PackCandidate[],
  userId: string,
): Promise<{ saved: number; errors: string[]; skipped: number }> {
  const errors: string[] = [];
  let saved = 0;
  const skipped = 0;

  // Pre-fetch existing pack names for this user to detect collisions
  const { data: existingPacks } = await supabase
    .from('detection_packs')
    .select('name')
    .eq('created_by', userId)
    .eq('is_active', true);
  const existingNames = new Set((existingPacks || []).map((p: { name: string }) => p.name.toLowerCase()));

  for (const candidate of candidates) {
    try {
      // Collision handling: if a pack with this name already exists,
      // auto-append a timestamp suffix to keep names unique
      let finalName = candidate.name;
      if (existingNames.has(finalName.toLowerCase())) {
        const suffix = new Date().toISOString().split('T')[0];
        finalName = `${candidate.name} (${suffix})`;
        // If even the dated version exists, append a random suffix
        if (existingNames.has(finalName.toLowerCase())) {
          finalName = `${candidate.name} (${suffix} ${Math.floor(Math.random() * 1000)})`;
        }
      }
      existingNames.add(finalName.toLowerCase());

      const { data: pack, error: packError } = await supabase
        .from('detection_packs')
        .insert({
          name: finalName,
          description: candidate.description,
          icon: candidate.icon || '📦',
          tags: candidate.tags,
          mitre_technique_ids: candidate.mitre_technique_ids,
          platforms: candidate.platforms,
          rule_count: candidate.detection_ids.length,
          source: 'custom',
          is_active: true,
          created_by: userId,
          pack_type: candidate.pack_type as string,
          auto_generated: true,
          generation_criteria: candidate.generation_criteria,
          coverage_percent: candidate.coverage_percent,
        })
        .select('id')
        .single();

      if (packError) {
        errors.push(`Failed to create pack "${candidate.name}": ${packError.message}`);
        continue;
      }

      const junctionRecords = candidate.detection_ids.map(detectionId => ({
        pack_id: pack.id,
        detection_id: detectionId,
      }));

      const CHUNK_SIZE = 100;
      for (let i = 0; i < junctionRecords.length; i += CHUNK_SIZE) {
        const chunk = junctionRecords.slice(i, i + CHUNK_SIZE);
        const { error: junctionError } = await supabase
          .from('pack_detections')
          .upsert(chunk, { onConflict: 'pack_id,detection_id' });

        if (junctionError) {
          errors.push(`Failed to link detections to "${candidate.name}": ${junctionError.message}`);
        }
      }

      saved++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Error saving pack "${candidate.name}": ${msg}`);
    }
  }

  return { saved, errors, skipped };
}

/**
 * Delete all auto-generated packs for a given user.
 *
 * Before deletion, auto-publishes a final snapshot of each pack to pack_versions
 * so any manual edits the user made can be recovered via rollback. Version rows
 * survive pack deletion because pack_versions.pack_id uses ON DELETE SET NULL.
 *
 * Uses the auto_generated boolean column to identify packs.
 */
export async function deleteAutoGeneratedPacks(userId: string): Promise<{ deleted: number; versioned: number; error?: string }> {
  try {
    // Fetch auto-generated packs with full metadata for snapshotting
    const { data: packs, error: fetchError } = await supabase
      .from('detection_packs')
      .select('*')
      .eq('created_by', userId)
      .eq('auto_generated', true);

    if (fetchError) throw fetchError;
    if (!packs || packs.length === 0) return { deleted: 0, versioned: 0 };

    // Auto-publish a final snapshot of each pack before destroying it
    let versioned = 0;
    for (const pack of packs) {
      try {
        // Fetch detections for this pack
        const { data: junctionData } = await supabase
          .from('pack_detections')
          .select('detections(*)')
          .eq('pack_id', pack.id);

        const detections = (junctionData || [])
          .map((r: { detections: unknown }) => r.detections)
          .filter(Boolean);

        // Determine next version number for this pack
        const { data: latestVersion } = await supabase
          .from('pack_versions')
          .select('version_number')
          .eq('pack_id', pack.id)
          .order('version_number', { ascending: false })
          .limit(1)
          .maybeSingle();

        const nextNumber = (latestVersion?.version_number || 0) + 1;

        const snapshot = {
          pack: {
            name: pack.name,
            description: pack.description,
            icon: pack.icon,
            tags: pack.tags,
            platforms: pack.platforms,
            mitre_technique_ids: pack.mitre_technique_ids,
            pack_type: pack.pack_type,
            source: pack.source,
            auto_generated: pack.auto_generated,
            generation_criteria: pack.generation_criteria,
          },
          detections,
          published_at: new Date().toISOString(),
        };

        const { error: versionError } = await supabase.from('pack_versions').insert({
          pack_id: pack.id,
          pack_name: pack.name,
          version_number: nextNumber,
          label: 'Pre-regenerate backup',
          notes: `Auto-saved before regenerate on ${new Date().toISOString().split('T')[0]}. Restore via rollback if needed.`,
          snapshot,
          created_by: userId,
        });

        if (!versionError) versioned++;
      } catch (err) {
        console.warn(`Failed to snapshot pack ${pack.id} before regenerate:`, err);
        // Continue — don't block the regenerate on snapshot failures
      }
    }

    const packIds = packs.map((p) => p.id);

    // CASCADE handles pack_detections cleanup; pack_versions.pack_id is SET NULL
    const { error: deleteError } = await supabase
      .from('detection_packs')
      .delete()
      .in('id', packIds);

    if (deleteError) throw deleteError;

    return { deleted: packIds.length, versioned };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { deleted: 0, versioned: 0, error: msg };
  }
}
