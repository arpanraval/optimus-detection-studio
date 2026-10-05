type DetectionQueries = {
  queries?: Array<{ id?: string; language?: string; query?: string }>;
  queryLanguage?: string;
  detectionQuery?: string;
};

/** A tracked rule must execute the query selected by its binding, even if another KQL query comes first. */
export function selectSiemQuery(detection: DetectionQueries, language: string, selectedIds: string[] = []): string | null {
  const ids = [...new Set(selectedIds)];
  if (ids.length > 1) throw new Error('This connection tracks multiple queries. Open the specific rule to run it.');
  const queries = (detection.queries ?? []).filter(q => q.language?.toUpperCase() === language.toUpperCase() && q.query?.trim());
  if (ids.length) {
    const selected = queries.filter(q => q.id === ids[0]);
    if (selected.length !== 1) throw new Error('The tracked query is missing or its language changed. Repair the binding first.');
    return selected[0].query!;
  }
  return queries[0]?.query ?? (detection.queryLanguage?.toUpperCase() === language.toUpperCase() && detection.detectionQuery?.trim()
    ? detection.detectionQuery : null);
}
