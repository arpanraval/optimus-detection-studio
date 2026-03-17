import ExcelJS from 'exceljs';
import { CoverageMap, CoveredDetectionInfo } from '@/hooks/useMitreCoverage';
import { getMitreDataById, MITRE_TACTICS, TACTIC_MAP, TACTIC_NAME_TO_ID } from '@/mitre';

export interface NavigatorLayer {
  name: string;
  versions: {
    attack: string;
    navigator: string;
    layer: string;
  };
  domain: string;
  description: string;
  techniques: Array<{
    techniqueID: string;
    score: number;
    comment?: string;
    metadata?: any[];
    enabled?: boolean;
    showSubtechniques?: boolean;
  }>;
  gradient: {
    colors: string[];
    minValue: number;
    maxValue: number;
  };
}

// Type definitions for SVG export data
export interface TechniqueExportData {
  name: string;
  detectionCount: number;
  bgColor: string;
  textColor: string;
}

export interface TacticExportData {
  name: string;
  count: number;
  techniques: TechniqueExportData[];
}

export interface MatrixExportData {
  tactics: TacticExportData[];
  title: string;
  isDarkMode: boolean;
}

// Theme colors from index.html
const THEME_COLORS = {
  dark: {
    background: '#0a0c0f',
    surfaceContainerLowest: '#080a0c',
    surfaceContainerLow: '#14171c',
    surfaceContainerHigh: '#232830',
    onSurface: '#e6e6eb',
    onSurfaceVariant: '#c3c8d2',
    outline: '#878c96',
    outlineVariant: '#3c414b',
    secondaryContainer: '#3c4b5f',
    onSecondaryContainer: '#d7e3f8',
  },
  light: {
    background: '#fafcff',
    surfaceContainerLowest: '#ffffff',
    surfaceContainerLow: '#f5f8fd',
    surfaceContainerHigh: '#e7edf3',
    onSurface: '#191c1e',
    onSurfaceVariant: '#404858',
    outline: '#737882',
    outlineVariant: '#c3c8d2',
    secondaryContainer: '#dce2ec',
    onSecondaryContainer: '#161c25',
  }
};

// Original coverage colors from useMitreCoverage.ts
const COVERAGE_COLORS = {
  // 5+ detections: Deep Emerald/Forest
  high: { bg: '#004D40', text: '#E0F2F1' },
  // 3-4 detections: Rich Green
  medium: { bg: '#1B5E20', text: '#E8F5E9' },
  // 1-2 detections: Lighter Green/Teal
  low: { bg: '#006064', text: '#E0F7FA' },
};

export class NavigatorService {
  /**
   * Generate a MITRE ATT&CK Navigator Layer JSON object
   */
  static generateNavigatorLayer(coverage: CoverageMap, name = "Optimus Detection Coverage", description = "Exported from Optimus Detection Studio"): NavigatorLayer {
    const techniques = Object.entries(coverage).map(([mitreId, data]) => {
      const avgQuality = data.detections.length > 0 
        ? Math.round(data.detections.reduce((sum, d) => sum + (d.qualityScore || 0), 0) / data.detections.length)
        : 0;

      const ruleNames = data.detections.map(d => `• ${d.name} [${d.status}]`).join('\n');
      const comment = `Detection Count: ${data.detectionCount}\nAvg Quality: ${avgQuality}/100\n\nRules:\n${ruleNames}`;

      return {
        techniqueID: mitreId.toUpperCase(),
        score: data.detectionCount,
        comment: comment,
        metadata: data.detections.map(d => ({
            name: "Detection",
            value: d.name
        })),
        enabled: true,
        showSubtechniques: true
      };
    });

    return {
      name,
      versions: {
        attack: "18",
        navigator: "5.2.0",
        layer: "4.5"
      },
      domain: "enterprise-attack",
      description,
      techniques,
      gradient: {
        colors: ["#ffffff", "#66b1ff", "#005091"],
        minValue: 0,
        maxValue: 5
      }
    };
  }

  /**
   * Export coverage data to a formatted Excel file
   */
  static async generateExcelExport(
    coverage: CoverageMap,
    options?: {
      /** Full technique list from useMitreMatrix — enables full heatmap with gaps */
      allTechniques?: { mitre_id: string | null; name: string; data: Record<string, any> }[];
      /** When true, heatmap only shows covered techniques */
      coveredOnly?: boolean;
      filename?: string;
    },
  ) {
    // Filename with date/time stamp
    const now = new Date();
    const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}`;
    const filename = options?.filename || `optimus-coverage-${stamp}.xlsx`;

    // ==== Design tokens — saturated colors for print-quality output ====
    const C = {
      primary: '006D77', primaryDark: '004E57', primaryLight: 'CCE7EA',
      tertiary: '783264', tertiaryDark: '5C2750', tertiaryLight: 'EACDE0',
      surface: 'FFFFFF', surfaceAlt: 'F4F6F7', surfaceDim: 'E8ECEE',
      // Saturated status colors (not washed-out pastels)
      success: '15632F', successBg: 'C8E6D0',
      warning: '9A4E0F', warningBg: 'FADED0',
      error: '9C1B14', errorBg: 'F5D0CD',
      info: '004D99', infoBg: 'CCE0F5',
      textOnPrimary: 'FFFFFF', textOnTertiary: 'FFFFFF',
      textPrimary: '1C1B1F', textSecondary: '3B3740', textMuted: '625D67',
      border: 'B0AAB8',
    };

    // ==== Border styles ====
    const thinBorder: Partial<ExcelJS.Border> = { style: 'thin', color: { argb: C.border } };
    const allBorders = { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder };

    // ==== Color helpers (saturated, readable) ====
    const coverageColor = (count: number): { bg: string; text: string } => {
      if (count >= 5) return { bg: C.successBg, text: C.success };
      if (count >= 3) return { bg: C.infoBg, text: C.info };
      if (count >= 1) return { bg: C.warningBg, text: C.warning };
      return { bg: C.errorBg, text: C.error };
    };
    const qualityColor = (score: number): { bg: string; text: string } => {
      if (score >= 80) return { bg: C.successBg, text: C.success };
      if (score >= 60) return { bg: C.infoBg, text: C.info };
      if (score >= 40) return { bg: C.warningBg, text: C.warning };
      return { bg: C.errorBg, text: C.error };
    };
    const severityColor = (sev: string): { bg: string; text: string } => {
      const map: Record<string, { bg: string; text: string }> = {
        Critical: { bg: C.errorBg, text: C.error },
        High: { bg: C.tertiaryLight, text: C.tertiaryDark },
        Medium: { bg: C.warningBg, text: C.warning },
        Low: { bg: C.primaryLight, text: C.primaryDark },
        Informational: { bg: C.surfaceDim, text: C.textMuted },
      };
      return map[sev] || { bg: C.surfaceDim, text: C.textSecondary };
    };
    const statusColor = (status: string): { bg: string; text: string } => {
      const map: Record<string, { bg: string; text: string }> = {
        Production: { bg: C.successBg, text: C.success },
        Testing: { bg: C.infoBg, text: C.info },
        Review: { bg: 'E8D5F5', text: '5B21B6' },
        Development: { bg: C.warningBg, text: C.warning },
        Draft: { bg: C.surfaceDim, text: C.textSecondary },
      };
      return map[status] || { bg: C.surfaceDim, text: C.textSecondary };
    };
    const coverageLabel = (count: number): string => {
      if (count >= 5) return 'High';
      if (count >= 3) return 'Medium';
      if (count >= 1) return 'Low';
      return 'None';
    };
    const STATUS_RANK: Record<string, number> = { Production: 5, Testing: 4, Review: 3, Development: 2, Draft: 1 };
    const topStatus = (detections: CoveredDetectionInfo[]): string => {
      if (detections.length === 0) return '\u2014';
      let best = ''; let bestRank = 0;
      for (const d of detections) {
        const rank = STATUS_RANK[d.status] || 0;
        if (rank > bestRank) { bestRank = rank; best = d.status; }
      }
      return best || '\u2014';
    };

    /** Apply color-coded pill styling to a cell */
    const applyPill = (cell: ExcelJS.Cell, colors: { bg: string; text: string }) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.bg } };
      cell.font = { size: 10, bold: true, color: { argb: colors.text }, name: 'Calibri' };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = allBorders;
    };

    /** Style a plain data cell with borders and optional alt-row fill */
    const styleDataCell = (cell: ExcelJS.Cell, isAlt: boolean, opts?: { bold?: boolean; color?: string; align?: 'left' | 'center'; wrap?: boolean }) => {
      cell.font = { size: 10, name: 'Calibri', bold: opts?.bold, color: { argb: opts?.color || C.textPrimary } };
      cell.alignment = { horizontal: opts?.align || 'left', vertical: 'middle', wrapText: opts?.wrap };
      cell.border = allBorders;
      if (isAlt) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.surfaceAlt } };
    };

    // ==== Enrich coverage data with MITRE context ====
    interface EnrichedEntry {
      mitreId: string; tactic: string; techniqueName: string;
      subTechnique?: string; detectionCount: number; detections: CoveredDetectionInfo[];
    }
    const enriched: EnrichedEntry[] = [];
    for (const [mitreId, data] of Object.entries(coverage)) {
      const m = getMitreDataById(mitreId);
      enriched.push({
        mitreId: mitreId.toUpperCase(),
        tactic: m?.tactic || 'Unknown',
        techniqueName: m?.subTechnique ? `${m.technique}: ${m.subTechnique}` : m?.technique || mitreId,
        subTechnique: m?.subTechnique,
        detectionCount: data.detectionCount,
        detections: data.detections,
      });
    }

    // Group by tactic in kill-chain order
    const tacticOrder = [...MITRE_TACTICS] as string[];
    const byTactic = new Map<string, EnrichedEntry[]>();
    for (const t of tacticOrder) byTactic.set(t, []);
    byTactic.set('Unknown', []);
    for (const e of enriched) {
      (byTactic.get(e.tactic) || byTactic.get('Unknown')!).push(e);
    }
    for (const [, entries] of byTactic) entries.sort((a, b) => b.detectionCount - a.detectionCount);

    // Global stats
    const totalTechniques = enriched.length;
    const coveredTechniques = enriched.filter(e => e.detectionCount > 0).length;
    const totalDetections = enriched.reduce((s, e) => s + e.detectionCount, 0);
    const avgQualityAll = totalDetections > 0
      ? Math.round(enriched.reduce((s, e) => s + e.detections.reduce((qs, d) => qs + (d.qualityScore || 0), 0), 0) / totalDetections) : 0;
    const coveragePct = totalTechniques > 0 ? ((coveredTechniques / totalTechniques) * 100).toFixed(1) : '0';

    const exportDate = new Date();
    const dateStr = exportDate.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const timeStr = exportDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' });

    const wb = new ExcelJS.Workbook();
    wb.creator = 'Optimus Detection Studio';
    wb.created = exportDate;

    // ==== Reusable branded header (rows 1–3, col headers at row 4, data starts row 5) ====
    const tertiaryFill: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.tertiary } };
    const statsFill: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.tertiaryDark } };

    const addBrandedHeader = (ws: ExcelJS.Worksheet, sheetTitle: string, colCount: number, statsText: string) => {
      // Col 1 reserved for logo — make it wide enough
      if (ws.getColumn(1).width! < 8) ws.getColumn(1).width = 8;

      // Row 1: Tertiary background, white text, NO borders
      ws.getRow(1).height = 34;
      ws.mergeCells(1, 1, 1, Math.min(4, colCount));
      const brand = ws.getCell(1, 1);
      brand.value = 'OPTIMUS';
      brand.fill = tertiaryFill;
      brand.font = { size: 22, bold: true, color: { argb: C.textOnTertiary }, name: 'Calibri' };
      brand.alignment = { horizontal: 'left', vertical: 'middle' };
      if (colCount > 4) {
        ws.mergeCells(1, 5, 1, colCount);
        const title = ws.getCell(1, 5);
        title.value = sheetTitle;
        title.fill = tertiaryFill;
        title.font = { size: 14, bold: true, color: { argb: C.textOnTertiary }, name: 'Calibri' };
        title.alignment = { horizontal: 'right', vertical: 'middle' };
      }

      // Row 2: Subtitle — tertiary background, NO borders
      ws.getRow(2).height = 20;
      ws.mergeCells(2, 1, 2, Math.min(4, colCount));
      const sub = ws.getCell(2, 1);
      sub.value = 'Detection Studio';
      sub.fill = tertiaryFill;
      sub.font = { size: 11, color: { argb: 'DDCCD6' }, name: 'Calibri' };
      sub.alignment = { horizontal: 'left', vertical: 'top' };
      if (colCount > 4) {
        ws.mergeCells(2, 5, 2, colCount);
        const dateCellR2 = ws.getCell(2, 5);
        dateCellR2.value = `Exported: ${dateStr} at ${timeStr}`;
        dateCellR2.fill = tertiaryFill;
        dateCellR2.font = { size: 9, color: { argb: 'DDCCD6' }, name: 'Calibri' };
        dateCellR2.alignment = { horizontal: 'right', vertical: 'top' };
      }

      // Row 3: Stats row — darker tertiary, white text, NO borders
      ws.getRow(3).height = 22;
      ws.mergeCells(3, 1, 3, colCount);
      const stats = ws.getCell(3, 1);
      stats.value = `  ${statsText}`;
      stats.font = { size: 10, bold: true, color: { argb: C.textOnTertiary }, name: 'Calibri' };
      stats.fill = statsFill;
      stats.alignment = { vertical: 'middle' };
    };

    const addColumnHeaders = (ws: ExcelJS.Worksheet, rowNum: number, headers: string[]) => {
      const row = ws.getRow(rowNum);
      row.height = 32;
      headers.forEach((h, i) => {
        const cell = row.getCell(i + 1);
        cell.value = h;
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.primaryDark } };
        cell.font = { bold: true, color: { argb: C.textOnPrimary }, size: 11, name: 'Calibri' };
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        cell.border = {
          left: { style: 'thin', color: { argb: C.primaryDark } },
          right: { style: 'thin', color: { argb: C.primaryDark } },
          bottom: { style: 'medium', color: { argb: C.tertiary } },
        };
      });
    };

    // ================================================================
    // SHEET 1: Coverage by Tactic
    // ================================================================
    const ws1 = wb.addWorksheet('Coverage by Tactic', {
      views: [{ state: 'frozen', xSplit: 0, ySplit: 4 }],
    });
    const S1_COLS = 7;
    const s1Widths = [24, 16, 40, 13, 14, 14, 15];
    s1Widths.forEach((w, i) => { ws1.getColumn(i + 1).width = w; });

    addBrandedHeader(ws1, 'MITRE ATT&CK COVERAGE', S1_COLS,
      `Techniques: ${totalTechniques}  \u2022  Covered: ${coveredTechniques} (${coveragePct}%)  \u2022  Detections: ${totalDetections}  \u2022  Avg Quality: ${avgQualityAll}/100`);
    addColumnHeaders(ws1, 4, ['Tactic', 'Technique ID', 'Technique Name', 'Detections', 'Coverage', 'Avg Quality', 'Top Status']);

    let r1 = 5;
    const writeTacticGroup = (tactic: string, entries: EnrichedEntry[]) => {
      if (entries.length === 0) return;
      const tacticCovered = entries.filter(e => e.detectionCount > 0).length;
      const tacticDets = entries.reduce((s, e) => s + e.detectionCount, 0);

      // Group header row
      const grp = ws1.getRow(r1);
      grp.height = 28;
      ws1.mergeCells(r1, 1, r1, S1_COLS);
      const gc = grp.getCell(1);
      gc.value = `  ${tactic}  \u2014  ${tacticCovered}/${entries.length} techniques covered  \u2022  ${tacticDets} detections`;
      gc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.primary } };
      gc.font = { bold: true, size: 11, color: { argb: C.textOnPrimary }, name: 'Calibri' };
      gc.alignment = { horizontal: 'left', vertical: 'middle' };
      gc.border = { top: { style: 'medium', color: { argb: C.primaryDark } }, bottom: { style: 'medium', color: { argb: C.primaryDark } } };
      r1++;

      entries.forEach((entry, idx) => {
        const row = ws1.getRow(r1);
        row.height = 22;
        const alt = idx % 2 === 1;

        // Tactic
        const c1 = row.getCell(1);
        c1.value = tactic;
        styleDataCell(c1, alt, { color: C.textSecondary });

        // Technique ID
        const c2 = row.getCell(2);
        c2.value = entry.mitreId;
        styleDataCell(c2, alt, { bold: true, color: C.info, align: 'center' });

        // Technique Name
        const c3 = row.getCell(3);
        c3.value = entry.techniqueName;
        styleDataCell(c3, alt, { wrap: true });

        // Detections (pill)
        applyPill(row.getCell(4), coverageColor(entry.detectionCount));
        row.getCell(4).value = entry.detectionCount;

        // Coverage (pill)
        applyPill(row.getCell(5), coverageColor(entry.detectionCount));
        row.getCell(5).value = coverageLabel(entry.detectionCount);

        // Avg Quality (pill)
        const avgQ = entry.detections.length > 0
          ? Math.round(entry.detections.reduce((s, d) => s + (d.qualityScore || 0), 0) / entry.detections.length) : 0;
        applyPill(row.getCell(6), qualityColor(avgQ));
        row.getCell(6).value = avgQ;

        // Top Status (pill)
        const ts = topStatus(entry.detections);
        const c7 = row.getCell(7);
        c7.value = ts;
        if (ts !== '\u2014') applyPill(c7, statusColor(ts));
        else { c7.font = { size: 10, name: 'Calibri', color: { argb: C.textMuted } }; c7.alignment = { horizontal: 'center', vertical: 'middle' }; c7.border = allBorders; }

        r1++;
      });
    };

    for (const tactic of tacticOrder) writeTacticGroup(tactic, byTactic.get(tactic) || []);
    writeTacticGroup('Unknown', byTactic.get('Unknown') || []);
    ws1.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: S1_COLS } };

    // ================================================================
    // SHEET 2: Detection Details
    // ================================================================
    const ws2 = wb.addWorksheet('Detection Details', {
      views: [{ state: 'frozen', xSplit: 0, ySplit: 4 }],
    });
    const S2_COLS = 7;
    [24, 16, 36, 44, 14, 14, 14].forEach((w, i) => { ws2.getColumn(i + 1).width = w; });

    addBrandedHeader(ws2, 'DETECTION DETAILS', S2_COLS,
      `Total Detection Mappings: ${totalDetections}  \u2022  Across ${coveredTechniques} techniques  \u2022  Generated by Optimus Detection Studio`);
    addColumnHeaders(ws2, 4, ['Tactic', 'Technique ID', 'Technique Name', 'Detection Name', 'Status', 'Severity', 'Quality']);

    let r2 = 5;
    for (const tactic of [...tacticOrder, 'Unknown']) {
      for (const entry of byTactic.get(tactic) || []) {
        for (const det of entry.detections) {
          const row = ws2.getRow(r2);
          row.height = 22;
          const alt = (r2 - 5) % 2 === 1;

          const c1 = row.getCell(1); c1.value = tactic; styleDataCell(c1, alt, { color: C.textSecondary });
          const c2 = row.getCell(2); c2.value = entry.mitreId; styleDataCell(c2, alt, { bold: true, color: C.info, align: 'center' });
          const c3 = row.getCell(3); c3.value = entry.techniqueName; styleDataCell(c3, alt, { wrap: true });
          const c4 = row.getCell(4); c4.value = det.name; styleDataCell(c4, alt, { wrap: true });

          const c5 = row.getCell(5); c5.value = det.status || '\u2014';
          if (det.status) applyPill(c5, statusColor(det.status)); else { styleDataCell(c5, alt, { color: C.textMuted, align: 'center' }); }

          const c6 = row.getCell(6); c6.value = det.severity || '\u2014';
          if (det.severity) applyPill(c6, severityColor(det.severity)); else { styleDataCell(c6, alt, { color: C.textMuted, align: 'center' }); }

          const c7 = row.getCell(7); c7.value = det.qualityScore || 0;
          applyPill(c7, qualityColor(det.qualityScore || 0));

          r2++;
        }
      }
    }
    ws2.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: S2_COLS } };

    // ================================================================
    // SHEET 3: ATT&CK Matrix (Heatmap)
    // ================================================================
    interface HeatmapTech { mitreId: string; name: string; detectionCount: number; }

    // Build heatmap data — use FULL technique list when available
    const heatmapByTactic = new Map<string, HeatmapTech[]>();
    for (const t of tacticOrder) heatmapByTactic.set(t, []);

    const allTechList = options?.allTechniques;
    const isCoveredOnlyMode = !allTechList || !!options?.coveredOnly;

    if (!isCoveredOnlyMode && allTechList) {
      // FULL FRAMEWORK: iterate all techniques from the database
      for (const tech of allTechList) {
        if (!tech.mitre_id) continue;
        // Skip sub-techniques for cleaner matrix
        if (tech.data?.x_mitre_is_subtechnique) continue;

        const phases: any[] = tech.data?.kill_chain_phases || [];
        const detCount = coverage[tech.mitre_id]?.detectionCount || 0;

        for (const phase of phases) {
          if (phase.kill_chain_name !== 'mitre-attack') continue;
          const tacticId = TACTIC_NAME_TO_ID[phase.phase_name];
          const tacticName = tacticId ? TACTIC_MAP[tacticId]?.name : null;
          if (!tacticName) continue;
          const list = heatmapByTactic.get(tacticName);
          if (list) list.push({ mitreId: tech.mitre_id.toUpperCase(), name: tech.name, detectionCount: detCount });
        }
      }
    } else {
      // COVERED ONLY: use enriched coverage data (parent techniques only)
      for (const entry of enriched) {
        if (entry.subTechnique) continue;
        const list = heatmapByTactic.get(entry.tactic);
        if (list) list.push({ mitreId: entry.mitreId, name: entry.techniqueName, detectionCount: entry.detectionCount });
      }
    }

    // Sort: covered desc, then uncovered by ID
    for (const [, techs] of heatmapByTactic) {
      techs.sort((a, b) => {
        if (a.detectionCount > 0 && b.detectionCount === 0) return -1;
        if (a.detectionCount === 0 && b.detectionCount > 0) return 1;
        if (a.detectionCount !== b.detectionCount) return b.detectionCount - a.detectionCount;
        return a.mitreId.localeCompare(b.mitreId);
      });
    }

    // Deduplicated heatmap stats
    const hmUniqueAll = new Set<string>();
    const hmUniqueCovered = new Set<string>();
    for (const [, techs] of heatmapByTactic) {
      for (const t of techs) {
        hmUniqueAll.add(t.mitreId);
        if (t.detectionCount > 0) hmUniqueCovered.add(t.mitreId);
      }
    }
    const hmCovPct = hmUniqueAll.size > 0 ? ((hmUniqueCovered.size / hmUniqueAll.size) * 100).toFixed(1) : '0';

    // Build columns
    const tacticCols: { tactic: string; techs: HeatmapTech[] }[] = [];
    let maxTechRows = 0;
    for (const tactic of tacticOrder) {
      const techs = heatmapByTactic.get(tactic) || [];
      tacticCols.push({ tactic, techs });
      maxTechRows = Math.max(maxTechRows, techs.length);
    }
    const NUM_TACTICS = tacticCols.length; // 14

    const ws3 = wb.addWorksheet('ATT&CK Matrix', {
      views: [{ state: 'frozen', xSplit: 0, ySplit: 5 }],
    });
    for (let i = 0; i < NUM_TACTICS; i++) ws3.getColumn(i + 1).width = 22;

    // — Row 1: Tertiary background, NO borders —
    ws3.getRow(1).height = 34;
    ws3.mergeCells(1, 1, 1, 5);
    const hBrand = ws3.getCell(1, 1);
    hBrand.value = 'OPTIMUS';
    hBrand.fill = tertiaryFill;
    hBrand.font = { size: 22, bold: true, color: { argb: C.textOnTertiary }, name: 'Calibri' };
    hBrand.alignment = { horizontal: 'left', vertical: 'middle' };
    ws3.mergeCells(1, 6, 1, NUM_TACTICS);
    const hTitle = ws3.getCell(1, 6);
    hTitle.value = `MITRE ATT&CK MATRIX  \u2022  ${hmCovPct}% Coverage`;
    hTitle.fill = tertiaryFill;
    hTitle.font = { size: 14, bold: true, color: { argb: C.textOnTertiary }, name: 'Calibri' };
    hTitle.alignment = { horizontal: 'right', vertical: 'middle' };

    // Row 2: Subtitle + mode — tertiary background, NO borders
    ws3.getRow(2).height = 20;
    ws3.mergeCells(2, 1, 2, 5);
    const hSub = ws3.getCell(2, 1);
    hSub.value = 'Detection Studio';
    hSub.fill = tertiaryFill;
    hSub.font = { size: 11, color: { argb: 'DDCCD6' }, name: 'Calibri' };
    ws3.mergeCells(2, 6, 2, NUM_TACTICS);
    const hMode = ws3.getCell(2, 6);
    hMode.value = `${isCoveredOnlyMode ? 'Covered Techniques Only' : 'Full Framework'}  \u2022  ${hmUniqueAll.size} techniques  \u2022  ${hmUniqueCovered.size} covered  \u2022  ${totalDetections} detections`;
    hMode.fill = tertiaryFill;
    hMode.font = { size: 9, color: { argb: 'DDCCD6' }, name: 'Calibri' };
    hMode.alignment = { horizontal: 'right', vertical: 'middle' };

    // Row 3: Legend — single row with 4 items
    ws3.getRow(3).height = 22;
    const legendItems = [
      { label: '\u2588\u2588  5+ Detections (High)', ...coverageColor(5) },
      { label: '\u2588\u2588  3-4 Detections (Medium)', ...coverageColor(3) },
      { label: '\u2588\u2588  1-2 Detections (Low)', ...coverageColor(1) },
      { label: '\u2588\u2588  No Coverage (Gap)', ...coverageColor(0) },
    ];
    const colsPerItem = Math.floor(NUM_TACTICS / legendItems.length);
    let legendColStart = 1;
    legendItems.forEach((item, idx) => {
      const endCol = idx === legendItems.length - 1 ? NUM_TACTICS : legendColStart + colsPerItem - 1;
      if (endCol > legendColStart) ws3.mergeCells(3, legendColStart, 3, endCol);
      const cell = ws3.getCell(3, legendColStart);
      cell.value = item.label;
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: item.bg } };
      cell.font = { size: 9, bold: true, color: { argb: item.text }, name: 'Calibri' };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = allBorders;
      legendColStart = endCol + 1;
    });

    // Row 4: Spacer
    ws3.getRow(4).height = 4;

    // Row 5: Tactic column headers (primaryDark)
    ws3.getRow(5).height = 44;
    tacticCols.forEach(({ tactic, techs }, i) => {
      const covered = techs.filter(t => t.detectionCount > 0).length;
      const cell = ws3.getCell(5, i + 1);
      cell.value = `${tactic}\n${covered} / ${techs.length} covered`;
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.primaryDark } };
      cell.font = { bold: true, color: { argb: C.textOnPrimary }, size: 9, name: 'Calibri' };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = {
        left: { style: 'thin', color: { argb: C.primaryDark } },
        right: { style: 'thin', color: { argb: C.primaryDark } },
        bottom: { style: 'medium', color: { argb: C.tertiary } },
      };
    });

    // Technique data cells (row 6+)
    for (let techIdx = 0; techIdx < maxTechRows; techIdx++) {
      const row = ws3.getRow(6 + techIdx);
      row.height = 38;
      tacticCols.forEach(({ techs }, colIdx) => {
        if (techIdx >= techs.length) return;
        const tech = techs[techIdx];
        const cell = row.getCell(colIdx + 1);
        const truncName = tech.name.length > 24 ? tech.name.slice(0, 22) + '\u2026' : tech.name;
        const countText = tech.detectionCount > 0
          ? `${tech.detectionCount} detection${tech.detectionCount > 1 ? 's' : ''}`
          : 'No coverage';
        cell.value = `${tech.mitreId}\n${truncName}\n${countText}`;
        const colors = coverageColor(tech.detectionCount);
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.bg } };
        cell.font = { size: 8, color: { argb: colors.text }, bold: tech.detectionCount > 0, name: 'Calibri' };
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        cell.border = allBorders;
      });
    }

    // ==== Download ====
    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  /**
   * Get coverage colors based on detection count (original colors)
   */
  static getCoverageColors(detectionCount: number, isDarkMode: boolean): { bg: string; text: string } {
    const theme = isDarkMode ? THEME_COLORS.dark : THEME_COLORS.light;
    
    if (detectionCount === 0) {
      return { 
        bg: theme.surfaceContainerLowest, 
        text: theme.onSurfaceVariant 
      };
    }
    if (detectionCount >= 5) return COVERAGE_COLORS.high;
    if (detectionCount >= 3) return COVERAGE_COLORS.medium;
    return COVERAGE_COLORS.low;
  }

  /**
   * SVG-based matrix export
   */
  static async exportAsImage(data: MatrixExportData, filename = "optimus-coverage-heatmap.png") {
    try {
      const svgString = NavigatorService.buildMatrixSVG(data);
      console.log('SVG generated, length:', svgString.length);
      await NavigatorService.svgToPng(svgString, filename);
    } catch (error) {
      console.error("Image export failed:", error);
      throw error;
    }
  }

  /**
   * Build SVG string with theme-aware colors
   */
  private static buildMatrixSVG(data: MatrixExportData): string {
    const theme = data.isDarkMode ? THEME_COLORS.dark : THEME_COLORS.light;
    
    const cellWidth = 200;
    const cellHeight = 44;
    const headerHeight = 56;
    const titleHeight = 70;
    const footerHeight = 40;
    const columnGap = 2;
    const rowGap = 1;
    const padding = 16;
    
    const maxTechniques = Math.max(...data.tactics.map(t => t.techniques.length), 1);
    const svgWidth = padding * 2 + data.tactics.length * (cellWidth + columnGap);
    const svgHeight = titleHeight + headerHeight + (maxTechniques * (cellHeight + rowGap)) + footerHeight + padding;
    
    let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${svgWidth}" height="${svgHeight}">`;
    
    // Background
    svg += `<rect width="${svgWidth}" height="${svgHeight}" fill="${theme.background}"/>`;
    
    // Title
    svg += `<text x="${padding}" y="${titleHeight - 28}" font-family="Arial, sans-serif" font-size="22" font-weight="bold" fill="${theme.onSurface}">${this.escapeXml(data.title)}</text>`;
    
    // Subtitle
    const dateStr = new Date().toLocaleDateString();
    const totalTech = data.tactics.reduce((sum, t) => sum + t.techniques.length, 0);
    svg += `<text x="${padding}" y="${titleHeight - 8}" font-family="Arial, sans-serif" font-size="12" fill="${theme.onSurfaceVariant}">Exported: ${dateStr} | Tactics: ${data.tactics.length} | Techniques: ${totalTech}</text>`;

    // Tactics
    data.tactics.forEach((tactic, tacticIndex) => {
      const x = padding + tacticIndex * (cellWidth + columnGap);
      const headerY = titleHeight;
      
      // Header bg
      svg += `<rect x="${x}" y="${headerY}" width="${cellWidth}" height="${headerHeight}" fill="${theme.surfaceContainerHigh}" rx="4"/>`;
      svg += `<rect x="${x}" y="${headerY}" width="${cellWidth}" height="${headerHeight}" fill="none" stroke="${theme.outlineVariant}" rx="4"/>`;
      
      // Tactic name
      const tacticName = this.truncateText(tactic.name.toUpperCase(), 24);
      const tacticTextY = headerY + headerHeight / 2 + 5;
      svg += `<text x="${x + 12}" y="${tacticTextY}" font-family="Arial, sans-serif" font-size="11" font-weight="bold" fill="${theme.onSurface}">${this.escapeXml(tacticName)}</text>`;
      
      // Tactic count badge
      const badgeCx = x + cellWidth - 24;
      const badgeCy = headerY + headerHeight / 2;
      svg += `<circle cx="${badgeCx}" cy="${badgeCy}" r="14" fill="${theme.secondaryContainer}"/>`;
      svg += `<text x="${badgeCx}" y="${badgeCy + 4}" text-anchor="middle" font-family="Arial, sans-serif" font-size="10" font-weight="bold" fill="${theme.onSecondaryContainer}">${tactic.count}</text>`;
      
      // Techniques
      tactic.techniques.forEach((tech, techIndex) => {
        const techY = titleHeight + headerHeight + techIndex * (cellHeight + rowGap);
        const hasCoverage = tech.detectionCount > 0;
        
        // Cell bg
        svg += `<rect x="${x}" y="${techY}" width="${cellWidth}" height="${cellHeight}" fill="${tech.bgColor}" rx="2"/>`;
        svg += `<rect x="${x}" y="${techY}" width="${cellWidth}" height="${cellHeight}" fill="none" stroke="${theme.outlineVariant}" rx="2"/>`;
        
        // Technique name
        const maxLen = hasCoverage ? 26 : 30;
        const displayName = this.truncateText(tech.name, maxLen);
        const textY = techY + cellHeight / 2 + 5;
        svg += `<text x="${x + 10}" y="${textY}" font-family="Arial, sans-serif" font-size="12" fill="${tech.textColor}">${this.escapeXml(displayName)}</text>`;
        
        // Badge
        if (hasCoverage) {
          const techBadgeCx = x + cellWidth - 18;
          const techBadgeCy = techY + cellHeight / 2;
          const badgeText = tech.detectionCount > 9 ? '9+' : String(tech.detectionCount);
          svg += `<circle cx="${techBadgeCx}" cy="${techBadgeCy}" r="10" fill="#ffffff"/>`;
          svg += `<text x="${techBadgeCx}" y="${techBadgeCy + 4}" text-anchor="middle" font-family="Arial, sans-serif" font-size="9" font-weight="bold" fill="#0f172a">${badgeText}</text>`;
        }
      });
    });
    
    // Footer
    const footerY = svgHeight - 15;
    svg += `<text x="${svgWidth / 2}" y="${footerY}" text-anchor="middle" font-family="Arial, sans-serif" font-size="11" fill="${theme.onSurfaceVariant}">Generated by Optimus Detection Studio | MITRE ATT&amp;CK v18.1</text>`;
    
    svg += `</svg>`;
    
    return svg;
  }

  /**
   * Convert SVG to PNG with higher resolution (4x scale)
   */
  private static svgToPng(svgString: string, filename: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      if (!ctx) {
        reject(new Error('Could not get canvas context'));
        return;
      }
      
      // Use base64 data URL for better compatibility
      const base64 = btoa(unescape(encodeURIComponent(svgString)));
      const dataUrl = `data:image/svg+xml;base64,${base64}`;
      
      img.onload = () => {
        try {
          // Use 4x scale for higher resolution (sharper text)
          const scale = 4;
          canvas.width = img.naturalWidth * scale;
          canvas.height = img.naturalHeight * scale;
          ctx.scale(scale, scale);
          ctx.drawImage(img, 0, 0);
          
          canvas.toBlob((pngBlob) => {
            if (!pngBlob) {
              reject(new Error('Failed to create PNG blob'));
              return;
            }
            
            const link = document.createElement('a');
            link.download = filename;
            link.href = URL.createObjectURL(pngBlob);
            link.click();
            URL.revokeObjectURL(link.href);
            resolve();
          }, 'image/png');
        } catch (err) {
          reject(err);
        }
      };
      
      img.onerror = (err) => {
        console.error('SVG load error. Data URL length:', dataUrl.length);
        reject(new Error('Failed to load SVG image'));
      };
      
      img.src = dataUrl;
    });
  }

  /**
   * Truncate text with ellipsis
   */
  private static truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength - 1) + '...';
  }

  /**
   * Escape XML special characters
   */
  private static escapeXml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  /**
   * Download JSON
   */
  static downloadJson(data: any, filename: string) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
}