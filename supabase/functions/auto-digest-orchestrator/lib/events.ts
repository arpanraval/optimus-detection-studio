/**
 * Per-event audit trail for auto-digest runs.
 *
 * Every decision the orchestrator makes (feed fetched, article classified,
 * article dropped by relevance, article digested, article failed) writes one
 * row to auto_digest_run_events so the UI can render a transparent transcript
 * of what happened during the run.
 *
 * Emits are fire-and-forget — never block the orchestrator on a telemetry
 * write failure. Failed inserts are logged but don't propagate.
 */

export type EventType =
  | 'feed_fetched'
  | 'feed_failed'
  | 'article_seen'
  | 'article_classified'
  | 'article_classify_failed'
  | 'article_skipped_daily_limit'
  | 'article_ranked'
  | 'article_digested'
  | 'article_digest_failed';

export interface EventFields {
  feed_id?: string | null;
  feed_name?: string | null;
  article_id?: string | null;
  article_title?: string | null;
  article_url?: string | null;
  passed?: boolean | null;
  reason?: string | null;
  duration_ms?: number | null;
  payload?: Record<string, unknown> | null;
}

export interface RunContext {
  supabase: any;
  jobId: string;
  userId: string | null;
}

export async function emit(
  ctx: RunContext,
  event_type: EventType,
  fields: EventFields = {},
): Promise<void> {
  try {
    const { error } = await ctx.supabase.from('auto_digest_run_events').insert({
      job_id: ctx.jobId,
      user_id: ctx.userId,
      event_type,
      feed_id: fields.feed_id ?? null,
      feed_name: fields.feed_name ?? null,
      article_id: fields.article_id ?? null,
      article_title: fields.article_title ?? null,
      article_url: fields.article_url ?? null,
      passed: fields.passed ?? null,
      reason: fields.reason ?? null,
      duration_ms: fields.duration_ms ?? null,
      payload: fields.payload ?? null,
    });
    if (error) {
      console.warn(`[auto-digest-events] insert ${event_type} failed:`, error.message);
    }
  } catch (err: any) {
    console.warn(`[auto-digest-events] insert ${event_type} threw:`, err?.message ?? err);
  }
}
