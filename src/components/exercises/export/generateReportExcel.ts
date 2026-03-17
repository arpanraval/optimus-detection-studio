import ExcelJS from 'exceljs';
import { MITRE_TACTICS } from '../../../mitre.js';
import type {
  StateSponsoredReport,
  StateSponsoredGroup,
  TechniqueWithGroups,
  ReportDetection,
  ReportGap,
  ReportSoftware,
  ReportCampaign,
} from '../types.js';

// ============================================================================
// Design tokens -- saturated colors for print-quality output
// (Same palette as NavigatorService.ts)
// ============================================================================

const C = {
  primary: '006D77', primaryDark: '004E57', primaryLight: 'CCE7EA',
  tertiary: '783264', tertiaryDark: '5C2750', tertiaryLight: 'EACDE0',
  surface: 'FFFFFF', surfaceAlt: 'F4F6F7', surfaceDim: 'E8ECEE',
  success: '15632F', successBg: 'C8E6D0',
  warning: '9A4E0F', warningBg: 'FADED0',
  error: '9C1B14', errorBg: 'F5D0CD',
  info: '004D99', infoBg: 'CCE0F5',
  textOnPrimary: 'FFFFFF', textOnTertiary: 'FFFFFF',
  textPrimary: '1C1B1F', textSecondary: '3B3740', textMuted: '625D67',
  border: 'B0AAB8',
};

// ============================================================================
// Border styles
// ============================================================================

const thinBorder: Partial<ExcelJS.Border> = { style: 'thin', color: { argb: C.border } };
const allBorders = { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder };

// ============================================================================
// Color helpers
// ============================================================================

function coverageColor(pct: number): { bg: string; text: string } {
  if (pct >= 75) return { bg: C.successBg, text: C.success };
  if (pct >= 50) return { bg: C.infoBg, text: C.info };
  if (pct >= 25) return { bg: C.warningBg, text: C.warning };
  return { bg: C.errorBg, text: C.error };
}

function tawColor(taw: number): { bg: string; text: string } {
  if (taw >= 80) return { bg: C.errorBg, text: C.error };
  if (taw >= 60) return { bg: C.warningBg, text: C.warning };
  if (taw >= 40) return { bg: C.infoBg, text: C.info };
  return { bg: C.successBg, text: C.success };
}

function severityColor(sev: string): { bg: string; text: string } {
  const map: Record<string, { bg: string; text: string }> = {
    Critical: { bg: C.errorBg, text: C.error },
    High: { bg: C.tertiaryLight, text: C.tertiaryDark },
    Medium: { bg: C.warningBg, text: C.warning },
    Low: { bg: C.primaryLight, text: C.primaryDark },
    Informational: { bg: C.surfaceDim, text: C.textMuted },
  };
  return map[sev] || { bg: C.surfaceDim, text: C.textSecondary };
}

function statusColor(status: string): { bg: string; text: string } {
  const map: Record<string, { bg: string; text: string }> = {
    Production: { bg: C.successBg, text: C.success },
    Testing: { bg: C.infoBg, text: C.info },
    Review: { bg: 'E8D5F5', text: '5B21B6' },
    Development: { bg: C.warningBg, text: C.warning },
    Draft: { bg: C.surfaceDim, text: C.textSecondary },
  };
  return map[status] || { bg: C.surfaceDim, text: C.textSecondary };
}

function riskColor(rating: string): { bg: string; text: string } {
  const map: Record<string, { bg: string; text: string }> = {
    Critical: { bg: C.errorBg, text: C.error },
    High: { bg: C.warningBg, text: C.warning },
    Medium: { bg: C.infoBg, text: C.info },
    Low: { bg: C.successBg, text: C.success },
  };
  return map[rating] || { bg: C.surfaceDim, text: C.textSecondary };
}

function qualityColor(score: number): { bg: string; text: string } {
  if (score >= 80) return { bg: C.successBg, text: C.success };
  if (score >= 60) return { bg: C.infoBg, text: C.info };
  if (score >= 40) return { bg: C.warningBg, text: C.warning };
  return { bg: C.errorBg, text: C.error };
}

function priorityColor(priority: number): { bg: string; text: string } {
  if (priority >= 80) return { bg: C.errorBg, text: C.error };
  if (priority >= 60) return { bg: C.warningBg, text: C.warning };
  if (priority >= 40) return { bg: C.infoBg, text: C.info };
  return { bg: C.successBg, text: C.success };
}

function heatmapColor(detectionCount: number): { bg: string; text: string } {
  if (detectionCount >= 5) return { bg: C.successBg, text: C.success };
  if (detectionCount >= 3) return { bg: C.infoBg, text: C.info };
  if (detectionCount >= 1) return { bg: C.warningBg, text: C.warning };
  return { bg: C.errorBg, text: C.error };
}

function attributionColor(attr: string): { bg: string; text: string } {
  return attr === 'direct'
    ? { bg: C.successBg, text: C.success }
    : { bg: C.warningBg, text: C.warning };
}

function relevanceColor(score: number): { bg: string; text: string } {
  if (score >= 70) return { bg: C.successBg, text: C.success };
  if (score >= 40) return { bg: C.infoBg, text: C.info };
  return { bg: C.warningBg, text: C.warning };
}

// ============================================================================
// Cell styling helpers (same as NavigatorService)
// ============================================================================

function applyPill(cell: ExcelJS.Cell, colors: { bg: string; text: string }): void {
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.bg } };
  cell.font = { size: 10, bold: true, color: { argb: colors.text }, name: 'Calibri' };
  cell.alignment = { horizontal: 'center', vertical: 'middle' };
  cell.border = allBorders;
}

function styleDataCell(
  cell: ExcelJS.Cell,
  isAlt: boolean,
  opts?: { bold?: boolean; color?: string; align?: 'left' | 'center'; wrap?: boolean },
): void {
  cell.font = { size: 10, name: 'Calibri', bold: opts?.bold, color: { argb: opts?.color || C.textPrimary } };
  cell.alignment = { horizontal: opts?.align || 'left', vertical: 'middle', wrapText: opts?.wrap };
  cell.border = allBorders;
  if (isAlt) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.surfaceAlt } };
}

// ============================================================================
// Branded header (rows 1-3) -- same pattern as NavigatorService
// ============================================================================

const tertiaryFill: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.tertiary } };
const statsFill: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.tertiaryDark } };

function addBrandedHeader(
  ws: ExcelJS.Worksheet,
  sheetTitle: string,
  colCount: number,
  statsText: string,
  dateStr: string,
  timeStr: string,
): void {
  if (ws.getColumn(1).width! < 8) ws.getColumn(1).width = 8;

  // Row 1: Tertiary background, white text
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

  // Row 2: Subtitle
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

  // Row 3: Stats row
  ws.getRow(3).height = 22;
  ws.mergeCells(3, 1, 3, colCount);
  const stats = ws.getCell(3, 1);
  stats.value = `  ${statsText}`;
  stats.font = { size: 10, bold: true, color: { argb: C.textOnTertiary }, name: 'Calibri' };
  stats.fill = statsFill;
  stats.alignment = { vertical: 'middle' };
}

function addColumnHeaders(ws: ExcelJS.Worksheet, rowNum: number, headers: string[]): void {
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
}

// ============================================================================
// Date / filename helpers
// ============================================================================

function formatDateStamp(date: Date): string {
  const y = date.getFullYear();
  const mo = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  const mi = String(date.getMinutes()).padStart(2, '0');
  return `${y}-${mo}-${d}_${h}-${mi}`;
}

function formatDisplayDate(date: Date): string {
  return date.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

function formatDisplayTime(date: Date): string {
  return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' });
}

// ============================================================================
// MAIN EXPORT FUNCTION
// ============================================================================

export async function generateReportExcel(report: StateSponsoredReport): Promise<void> {
  const now = new Date();
  const stamp = formatDateStamp(now);
  const safeName = report.filterDescription.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase().slice(0, 40);
  const filename = `optimus-state-sponsored-${safeName}-${stamp}.xlsx`;
  const dateStr = formatDisplayDate(now);
  const timeStr = formatDisplayTime(now);

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Optimus Detection Studio';
  wb.created = now;

  // ================================================================
  // SHEET 1: Executive Summary
  // ================================================================
  const ws1 = wb.addWorksheet('Executive Summary', {
    views: [{ state: 'frozen', xSplit: 0, ySplit: 4 }],
  });
  const S1_COLS = 7;
  [28, 22, 18, 16, 16, 14, 20].forEach((w, i) => { ws1.getColumn(i + 1).width = w; });

  const uniqueTechniques = report.allTechniques.length;
  const avgTaw = report.groups.length > 0
    ? Math.round(report.groups.reduce((s, g) => s + g.taw, 0) / report.groups.length)
    : 0;

  addBrandedHeader(ws1, 'STATE SPONSORED ATTACK REPORT', S1_COLS,
    `${report.filterDescription}  \u2022  ${report.groups.length} Groups  \u2022  ${uniqueTechniques} Techniques  \u2022  ${report.coveragePercent.toFixed(1)}% Coverage`,
    dateStr, timeStr);

  addColumnHeaders(ws1, 4, ['Metric', 'Value', '', '', '', '', '']);

  const summaryRows: [string, string | number][] = [
    ['Scope', report.filterDescription],
    ['Total Threat Groups', report.groups.length],
    ['Unique Techniques', uniqueTechniques],
    ['Coverage %', `${report.coveragePercent.toFixed(1)}%`],
    ['Risk Rating', report.riskRating],
    ['Average TAW', avgTaw],
    ['Detection Coverage', report.relatedDetections.length],
    ['Coverage Gaps', report.gaps.length],
    ['Software Used', report.software.length],
    ['Campaigns Tracked', report.campaigns.length],
    ['Generated', dateStr],
  ];

  let r1 = 5;
  for (const [label, value] of summaryRows) {
    const row = ws1.getRow(r1);
    row.height = 24;
    const alt = (r1 - 5) % 2 === 1;

    const c1 = row.getCell(1);
    c1.value = label;
    styleDataCell(c1, alt, { bold: true, color: C.textSecondary });

    const c2 = row.getCell(2);
    if (label === 'Risk Rating') {
      c2.value = value;
      applyPill(c2, riskColor(String(value)));
    } else if (label === 'Coverage %') {
      c2.value = value;
      applyPill(c2, coverageColor(report.coveragePercent));
    } else {
      c2.value = value;
      styleDataCell(c2, alt);
    }

    // Fill remaining columns with alt background
    for (let ci = 3; ci <= S1_COLS; ci++) {
      styleDataCell(row.getCell(ci), alt);
    }
    r1++;
  }

  // ----------------------------------------------------------------
  // Threat Groups sub-table (same sheet, below summary metrics)
  // ----------------------------------------------------------------
  r1++; // spacer row

  // Section subheader
  const grpHeaderRow = ws1.getRow(r1);
  grpHeaderRow.height = 28;
  ws1.mergeCells(r1, 1, r1, S1_COLS);
  const grpHeaderCell = grpHeaderRow.getCell(1);
  grpHeaderCell.value = `  THREAT GROUPS \u2014 ${report.groups.length} groups`;
  grpHeaderCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.tertiary } };
  grpHeaderCell.font = { bold: true, size: 11, color: { argb: C.textOnTertiary }, name: 'Calibri' };
  grpHeaderCell.alignment = { horizontal: 'left', vertical: 'middle' };
  r1++;

  addColumnHeaders(ws1, r1, [
    'Name', 'Aliases', 'Activity Type', 'Technique Count', 'Coverage %', 'TAW', 'Last Modified',
  ]);
  const grpHeaderRowNum = r1;
  r1++;

  for (const group of report.groups) {
    const row = ws1.getRow(r1);
    row.height = 22;
    const alt = (r1 - grpHeaderRowNum - 1) % 2 === 1;

    const c1 = row.getCell(1);
    c1.value = group.name;
    styleDataCell(c1, alt, { bold: true });

    const c2 = row.getCell(2);
    const aliases = group.aliases.filter(a => a !== group.name).join(', ');
    c2.value = aliases || '\u2014';
    styleDataCell(c2, alt, { color: aliases ? C.textPrimary : C.textMuted, wrap: true });

    const c3 = row.getCell(3);
    c3.value = group.activityType || '\u2014';
    styleDataCell(c3, alt, { align: 'center' });

    const c4 = row.getCell(4);
    c4.value = group.techniqueCount;
    styleDataCell(c4, alt, { align: 'center' });

    const c5 = row.getCell(5);
    c5.value = `${group.coveragePercent.toFixed(1)}%`;
    applyPill(c5, coverageColor(group.coveragePercent));

    const c6 = row.getCell(6);
    c6.value = group.taw;
    applyPill(c6, tawColor(group.taw));

    const c7 = row.getCell(7);
    c7.value = group.lastModified
      ? new Date(group.lastModified).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
      : '\u2014';
    styleDataCell(c7, alt, { align: 'center', color: C.textSecondary });

    r1++;
  }
  ws1.autoFilter = { from: { row: grpHeaderRowNum, column: 1 }, to: { row: grpHeaderRowNum, column: S1_COLS } };

  // ================================================================
  // SHEET 3: ATT&CK Heatmap
  // ================================================================
  const tacticOrder = [...MITRE_TACTICS] as string[];
  const NUM_TACTICS = tacticOrder.length; // 14

  // Group techniques by tactic
  const heatmapByTactic = new Map<string, TechniqueWithGroups[]>();
  for (const t of tacticOrder) heatmapByTactic.set(t, []);

  for (const tech of report.allTechniques) {
    for (const tactic of tech.tactics) {
      const list = heatmapByTactic.get(tactic);
      if (list) list.push(tech);
    }
  }

  // Sort: covered first (desc by detection count), then uncovered by ID
  for (const [, techs] of heatmapByTactic) {
    techs.sort((a, b) => {
      if (a.detectionCount > 0 && b.detectionCount === 0) return -1;
      if (a.detectionCount === 0 && b.detectionCount > 0) return 1;
      if (a.detectionCount !== b.detectionCount) return b.detectionCount - a.detectionCount;
      return a.mitreId.localeCompare(b.mitreId);
    });
  }

  // Stats for heatmap
  const hmUniqueAll = new Set<string>();
  const hmUniqueCovered = new Set<string>();
  for (const [, techs] of heatmapByTactic) {
    for (const t of techs) {
      hmUniqueAll.add(t.mitreId);
      if (t.detectionCount > 0) hmUniqueCovered.add(t.mitreId);
    }
  }

  const tacticCols: { tactic: string; techs: TechniqueWithGroups[] }[] = [];
  let maxTechRows = 0;
  for (const tactic of tacticOrder) {
    const techs = heatmapByTactic.get(tactic) || [];
    tacticCols.push({ tactic, techs });
    maxTechRows = Math.max(maxTechRows, techs.length);
  }

  const ws3 = wb.addWorksheet('ATT&CK Matrix', {
    views: [{ state: 'frozen', xSplit: 0, ySplit: 5 }],
  });
  for (let i = 0; i < NUM_TACTICS; i++) ws3.getColumn(i + 1).width = 22;

  // Row 1: Branded
  ws3.getRow(1).height = 34;
  ws3.mergeCells(1, 1, 1, 5);
  const hBrand = ws3.getCell(1, 1);
  hBrand.value = 'OPTIMUS';
  hBrand.fill = tertiaryFill;
  hBrand.font = { size: 22, bold: true, color: { argb: C.textOnTertiary }, name: 'Calibri' };
  hBrand.alignment = { horizontal: 'left', vertical: 'middle' };
  ws3.mergeCells(1, 6, 1, NUM_TACTICS);
  const hTitle = ws3.getCell(1, 6);
  hTitle.value = `ATT&CK MATRIX  \u2022  ${report.filterDescription}  \u2022  ${report.coveragePercent.toFixed(1)}% Coverage`;
  hTitle.fill = tertiaryFill;
  hTitle.font = { size: 14, bold: true, color: { argb: C.textOnTertiary }, name: 'Calibri' };
  hTitle.alignment = { horizontal: 'right', vertical: 'middle' };

  // Row 2: Subtitle
  ws3.getRow(2).height = 20;
  ws3.mergeCells(2, 1, 2, 5);
  const hSub = ws3.getCell(2, 1);
  hSub.value = 'Detection Studio';
  hSub.fill = tertiaryFill;
  hSub.font = { size: 11, color: { argb: 'DDCCD6' }, name: 'Calibri' };
  ws3.mergeCells(2, 6, 2, NUM_TACTICS);
  const hMode = ws3.getCell(2, 6);
  hMode.value = `${hmUniqueAll.size} techniques  \u2022  ${hmUniqueCovered.size} covered  \u2022  ${report.relatedDetections.length} detections`;
  hMode.fill = tertiaryFill;
  hMode.font = { size: 9, color: { argb: 'DDCCD6' }, name: 'Calibri' };
  hMode.alignment = { horizontal: 'right', vertical: 'middle' };

  // Row 3: Legend
  ws3.getRow(3).height = 22;
  const legendItems = [
    { label: '\u2588\u2588  5+ Detections (High)', ...heatmapColor(5) },
    { label: '\u2588\u2588  3-4 Detections (Medium)', ...heatmapColor(3) },
    { label: '\u2588\u2588  1-2 Detections (Low)', ...heatmapColor(1) },
    { label: '\u2588\u2588  No Coverage (Gap)', ...heatmapColor(0) },
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

  // Row 5: Tactic column headers
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
      const colors = heatmapColor(tech.detectionCount);
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.bg } };
      cell.font = { size: 8, color: { argb: colors.text }, bold: tech.detectionCount > 0, name: 'Calibri' };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = allBorders;
    });
  }

  // ================================================================
  // SHEETS 4+: Detections — one tab per query language
  // ================================================================
  const SOURCE_LABELS: Record<string, string> = {
    microsoft_sentinel: 'Microsoft Sentinel',
    sigmahq: 'SigmaHQ',
    splunk_escu: 'Splunk ESCU',
    elastic: 'Elastic',
    chronicle: 'Chronicle',
    community: 'Community',
    custom: 'Custom',
  };

  // Group detections by source (vendor) instead of query language
  const detectionsBySource = new Map<string, ReportDetection[]>();
  for (const det of report.relatedDetections) {
    const key = det.source || 'Other';
    if (!detectionsBySource.has(key)) detectionsBySource.set(key, []);
    detectionsBySource.get(key)!.push(det);
  }

  // Sort sources: known sources first (by count desc), then "Other" last
  const sourceOrder = [...detectionsBySource.keys()].sort((a, b) => {
    if (a === 'Other' || a === 'Unknown') return 1;
    if (b === 'Other' || b === 'Unknown') return -1;
    return (detectionsBySource.get(b)?.length || 0) - (detectionsBySource.get(a)?.length || 0);
  });

  const DET_COLS = 9;
  const detHeaders = ['Detection Name', 'Detection ID', 'Language', 'Attribution', 'Relevance', 'MITRE Techniques', 'Status', 'Severity', 'Quality Score'];

  function addDetectionSheet(
    wb: ExcelJS.Workbook,
    sheetName: string,
    langLabel: string,
    dets: ReportDetection[],
    dateStr: string,
    timeStr: string,
  ): void {
    // Excel sheet names max 31 chars
    const safeName = sheetName.slice(0, 31);
    const ws = wb.addWorksheet(safeName, {
      views: [{ state: 'frozen', xSplit: 0, ySplit: 4 }],
    });
    [32, 24, 12, 14, 14, 24, 14, 14, 14].forEach((w, i) => { ws.getColumn(i + 1).width = w; });

    const directCount = dets.filter(d => d.attribution === 'direct').length;
    const indirectCount = dets.filter(d => d.attribution === 'indirect').length;
    addBrandedHeader(ws, `DETECTIONS \u2014 ${langLabel.toUpperCase()}`, DET_COLS,
      `${dets.length} detections (${directCount} direct, ${indirectCount} indirect)  \u2022  ${report.filterDescription}`,
      dateStr, timeStr);
    addColumnHeaders(ws, 4, detHeaders);

    let r = 5;
    for (const det of dets) {
      const row = ws.getRow(r);
      row.height = 22;
      const alt = (r - 5) % 2 === 1;

      const c1 = row.getCell(1);
      c1.value = det.name;
      styleDataCell(c1, alt, { wrap: true });

      const c2 = row.getCell(2);
      c2.value = det.id;
      styleDataCell(c2, alt, { bold: true, color: C.info, align: 'center' });

      const c3 = row.getCell(3);
      c3.value = det.queryLanguage || '\u2014';
      styleDataCell(c3, alt, { align: 'center', color: C.textSecondary });

      const c4 = row.getCell(4);
      c4.value = det.attribution === 'direct' ? 'Direct' : 'Indirect';
      applyPill(c4, attributionColor(det.attribution));

      const c5 = row.getCell(5);
      c5.value = det.relevanceScore;
      applyPill(c5, relevanceColor(det.relevanceScore));

      const c6 = row.getCell(6);
      c6.value = det.mitreAttackIds.join(', ');
      styleDataCell(c6, alt, { wrap: true, color: C.textSecondary });

      const c7 = row.getCell(7);
      c7.value = det.status || '\u2014';
      if (det.status) {
        applyPill(c7, statusColor(det.status));
      } else {
        styleDataCell(c7, alt, { color: C.textMuted, align: 'center' });
      }

      const c8 = row.getCell(8);
      c8.value = det.severity || '\u2014';
      if (det.severity) {
        applyPill(c8, severityColor(det.severity));
      } else {
        styleDataCell(c8, alt, { color: C.textMuted, align: 'center' });
      }

      const c9 = row.getCell(9);
      c9.value = det.qualityScore;
      applyPill(c9, qualityColor(det.qualityScore));

      r++;
    }
    ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: DET_COLS } };
  }

  for (const sourceKey of sourceOrder) {
    const dets = detectionsBySource.get(sourceKey) || [];
    const sourceLabel = SOURCE_LABELS[sourceKey] || sourceKey;
    addDetectionSheet(wb, `Detections - ${sourceLabel}`, sourceLabel, dets, dateStr, timeStr);
  }

  // ================================================================
  // SHEET 5: Gap Analysis
  // ================================================================
  const ws5 = wb.addWorksheet('Gap Analysis', {
    views: [{ state: 'frozen', xSplit: 0, ySplit: 4 }],
  });
  const S5_COLS = 6;
  [16, 36, 24, 14, 14, 14].forEach((w, i) => { ws5.getColumn(i + 1).width = w; });

  addBrandedHeader(ws5, 'GAP ANALYSIS', S5_COLS,
    `${report.gaps.length} uncovered techniques  \u2022  ${report.filterDescription}  \u2022  Sorted by priority`,
    dateStr, timeStr);
  addColumnHeaders(ws5, 4, ['Technique ID', 'Technique Name', 'Tactic', 'Groups Using', 'TIS Score', 'Priority']);

  let r5 = 5;
  for (const gap of report.gaps) {
    const row = ws5.getRow(r5);
    row.height = 22;
    const alt = (r5 - 5) % 2 === 1;

    const c1 = row.getCell(1);
    c1.value = gap.techniqueId;
    styleDataCell(c1, alt, { bold: true, color: C.info, align: 'center' });

    const c2 = row.getCell(2);
    c2.value = gap.techniqueName;
    styleDataCell(c2, alt, { wrap: true });

    const c3 = row.getCell(3);
    c3.value = gap.tactic;
    styleDataCell(c3, alt, { color: C.textSecondary });

    const c4 = row.getCell(4);
    c4.value = gap.groupCount;
    styleDataCell(c4, alt, { align: 'center' });

    const c5 = row.getCell(5);
    c5.value = gap.tisScore;
    applyPill(c5, priorityColor(gap.tisScore));

    const c6 = row.getCell(6);
    c6.value = gap.priority;
    applyPill(c6, priorityColor(gap.priority));

    r5++;
  }
  ws5.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: S5_COLS } };

  // ================================================================
  // SHEET 6: Software & Campaigns
  // ================================================================
  const ws6 = wb.addWorksheet('Software & Campaigns', {
    views: [{ state: 'frozen', xSplit: 0, ySplit: 4 }],
  });
  const S6_COLS = 5;
  [28, 18, 18, 18, 18].forEach((w, i) => { ws6.getColumn(i + 1).width = w; });

  addBrandedHeader(ws6, 'SOFTWARE & CAMPAIGNS', S6_COLS,
    `${report.software.length} software  \u2022  ${report.campaigns.length} campaigns  \u2022  ${report.filterDescription}`,
    dateStr, timeStr);

  // Software section header
  let r6 = 4;
  const softwareHeaderRow = ws6.getRow(r6);
  softwareHeaderRow.height = 28;
  ws6.mergeCells(r6, 1, r6, S6_COLS);
  const softwareHeaderCell = softwareHeaderRow.getCell(1);
  softwareHeaderCell.value = `  SOFTWARE  \u2014  ${report.software.length} items`;
  softwareHeaderCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.primary } };
  softwareHeaderCell.font = { bold: true, size: 11, color: { argb: C.textOnPrimary }, name: 'Calibri' };
  softwareHeaderCell.alignment = { horizontal: 'left', vertical: 'middle' };
  r6++;

  addColumnHeaders(ws6, r6, ['Name', 'Type', 'Groups Using', 'Techniques', '']);
  r6++;

  for (const sw of report.software) {
    const row = ws6.getRow(r6);
    row.height = 22;
    const alt = (r6 % 2) === 1;

    const c1 = row.getCell(1);
    c1.value = sw.name;
    styleDataCell(c1, alt, { bold: true });

    const c2 = row.getCell(2);
    c2.value = sw.type;
    styleDataCell(c2, alt, { align: 'center' });

    const c3 = row.getCell(3);
    c3.value = sw.groupCount;
    styleDataCell(c3, alt, { align: 'center' });

    const c4 = row.getCell(4);
    c4.value = sw.techniqueCount;
    styleDataCell(c4, alt, { align: 'center' });

    const c5 = row.getCell(5);
    styleDataCell(c5, alt);

    r6++;
  }

  // Spacer
  r6++;

  // Campaign section header
  const campaignHeaderRow = ws6.getRow(r6);
  campaignHeaderRow.height = 28;
  ws6.mergeCells(r6, 1, r6, S6_COLS);
  const campaignHeaderCell = campaignHeaderRow.getCell(1);
  campaignHeaderCell.value = `  CAMPAIGNS  \u2014  ${report.campaigns.length} items`;
  campaignHeaderCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.primary } };
  campaignHeaderCell.font = { bold: true, size: 11, color: { argb: C.textOnPrimary }, name: 'Calibri' };
  campaignHeaderCell.alignment = { horizontal: 'left', vertical: 'middle' };
  r6++;

  addColumnHeaders(ws6, r6, ['Name', 'Attributed Group', 'First Seen', 'Last Seen', 'Techniques']);
  r6++;

  for (const camp of report.campaigns) {
    const row = ws6.getRow(r6);
    row.height = 22;
    const alt = (r6 % 2) === 1;

    const c1 = row.getCell(1);
    c1.value = camp.name;
    styleDataCell(c1, alt, { bold: true });

    const c2 = row.getCell(2);
    c2.value = camp.attributedGroup || '\u2014';
    styleDataCell(c2, alt, { color: camp.attributedGroup ? C.textPrimary : C.textMuted });

    const c3 = row.getCell(3);
    c3.value = camp.firstSeen
      ? new Date(camp.firstSeen).toLocaleDateString('en-US', { year: 'numeric', month: 'short' })
      : '\u2014';
    styleDataCell(c3, alt, { align: 'center', color: C.textSecondary });

    const c4 = row.getCell(4);
    c4.value = camp.lastSeen
      ? new Date(camp.lastSeen).toLocaleDateString('en-US', { year: 'numeric', month: 'short' })
      : '\u2014';
    styleDataCell(c4, alt, { align: 'center', color: C.textSecondary });

    const c5 = row.getCell(5);
    c5.value = camp.techniqueCount;
    styleDataCell(c5, alt, { align: 'center' });

    r6++;
  }

  // ================================================================
  // Download
  // ================================================================
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
