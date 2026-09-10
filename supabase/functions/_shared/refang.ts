/**
 * Refanging defanged indicators.
 *
 * Threat intel articles "defang" indicators so they are not clickable:
 * `hxxp[:]//178.16.54[.]109/st.exe`. The extraction prompt tells the model to
 * undo this ("Refang all defanged IoCs in your output"), so the stored
 * indicator is the live form while the article text is the defanged form.
 * Anything comparing the two has to reconcile them.
 *
 * The evidence gate had its own partial version of this knowledge -- it knew
 * `[.]` and `[at]` but not `hxxp` -- so it reported the model's correctly
 * refanged URLs as absent from the article. The result was that Phorpiex's
 * real payload URL was flagged "not found in source evidence" while
 * `example.com`, a placeholder from a diagram, passed. See D4 in
 * docs/plans/2026-08-06-intel-digest-problem-inventory.md.
 *
 * The lesson from that bug is why this module exists rather than another
 * regex at the call site: the defect was three components each holding a
 * different idea of what defanging is, with the one that *grades* the output
 * knowing the least. Extending the shortest list would have left the same
 * shape in place.
 *
 * NOTE: `src/components/threatintel/shared/IoCTable.tsx` still carries its own
 * defang/refang pair for the display toggle. It is deliberately not deduped
 * into here: the client bundle has no imports from supabase/functions at all,
 * and introducing the first one for display-only code buys less than it costs.
 * That copy is not on the verification path -- if it drifts, a value renders
 * oddly; if THIS one drifts, real indicators get called fabrications.
 */

/**
 * Punctuation that defanging hides, keyed by the token standing in for it.
 *
 * Deliberately a map of *tokens*, not a list of full patterns. Every defang
 * convention shares one marker -- the punctuation is wrapped in brackets -- so
 * matching the wrapper generically and looking the inside up here covers
 * `[.]`, `[dot]`, `[:]`, `[@]`, `(dot)`, `{.}` and combinations nobody has
 * written down yet. Enumerating whole patterns is what guarantees the next
 * convention becomes the next bug.
 */
const DEFANG_TOKENS: Record<string, string> = {
  '.': '.',
  'dot': '.',
  ':': ':',
  'colon': ':',
  '@': '@',
  'at': '@',
  '/': '/',
  '//': '//',
  'slash': '/',
  '-': '-',
  'dash': '-',
  'hyphen': '-',
}

/** A bracketed, parenthesised or braced defang token. */
const BRACKETED_DEFANG = /[[({]\s*([a-z]{1,6}|[.:@/-]{1,2})\s*[\])}]/gi

/**
 * Replace bracketed defang tokens with the punctuation they stand for.
 * A bracketed run that is not a known token is left exactly as it was, so
 * ordinary prose and markdown links pass through untouched.
 */
export function refangBrackets(value: string): string {
  return value.replace(BRACKETED_DEFANG, (match, token: string) =>
    DEFANG_TOKENS[token.toLowerCase()] ?? match
  )
}

/** Any URL scheme, live (`http://`) or defanged (`hxxp://`, `fxp://`). */
const URL_SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i

export function hasUrlScheme(value: string): boolean {
  return URL_SCHEME.test(value.trim())
}

/**
 * Drop the scheme from a URL.
 *
 * The scheme is the only part of an indicator that defanging alters
 * *alphabetically* -- every other transformation is punctuation, which
 * normalisation already flattens. It also carries almost no identifying
 * information: `178.16.54.109/st.exe` is what names the indicator, not the
 * four letters in front of it.
 *
 * Ignoring it is therefore strictly more robust than recognising `hxxp`:
 * `hxxps`, `fxp`, `sxp` and any future variant are handled without this module
 * having to know they exist.
 */
export function stripUrlScheme(value: string): string {
  return value.trim().replace(URL_SCHEME, '')
}
