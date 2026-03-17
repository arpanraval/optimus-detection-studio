# State Sponsored Attack Report - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a reusable, parameterized defense exercise page that generates a complete threat posture report for state-sponsored threat groups by country of origin, with PDF + Excel export.

**Architecture:** Single parameterized route `/exercises/state-sponsored/:countryCode` backed by a `useStateSponsoredReport` hook that queries existing Supabase views (v_mitre_groups_with_targeting, mitre_group_techniques, mv_coverage_stats, mv_threat_actor_weights). Eight visual sections in one scrollable page with export buttons.

**Tech Stack:** React 19, TypeScript, Supabase client, ExcelJS, jsPDF + autoTable, Tailwind CSS

**Design Doc:** `docs/plans/2026-03-03-state-sponsored-attack-report-design.md`

---

## Task 1: Routes & Navigation Wiring

**Files:**
- Modify: `src/router/routes.ts`
- Modify: `src/components/Sidebar.tsx` (line 10 View type, line 442 isItemActive, line 458 getNavSections)
- Modify: `src/router/AppRouter.tsx` (lazy imports + route config)
- Create: `src/router/pages/StateSponsoredReportPage.tsx`
- Modify: `src/router/pages/index.ts`

**Step 1: Add routes to routes.ts**

In `src/router/routes.ts`, add to the `ROUTES` constant (after ACTION_PLAN line ~61):

```typescript
// Defense Exercises
EXERCISES_STATE_SPONSORED: '/exercises/state-sponsored/:countryCode',
```

Add route helper (after `enterpriseDashboard` in routeHelpers ~118):

```typescript
stateSponsoredReport: (countryCode: string) => `/exercises/state-sponsored/${countryCode}`,
```

Add to `viewToRoute` mapping (~165):

```typescript
'exercises-state-sponsored': ROUTES.EXERCISES_STATE_SPONSORED,
```

Add to `routeHeaders` (~236):

```typescript
[ROUTES.EXERCISES_STATE_SPONSORED]: { title: 'State Sponsored Attack Report', description: 'Defense exercise: state-sponsored threat posture analysis' },
```

**Step 2: Add View type and sidebar section to Sidebar.tsx**

In `src/components/Sidebar.tsx`, add `'exercises-state-sponsored'` to the `View` type union on line 10.

In `getNavSections()` (line 458), add a new section between Action Plan (id: 'action-plan') and Workspaces (id: 'workspaces'):

```typescript
{
  id: 'exercises',
  label: 'Exercises',
  icon: 'crosshairs',
  items: [
    { id: 'exercises-state-sponsored' as View, label: 'Iran', url: '/exercises/state-sponsored/IR' },
  ],
  activeClass: 'bg-[#3a1a1a] text-red-200',
},
```

In `isItemActive()` function (line 442), no special logic needed since we use URL-based matching via the `url` prop on the nav item.

**Step 3: Create page wrapper**

Create `src/router/pages/StateSponsoredReportPage.tsx`:

```typescript
import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ROUTES } from '../routes';
import { PageErrorBoundary } from '../../components/ErrorBoundary';
import { StateSponsoredReportPage as ReportPage } from '../../components/exercises/StateSponsoredReportPage';

export const StateSponsoredReportPage: React.FC = () => {
  const navigate = useNavigate();
  const { countryCode } = useParams<{ countryCode: string }>();

  return (
    <PageErrorBoundary pageName="State Sponsored Attack Report" onNavigateHome={() => navigate(ROUTES.COMMAND_CENTER)}>
      <ReportPage countryCode={countryCode || 'IR'} onNavigate={navigate} />
    </PageErrorBoundary>
  );
};

export default StateSponsoredReportPage;
```

**Step 4: Add barrel export**

In `src/router/pages/index.ts`, add:

```typescript
export { StateSponsoredReportPage } from './StateSponsoredReportPage';
```

**Step 5: Wire into AppRouter.tsx**

In `src/router/AppRouter.tsx`:

Add lazy import (with the other lazy imports near line 28-72):

```typescript
const StateSponsoredReportPage = lazy(() => import('./pages/StateSponsoredReportPage').then(m => ({ default: m.StateSponsoredReportPage })));
```

Add route (inside the routes array, after action-plan route):

```typescript
{ path: 'exercises/state-sponsored/:countryCode', element: <StateSponsoredReportPage /> },
```

**Step 6: Verify routing works**

Run: `bun run dev`
Navigate to `/exercises/state-sponsored/IR`
Expected: Page loads without errors (will show empty content from placeholder component)

**Step 7: Commit**

```bash
git add src/router/routes.ts src/components/Sidebar.tsx src/router/AppRouter.tsx src/router/pages/StateSponsoredReportPage.tsx src/router/pages/index.ts
git commit -m "feat: add routing and navigation for state-sponsored attack report page"
```

---

## Task 2: Types & Country Configuration

**Files:**
- Create: `src/components/exercises/types.ts`

**Step 1: Create the types file**

Create `src/components/exercises/types.ts` with all interfaces the feature needs:

```typescript
// Country configuration
export const COUNTRY_CONFIG: Record<string, { name: string; flag: string }> = {
  IR: { name: 'Iran', flag: '\u{1F1EE}\u{1F1F7}' },
  RU: { name: 'Russia', flag: '\u{1F1F7}\u{1F1FA}' },
  CN: { name: 'China', flag: '\u{1F1E8}\u{1F1F3}' },
  KP: { name: 'North Korea', flag: '\u{1F1F0}\u{1F1F5}' },
  PK: { name: 'Pakistan', flag: '\u{1F1F5}\u{1F1F0}' },
  VN: { name: 'Vietnam', flag: '\u{1F1FB}\u{1F1F3}' },
  IN: { name: 'India', flag: '\u{1F1EE}\u{1F1F3}' },
  TR: { name: 'Turkey', flag: '\u{1F1F9}\u{1F1F7}' },
  LB: { name: 'Lebanon', flag: '\u{1F1F1}\u{1F1E7}' },
  IL: { name: 'Israel', flag: '\u{1F1EE}\u{1F1F1}' },
};

export type RiskRating = 'Critical' | 'High' | 'Medium' | 'Low';

export interface StateSponsoredGroup {
  id: string;
  stixId: string;
  mitreId: string;
  name: string;
  aliases: string[];
  vendorNames: { microsoft?: string; crowdstrike?: string };
  activityType: string | null;
  techniqueCount: number;
  coveragePercent: number;
  taw: number;
  lastModified: string;
}

export interface TacticCoverage {
  tactic: string;
  totalTechniques: number;
  coveredTechniques: number;
  coveragePercent: number;
}

export interface ReportDetection {
  id: string;
  name: string;
  source: string;
  mitreAttackIds: string[];
  status: string;
  severity: string;
  qualityScore: number;
}

export interface ReportGap {
  techniqueId: string;
  techniqueName: string;
  tactic: string;
  groupCount: number;
  tisScore: number;
  priority: number;
}

export interface ReportSoftware {
  id: string;
  stixId: string;
  mitreId: string;
  name: string;
  type: string;
  groupCount: number;
  techniqueCount: number;
}

export interface ReportCampaign {
  id: string;
  stixId: string;
  name: string;
  firstSeen: string | null;
  lastSeen: string | null;
  techniqueCount: number;
  attributedGroup: string | null;
}

export interface TechniqueWithGroups {
  mitreId: string;
  name: string;
  tactics: string[];
  groupNames: string[];
  detectionCount: number;
  isCovered: boolean;
}

export interface StateSponsoredReport {
  countryCode: string;
  countryName: string;
  countryFlag: string;
  generatedAt: Date;

  // Groups
  groups: StateSponsoredGroup[];

  // Technique aggregation
  allTechniques: TechniqueWithGroups[];
  coveredTechniqueIds: Set<string>;
  uncoveredTechniqueIds: Set<string>;
  coveragePercent: number;
  riskRating: RiskRating;

  // Tactic breakdown
  tacticBreakdown: TacticCoverage[];

  // Detections
  relatedDetections: ReportDetection[];

  // Gaps
  gaps: ReportGap[];

  // Arsenal
  software: ReportSoftware[];
  campaigns: ReportCampaign[];

  // Targeting
  targetSectors: { sector: string; count: number }[];
  targetCountries: { country: string; count: number }[];
}
```

**Step 2: Commit**

```bash
git add src/components/exercises/types.ts
git commit -m "feat: add types and country config for state-sponsored report"
```

---

## Task 3: Data Hook (useStateSponsoredReport)

**Files:**
- Create: `src/hooks/useStateSponsoredReport.ts`

**Step 1: Create the hook**

This is the core data-fetching hook. It queries multiple Supabase views and aggregates results. Create `src/hooks/useStateSponsoredReport.ts`:

```typescript
import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import {
  StateSponsoredReport,
  StateSponsoredGroup,
  TechniqueWithGroups,
  TacticCoverage,
  ReportDetection,
  ReportGap,
  ReportSoftware,
  ReportCampaign,
  RiskRating,
  COUNTRY_CONFIG,
} from '../components/exercises/types';

function toError(err: unknown): Error {
  if (err instanceof Error) return err;
  return new Error(String(err));
}

export function useStateSponsoredReport(countryCode: string) {
  const [report, setReport] = useState<StateSponsoredReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (countryCode) {
      loadReport();
    }
  }, [countryCode]);

  async function loadReport() {
    setLoading(true);
    setError(null);

    try {
      const config = COUNTRY_CONFIG[countryCode.toUpperCase()];
      if (!config) throw new Error(`Unknown country code: ${countryCode}`);

      // 1. Fetch groups with targeting data
      const { data: groupsRaw, error: groupsErr } = await supabase
        .from('v_mitre_groups_with_stats')
        .select('*')
        .eq('deprecated', false);
      if (groupsErr) throw groupsErr;

      // Filter by origin_country_code from the data.targeting_intel JSONB
      const countryGroups = (groupsRaw || []).filter((g: any) => {
        const ti = g.data?.targeting_intel;
        return ti?.origin_country_code === countryCode.toUpperCase();
      });

      if (countryGroups.length === 0) {
        setReport({
          countryCode: countryCode.toUpperCase(),
          countryName: config.name,
          countryFlag: config.flag,
          generatedAt: new Date(),
          groups: [],
          allTechniques: [],
          coveredTechniqueIds: new Set(),
          uncoveredTechniqueIds: new Set(),
          coveragePercent: 0,
          riskRating: 'Low',
          tacticBreakdown: [],
          relatedDetections: [],
          gaps: [],
          software: [],
          campaigns: [],
          targetSectors: [],
          targetCountries: [],
        });
        setLoading(false);
        return;
      }

      const groupStixIds = countryGroups.map((g: any) => g.stix_id);

      // 2. Fetch TAW scores
      const { data: tawData } = await supabase
        .from('mv_threat_actor_weights')
        .select('stix_id, taw')
        .in('stix_id', groupStixIds);
      const tawMap = new Map((tawData || []).map((t: any) => [t.stix_id, t.taw]));

      // 3. Fetch techniques used by these groups (via relationships)
      const { data: groupTechRels } = await supabase
        .from('mitre_relationships')
        .select('source_ref, target_ref')
        .in('source_ref', groupStixIds)
        .eq('relationship_type', 'uses');

      // Get technique STIX IDs
      const techStixIds = [...new Set((groupTechRels || [])
        .map((r: any) => r.target_ref)
        .filter((ref: string) => ref.startsWith('attack-pattern--')))];

      // Build group-to-technique mapping
      const groupTechMap = new Map<string, Set<string>>();
      for (const rel of (groupTechRels || [])) {
        if (!rel.target_ref.startsWith('attack-pattern--')) continue;
        if (!groupTechMap.has(rel.target_ref)) groupTechMap.set(rel.target_ref, new Set());
        groupTechMap.get(rel.target_ref)!.add(rel.source_ref);
      }

      // 4. Fetch technique details
      let techniques: any[] = [];
      if (techStixIds.length > 0) {
        const { data: techData } = await supabase
          .from('mitre_objects')
          .select('stix_id, mitre_id, name, data')
          .in('stix_id', techStixIds)
          .eq('type', 'attack-pattern')
          .eq('deprecated', false);
        techniques = techData || [];
      }

      // 5. Fetch coverage stats
      const { data: coverageData } = await supabase
        .from('mv_coverage_stats')
        .select('technique_id, detection_count, is_covered');
      const coverageMap = new Map((coverageData || []).map((c: any) => [c.technique_id, c]));

      // 6. Fetch user detections that cover any of these techniques
      const techniqueIds = techniques.map((t: any) => t.mitre_id).filter(Boolean);
      const { data: detectionsRaw } = await supabase
        .from('detections')
        .select('id, name, source, status, severity, "qualityScore", "mitreAttackIds"');

      const relatedDetections: ReportDetection[] = [];
      const detectionTechSet = new Set<string>();
      for (const det of (detectionsRaw || [])) {
        const detTechs = (det.mitreAttackIds || []) as string[];
        const overlap = detTechs.filter((t: string) => techniqueIds.includes(t));
        if (overlap.length > 0) {
          relatedDetections.push({
            id: det.id,
            name: det.name,
            source: det.source || 'custom',
            mitreAttackIds: detTechs,
            status: det.status || 'Draft',
            severity: det.severity || 'Medium',
            qualityScore: det.qualityScore || 0,
          });
          overlap.forEach((t: string) => detectionTechSet.add(t));
        }
      }

      // 7. Build technique list with coverage and group info
      const groupNameMap = new Map(countryGroups.map((g: any) => [g.stix_id, g.name]));

      const allTechniques: TechniqueWithGroups[] = techniques.map((t: any) => {
        const cov = coverageMap.get(t.mitre_id);
        const groupStixs = groupTechMap.get(t.stix_id);
        const groupNames = groupStixs
          ? [...groupStixs].map(s => groupNameMap.get(s) || 'Unknown').filter(Boolean)
          : [];

        // Extract tactics from kill_chain_phases
        const phases = t.data?.kill_chain_phases || [];
        const tactics = phases
          .filter((p: any) => p.kill_chain_name === 'mitre-attack')
          .map((p: any) => {
            // Convert phase_name to display name
            return p.phase_name
              .split('-')
              .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
              .join(' ');
          });

        return {
          mitreId: t.mitre_id,
          name: t.name,
          tactics,
          groupNames,
          detectionCount: cov?.detection_count || 0,
          isCovered: cov?.is_covered || false,
        };
      });

      const coveredIds = new Set(allTechniques.filter(t => t.isCovered).map(t => t.mitreId));
      const uncoveredIds = new Set(allTechniques.filter(t => !t.isCovered).map(t => t.mitreId));
      const coveragePercent = allTechniques.length > 0
        ? Math.round((coveredIds.size / allTechniques.length) * 100)
        : 0;

      // 8. Build tactic breakdown
      const tacticMap = new Map<string, { total: number; covered: number }>();
      for (const tech of allTechniques) {
        for (const tactic of tech.tactics) {
          if (!tacticMap.has(tactic)) tacticMap.set(tactic, { total: 0, covered: 0 });
          const entry = tacticMap.get(tactic)!;
          entry.total++;
          if (tech.isCovered) entry.covered++;
        }
      }
      const tacticBreakdown: TacticCoverage[] = [...tacticMap.entries()]
        .map(([tactic, data]) => ({
          tactic,
          totalTechniques: data.total,
          coveredTechniques: data.covered,
          coveragePercent: data.total > 0 ? Math.round((data.covered / data.total) * 100) : 0,
        }))
        .sort((a, b) => a.coveragePercent - b.coveragePercent); // worst coverage first

      // 9. Build gap analysis
      const { data: tisData } = await supabase
        .from('mv_technique_importance')
        .select('mitre_id, tis');
      const tisMap = new Map((tisData || []).map((t: any) => [t.mitre_id, t.tis]));

      const gaps: ReportGap[] = allTechniques
        .filter(t => !t.isCovered)
        .map(t => ({
          techniqueId: t.mitreId,
          techniqueName: t.name,
          tactic: t.tactics[0] || 'Unknown',
          groupCount: t.groupNames.length,
          tisScore: tisMap.get(t.mitreId) || 0,
          priority: (tisMap.get(t.mitreId) || 0) * t.groupNames.length,
        }))
        .sort((a, b) => b.priority - a.priority);

      // 10. Fetch software used by these groups
      const { data: swRels } = await supabase
        .from('mitre_relationships')
        .select('source_ref, target_ref')
        .in('source_ref', groupStixIds)
        .eq('relationship_type', 'uses');

      const swStixIds = [...new Set((swRels || [])
        .map((r: any) => r.target_ref)
        .filter((ref: string) => ref.startsWith('malware--') || ref.startsWith('tool--')))];

      let softwareList: ReportSoftware[] = [];
      if (swStixIds.length > 0) {
        const { data: swData } = await supabase
          .from('mitre_objects')
          .select('id, stix_id, mitre_id, name, type')
          .in('stix_id', swStixIds);

        // Count groups per software
        const swGroupCount = new Map<string, number>();
        for (const rel of (swRels || [])) {
          if (swStixIds.includes(rel.target_ref)) {
            swGroupCount.set(rel.target_ref, (swGroupCount.get(rel.target_ref) || 0) + 1);
          }
        }

        // Count techniques per software
        const { data: swTechRels } = await supabase
          .from('mitre_relationships')
          .select('source_ref, target_ref')
          .in('source_ref', swStixIds)
          .eq('relationship_type', 'uses');
        const swTechCount = new Map<string, number>();
        for (const rel of (swTechRels || [])) {
          if (rel.target_ref.startsWith('attack-pattern--')) {
            swTechCount.set(rel.source_ref, (swTechCount.get(rel.source_ref) || 0) + 1);
          }
        }

        softwareList = (swData || []).map((sw: any) => ({
          id: sw.id,
          stixId: sw.stix_id,
          mitreId: sw.mitre_id || '',
          name: sw.name,
          type: sw.type === 'malware' ? 'Malware' : 'Tool',
          groupCount: swGroupCount.get(sw.stix_id) || 0,
          techniqueCount: swTechCount.get(sw.stix_id) || 0,
        }))
        .sort((a, b) => b.groupCount - a.groupCount);
      }

      // 11. Fetch campaigns attributed to these groups
      const { data: campRels } = await supabase
        .from('mitre_relationships')
        .select('source_ref, target_ref')
        .in('target_ref', groupStixIds)
        .eq('relationship_type', 'attributed-to');

      const campStixIds = [...new Set((campRels || []).map((r: any) => r.source_ref)
        .filter((ref: string) => ref.startsWith('campaign--')))];

      let campaignsList: ReportCampaign[] = [];
      if (campStixIds.length > 0) {
        const { data: campData } = await supabase
          .from('mitre_objects')
          .select('id, stix_id, name, data')
          .in('stix_id', campStixIds)
          .eq('type', 'campaign');

        // Get attributed group names
        const campGroupMap = new Map<string, string>();
        for (const rel of (campRels || [])) {
          const groupName = groupNameMap.get(rel.target_ref);
          if (groupName) campGroupMap.set(rel.source_ref, groupName);
        }

        // Count techniques per campaign
        const { data: campTechRels } = await supabase
          .from('mitre_relationships')
          .select('source_ref, target_ref')
          .in('source_ref', campStixIds)
          .eq('relationship_type', 'uses');
        const campTechCount = new Map<string, number>();
        for (const rel of (campTechRels || [])) {
          if (rel.target_ref.startsWith('attack-pattern--')) {
            campTechCount.set(rel.source_ref, (campTechCount.get(rel.source_ref) || 0) + 1);
          }
        }

        campaignsList = (campData || []).map((c: any) => ({
          id: c.id,
          stixId: c.stix_id,
          name: c.name,
          firstSeen: c.data?.first_seen || null,
          lastSeen: c.data?.last_seen || null,
          techniqueCount: campTechCount.get(c.stix_id) || 0,
          attributedGroup: campGroupMap.get(c.stix_id) || null,
        }))
        .sort((a, b) => (b.lastSeen || '').localeCompare(a.lastSeen || ''));
      }

      // 12. Build targeting aggregation
      const sectorCounts = new Map<string, number>();
      const countryCounts = new Map<string, number>();
      for (const g of countryGroups) {
        const ti = g.data?.targeting_intel;
        if (ti?.target_sectors) {
          for (const s of ti.target_sectors) {
            sectorCounts.set(s, (sectorCounts.get(s) || 0) + 1);
          }
        }
        if (ti?.target_countries) {
          for (const c of ti.target_countries) {
            countryCounts.set(c, (countryCounts.get(c) || 0) + 1);
          }
        }
      }

      // 13. Build groups with coverage
      const groupTechCounts = new Map<string, { total: number; covered: number }>();
      for (const rel of (groupTechRels || [])) {
        if (!rel.target_ref.startsWith('attack-pattern--')) continue;
        if (!groupTechCounts.has(rel.source_ref)) groupTechCounts.set(rel.source_ref, { total: 0, covered: 0 });
        const entry = groupTechCounts.get(rel.source_ref)!;
        entry.total++;
        // Check if this technique is covered
        const techObj = techniques.find((t: any) => t.stix_id === rel.target_ref);
        if (techObj && coverageMap.get(techObj.mitre_id)?.is_covered) {
          entry.covered++;
        }
      }

      const groups: StateSponsoredGroup[] = countryGroups.map((g: any) => {
        const ti = g.data?.targeting_intel;
        const techStats = groupTechCounts.get(g.stix_id) || { total: 0, covered: 0 };
        return {
          id: g.id,
          stixId: g.stix_id,
          mitreId: g.mitre_id,
          name: g.name,
          aliases: g.data?.aliases || [],
          vendorNames: {
            microsoft: ti?.vendor_names?.microsoft,
            crowdstrike: ti?.vendor_names?.crowdstrike,
          },
          activityType: ti?.activity_type || null,
          techniqueCount: g.technique_count || techStats.total,
          coveragePercent: techStats.total > 0
            ? Math.round((techStats.covered / techStats.total) * 100) : 0,
          taw: tawMap.get(g.stix_id) || 0,
          lastModified: g.data?.modified || g.updated_at || '',
        };
      }).sort((a, b) => b.taw - a.taw);

      // 14. Calculate risk rating
      const avgTaw = groups.length > 0
        ? groups.reduce((s, g) => s + g.taw, 0) / groups.length : 0;
      const gapPercent = 100 - coveragePercent;

      let riskRating: RiskRating = 'Low';
      if (avgTaw > 0.7 && gapPercent > 50) riskRating = 'Critical';
      else if (avgTaw > 0.5 || gapPercent > 40) riskRating = 'High';
      else if (avgTaw > 0.3 || gapPercent > 25) riskRating = 'Medium';

      setReport({
        countryCode: countryCode.toUpperCase(),
        countryName: config.name,
        countryFlag: config.flag,
        generatedAt: new Date(),
        groups,
        allTechniques,
        coveredTechniqueIds: coveredIds,
        uncoveredTechniqueIds: uncoveredIds,
        coveragePercent,
        riskRating,
        tacticBreakdown,
        relatedDetections: relatedDetections.sort((a, b) => b.qualityScore - a.qualityScore),
        gaps,
        software: softwareList,
        campaigns: campaignsList,
        targetSectors: [...sectorCounts.entries()]
          .map(([sector, count]) => ({ sector, count }))
          .sort((a, b) => b.count - a.count),
        targetCountries: [...countryCounts.entries()]
          .map(([country, count]) => ({ country, count }))
          .sort((a, b) => b.count - a.count),
      });
    } catch (err) {
      setError(toError(err));
    } finally {
      setLoading(false);
    }
  }

  return {
    report,
    loading,
    error,
    refetch: loadReport,
  };
}
```

**Step 2: Verify hook compiles**

Run: `bun run dev`
Check browser console for no TypeScript/import errors.

**Step 3: Commit**

```bash
git add src/hooks/useStateSponsoredReport.ts
git commit -m "feat: add useStateSponsoredReport data hook with full Supabase queries"
```

---

## Task 4: Main Page Component (Shell)

**Files:**
- Create: `src/components/exercises/StateSponsoredReportPage.tsx`

**Step 1: Create main page with loading/error states and section layout**

Create `src/components/exercises/StateSponsoredReportPage.tsx`. This is the orchestrator that renders all 8 sections. Start with a shell that shows loading state and passes data down:

```typescript
import React, { useRef } from 'react';
import { useStateSponsoredReport } from '../../hooks/useStateSponsoredReport';
import { COUNTRY_CONFIG } from './types';
import { ExecutiveHeader } from './sections/ExecutiveHeader';
import { ThreatGroupsTable } from './sections/ThreatGroupsTable';
import { MitreHeatmapSection } from './sections/MitreHeatmapSection';
import { TacticBreakdown } from './sections/TacticBreakdown';
import { DetectionsTable } from './sections/DetectionsTable';
import { GapAnalysis } from './sections/GapAnalysis';
import { ArsenalSection } from './sections/ArsenalSection';
import { TargetingSection } from './sections/TargetingSection';

interface Props {
  countryCode: string;
  onNavigate: (path: string) => void;
}

export const StateSponsoredReportPage: React.FC<Props> = ({ countryCode, onNavigate }) => {
  const { report, loading, error, refetch } = useStateSponsoredReport(countryCode);
  const reportRef = useRef<HTMLDivElement>(null);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-on-surface-variant text-sm">
            Generating {COUNTRY_CONFIG[countryCode.toUpperCase()]?.name || countryCode} threat posture report...
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="w-12 h-12 rounded-full bg-error-container flex items-center justify-center">
            <span className="text-on-error-container text-xl">!</span>
          </div>
          <p className="text-on-surface font-medium">Failed to load report</p>
          <p className="text-on-surface-variant text-sm max-w-md">{error.message}</p>
          <button
            onClick={refetch}
            className="px-4 py-2 bg-primary text-on-primary rounded-lg text-sm hover:bg-primary/90 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!report) return null;

  return (
    <div ref={reportRef} className="max-w-[1400px] mx-auto px-4 sm:px-6 pb-12 space-y-6">
      <ExecutiveHeader report={report} onExportPdf={() => {/* TODO */}} onExportExcel={() => {/* TODO */}} />
      <ThreatGroupsTable groups={report.groups} onNavigate={onNavigate} />
      <MitreHeatmapSection techniques={report.allTechniques} />
      <TacticBreakdown breakdown={report.tacticBreakdown} />
      <DetectionsTable detections={report.relatedDetections} />
      <GapAnalysis gaps={report.gaps} />
      <ArsenalSection software={report.software} campaigns={report.campaigns} onNavigate={onNavigate} />
      <TargetingSection sectors={report.targetSectors} countries={report.targetCountries} />
    </div>
  );
};

export default StateSponsoredReportPage;
```

**Step 2: Create stub section components**

Create all 8 section files as stubs so the page compiles. Each file in `src/components/exercises/sections/`:

**ExecutiveHeader.tsx:**
```typescript
import React from 'react';
import { StateSponsoredReport } from '../types';

interface Props {
  report: StateSponsoredReport;
  onExportPdf: () => void;
  onExportExcel: () => void;
}

export const ExecutiveHeader: React.FC<Props> = ({ report }) => (
  <div className="bg-surface-container-low rounded-2xl p-6 border border-outline-variant/30">
    <p className="text-on-surface-variant text-sm">Executive Header — {report.countryFlag} {report.countryName} — TODO</p>
  </div>
);
```

**ThreatGroupsTable.tsx:**
```typescript
import React from 'react';
import { StateSponsoredGroup } from '../types';

interface Props {
  groups: StateSponsoredGroup[];
  onNavigate: (path: string) => void;
}

export const ThreatGroupsTable: React.FC<Props> = ({ groups }) => (
  <div className="bg-surface-container-low rounded-2xl p-6 border border-outline-variant/30">
    <p className="text-on-surface-variant text-sm">Threat Groups Table — {groups.length} groups — TODO</p>
  </div>
);
```

**MitreHeatmapSection.tsx:**
```typescript
import React from 'react';
import { TechniqueWithGroups } from '../types';

interface Props {
  techniques: TechniqueWithGroups[];
}

export const MitreHeatmapSection: React.FC<Props> = ({ techniques }) => (
  <div className="bg-surface-container-low rounded-2xl p-6 border border-outline-variant/30">
    <p className="text-on-surface-variant text-sm">MITRE Heatmap — {techniques.length} techniques — TODO</p>
  </div>
);
```

**TacticBreakdown.tsx:**
```typescript
import React from 'react';
import { TacticCoverage } from '../types';

interface Props {
  breakdown: TacticCoverage[];
}

export const TacticBreakdown: React.FC<Props> = ({ breakdown }) => (
  <div className="bg-surface-container-low rounded-2xl p-6 border border-outline-variant/30">
    <p className="text-on-surface-variant text-sm">Tactic Breakdown — {breakdown.length} tactics — TODO</p>
  </div>
);
```

**DetectionsTable.tsx:**
```typescript
import React from 'react';
import { ReportDetection } from '../types';

interface Props {
  detections: ReportDetection[];
}

export const DetectionsTable: React.FC<Props> = ({ detections }) => (
  <div className="bg-surface-container-low rounded-2xl p-6 border border-outline-variant/30">
    <p className="text-on-surface-variant text-sm">Detections Table — {detections.length} detections — TODO</p>
  </div>
);
```

**GapAnalysis.tsx:**
```typescript
import React from 'react';
import { ReportGap } from '../types';

interface Props {
  gaps: ReportGap[];
}

export const GapAnalysis: React.FC<Props> = ({ gaps }) => (
  <div className="bg-surface-container-low rounded-2xl p-6 border border-outline-variant/30">
    <p className="text-on-surface-variant text-sm">Gap Analysis — {gaps.length} gaps — TODO</p>
  </div>
);
```

**ArsenalSection.tsx:**
```typescript
import React from 'react';
import { ReportSoftware, ReportCampaign } from '../types';

interface Props {
  software: ReportSoftware[];
  campaigns: ReportCampaign[];
  onNavigate: (path: string) => void;
}

export const ArsenalSection: React.FC<Props> = ({ software, campaigns }) => (
  <div className="bg-surface-container-low rounded-2xl p-6 border border-outline-variant/30">
    <p className="text-on-surface-variant text-sm">Arsenal — {software.length} software, {campaigns.length} campaigns — TODO</p>
  </div>
);
```

**TargetingSection.tsx:**
```typescript
import React from 'react';

interface Props {
  sectors: { sector: string; count: number }[];
  countries: { country: string; count: number }[];
}

export const TargetingSection: React.FC<Props> = ({ sectors, countries }) => (
  <div className="bg-surface-container-low rounded-2xl p-6 border border-outline-variant/30">
    <p className="text-on-surface-variant text-sm">Targeting — {sectors.length} sectors, {countries.length} target countries — TODO</p>
  </div>
);
```

**Step 3: Verify full page loads**

Run: `bun run dev`
Navigate to `/exercises/state-sponsored/IR`
Expected: Page loads with 8 stub sections showing data counts (groups, techniques, detections, etc.)

**Step 4: Commit**

```bash
git add src/components/exercises/
git commit -m "feat: add main report page shell with 8 stub sections loading real data"
```

---

## Task 5: Executive Header Section

**Files:**
- Modify: `src/components/exercises/sections/ExecutiveHeader.tsx`

**Step 1: Build the full executive header**

Replace the stub with the full implementation. Key elements:
- Country flag + name banner
- 4 stat cards: Total Groups, Unique Techniques, Coverage %, Risk Rating
- Generated timestamp
- Export buttons (PDF + Excel)

Reference the existing design patterns from `DefensivePostureDashboard.tsx` for stat card styling.

The component should use the project's existing Tailwind classes: `bg-surface-container-low`, `text-on-surface`, `text-on-surface-variant`, `border-outline-variant`, etc.

Risk rating badge colors:
- Critical: `bg-red-500/15 text-red-400`
- High: `bg-orange-500/15 text-orange-400`
- Medium: `bg-amber-500/15 text-amber-400`
- Low: `bg-emerald-500/15 text-emerald-400`

**Step 2: Verify**

Navigate to `/exercises/state-sponsored/IR`, confirm header shows real data.

**Step 3: Commit**

```bash
git add src/components/exercises/sections/ExecutiveHeader.tsx
git commit -m "feat: implement executive header with stats, risk rating, and export buttons"
```

---

## Task 6: Threat Groups Table

**Files:**
- Modify: `src/components/exercises/sections/ThreatGroupsTable.tsx`

**Step 1: Build the full groups table**

Columns:
- Name (bold, click navigates to `/intelligence/groups/:mitreId`)
- Aliases (Microsoft/CrowdStrike vendor names, smaller text)
- Activity Type (badge)
- Technique Count
- Coverage % (progress bar + percentage)
- TAW Score (formatted to 2 decimals)
- Last Modified (formatted date)

Use sortable column headers. Default sort by TAW desc.

Navigation: clicking a group name should call `onNavigate(routeHelpers.groupDetail(group.mitreId))`.

Reference the table styling from `GroupsLibrary.tsx` for consistent look.

**Step 2: Verify**

Confirm table shows Iran's threat groups with real data and clicking navigates to group detail.

**Step 3: Commit**

```bash
git add src/components/exercises/sections/ThreatGroupsTable.tsx
git commit -m "feat: implement threat groups table with coverage, TAW, and navigation"
```

---

## Task 7: MITRE Heatmap Section

**Files:**
- Modify: `src/components/exercises/sections/MitreHeatmapSection.tsx`

**Step 1: Build MITRE heatmap**

Build a 14-column tactic grid where:
- Each column = one MITRE tactic (kill-chain order)
- Each cell = one technique used by this country's groups
- Color coding:
  - Covered (5+ detections): `bg-[#004D40] text-[#E0F2F1]`
  - Covered (3-4): `bg-[#1B5E20] text-[#E8F5E9]`
  - Covered (1-2): `bg-[#006064] text-[#E0F7FA]`
  - Gap (0): `bg-red-500/15 text-red-400`
- Each cell shows: technique ID + abbreviated name
- Hover tooltip: full name, detection count, groups using it

Reference the tactic order from `src/mitre.ts` MITRE_TACTICS constant.

**Step 2: Verify**

Confirm heatmap renders with correct color coding for covered vs gap techniques.

**Step 3: Commit**

```bash
git add src/components/exercises/sections/MitreHeatmapSection.tsx
git commit -m "feat: implement MITRE heatmap with coverage color coding"
```

---

## Task 8: Tactic Breakdown Section

**Files:**
- Modify: `src/components/exercises/sections/TacticBreakdown.tsx`

**Step 1: Build tactic breakdown bars**

For each tactic:
- Label: tactic name
- Progress bar showing coverage ratio (covered/total)
- Numeric: "X/Y techniques covered (Z%)"
- Color: gradient from red (0%) to green (100%)
- Sorted by worst coverage first (already sorted by hook)

Compact layout: 2-column grid on desktop, single column on mobile.

**Step 2: Verify and commit**

```bash
git add src/components/exercises/sections/TacticBreakdown.tsx
git commit -m "feat: implement tactic breakdown with coverage progress bars"
```

---

## Task 9: Detections Table

**Files:**
- Modify: `src/components/exercises/sections/DetectionsTable.tsx`

**Step 1: Build detections table**

Columns:
- Detection Name
- Detection ID (monospace, for external reference/advisory — this is the key client requirement)
- Source (badge: sigmahq=blue, splunk_escu=orange, custom=teal, elastic=yellow, etc.)
- MITRE Techniques (comma-separated IDs)
- Status (badge: Production=green, Testing=blue, Draft=gray)
- Severity (badge: Critical=red, High=orange, Medium=amber, Low=teal)
- Quality Score (number with color)

Add a search/filter bar for: source filter dropdown, status filter dropdown, text search.

Show total count in section header.

**Step 2: Verify and commit**

```bash
git add src/components/exercises/sections/DetectionsTable.tsx
git commit -m "feat: implement detections table with source IDs, filters, and badges"
```

---

## Task 10: Gap Analysis Section

**Files:**
- Modify: `src/components/exercises/sections/GapAnalysis.tsx`

**Step 1: Build gap analysis table**

Columns:
- Technique ID (monospace)
- Technique Name
- Tactic (badge)
- Groups Using (count of groups from this country using this technique)
- TIS Score (formatted)
- Priority (derived score, with color badge: Critical/High/Medium/Low)

Already sorted by priority desc from the hook. Show count in header: "X uncovered techniques".

**Step 2: Verify and commit**

```bash
git add src/components/exercises/sections/GapAnalysis.tsx
git commit -m "feat: implement gap analysis table sorted by priority"
```

---

## Task 11: Arsenal Section

**Files:**
- Modify: `src/components/exercises/sections/ArsenalSection.tsx`

**Step 1: Build software + campaigns tables**

Two sub-sections:

**Software Table:**
- Name (click navigates to `/intelligence/software/:mitreId`)
- Type (Malware/Tool badge)
- Groups Using
- Techniques

**Campaigns Table:**
- Name (click navigates to `/intelligence/campaigns/:id`)
- Attributed Group
- First Seen / Last Seen (formatted dates)
- Techniques

**Step 2: Verify and commit**

```bash
git add src/components/exercises/sections/ArsenalSection.tsx
git commit -m "feat: implement arsenal section with software and campaigns tables"
```

---

## Task 12: Targeting Section

**Files:**
- Modify: `src/components/exercises/sections/TargetingSection.tsx`

**Step 1: Build targeting visualization**

Two columns:

**Target Sectors:**
- Horizontal bar chart or tag cloud
- Each sector with count and percentage bar
- Sorted by frequency

**Target Countries:**
- List with counts
- Sorted by frequency

Simple, clean layout. These are aggregated from all groups' targeting_intel.

**Step 2: Verify and commit**

```bash
git add src/components/exercises/sections/TargetingSection.tsx
git commit -m "feat: implement targeting section with sectors and countries"
```

---

## Task 13: Excel Export

**Files:**
- Create: `src/components/exercises/export/generateReportExcel.ts`
- Modify: `src/components/exercises/StateSponsoredReportPage.tsx` (wire export button)

**Step 1: Create Excel export**

Reference the exact patterns from `src/lib/mitre/NavigatorService.ts` lines 134-645:
- Use `ExcelJS` (already a project dependency)
- Same branded header pattern: OPTIMUS title row (tertiary background), subtitle row, stats row
- Same `addBrandedHeader()` and `addColumnHeaders()` helper pattern
- Same color system (C object with primary, tertiary, success, warning, error, etc.)
- Same `applyPill()` and `styleDataCell()` helpers

**6 Sheets:**

1. **Executive Summary** — country, groups count, techniques, coverage %, risk rating, generated date
2. **Threat Groups** — all columns from ThreatGroupsTable
3. **ATT&CK Heatmap** — tactic columns × technique rows with coverage coloring (same pattern as NavigatorService Sheet 3)
4. **Detections** — all columns from DetectionsTable (crucially including Detection ID for external reference)
5. **Gap Analysis** — all columns from GapAnalysis table
6. **Software & Campaigns** — both tables

Filename: `optimus-state-sponsored-{country}-{YYYY-MM-DD_HH-MM}.xlsx`

**Step 2: Wire to export button**

In `StateSponsoredReportPage.tsx`, import `generateReportExcel` and wire it to the `onExportExcel` callback.

**Step 3: Verify**

Click Excel export, confirm file downloads and opens correctly in Excel with all 6 sheets, branded headers, and proper formatting.

**Step 4: Commit**

```bash
git add src/components/exercises/export/generateReportExcel.ts src/components/exercises/StateSponsoredReportPage.tsx
git commit -m "feat: implement Excel export with 6 branded sheets"
```

---

## Task 14: PDF Export

**Files:**
- Create: `src/components/exercises/export/generateReportPdf.ts`
- Modify: `src/components/exercises/StateSponsoredReportPage.tsx` (wire export button)

**Step 1: Create PDF export**

Reference patterns from `src/components/pdf-export-utils.ts`:
- Use `jsPDF` + `jspdf-autotable` (already project dependencies)
- Same color constants (COLORS object), `hexToRgb()`, `drawPill()` helpers
- Same branded header pattern with Optimus logo
- Same pagination logic with `checkNewPage()`

**Sections in PDF:**
1. Cover page: Country flag, name, "State Sponsored Attack Report", date, risk rating
2. Executive summary: 4 stat boxes
3. Threat groups table (autoTable)
4. MITRE heatmap (rendered as colored cells in autoTable)
5. Detections table with IDs (autoTable)
6. Gap analysis table (autoTable)
7. Page numbers in footer

**Step 2: Wire to export button**

In `StateSponsoredReportPage.tsx`, import `generateReportPdf` and wire to `onExportPdf` callback.

**Step 3: Verify**

Click PDF export, confirm PDF downloads with all sections, proper branding, and page numbers.

**Step 4: Commit**

```bash
git add src/components/exercises/export/generateReportPdf.ts src/components/exercises/StateSponsoredReportPage.tsx
git commit -m "feat: implement PDF export with branded report layout"
```

---

## Task 15: Final Integration & Polish

**Files:**
- All files in `src/components/exercises/`

**Step 1: End-to-end verification**

1. Navigate to `/exercises/state-sponsored/IR`
2. Verify all 8 sections render with real data
3. Click threat group rows → navigates to group detail
4. Click software/campaign links → navigate correctly
5. Click Excel export → file downloads, opens in Excel, all 6 sheets look correct
6. Click PDF export → file downloads, opens correctly

**Step 2: Test edge cases**

1. Navigate to `/exercises/state-sponsored/XX` (unknown country) → shows error gracefully
2. Navigate to `/exercises/state-sponsored/RU` (if Russia data exists) → different data loads
3. Check sidebar "Iran" nav item is highlighted when on the page

**Step 3: Final commit**

```bash
git add -A
git commit -m "feat: complete state-sponsored attack report with Iran defense posture, 8 sections, PDF + Excel export"
```

---

## File Creation Summary

**New files (15):**
- `src/components/exercises/types.ts`
- `src/components/exercises/StateSponsoredReportPage.tsx`
- `src/components/exercises/sections/ExecutiveHeader.tsx`
- `src/components/exercises/sections/ThreatGroupsTable.tsx`
- `src/components/exercises/sections/MitreHeatmapSection.tsx`
- `src/components/exercises/sections/TacticBreakdown.tsx`
- `src/components/exercises/sections/DetectionsTable.tsx`
- `src/components/exercises/sections/GapAnalysis.tsx`
- `src/components/exercises/sections/ArsenalSection.tsx`
- `src/components/exercises/sections/TargetingSection.tsx`
- `src/components/exercises/export/generateReportExcel.ts`
- `src/components/exercises/export/generateReportPdf.ts`
- `src/router/pages/StateSponsoredReportPage.tsx`
- `docs/plans/2026-03-03-state-sponsored-attack-report-design.md`
- `docs/plans/2026-03-03-state-sponsored-attack-report-implementation.md`

**Modified files (4):**
- `src/router/routes.ts`
- `src/router/AppRouter.tsx`
- `src/router/pages/index.ts`
- `src/components/Sidebar.tsx`
