import { describe, expect, it } from 'vitest';
import { isOpaqueIdentifier, parseNamespacedId, normalizeLocator, normalizeTitle, fingerprintQuery, buildIdentityKeys } from '../detection-identity';

describe('parseNamespacedId', () => {
  it('accepts a UUID under a UUID-shaped namespace, lowercased and trimmed', () => {
    expect(parseNamespacedId('  A3A09840-1022-4267-B9E1-D6C9799ED38A ', 'microsoft_sentinel'))
      .toEqual({
        namespace: 'microsoft_sentinel',
        value: 'a3a09840-1022-4267-b9e1-d6c9799ed38a',
        raw: 'A3A09840-1022-4267-B9E1-D6C9799ED38A',
      });
  });

  it('rejects a bare numeric identifier with no namespace', () => {
    expect(parseNamespacedId('2058788')).toBeNull();
  });

  it('accepts a numeric identifier when the namespace supplies meaning', () => {
    expect(parseNamespacedId('2058788', 'suricata'))
      .toEqual({ namespace: 'suricata', value: '2058788', raw: '2058788' });
  });

  it('accepts an inline namespace prefix', () => {
    expect(parseNamespacedId('suricata:2058788'))
      .toEqual({ namespace: 'suricata', value: '2058788', raw: 'suricata:2058788' });
  });

  it('rejects a UUID with no namespace at all -- shape is not validity', () => {
    expect(parseNamespacedId('a3a09840-1022-4267-b9e1-d6c9799ed38a')).toBeNull();
  });

  it('rejects a value whose shape contradicts its namespace', () => {
    expect(parseNamespacedId('not-a-uuid', 'sigmahq')).toBeNull();
  });

  it('rejects an unknown namespace', () => {
    expect(parseNamespacedId('a3a09840-1022-4267-b9e1-d6c9799ed38a', 'community')).toBeNull();
  });

  it('rejects empty and whitespace input', () => {
    expect(parseNamespacedId('', 'sigmahq')).toBeNull();
    expect(parseNamespacedId('   ', 'sigmahq')).toBeNull();
  });

  it('accepts chronicle free-form tokens', () => {
    expect(parseNamespacedId('ursnif_downloader_v2', 'chronicle'))
      .toEqual({ namespace: 'chronicle', value: 'ursnif_downloader_v2', raw: 'ursnif_downloader_v2' });
  });

  it('accepts a dotted ClamAV signature name', () => {
    expect(parseNamespacedId('Win.Trojan.CloudZRAT-10059935-0', 'clamav'))
      .toEqual({ namespace: 'clamav', value: 'win.trojan.cloudzrat-10059935-0', raw: 'Win.Trojan.CloudZRAT-10059935-0' });
  });
});

describe('isOpaqueIdentifier', () => {
  it('is true for a UUID', () => {
    expect(isOpaqueIdentifier('a3a09840-1022-4267-b9e1-d6c9799ed38a')).toBe(true);
  });

  it('is false for a numeric SID -- opaque means unreadable, not merely short', () => {
    expect(isOpaqueIdentifier('2058788')).toBe(false);
  });

  it('is false for a rule name', () => {
    expect(isOpaqueIdentifier('Account MFA Modifications')).toBe(false);
  });
});

describe('normalizeTitle', () => {
  it('lowercases and collapses whitespace', () => {
    expect(normalizeTitle('  Account   MFA  Modifications ')).toBe('account mfa modifications');
  });

  it('treats punctuation differences as the same title', () => {
    expect(normalizeTitle('PUA - SoftPerfect Netscan Execution'))
      .toBe(normalizeTitle('PUA SoftPerfect Netscan Execution'));
  });

  it('normalises smart quotes to the same key as straight quotes', () => {
    expect(normalizeTitle(`Cat’s Got Your Files`)).toBe(normalizeTitle(`Cat's Got Your Files`));
  });

  it('returns null for empty or punctuation-only names -- absent, not blank', () => {
    expect(normalizeTitle('')).toBeNull();
    expect(normalizeTitle('   ')).toBeNull();
    expect(normalizeTitle('---')).toBeNull();
  });

  it('keeps genuinely different titles distinct', () => {
    expect(normalizeTitle('SharePointFileOperation via clientIP with previously unseen user agents'))
      .not.toBe(normalizeTitle('SharePointFileOperation via devices with previously unseen user agents'));
  });
});

describe('normalizeLocator', () => {
  it('resolves the blob and raw forms of one GitHub file to one key', () => {
    const blob = normalizeLocator(
      'https://github.com/Azure/Azure-Sentinel/blob/master/Solutions/Foo/Analytic%20Rules/Bar.yaml#L4',
    );
    const raw = normalizeLocator(
      'https://raw.githubusercontent.com/Azure/Azure-Sentinel/master/Solutions/Foo/Analytic Rules/Bar.yaml',
    );
    expect(blob).toBe('github:azure/azure-sentinel/solutions/foo/analytic rules/bar.yaml');
    expect(raw).toBe(blob);
  });

  it('ignores the branch, so the same file on two refs is one artifact', () => {
    expect(normalizeLocator('https://github.com/o/r/blob/main/a/b.yml'))
      .toBe(normalizeLocator('https://github.com/o/r/blob/v1.2.3/a/b.yml'));
  });

  it('drops query strings and fragments', () => {
    expect(normalizeLocator('https://github.com/o/r/blob/main/a/b.yml?plain=1#L10-L20'))
      .toBe('github:o/r/a/b.yml');
  });

  it('falls back to host and path for non-GitHub URLs', () => {
    expect(normalizeLocator('https://Docs.Example.COM/Rules/Alpha.yml'))
      .toBe('docs.example.com/rules/alpha.yml');
  });

  it('returns null for a non-URL', () => {
    expect(normalizeLocator('not a url')).toBeNull();
    expect(normalizeLocator('')).toBeNull();
  });
});

describe('fingerprintQuery', () => {
  it('returns a sha256-prefixed hex digest', async () => {
    const fingerprint = await fingerprintQuery('SecurityEvent | where EventID == 4624');
    expect(fingerprint).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it('is insensitive to whitespace and case -- the same rule reformatted is the same rule', async () => {
    const a = await fingerprintQuery('SecurityEvent\n| where EventID == 4624\n| project Account');
    const b = await fingerprintQuery('securityevent   | where eventid == 4624 | project account');
    expect(a).toBe(b);
  });

  it('is sensitive to an edited body -- a modified copy is not the same logic', async () => {
    const a = await fingerprintQuery('SecurityEvent | where EventID == 4624');
    const b = await fingerprintQuery('SecurityEvent | where EventID == 4625');
    expect(a).not.toBe(b);
  });

  it('is sensitive to a changed comment, because an edited copy is modified', async () => {
    const a = await fingerprintQuery('// detects logon\nSecurityEvent | where EventID == 4624');
    const b = await fingerprintQuery('// detects sign-in\nSecurityEvent | where EventID == 4624');
    expect(a).not.toBe(b);
  });

  it('returns null when there is no body to fingerprint', async () => {
    expect(await fingerprintQuery('')).toBeNull();
    expect(await fingerprintQuery('   \n\t  ')).toBeNull();
  });
});

const base = {
  id: 'det-1',
  name: null,
  external_id: null,
  source: null,
  detectionQuery: null,
  source_url: null,
};

describe('buildIdentityKeys', () => {
  it('emits a namespaced external_id key when source vouches for the identifier', async () => {
    const keys = await buildIdentityKeys({
      ...base,
      external_id: 'a3a09840-1022-4267-b9e1-d6c9799ed38a',
      source: 'microsoft_sentinel',
    });
    expect(keys).toContainEqual({
      detection_id: 'det-1',
      key_type: 'external_id',
      namespace: 'microsoft_sentinel',
      key_value: 'a3a09840-1022-4267-b9e1-d6c9799ed38a',
    });
  });

  it('emits no external_id key when the source is not a known namespace', async () => {
    const keys = await buildIdentityKeys({
      ...base,
      external_id: 'a3a09840-1022-4267-b9e1-d6c9799ed38a',
      source: 'community',
    });
    expect(keys.filter(k => k.key_type === 'external_id')).toEqual([]);
  });

  it('emits a title key with a null namespace', async () => {
    const keys = await buildIdentityKeys({ ...base, name: 'Account MFA Modifications' });
    expect(keys).toContainEqual({
      detection_id: 'det-1',
      key_type: 'title',
      namespace: null,
      key_value: 'account mfa modifications',
    });
  });

  it('emits a fingerprint key for a rule with a body', async () => {
    const keys = await buildIdentityKeys({ ...base, detectionQuery: 'SecurityEvent | where EventID == 4624' });
    const fingerprint = keys.find(k => k.key_type === 'fingerprint');
    expect(fingerprint?.key_value).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(fingerprint?.namespace).toBeNull();
  });

  it('emits a locator key when source_url holds a URL', async () => {
    const keys = await buildIdentityKeys({
      ...base,
      source_url: 'https://github.com/Azure/Azure-Sentinel/blob/master/Solutions/Foo/Bar.yaml',
    });
    expect(keys).toContainEqual({
      detection_id: 'det-1',
      key_type: 'locator',
      namespace: null,
      key_value: 'github:azure/azure-sentinel/solutions/foo/bar.yaml',
    });
  });

  it('emits nothing for a detection with no derivable key -- absent, not blank', async () => {
    expect(await buildIdentityKeys(base)).toEqual([]);
  });
});
