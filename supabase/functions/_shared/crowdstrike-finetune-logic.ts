export type CrowdStrikeFinetuneConfidence = 'high' | 'medium' | 'low'

export interface CrowdStrikeFinetuneRefinement {
  level: number
  title: string
  cql: string
  measured_hit_count: number
  noise_reduction_pct: number
  reasoning: string
  coverage_tradeoff: string
  confidence: CrowdStrikeFinetuneConfidence
}

export interface CrowdStrikeFinetuneLadder {
  summary: string
  baseline_hit_count: number
  refinements: CrowdStrikeFinetuneRefinement[]
}

export type CrowdStrikeLadderValidation =
  | { ok: true; ladder: CrowdStrikeFinetuneLadder }
  | { ok: false; reason: string }

export function validateCrowdStrikeLadder(input: unknown): CrowdStrikeLadderValidation {
  if (!input || typeof input !== 'object') return { ok: false, reason: 'Payload is not an object.' }
  const value = input as Record<string, unknown>
  if (typeof value.summary !== 'string' || !value.summary.trim()) {
    return { ok: false, reason: 'summary must be a non-empty string.' }
  }
  if (!Number.isFinite(value.baseline_hit_count)) {
    return { ok: false, reason: 'baseline_hit_count must be a number.' }
  }
  if (!Array.isArray(value.refinements) || value.refinements.length < 2 || value.refinements.length > 3) {
    return { ok: false, reason: 'Provide exactly 2 or 3 refinements.' }
  }

  const refinements: CrowdStrikeFinetuneRefinement[] = []
  let lastReduction = -Infinity
  for (let index = 0; index < value.refinements.length; index += 1) {
    const item = value.refinements[index] as Record<string, unknown>
    const label = `refinement ${index + 1}`
    if (!item || typeof item !== 'object') return { ok: false, reason: `${label}: must be an object.` }
    if (typeof item.title !== 'string' || !item.title.trim()) {
      return { ok: false, reason: `${label}: title is required.` }
    }
    if (typeof item.cql !== 'string' || !item.cql.trim()) {
      return { ok: false, reason: `${label}: cql is required.` }
    }
    if (!Number.isFinite(item.measured_hit_count)) {
      return { ok: false, reason: `${label}: measured_hit_count must be measured.` }
    }
    if (!Number.isFinite(item.noise_reduction_pct)) {
      return { ok: false, reason: `${label}: noise_reduction_pct must be a number.` }
    }
    const reduction = item.noise_reduction_pct as number
    if (reduction < 0 || reduction > 100 || reduction < lastReduction) {
      return { ok: false, reason: `${label}: noise reduction must increase from 0 to 100.` }
    }
    if (typeof item.reasoning !== 'string' || !item.reasoning.trim()) {
      return { ok: false, reason: `${label}: reasoning is required.` }
    }
    if (typeof item.coverage_tradeoff !== 'string' || !item.coverage_tradeoff.trim()) {
      return { ok: false, reason: `${label}: coverage_tradeoff is required.` }
    }
    if (item.confidence !== 'high' && item.confidence !== 'medium' && item.confidence !== 'low') {
      return { ok: false, reason: `${label}: confidence must be high, medium, or low.` }
    }
    lastReduction = reduction
    refinements.push({
      level: typeof item.level === 'number' ? item.level : index + 1,
      title: item.title,
      cql: item.cql,
      measured_hit_count: item.measured_hit_count as number,
      noise_reduction_pct: reduction,
      reasoning: item.reasoning,
      coverage_tradeoff: item.coverage_tradeoff,
      confidence: item.confidence,
    })
  }
  return {
    ok: true,
    ladder: {
      summary: value.summary,
      baseline_hit_count: value.baseline_hit_count as number,
      refinements,
    },
  }
}

export type CrowdStrikeFinetuneTimelineEvent =
  | { kind: 'message'; id: string; text: string }
  | { kind: 'thinking'; id: string; text: string }
  | {
      kind: 'query'
      id: string
      toolUseId: string
      purpose: string
      cql: string
      status: 'pending' | 'done'
      rowCount: number | null
      isError: boolean
    }
  | { kind: 'submit'; id: string; toolUseId: string; status: 'pending' | 'done' }

export interface CrowdStrikePendingTool {
  toolUseId: string
  toolName: string
  toolInput: Record<string, unknown>
}

interface UsageTotals {
  input_tokens: number
  output_tokens: number
  cache_read_input_tokens: number
}

type AgentEvent = Record<string, unknown>

function firstText(content: unknown): string {
  if (!Array.isArray(content)) return ''
  const block = content.find(
    (item) => item && typeof item === 'object' && (item as AgentEvent).type === 'text',
  )
  return block ? String((block as AgentEvent).text ?? '') : ''
}

export function normalizeCrowdStrikeEvents(events: AgentEvent[]): {
  timeline: CrowdStrikeFinetuneTimelineEvent[]
  pendingTools: CrowdStrikePendingTool[]
  queryCount: number
  usage: UsageTotals
} {
  const timeline: CrowdStrikeFinetuneTimelineEvent[] = []
  const usage: UsageTotals = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0 }
  const toolIndex = new Map<string, number>()
  const resolved = new Set<string>()
  let queryCount = 0

  for (const event of events) {
    const id = String(event.id ?? '')
    const type = String(event.type ?? '')
    if (type === 'agent.message') {
      const message = firstText(event.content)
      if (message.trim()) timeline.push({ kind: 'message', id, text: message })
    } else if (type === 'agent.thinking') {
      const thinking = String(event.thinking ?? firstText(event.content))
      if (thinking.trim()) timeline.push({ kind: 'thinking', id, text: thinking })
    } else if (type === 'agent.custom_tool_use') {
      const name = String(event.name ?? '')
      const input = (event.input ?? {}) as Record<string, unknown>
      if (name === 'run_ngsiem_query') {
        queryCount += 1
        toolIndex.set(id, timeline.length)
        timeline.push({
          kind: 'query',
          id,
          toolUseId: id,
          purpose: String(input.purpose ?? 'Querying CrowdStrike NGSIEM'),
          cql: String(input.query ?? ''),
          status: 'pending',
          rowCount: null,
          isError: false,
        })
      } else if (name === 'submit_crowdstrike_refinement_ladder') {
        toolIndex.set(id, timeline.length)
        timeline.push({ kind: 'submit', id, toolUseId: id, status: 'pending' })
      }
    } else if (type === 'user.custom_tool_result') {
      const toolUseId = String(event.custom_tool_use_id ?? '')
      resolved.add(toolUseId)
      const index = toolIndex.get(toolUseId)
      if (index === undefined) continue
      const row = timeline[index]
      if (row.kind === 'query') {
        row.status = 'done'
        row.isError = event.is_error === true
        try {
          const parsed = JSON.parse(firstText(event.content))
          row.rowCount = typeof parsed?.row_count === 'number' ? parsed.row_count : null
        } catch {
          row.rowCount = null
        }
      } else if (row.kind === 'submit') {
        row.status = 'done'
      }
    } else if (type === 'span.model_request_end') {
      const modelUsage = (event.model_usage ?? {}) as Record<string, unknown>
      usage.input_tokens += Number(modelUsage.input_tokens ?? 0)
      usage.output_tokens += Number(modelUsage.output_tokens ?? 0)
      usage.cache_read_input_tokens += Number(modelUsage.cache_read_input_tokens ?? 0)
    }
  }

  const pendingTools = events
    .filter((event) => event.type === 'agent.custom_tool_use' && !resolved.has(String(event.id ?? '')))
    .map((event) => ({
      toolUseId: String(event.id ?? ''),
      toolName: String(event.name ?? ''),
      toolInput: (event.input ?? {}) as Record<string, unknown>,
    }))

  return { timeline, pendingTools, queryCount, usage }
}

export function buildCrowdStrikeKickoffMessage(args: {
  detectionName: string
  repository: string
  windowDays: number
  baselineHitCount: number
  originalQuery: string
  sample: unknown
}): string {
  const sample = args.sample
    ? `\n\nSample events from the successful pre-flight:\n${JSON.stringify(args.sample)}`
    : ''
  return [
    'A CrowdStrike Falcon NGSIEM detection produced too many matches. Finetune its LogScale CQL.',
    '',
    `Detection: ${args.detectionName}`,
    `Repository: ${args.repository}`,
    `Backtest window: ${args.windowDays} days`,
    `Baseline matches: ${args.baselineHitCount}`,
    '',
    'Original CQL:',
    '~~~cql',
    args.originalQuery,
    '~~~',
    sample,
    '',
    'Use run_ngsiem_query to investigate and measure every candidate. Submit a 2-3 level ladder with submit_crowdstrike_refinement_ladder.',
  ].join('\n')
}

export function capCrowdStrikeFinetuneResult(events: Record<string, unknown>[]): {
  row_count: number
  results: Record<string, unknown>[]
  truncated: boolean
} {
  return {
    row_count: events.length,
    results: events.slice(0, 50),
    truncated: events.length > 50,
  }
}
