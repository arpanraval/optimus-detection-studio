import { describe, expect, it } from 'vitest'
import {
  CANONICAL_IOC_TYPES,
  canonicalizeIoCType,
  squashIoCType,
} from '../ioc-type'
import { IOC_TYPE_TO_CATEGORY, getIoCCategory } from '../../threat-intel-digest-v2/lib/types'
import { getStixPattern } from '../../../../src/lib/threatIntel/stix'

describe('canonicalizeIoCType', () => {
  // The exact values in the database: 490 sha-256 against 25 sha256,
  // 56 sha-1 against 13 sha1.
  it('resolves the separator variants that reached production', () => {
    expect(canonicalizeIoCType('sha-256').type).toBe('sha256')
    expect(canonicalizeIoCType('sha256').type).toBe('sha256')
    expect(canonicalizeIoCType('sha-1').type).toBe('sha1')
    expect(canonicalizeIoCType('sha1').type).toBe('sha1')
    expect(canonicalizeIoCType('md5').type).toBe('md5')
  })

  // The point of a squash rule over an alias table: variants nobody listed.
  it('resolves separator variants that were never enumerated', () => {
    for (const variant of ['SHA-256', 'SHA_256', 'SHA 256', 'Sha256', 'sha.256']) {
      expect(canonicalizeIoCType(variant).type).toBe('sha256')
    }
    expect(canonicalizeIoCType('SHA-512').type).toBe('sha512')
    expect(canonicalizeIoCType('user-agent').type).toBe('user_agent')
    expect(canonicalizeIoCType('File Name').type).toBe('file_name')
  })

  it('leaves already-canonical types untouched', () => {
    for (const type of CANONICAL_IOC_TYPES) {
      const result = canonicalizeIoCType(type)
      expect(result.recognized).toBe(true)
      expect(result.type).toBe(type)
    }
  })

  // An unknown type keeps what the model said rather than being coerced to
  // 'other'. Coercion would destroy the only record of the vocabulary gap.
  it('preserves an unrecognised type and reports it as unrecognised', () => {
    const result = canonicalizeIoCType('Blake2b')
    expect(result.recognized).toBe(false)
    expect(result.type).toBe('blake2b')
  })

  it('handles empty and missing input without inventing a type', () => {
    expect(canonicalizeIoCType('')).toEqual({ type: '', recognized: false })
    expect(canonicalizeIoCType(null)).toEqual({ type: '', recognized: false })
    expect(canonicalizeIoCType(undefined)).toEqual({ type: '', recognized: false })
  })

  // Squashing is only safe if it cannot merge two genuinely distinct types.
  // `registry`/`registry_key` and `file_path`/`file_path_win` are the pairs
  // this would break first.
  it('never collapses two distinct canonical types onto one skeleton', () => {
    const bySkeleton = new Map<string, string[]>()
    for (const type of CANONICAL_IOC_TYPES) {
      const skeleton = squashIoCType(type)
      bySkeleton.set(skeleton, [...(bySkeleton.get(skeleton) ?? []), type])
    }
    const collisions = [...bySkeleton.entries()].filter(([, types]) => types.length > 1)
    expect(collisions).toEqual([])
  })
})

/**
 * Cross-runtime guard. The Deno edge functions write indicator types and the
 * browser bundle exports them. They now share one canonicaliser, but each
 * still owns its own downstream table -- if those tables key on spellings the
 * canonicaliser does not produce, the entries are unreachable.
 */
describe('vocabulary consistency across runtimes', () => {
  it('every category-map key is a canonical spelling', () => {
    const unreachable = Object.keys(IOC_TYPE_TO_CATEGORY)
      .filter((key) => canonicalizeIoCType(key).type !== key)
    expect(unreachable).toEqual([])
  })

  it('categorises hashes regardless of the spelling stored', () => {
    // The live defect: 25 stored hashes sit in 'other' because `sha-256`
    // missed every key of a map written in canonical spelling.
    expect(getIoCCategory('sha-256')).toBe('hashes')
    expect(getIoCCategory('sha256')).toBe('hashes')
    expect(getIoCCategory('sha-1')).toBe('hashes')
    expect(getIoCCategory('SHA-512')).toBe('hashes')
  })

  it('still reports a genuinely unknown type as other', () => {
    expect(getIoCCategory('blake2b')).toBe('other')
  })
})

describe('STIX export against stored spellings', () => {
  // 490 sha-256 and 56 sha-1 indicators exported as base64
  // `artifact:payload_bin` blobs because the switch is written in canonical
  // spelling. This must hold for legacy rows without any backfill.
  it('emits a file-hash pattern for the non-canonical spelling', () => {
    expect(getStixPattern({ type: 'sha-256', value: 'abc123' }))
      .toBe("[file:hashes.'SHA-256' = 'abc123']")
    expect(getStixPattern({ type: 'sha-1', value: 'abc123' }))
      .toBe("[file:hashes.'SHA-1' = 'abc123']")
  })

  it('is unchanged for spellings that already worked', () => {
    expect(getStixPattern({ type: 'sha256', value: 'abc123' }))
      .toBe("[file:hashes.'SHA-256' = 'abc123']")
    expect(getStixPattern({ type: 'ipv4', value: '1.2.3.4' }))
      .toBe("[ipv4-addr:value = '1.2.3.4']")
  })

  it('still falls back to an artifact for a genuinely unknown type', () => {
    expect(getStixPattern({ type: 'blake2b', value: 'abc' })).toContain('artifact:payload_bin')
  })
})
