/**
 * Detection identity — the single definition of every key by which two
 * detection records can be said to be the same rule.
 *
 * Dependency-free on purpose: this module is imported unchanged by the Deno
 * edge functions and by the Vite browser bundle, exactly as
 * `_shared/ioc-type.ts` and `_shared/rule-type.ts` are. Adding an import here
 * breaks one of the two consumers.
 *
 * Two rules are load-bearing and stated in the spec (§4):
 *   - UUID shape alone is not validity. An identifier only becomes an identity
 *     key when a known namespace vouches for it.
 *   - Numeric IDs require a namespace. `2058788` is a Suricata SID, a Palo Alto
 *     threat ID, or nothing at all, depending entirely on who said it.
 */

export const IDENTITY_NAMESPACES = [
  'sigmahq',
  'elastic',
  'splunk_escu',
  'microsoft_sentinel',
  'chronicle',
  'snort',
  'suricata',
  'palo_alto',
  'clamav',
  'mdi',
] as const;

export type IdentityNamespace = (typeof IDENTITY_NAMESPACES)[number];

/** The shape a namespace's identifiers are required to take. */
type KeyShape = 'uuid' | 'numeric' | 'token' | 'dotted';

const NAMESPACE_SHAPE: Record<IdentityNamespace, KeyShape> = {
  sigmahq: 'uuid',
  elastic: 'uuid',
  splunk_escu: 'uuid',
  microsoft_sentinel: 'uuid',
  chronicle: 'token',
  snort: 'numeric',
  suricata: 'numeric',
  palo_alto: 'numeric',
  mdi: 'numeric',
  clamav: 'dotted',
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NUMERIC_RE = /^\d{2,10}$/;
const TOKEN_RE = /^[A-Za-z0-9._:-]{3,128}$/;
const DOTTED_RE = /^[A-Za-z0-9_]+(?:\.[A-Za-z0-9_-]+)+$/;

const SHAPE_TEST: Record<KeyShape, RegExp> = {
  uuid: UUID_RE,
  numeric: NUMERIC_RE,
  token: TOKEN_RE,
  dotted: DOTTED_RE,
};

function asNamespace(value: string | undefined | null): IdentityNamespace | null {
  if (!value) return null;
  const candidate = value.trim().toLowerCase();
  return (IDENTITY_NAMESPACES as readonly string[]).includes(candidate)
    ? (candidate as IdentityNamespace)
    : null;
}

export interface NamespacedId {
  namespace: IdentityNamespace;
  /** Canonical form: trimmed and lowercased. Compare on this. */
  value: string;
  /** Exactly what the caller supplied, for provenance and display. */
  raw: string;
}

/**
 * True when a value is an opaque machine identifier -- something a human would
 * never have typed as a name. Used to tell "this string is an ID" from "this
 * string is a title". Deliberately narrow: a numeric SID is short but not
 * opaque, because it is meaningful within its namespace.
 */
export function isOpaqueIdentifier(value: string): boolean {
  return UUID_RE.test(value.trim());
}

/**
 * Resolve a raw identifier to a namespaced identity key, or null when it cannot
 * be vouched for.
 *
 * `sourceHint` is the detection's `source` column (or an equivalent). An inline
 * `namespace:value` prefix takes precedence over the hint, because it is an
 * explicit claim rather than an inference.
 */
export function parseNamespacedId(raw: string, sourceHint?: string): NamespacedId | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  let namespace = asNamespace(sourceHint);
  let value = trimmed;

  const separator = trimmed.indexOf(':');
  if (separator > 0) {
    const inline = asNamespace(trimmed.slice(0, separator));
    if (inline) {
      namespace = inline;
      value = trimmed.slice(separator + 1).trim();
    }
  }

  if (!namespace || !value) return null;
  if (!SHAPE_TEST[NAMESPACE_SHAPE[namespace]].test(value)) return null;

  return { namespace, value: value.toLowerCase(), raw: trimmed };
}

/**
 * Reduce a rule name to a comparison key.
 *
 * Deliberately aggressive about punctuation and case, because vendors re-emit
 * the same rule with cosmetic differences. That aggression is safe only because
 * a title match is never treated as proof of identity (spec §4) -- it is the
 * `possible same rule` rung, and a title group whose members disagree on their
 * query bodies resolves to ambiguous rather than to a match.
 *
 * Returns null rather than '' when nothing survives, so a caller cannot store a
 * blank key and later match it against another blank key.
 */
export function normalizeTitle(name: string): string | null {
  if (typeof name !== 'string') return null;
  const collapsed = name
    .normalize('NFKD')
    .replace(/['']/g, "'")
    .replace(/[""]/g, '"')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  return collapsed || null;
}

const GITHUB_HOSTS = new Set(['github.com', 'www.github.com', 'raw.githubusercontent.com']);

/**
 * Reduce a source URL to a stable artifact key.
 *
 * The branch/ref is dropped on purpose: the same file on `main` and on a tag is
 * the same artifact, and keeping the ref would make a rule stop resolving the
 * moment a vendor renamed their default branch. Query strings and line
 * fragments are dropped for the same reason -- E4b records 41 of 57 stored URLs
 * carrying prose punctuation and `#L4` fragments that are incidental to which
 * file is meant.
 */
export function normalizeLocator(url: string): string | null {
  if (typeof url !== 'string' || !url.trim()) return null;

  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return null;
  }

  const host = parsed.hostname.toLowerCase();
  const segments = decodeURIComponent(parsed.pathname)
    .split('/')
    .filter(Boolean)
    .map(segment => segment.toLowerCase());

  if (!segments.length) return null;

  if (GITHUB_HOSTS.has(host)) {
    const [owner, repo, ...rest] = segments;
    if (!owner || !repo || !rest.length) return null;
    // github.com/<owner>/<repo>/blob/<ref>/<path>
    // raw.githubusercontent.com/<owner>/<repo>/<ref>/<path>
    const path = rest[0] === 'blob' || rest[0] === 'tree' ? rest.slice(2) : rest.slice(1);
    if (!path.length) return null;
    return `github:${owner}/${repo}/${path.join('/')}`;
  }

  return `${host}/${segments.join('/')}`;
}
