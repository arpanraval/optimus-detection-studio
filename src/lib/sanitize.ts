/** Escape PostgREST LIKE wildcards for safe .ilike() usage */
export function escapeLike(s: string): string {
  return s.replace(/[%_\\]/g, '\\$&');
}

/** Escape LIKE wildcards + structural chars (commas/parens) for safe .or() filter strings */
export function escapePostgrestFilter(s: string): string {
  return escapeLike(s).replace(/[,()]/g, '');
}
