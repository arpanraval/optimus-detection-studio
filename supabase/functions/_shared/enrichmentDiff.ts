type Intel = Record<string, unknown>;
export function canonicalIntel(value: unknown): string {
  function normalize(input: unknown): unknown {
    if (Array.isArray(input)) return input.map(normalize).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    if (input && typeof input === 'object') return Object.fromEntries(
      Object.entries(input).filter(([key]) => key !== 'enriched_at').sort(([a], [b]) => a.localeCompare(b))
        .map(([key, entry]) => [key, normalize(entry)]),
    );
    return input;
  }
  return JSON.stringify(normalize(value));
}

export async function compareEnrichments<T extends { stixId: string; intel: Intel }>(
  enrichments: T[], previous: Map<string, unknown>,
) {
  const changes = enrichments.filter(entry => canonicalIntel(entry.intel) !== canonicalIntel(previous.get(entry.stixId) ?? null));
  const newMatches = changes.filter(entry => !previous.get(entry.stixId)).length;
  const content = enrichments.map(entry => ({
    stixId: entry.stixId, intel: entry.intel, previous: previous.get(entry.stixId) ?? null,
  })).sort((a, b) => a.stixId.localeCompare(b.stixId));
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalIntel(content)));
  return {
    changes, newMatches, changedMatches: changes.length - newMatches,
    unchangedMatches: enrichments.length - changes.length,
    previewHash: [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, '0')).join(''),
  };
}
