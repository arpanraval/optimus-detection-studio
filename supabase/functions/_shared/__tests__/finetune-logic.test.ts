import { describe, it, expect } from 'vitest';
import {
  capHuntingResult,
  mapHuntingError,
  validateLadder,
  normalizeEvents,
  buildKickoffMessage,
} from '../finetune-logic';

describe('capHuntingResult', () => {
  it('enforces the byte cap even for one oversized Unicode row', () => {
    const out = capHuntingResult([{ name: 'Value', type: 'String' }], [{ Value: '界'.repeat(5000) }]);
    expect(new TextEncoder().encode(JSON.stringify(out.rows)).byteLength).toBeLessThanOrEqual(12_000);
    expect(out.truncated).toBe(true);
    expect(out.row_count).toBe(1);
  });
  it('returns all rows when under the cap', () => {
    const schema = [{ name: 'A', type: 'String' }];
    const rows = [{ A: '1' }, { A: '2' }];
    const out = capHuntingResult(schema, rows);
    expect(out.row_count).toBe(2);
    expect(out.truncated).toBe(false);
    expect(out.rows).toHaveLength(2);
    expect(out.note).toBeUndefined();
  });

  it('truncates to 50 rows and sets a note', () => {
    const schema = [{ name: 'A', type: 'String' }];
    const rows = Array.from({ length: 200 }, (_, i) => ({ A: String(i) }));
    const out = capHuntingResult(schema, rows);
    expect(out.row_count).toBe(200);
    expect(out.truncated).toBe(true);
    expect(out.rows).toHaveLength(50);
    expect(out.note).toContain('200');
  });

  it('halves rows to stay under the JSON size budget', () => {
    const schema = [{ name: 'A', type: 'String' }];
    const big = 'x'.repeat(2000);
    const rows = Array.from({ length: 20 }, (_, i) => ({ A: `${i}-${big}` }));
    const out = capHuntingResult(schema, rows);
    expect(out.row_count).toBe(20);
    expect(out.truncated).toBe(true);
    expect(out.rows.length).toBeLessThan(20);
    expect(JSON.stringify(out.rows).length).toBeLessThanOrEqual(12_000);
  });
});

describe('mapHuntingError', () => {
  it('maps 403 to a permission error', () => {
    const e = mapHuntingError(403, 'Forbidden');
    expect(e.error).toBe('permission_denied');
    expect(e.guidance).toMatch(/ThreatHunting\.Read\.All/);
  });
  it('maps 429 to a throttle error', () => {
    expect(mapHuntingError(429, '').error).toBe('rate_limited');
  });
  it('maps 400 to a query error', () => {
    expect(mapHuntingError(400, "can't resolve column 'Foo'").error).toBe('query_error');
  });
  it('maps 500 to a connection error', () => {
    expect(mapHuntingError(503, '').error).toBe('connection_error');
  });
  it('keeps a 5xx as a connection error even when the body mentions auth', () => {
    expect(mapHuntingError(500, 'unauthorized gateway').error).toBe('connection_error');
  });
});

describe('validateLadder', () => {
  const good = {
    summary: 'noise from signed installers',
    baseline_hit_count: 1000,
    refinements: [
      { level: 1, title: 'a', kql: 'X', measured_hit_count: 600, noise_reduction_pct: 40,
        reasoning: 'r', coverage_tradeoff: 't', confidence: 'high' },
      { level: 2, title: 'b', kql: 'Y', measured_hit_count: 300, noise_reduction_pct: 70,
        reasoning: 'r', coverage_tradeoff: 't', confidence: 'medium' },
    ],
  };
  it('accepts a valid 2-level ladder', () => {
    const r = validateLadder(good);
    expect(r.ok).toBe(true);
  });
  it('rejects fewer than 2 refinements', () => {
    const r = validateLadder({ ...good, refinements: [good.refinements[0]] });
    expect(r.ok).toBe(false);
  });
  it('rejects more than 3 refinements', () => {
    const r = validateLadder({ ...good, refinements: [...good.refinements, ...good.refinements] });
    expect(r.ok).toBe(false);
  });
  it('rejects non-monotonic reduction', () => {
    const bad = { ...good, refinements: [
      { ...good.refinements[0], noise_reduction_pct: 70 },
      { ...good.refinements[1], noise_reduction_pct: 40 },
    ]};
    expect(validateLadder(bad).ok).toBe(false);
  });
  it('rejects an out-of-range reduction percentage', () => {
    const bad = { ...good, refinements: [
      { ...good.refinements[0], noise_reduction_pct: -10 },
      good.refinements[1],
    ]};
    expect(validateLadder(bad).ok).toBe(false);
  });
  it('rejects a missing required field', () => {
    const bad = { ...good, refinements: [
      good.refinements[0],
      { ...good.refinements[1], coverage_tradeoff: undefined },
    ]};
    expect(validateLadder(bad).ok).toBe(false);
  });
  it('rejects a NaN noise_reduction_pct', () => {
    const bad = { ...good, refinements: [
      { ...good.refinements[0], noise_reduction_pct: NaN },
      good.refinements[1],
    ]};
    expect(validateLadder(bad).ok).toBe(false);
  });
  it('does not throw on a null refinement element', () => {
    const bad = { ...good, refinements: [null, null] };
    expect(() => validateLadder(bad)).not.toThrow();
    expect(validateLadder(bad).ok).toBe(false);
  });
});

describe('normalizeEvents', () => {
  it('builds a timeline, counts queries, and finds pending tools', () => {
    const events = [
      { id: 'e1', type: 'agent.message', content: [{ type: 'text', text: 'hi' }] },
      { id: 'e2', type: 'agent.custom_tool_use', name: 'run_hunting_query',
        input: { purpose: 'top procs', query: 'DeviceProcessEvents | count' } },
      { id: 'e3', type: 'user.custom_tool_result', custom_tool_use_id: 'e2',
        is_error: false, content: [{ type: 'text', text: '{"row_count":5,"truncated":false}' }] },
      { id: 'e4', type: 'agent.custom_tool_use', name: 'run_hunting_query',
        input: { purpose: 'measure', query: 'X' } },
      { id: 'e5', type: 'span.model_request_end',
        model_usage: { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 0 } },
    ];
    const out = normalizeEvents(events);
    expect(out.queryCount).toBe(2);
    expect(out.pendingTools).toHaveLength(1);
    expect(out.pendingTools[0].toolUseId).toBe('e4');
    expect(out.usage.input_tokens).toBe(100);
    const resolved = out.timeline.find((t) => t.kind === 'query' && t.toolUseId === 'e2');
    expect(resolved && resolved.kind === 'query' && resolved.rowCount).toBe(5);
  });
});

describe('buildKickoffMessage', () => {
  it('embeds the query, window and baseline', () => {
    const msg = buildKickoffMessage({
      detectionName: 'Suspicious PowerShell',
      windowDays: 14,
      baselineHitCount: 4200,
      originalQuery: 'DeviceProcessEvents | where X',
      breakdown: null,
    });
    expect(msg).toContain('Suspicious PowerShell');
    expect(msg).toContain('14');
    expect(msg).toContain('4200');
    expect(msg).toContain('DeviceProcessEvents | where X');
  });
});
