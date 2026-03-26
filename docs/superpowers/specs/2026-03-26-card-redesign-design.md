# Optimus Prime Card Redesign — Design Spec

**Goal:** Unify all Optimus chat agent cards under a single cohesive design system. Replace the current per-card visual chaos (4 different radii, 3+ color palettes, inconsistent typography) with a shared shell, consistent tokens, and tasteful micro-interactions.

**Scope:** 4 visualization cards (CoverageReportCard, ThreatActorCard, GapAnalysisCard, SearchResultsCard) + shared design token extraction. ToolTimeline gets minor tweaks. SourceCitationBar, FormattedText, AnimatedNumber, StreamingText are unchanged.

**Design inspiration:** Claude.ai (color restraint, typography hierarchy), Linear (spacing grid, weight-over-size), Perplexity (progressive disclosure, citation patterns). Not sterile — cards should feel alive through micro-interactions and subtle gradients.

---

## 1. Shared Design Tokens

All cards share a single visual language. Extract these to a constants object or apply consistently.

### Card Shell
```
rounded-xl border border-outline-variant/10 overflow-hidden
```
Every card. No exceptions. No rounded-2xl, no rounded-3xl.

### Card Header
```
p-5 pb-4 bg-gradient-to-br from-primary/[0.03] to-transparent
```
Subtle gradient wash on the header area. Separated from body by a hairline divider.

### Card Body
```
px-5 pb-5
```
Content area below the divider.

### Section Divider
```
border-t border-outline-variant/8
```

### Typography Scale (3 sizes only)
| Role | Classes | Usage |
|---|---|---|
| Card title | `text-base font-medium text-on-surface` | One per card, top-left |
| Subtitle | `text-sm text-on-surface-variant` | Below title, optional |
| Percentage | `text-2xl font-semibold tabular-nums text-on-surface` | Animated counter |
| Body text | `text-sm text-on-surface-variant` | Descriptions, recommendations |
| Metadata | `text-xs text-on-surface-variant/60` | Counts, labels, timestamps |
| Mono data | `text-xs font-mono text-on-surface-variant` | MITRE IDs, similarity scores |
| Section header | `text-xs font-medium text-on-surface-variant/50 uppercase tracking-wider` | Section labels |

### Spacing (4px grid)
Only these values: `gap-1` (4px), `gap-2` (8px), `gap-3` (12px), `gap-4` (16px), `gap-5` (20px), `gap-6` (24px), `gap-8` (32px).

Stick to the 4px grid. The header uses `p-5 pb-4` (reduces bottom padding for visual balance with the divider below). Avoid ad-hoc padding overrides beyond the defined card header/body tokens.

### Progress Bars
```
Track: h-2 rounded-full bg-surface-container-highest
Fill:  transition-all duration-700 ease-out
```
Three-segment bar pattern:
- Production: `bg-primary` (full opacity)
- Library: `bg-primary/40` (replaces the current `bg-secondary` used in CoverageReportCard)
- Gaps: track color (unfilled)

### Interactive Rows
```
py-3 px-2 -mx-2 rounded-lg flex items-center justify-between cursor-pointer
hover:bg-surface-container-high/30 transition-colors duration-200
```

### Status Dots
```
w-2 h-2 rounded-full inline-block
```
With optional glow:
- Production/success: `bg-green-500 shadow-[0_0_4px_rgba(34,197,94,0.3)]`
- Warning/library: `bg-amber-500 shadow-[0_0_4px_rgba(245,158,11,0.3)]`
- Gap/error: `bg-red-500 shadow-[0_0_4px_rgba(239,68,68,0.3)]`

### Priority Left-Border Accent
```
Critical: border-l-2 border-error pl-3
High:     border-l-2 border-orange-500 pl-3
Medium:   border-l-2 border-yellow-500 pl-3
Low:      border-l-2 border-outline-variant/30 pl-3
```

### Buttons
```
Primary:   px-4 py-2 text-xs font-medium bg-primary text-on-primary rounded-lg hover:bg-primary/90 transition-colors
Secondary: px-4 py-2 text-xs font-medium bg-surface-container-high text-on-surface rounded-lg hover:bg-surface-container-highest transition-colors
```

### Animations
- **Percentage count-up:** AnimatedNumber component, 600ms, cubic ease-out
- **Progress bar fill:** 700ms, ease-out, delay 200ms after mount
- **Chevron rotation:** `transition-transform duration-300` rotate-180 on expand
- **Row hover:** `transition-colors duration-200`
- NO staggered entrance animations. NO gradient rotation. NO pulse animations except ToolTimeline running state.

---

## 2. Card Specifications

### 2.1 CoverageReportCard

**Current:** 373 lines, rounded-3xl, three gradient tier sections, staggered entrance, LOCAL `AnimatedValue` sub-component (lines 18-45, NOT the shared `AnimatedNumber` — must be replaced with the shared import), custom progress bars per tier, local `TierSection` sub-component (96 lines).

**Target:** ~200 lines. Single card shell, one three-segment progress bar, expandable tier rows.

**Structure:**
```
┌─ Card Shell ────────────────────────────────┐
│ HEADER (gradient wash)                      │
│  [shield icon 20px] Coverage Report    72%  │
│  Your MITRE ATT&CK coverage          ↑ctr  │
│                                             │
│  [========primary====][==p/40==][  gaps  ]  │
│  ● 45 Production  ● 18 Library  ○ 12 Gaps  │
├─ divider ───────────────────────────────────┤
│ BODY                                        │
│  ▸ Production (45 techniques)          [>]  │
│  ▸ In Library (18 techniques)          [>]  │
│  ▸ Coverage Gaps (12 techniques)       [>]  │
│     (expanded shows technique list,         │
│      max 10 visible, "Show all N")          │
│                                             │
│  [View in Navigator]  [Draft Detection]     │
└─────────────────────────────────────────────┘
```

**Key changes from current:**
- Delete local `AnimatedValue` sub-component, import shared `AnimatedNumber` from `./AnimatedNumber`
- Delete local `TierSection` sub-component — inline as simple expand rows
- Kill `rounded-3xl` → `rounded-xl`
- Kill per-tier gradient backgrounds and separate progress bars
- Single three-segment bar replaces 3 bars
- Tier legend as inline `● count Label` not separate sections
- AnimatedNumber kept for percentage (reuse existing component)
- Expandable rows replace always-visible tier sections
- No staggered entrance animation
- Remove `text-lg font-semibold` title → `text-base font-medium`

**Expanded technique row format:**
```
  ┃ T1059  Command and Scripting Int...   3 detections
  ┃ T1027  Obfuscated Files and Info...   1 detection
```
Left border accent uses priority color if available. MITRE ID in mono. Name truncated. Count right-aligned.

### 2.2 ThreatActorCard

**Current:** 239 lines, rounded-2xl, text-4xl percentage, separate coverage and gaps sections with different layouts.

**Target:** ~160 lines. Same shell as CoverageReport, same bar pattern.

**Structure:**
```
┌─ Card Shell ────────────────────────────────┐
│ HEADER (gradient wash)                      │
│  [crosshairs 20px] Scattered Spider   68%  │
│  G0148 · Also: Roasted 0ktapus, UNC3944   │
│                                             │
│  [========primary======][=p/40=][  gaps  ]  │
│  ● 28 Production  ● 6 Library  ○ 16 Gaps   │
├─ divider ───────────────────────────────────┤
│ BODY                                        │
│  ▸ Your Coverage (34 techniques)       [>]  │
│  ▸ Coverage Gaps (16 techniques)       [>]  │
│     (expanded gap rows have                 │
│      [Draft] button per technique)          │
│                                             │
│  Full coverage state:                       │
│  ● Full coverage against known techniques.  │
│                                             │
│  [Analyze Gaps]  [Export Layer]              │
└─────────────────────────────────────────────┘
```

**Key changes:**
- Kill `text-4xl` percentage → `text-2xl font-semibold`
- Kill `text-xl font-bold` actor name → `text-base font-medium`
- MITRE ID + aliases on subtitle line, not separate sections
- Same three-segment bar, same legend format. Note: `ThreatActorData` has `production`, `inLibrary`, and `gaps` tiers. The bar shows all three segments (same as CoverageReport), even though the current card ignores `inLibrary`. The "Your Coverage" expand row shows production count; library count appears in the legend.
- Same expand row pattern for coverage and gaps
- Preserve the "View detections" navigation action (currently `handleViewDetections` navigating to `/library?threatActor=...`) — move it to the bottom action buttons as [View Detections]
- Remove `max-w-lg` constraint (let card fill container like others)

### 2.3 GapAnalysisCard

**Current:** 194 lines, rounded-xl (already correct), text-4xl colored percentage, profile-specific icons, separate colored Quick Wins and Gaps sections.

**Target:** ~150 lines.

**Structure:**
```
┌─ Card Shell ────────────────────────────────┐
│ HEADER (gradient wash)                      │
│  [profile icon 20px] Ransomware Readiness  │
│  42% coverage · 21 of 50 techniques        │
│                                             │
│  [========primary==][        gaps         ]  │
├─ divider ───────────────────────────────────┤
│ BODY                                        │
│  QUICK WINS (3)                   section hdr│
│  T1059 — Command Scripting · easy to detect │
│  T1027 — Obfuscated Files · rule available  │
│  T1055 — Process Injection · sig available  │
│                                             │
│  ▸ Coverage Gaps (29)                  [>]  │
│     (expanded: priority left-border items)  │
│                                             │
│  Recommendation                    section hdr│
│  Focus on Initial Access and Execution      │
│  tactics for highest impact.                │
│                                             │
│  [Draft Detection]  [View Full Report]      │
└─────────────────────────────────────────────┘
```

**Key changes:**
- Kill `text-4xl` colored percentage → inline in subtitle as `text-sm`
- Keep profile-specific icons (shield, crosshairs, lock etc.) but render at 20px, same style
- Quick wins always visible (max 3), NOT in a colored background section
- Gaps collapsed, expandable
- Priority shown via left-border accent, not colored pill badges
- Kill separate colored section backgrounds
- Recommendation as plain text with section header, not icon-heavy section
- No `AnimatedNumber` for this card — percentage is inline in the subtitle at `text-sm`, not a standalone display element
- Border changes from `border-outline-variant/20` → `border-outline-variant/10` (align with shared token)

### 2.4 SearchResultsCard

**Current:** 178 lines, rounded-2xl, colored status pills (emerald, blue, amber, rose), header icon badge.

**Target:** ~130 lines.

**Structure:**
```
┌─ Card Shell ────────────────────────────────┐
│ HEADER (gradient wash)                      │
│  Found 12 detections for "credential access"│
├─ divider ───────────────────────────────────┤
│ BODY                                        │
│  Kerberoasting Detection                    │
│  T1558.003 · Production · 94% match         │
│                                             │
│  LSASS Memory Dump                          │
│  T1003.001 · Draft · keyword match          │
│                                             │
│  DCSync Attack Detection                    │
│  T1003.006 · Production · 91% match         │
│                                             │
│  ... Show all 12 results                    │
│                                             │
│  Related: T1558  T1003  T1110  T1552        │
│                                             │
│  [Search Again]  [View in Library]          │
└─────────────────────────────────────────────┘
```

**Key changes:**
- Kill header icon badge (w-10 h-10 rounded-xl) → text-only header
- Collapse two-line header ("Search Results" title + "N detections found" count) into single line: "Found N detections for query"
- Kill colored status pills → plain `text-xs text-on-surface-variant` status text
- Kill per-status color map (emerald, blue, amber, rose) entirely
- Results as simple stacked items: name (text-sm font-medium), metadata line below
- Status dot color: green for Production, amber for Testing/Review, default for Draft
- Show max 5, "Show all N" toggle
- Related techniques as `font-mono text-xs` inline chips
- Similarity: show percentage if real, "keyword match" if null (already fixed in BUG-04)

### 2.5 ToolTimeline (minor tweaks only)

- Replace `animate-pulse` on running dot → small spinner ring `animate-spin` (w-3 h-3 border-2 border-primary border-t-transparent rounded-full)
- Use consistent `text-xs text-on-surface-variant/50` for timing
- Keep everything else — it's already compact and well-structured

---

## 3. What Gets Removed

| Item | Where | Why |
|---|---|---|
| `rounded-3xl` | CoverageReportCard | Inconsistent, too round |
| `rounded-2xl` on outer card | ThreatActorCard, SearchResultsCard | Standardize to rounded-xl |
| Gradient section backgrounds | CoverageReportCard tiers | Visual noise |
| Staggered entrance animations | CoverageReportCard | Unnecessary motion |
| `text-4xl font-bold` percentage | GapAnalysis, ThreatActor | Oversized, breaks hierarchy |
| `text-xl font-bold` titles | ThreatActor, GapAnalysis | Too large |
| Colored status pill backgrounds | SearchResultsCard | 5 different color families → dots |
| Per-tier separate progress bars | CoverageReportCard | Replaced by 3-segment single bar |
| `shadow-sm`, `shadow-lg` | Various | Flat design, separation via spacing |
| `bg-secondary` for library tier | CoverageReportCard | Replaced by `bg-primary/40` |
| `border-outline-variant/20` | GapAnalysisCard | Standardized to `/10` |
| `blur-xl` gradient accents | CoverageReportCard | Visual clutter |
| `bg-green-500/5` section backgrounds | GapAnalysisCard quick wins | Plain layout instead |
| `bg-error/10` section backgrounds | GapAnalysisCard gaps | Left-border accent instead |
| Profile-specific icon sizes | GapAnalysisCard | Standardize to 20px |
| `max-w-lg` constraint | ThreatActorCard | Let all cards fill uniformly |

## 4. What Gets Kept

| Item | Where | Why |
|---|---|---|
| AnimatedNumber component | CoverageReport, ThreatActor | Satisfying detail for standalone percentage display. NOT used in GapAnalysis (percentage is inline subtitle text) |
| Progress bar fill animation | All cards with bars | Good UX feedback |
| Chevron expand/collapse | All expandable rows | Standard affordance |
| Profile-specific icons | GapAnalysisCard | Adds personality |
| Card-type header icons | All cards | Visual identity per type |
| Hover states on rows | All expandable content | Interactive feedback |
| Status dots | Legend, search results | Minimal, semantic color |
| Draft buttons in technique lists | ThreatActorCard gaps | Actionable |

## 5. Implementation Notes

### File Changes
- **Modify:** CoverageReportCard.tsx (major rewrite ~200 lines)
- **Modify:** ThreatActorCard.tsx (significant rewrite ~160 lines)
- **Modify:** GapAnalysisCard.tsx (moderate rewrite ~150 lines)
- **Modify:** SearchResultsCard.tsx (moderate rewrite ~130 lines)
- **Modify:** ToolTimeline.tsx (minor — spinner dot only)
- **No new files.** Design tokens are applied inline via consistent class usage, not extracted to a separate constants file (YAGNI — 4 cards don't justify abstraction).

### Data Contract
No changes to the TypeScript interfaces in `src/types/optimus.ts`. All cards consume the same data shapes. The redesign is purely visual.

### Testing
No automated tests for visual components. Manual verification:
- Trigger each card type via Optimus chat queries
- Verify expand/collapse interactions
- Verify animation timing
- Verify dark/light theme consistency (the project uses data-theme switching)
- Verify empty states still render (from BUG-15 fix)

### Dependencies
- AnimatedNumber component (`src/components/optimus/AnimatedNumber.tsx`) — keep as-is, already well-built
- Icon component (`src/components/Icon.tsx`) — no changes needed
- No new npm packages required
