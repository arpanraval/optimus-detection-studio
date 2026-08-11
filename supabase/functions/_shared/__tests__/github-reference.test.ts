import { describe, expect, it } from 'vitest'
import {
  deriveGitHubReferenceName,
  deriveRuleTitleFromContent,
  describeGitHubReference,
  gitHubRepoSlug,
  looksLikeUpstreamError,
  trimUrlTrailingPunctuation,
} from '../github-reference'

// Verbatim from the stored corpus.
const SENTINEL_RULE = 'https://github.com/Azure/Azure-Sentinel/blob/master/Solutions/Microsoft%20365/Analytic%20Rules/SharePoint_Downloads_byNewUserAgent.yaml'

describe('trimUrlTrailingPunctuation', () => {
  it('removes the brackets a markdown link leaves behind', () => {
    expect(trimUrlTrailingPunctuation(`${SENTINEL_RULE})`)).toBe(SENTINEL_RULE)
    expect(trimUrlTrailingPunctuation(`${SENTINEL_RULE}))`)).toBe(SENTINEL_RULE)
    expect(trimUrlTrailingPunctuation(`${SENTINEL_RULE}).`)).toBe(SENTINEL_RULE)
    expect(trimUrlTrailingPunctuation(`${SENTINEL_RULE},`)).toBe(SENTINEL_RULE)
  })

  // Why bracket balance rather than excluding ')' from the URL pattern: real
  // GitHub paths contain parentheses, and excluding the character would cut
  // those URLs short -- trading a visible bug for a quieter one.
  it('keeps parentheses that belong to the path', () => {
    const withParens = 'https://github.com/org/repo/blob/main/rules/Detect (Windows)/rule.yaml'
    expect(trimUrlTrailingPunctuation(withParens)).toBe(withParens)
    expect(trimUrlTrailingPunctuation(`${withParens})`)).toBe(withParens)
  })

  it('leaves a clean URL untouched', () => {
    expect(trimUrlTrailingPunctuation(SENTINEL_RULE)).toBe(SENTINEL_RULE)
  })

  // Observed in a Talos report: the captured text was '.../2026/07/).'
  it('reduces a URL that is entirely prose punctuation at the end', () => {
    expect(trimUrlTrailingPunctuation('https://github.com/Cisco-Talos/IOCs/blob/main/2026/07/).'))
      .toBe('https://github.com/Cisco-Talos/IOCs/blob/main/2026/07/')
  })

  // Found by running this over the real corpus: a Wiz reference was captured
  // as '...keyv-packages.csv)_.' -- markdown emphasis wrapping a link. An
  // implementation that stops at the first unrecognised character strips the
  // '.', meets the '_', and leaves the ')' behind.
  it('unwinds a mixed punctuation tail completely', () => {
    const clean = 'https://github.com/wiz-sec-public/wiz-research-iocs/blob/main/reports/keyv-packages.csv'
    expect(trimUrlTrailingPunctuation(`${clean})_.`)).toBe(clean)
    expect(trimUrlTrailingPunctuation(`${clean}_)`)).toBe(clean)
    expect(trimUrlTrailingPunctuation(`${clean}.),`)).toBe(clean)
  })
})

describe('deriveGitHubReferenceName', () => {
  it('names a reference from the file it points at', () => {
    expect(deriveGitHubReferenceName(SENTINEL_RULE)).toBe('SharePoint Downloads byNewUserAgent')
    expect(deriveGitHubReferenceName('https://github.com/Azure/Azure-Sentinel/blob/master/x/AdFind_Usage.yaml'))
      .toBe('AdFind Usage')
    expect(deriveGitHubReferenceName('https://github.com/SigmaHQ/sigma/blob/master/rules/windows/proc_creation_win_susp_foo.yml'))
      .toBe('proc creation win susp foo')
  })

  it('decodes percent-escaped path segments', () => {
    expect(deriveGitHubReferenceName('https://github.com/o/r/blob/main/a/Anomalous%20AAD%20Account%20Manipulation.yaml'))
      .toBe('Anomalous AAD Account Manipulation')
  })

  it('cleans the URL before deriving, so a stray bracket never lands in the name', () => {
    expect(deriveGitHubReferenceName(`${SENTINEL_RULE})`)).toBe('SharePoint Downloads byNewUserAgent')
    expect(deriveGitHubReferenceName(`${SENTINEL_RULE}#L4)`)).toBe('SharePoint Downloads byNewUserAgent')
  })

  it('falls back to the repo slug when the URL names no file', () => {
    expect(deriveGitHubReferenceName('https://github.com/elastic/detection-rules')).toBe('elastic/detection-rules')
  })

  // Also from the real corpus: '.../IOCs/blob/main/2026/07/' derives as "07",
  // which is unique but identifies nothing. Qualify it instead.
  it('qualifies a name that would be meaningless on its own', () => {
    expect(deriveGitHubReferenceName('https://github.com/Cisco-Talos/IOCs/blob/main/2026/07/'))
      .toBe('Cisco-Talos/IOCs — 2026/07')
    expect(deriveGitHubReferenceName('https://github.com/Cisco-Talos/IOCs/tree/main/2026/05'))
      .toBe('Cisco-Talos/IOCs — 2026/05')
  })

  it('never returns an empty name', () => {
    for (const url of ['https://github.com/', 'not a url', '']) {
      expect(deriveGitHubReferenceName(url).length).toBeGreaterThan(0)
    }
  })
})

describe('gitHubRepoSlug / describeGitHubReference', () => {
  it('identifies the source repository', () => {
    expect(gitHubRepoSlug(SENTINEL_RULE)).toBe('Azure/Azure-Sentinel')
    expect(describeGitHubReference(SENTINEL_RULE)).toBe('Detection rule reference from Azure/Azure-Sentinel')
  })

  it('degrades to the generic description rather than inventing a repo', () => {
    expect(describeGitHubReference('https://github.com/')).toBe('Link to detection rules or tools')
  })
})

/**
 * E2. The GitHub rule fetch goes through Jina Reader, which answers HTTP 200
 * for upstream failures and puts the error in the body -- verified live:
 * raw.githubusercontent.com returned 404 while r.jina.ai returned 200 with
 * "404: Not Found". `response.ok` was therefore true and that string was
 * saved as a Sigma rule.
 */
describe('looksLikeUpstreamError', () => {
  it('recognises a status line returned as the whole payload', () => {
    expect(looksLikeUpstreamError('404: Not Found')).toBe(true)
    expect(looksLikeUpstreamError('  403: Forbidden  ')).toBe(true)
    expect(looksLikeUpstreamError('500')).toBe(true)
    expect(looksLikeUpstreamError('Not Found')).toBe(true)
  })

  it('treats an empty body as a failure', () => {
    for (const body of ['', '   ', null, undefined]) {
      expect(looksLikeUpstreamError(body)).toBe(true)
    }
  })

  // Must not reject real rules. A YARA rule mentioning 404 in a string, or a
  // Sigma rule detecting HTTP errors, are legitimate content.
  it('accepts genuine rule content', () => {
    expect(looksLikeUpstreamError('rule Foo {\n condition: true\n}')).toBe(false)
    expect(looksLikeUpstreamError('title: Detect 404 scanning\ndetection:\n  sel:\n    status: 404')).toBe(false)
    expect(looksLikeUpstreamError('DeviceNetworkEvents | where StatusCode == 404')).toBe(false)
  })
})

describe('deriveRuleTitleFromContent', () => {
  it('prefers the rule its own title', () => {
    expect(deriveRuleTitleFromContent('id: abc\ntitle: Suspicious SharePoint Download\nstatus: test'))
      .toBe('Suspicious SharePoint Download')
    expect(deriveRuleTitleFromContent('title: "Quoted Title"')).toBe('Quoted Title')
  })

  it('reads a YARA rule name', () => {
    expect(deriveRuleTitleFromContent('rule CHAINDROP_Loader {\n strings:\n $a="x"\n condition: $a\n}'))
      .toBe('CHAINDROP Loader')
  })

  // Returning undefined keeps the derived filename name, which is better than
  // any guess this function could make from untitled content.
  it('returns undefined when the content declares no title', () => {
    expect(deriveRuleTitleFromContent('index=main | stats count')).toBeUndefined()
    expect(deriveRuleTitleFromContent('')).toBeUndefined()
  })
})
