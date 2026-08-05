import { describe, it, expect } from 'vitest';
import {
  SIEM_TO_QUERY_LANGUAGES, SUPPORTED_SIEM_PLATFORMS, isSupportedSiem, resolveQueryLanguage,
  resolveQueryTarget, supportsDefenderSchemaValidation,
} from '../query-language';

describe('resolveQueryLanguage', () => {
  it('resolves the first configured SIEM that maps to a language', () => {
    expect(resolveQueryLanguage({ siem_platforms: ['Microsoft Sentinel'] })).toBe('KQL');
    expect(resolveQueryLanguage({ siem_platforms: ['Splunk', 'Microsoft Sentinel'] })).toBe('SPL');
  });

  it('skips unrecognised platforms rather than failing', () => {
    expect(resolveQueryLanguage({ siem_platforms: ['Homegrown Thing', 'Splunk'] })).toBe('SPL');
  });

  it('falls back to Sigma with no profile — the behaviour the picker exists to make visible', () => {
    // This fallback is correct as a last resort but was silent: a first-time
    // user with no environment profile got Sigma without ever being asked.
    // The New Research modal now requires a choice in exactly this case.
    expect(resolveQueryLanguage(null)).toBe('Sigma');
    expect(resolveQueryLanguage(undefined)).toBe('Sigma');
    expect(resolveQueryLanguage({})).toBe('Sigma');
    expect(resolveQueryLanguage({ siem_platforms: [] })).toBe('Sigma');
  });

  it('honours a snapshot whose chosen platform was ordered first', () => {
    // How the picker takes effect: the entry point writes the chosen platform
    // first into environment_snapshot.siem_platforms at insert time.
    expect(resolveQueryLanguage({
      siem_platforms: ['CrowdStrike Falcon', 'Splunk'],
    })).toBe('CQL');
  });
});

describe('isSupportedSiem / SUPPORTED_SIEM_PLATFORMS', () => {
  it('accepts every platform the language map knows', () => {
    for (const platform of SUPPORTED_SIEM_PLATFORMS) {
      expect(isSupportedSiem(platform)).toBe(true);
      expect(resolveQueryLanguage({ siem_platforms: [platform] })).not.toBe('Sigma');
    }
  });

  it('rejects unknown platforms and prototype keys', () => {
    expect(isSupportedSiem('QRadar')).toBe(false);
    expect(isSupportedSiem('')).toBe(false);
    // hasOwnProperty, not `in` — a bare `in` check would accept these.
    expect(isSupportedSiem('constructor')).toBe(false);
    expect(isSupportedSiem('toString')).toBe(false);
  });

  it('stays in sync with the language map it validates against', () => {
    expect([...SUPPORTED_SIEM_PLATFORMS].sort())
      .toEqual(Object.keys(SIEM_TO_QUERY_LANGUAGES).sort());
  });
});

// ---------------------------------------------------------------------------
// resolveQueryTarget / schema-validation routing
// ---------------------------------------------------------------------------

describe('resolveQueryTarget', () => {
  it('keeps the product distinct even though both Microsoft SIEMs write KQL', () => {
    // The whole bug: resolveQueryLanguage collapsed these two to 'KQL' and the
    // product was gone, so the orchestrator validated Sentinel queries against
    // the Defender XDR schema.
    const sentinel = resolveQueryTarget({ siem_platforms: ['Microsoft Sentinel'] });
    const defender = resolveQueryTarget({ siem_platforms: ['Microsoft Defender XDR'] });

    expect(sentinel.language).toBe('KQL');
    expect(defender.language).toBe('KQL');
    expect(sentinel.product).toBe('Microsoft Sentinel');
    expect(defender.product).toBe('Microsoft Defender XDR');
    expect(sentinel.product).not.toBe(defender.product);
  });

  it('reports no product when falling back to Sigma', () => {
    // Sigma is product-agnostic; naming a product here would invent one.
    expect(resolveQueryTarget(null)).toEqual({ language: 'Sigma', product: null });
    expect(resolveQueryTarget({ siem_platforms: [] }).product).toBeNull();
    expect(resolveQueryTarget({ siem_platforms: ['Homegrown Thing'] }).product).toBeNull();
  });

  it('agrees with resolveQueryLanguage for every supported platform', () => {
    // resolveQueryLanguage now delegates, so this guards against the two
    // drifting apart if either is edited later.
    for (const platform of SUPPORTED_SIEM_PLATFORMS) {
      const profile = { siem_platforms: [platform] };
      expect(resolveQueryTarget(profile).language).toBe(resolveQueryLanguage(profile));
      expect(resolveQueryTarget(profile).product).toBe(platform);
    }
  });

  it('takes the first configured platform, matching language resolution', () => {
    const t = resolveQueryTarget({ siem_platforms: ['Splunk', 'Microsoft Sentinel'] });
    expect(t.language).toBe('SPL');
    expect(t.product).toBe('Splunk');
  });
});

describe('supportsDefenderSchemaValidation', () => {
  it('validates Defender XDR queries', () => {
    expect(supportsDefenderSchemaValidation('Microsoft Defender XDR')).toBe(true);
  });

  it('does NOT validate Sentinel against the Defender schema', () => {
    // This is the assertion that matters. A correct Sentinel query over
    // SecurityEvent / SigninLogs / AuditLogs was being reported as using
    // unknown tables, and QA acted on that finding.
    expect(supportsDefenderSchemaValidation('Microsoft Sentinel')).toBe(false);
  });

  it('does not validate when no product resolved', () => {
    expect(supportsDefenderSchemaValidation(null)).toBe(false);
    expect(supportsDefenderSchemaValidation(undefined)).toBe(false);
  });

  it('does not validate other vendors', () => {
    for (const platform of SUPPORTED_SIEM_PLATFORMS) {
      if (platform === 'Microsoft Defender XDR') continue;
      expect(supportsDefenderSchemaValidation(platform)).toBe(false);
    }
  });
});
