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

  // E4c. Every fetched rule in the corpus is Microsoft Sentinel or Elastic
  // TOML, and this function recognised neither -- so the documented "upgrade
  // the name once the file is in hand" step had a 0% hit rate in production
  // and always had. Verbatim opening lines from a stored rule.
  it('reads a Microsoft Sentinel name', () => {
    const sentinel = [
      'id: a3a09840-1022-4267-b9e1-d6c9799ed38a',
      'name: Account MFA Modifications',
      'description: |',
      "  'Identifies modifications to user's MFA settings.'",
      'requiredDataConnectors:',
      '  - connectorId: AzureActiveDirectory',
    ].join('\n')

    expect(deriveRuleTitleFromContent(sentinel)).toBe('Account MFA Modifications')
  })

  it('reads an Elastic TOML name', () => {
    const toml = [
      '[rule]',
      'description = """',
      'Identifies attempts to change memory protection of NTDLL.',
      '"""',
      'id = "29688edf-a003-42e4-8d79-c958cffce9fc"',
      'name = "NTDLL Memory Protection Change via Unsigned DLL"',
      'os_list = ["windows"]',
    ].join('\n')

    expect(deriveRuleTitleFromContent(toml)).toBe('NTDLL Memory Protection Change via Unsigned DLL')
  })

  // The guard that makes the two additions safe rather than merely wider.
  it('ignores a name-shaped line inside a description block', () => {
    const sentinel = [
      'id: abc',
      'description: |',
      '  name: Not The Rule Name',
      '  more prose',
    ].join('\n')
    expect(deriveRuleTitleFromContent(sentinel)).toBeUndefined()

    const toml = [
      '[rule]',
      'description = """',
      'name = "Not The Rule Name"',
      '"""',
    ].join('\n')
    expect(deriveRuleTitleFromContent(toml)).toBeUndefined()
  })

  it('does not mistake a block scalar indicator for a title', () => {
    expect(deriveRuleTitleFromContent('name: |\n  some folded text')).toBeUndefined()
    expect(deriveRuleTitleFromContent('name: >-\n  some folded text')).toBeUndefined()
  })

  // Sigma stays authoritative where it is declared, so nothing that already
  // resolved changes meaning.
  it('still prefers an explicit Sigma title over a name', () => {
    expect(deriveRuleTitleFromContent('title: Sigma Title\nname: Sentinel Name'))
      .toBe('Sigma Title')
  })
})
