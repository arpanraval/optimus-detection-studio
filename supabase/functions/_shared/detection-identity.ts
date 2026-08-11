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
