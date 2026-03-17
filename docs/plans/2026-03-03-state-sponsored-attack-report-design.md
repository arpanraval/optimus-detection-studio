# State Sponsored Attack Report - Design Document

**Date:** 2026-03-03
**Status:** Approved
**Author:** Claude + User

## Overview

A reusable, parameterized defense exercise page that generates a complete threat posture report for state-sponsored threat groups by country of origin. First instance: Iran. Framework supports any country (Russia, China, North Korea, etc.) with zero code changes — just add a sidebar entry.

## Architecture

### Route & Navigation

- **Route:** `/exercises/state-sponsored/:countryCode`
- **Sidebar:** New "Defense Exercises" section between "Action Plan" and "Workspaces"
  - Sub-item: "State Sponsored: Iran" → `/exercises/state-sponsored/IR`
  - Future: "State Sponsored: Russia" → `/exercises/state-sponsored/RU`, etc.
- **Page component:** `StateSponsoredReportPage.tsx`
- **Data hook:** `useStateSponsoredReport(countryCode: string)`

### Data Flow

```
useStateSponsoredReport(countryCode)
  1. Query v_mitre_groups_with_targeting WHERE origin_country_code = countryCode
  2. For each group → get techniques via mitre_group_techniques view
  3. Aggregate unique techniques into a Set
  4. Cross-reference with user's detections via mv_coverage_stats
  5. Get software via mitre_group_software view
  6. Get campaigns via mitre_group_campaigns view
  7. Get TAW scores from mv_threat_actor_weights
  8. Calculate: coverage %, gaps, risk rating
  9. Return structured StateSponsoredReport object
```

### Existing Infrastructure Leveraged

- `v_mitre_groups_with_targeting` — origin_country, target_sectors, activity_type, vendor_names
- `mitre_group_techniques` / `mitre_group_software` / `mitre_group_campaigns` — relationship views
- `mv_threat_actor_weights` — TAW scoring
- `mv_coverage_stats` — detection coverage per technique
- `NavigatorService` — Excel export patterns (ExcelJS, branded headers, color system)
- `pdf-export-utils.ts` — PDF export patterns (jsPDF, autoTable, branded layout)
- `TacticCoverageHeatmap` — heatmap visualization reference

## Report Sections (8)

### 1. Executive Header Banner
- Country flag (emoji) + country name
- Stat cards: Total Groups | Total Unique Techniques | Overall Coverage % | Risk Rating
- "Data as of" timestamp from MITRE metadata
- Export buttons: PDF | Excel
- Country selector dropdown for quick switching

### 2. Threat Groups Table
- **Source:** `v_mitre_groups_with_targeting` filtered by `origin_country_code`
- **Columns:**
  - Name (link to `/intelligence/groups/:id`)
  - Aliases (Microsoft + CrowdStrike vendor names from targeting_intel)
  - Activity Type (Espionage, Sabotage, etc.)
  - Technique Count
  - Your Coverage % (techniques covered / total techniques)
  - TAW Score (from materialized view)
  - Last Modified (MITRE `modified` date for relevancy)
- **Features:** Sortable columns, row click navigates to group detail

### 3. MITRE ATT&CK Heatmap
- Full 14-tactic matrix for techniques used by this country's groups
- Color coding: Green (covered, intensity by detection count) → Red (gap)
- Hover tooltip: technique name, # detections, group(s) using it
- Built as a dedicated component, adapted from existing heatmap patterns

### 4. Tactic Breakdown Summary
- Per-tactic coverage bar: "Execution: 12/18 techniques covered (67%)"
- All 14 tactics shown, sorted by gap severity
- Visual progress bars with coverage color

### 5. Related Detections Table
- **Source:** Detections where `mitreAttackIds` intersects with country's technique set
- **Columns:**
  - Detection Name
  - Detection ID (for external advisory/reference)
  - Source (sigmahq, splunk_escu, custom, elastic, etc.)
  - MITRE Technique IDs (comma-separated)
  - Status (Production/Testing/Draft/etc.)
  - Severity
  - Quality Score
- **Features:** Filterable by source, status, tactic. Sortable columns.

### 6. Gap Analysis
- **Source:** Techniques in country's set NOT covered by any detection
- **Columns:**
  - Technique ID
  - Technique Name
  - Tactic
  - # Groups Using It (from this country)
  - TIS Score (technique importance)
  - Priority (gap_score or derived from TIS + group count)
- **Sorted by:** Highest priority gaps first

### 7. Software & Campaigns Arsenal
- **Software table:** Malware/tools used by these groups (from mitre_group_software)
  - Name, Type (Malware/Tool), # Groups Using, # Techniques
- **Campaigns table:** Known campaigns attributed to these groups (from mitre_group_campaigns)
  - Name, First Seen, Last Seen, # Techniques
- Links to existing `/intelligence/software/:id` and `/intelligence/campaigns/:id`

### 8. Target Sectors & Cross-Reference
- Industries these groups typically target (aggregated from targeting_intel.target_sectors)
- Target countries (aggregated from targeting_intel.target_countries)
- Visualization: sector frequency chart or tag cloud

## Export Formats

### PDF (jsPDF + autoTable)
- Branded header with Optimus logo
- Executive summary page
- Threat groups table
- MITRE heatmap (rendered as image via canvas)
- Detections table with IDs
- Gap analysis table
- Generated timestamp + page numbers

### Excel (ExcelJS, multi-sheet)
- **Sheet 1: Executive Summary** — key metrics, country info, generated date
- **Sheet 2: Threat Groups** — full group table with all columns
- **Sheet 3: ATT&CK Heatmap** — tactic × technique matrix with color coding
- **Sheet 4: Detections** — all related detections with IDs for external reference
- **Sheet 5: Gap Analysis** — uncovered techniques sorted by priority
- **Sheet 6: Software & Campaigns** — arsenal data
- Branded header rows matching existing NavigatorService export style

## Types

```typescript
interface StateSponsoredReport {
  countryCode: string;
  countryName: string;
  generatedAt: Date;

  // Groups
  groups: StateSponsoredGroup[];

  // Aggregated technique data
  allTechniqueIds: string[];
  coveredTechniqueIds: string[];
  uncoveredTechniqueIds: string[];
  coveragePercent: number;
  riskRating: 'Critical' | 'High' | 'Medium' | 'Low';

  // Per-tactic breakdown
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

interface StateSponsoredGroup {
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

interface TacticCoverage {
  tactic: string;
  totalTechniques: number;
  coveredTechniques: number;
  coveragePercent: number;
}

interface ReportDetection {
  id: string;
  name: string;
  source: string;
  mitreAttackIds: string[];
  status: string;
  severity: string;
  qualityScore: number;
}

interface ReportGap {
  techniqueId: string;
  techniqueName: string;
  tactic: string;
  groupCount: number;
  tisScore: number;
  priority: number;
}

interface ReportSoftware {
  id: string;
  stixId: string;
  mitreId: string;
  name: string;
  type: string; // Malware | Tool
  groupCount: number;
  techniqueCount: number;
}

interface ReportCampaign {
  id: string;
  stixId: string;
  name: string;
  firstSeen: string | null;
  lastSeen: string | null;
  techniqueCount: number;
  attributedGroup: string | null;
}
```

## File Structure

```
src/
  hooks/
    useStateSponsoredReport.ts          # Core data hook
  components/
    exercises/
      StateSponsoredReportPage.tsx       # Main page component
      sections/
        ExecutiveHeader.tsx              # Banner with stats
        ThreatGroupsTable.tsx           # Groups table
        MitreHeatmapSection.tsx         # MITRE heatmap
        TacticBreakdown.tsx             # Per-tactic coverage bars
        DetectionsTable.tsx             # Related detections
        GapAnalysis.tsx                 # Uncovered techniques
        ArsenalSection.tsx              # Software & campaigns
        TargetingSection.tsx            # Target sectors & countries
      export/
        generateReportPdf.ts            # PDF export logic
        generateReportExcel.ts          # Excel export logic
  router/
    pages/
      StateSponsoredReportPage.tsx       # Lazy-loaded page wrapper
```

## Country Configuration

```typescript
const COUNTRY_CONFIG: Record<string, { name: string; flag: string }> = {
  IR: { name: 'Iran', flag: '\u{1F1EE}\u{1F1F7}' },
  RU: { name: 'Russia', flag: '\u{1F1F7}\u{1F1FA}' },
  CN: { name: 'China', flag: '\u{1F1E8}\u{1F1F3}' },
  KP: { name: 'North Korea', flag: '\u{1F1F0}\u{1F1F5}' },
};
```

## Risk Rating Calculation

```
riskRating = f(averageTAW, gapPercent)
- Critical: avgTAW > 0.7 AND gapPercent > 50%
- High: avgTAW > 0.5 OR gapPercent > 40%
- Medium: avgTAW > 0.3 OR gapPercent > 25%
- Low: otherwise
```
