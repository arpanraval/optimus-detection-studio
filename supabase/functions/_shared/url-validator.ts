/**
 * URL Validator Utility for SSRF Protection
 *
 * Validates URLs before fetching to prevent Server-Side Request Forgery (SSRF) attacks.
 * Blocks access to internal networks, cloud metadata endpoints, and dangerous protocols.
 */

/**
 * IP ranges that should be blocked (private networks, localhost, metadata endpoints)
 */
const BLOCKED_IP_PATTERNS: RegExp[] = [
  /^127\./,                              // Loopback (127.0.0.0/8)
  /^10\./,                               // Class A private (10.0.0.0/8)
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./,      // Class B private (172.16.0.0/12)
  /^192\.168\./,                         // Class C private (192.168.0.0/16)
  /^169\.254\./,                         // Link-local / AWS metadata (169.254.0.0/16)
  /^0\./,                                // Current network (0.0.0.0/8)
  /^100\.(6[4-9]|[7-9][0-9]|1[0-1][0-9]|12[0-7])\./, // Carrier-grade NAT (100.64.0.0/10)
  /^192\.0\.0\./,                        // IETF Protocol Assignments
  /^192\.0\.2\./,                        // TEST-NET-1
  /^198\.51\.100\./,                     // TEST-NET-2
  /^203\.0\.113\./,                      // TEST-NET-3
  /^224\./,                              // Multicast (224.0.0.0/4)
  /^240\./,                              // Reserved (240.0.0.0/4)
  /^255\./,                              // Broadcast
];

/**
 * Hostnames that should always be blocked
 */
const BLOCKED_HOSTNAMES: string[] = [
  'localhost',
  'localhost.localdomain',
  '0.0.0.0',
  '::1',                                 // IPv6 loopback
  'metadata.google.internal',            // GCP metadata
  'metadata.google',
  'metadata',
  'kubernetes.default',                  // K8s internal
  'kubernetes.default.svc',
  'kubernetes.default.svc.cluster.local',
];

/**
 * Hostname suffixes that should be blocked
 */
const BLOCKED_HOSTNAME_SUFFIXES: string[] = [
  '.local',
  '.localhost',
  '.internal',
  '.localdomain',
  '.home',
  '.corp',
  '.lan',
];

/**
 * Allowed protocols for URL fetching
 */
const ALLOWED_PROTOCOLS: string[] = ['https:', 'http:'];

/**
 * Result of URL validation
 */
export interface UrlValidationResult {
  valid: boolean;
  error?: string;
  sanitizedUrl?: string;
}

/**
 * Check if a hostname is an IP address
 */
function isIPAddress(hostname: string): boolean {
  // IPv4 pattern
  const ipv4Pattern = /^(\d{1,3}\.){3}\d{1,3}$/;
  // IPv6 pattern (simplified - matches brackets or raw IPv6)
  const ipv6Pattern = /^(\[)?([0-9a-fA-F:]+)(\])?$/;

  return ipv4Pattern.test(hostname) || ipv6Pattern.test(hostname);
}

/**
 * Check if an IP address is in blocked ranges
 */
function isBlockedIP(ip: string): boolean {
  // Remove brackets from IPv6 if present
  const cleanIP = ip.replace(/^\[|\]$/g, '');

  // Check IPv4 patterns
  for (const pattern of BLOCKED_IP_PATTERNS) {
    if (pattern.test(cleanIP)) {
      return true;
    }
  }

  // Check IPv6 loopback and link-local
  if (cleanIP === '::1' || cleanIP.toLowerCase().startsWith('fe80:')) {
    return true;
  }

  // Check IPv6 unique local addresses (fc00::/7)
  if (cleanIP.toLowerCase().startsWith('fc') || cleanIP.toLowerCase().startsWith('fd')) {
    return true;
  }

  return false;
}

/**
 * Check if a hostname is blocked
 */
function isBlockedHostname(hostname: string): boolean {
  const lowerHostname = hostname.toLowerCase();

  // Check exact matches
  if (BLOCKED_HOSTNAMES.includes(lowerHostname)) {
    return true;
  }

  // Check suffixes
  for (const suffix of BLOCKED_HOSTNAME_SUFFIXES) {
    if (lowerHostname.endsWith(suffix)) {
      return true;
    }
  }

  // Check if it's a blocked IP
  if (isIPAddress(hostname) && isBlockedIP(hostname)) {
    return true;
  }

  return false;
}

/**
 * Validate a URL for safe fetching
 *
 * @param urlString - The URL to validate
 * @returns Validation result with sanitized URL if valid
 */
export function validateUrl(urlString: string): UrlValidationResult {
  // Trim whitespace
  const trimmedUrl = urlString.trim();

  if (!trimmedUrl) {
    return { valid: false, error: 'URL is empty' };
  }

  // Parse URL
  let url: URL;
  try {
    url = new URL(trimmedUrl);
  } catch {
    return { valid: false, error: 'Invalid URL format' };
  }

  // Check protocol
  if (!ALLOWED_PROTOCOLS.includes(url.protocol)) {
    return {
      valid: false,
      error: `Protocol not allowed: ${url.protocol}. Only HTTP and HTTPS are permitted.`
    };
  }

  // Check hostname
  const hostname = url.hostname.toLowerCase();

  if (!hostname) {
    return { valid: false, error: 'URL has no hostname' };
  }

  if (isBlockedHostname(hostname)) {
    return {
      valid: false,
      error: `Access to internal/private hosts is not allowed: ${hostname}`
    };
  }

  // Check for user:password in URL (often used in SSRF attacks)
  if (url.username || url.password) {
    return {
      valid: false,
      error: 'URLs with credentials are not allowed'
    };
  }

  // Check for suspicious port numbers
  const port = url.port ? parseInt(url.port, 10) : (url.protocol === 'https:' ? 443 : 80);
  const BLOCKED_PORTS = [22, 25, 53, 110, 143, 445, 1433, 1521, 3306, 5432, 5984, 6379, 8500, 9200, 27017];
  if (BLOCKED_PORTS.includes(port)) {
    return {
      valid: false,
      error: `Port ${port} is not permitted`,
      sanitizedUrl: null,
    };
  }
  const allowedPorts = [80, 443, 8080, 8443];
  if (!allowedPorts.includes(port)) {
    console.warn(`Non-standard port detected: ${port} for ${url.hostname}`);
  }

  // Return sanitized URL (removes any user/password and normalizes)
  const sanitizedUrl = new URL(url.pathname + url.search + url.hash, `${url.protocol}//${url.hostname}${url.port ? ':' + url.port : ''}`);

  return {
    valid: true,
    sanitizedUrl: sanitizedUrl.toString()
  };
}

/**
 * Validate a redirect URL to prevent SSRF via redirects
 * This should be called when following redirects to ensure
 * the redirect target is also safe.
 *
 * @param originalUrl - The original URL that was requested
 * @param redirectUrl - The URL being redirected to
 * @returns Validation result
 */
export function validateRedirect(originalUrl: string, redirectUrl: string): UrlValidationResult {
  // First validate the redirect URL itself
  const validation = validateUrl(redirectUrl);
  if (!validation.valid) {
    return validation;
  }

  // Additional checks for redirect-specific attacks
  try {
    const original = new URL(originalUrl);
    const redirect = new URL(redirectUrl);

    // Allow same-origin redirects
    if (original.origin === redirect.origin) {
      return validation;
    }

    // For cross-origin redirects, be more strict
    // Block redirects from HTTPS to HTTP (downgrade attack)
    if (original.protocol === 'https:' && redirect.protocol === 'http:') {
      return {
        valid: false,
        error: 'Redirect from HTTPS to HTTP is not allowed (protocol downgrade)'
      };
    }

    // Log cross-origin redirects for monitoring
    console.warn(`Cross-origin redirect: ${original.origin} -> ${redirect.origin}`);

    return validation;

  } catch {
    return { valid: false, error: 'Failed to parse redirect URLs' };
  }
}
