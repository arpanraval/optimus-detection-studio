/** Preview API exposes subTechniques for Scheduled and NRT analytics rules.
 * https://learn.microsoft.com/en-us/azure/templates/microsoft.securityinsights/2025-07-01-preview/alertrules
 */
export const SENTINEL_API_VERSION = '2025-07-01-preview';

export function sentinelAttackMapping(ids: string[] = []): { techniques: string[]; subTechniques: string[] } {
  const normalized = ids.map((value) => {
    const id = value.trim().toUpperCase();
    if (!/^T\d{4}(?:\.\d{3})?$/.test(id)) throw new Error(`Invalid ATT&CK technique ID: ${value}`);
    return id;
  });
  return {
    techniques: [...new Set(normalized.map((id) => id.split('.')[0]))],
    subTechniques: [...new Set(normalized.filter((id) => id.includes('.')))],
  };
}

export function sentinelTechniques(ids: string[] = []): string[] {
  return sentinelAttackMapping(ids).techniques;
}
