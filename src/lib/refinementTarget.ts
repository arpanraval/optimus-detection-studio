/** A refinement is based on one query revision. Never replace another query or a later edit. */
export function refinementTargetIndex(
  queries: Array<{ language?: string; query?: string }>,
  language: string,
  originalQuery?: string,
): number {
  const candidates = queries.map((query, index) => ({ query, index }))
    .filter(({ query }) => query.language?.toUpperCase() === language.toUpperCase());
  if (originalQuery === undefined) {
    if (candidates.length > 1) throw new Error('Multiple queries match this language. Reopen fine-tuning for the intended query.');
    return candidates[0]?.index ?? -1;
  }
  const matching = candidates.filter(({ query }) => query.query === originalQuery);
  if (matching.length !== 1) throw new Error('The original query changed or is ambiguous. Re-run fine-tuning before applying this result.');
  return matching[0].index;
}
