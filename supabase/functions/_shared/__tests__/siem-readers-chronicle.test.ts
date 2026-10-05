// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { normalizeChronicleEntry, UnsupportedChronicleRule, readChronicleRules } from '../siem-readers/chronicle.ts';
import {
  CHRONICLE_RULE_LIVE_AND_ALERTING, CHRONICLE_RULE_REVISION_2, CHRONICLE_RULE_SOURCE_PRESENT_DISABLED,
  CHRONICLE_RULE_LIVE_NO_ALERTING, CHRONICLE_RULE_UNKNOWN_DEPLOYMENT, CHRONICLE_RULE_COMPILE_ERROR,
  CHRONICLE_RULE_REFERENCED_LIST_UNAVAILABLE, CHRONICLE_RULE_CURATED_NO_TEXT, CHRONICLE_RULE_ARCHIVED,
  CHRONICLE_PAGE_1, CHRONICLE_PAGE_2,
} from './fixtures/chronicle-list.ts';

describe('Google SecOps / Chronicle rule reader', () => {
  it('keys identity on the rule resource name, and separates content from revision', () => {
    const a = normalizeChronicleEntry(CHRONICLE_RULE_LIVE_AND_ALERTING);
    const b = normalizeChronicleEntry(CHRONICLE_RULE_REVISION_2);
    expect(a.vendorRuleId).toBe(b.vendorRuleId); // same rule identity
    expect(a.revisionId).not.toBe(b.revisionId); // different revision
    expect(a.query).not.toBe(b.query); // content differs between revisions
    expect(a.resourceName).toBe(CHRONICLE_RULE_LIVE_AND_ALERTING.name);
  });

  it('models live execution, alerting and archived as separate observations, never one enabled flag', () => {
    const rule = normalizeChronicleEntry(CHRONICLE_RULE_LIVE_AND_ALERTING);
    expect(rule.liveExecution).toBe('true');
    expect(rule.alerting).toBe('true');
    expect(rule.archived).toBe('false');
  });

  it('does not equate text existence with alerting: source present, execution/alerting disabled', () => {
    const rule = normalizeChronicleEntry(CHRONICLE_RULE_SOURCE_PRESENT_DISABLED);
    expect(rule.query).toBeTruthy();
    expect(rule.liveExecution).toBe('false');
    expect(rule.alerting).toBe('false');
  });

  it('allows live execution without alerting as independent signals', () => {
    const rule = normalizeChronicleEntry(CHRONICLE_RULE_LIVE_NO_ALERTING);
    expect(rule.liveExecution).toBe('true');
    expect(rule.alerting).toBe('false');
  });

  it('labels an unknown deployment state as unknown, never defaulted to disabled (G20)', () => {
    const rule = normalizeChronicleEntry(CHRONICLE_RULE_UNKNOWN_DEPLOYMENT);
    expect(rule.liveExecution).toBe('unknown');
    expect(rule.alerting).toBe('unknown');
    expect(rule.archived).toBe('unknown');
  });

  it('surfaces a compile error without discarding the rule', () => {
    const rule = normalizeChronicleEntry(CHRONICLE_RULE_COMPILE_ERROR);
    expect(rule.compilationState).toBe('FAILED');
    expect(rule.compilationError).toContain('undefined reference');
  });

  it('surfaces an unavailable referenced list as an unmapped field rather than crashing', () => {
    const rule = normalizeChronicleEntry(CHRONICLE_RULE_REFERENCED_LIST_UNAVAILABLE);
    expect(rule.unmappedFields).toContain('referenceListUnavailable');
  });

  it('never fabricates an editable detection for curated content with no source text (G19)', () => {
    expect(() => normalizeChronicleEntry(CHRONICLE_RULE_CURATED_NO_TEXT)).toThrow(UnsupportedChronicleRule);
  });

  it('preserves an archived rule as its own observation', () => {
    const rule = normalizeChronicleEntry(CHRONICLE_RULE_ARCHIVED);
    expect(rule.archived).toBe('true');
  });

  it('pages through pageToken and stops on an absent token', async () => {
    const pages: Record<string, typeof CHRONICLE_PAGE_1> = { start: CHRONICLE_PAGE_1, 'page-2-token': CHRONICLE_PAGE_2 };
    let calls = 0;
    const fetchPage = async (token: string | null) => {
      calls++;
      return pages[token ?? 'start'];
    };
    const outcome = await readChronicleRules(fetchPage, null);
    expect(calls).toBe(2);
    expect(outcome.rules.length).toBe(3);
    expect(outcome.stoppedOnRepeatedCursor).toBe(false);
  });

  it('stops on a repeated pageToken rather than looping forever (G11)', async () => {
    const fetchPage = async () => ({ rules: [CHRONICLE_RULE_LIVE_AND_ALERTING], nextPageToken: 'stuck-token' });
    const outcome = await readChronicleRules(fetchPage, null);
    expect(outcome.stoppedOnRepeatedCursor).toBe(true);
  });

  it('never turns a 403 mid-scan into an empty successful result (G18)', async () => {
    const fetchPage = async (token: string | null) => {
      if (token === null) return CHRONICLE_PAGE_1;
      throw new Error('403 Forbidden');
    };
    await expect(readChronicleRules(fetchPage, null)).rejects.toThrow('403 Forbidden');
  });
});
