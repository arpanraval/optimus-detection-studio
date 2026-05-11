# Auto-Digest page polish — end-to-end UX/UI fix

**Date:** 2026-04-30
**Author:** Arpan Raval (with Claude)
**Scope:** All 22 issues from the Playwright critique + routing/UX architecture

## Problem

After the backend pipeline was fixed, the Auto-Digest screen is still confusing and incomplete:
- Three different names for the same screen (header / sidebar / content title)
- "Run Now" + "Paused" toggle send contradictory signals
- Three big zero stat cards with no onboarding guidance
- Sources tab has no health signal per row
- Configuration tab is 80% empty
- Tab state isn't in URL so refresh and back-button break
- Pressing back from Activity tab takes user to Dashboard, not previous tab
- Raw http2 network errors leak to users
- "0 passed" rendered in green
- No cross-page link from a digested report back to its run
- Many other smaller issues

## Goal

A user lands on the page cold and within 30 seconds knows: what it does, what it just did, and what to do next.

## Design

### 1. Naming consolidation
Single canonical name: **Auto-Digest** everywhere.
- `routes.ts`: rename `INTELLIGENCE_SOURCES` → `AUTO_DIGEST`, set route to `/settings/auto-digest`. Keep legacy `/settings/intelligence` as a redirect.
- `routeHeaders` title: "Intelligence Sources" → "Auto-Digest"
- `Sidebar.tsx`: nav label "Auto-Digest Sources" → "Auto-Digest", URL → `ROUTES.AUTO_DIGEST`
- `AutoDigestSettingsPage`: header "Auto-Digest Pipeline" → "Auto-Digest"

### 2. Routing + tab state in URL
- Tab state moves from `useState` to `useSearchParams`. URL: `/settings/auto-digest?tab=activity|sources|configuration`. Default tab when no param: `activity`.
- Refresh preserves tab. Browser back goes through tab history naturally.
- Reorder tabs: **Activity → Sources → Configuration**. Activity is the highest-traffic for an established user.
- Deep-link support: `?run=<job_id>` auto-expands a specific job in Activity.

### 3. Top header / status strip rewrite
Replace `Auto-Digest Pipeline / Automatic threat intelligence ingestion and analysis` (generic) + Run Now button + Paused toggle with:

```
Auto-Digest                                     [⏵ Run Now]   Auto-run: ON ●
Last run: 13:09 today · 0 digested · 1 error                      Next run: 06:00 UTC tomorrow
```

`Auto-run: ON/OFF` replaces ambiguous "Paused" word. Status line gives immediate context.

### 4. Activity tab
- Drop the three big zero cards (`0 DIGESTED 30D / 0 REVIEWED / 0% AVG COVERAGE`). Replace with a compact row at the top of the Activity Log: `7 runs · 0 digested · 1 error · last 13:09`.
- Drop hex job IDs from the visible card (move to title attribute for hover/copy).
- Humanize feed-failed errors. Detect generic network patterns (http2/ECONNRESET/ETIMEDOUT/timeout) and replace with `"Network error — feed temporarily unreachable"` + collapsible "Show details" for the raw text.
- Fix `0 passed` color: only render emerald when count > 0. Otherwise muted neutral.
- Disambiguate "Skipped" wording in the Classify stage. Tone label: `"Not relevant"` for AI verdicts, `"Failed"` only for `article_classify_failed` events.
- Stage progression visual: connect the four stage cards with a thin tinted vertical bar through the dot column so the pipeline reads as a sequence, not four parallel cards.
- Filter chips above the run list: `All / Successful / With errors / Skipped only`. Default: `All`.
- Promote `last-run` line so a user reading top-down sees the most recent run status before scrolling.

### 5. Sources tab
- Tab badge counter consistency: "Sources 12" → "Sources 12/13" matching body copy.
- Per-row health column showing `last_fetched_at` from `threat_intel_feeds`. Format: `Fetched 13:09` (success) or `Failed · http2 error` (red text). Already-stored `last_error` field becomes a tooltip.
- Per-row hover action menu: "View errors" (deep-links to Activity filtered by feed), "Open feed URL".
- Fold "Government & Advisory" single-row category into the main list with a category pill instead of an orphan section heading. (Keep section grouping when there are 2+ rows in that category.)
- Add `[+ Custom Source]` button at top right of Sources tab. Phase 1: opens a "Coming soon" modal with link to roadmap. Phase 2 (out of scope): full add-source flow. Justification: better to acknowledge the gap than hide it.

### 6. Configuration tab
- `Schedule (UTC)`: show local-time hint below the dropdown. e.g., `06:00 UTC = 11:00 PM PT yesterday`.
- `Environment Relevance` AUTO badge: add a tooltip explaining `"Automatically scored based on your Environment Profile (industry, platforms, log sources)."` Link to the Environment Profile settings page.
- Save state feedback: changes are auto-saved on dropdown change. Add a small "Saved at HH:MM" indicator + use the existing floating-save-bar pattern from `AutoDigestSettingsPage` consistently.
- Compress the empty space: add a Pipeline Stats panel (mirrors of digest counts, success rate, avg run duration) so the page isn't 80% empty.

### 7. Cross-page integration
- `ThreatIntelDetailPage`: when `report.source === 'auto'`, show a small `Source: Auto-Digest run #X · 13:09` link → `/settings/auto-digest?tab=activity&run=<job_id>`. Resolve job_id from `report.job_id` (already on `auto_digest_run_events` payload — may need a join via auto_digest_run_events to find the run).
- Activity tab supports `?run=<job_id>` deep-link to auto-expand a specific run on load.

### 8. Misc cleanup
- Remove unused stat card aggregator effect that fetches 30d digested/reviewed counts (replaced by lightweight summary).
- Remove `iconName: 'loader'` references that don't match registry; use `'spinner'` or `'refresh-cw'` (animate-spin).

## Out of scope

- Full add-source flow (Phase 2 work)
- Filters by feed in Activity tab (basic chip filter only for now)
- Email digest notification (separate feature)
- Re-running a failed job (separate feature)

## Files

### Phase 1: routing + identity
- `src/router/routes.ts` — rename ROUTES.INTELLIGENCE_SOURCES → ROUTES.AUTO_DIGEST, update path to `/settings/auto-digest`, update routeHeaders, keep INTELLIGENCE_SOURCES alias for back-compat
- `src/router/AppRouter.tsx` — add `/settings/auto-digest` route, redirect old `/settings/intelligence` → new
- `src/components/Sidebar.tsx` — update nav item label + URL
- `src/components/settings/AutoDigestSettingsPage.tsx` — useSearchParams for tab, reorder TABS, header copy, Auto-run label

### Phase 2: Activity polish
- `src/components/threatintel/FeedActivityLog.tsx` — top summary row, drop zero-stat cards (move out to parent), filter chips, drop hex ID, humanize feed errors
- `src/components/threatintel/JobTranscript.tsx` — fix 0-passed color, disambiguate Skipped → "Not relevant", stage progression visual, support ?run= deep-link
- `src/components/settings/AutoDigestSettingsPage.tsx` — drop big stat cards, add summary line

### Phase 3: Sources polish
- `src/components/settings/AutoDigestSettingsPage.tsx` — tab badge format, per-row health column, fold single-row category, custom source button modal

### Phase 4: Configuration polish
- `src/components/settings/AutoDigestSettingsPage.tsx` — schedule timezone hint, AUTO tooltip, save state feedback, pipeline stats panel

### Phase 5: Cross-page
- `src/components/threatintel/ThreatIntelReportPage.tsx` (or wherever auto-digest reports render) — add "Source: Auto-Digest run #X" link
- `src/components/threatintel/JobTranscript.tsx` — handle ?run= search param via parent prop

## Test plan
- [ ] Manual: navigate to /settings/intelligence → 301 to /settings/auto-digest
- [ ] Manual: refresh on each tab → stays on that tab
- [ ] Manual: browser back from Activity → Sources → Activity → Sources (history works)
- [ ] Manual: open a digested report → click "Source: Auto-Digest run" → lands on Activity with that run expanded
- [ ] Manual: zero-state (new user, no runs) → page reads sensibly
- [ ] Manual: existing run with Sophos http2 error → shows humanized error, raw text in expander
- [ ] Manual: trigger Run Now → see Activity tab auto-update
