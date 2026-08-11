import { describe, expect, it } from 'vitest';
import { isOpaqueIdentifier, parseNamespacedId } from '../detection-identity';

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
