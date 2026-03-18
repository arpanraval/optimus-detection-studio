/**
 * Shared Rate Limiter for Edge Functions
 *
 * Uses Supabase rate_limits table with atomic upsert for per-user, per-function rate limiting.
 * Fail-open design: allows requests on DB errors to avoid blocking legitimate traffic.
 */

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
}

/**
 * Check rate limit for a given key.
 *
 * @param supabaseAdmin - Service role Supabase client (must have access to rate_limits table)
 * @param key - Rate limit key, e.g. 'user:{uid}:fn:ai-generate'
 * @param maxRequests - Maximum requests per window
 * @param windowSeconds - Window size in seconds (default 60)
 * @returns { allowed, remaining, resetAt }
 */
export async function checkRateLimit(
  supabaseAdmin: any,
  key: string,
  maxRequests: number,
  windowSeconds: number = 60
): Promise<RateLimitResult> {
  const windowStart = new Date();
  windowStart.setSeconds(0, 0); // Truncate to minute boundary

  const resetAt = new Date(windowStart.getTime() + windowSeconds * 1000);

  try {
    const { data, error } = await supabaseAdmin.rpc('upsert_rate_limit', {
      p_key: key,
      p_window_start: windowStart.toISOString(),
      p_max_requests: maxRequests,
    });

    if (error) {
      console.error('[RateLimit] Error checking rate limit:', error);
      return { allowed: true, remaining: maxRequests, resetAt };
    }

    const count = data as number;
    const allowed = count <= maxRequests;
    const remaining = Math.max(0, maxRequests - count);

    return { allowed, remaining, resetAt };
  } catch (err) {
    console.error('[RateLimit] Unexpected error:', err);
    return { allowed: true, remaining: maxRequests, resetAt };
  }
}
