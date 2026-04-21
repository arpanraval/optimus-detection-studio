/**
 * mitreTechniqueGroups — loads MITRE technique groups from DB with in-memory cache
 * and hardcoded fallback if DB is unreachable.
 *
 * Used by packGeneratorService to determine which techniques count as "ransomware",
 * "insider threat", "cloud security", etc.
 */

import { supabase } from './supabaseClient';

export type TechniqueGroupKey = 'ransomware' | 'insider_threat' | 'cloud_security';

export interface TechniqueGroup {
  key: string;
  name: string;
  description: string | null;
  technique_ids: string[];
}

// Fallback values if DB is unreachable. Mirrors the seed data in migration
// 20260413_mitre_technique_groups.sql so the generator still works offline / before migration.
const FALLBACK_GROUPS: Record<TechniqueGroupKey, Set<string>> = {
  ransomware: new Set([
    'T1486', 'T1490', 'T1489', 'T1491', 'T1485', 'T1561', 'T1529',
    'T1021', 'T1570', 'T1059', 'T1053', 'T1047', 'T1569', 'T1078',
    'T1566', 'T1189', 'T1190', 'T1133', 'T1027', 'T1562', 'T1112',
    'T1003', 'T1082', 'T1083', 'T1135', 'T1071', 'T1105', 'T1041', 'T1048',
  ]),
  insider_threat: new Set([
    'T1078', 'T1098', 'T1136', 'T1087', 'T1069', 'T1003', 'T1552',
    'T1530', 'T1537', 'T1567', 'T1048', 'T1041', 'T1020', 'T1074',
    'T1119', 'T1213', 'T1005', 'T1039', 'T1114', 'T1565',
  ]),
  cloud_security: new Set([
    'T1078', 'T1098', 'T1136', 'T1190', 'T1133', 'T1530', 'T1537',
    'T1578', 'T1580', 'T1538', 'T1526', 'T1613', 'T1610', 'T1552',
    'T1550', 'T1087', 'T1069', 'T1562', 'T1535', 'T1496',
  ]),
};

// Cache keyed by group key, populated on first successful DB load
let cache: Map<string, Set<string>> | null = null;
let loadPromise: Promise<Map<string, Set<string>>> | null = null;

async function loadFromDb(): Promise<Map<string, Set<string>>> {
  const map = new Map<string, Set<string>>();
  try {
    const { data, error } = await supabase
      .from('mitre_technique_groups')
      .select('key, technique_ids');

    if (error || !data) {
      // Fall back to hardcoded
      for (const [key, set] of Object.entries(FALLBACK_GROUPS)) {
        map.set(key, set);
      }
      return map;
    }

    for (const row of data) {
      map.set(row.key, new Set(row.technique_ids || []));
    }

    // Ensure all fallback keys are present even if DB doesn't have them
    for (const [key, set] of Object.entries(FALLBACK_GROUPS)) {
      if (!map.has(key)) {
        map.set(key, set);
      }
    }
  } catch {
    // Total failure → use fallback
    for (const [key, set] of Object.entries(FALLBACK_GROUPS)) {
      map.set(key, set);
    }
  }
  return map;
}

/**
 * Ensure technique groups are loaded into the cache.
 * Safe to call multiple times — dedupes concurrent loads.
 */
export async function ensureTechniqueGroupsLoaded(): Promise<Map<string, Set<string>>> {
  if (cache) return cache;
  if (loadPromise) return loadPromise;

  loadPromise = loadFromDb().then((map) => {
    cache = map;
    loadPromise = null;
    return map;
  });

  return loadPromise;
}

/**
 * Get a technique set by key. Returns fallback if cache is empty.
 */
export function getTechniqueGroupSync(key: TechniqueGroupKey): Set<string> {
  if (cache) {
    return cache.get(key) || FALLBACK_GROUPS[key];
  }
  return FALLBACK_GROUPS[key];
}

/**
 * Force a cache refresh (e.g., after admin updates a group).
 */
export function invalidateTechniqueGroupCache(): void {
  cache = null;
  loadPromise = null;
}
