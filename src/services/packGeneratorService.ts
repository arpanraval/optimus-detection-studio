/**
 * packGeneratorService.ts
 *
 * Client-side dynamic pack generation from library detections.
 * Groups detections by tactic, platform/technology, threat actor, campaign,
 * and ransomware-associated techniques. Minimum 3 detections per pack.
 */

import { supabase } from '../lib/supabaseClient';
import type { Detection } from '../types';

// ============================================================================
// TYPES
// ============================================================================

export type PackType = 'tactic' | 'technology' | 'threat_actor' | 'campaign' | 'ransomware';

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
}

/** Minimum detections required to form a pack */
const MIN_DETECTIONS_PER_PACK = 3;

// Well-known MITRE ATT&CK technique IDs commonly associated with ransomware operations.
const RANSOMWARE_TECHNIQUE_IDS = new Set([
  'T1486', // Data Encrypted for Impact
  'T1490', // Inhibit System Recovery
  'T1489', // Service Stop
  'T1491', // Defacement (ransom note)
  'T1485', // Data Destruction
  'T1561', // Disk Wipe
  'T1529', // System Shutdown/Reboot
  'T1021', // Remote Services (lateral movement)
  'T1570', // Lateral Tool Transfer
  'T1059', // Command and Scripting Interpreter
  'T1053', // Scheduled Task/Job
  'T1047', // Windows Management Instrumentation
  'T1569', // System Services
  'T1078', // Valid Accounts
  'T1566', // Phishing (initial access)
  'T1189', // Drive-by Compromise
  'T1190', // Exploit Public-Facing Application
  'T1133', // External Remote Services
  'T1027', // Obfuscated Files or Information
  'T1562', // Impair Defenses
  'T1112', // Modify Registry
  'T1003', // OS Credential Dumping
  'T1082', // System Information Discovery
  'T1083', // File and Directory Discovery
  'T1135', // Network Share Discovery
  'T1071', // Application Layer Protocol (C2)
  'T1105', // Ingress Tool Transfer
  'T1041', // Exfiltration Over C2 Channel
  'T1048', // Exfiltration Over Alternative Protocol
]);

const TACTIC_ICONS: Record<string, string> = {
  'Reconnaissance': '🔍',
  'Resource Development': '🏗️',
  'Initial Access': '🚪',
  'Execution': '⚡',
  'Persistence': '📌',
  'Privilege Escalation': '⬆️',
  'Defense Evasion': '🛡️',
  'Credential Access': '🔑',
  'Discovery': '🗺️',
  'Lateral Movement': '🔀',
  'Collection': '📦',
  'Command and Control': '📡',
  'Exfiltration': '📤',
  'Impact': '💥',
};

const PACK_TYPE_ICONS: Record<PackType, string> = {
  tactic: '🎯',
  technology: '💻',
  threat_actor: '👤',
  campaign: '🎪',
  ransomware: '🔒',
};

// ============================================================================
// GROUPING HELPERS
// ============================================================================

function groupByTactic(detections: Detection[]): PackCandidate[] {
  const tacticMap = new Map<string, Detection[]>();

  for (const d of detections) {
    const tactics = d.mitreTactics || [];
    for (const tactic of tactics) {
      const key = tactic.trim();
      if (!key) continue;
      if (!tacticMap.has(key)) tacticMap.set(key, []);
      tacticMap.get(key)!.push(d);
    }
  }

  const packs: PackCandidate[] = [];
  for (const [tactic, dets] of tacticMap) {
    if (dets.length < MIN_DETECTIONS_PER_PACK) continue;

    const uniqueIds = [...new Set(dets.map(d => d.id))];
    const techniques = [...new Set(dets.flatMap(d => d.mitreAttackIds || []))];
    const platforms = [...new Set(dets.flatMap(d => d.platforms || []))];

    packs.push({
      name: `${tactic} Detections`,
      description: `Auto-generated pack covering the ${tactic} tactic with ${uniqueIds.length} detection rules across ${techniques.length} techniques.`,
      pack_type: 'tactic',
      icon: TACTIC_ICONS[tactic] || PACK_TYPE_ICONS.tactic,
      tags: ['auto-generated', 'tactic', tactic.toLowerCase().replace(/\s+/g, '-')],
      mitre_technique_ids: techniques,
      platforms,
      detection_ids: uniqueIds,
      generation_criteria: { groupBy: 'tactic', value: tactic },
      coverage_percent: Math.min(100, Math.round((techniques.length / 30) * 100)),
    });
  }

  return packs;
}

function groupByPlatform(detections: Detection[]): PackCandidate[] {
  const platformMap = new Map<string, Detection[]>();

  for (const d of detections) {
    const platforms = d.platforms || [];
    for (const platform of platforms) {
      const key = platform.trim();
      if (!key) continue;
      if (!platformMap.has(key)) platformMap.set(key, []);
      platformMap.get(key)!.push(d);
    }
  }

  const packs: PackCandidate[] = [];
  for (const [platform, dets] of platformMap) {
    if (dets.length < MIN_DETECTIONS_PER_PACK) continue;

    const uniqueIds = [...new Set(dets.map(d => d.id))];
    const techniques = [...new Set(dets.flatMap(d => d.mitreAttackIds || []))];

    packs.push({
      name: `${platform} Protection Pack`,
      description: `Auto-generated pack with ${uniqueIds.length} detections targeting the ${platform} platform, covering ${techniques.length} MITRE techniques.`,
      pack_type: 'technology',
      icon: PACK_TYPE_ICONS.technology,
      tags: ['auto-generated', 'platform', platform.toLowerCase().replace(/\s+/g, '-')],
      mitre_technique_ids: techniques,
      platforms: [platform],
      detection_ids: uniqueIds,
      generation_criteria: { groupBy: 'platform', value: platform },
      coverage_percent: Math.min(100, Math.round((techniques.length / 30) * 100)),
    });
  }

  return packs;
}

function groupByThreatActor(detections: Detection[]): PackCandidate[] {
  const actorMap = new Map<string, Detection[]>();

  for (const d of detections) {
    const groups = d.linkedGroups || [];
    for (const group of groups) {
      const key = group.name || group.mitre_id;
      if (!key) continue;
      if (!actorMap.has(key)) actorMap.set(key, []);
      actorMap.get(key)!.push(d);
    }
  }

  const packs: PackCandidate[] = [];
  for (const [actor, dets] of actorMap) {
    if (dets.length < MIN_DETECTIONS_PER_PACK) continue;

    const uniqueIds = [...new Set(dets.map(d => d.id))];
    const techniques = [...new Set(dets.flatMap(d => d.mitreAttackIds || []))];
    const platforms = [...new Set(dets.flatMap(d => d.platforms || []))];
    const mitreId = dets[0]?.linkedGroups?.find(g => g.name === actor)?.mitre_id;

    packs.push({
      name: `${actor} Threat Actor Pack`,
      description: `Auto-generated pack with ${uniqueIds.length} detections associated with threat actor ${actor}${mitreId ? ` (${mitreId})` : ''}.`,
      pack_type: 'threat_actor',
      icon: PACK_TYPE_ICONS.threat_actor,
      tags: ['auto-generated', 'threat-actor', actor.toLowerCase().replace(/\s+/g, '-')],
      mitre_technique_ids: techniques,
      platforms,
      detection_ids: uniqueIds,
      generation_criteria: { groupBy: 'threat_actor', value: actor, mitre_id: mitreId },
      coverage_percent: Math.min(100, Math.round((techniques.length / 20) * 100)),
    });
  }

  return packs;
}

function groupByCampaign(detections: Detection[]): PackCandidate[] {
  const campaignMap = new Map<string, Detection[]>();

  for (const d of detections) {
    const campaigns = d.linkedCampaigns || [];
    for (const campaign of campaigns) {
      const key = campaign.name || campaign.mitre_id;
      if (!key) continue;
      if (!campaignMap.has(key)) campaignMap.set(key, []);
      campaignMap.get(key)!.push(d);
    }
  }

  const packs: PackCandidate[] = [];
  for (const [campaign, dets] of campaignMap) {
    if (dets.length < MIN_DETECTIONS_PER_PACK) continue;

    const uniqueIds = [...new Set(dets.map(d => d.id))];
    const techniques = [...new Set(dets.flatMap(d => d.mitreAttackIds || []))];
    const platforms = [...new Set(dets.flatMap(d => d.platforms || []))];
    const mitreId = dets[0]?.linkedCampaigns?.find(c => c.name === campaign)?.mitre_id;

    packs.push({
      name: `${campaign} Campaign Pack`,
      description: `Auto-generated pack with ${uniqueIds.length} detections associated with campaign ${campaign}${mitreId ? ` (${mitreId})` : ''}.`,
      pack_type: 'campaign',
      icon: PACK_TYPE_ICONS.campaign,
      tags: ['auto-generated', 'campaign', campaign.toLowerCase().replace(/\s+/g, '-')],
      mitre_technique_ids: techniques,
      platforms,
      detection_ids: uniqueIds,
      generation_criteria: { groupBy: 'campaign', value: campaign, mitre_id: mitreId },
      coverage_percent: Math.min(100, Math.round((techniques.length / 15) * 100)),
    });
  }

  return packs;
}

function groupByRansomware(detections: Detection[]): PackCandidate[] {
  const ransomwareDetections = detections.filter(d => {
    const techIds = d.mitreAttackIds || [];
    // Match if any technique ID starts with one of the ransomware IDs
    // (handles sub-techniques like T1059.001)
    return techIds.some(id => {
      const base = id.split('.')[0];
      return RANSOMWARE_TECHNIQUE_IDS.has(base);
    });
  });

  if (ransomwareDetections.length < MIN_DETECTIONS_PER_PACK) return [];

  const uniqueIds = [...new Set(ransomwareDetections.map(d => d.id))];
  const techniques = [...new Set(ransomwareDetections.flatMap(d => d.mitreAttackIds || []))];
  const platforms = [...new Set(ransomwareDetections.flatMap(d => d.platforms || []))];
  const matchedRansomwareTechniques = techniques.filter(id => {
    const base = id.split('.')[0];
    return RANSOMWARE_TECHNIQUE_IDS.has(base);
  });

  return [{
    name: 'Ransomware Defense Pack',
    description: `Auto-generated pack with ${uniqueIds.length} detections covering ${matchedRansomwareTechniques.length} ransomware-associated techniques across the kill chain.`,
    pack_type: 'ransomware',
    icon: PACK_TYPE_ICONS.ransomware,
    tags: ['auto-generated', 'ransomware', 'critical-threat'],
    mitre_technique_ids: techniques,
    platforms,
    detection_ids: uniqueIds,
    generation_criteria: {
      groupBy: 'ransomware',
      matched_technique_count: matchedRansomwareTechniques.length,
      total_ransomware_techniques: RANSOMWARE_TECHNIQUE_IDS.size,
    },
    coverage_percent: Math.min(100, Math.round((matchedRansomwareTechniques.length / RANSOMWARE_TECHNIQUE_IDS.size) * 100)),
  }];
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Generate pack candidates from a set of detections.
 * Groups by tactic, platform, threat actor, campaign, and ransomware.
 * Returns only packs with >= MIN_DETECTIONS_PER_PACK detections.
 */
export function generatePacks(detections: Detection[]): PackCandidate[] {
  if (!detections || detections.length === 0) return [];

  const candidates: PackCandidate[] = [
    ...groupByTactic(detections),
    ...groupByPlatform(detections),
    ...groupByThreatActor(detections),
    ...groupByCampaign(detections),
    ...groupByRansomware(detections),
  ];

  // Sort by detection count descending
  candidates.sort((a, b) => b.detection_ids.length - a.detection_ids.length);

  return candidates;
}

/**
 * Save generated pack candidates to Supabase.
 * Inserts into detection_packs and pack_detections junction table.
 */
export async function savePacks(
  candidates: PackCandidate[],
  userId: string,
): Promise<{ saved: number; errors: string[] }> {
  const errors: string[] = [];
  let saved = 0;

  for (const candidate of candidates) {
    try {
      // Insert the pack
      const { data: pack, error: packError } = await supabase
        .from('detection_packs')
        .insert({
          name: candidate.name,
          description: candidate.description,
          icon: candidate.icon,
          tags: candidate.tags,
          mitre_technique_ids: candidate.mitre_technique_ids,
          platforms: candidate.platforms,
          rule_count: candidate.detection_ids.length,
          source: 'custom',
          is_active: true,
          created_by: userId,
          pack_type: candidate.pack_type,
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

      // Insert junction table records
      const junctionRecords = candidate.detection_ids.map(detectionId => ({
        pack_id: pack.id,
        detection_id: detectionId,
      }));

      // Batch in chunks of 100 to avoid payload limits
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

  return { saved, errors };
}

/**
 * Delete all auto-generated packs for a given user.
 * Uses the 'auto-generated' tag to identify packs.
 */
export async function deleteAutoGeneratedPacks(userId: string): Promise<{ deleted: number; error?: string }> {
  try {
    // Find auto-generated packs by this user
    const { data: packs, error: fetchError } = await supabase
      .from('detection_packs')
      .select('id')
      .eq('created_by', userId)
      .contains('tags', ['auto-generated']);

    if (fetchError) throw fetchError;
    if (!packs || packs.length === 0) return { deleted: 0 };

    const packIds = packs.map(p => p.id);

    // Delete junction table entries
    for (const packId of packIds) {
      await supabase.from('pack_detections').delete().eq('pack_id', packId);
    }

    // Delete the packs
    const { error: deleteError } = await supabase
      .from('detection_packs')
      .delete()
      .in('id', packIds);

    if (deleteError) throw deleteError;

    return { deleted: packIds.length };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { deleted: 0, error: msg };
  }
}
