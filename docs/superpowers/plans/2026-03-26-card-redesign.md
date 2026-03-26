# Optimus Card Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite all 4 Optimus visualization cards to follow a unified design system — consistent shell, typography, spacing, progress bars, and interactions.

**Architecture:** Each card is a complete rewrite of an existing file. All cards share the same shell pattern (rounded-xl, gradient header, hairline divider, uniform padding). The data contracts (TypeScript interfaces in optimus.ts) are unchanged. The shared `AnimatedNumber` component replaces a local `AnimatedValue` in CoverageReportCard.

**Tech Stack:** React 19, TypeScript 5.3, Tailwind CSS 3.4, existing Icon component, existing AnimatedNumber component

**Spec:** `docs/superpowers/specs/2026-03-26-card-redesign-design.md`

**Important context:**
- Package manager: Bun
- No test runner for visual components (manual verification only)
- The project uses `react-router-dom` — SearchResultsCard imports `Link` and `routeHelpers`
- The `Icon` component accepts a `name` string prop and `className`
- `AnimatedNumber` accepts: `value`, `duration?`, `suffix?`, `prefix?`, `className?`, `enabled?`, `decimals?`
- These cards are rendered by `OptimusResponseRenderer.tsx` which passes `summary`, `data`, `actions`, `onAction` props
- All cards must preserve their existing Props interface and default export

---

## File Map

| File | Action | Lines (current → target) |
|---|---|---|
| `src/components/optimus/CoverageReportCard.tsx` | Full rewrite | 373 → ~200 |
| `src/components/optimus/ThreatActorCard.tsx` | Full rewrite | 239 → ~170 |
| `src/components/optimus/GapAnalysisCard.tsx` | Full rewrite | 194 → ~155 |
| `src/components/optimus/SearchResultsCard.tsx` | Full rewrite | 178 → ~140 |
| `src/components/optimus/ToolTimeline.tsx` | Minor tweak | 124 → ~120 |

All tasks are independent — they touch different files and can run in parallel.

---

### Task 1: Rewrite CoverageReportCard

**Files:**
- Rewrite: `src/components/optimus/CoverageReportCard.tsx`

- [ ] **Step 1: Read the current file and the spec**

Read `src/components/optimus/CoverageReportCard.tsx` (373 lines) and `docs/superpowers/specs/2026-03-26-card-redesign-design.md` section 2.1.

- [ ] **Step 2: Rewrite the component**

Replace the entire file with the new implementation. Key requirements:

**Imports:** Remove local `AnimatedValue`. Import `AnimatedNumber` from `./AnimatedNumber`.

**Keep:** The `Props` interface, the legacy data format handling (lines 205-228 of current file which builds `production`, `inLibrary`, `gaps` from either new or legacy format), the `extractTechniques`-style fallbacks, and the default export.

**New structure:**

```tsx
import React, { useState, useEffect } from 'react';
import { Icon } from '../Icon';
import { AnimatedNumber } from './AnimatedNumber';
import { OptimusAction, CoverageReportData, TierData, TechniqueGap } from '../../types/optimus';

interface Props {
  summary: string;
  data: CoverageReportData;
  actions?: OptimusAction[];
  onAction: (action: OptimusAction) => void;
}

export const CoverageReportCard: React.FC<Props> = ({ summary, data, actions, onAction }) => {
  const [mounted, setMounted] = useState(false);
  const [expandedTier, setExpandedTier] = useState<string | null>(null);

  useEffect(() => { setMounted(true); }, []);

  // Handle both new three-tier format and legacy format (PRESERVE THIS LOGIC EXACTLY)
  const production = data.production || {
    count: data.overall?.covered || 0,
    percent: data.overall?.percent || 0,
    techniques: data.topCovered?.map(t => ({ id: t.id, name: t.name, detectionCount: t.detectionCount })) || []
  };
  const inLibrary = data.inLibrary || { count: 0, percent: 0, techniques: [] };
  const gaps = data.gaps || {
    count: (data.overall?.total || 0) - (data.overall?.covered || 0),
    percent: 100 - (data.overall?.percent || 0),
    techniques: data.criticalGaps?.map((g: TechniqueGap) => ({ id: g.id, name: g.name, priority: g.priority })) || []
  };
  const total = data.total || data.overall?.total || 0;

  const tiers = [
    { key: 'production', label: 'Production', icon: 'shield-check', tier: production, dotClass: 'bg-green-500 shadow-[0_0_4px_rgba(34,197,94,0.3)]', barClass: 'bg-primary' },
    { key: 'library', label: 'In Library', icon: 'package', tier: inLibrary, dotClass: 'bg-amber-500 shadow-[0_0_4px_rgba(245,158,11,0.3)]', barClass: 'bg-primary/40' },
    { key: 'gaps', label: 'Coverage Gaps', icon: 'alert-triangle', tier: gaps, dotClass: 'bg-red-500 shadow-[0_0_4px_rgba(239,68,68,0.3)]', barClass: '' },
  ];

  return (
    <div className="rounded-xl border border-outline-variant/10 overflow-hidden">
      {/* Header with gradient wash */}
      <div className="p-5 pb-4 bg-gradient-to-br from-primary/[0.03] to-transparent">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Icon name="shield" className="w-5 h-5 text-primary" />
              <h3 className="text-base font-medium text-on-surface">{data.title || 'Coverage Report'}</h3>
            </div>
            <p className="text-sm text-on-surface-variant mt-1">{total} techniques evaluated</p>
          </div>
          <AnimatedNumber
            value={production.percent}
            suffix="%"
            className="text-2xl font-semibold tabular-nums text-on-surface"
            duration={600}
          />
        </div>

        {/* Three-segment progress bar */}
        <div className="mt-4">
          <div className="h-2 rounded-full bg-surface-container-highest overflow-hidden relative">
            <div
              className="absolute h-full bg-primary rounded-full transition-all duration-700 ease-out"
              style={{ width: mounted ? `${production.percent}%` : '0%', transitionDelay: '200ms' }}
            />
            <div
              className="absolute h-full bg-primary/40 rounded-full transition-all duration-700 ease-out"
              style={{
                left: mounted ? `${production.percent}%` : '0%',
                width: mounted ? `${inLibrary.percent}%` : '0%',
                transitionDelay: '300ms'
              }}
            />
          </div>

          {/* Legend */}
          <div className="flex items-center gap-4 mt-2.5">
            {tiers.map(t => (
              <div key={t.key} className="flex items-center gap-1.5 text-xs text-on-surface-variant/60">
                <span className={`w-2 h-2 rounded-full ${t.dotClass}`} />
                {t.tier.count} {t.label}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Divider */}
      <div className="border-t border-outline-variant/[0.08]" />

      {/* Expandable tier rows */}
      <div className="px-5 py-3">
        {tiers.map(t => {
          const isExpanded = expandedTier === t.key;
          const hasTechniques = t.tier.techniques && t.tier.techniques.length > 0;

          return (
            <div key={t.key}>
              <button
                onClick={() => hasTechniques && setExpandedTier(isExpanded ? null : t.key)}
                disabled={!hasTechniques}
                className={`w-full py-3 px-2 -mx-2 rounded-lg flex items-center justify-between ${hasTechniques ? 'cursor-pointer hover:bg-surface-container-high/30' : 'cursor-default'} transition-colors duration-200`}
              >
                <div className="flex items-center gap-3">
                  <span className={`w-2 h-2 rounded-full ${t.dotClass}`} />
                  <Icon name={t.icon} className="w-4 h-4 text-on-surface-variant/60" />
                  <span className="text-sm font-medium text-on-surface">{t.label}</span>
                  <span className="text-xs text-on-surface-variant/60">({t.tier.count} techniques)</span>
                </div>
                {hasTechniques && (
                  <Icon
                    name="chevron-down"
                    className={`w-4 h-4 text-on-surface-variant/40 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}
                  />
                )}
              </button>

              {/* Expanded technique list */}
              {isExpanded && hasTechniques && (
                <div className="pl-9 pb-3 space-y-1 max-h-52 overflow-y-auto">
                  {t.tier.techniques!.slice(0, 10).map(tech => (
                    <div key={tech.id} className={`flex items-center gap-3 py-1.5 px-3 rounded-lg hover:bg-surface-container-high/30 transition-colors ${
                      tech.priority === 'critical' ? 'border-l-2 border-error' :
                      tech.priority === 'high' ? 'border-l-2 border-orange-500' :
                      tech.priority === 'medium' ? 'border-l-2 border-yellow-500' :
                      'border-l-2 border-transparent'
                    }`}>
                      <span className="font-mono text-xs text-on-surface-variant">{tech.id}</span>
                      <span className="text-xs text-on-surface-variant/70 flex-1 truncate">{tech.name}</span>
                      {tech.detectionCount != null && tech.detectionCount > 0 && (
                        <span className="text-xs text-on-surface-variant/50">{tech.detectionCount}</span>
                      )}
                    </div>
                  ))}
                  {t.tier.techniques!.length > 10 && (
                    <p className="text-xs text-on-surface-variant/50 pl-3 pt-1">
                      +{t.tier.techniques!.length - 10} more
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Actions */}
      {actions && actions.length > 0 && (
        <div className="px-5 pb-5 pt-2 border-t border-outline-variant/[0.08] flex flex-wrap gap-2">
          {actions.map((action, i) => (
            <button
              key={i}
              onClick={() => onAction(action)}
              className={`px-4 py-2 text-xs font-medium rounded-lg transition-colors ${
                i === 0
                  ? 'bg-primary text-on-primary hover:bg-primary/90'
                  : 'bg-surface-container-high text-on-surface hover:bg-surface-container-highest'
              }`}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default CoverageReportCard;
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `bunx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add src/components/optimus/CoverageReportCard.tsx
git commit -m "refactor(cards): rewrite CoverageReportCard with unified design system"
```

---

### Task 2: Rewrite ThreatActorCard

**Files:**
- Rewrite: `src/components/optimus/ThreatActorCard.tsx`

- [ ] **Step 1: Read the current file and the spec**

Read `src/components/optimus/ThreatActorCard.tsx` (239 lines) and spec section 2.2.

- [ ] **Step 2: Rewrite the component**

Key requirements:
- **Keep:** `Props` interface, `extractTechniques` utility function, `handleDraftDetection` handler, `handleViewDetections` handler (move to bottom action area), legacy coverage/percent fallbacks (`data?.production?.count ?? data?.coverage?.covered ?? 0`, same for percent), default export
- **Remove:** `max-w-lg` wrapper, `text-4xl` percentage, `text-xl font-bold` actor name, colored `text-error` and `bg-error/10` pills, separate "Your Coverage" section layout, `bg-green-500/5` colored background on full-coverage empty state (replace with green dot + inline text)
- **Add:** Three-segment progress bar using absolute positioning (same pattern as CoverageReportCard: production `bg-primary`, library `bg-primary/40` with `left` offset), `AnimatedNumber` for percentage, consistent card shell, "View Detections" as a bottom action button

The new component follows the same card shell pattern as CoverageReportCard: gradient header, hairline divider, expandable rows, consistent buttons.

Important data handling:
- `inLibrary` data: use `data.inLibrary?.count ?? 0` and `data.inLibrary?.percent ?? 0` for the bar's library segment
- Preserve `extractTechniques` exactly — it handles multiple data format variations
- The gap row expands to show technique list with per-technique "Draft detection" buttons (keep this interaction)
- Full coverage empty state (gapsCount === 0) uses green dot + text, no colored background

- [ ] **Step 3: Verify TypeScript compiles**

Run: `bunx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add src/components/optimus/ThreatActorCard.tsx
git commit -m "refactor(cards): rewrite ThreatActorCard with unified design system"
```

---

### Task 3: Rewrite GapAnalysisCard

**Files:**
- Rewrite: `src/components/optimus/GapAnalysisCard.tsx`

- [ ] **Step 1: Read the current file and the spec**

Read `src/components/optimus/GapAnalysisCard.tsx` (194 lines) and spec section 2.3.

- [ ] **Step 2: Rewrite the component**

Key requirements:
- **Keep:** `Props` interface, `getProfileIcon` function (maps profile names to icon names), `formatProfileName` utility, destructured data access pattern, empty state logic and condition (from BUG-15 fix — but rewrite its container, see below), default export
- **Remove:** `getCoverageColor` function (dynamic text-4xl coloring), `text-4xl font-bold` percentage, `bg-green-500/5` colored quick wins background, `bg-green-500/5 border border-green-500/20` on empty state wrapper (replace with green dot + inline text, no colored background), colored priority pill badges (`bg-error/10 text-error`, `bg-orange-500/10`, etc.), `text-xl font-bold` title
- **Change:** Percentage moves inline to subtitle (`42% coverage · 21 of 50 techniques`), NOT using AnimatedNumber (it's text-sm inline). Quick wins always visible (max 3) in plain layout. Gaps collapsed behind expandable row. Priority shown via left-border accent (border-l-2) not colored pills. Replace `${colors.bg}` in the progress bar div with `bg-primary` — the bar no longer changes color based on coverage percentage. Single-segment progress bar (just `bg-primary`, no library tier for gap analysis). Recommendation as section-header + plain text.

The card uses the same shell as others: `rounded-xl border border-outline-variant/10`, gradient header, divider, consistent padding.

- [ ] **Step 3: Verify TypeScript compiles**

Run: `bunx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add src/components/optimus/GapAnalysisCard.tsx
git commit -m "refactor(cards): rewrite GapAnalysisCard with unified design system"
```

---

### Task 4: Rewrite SearchResultsCard

**Files:**
- Rewrite: `src/components/optimus/SearchResultsCard.tsx`

- [ ] **Step 1: Read the current file and the spec**

Read `src/components/optimus/SearchResultsCard.tsx` (178 lines) and spec section 2.4.

- [ ] **Step 2: Rewrite the component**

Key requirements:
- **Keep:** `Props` interface, `Link` import from react-router-dom, `routeHelpers` import, show/hide toggle logic, empty state, related techniques section, similarity display (already fixed in BUG-04 — `result.similarity != null` conditional), default export
- **Remove:** `getStatusStyle` function (entire 9-line colored status map), `w-10 h-10 rounded-xl` header icon badge, `shadow-sm` on card, `rounded-2xl` → `rounded-xl`, colored MITRE ID tags (`bg-tertiary/10 text-tertiary`), `bg-surface-container` from card root element (the gradient header provides background fill per the shared shell token)
- **Change:** Header collapses from two elements ("Search Results" title + count) to single line: `Found {total} detection{s} for "{query}"`. Status rendered as plain `text-xs text-on-surface-variant` text with a small status dot (green for Production, amber for Testing/Review, default for others). MITRE IDs as plain `font-mono text-xs text-on-surface-variant` without colored backgrounds.

Same card shell: `rounded-xl border border-outline-variant/10`, gradient header, divider.

Result items remain as `Link` components to preserve navigation to detection detail pages.

- [ ] **Step 3: Verify TypeScript compiles**

Run: `bunx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add src/components/optimus/SearchResultsCard.tsx
git commit -m "refactor(cards): rewrite SearchResultsCard with unified design system"
```

---

### Task 5: ToolTimeline minor tweak

**Files:**
- Modify: `src/components/optimus/ToolTimeline.tsx`

- [ ] **Step 1: Read the current file**

Read `src/components/optimus/ToolTimeline.tsx` (124 lines).

- [ ] **Step 2: Replace the running state indicator**

Find the running status indicator by searching for `animate-pulse` in ToolTimeline.tsx:
```tsx
<span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
```

Replace with a small spinner ring:
```tsx
<span className="w-3 h-3 rounded-full border-2 border-primary border-t-transparent animate-spin" />
```

- [ ] **Step 3: Commit**

```bash
git add src/components/optimus/ToolTimeline.tsx
git commit -m "refactor(cards): replace pulse dot with spinner in ToolTimeline"
```

---

## Execution Order

All 5 tasks are independent (different files). Tasks 1-4 can run in parallel. Task 5 is trivial and can run with any batch.

```
Task 1 (CoverageReportCard)  ─┐
Task 2 (ThreatActorCard)      ├─ all independent, parallel OK
Task 3 (GapAnalysisCard)      │
Task 4 (SearchResultsCard)    │
Task 5 (ToolTimeline)        ─┘
```

## Verification Checklist (after all tasks)

After all cards are rewritten, manually verify in the browser:

1. **Coverage query:** "What's our overall detection coverage?" → CoverageReportCard renders with animated percentage, three-segment bar, expandable tier rows
2. **Threat actor query:** "What's our coverage against Scattered Spider?" → ThreatActorCard with same card shell, same bar pattern, expandable gaps with draft buttons
3. **Gap analysis query:** "Analyze our ransomware detection gaps" → GapAnalysisCard with inline percentage, quick wins visible, gaps expandable
4. **Search query:** "Find detections for credential access" → SearchResultsCard with text-only header, plain status text, clickable result links
5. **Multi-tool query:** Any query triggering tools → ToolTimeline shows spinner instead of pulse dot
6. **Empty states:** Verify BUG-15 empty states still render correctly
7. **Dark/light theme:** Toggle theme and verify all cards look correct in both modes
8. **Consistent shell:** All cards share: `rounded-xl`, `border-outline-variant/10`, gradient header, same button styling
