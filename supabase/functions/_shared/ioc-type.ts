/**
 * Canonical indicator-type vocabulary.
 *
 * The AI extractor types a hash by passing the model's own word through:
 * `item?.hash_type?.toLowerCase()`. Models write "SHA-256" more often than
 * "SHA256", so the database ended up holding both -- 490 `sha-256` against 25
 * `sha256`, and 56 `sha-1` against 13 `sha1`. Same indicator kind, two strings.
 *
 * A canonical vocabulary already existed (the `IoCType` enum client-side, the
 * `IOC_TYPE_TO_CATEGORY` keys here). Nothing enforced it at the boundary that
 * writes data, so the non-canonical spelling became the majority.
 *
 * The damage is not cosmetic. Every consumer that switches on the type -- the
 * STIX pattern builder, the category lookup -- is written against the
 * canonical spelling and falls through to a default for the other 95%. STIX
 * export emitted SHA-256 hashes as base64 `artifact:payload_bin` blobs rather
 * than `file:hashes.'SHA-256'`.
 *
 * See D3 in docs/plans/2026-08-06-intel-digest-problem-inventory.md.
 *
 * WHY A SQUASH RULE AND NOT AN ALIAS TABLE: an alias table (`sha-256` ->
 * `sha256`) fixes the four values that exist today and leaves the mechanism
 * untouched, so the next `SHA 256` or `SHA_512` from a model becomes the next
 * bug, found the same way -- by someone noticing an odd row count months
 * later. Models vary on separators, not on the token, so normalising away
 * separators addresses the actual variation.
 *
 * This module is deliberately dependency-free so both runtimes can use one
 * definition: the Deno edge functions that WRITE indicators and the browser
 * bundle that EXPORTS them. Two copies of this rule would reintroduce exactly
 * the drift it exists to prevent.
 */

/**
 * Every indicator type the system recognises, in canonical spelling.
 *
 * Union of the edge `IOC_TYPE_TO_CATEGORY` keys and the client `IoCType` enum.
 * Adding a spelling variant here would defeat the purpose -- variants are
 * derived, not listed.
 */
export const CANONICAL_IOC_TYPES: readonly string[] = [
  // Network
  'ipv4', 'ipv6', 'domain', 'subdomain', 'url', 'uri', 'email', 'email_subject',
  'asn', 'cidr', 'user_agent', 'ja3', 'ja3s', 'jarm', 'ssl_cert',
  // Hashes. Bare `hash` is this pipeline's own fallback literal for a hash
  // whose algorithm the model did not name -- same case as `crypto` below.
  'md5', 'sha1', 'sha256', 'sha512', 'ssdeep', 'imphash', 'hash',
  // Files
  'file_path', 'file_path_win', 'file_path_unix', 'file_name', 'directory', 'pdb_path',
  // Windows
  'registry', 'registry_key', 'registry_value', 'mutex', 'pipe_name', 'named_pipe',
  'service_name', 'scheduled_task', 'process_name', 'command_line', 'powershell_command',
  // Certificates
  'certificate_serial', 'certificate_thumbprint', 'certificate_issuer',
  // Vulnerabilities
  'cve', 'vulnerability',
  // Crypto. `crypto` is this pipeline's own fallback literal for a
  // cryptocurrency address whose chain the model did not name -- not a
  // spelling variant of the two below, and not a model word, so it belongs in
  // the vocabulary rather than being warned about on every extraction.
  'bitcoin_address', 'ethereum_address', 'crypto',
  // Mobile
  'android_package', 'ios_bundle',
  // Other
  'mac_address', 'ssh_key', 'other',
]

/**
 * Reduce a type string to its separator-free, case-free skeleton.
 * `SHA-256`, `sha_256` and `SHA 256` all skeletonise to `sha256`.
 */
export function squashIoCType(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9]/g, '')
}

const CANONICAL_BY_SQUASHED: Record<string, string> = {}
for (const type of CANONICAL_IOC_TYPES) {
  CANONICAL_BY_SQUASHED[squashIoCType(type)] = type
}

export interface CanonicalIoCType {
  /** Canonical spelling when recognised; the lowercased input when not. */
  type: string
  recognized: boolean
}

/**
 * Resolve a type string to its canonical spelling.
 *
 * An unrecognised type keeps its (lowercased) input rather than being coerced
 * to 'other'. Coercing would destroy the only record of what the model
 * actually said, and an unknown type is a vocabulary gap worth seeing --
 * absent must stay distinguishable from a definite answer. Callers decide
 * whether to log or surface `recognized: false`.
 */
export function canonicalizeIoCType(raw: string | null | undefined): CanonicalIoCType {
  const input = (raw ?? '').trim()
  if (!input) return { type: '', recognized: false }

  const canonical = CANONICAL_BY_SQUASHED[squashIoCType(input)]
  return canonical
    ? { type: canonical, recognized: true }
    : { type: input.toLowerCase(), recognized: false }
}
