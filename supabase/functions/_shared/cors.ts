/**
 * Shared CORS Utility for Edge Functions
 *
 * Provides secure CORS handling with origin whitelist validation.
 * Replaces vulnerable wildcard (*) CORS configuration.
 */

declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
};

// Default allowed origins for development
const DEFAULT_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:3000',
  'http://127.0.0.1:5173',
];

/**
 * Get the list of allowed origins from environment variable or defaults.
 * Set ALLOWED_ORIGINS environment variable as comma-separated list for production.
 * Example: ALLOWED_ORIGINS=https://app.example.com,https://staging.example.com
 */
function getAllowedOrigins(): string[] {
  const envOrigins = Deno.env.get('ALLOWED_ORIGINS');
  if (envOrigins) {
    return envOrigins.split(',').map(o => o.trim()).filter(Boolean);
  }
  return DEFAULT_ORIGINS;
}

/**
 * Check if an origin is allowed.
 * Supports exact matches and wildcard subdomains (*.example.com).
 */
function isOriginAllowed(origin: string, allowedOrigins: string[]): boolean {
  if (!origin) return false;

  for (const allowed of allowedOrigins) {
    // Exact match
    if (allowed === origin) return true;

    // Wildcard subdomain match (e.g., *.example.com)
    if (allowed.startsWith('*.')) {
      const domain = allowed.slice(2); // Remove "*."
      // Match: https://sub.example.com for *.example.com
      if (origin.endsWith(domain) &&
          (origin === `https://${domain}` ||
           origin === `http://${domain}` ||
           origin.includes(`.${domain}`))) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Get CORS headers for a request.
 * Returns headers with validated origin, or omits Access-Control-Allow-Origin for disallowed origins.
 */
export function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') || '';
  const allowedOrigins = getAllowedOrigins();

  const responseOrigin = isOriginAllowed(origin, allowedOrigins) ? origin : '';

  if (!responseOrigin && origin) {
    // Disallowed origin — return response without CORS access grant
    return {
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Vary': 'Origin',
    };
  }

  return {
    'Access-Control-Allow-Origin': responseOrigin || allowedOrigins[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

/**
 * Handle CORS preflight request.
 * Returns a Response for OPTIONS requests, or null if not a preflight.
 */
export function handleCorsPreflight(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(req) });
  }
  return null;
}

/**
 * Create a JSON response with CORS headers.
 * Convenience function for common response pattern.
 */
export function corsJsonResponse(
  data: unknown,
  req: Request,
  status: number = 200
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
  });
}

/**
 * Create an error response with CORS headers.
 */
export function corsErrorResponse(
  error: string,
  req: Request,
  status: number = 400
): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
  });
}
