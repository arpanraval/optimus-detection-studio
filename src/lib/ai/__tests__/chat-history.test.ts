import { describe, it, expect } from 'vitest';
import { truncateHistory, MAX_CONTEXT_MESSAGES } from '../chat-history';

function makeMsg(role: 'user' | 'model', text: string) {
  return { role, parts: [{ text }] };
}

describe('truncateHistory', () => {
  it('returns history unchanged when under limit', () => {
    const history = [makeMsg('user', 'hello'), makeMsg('model', 'hi')];
    const result = truncateHistory(history);
    expect(result).toEqual(history);
  });

  it('truncates to MAX_CONTEXT_MESSAGES keeping most recent', () => {
    const history = Array.from({ length: 40 }, (_, i) =>
      makeMsg(i % 2 === 0 ? 'user' : 'model', `msg-${i}`)
    );
    const result = truncateHistory(history);
    expect(result.length).toBeLessThanOrEqual(MAX_CONTEXT_MESSAGES + 1);
    expect(result[result.length - 1].parts[0].text).toBe('msg-39');
  });

  it('prepends a summary message when truncated', () => {
    const history = Array.from({ length: 40 }, (_, i) =>
      makeMsg(i % 2 === 0 ? 'user' : 'model', `msg-${i}`)
    );
    const result = truncateHistory(history);
    expect(result[0].parts[0].text).toContain('[Earlier conversation summary');
  });

  it('handles empty history', () => {
    const result = truncateHistory([]);
    expect(result).toEqual([]);
  });
});
