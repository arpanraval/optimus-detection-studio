# Ransomware Readiness Redesign — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the gimmicky 12-technique binary check with a behavioral assessment across 11 ransomware kill chain phases, using layered keyword + AI matching against the user's actual detection library.

**Architecture:** New `ransomware-killchain.ts` defines 11 phases with behavioral patterns. New `behavioral-matcher.ts` runs Layer 1 keyword matching + Layer 2 AI evaluation in the edge function. The `optimus-tools` edge function gets a new `ransomware_readiness` handler. Frontend gets a `PhaseAssessmentSection` renderer. All other playbooks disabled.

**Tech Stack:** Supabase Edge Functions (Deno), Gemini API for Layer 2 + report generation, React 19 + TypeScript + Tailwind for renderer.

**Spec:** `docs/superpowers/specs/2026-03-23-ransomware-readiness-redesign.md`

---

## File Map

### New Files
| File | Responsibility |
|------|---------------|
| `supabase/functions/optimus-tools/ransomware-killchain.ts` | Kill chain phase definitions: 11 phases, behavioral patterns (regex), phase context strings |
| `supabase/functions/optimus-tools/behavioral-matcher.ts` | Layer 1 keyword matching, Layer 2 AI evaluation, gap identification, result assembly |
| `src/components/playbooks/PhaseAssessmentSection.tsx` | Renderer for per-phase assessment data (replaces raw JSON fallback in PlaybookReport) |

### Modified Files
| File | What Changes |
|------|-------------|
| `supabase/functions/optimus-tools/index.ts` | Add `ransomware_readiness` case to tool switch, import matcher |
| `supabase/functions/run-playbook/index.ts` | Add `ransomware_readiness` to ALLOWED_TOOLS, replace 4-step ransomware definition with 1-step |
| `src/lib/playbooks/types.ts` | Add `disabled?: boolean` and `disabledReason?: string` to Playbook interface |
| `src/lib/playbooks/index.ts` | Update ransomware playbook to 1-step, disable 6 other playbooks |
| `src/components/playbooks/PlaybooksPage.tsx` | Skip disabled playbooks or render greyed out |
| `src/components/playbooks/PlaybookReport.tsx` | Detect assessment data shape, render PhaseAssessmentSection |

---

## Task 1: Define the ransomware kill chain

**Files:**
- Create: `supabase/functions/optimus-tools/ransomware-killchain.ts`

- [ ] **Step 1: Create the kill chain definition file**

This file exports the 11-phase kill chain with behavioral patterns. Each phase has an ID, name, number, context string, and array of behaviors. Each behavior has a label and array of regex patterns.

The file must be Deno-compatible (no Node.js imports). All regex patterns come directly from the spec's "Kill Chain Phases & Behavioral Indicators" section.

```typescript
// supabase/functions/optimus-tools/ransomware-killchain.ts

export interface BehaviorPattern {
  label: string;
  patterns: RegExp[];
}

export interface KillChainPhase {
  id: string;
  name: string;
  number: number;
  context: string;
  behaviors: BehaviorPattern[];
}

export const RANSOMWARE_KILL_CHAIN: KillChainPhase[] = [
  {
    id: 'initial_access',
    name: 'Initial Access',
    number: 1,
    context: 'The entry point. Ransomware operators gain their first foothold through phishing, exposed services, or compromised credentials. Detecting here stops the attack before it starts.',
    behaviors: [
      {
        label: 'Phishing with malicious attachment',
        patterns: [/malicious.*attachment/i, /suspicious.*email.*attach/i, /macro.*enabled/i, /ole.*object/i],
      },
      {
        label: 'Phishing link to payload download',
        patterns: [/phishing.*link/i, /url.*click.*malware/i, /suspicious.*url.*email/i],
      },
      {
        label: 'Exploitation of public-facing application',
        patterns: [/exploit.*public/i, /cve-.*exploit/i, /webshell/i, /web.*shell/i],
      },
      {
        label: 'RDP brute force / credential stuffing',
        patterns: [/rdp.*brute/i, /rdp.*failed.*logon/i, /credential.*stuff/i, /3389.*brute/i],
      },
      {
        label: 'Compromised VPN/remote access',
        patterns: [/vpn.*anomal/i, /vpn.*brute/i, /remote.*access.*suspicious/i],
      },
    ],
  },
  // ... (all 11 phases from the spec)
];
```

Copy ALL 11 phases with ALL behaviors and ALL regex patterns exactly from the spec. Do not omit any phase or behavior.

The `context` string for each phase should explain in 1-2 sentences why this phase matters for ransomware detection (e.g., "Detecting here stops the attack before it starts" for Initial Access, "If you detect here, the encryption has already begun — you've lost the data" for Impact).

Also export the MITRE technique filter list for Layer 2:

```typescript
export const RANSOMWARE_ADJACENT_TECHNIQUES = new Set([
  'T1566', 'T1566.001', 'T1566.002',
  'T1190', 'T1133', 'T1078',
  'T1059', 'T1059.001', 'T1059.003',
  'T1204', 'T1204.001', 'T1204.002',
  'T1047',
  'T1547', 'T1547.001',
  'T1543', 'T1543.003',
  'T1053', 'T1053.005',
  'T1548', 'T1548.002',
  'T1055', 'T1134',
  'T1562', 'T1562.001',
  'T1070', 'T1070.001',
  'T1027', 'T1036', 'T1036.005',
  'T1218', 'T1218.011',
  'T1003', 'T1003.001', 'T1003.002', 'T1003.003',
  'T1555', 'T1558', 'T1558.003',
  'T1082', 'T1083', 'T1018', 'T1016', 'T1049', 'T1135',
  'T1021', 'T1021.001', 'T1021.002', 'T1021.006',
  'T1570', 'T1080',
  'T1560',
  'T1567', 'T1567.002', 'T1048', 'T1041',
  'T1486', 'T1490', 'T1489', 'T1485', 'T1529',
]);
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/optimus-tools/ransomware-killchain.ts
git commit -m "feat: define ransomware kill chain with 11 phases and behavioral patterns"
```

---

## Task 2: Build the behavioral matcher

**Files:**
- Create: `supabase/functions/optimus-tools/behavioral-matcher.ts`

- [ ] **Step 1: Create the matcher file**

This file exports a single function `runRansomwareAssessment` that:
1. Takes a Supabase client + list of detections
2. Runs Layer 1 keyword matching
3. Runs Layer 2 AI evaluation (with fallback)
4. Assembles per-phase results
5. Generates AI executive summary + recommendations (with fallback)
6. Returns the `RansomwareAssessment` structure from the spec

```typescript
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
```

This is the core of the implementation. Every line matters — read the spec's "Detection Matching Logic" section to verify the behavior.

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/optimus-tools/behavioral-matcher.ts
git commit -m "feat: add behavioral matcher with layered keyword + AI evaluation"
```

---

## Task 3: Wire the ransomware_readiness tool into optimus-tools

**Files:**
- Modify: `supabase/functions/optimus-tools/index.ts`

- [ ] **Step 1: Add import and handler**

At the top of the file (after existing imports), add:

```typescript
import { runRansomwareAssessment } from './behavioral-matcher.ts';
```

In the `switch (tool)` block (around line 852), add a new case before `default`:

```typescript
      case 'ransomware_readiness':
        const geminiKey = Deno.env.get('GEMINI_API_KEY') || null;
        result = await runRansomwareAssessment(supabase, geminiKey);
        break;
```

Note: `supabase` here is the user-scoped client (created with anon key + user JWT at line 816-820). This respects RLS — the assessment only sees the user's own detections.

Also add `'ransomware_readiness'` to the `availableTools` array in the default/error case (line 891-899).

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/optimus-tools/index.ts
git commit -m "feat: wire ransomware_readiness tool into optimus-tools handler"
```

---

## Task 4: Update run-playbook for new ransomware flow

**Files:**
- Modify: `supabase/functions/run-playbook/index.ts`

- [ ] **Step 1: Add ransomware_readiness to ALLOWED_TOOLS**

At line 29-37, add `'ransomware_readiness'` to the set.

- [ ] **Step 2: Replace ransomware playbook definition**

In `PLAYBOOK_DEFINITIONS` (line 39), replace the `'ransomware-readiness'` entry:

```typescript
'ransomware-readiness': [
  {
    id: 'assessment',
    name: 'Ransomware Kill Chain Assessment',
    description: 'Analyze detection library against full ransomware kill chain',
    tool: 'ransomware_readiness',
    params: {},
    contextKey: 'assessment',
  },
],
```

This replaces the old 4-step definition.

- [ ] **Step 3: Update PLAYBOOK_TITLES**

In the `PLAYBOOK_TITLES` map (around line 393), the ransomware entry already says `'Ransomware Readiness Assessment'`. Keep it as-is.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/run-playbook/index.ts
git commit -m "feat: update run-playbook with single-step ransomware behavioral assessment"
```

---

## Task 5: Disable non-ransomware playbooks and update types

**Files:**
- Modify: `src/lib/playbooks/types.ts`
- Modify: `src/lib/playbooks/index.ts`
- Modify: `src/components/playbooks/PlaybooksPage.tsx`

- [ ] **Step 1: Add disabled fields to Playbook type**

In `src/lib/playbooks/types.ts`, add to the `Playbook` interface (after `estimatedDuration`):

```typescript
  /** If true, playbook is greyed out and not runnable */
  disabled?: boolean;
  /** Reason shown to user when disabled */
  disabledReason?: string;
```

- [ ] **Step 2: Update ransomware playbook definition**

In `src/lib/playbooks/index.ts`, replace the `ransomware-readiness` entry with the new 1-step version:

```typescript
{
  id: 'ransomware-readiness',
  name: 'Ransomware Readiness Assessment',
  description: 'Behavioral assessment across 11 ransomware kill chain phases. Matches your detection library against specific ransomware behaviors — not generic MITRE techniques.',
  icon: 'shield-alert',
  category: 'threat-assessment',
  estimatedDuration: '1-2 minutes',
  steps: [
    {
      id: 'assessment',
      name: 'Ransomware Kill Chain Assessment',
      description: 'Analyze detection library against full ransomware kill chain',
      tool: 'ransomware_readiness',
      params: {},
      contextKey: 'assessment',
    },
  ],
  reportTemplate: {
    title: 'Ransomware Readiness Assessment',
    sections: [
      { key: 'executive-summary', title: 'Executive Summary', type: 'ai-generated' },
      { key: 'phase-assessment', title: 'Kill Chain Assessment', type: 'data', contextKey: 'assessment' },
      { key: 'recommendations', title: 'Recommendations', type: 'ai-generated' },
    ],
  },
},
```

- [ ] **Step 3: Disable all other playbooks**

For every other playbook in the `PLAYBOOKS` array, add `disabled: true` and `disabledReason: 'Being redesigned with behavioral assessment'`.

- [ ] **Step 4: Update PlaybooksPage to handle disabled state**

In `src/components/playbooks/PlaybooksPage.tsx`, modify the grid rendering (line 86-95):

```tsx
{PLAYBOOKS.map((playbook) => (
  playbook.disabled ? (
    <div key={playbook.id} className="opacity-40 pointer-events-none relative">
      <PlaybookCard playbook={playbook} onRun={() => {}} isRunning={false} />
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="px-3 py-1.5 rounded-lg bg-surface-container-highest/90 text-xs font-medium text-on-surface-variant border border-outline/20">
          Coming Soon
        </span>
      </div>
    </div>
  ) : (
    <PlaybookCard
      key={playbook.id}
      playbook={playbook}
      onRun={handleRun}
      isRunning={isRunning && activePlaybook?.id === playbook.id}
    />
  )
))}
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/playbooks/types.ts src/lib/playbooks/index.ts src/components/playbooks/PlaybooksPage.tsx
git commit -m "feat: disable non-ransomware playbooks, update ransomware to behavioral assessment"
```

---

## Task 6: Build PhaseAssessmentSection renderer

**Files:**
- Create: `src/components/playbooks/PhaseAssessmentSection.tsx`
- Modify: `src/components/playbooks/PlaybookReport.tsx`

- [ ] **Step 1: Create PhaseAssessmentSection**

This component renders the full per-phase assessment. It receives the `RansomwareAssessment` object and renders each phase as a card.

```tsx
// src/components/playbooks/PhaseAssessmentSection.tsx

import React from 'react';
import { Icon } from '../Icon';

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

interface PhaseAssessmentSectionProps {
  data: {
    phases: PhaseResult[];
    metadata?: {
      total_detections_scanned: number;
      total_matched: number;
      keyword_matches: number;
      ai_matches: number;
      phases_with_coverage: number;
      phases_blind: number;
    };
  };
}

const STATUS_CONFIG = {
  covered: { label: 'Covered', color: 'text-green-400', bg: 'bg-green-500/10', border: 'border-green-500/20', icon: 'check-circle' },
  partially_covered: { label: 'Partially Covered', color: 'text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/20', icon: 'alert-circle' },
  blind_spot: { label: 'Blind Spot', color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/20', icon: 'x-circle' },
};

export const PhaseAssessmentSection: React.FC<PhaseAssessmentSectionProps> = ({ data }) => {
  const { phases, metadata } = data;

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      {metadata && (
        <div className="flex items-center gap-4 text-xs text-on-surface-variant mb-2">
          <span>{metadata.total_detections_scanned} detections scanned</span>
          <span>·</span>
          <span>{metadata.total_matched} matched</span>
          <span>·</span>
          <span className="text-green-400">{metadata.phases_with_coverage} phases covered</span>
          <span>·</span>
          <span className="text-red-400">{metadata.phases_blind} blind spots</span>
        </div>
      )}

      {/* Phase cards */}
      {phases.map((phase) => {
        const config = STATUS_CONFIG[phase.status];
        return (
          <div key={phase.phase_id} className={`rounded-xl border ${config.border} overflow-hidden`}>
            {/* Phase header */}
            <div className={`px-5 py-3 ${config.bg} flex items-center justify-between`}>
              <div className="flex items-center gap-3">
                <span className="text-xs font-mono text-on-surface-variant/60">
                  {String(phase.phase_number).padStart(2, '0')}
                </span>
                <h4 className="text-sm font-semibold text-on-surface">{phase.phase_name}</h4>
              </div>
              <div className={`flex items-center gap-1.5 ${config.color}`}>
                <Icon name={config.icon} className="w-4 h-4" />
                <span className="text-xs font-medium">{config.label}</span>
              </div>
            </div>

            <div className="px-5 py-4 space-y-4">
              {/* Phase context */}
              <p className="text-xs text-on-surface-variant/70 italic">{phase.phase_context}</p>

              {/* What you detect */}
              {phase.detections.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-green-400 mb-2 flex items-center gap-1.5">
                    <Icon name="check" className="w-3.5 h-3.5" />
                    What you detect
                  </p>
                  <div className="space-y-1.5">
                    {phase.detections.map((d) => (
                      <div key={`${d.detection_id}-${d.behavior_matched}`} className="flex items-center gap-2 text-xs">
                        <span className="text-on-surface-variant/60">•</span>
                        <span className="text-on-surface-variant">{d.behavior_matched}</span>
                        <span className="text-on-surface-variant/40">—</span>
                        <span className="text-on-surface font-medium truncate">{d.name}</span>
                        <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                          d.status === 'Production' ? 'bg-green-500/10 text-green-400' :
                          d.status === 'Testing' ? 'bg-blue-500/10 text-blue-400' :
                          'bg-surface-container text-on-surface-variant'
                        }`}>
                          {d.status}
                        </span>
                        <span className="text-on-surface-variant/40">{d.query_language}</span>
                        {d.match_source === 'ai' && (
                          <span className="px-1 py-0.5 rounded text-[9px] bg-primary/10 text-primary">AI</span>
                        )}
                        {d.additional_count > 0 && (
                          <span className="text-on-surface-variant/40 text-[10px]">+{d.additional_count} more</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* What you're missing */}
              {phase.gaps.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-red-400 mb-2 flex items-center gap-1.5">
                    <Icon name="x" className="w-3.5 h-3.5" />
                    What you&apos;re missing
                  </p>
                  <div className="space-y-1">
                    {phase.gaps.map((gap) => (
                      <div key={gap} className="flex items-center gap-2 text-xs">
                        <span className="text-red-400/40">•</span>
                        <span className="text-on-surface-variant">{gap}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Blind spot message */}
              {phase.detections.length === 0 && (
                <p className="text-xs text-red-400/70">
                  No ransomware-relevant detections found for this phase.
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
```

- [ ] **Step 2: Wire into PlaybookReport**

In `src/components/playbooks/PlaybookReport.tsx`, add import at the top:

```typescript
import { PhaseAssessmentSection } from './PhaseAssessmentSection';
```

In the `DataSection` component (line 12), add a new check BEFORE the existing coverage summary check (before `if (data.overall || data.production)`):

```typescript
// Phase assessment (ransomware readiness)
if (data.phases && Array.isArray(data.phases)) {
  return <PhaseAssessmentSection data={data} />;
}
```

Also update the `AISection` to handle the case where `executive_summary` and `recommendations` come from the assessment data rather than `generatedSections`. In the main report renderer (line 154), add handling for the ransomware assessment case:

When the `contextKey` is `'assessment'` and the data has `executive_summary` / `recommendations` fields, render those as AI sections instead of looking them up from `run.generatedSections`. Add this logic:

```typescript
// For ransomware assessment, AI sections are embedded in the data
const assessmentData = run.context['assessment'];
if (section.type === 'ai-generated' && assessmentData?.executive_summary && section.key === 'executive-summary') {
  return <AISection content={assessmentData.executive_summary} />;
}
if (section.type === 'ai-generated' && assessmentData?.recommendations && section.key === 'recommendations') {
  return <AISection content={assessmentData.recommendations} />;
}
```

Add this BEFORE the existing `hasAI` check at line 156.

- [ ] **Step 3: Commit**

```bash
git add src/components/playbooks/PhaseAssessmentSection.tsx src/components/playbooks/PlaybookReport.tsx
git commit -m "feat: add PhaseAssessmentSection renderer for behavioral assessment"
```

---

## Task 7: Deploy edge functions and verify

**Files:**
- Deploy: `optimus-tools` (has new imports + handler)
- Deploy: `run-playbook` (has new ALLOWED_TOOLS + playbook def)

- [ ] **Step 1: Deploy optimus-tools via Supabase MCP**

Use `mcp__supabase__deploy_edge_function` with name `optimus-tools`. Include ALL files:
- `index.ts`
- `ransomware-killchain.ts`
- `behavioral-matcher.ts`
- `../_shared/cors.ts`
- `../_shared/rate-limiter.ts`

- [ ] **Step 2: Deploy run-playbook via Supabase MCP**

Use `mcp__supabase__deploy_edge_function` with name `run-playbook`. Include:
- `index.ts`
- `../_shared/cors.ts`
- `../_shared/rate-limiter.ts`

- [ ] **Step 3: End-to-end test**

1. Navigate to Playbooks page
2. Verify 6 playbooks show "Coming soon" greyed out
3. Run "Ransomware Readiness Assessment"
4. Verify: per-phase cards render (not raw JSON)
5. Verify: each phase shows detected behaviors + gaps
6. Verify: executive summary and recommendations appear (if Gemini key is set)

- [ ] **Step 4: Commit any fixes**

```bash
git commit -m "fix: address issues from ransomware assessment e2e testing"
```

---

## Summary

| Task | What it delivers |
|------|-----------------|
| 1. Kill chain definition | 11 phases, 55+ behaviors, regex patterns, MITRE filter list |
| 2. Behavioral matcher | Keyword matching + AI evaluation + gap identification + report assembly |
| 3. Wire into optimus-tools | New `ransomware_readiness` tool handler |
| 4. Update run-playbook | Single-step playbook, ALLOWED_TOOLS |
| 5. Disable other playbooks | Type changes, client-side disable + "Coming soon" UI |
| 6. Phase renderer | `PhaseAssessmentSection` component, wired into PlaybookReport |
| 7. Deploy + verify | Edge functions deployed, e2e test |
