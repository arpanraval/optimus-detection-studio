/**
 * Classifying extracted detection rules.
 *
 * `validateRuleCandidate` stored whatever the model called a rule:
 *
 *   type: String(value.query_type || 'other').slice(0, 100)
 *
 * An ExtractedRuleType enum existed and this path never consulted it, so the
 * corpus accumulated 61 distinct values across 401 rules.
 *
 * The count is not the real problem. The values are not all the same KIND of
 * thing: `kql` is a query language, `Palo Alto Networks Threat Prevention
 * Signature ID` (average content length: 5 characters) is an identifier
 * pointing at a rule someone else holds, and `log analysis` is prose. The
 * enum had already picked a side inconsistently -- `github_reference` was a
 * member, and it is not a language.
 *
 * See E3 in docs/plans/2026-08-06-intel-digest-problem-inventory.md.
 *
 * WHY NOT JUST CONSTRAIN THE ENUM: canonicalising into a 9-member enum was
 * rejected. It works for D3-style variation, where every spelling names the
 * same concept and a mechanical rule resolves it. Here only about 30 of the
 * odd values are spelling variants; the rest are semantically different
 * things. Forcing them into the enum turns a vendor signature ID, a prose
 * description, an attacker's PHP sample and a genuinely unrecognised language
 * into one value -- 'other' -- destroying the only record of what they were,
 * in service of a type constraint. So the missing axis is added instead.
 *
 * Dependency-free so the Deno edge functions that classify rules and the
 * browser bundle that routes them to a query language share one vocabulary.
 */

/**
 * What sort of artifact a "rule" actually is.
 *
 *   query       -- a deployable detection query in a known language
 *   reference   -- non-deployable material the article points at or quotes:
 *                  links, vendor signature IDs, rule names, scripts, config
 *   description -- prose describing detection logic, no machine-readable form
 *
 * The boundary is "could this be deployed to a SIEM as written?". Everything
 * that could not, but still carries information worth keeping, is a reference.
 */
export type RuleKind = 'query' | 'reference' | 'description'

/**
 * Deployable detection query languages, canonical spelling.
 * Variants are derived by squashing, not listed.
 */
export const QUERY_LANGUAGES: readonly string[] = [
  'sigma', 'yara', 'kql', 'spl', 'eql', 'esql', 'xql', 'wql',
  'snort', 'suricata', 'clamav', 'auditd', 'logscale', 'google_secops',
  // A real query language, even though this app has no Wiz deploy target.
  // `kind` answers "is this a detection query"; whether we can ship it to a
  // configured SIEM is a separate question the language mapping answers.
  'wiz_cloud_event_query',
]

/**
 * Type strings that name something other than a deployable query.
 *
 * This is an explicit vocabulary rather than a derived rule, and that is a
 * deliberate difference from the D3 canonicaliser. D3's variation was
 * mechanical -- separators -- so a general rule covered spellings nobody had
 * listed. Here the variation is semantic: nothing about the string
 * `aws iam policy` mechanically distinguishes it from `xql`. A decision was
 * required, so it is written down. The guard against staleness is that an
 * unrecognised value is NOT forced in here -- see classifyRuleType.
 */
const NON_QUERY_TYPES: Record<string, RuleKind> = {
  // Points at a rule held elsewhere -- an identifier, not content. These are
  // what E1 exists to resolve.
  'github_reference': 'reference',
  'palo_alto_networks_threat_prevention_signature_id': 'reference',
  'mdi_external_id': 'reference',
  'snort_sid': 'reference',
  'snort2_sid': 'reference',
  'snort3_sid': 'reference',
  'google_secops_rule_name': 'reference',
  'microsoft_defender_detections': 'reference',

  // Code and commands quoted from the article. Not deployable as a detection
  // query, but real material an analyst wants. Classified as reference on
  // explicit instruction rather than as a separate not-a-detection kind.
  'powershell': 'reference',
  'bash': 'reference',
  'bash_script': 'reference',
  'shell': 'reference',
  'shell_script': 'reference',
  'javascript': 'reference',
  'typescript': 'reference',
  'php': 'reference',
  'curl': 'reference',
  'graphql_curl': 'reference',
  'wmic': 'reference',
  'wmi_query': 'reference',
  'yaml': 'reference',
  'regex': 'reference',
  'command_line': 'reference',
  'ldap_filter': 'reference',
  'ldap_filter_pattern': 'reference',
  'viptela_cli': 'reference',
  'gremlin': 'reference',

  // Configuration and policy -- hardening, not detection.
  'aws_iam_policy': 'reference',
  'cloud_armor_security_policy': 'reference',

  // Prose. Conveys intent; carries no machine-readable artifact.
  'log_analysis': 'description',
  'log_analysis_logic': 'description',
  'log_logic': 'description',
  'log_search': 'description',
  'web_log_analysis': 'description',
  'logic_description': 'description',
  'pseudo_detection_analytic': 'description',
  'hunting_artifact': 'description',
  'endpoint_security_api_event_logic': 'description',
  'cortex_xdr_alert_logic': 'description',
}

/**
 * Spelling variants that a squash alone cannot resolve, because the words
 * differ rather than the punctuation. Kept deliberately short -- anything
 * resolvable mechanically must NOT be listed here.
 */
const LANGUAGE_ALIASES: Record<string, string> = {
  'clamav_signature': 'clamav',
  'es_ql': 'esql',
}

/** Lowercase; collapse every run of non-alphanumerics to a single underscore. */
export function squashRuleType(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

const LANGUAGE_BY_SQUASHED: Record<string, string> = {}
for (const language of QUERY_LANGUAGES) {
  LANGUAGE_BY_SQUASHED[squashRuleType(language)] = language
}

export interface RuleClassification {
  kind: RuleKind
  /** Canonical language when kind is 'query'; otherwise the original label. */
  language: string
  /**
   * False when the type string matched no known language and no known
   * non-query vocabulary entry. The value is preserved rather than coerced,
   * so a vocabulary gap is visible instead of silently becoming 'other'.
   */
  recognized: boolean
}

/**
 * Classify a model-supplied rule type.
 *
 * An unrecognised value is treated as a query in an unknown language and
 * flagged, NOT collapsed to 'other'. That keeps the next vendor language a
 * visible gap rather than an invisible one, and errs toward leaving a rule
 * usable rather than hiding it.
 */
export function classifyRuleType(raw: string | null | undefined): RuleClassification {
  const input = (raw ?? '').trim()
  if (!input) return { kind: 'reference', language: 'unknown', recognized: false }

  const squashed = squashRuleType(input)
  const aliased = LANGUAGE_ALIASES[squashed] ?? squashed

  const language = LANGUAGE_BY_SQUASHED[aliased]
  if (language) return { kind: 'query', language, recognized: true }

  const nonQueryKind = NON_QUERY_TYPES[aliased]
  if (nonQueryKind) return { kind: nonQueryKind, language: aliased, recognized: true }

  return { kind: 'query', language: input.toLowerCase(), recognized: false }
}

/** Whether a rule's DECLARED TYPE claims it is a deployable query. */
export function isDeployableRule(raw: string | null | undefined): boolean {
  return classifyRuleType(raw).kind === 'query'
}

// =============================================================================
// CONTENT SHAPE
// =============================================================================

/**
 * Structural tokens a rule in each language must contain.
 *
 * classifyRuleType decides from the declared type alone, which cannot catch a
 * rule whose type tells the truth and whose content does not. The corpus is
 * full of exactly that:
 *
 *   type: snort   content: "66788"                            (a SID)
 *   type: clamav  content: "Win.Trojan.CloudZRAT-10059935-0"  (a signature name)
 *   type: yara    content: "MAL_RANSOM_INC_Aug24"             (a rule name)
 *   type: sigma   content: "404: Not Found"                   (a failed fetch)
 *
 * All four were marked deployable because their language is real. See E2.
 *
 * Each test asserts a token the language's own grammar REQUIRES, rather than
 * enumerating ways content can be wrong -- the same principle as the defang
 * bracket rule. A language with no entry falls back to the single-token test
 * below.
 */
const REQUIRED_CONTENT_TOKENS: Record<string, RegExp> = {
  // `detection:` is Sigma's. `query:` covers Microsoft Sentinel analytics
  // YAML, which the extension-based type fallback labels `sigma` because the
  // file ends in .yaml. Those are genuinely deployable -- they carry KQL under
  // `query:` -- and an earlier draft of this test demoted two of them. Found
  // by dry-running the backfill against the corpus rather than by inspection.
  sigma: /\b(?:detection|query)\s*:/i,
  yara: /\bcondition\s*:/i,
  snort: /^\s*(?:alert|drop|reject|pass|log|sdrop)\s+/im,
  suricata: /^\s*(?:alert|drop|reject|pass|log|sdrop)\s+/im,
  // A ClamAV signature body is colon-delimited (Name:Type:Offset:Signature).
  // A bare `Win.Trojan.Foo-123-0` is the published NAME of a signature the
  // scanner ships -- a reference to it, not the signature itself.
  clamav: /:/,
  // Wiz filter syntax is URL-encoded and contains no whitespace, so the
  // single-token fallback below would wrongly demote every real Wiz query.
  // `~` is its field delimiter.
  wiz_cloud_event_query: /~/,
}

/**
 * Whether content is structurally a query in the given language.
 *
 * Languages without a specific grammar entry fall back to: a query has more
 * than one token. A bare identifier with no whitespace -- `66788`,
 * `MAL_RANSOM_INC_Aug24` -- is a name, not something you can run.
 */
export function hasQueryShape(language: string, content: string | null | undefined): boolean {
  const text = (content ?? '').trim()
  if (!text) return false

  const required = REQUIRED_CONTENT_TOKENS[language]
  if (required) return required.test(text)

  return /\s/.test(text)
}

export interface RuleContentClassification extends RuleClassification {
  /**
   * True when the declared type claimed a query language but the content does
   * not have that language's shape, so the rule was demoted to a reference.
   */
  demotedByContent: boolean
}

/**
 * Classify a rule from its declared type AND its content.
 *
 * This is the classification callers should use. `classifyRuleType` answers
 * only "what did the model call this", which is necessary but not sufficient:
 * a Snort SID and a Snort rule both declare `snort`.
 *
 * A query whose content fails its language's shape test is demoted to
 * `reference` rather than dropped. The identifier is the point -- `66788`
 * tells you Cisco ships coverage, and E1 exists to resolve exactly these --
 * so the row is kept and relabelled, never deleted.
 */
export function classifyRule(
  rawType: string | null | undefined,
  content: string | null | undefined,
): RuleContentClassification {
  const base = classifyRuleType(rawType)
  if (base.kind !== 'query') return { ...base, demotedByContent: false }

  if (hasQueryShape(base.language, content)) return { ...base, demotedByContent: false }
  return { ...base, kind: 'reference', demotedByContent: true }
}
