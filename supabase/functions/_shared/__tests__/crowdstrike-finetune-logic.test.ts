import { describe, expect, it } from 'vitest'
import {
  buildCrowdStrikeKickoffMessage,
  normalizeCrowdStrikeEvents,
  validateCrowdStrikeLadder,
} from '../crowdstrike-finetune-logic'
import { validateBoundedCrowdStrikeCql } from '../crowdstrike-finetune-query'

describe('CrowdStrike finetune logic', () => {
  it('accepts a measured CQL refinement ladder', () => {
    const result = validateCrowdStrikeLadder({
      summary: 'Known installer activity drives the volume.',
      baseline_hit_count: 200,
      refinements: [
        {
          level: 1,
          title: 'Exclude verified installer path',
          cql: '#event_simpleName=DriverLoad FileName!="known.sys" | count()',
          measured_hit_count: 100,
          noise_reduction_pct: 50,
          reasoning: 'The pre-flight sample and grouped query confirmed the path.',
          coverage_tradeoff: 'Could miss abuse of that exact verified path.',
          confidence: 'high',
        },
        {
          level: 2,
          title: 'Exclude verified installer family',
          cql: '#event_simpleName=DriverLoad FileName!="known*" | count()',
          measured_hit_count: 50,
          noise_reduction_pct: 75,
          reasoning: 'The family was measured separately.',
          coverage_tradeoff: 'Could miss a malicious lookalike in the family.',
          confidence: 'medium',
        },
      ],
    })
    expect(result.ok).toBe(true)
  })

  it('rejects KQL-shaped output that omits cql', () => {
    const result = validateCrowdStrikeLadder({
      summary: 'Noise',
      baseline_hit_count: 10,
      refinements: [
        { title: 'One', kql: 'DeviceInfo | take 1' },
        { title: 'Two', kql: 'DeviceInfo | take 1' },
      ],
    })
    expect(result).toEqual({ ok: false, reason: 'refinement 1: cql is required.' })
  })

  it('normalizes CrowdStrike tool events independently', () => {
    const normalized = normalizeCrowdStrikeEvents([
      {
        id: 'tool-1',
        type: 'agent.custom_tool_use',
        name: 'run_ngsiem_query',
        input: { purpose: 'Measure filenames', query: 'FileName=* | groupBy(FileName)' },
      },
      {
        id: 'result-1',
        type: 'user.custom_tool_result',
        custom_tool_use_id: 'tool-1',
        content: [{ type: 'text', text: '{"row_count":4}' }],
        is_error: false,
      },
    ])
    expect(normalized.queryCount).toBe(1)
    expect(normalized.pendingTools).toEqual([])
    expect(normalized.timeline[0]).toMatchObject({ kind: 'query', cql: 'FileName=* | groupBy(FileName)', rowCount: 4 })
  })

  it('requires bounded LogScale query operations', () => {
    expect(validateBoundedCrowdStrikeCql('#event_simpleName=ProcessRollup2')).toContain('bounded')
    expect(validateBoundedCrowdStrikeCql('#event_simpleName=ProcessRollup2 | count()')).toBeNull()
  })

  it('builds a CrowdStrike-specific kickoff', () => {
    const message = buildCrowdStrikeKickoffMessage({
      detectionName: 'Driver load',
      repository: 'search-all',
      windowDays: 30,
      baselineHitCount: 200,
      originalQuery: '#event_simpleName=DriverLoad',
      sample: [],
    })
    expect(message).toContain('CrowdStrike Falcon NGSIEM')
    expect(message).toContain('Original CQL')
    expect(message).not.toContain('Microsoft Defender')
  })
})
