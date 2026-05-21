/**
 * Content hashing for drift detection.
 *
 * Rule files vary in cosmetic ways that shouldn't count as "drift": a BOM, CRLF
 * vs LF line endings, trailing whitespace, a missing/extra final newline. We
 * normalise those away before hashing so the drift trigger only fires on real
 * content changes. (Comment-only / key-reorder changes still flip the hash —
 * those are surfaced as "cosmetic upstream change" by the comparator.)
 *
 * Uses Web Crypto (`crypto.subtle`), available in browsers and Deno alike, so
 * this module is safe to reuse from a future scheduled edge function.
 */

/** Normalise text the same way before every hash so cosmetic diffs don't drift. */
export function normalizeForHash(text: string): string {
  const noBom = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  return noBom
    .replace(/\r\n?/g, '\n')                      // CRLF / CR -> LF
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/, ''))   // strip trailing whitespace per line
    .join('\n')
    .replace(/\n+$/, '')                          // drop trailing blank lines
    + '\n';                                       // ...and re-add exactly one
}

function toHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

/** SHA-256 hex digest of `text` after `normalizeForHash`. */
export async function sha256Hex(text: string): Promise<string> {
  const normalized = normalizeForHash(text);
  const data = new TextEncoder().encode(normalized);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return toHex(digest);
}

/** Convenience: hash a value that may be undefined/empty -> returns null. */
export async function sha256HexOrNull(text: string | null | undefined): Promise<string | null> {
  if (text == null || text === '') return null;
  return sha256Hex(text);
}
