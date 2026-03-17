/**
 * Shared normalization functions for MITRE ATT&CK data formats.
 *
 * Supabase views may return tactics and platforms in varying shapes
 * (JSON string, array of objects with different key names, etc.).
 * These helpers coerce them into a canonical form used by the UI.
 */

/** Normalize tactics from various possible formats returned by views/queries. */
export function normalizeTactics(tactics: any): Array<{ stix_id: string; shortname: string }> {
  if (!tactics) return [];

  // If it's a string, try to parse it
  let parsed = tactics;
  if (typeof tactics === 'string') {
    try {
      parsed = JSON.parse(tactics);
    } catch {
      return [];
    }
  }

  // If it's not an array, return empty
  if (!Array.isArray(parsed)) return [];

  // Normalize each tactic object to expected format
  return parsed.map((t: any) => ({
    stix_id: t.stix_id || t.tactic_stix_id || '',
    shortname: t.shortname || t.tactic_shortname || t.phase_name || ''
  })).filter((t: any) => t.shortname); // Filter out empty entries
}

/** Normalize platforms from various possible formats returned by views/queries. */
export function normalizePlatforms(platforms: any): string[] {
  if (!platforms) return [];
  if (typeof platforms === 'string') {
    try {
      return JSON.parse(platforms);
    } catch {
      return [];
    }
  }
  return Array.isArray(platforms) ? platforms : [];
}
