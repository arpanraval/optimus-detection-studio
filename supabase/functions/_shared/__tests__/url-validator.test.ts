import { describe, expect, it } from 'vitest';
import { isRedirectStatus, validateUrl, validateRedirect } from '../url-validator';

describe('shared URL validator', () => {
  it.each([
    'http://127.0.0.1/admin',
    'http://169.254.169.254/latest/meta-data',
    'http://[::1]/',
    'https://user:password@example.com/private',
  ])('blocks SSRF-sensitive URL %s', (url) => {
    expect(validateUrl(url).valid).toBe(false);
  });

  it('blocks a redirect into a private network', () => {
    expect(validateRedirect('https://example.com', 'http://10.0.0.1/').valid).toBe(false);
  });

  it('accepts an ordinary public HTTPS URL', () => {
    expect(validateUrl('https://example.com/advisory').valid).toBe(true);
  });

  it.each([301, 302, 303, 307, 308])('recognizes HTTP %s as a redirect', (status) => {
    expect(isRedirectStatus(status)).toBe(true);
  });

  it('does not treat a 304 conditional-fetch response as a redirect', () => {
    expect(isRedirectStatus(304)).toBe(false);
  });
});
