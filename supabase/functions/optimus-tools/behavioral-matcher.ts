// supabase/functions/optimus-tools/behavioral-matcher.ts

import { RANSOMWARE_KILL_CHAIN, RANSOMWARE_ADJACENT_TECHNIQUES } from './ransomware-killchain.ts';
import type { KillChainPhase, BehaviorPattern } from './ransomware-killchain.ts';

// --- Types (match spec exactly) ---

interface MatchedDetection {
  detection_id: string;
  name: string;
  status: string;
  quality_score: number;
  query_language: string;
  behavior_matched: string;
  match_source: 'keyword' | 'ai';
  additional_count: number;
}

interface PhaseResult {
  phase_id: string;
  phase_name: string;
  phase_number: number;
  status: 'covered' | 'partially_covered' | 'blind_spot';
  detections: MatchedDetection[];
  gaps: string[];
  phase_context: string;
}

interface RansomwareAssessment {
  phases: PhaseResult[];
  executive_summary: string | null;
  recommendations: string | null;
  metadata: {
    total_detections_scanned: number;
    total_matched: number;
    keyword_matches: number;
    ai_matches: number;
    phases_with_coverage: number;
    phases_blind: number;
    ai_evaluation_skipped?: boolean;
    ai_error?: string;
  };
}

// --- Detection interface (what we fetch from DB) ---

interface DetectionRow {
  id: string;
  name: string;
  description: string;
  status: string;
  qualityScore: number;
  queryLanguage: string;
  detectionQuery: string;
  queries: any;  // JSONB
  mitreAttackIds: string[];
}

// --- Layer 1: Keyword matching ---

interface KeywordMatch {
  detection_id: string;
  phase_id: string;
  behavior_label: string;
}

function getQueryTexts(detection: DetectionRow): string[] {
  const texts: string[] = [];
  if (detection.queries && Array.isArray(detection.queries)) {
    for (const q of detection.queries) {
      if (q.query) texts.push(q.query);
    }
  }
  if (texts.length === 0 && detection.detectionQuery) {
    texts.push(detection.detectionQuery);
  }
  return texts;
}

function runKeywordMatching(detections: DetectionRow[]): KeywordMatch[] {
  const matches: KeywordMatch[] = [];

  for (const detection of detections) {
    const nameDesc = `${detection.name || ''} ${detection.description || ''}`;
    const queryTexts = getQueryTexts(detection);
    const allText = `${nameDesc} ${queryTexts.join(' ')}`;

    for (const phase of RANSOMWARE_KILL_CHAIN) {
      for (const behavior of phase.behaviors) {
        const matched = behavior.patterns.some(pattern => pattern.test(allText));
        if (matched) {
          matches.push({
            detection_id: detection.id,
            phase_id: phase.id,
            behavior_label: behavior.label,
          });
        }
      }
    }
  }

  return matches;
}

// --- Layer 2: AI evaluation ---

async function runAIEvaluation(
  unmatchedDetections: DetectionRow[],
  geminiApiKey: string
): Promise<{ matches: KeywordMatch[]; skipped: boolean; error?: string }> {
  // Filter to detections with ransomware-adjacent MITRE mappings
  const candidates = unmatchedDetections.filter(d => {
    const ids = d.mitreAttackIds || [];
    return ids.some(id => RANSOMWARE_ADJACENT_TECHNIQUES.has(id));
  });

  if (candidates.length === 0) {
    return { matches: [], skipped: false };
  }

  // Batch to max 30 detections to keep prompt reasonable
  const batch = candidates.slice(0, 30);
  const phaseIds = RANSOMWARE_KILL_CHAIN.map(p => p.id).join(', ');

  const prompt = `You are a detection engineer. For each detection below, determine which ransomware kill chain phases it is relevant to. Only classify as relevant if the detection SPECIFICALLY targets ransomware-related behavior, not generic activity.

Phases: ${phaseIds}

For each detection, return JSON: { "id": "...", "phases": ["phase_id", ...] }
If not ransomware-relevant, return: { "id": "...", "phases": [] }

Return a JSON array of results. ONLY valid JSON, no markdown.

Detections:
${JSON.stringify(batch.map(d => ({
  id: d.id,
  name: d.name,
  description: (d.description || '').slice(0, 200),
  query_snippet: getQueryTexts(d)[0]?.slice(0, 200) || '',
})))}`;

  try {
    const response = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': geminiApiKey },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 4000, responseMimeType: 'application/json' },
        }),
      }
    );

    if (!response.ok) {
      return { matches: [], skipped: true, error: `Gemini API ${response.status}` };
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return { matches: [], skipped: true, error: 'Empty AI response' };

    const results: Array<{ id: string; phases: string[] }> = JSON.parse(text);
    const aiMatches: KeywordMatch[] = [];

    for (const result of results) {
      for (const phaseId of result.phases) {
        // Map phase to a behavior label (use "AI-classified" since we don't know which specific behavior)
        const phase = RANSOMWARE_KILL_CHAIN.find(p => p.id === phaseId);
        if (phase) {
          aiMatches.push({
            detection_id: result.id,
            phase_id: phaseId,
            behavior_label: `AI-classified: ${phase.name} relevance`,
          });
        }
      }
    }

    return { matches: aiMatches, skipped: false };
  } catch (err) {
    return { matches: [], skipped: true, error: String(err) };
  }
}

// --- AI Report Generation ---

async function generateSummaryAndRecommendations(
  phases: PhaseResult[],
  geminiApiKey: string
): Promise<{ executive_summary: string | null; recommendations: string | null }> {
  // Build concise phase summary for the AI
  const phaseSummary = phases.map(p => ({
    phase: p.phase_name,
    status: p.status,
    detected_behaviors: p.detections.map(d => d.behavior_matched),
    missing_behaviors: p.gaps,
  }));

  const prompt = `Based on this ransomware readiness assessment, write two sections as JSON:

1. "executive_summary": 3-4 paragraph executive summary. Focus on which kill chain phases are covered vs blind spots. Early-phase gaps (Initial Access, Credential Access, Lateral Movement) are more dangerous than late-phase (Impact). Be specific — reference actual phase names and behaviors. Do NOT invent data.

2. "recommendations": 5-7 specific recommendations as a markdown numbered list. For each: what detection to build, what behavior it covers, which phase it addresses, and WHY it matters. Order by impact — early kill chain gaps first.

Assessment data:
${JSON.stringify(phaseSummary)}

Return ONLY valid JSON with keys "executive_summary" and "recommendations" (both strings).`;

  try {
    const response = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': geminiApiKey },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 3000, responseMimeType: 'application/json' },
        }),
      }
    );

    if (!response.ok) return { executive_summary: null, recommendations: null };

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return { executive_summary: null, recommendations: null };

    const result = JSON.parse(text);
    return {
      executive_summary: result.executive_summary || null,
      recommendations: result.recommendations || null,
    };
  } catch {
    return { executive_summary: null, recommendations: null };
  }
}

// --- Main orchestrator ---

const STATUS_RANK: Record<string, number> = {
  'Production': 4, 'Testing': 3, 'Review': 2, 'Development': 1, 'Draft': 0, 'Backlog': 0,
};

export async function runRansomwareAssessment(
  supabaseClient: any,
  geminiApiKey: string | null
): Promise<RansomwareAssessment> {
  // 1. Fetch all user detections
  const { data: detections, error } = await supabaseClient
    .from('detections')
    .select('id, name, description, status, "qualityScore", "queryLanguage", "detectionQuery", queries, "mitreAttackIds"')
    .eq('library_type', 'user');

  if (error) throw new Error(`Failed to fetch detections: ${error.message}`);
  const allDetections: DetectionRow[] = (detections || []).map((d: any) => ({
    id: d.id,
    name: d.name,
    description: d.description,
    status: d.status,
    qualityScore: d.qualityScore || 0,
    queryLanguage: d.queryLanguage || 'Unknown',
    detectionQuery: d.detectionQuery || '',
    queries: d.queries,
    mitreAttackIds: d.mitreAttackIds || [],
  }));

  // 2. Layer 1: keyword matching
  const keywordMatches = runKeywordMatching(allDetections);
  const matchedDetectionIds = new Set(keywordMatches.map(m => m.detection_id));

  // 3. Layer 2: AI evaluation (if API key available)
  let aiMatches: KeywordMatch[] = [];
  let aiSkipped = false;
  let aiError: string | undefined;

  if (geminiApiKey) {
    const unmatched = allDetections.filter(d => !matchedDetectionIds.has(d.id));
    const aiResult = await runAIEvaluation(unmatched, geminiApiKey);
    aiMatches = aiResult.matches;
    aiSkipped = aiResult.skipped;
    aiError = aiResult.error;
  } else {
    aiSkipped = true;
    aiError = 'No Gemini API key configured';
  }

  const allMatches = [...keywordMatches, ...aiMatches];

  // 4. Assemble per-phase results
  const detectionMap = new Map(allDetections.map(d => [d.id, d]));

  const phases: PhaseResult[] = RANSOMWARE_KILL_CHAIN.map(phase => {
    const phaseMatches = allMatches.filter(m => m.phase_id === phase.id);

    // Group by behavior, pick best detection per behavior
    const behaviorMap = new Map<string, { matches: typeof phaseMatches; best: DetectionRow | null }>();
    for (const behavior of phase.behaviors) {
      behaviorMap.set(behavior.label, { matches: [], best: null });
    }
    // Also handle AI-classified behaviors
    for (const match of phaseMatches) {
      const existing = behaviorMap.get(match.behavior_label);
      if (existing) {
        existing.matches.push(match);
      } else {
        behaviorMap.set(match.behavior_label, { matches: [match], best: null });
      }
    }

    const matchedDetections: MatchedDetection[] = [];
    const matchedBehaviorLabels = new Set<string>();

    for (const [label, data] of behaviorMap) {
      if (data.matches.length === 0) continue;
      matchedBehaviorLabels.add(label);

      // Find best detection (highest status rank)
      const detectionsForBehavior = data.matches
        .map(m => ({ ...detectionMap.get(m.detection_id)!, match: m }))
        .filter(d => d.id)
        .sort((a, b) => (STATUS_RANK[b.status] || 0) - (STATUS_RANK[a.status] || 0));

      if (detectionsForBehavior.length > 0) {
        const best = detectionsForBehavior[0];
        matchedDetections.push({
          detection_id: best.id,
          name: best.name,
          status: best.status,
          quality_score: best.qualityScore,
          query_language: best.queryLanguage,
          behavior_matched: label,
          match_source: keywordMatches.some(km => km.detection_id === best.id && km.phase_id === phase.id) ? 'keyword' : 'ai',
          additional_count: detectionsForBehavior.length - 1,
        });
      }
    }

    // Gaps: behaviors with no matches
    const gaps = phase.behaviors
      .map(b => b.label)
      .filter(label => !matchedBehaviorLabels.has(label));

    const status: PhaseResult['status'] =
      gaps.length === 0 ? 'covered' :
      matchedDetections.length === 0 ? 'blind_spot' :
      'partially_covered';

    return {
      phase_id: phase.id,
      phase_name: phase.name,
      phase_number: phase.number,
      status,
      detections: matchedDetections,
      gaps,
      phase_context: phase.context,
    };
  });

  // 5. Generate AI summary + recommendations
  let executive_summary: string | null = null;
  let recommendations: string | null = null;

  if (geminiApiKey) {
    const aiReport = await generateSummaryAndRecommendations(phases, geminiApiKey);
    executive_summary = aiReport.executive_summary;
    recommendations = aiReport.recommendations;
  }

  // 6. Build metadata
  const totalMatched = new Set(allMatches.map(m => m.detection_id)).size;

  return {
    phases,
    executive_summary,
    recommendations,
    metadata: {
      total_detections_scanned: allDetections.length,
      total_matched: totalMatched,
      keyword_matches: new Set(keywordMatches.map(m => m.detection_id)).size,
      ai_matches: new Set(aiMatches.map(m => m.detection_id)).size,
      phases_with_coverage: phases.filter(p => p.status !== 'blind_spot').length,
      phases_blind: phases.filter(p => p.status === 'blind_spot').length,
      ...(aiSkipped ? { ai_evaluation_skipped: true, ai_error: aiError } : {}),
    },
  };
}
