// supabase/functions/threat-research-orchestrator/lib/__tests__/checkpoint.test.ts
//
// The checkpoint decisions carry the interesting failure modes, so they are
// pure functions and tested directly. Each guard exists because the naive
// version of resume is actively worse than not resuming at all.

import { describe, it, expect } from 'vitest';
import {
  decideRestore,
  decideSave,
  CHECKPOINT_SCHEMA_VERSION,
  MAX_CHECKPOINT_BYTES,
  MAX_CHECKPOINT_RESTORES,
  type StoredCheckpoint,
} from '../agents/checkpoint.ts';

function stored(overrides: Partial<StoredCheckpoint> = {}): StoredCheckpoint {
  return {
    schema_version: CHECKPOINT_SCHEMA_VERSION,
    iteration: 2,
    restore_count: 0,
    messages: [{ role: 'user', content: 'hello' }],
    ...overrides,
  } as StoredCheckpoint;
}

describe('decideRestore', () => {
  it('resumes a healthy checkpoint', () => {
    expect(decideRestore(stored())).toEqual({ restore: true });
  });

  it('starts clean when there is nothing stored', () => {
    expect(decideRestore(null)).toEqual({ restore: false, reason: 'no_checkpoint' });
  });

  it('discards a checkpoint written by a different code version', () => {
    // Replaying a message shape the running parser no longer understands turns
    // a recoverable job into a confusing one. Deploys happen mid-session.
    const decision = decideRestore(stored({ schema_version: CHECKPOINT_SCHEMA_VERSION + 1 }));
    expect(decision).toEqual({ restore: false, reason: 'schema_mismatch' });
  });

  it('stops resuming a conversation that has already been resumed too often', () => {
    // If the conversation is itself why the job fails -- a malformed turn, a
    // tool result the model chokes on -- resuming forever spends every retry
    // hitting the same wall.
    const decision = decideRestore(stored({ restore_count: MAX_CHECKPOINT_RESTORES }));
    expect(decision).toEqual({ restore: false, reason: 'restore_cap_reached' });
  });

  it('allows the final permitted restore', () => {
    expect(decideRestore(stored({ restore_count: MAX_CHECKPOINT_RESTORES - 1 })).restore).toBe(true);
  });

  it('rejects an empty or malformed message list', () => {
    expect(decideRestore(stored({ messages: [] })).reason).toBe('empty');
    expect(decideRestore(stored({ messages: null as never })).reason).toBe('empty');
  });
});

describe('decideSave', () => {
  it('saves a normal conversation', () => {
    const decision = decideSave(JSON.stringify([{ role: 'user', content: 'hello' }]));
    expect(decision.save).toBe(true);
    expect(decision.bytes).toBeGreaterThan(0);
  });

  it('skips an oversized conversation rather than truncating it', () => {
    // Truncation would resume into a message list the model cannot follow --
    // strictly worse than restarting, which is the current behaviour anyway.
    const decision = decideSave('x'.repeat(MAX_CHECKPOINT_BYTES + 1));
    expect(decision.save).toBe(false);
    expect(decision.reason).toBe('too_large');
  });

  it('accepts a conversation exactly at the limit', () => {
    expect(decideSave('x'.repeat(MAX_CHECKPOINT_BYTES)).save).toBe(true);
  });
});
