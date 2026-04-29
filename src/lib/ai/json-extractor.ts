/**
 * Extract a JSON object from a free-form AI response.
 *
 * Models without native JSON mode (notably Anthropic Claude) wrap output in
 * various combinations of prose preambles, markdown code fences, and string
 * values that themselves contain backtick-fenced blocks (e.g. a Splunk query
 * inside a ```splunk fence as a JSON string value). Naive fence-stripping
 * picks up the inner fence and discards the outer envelope.
 *
 * The strategy: validate every candidate with JSON.parse before returning.
 * Strategies are tried in order of likelihood; the first one whose extracted
 * substring round-trips through JSON.parse wins.
 *
 *   1. The whole trimmed response is valid JSON.
 *   2. The whole response is wrapped in a single outer code fence.
 *   3. Walk the response left-to-right and yield each balanced top-level
 *      `{...}` block via a string-aware brace counter. Inner backticks and
 *      braces inside JSON string literals can't fool this — the canonical
 *      "fence inside a string value" case lands here.
 *   4. Last resort: iterate over every ```...``` fence and try its body.
 *      We do this last because inner fences are exactly what (3) protects
 *      against; (4) is for messy responses where (3) finds no balanced object.
 */

const WHOLE_FENCE_RE = /^```(?:[a-zA-Z0-9_-]+)?\s*\n?([\s\S]*?)\n?\s*```$/;
const ANY_FENCE_RE = /```(?:[a-zA-Z0-9_-]+)?\s*\n?([\s\S]*?)\n?\s*```/g;

export class AIJsonParseError extends Error {
  constructor(public readonly rawText: string) {
    super('Failed to extract valid JSON from AI response');
    this.name = 'AIJsonParseError';
  }
}

export function parseAIJsonResponse<T = unknown>(text: string): T {
  const trimmed = text.trim();
  if (!trimmed) throw new AIJsonParseError(text);

  // 1. Whole response is valid JSON.
  const direct = tryParse<T>(trimmed);
  if (direct.ok) return direct.value;

  // 2. Whole response is a single outer fence.
  const wholeFence = trimmed.match(WHOLE_FENCE_RE);
  if (wholeFence) {
    const attempt = tryParse<T>(wholeFence[1].trim());
    if (attempt.ok) return attempt.value;
  }

  // 3. String-aware balanced object scan — this is the strategy that
  //    correctly handles outer JSON envelopes containing inner ``` fences.
  for (const candidate of balancedObjects(trimmed)) {
    const attempt = tryParse<T>(candidate);
    if (attempt.ok) return attempt.value;
  }

  // 4. Any fenced block, in document order.
  ANY_FENCE_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = ANY_FENCE_RE.exec(trimmed)) !== null) {
    const attempt = tryParse<T>(match[1].trim());
    if (attempt.ok) return attempt.value;
  }

  throw new AIJsonParseError(text);
}

type ParseResult<T> = { ok: true; value: T } | { ok: false };

function tryParse<T>(s: string): ParseResult<T> {
  try {
    return { ok: true, value: JSON.parse(s) as T };
  } catch {
    return { ok: false };
  }
}

function* balancedObjects(text: string): Generator<string> {
  let cursor = 0;
  while (cursor < text.length) {
    const start = text.indexOf('{', cursor);
    if (start === -1) return;

    let depth = 0;
    let inString = false;
    let escapeNext = false;
    let end = -1;

    for (let i = start; i < text.length; i++) {
      const ch = text[i];
      if (escapeNext) { escapeNext = false; continue; }
      if (ch === '\\') { escapeNext = true; continue; }
      if (ch === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) { end = i; break; }
      }
    }

    if (end === -1) return;
    yield text.slice(start, end + 1);
    cursor = end + 1;
  }
}
