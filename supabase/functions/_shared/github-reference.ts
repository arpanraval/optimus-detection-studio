/**
 * Naming and cleaning GitHub rule references.
 *
 * Articles link to detection rules on GitHub. The extractor stored two things
 * badly:
 *
 *   1. The URL, captured by a regex that also swallowed the closing brackets
 *      of the surrounding markdown link. `(see [rule](https://…yaml))` was
 *      stored as `https://…yaml))`, which 404s. 41 of 57 stored references
 *      carry a stray `)`. Some survive by accident because the paren lands
 *      after a `#L4` fragment, which is never sent to the server.
 *
 *   2. The name, hard-coded to the constant "GitHub Reference" -- 57
 *      references, one name -- even though the URL already contains the rule's
 *      filename.
 *
 * See E4 in docs/plans/2026-08-06-intel-digest-problem-inventory.md.
 *
 * Dependency-free so the Deno edge functions that extract references and the
 * browser bundle that fetches their content share one definition.
 */

const CLOSERS: Record<string, string> = { ')': '(', ']': '[', '}': '{' }

/**
 * Characters that never meaningfully end a URL and do end sentences or
 * markdown emphasis. `_` and `*` are here because articles wrap links in them
 * (`_[rule](url)_`); a real path can contain `_`, but not as its last
 * character. Stripping is iterative, so a tail like `)_.` unwinds completely
 * -- stopping at the first unrecognised character would leave the `)` behind.
 */
const TRAILING_NOISE = new Set(['.', ',', ';', ':', '!', '?', '"', "'", '>', '*', '_', '~'])

/**
 * Remove punctuation that belongs to the surrounding prose, not the URL.
 *
 * A closing bracket is removed only when the URL contains no matching opener.
 * Excluding brackets from the URL pattern outright would be simpler and wrong:
 * real GitHub paths contain parentheses, and those URLs would be cut short.
 */
export function trimUrlTrailingPunctuation(url: string): string {
  let out = url.trim()

  while (out.length > 0) {
    const last = out[out.length - 1]

    const opener = CLOSERS[last]
    if (opener) {
      const opens = out.split(opener).length - 1
      const closes = out.split(last).length - 1
      if (closes > opens) {
        out = out.slice(0, -1)
        continue
      }
      break
    }

    if (TRAILING_NOISE.has(last)) {
      out = out.slice(0, -1)
      continue
    }
    break
  }

  return out
}

function pathSegments(url: string): { owner?: string; repo?: string; segments: string[] } {
  // Tolerate junk rather than throwing: this runs over model/regex output.
  let pathname: string
  try {
    pathname = new URL(url).pathname
  } catch {
    pathname = url.replace(/^https?:\/\/[^/]*/i, '').split(/[?#]/)[0]
  }

  const segments = pathname
    .split('/')
    .map((segment) => {
      try {
        return decodeURIComponent(segment)
      } catch {
        return segment
      }
    })
    .filter(Boolean)

  return { owner: segments[0], repo: segments[1], segments }
}

/** `Azure/Azure-Sentinel`, or undefined when the URL is not a repo URL. */
export function gitHubRepoSlug(url: string): string | undefined {
  const { owner, repo } = pathSegments(url)
  return owner && repo ? `${owner}/${repo}` : undefined
}

/**
 * A readable name for a reference, derived from the path it points at.
 *
 * `.../Analytic Rules/SharePoint_Downloads_byNewUserAgent.yaml`
 *   -> "SharePoint Downloads byNewUserAgent"
 *
 * Separators become spaces; casing is left alone. camelCase is deliberately
 * NOT split -- `byNewUserAgent` would read better as "by New User Agent", but
 * the same rule turns `SharePoint` into "Share Point". Without a dictionary
 * the two cases are indistinguishable, and a name that is occasionally wrong
 * is worse than one that is merely unpolished.
 *
 * This is derived, not authoritative: it reflects the filename, which usually
 * but not always matches the rule's own title. `deriveRuleTitleFromContent`
 * supersedes it once the file has actually been fetched.
 */
export function deriveGitHubReferenceName(url: string): string {
  const { segments } = pathSegments(trimUrlTrailingPunctuation(url))
  if (segments.length === 0) return 'GitHub Reference'

  const last = segments[segments.length - 1]

  // A bare repo URL (/owner/repo) names itself; there is no file to describe.
  if (segments.length <= 2) return segments.join('/')

  const withoutExtension = last.replace(/\.[a-z0-9]{1,6}$/i, '')
  const readable = withoutExtension.replace(/[_\-.]+/g, ' ').replace(/\s+/g, ' ').trim()

  // A directory URL ends in something like `/2026/07`, which alone reads as
  // "07" -- unique but meaningless. Qualify it with the repo and the segment
  // above it. Found by running this over the real corpus rather than by
  // imagining inputs.
  if (isWeakName(readable)) {
    const owner = segments[0]
    const repo = segments[1]
    const tail = segments.slice(-2).join('/')
    return owner && repo ? `${owner}/${repo} — ${tail}` : tail || segments.join('/')
  }

  return readable
}

/** Too short, or nothing but digits and separators, to identify anything. */
function isWeakName(name: string): boolean {
  return name.length < 3 || /^[\d\s/]+$/.test(name)
}

/** Human-readable provenance for the reference's description field. */
export function describeGitHubReference(url: string): string {
  const slug = gitHubRepoSlug(trimUrlTrailingPunctuation(url))
  return slug ? `Detection rule reference from ${slug}` : 'Link to detection rules or tools'
}

/**
 * The rule's own title, once its content has been fetched.
 *
 * Sigma and Sentinel analytics carry `title:`; YARA carries `rule <name>`.
 * Returns undefined when the content declares neither, so the caller keeps the
 * derived name rather than replacing it with something worse.
 */
/**
 * Whether a fetched body is an upstream error rather than rule content.
 *
 * The GitHub rule fetch goes through Jina Reader, which returns HTTP 200 for
 * upstream failures and puts the error in the body. Verified against a real
 * stored reference:
 *
 *   raw.githubusercontent.com  -> HTTP 404
 *   via r.jina.ai              -> HTTP 200, body "404: Not Found"
 *
 * `response.ok` was therefore true and the string "404: Not Found" was saved
 * as a Sigma rule, where it still sits. `response.ok` validates the transport;
 * the payload has to be checked separately. See E2.
 */
export function looksLikeUpstreamError(body: string | null | undefined): boolean {
  const text = (body ?? '').trim()
  if (!text) return true

  // An HTTP status line as the entire payload, e.g. "404: Not Found".
  if (/^[45]\d{2}\s*[:-]?\s*[a-z ]{0,40}$/i.test(text)) return true
  if (/^(?:error|not found|forbidden|unauthorized)\b/i.test(text) && text.length < 120) return true

  return false
}

export function deriveRuleTitleFromContent(content: string): string | undefined {
  const yamlTitle = content.match(/^\s*title\s*:\s*(?:["']?)([^"'\n]+?)(?:["']?)\s*$/im)
  if (yamlTitle?.[1]) return yamlTitle[1].trim()

  const yaraName = content.match(/^\s*(?:private\s+|global\s+)*rule\s+([A-Za-z_][A-Za-z0-9_]*)/m)
  if (yaraName?.[1]) return yaraName[1].replace(/[_]+/g, ' ').trim()

  // Microsoft Sentinel analytics and hunting YAML name the rule `name:`, not
  // `title:`. Anchored at column zero deliberately: a YAML block scalar's
  // contents are always indented, so this cannot match a `name:`-shaped line
  // inside `description: |`, and nested keys (requiredDataConnectors, etc.)
  // are excluded for the same reason.
  const sentinelName = cleanDeclaredTitle(
    content.match(/^name\s*:\s*(?:["']?)([^"'\n]+?)(?:["']?)\s*$/m)?.[1],
  )
  if (sentinelName) return sentinelName

  // Elastic .toml rules use `name = "..."`. Multi-line strings are removed
  // first, so a line inside `description = """..."""` cannot be mistaken for
  // the key -- the construct is stripped generically rather than enumerating
  // the ways a description can happen to look like an assignment.
  const withoutMultilineStrings = content.replace(/"""[\s\S]*?"""|'''[\s\S]*?'''/g, '')
  const tomlName = cleanDeclaredTitle(
    withoutMultilineStrings.match(/^\s*name\s*=\s*["']([^"'\n]+)["']/m)?.[1],
  )
  if (tomlName) return tomlName

  return undefined
}

/**
 * A declared value that actually names something.
 *
 * `name: |` and `name: >` open a block scalar, so the captured text is the
 * indicator rather than a title. Returning undefined for those keeps the
 * contract every caller relies on: no title declared means keep the derived
 * name rather than substitute something worse.
 */
function cleanDeclaredTitle(raw: string | undefined): string | undefined {
  const value = raw?.trim()
  if (!value) return undefined
  if (/^[|>][+-]?\d*$/.test(value)) return undefined
  return value
}
