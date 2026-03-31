/**
 * Auto-Digest Orchestrator — AI Classification Gate
 *
 * Lightweight AI call that reads RSS title + summary to determine if an
 * article is actionable threat research vs noise (marketing, events,
 * product announcements).  Supports Gemini, OpenAI, and Anthropic models.
 */

import type { ClassificationResult, JobResultSummary } from './types.ts';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const AI_TIMEOUT_MS = 15_000;
const AI_TEMPERATURE = 0.1;
const AI_MAX_TOKENS = 500;
const CONFIDENCE_THRESHOLD = 0.6;

// ---------------------------------------------------------------------------
// Classification Prompt
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are a threat intelligence classifier. Given an article title, snippet, and source vendor, determine whether the article is actionable threat research or noise.

Respond with ONLY valid JSON (no markdown fences, no explanation):
{
  "is_threat_research": true or false,
  "category": "threat_research" | "product_announcement" | "marketing" | "event" | "case_study" | "opinion" | "quarterly_report" | "other",
  "threat_actors": [],
  "campaign_keywords": [],
  "targeted_industries": [],
  "targeted_platforms": [],
  "confidence": 0.0 to 1.0,
  "skip_reason": null or "string explaining why this is not threat research"
}

Classification rules:
- "threat_research": describes TTPs, campaigns, vulnerabilities, malware analysis, or threat actor activity
- "product_announcement": vendor releasing/updating a product
- "marketing": promotional content, webinars, demos
- "event": conferences, meetups, CFPs
- "case_study": customer success stories
- "opinion": editorials, thought leadership without technical substance
- "quarterly_report": periodic roundups without novel intelligence
- "other": anything else that is not threat research`;

function buildUserPrompt(title: string, snippet: string, vendor: string): string {
  return `Vendor: ${vendor}\nTitle: ${title}\nSnippet: ${snippet}`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Classify a batch of harvested feed entries using AI.
 *
 * 1. Fetches entries + parent feed name from Supabase
 * 2. Calls the configured AI model for each entry
 * 3. Updates digest_status to 'classified' (passed) or 'skipped'
 * 4. Mutates `result` with running totals
 *
 * @returns Array of entry IDs that passed the classification gate.
 */
export async function classifyEntries(
  supabase: any,
  entryIds: string[],
  userId: string,
  model: string,
  result: JobResultSummary,
): Promise<string[]> {
  if (entryIds.length === 0) return [];

  // 1. Fetch entries with feed name
  const { data: entries, error: fetchError } = await supabase
    .from('threat_intel_feed_entries')
    .select('id, title, content, url, feed_id, threat_intel_feeds(name)')
    .in('id', entryIds);

  if (fetchError) {
    result.errors.push(`Classification fetch failed: ${fetchError.message}`);
    return [];
  }

  if (!entries || entries.length === 0) return [];

  const passedIds: string[] = [];

  // 2. Classify each entry
  for (const entry of entries) {
    try {
      const vendorName =
        (entry.threat_intel_feeds as any)?.name || 'Unknown Vendor';
      const snippet = (entry.content || '').slice(0, 1000);
      const userPrompt = buildUserPrompt(entry.title, snippet, vendorName);

      const classification = await callAI(model, userPrompt);

      result.articles_classified += 1;

      // 3. Gate: is_threat_research AND confidence >= threshold
      if (
        classification.is_threat_research === true &&
        classification.confidence >= CONFIDENCE_THRESHOLD
      ) {
        await supabase
          .from('threat_intel_feed_entries')
          .update({
            digest_status: 'classified',
            classification,
          })
          .eq('id', entry.id);

        passedIds.push(entry.id);
        result.articles_passed_gate += 1;
      } else {
        await supabase
          .from('threat_intel_feed_entries')
          .update({
            digest_status: 'skipped',
            skip_reason: classification.skip_reason || classification.category,
          })
          .eq('id', entry.id);

        result.articles_skipped += 1;
      }
    } catch (err: any) {
      const msg = `Classify ${entry.id}: ${err.message || 'Unknown error'}`;
      console.error(`[classifier] ${msg}`);
      result.errors.push(msg);
      // Leave as 'harvested' so it retries on the next run
    }
  }

  return passedIds;
}

// ---------------------------------------------------------------------------
// AI Provider Routing
// ---------------------------------------------------------------------------

async function callAI(model: string, userPrompt: string): Promise<ClassificationResult> {
  let rawText: string;

  if (model.startsWith('gemini')) {
    rawText = await callGemini(model, userPrompt);
  } else if (model.startsWith('gpt')) {
    rawText = await callOpenAI(model, userPrompt);
  } else if (model.startsWith('claude')) {
    rawText = await callAnthropic(model, userPrompt);
  } else {
    throw new Error(`Unsupported model prefix: ${model}`);
  }

  return parseClassificationJSON(rawText);
}

// ---------------------------------------------------------------------------
// Gemini
// ---------------------------------------------------------------------------

async function callGemini(model: string, userPrompt: string): Promise<string> {
  const apiKey = Deno.env.get('GOOGLE_AI_API_KEY');
  if (!apiKey) throw new Error('GOOGLE_AI_API_KEY not set');

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const body = {
    contents: [
      { role: 'user', parts: [{ text: `${SYSTEM_PROMPT}\n\n${userPrompt}` }] },
    ],
    generationConfig: {
      temperature: AI_TEMPERATURE,
      maxOutputTokens: AI_MAX_TOKENS,
      responseMimeType: 'application/json',
    },
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(AI_TIMEOUT_MS),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gemini ${res.status}: ${text.slice(0, 200)}`);
  }

  const json = await res.json();
  return json.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

// ---------------------------------------------------------------------------
// OpenAI
// ---------------------------------------------------------------------------

async function callOpenAI(model: string, userPrompt: string): Promise<string> {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) throw new Error('OPENAI_API_KEY not set');

  const body = {
    model,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
    temperature: AI_TEMPERATURE,
    max_tokens: AI_MAX_TOKENS,
    response_format: { type: 'json_object' },
  };

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(AI_TIMEOUT_MS),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenAI ${res.status}: ${text.slice(0, 200)}`);
  }

  const json = await res.json();
  return json.choices?.[0]?.message?.content || '';
}

// ---------------------------------------------------------------------------
// Anthropic
// ---------------------------------------------------------------------------

async function callAnthropic(model: string, userPrompt: string): Promise<string> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');

  const body = {
    model,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userPrompt }],
    temperature: AI_TEMPERATURE,
    max_tokens: AI_MAX_TOKENS,
  };

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(AI_TIMEOUT_MS),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Anthropic ${res.status}: ${text.slice(0, 200)}`);
  }

  const json = await res.json();
  return json.content?.[0]?.text || '';
}

// ---------------------------------------------------------------------------
// JSON Parsing
// ---------------------------------------------------------------------------

function parseClassificationJSON(raw: string): ClassificationResult {
  // Try direct parse first
  try {
    return JSON.parse(raw) as ClassificationResult;
  } catch {
    // Fall through to regex extraction
  }

  // Extract JSON from markdown fences or surrounding text
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error(`No JSON object found in AI response: ${raw.slice(0, 200)}`);
  }

  return JSON.parse(match[0]) as ClassificationResult;
}
