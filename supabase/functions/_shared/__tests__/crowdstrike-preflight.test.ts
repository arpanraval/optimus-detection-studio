import { describe, expect, it } from 'vitest'
import {
  buildCrowdStrikeQueries,
  isCrowdStrikeQueryRepository,
  mapCrowdStrikeQueryError,
  parseCrowdStrikeCount,
  pickCrowdStrikeQuery,
} from '../crowdstrike-preflight'

describe('CrowdStrike NGSIEM pre-flight helpers', () => {
  it('selects CQL and creates bounded count/sample jobs', () => {
    const query = pickCrowdStrikeQuery({
      queries: [{ language: 'CQL', query: '#event_simpleName=ProcessRollup2' }],
      queryLanguage: 'KQL',
      detectionQuery: 'DeviceEvents',
    })
    expect(query).toBe('#event_simpleName=ProcessRollup2')
    expect(buildCrowdStrikeQueries(query || '')).toEqual({
      count: '#event_simpleName=ProcessRollup2\n| count(as=hit_count)',
      sample: '#event_simpleName=ProcessRollup2\n| tail(25)',
    })
  })

  it('validates documented repository values and rejects arbitrary paths', () => {
    expect(isCrowdStrikeQueryRepository('search-all')).toBe(true)
    expect(isCrowdStrikeQueryRepository('forensics_view')).toBe(true)
    expect(isCrowdStrikeQueryRepository('../search-all')).toBe(false)
  })

  it('parses count events and maps NGSIEM scope errors', () => {
    expect(parseCrowdStrikeCount([{ hit_count: '12' }])).toBe(12)
    expect(parseCrowdStrikeCount([])).toBe(0)
    const error = mapCrowdStrikeQueryError(403, '')
    expect(error.status).toBe('permission_denied')
    expect(error.guidance).toContain('NGSIEM: Read')
  })
})
