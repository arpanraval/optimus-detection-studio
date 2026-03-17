import ExcelJS from 'exceljs';
import { MITRE_TACTICS } from '../../../mitre.js';
import type {
  StateSponsoredReport,
  TechniqueWithGroups,
  ReportDetection,
} from '../types.js';

// ============================================================================
// Design tokens (same palette as internal report)
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
// Border & cell styling helpers
// ============================================================================

const thinBorder: Partial<ExcelJS.Border> = { style: 'thin', color: { argb: C.border } };
const allBorders = { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder };

function coverageColor(pct: number): { bg: string; text: string } {
  if (pct >= 75) return { bg: C.successBg, text: C.success };
  if (pct >= 50) return { bg: C.infoBg, text: C.info };
  if (pct >= 25) return { bg: C.warningBg, text: C.warning };
  return { bg: C.errorBg, text: C.error };
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

function riskColor(rating: string): { bg: string; text: string } {
  const map: Record<string, { bg: string; text: string }> = {
    Critical: { bg: C.errorBg, text: C.error },
    High: { bg: C.warningBg, text: C.warning },
    Medium: { bg: C.infoBg, text: C.info },
    Low: { bg: C.successBg, text: C.success },
  };
  return map[rating] || { bg: C.surfaceDim, text: C.textSecondary };
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

function heatmapColor(detectionCount: number): { bg: string; text: string } {
  if (detectionCount >= 5) return { bg: C.successBg, text: C.success };
  if (detectionCount >= 3) return { bg: C.infoBg, text: C.info };
  if (detectionCount >= 1) return { bg: C.warningBg, text: C.warning };
  return { bg: C.errorBg, text: C.error };
}

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
// Advisory header (no product branding)
// ============================================================================

const tertiaryFill: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.tertiary } };
const statsFill: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.tertiaryDark } };

function addAdvisoryHeader(
  ws: ExcelJS.Worksheet,
  sheetTitle: string,
  colCount: number,
  statsText: string,
  filterDescription: string,
  dateStr: string,
  timeStr: string,
): void {
  if (ws.getColumn(1).width! < 8) ws.getColumn(1).width = 8;

  // Row 1: "THREAT INTELLIGENCE ADVISORY" (not "OPTIMUS")
  ws.getRow(1).height = 34;
  ws.mergeCells(1, 1, 1, Math.min(4, colCount));
  const brand = ws.getCell(1, 1);
  brand.value = 'THREAT INTELLIGENCE ADVISORY';
  brand.fill = tertiaryFill;
  brand.font = { size: 18, bold: true, color: { argb: C.textOnTertiary }, name: 'Calibri' };
  brand.alignment = { horizontal: 'left', vertical: 'middle' };
  if (colCount > 4) {
    ws.mergeCells(1, 5, 1, colCount);
    const title = ws.getCell(1, 5);
    title.value = sheetTitle;
    title.fill = tertiaryFill;
    title.font = { size: 14, bold: true, color: { argb: C.textOnTertiary }, name: 'Calibri' };
    title.alignment = { horizontal: 'right', vertical: 'middle' };
  }

  // Row 2: Filter description (not "Detection Studio")
  ws.getRow(2).height = 20;
  ws.mergeCells(2, 1, 2, Math.min(4, colCount));
  const sub = ws.getCell(2, 1);
  sub.value = filterDescription;
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
// MAIN ADVISORY EXPORT
// ============================================================================

export async function generateAdvisoryExcel(report: StateSponsoredReport): Promise<void> {
  const now = new Date();
  const stamp = formatDateStamp(now);
  const safeName = report.filterDescription.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase().slice(0, 40);
  const filename = `threat-advisory-${safeName}-${stamp}.xlsx`;
  const dateStr = formatDisplayDate(now);
  const timeStr = formatDisplayTime(now);

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Threat Intelligence Advisory';
  wb.created = now;

  // ================================================================
  // SHEET 1: Executive Summary + Threat Groups
  // ================================================================
  const ws1 = wb.addWorksheet('Executive Summary', {
    views: [{ state: 'frozen', xSplit: 0, ySplit: 4 }],
  });
  const S1_COLS = 5;
  [28, 22, 16, 16, 20].forEach((w, i) => { ws1.getColumn(i + 1).width = w; });

  const uniqueTechniques = report.allTechniques.length;

  addAdvisoryHeader(ws1, 'STATE SPONSORED THREAT ASSESSMENT', S1_COLS,
    `${report.groups.length} Groups  \u2022  ${uniqueTechniques} Techniques  \u2022  ${report.coveragePercent.toFixed(1)}% Coverage`,
    report.filterDescription, dateStr, timeStr);

  addColumnHeaders(ws1, 4, ['Metric', 'Value', '', '', '']);

  // Summary metrics — no TAW, no Software Used, no Campaigns Tracked
  const summaryRows: [string, string | number][] = [
    ['Scope', report.filterDescription],
    ['Total Threat Groups', report.groups.length],
    ['Unique Techniques', uniqueTechniques],
    ['Coverage %', `${report.coveragePercent.toFixed(1)}%`],
    ['Risk Rating', report.riskRating],
    ['Detections', report.relatedDetections.length],
    ['Coverage Gaps', report.gaps.length],
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

    for (let ci = 3; ci <= S1_COLS; ci++) {
      styleDataCell(row.getCell(ci), alt);
    }
    r1++;
  }

  // ----------------------------------------------------------------
  // Threat Groups sub-table (5 columns — no TAW, no Activity Type)
  // ----------------------------------------------------------------
  r1++; // spacer row

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
    'Name', 'Aliases', 'Technique Count', 'Coverage %', 'Last Modified',
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
    c3.value = group.techniqueCount;
    styleDataCell(c3, alt, { align: 'center' });

    const c4 = row.getCell(4);
    c4.value = `${group.coveragePercent.toFixed(1)}%`;
    applyPill(c4, coverageColor(group.coveragePercent));

    const c5 = row.getCell(5);
    c5.value = group.lastModified
      ? new Date(group.lastModified).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
      : '\u2014';
    styleDataCell(c5, alt, { align: 'center', color: C.textSecondary });

    r1++;
  }
  ws1.autoFilter = { from: { row: grpHeaderRowNum, column: 1 }, to: { row: grpHeaderRowNum, column: S1_COLS } };

  // ================================================================
  // SHEET 2: ATT&CK Matrix (identical to internal, branding only)
  // ================================================================
  const tacticOrder = [...MITRE_TACTICS] as string[];
  const NUM_TACTICS = tacticOrder.length;

  const heatmapByTactic = new Map<string, TechniqueWithGroups[]>();
  for (const t of tacticOrder) heatmapByTactic.set(t, []);

  for (const tech of report.allTechniques) {
    for (const tactic of tech.tactics) {
      const list = heatmapByTactic.get(tactic);
      if (list) list.push(tech);
    }
  }

  for (const [, techs] of heatmapByTactic) {
    techs.sort((a, b) => {
      if (a.detectionCount > 0 && b.detectionCount === 0) return -1;
      if (a.detectionCount === 0 && b.detectionCount > 0) return 1;
      if (a.detectionCount !== b.detectionCount) return b.detectionCount - a.detectionCount;
      return a.mitreId.localeCompare(b.mitreId);
    });
  }

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

  const ws2 = wb.addWorksheet('ATT&CK Matrix', {
    views: [{ state: 'frozen', xSplit: 0, ySplit: 5 }],
  });
  for (let i = 0; i < NUM_TACTICS; i++) ws2.getColumn(i + 1).width = 22;

  // Row 1: Advisory branding
  ws2.getRow(1).height = 34;
  ws2.mergeCells(1, 1, 1, 5);
  const hBrand = ws2.getCell(1, 1);
  hBrand.value = 'THREAT INTELLIGENCE ADVISORY';
  hBrand.fill = tertiaryFill;
  hBrand.font = { size: 18, bold: true, color: { argb: C.textOnTertiary }, name: 'Calibri' };
  hBrand.alignment = { horizontal: 'left', vertical: 'middle' };
  ws2.mergeCells(1, 6, 1, NUM_TACTICS);
  const hTitle = ws2.getCell(1, 6);
  hTitle.value = `ATT&CK MATRIX  \u2022  ${report.filterDescription}  \u2022  ${report.coveragePercent.toFixed(1)}% Coverage`;
  hTitle.fill = tertiaryFill;
  hTitle.font = { size: 14, bold: true, color: { argb: C.textOnTertiary }, name: 'Calibri' };
  hTitle.alignment = { horizontal: 'right', vertical: 'middle' };

  // Row 2: Stats subtitle
  ws2.getRow(2).height = 20;
  ws2.mergeCells(2, 1, 2, 5);
  const hSub = ws2.getCell(2, 1);
  hSub.value = report.filterDescription;
  hSub.fill = tertiaryFill;
  hSub.font = { size: 11, color: { argb: 'DDCCD6' }, name: 'Calibri' };
  ws2.mergeCells(2, 6, 2, NUM_TACTICS);
  const hMode = ws2.getCell(2, 6);
  hMode.value = `${hmUniqueAll.size} techniques  \u2022  ${hmUniqueCovered.size} covered  \u2022  ${report.relatedDetections.length} detections`;
  hMode.fill = tertiaryFill;
  hMode.font = { size: 9, color: { argb: 'DDCCD6' }, name: 'Calibri' };
  hMode.alignment = { horizontal: 'right', vertical: 'middle' };

  // Row 3: Legend
  ws2.getRow(3).height = 22;
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
    if (endCol > legendColStart) ws2.mergeCells(3, legendColStart, 3, endCol);
    const cell = ws2.getCell(3, legendColStart);
    cell.value = item.label;
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: item.bg } };
    cell.font = { size: 9, bold: true, color: { argb: item.text }, name: 'Calibri' };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = allBorders;
    legendColStart = endCol + 1;
  });

  // Row 4: Spacer
  ws2.getRow(4).height = 4;

  // Row 5: Tactic column headers
  ws2.getRow(5).height = 44;
  tacticCols.forEach(({ tactic, techs }, i) => {
    const covered = techs.filter(t => t.detectionCount > 0).length;
    const cell = ws2.getCell(5, i + 1);
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
    const row = ws2.getRow(6 + techIdx);
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
  // SHEETS 3+: Detections — one tab per source (advisory columns)
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

  const detectionsBySource = new Map<string, ReportDetection[]>();
  for (const det of report.relatedDetections) {
    const key = det.source || 'Other';
    if (!detectionsBySource.has(key)) detectionsBySource.set(key, []);
    detectionsBySource.get(key)!.push(det);
  }

  const sourceOrder = [...detectionsBySource.keys()].sort((a, b) => {
    if (a === 'Other' || a === 'Unknown') return 1;
    if (b === 'Other' || b === 'Unknown') return -1;
    return (detectionsBySource.get(b)?.length || 0) - (detectionsBySource.get(a)?.length || 0);
  });

  const ADV_DET_COLS = 8;
  const advDetHeaders = ['Detection Name', 'Source Rule ID', 'Source URL', 'Language', 'Attribution', 'Relevance', 'MITRE Techniques', 'Severity'];

  function addAdvisoryDetectionSheet(
    wb: ExcelJS.Workbook,
    sheetName: string,
    langLabel: string,
    dets: ReportDetection[],
    filterDesc: string,
    dateStr: string,
    timeStr: string,
  ): void {
    const safeName = sheetName.slice(0, 31);
    const ws = wb.addWorksheet(safeName, {
      views: [{ state: 'frozen', xSplit: 0, ySplit: 4 }],
    });
    [40, 24, 28, 12, 14, 14, 28, 14].forEach((w, i) => { ws.getColumn(i + 1).width = w; });

    const directCount = dets.filter(d => d.attribution === 'direct').length;
    const indirectCount = dets.filter(d => d.attribution === 'indirect').length;
    addAdvisoryHeader(ws, `DETECTIONS \u2014 ${langLabel.toUpperCase()}`, ADV_DET_COLS,
      `${dets.length} detections (${directCount} direct, ${indirectCount} indirect)  \u2022  ${filterDesc}`,
      filterDesc, dateStr, timeStr);
    addColumnHeaders(ws, 4, advDetHeaders);

    let r = 5;
    for (const det of dets) {
      const row = ws.getRow(r);
      row.height = 32;
      const alt = (r - 5) % 2 === 1;

      // Detection Name
      const c1 = row.getCell(1);
      c1.value = det.name;
      styleDataCell(c1, alt, { wrap: true });

      // Source Rule ID (externalId)
      const c2 = row.getCell(2);
      c2.value = det.externalId || '\u2014';
      styleDataCell(c2, alt, { color: det.externalId ? C.textPrimary : C.textMuted, align: 'center' });

      // Source URL (clickable hyperlink — short display text)
      const c3 = row.getCell(3);
      if (det.sourceUrl) {
        // Show just the filename portion as display text, full URL as hyperlink
        const urlParts = det.sourceUrl.split('/');
        const displayText = urlParts[urlParts.length - 1] || det.sourceUrl;
        c3.value = { text: displayText, hyperlink: det.sourceUrl };
        c3.font = { size: 10, name: 'Calibri', color: { argb: C.info }, underline: true };
        c3.alignment = { horizontal: 'left', vertical: 'middle' };
        c3.border = allBorders;
        if (alt) c3.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.surfaceAlt } };
      } else {
        c3.value = '\u2014';
        styleDataCell(c3, alt, { color: C.textMuted });
      }

      // Language
      const c4 = row.getCell(4);
      c4.value = det.queryLanguage || '\u2014';
      styleDataCell(c4, alt, { align: 'center', color: C.textSecondary });

      // Attribution
      const c5 = row.getCell(5);
      c5.value = det.attribution === 'direct' ? 'Direct' : 'Indirect';
      applyPill(c5, attributionColor(det.attribution));

      // Relevance
      const c6 = row.getCell(6);
      c6.value = det.relevanceScore;
      applyPill(c6, relevanceColor(det.relevanceScore));

      // MITRE Techniques
      const c7 = row.getCell(7);
      c7.value = det.mitreAttackIds.join(', ');
      styleDataCell(c7, alt, { wrap: true, color: C.textSecondary });

      // Severity
      const c8 = row.getCell(8);
      c8.value = det.severity || '\u2014';
      if (det.severity) {
        applyPill(c8, severityColor(det.severity));
      } else {
        styleDataCell(c8, alt, { color: C.textMuted, align: 'center' });
      }

      r++;
    }
    ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: ADV_DET_COLS } };
  }

  for (const sourceKey of sourceOrder) {
    const dets = detectionsBySource.get(sourceKey) || [];
    const sourceLabel = SOURCE_LABELS[sourceKey] || sourceKey;
    addAdvisoryDetectionSheet(wb, `Detections - ${sourceLabel}`, sourceLabel, dets, report.filterDescription, dateStr, timeStr);
  }

  // ================================================================
  // SHEET: Gap Analysis (4 columns — no TIS Score, no Priority)
  // ================================================================
  const wsGap = wb.addWorksheet('Gap Analysis', {
    views: [{ state: 'frozen', xSplit: 0, ySplit: 4 }],
  });
  const GAP_COLS = 4;
  [16, 36, 24, 14].forEach((w, i) => { wsGap.getColumn(i + 1).width = w; });

  addAdvisoryHeader(wsGap, 'GAP ANALYSIS', GAP_COLS,
    `${report.gaps.length} uncovered techniques  \u2022  ${report.filterDescription}`,
    report.filterDescription, dateStr, timeStr);
  addColumnHeaders(wsGap, 4, ['Technique ID', 'Technique Name', 'Tactic', 'Groups Using']);

  let rGap = 5;
  for (const gap of report.gaps) {
    const row = wsGap.getRow(rGap);
    row.height = 22;
    const alt = (rGap - 5) % 2 === 1;

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

    rGap++;
  }
  wsGap.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: GAP_COLS } };

  // ================================================================
  // SHEET: Software & Campaigns (identical to internal — already clean)
  // ================================================================
  const wsSC = wb.addWorksheet('Software & Campaigns', {
    views: [{ state: 'frozen', xSplit: 0, ySplit: 4 }],
  });
  const SC_COLS = 5;
  [28, 18, 18, 18, 18].forEach((w, i) => { wsSC.getColumn(i + 1).width = w; });

  addAdvisoryHeader(wsSC, 'SOFTWARE & CAMPAIGNS', SC_COLS,
    `${report.software.length} software  \u2022  ${report.campaigns.length} campaigns  \u2022  ${report.filterDescription}`,
    report.filterDescription, dateStr, timeStr);

  // Software section header
  let rSC = 4;
  const softwareHeaderRow = wsSC.getRow(rSC);
  softwareHeaderRow.height = 28;
  wsSC.mergeCells(rSC, 1, rSC, SC_COLS);
  const softwareHeaderCell = softwareHeaderRow.getCell(1);
  softwareHeaderCell.value = `  SOFTWARE  \u2014  ${report.software.length} items`;
  softwareHeaderCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.primary } };
  softwareHeaderCell.font = { bold: true, size: 11, color: { argb: C.textOnPrimary }, name: 'Calibri' };
  softwareHeaderCell.alignment = { horizontal: 'left', vertical: 'middle' };
  rSC++;

  addColumnHeaders(wsSC, rSC, ['Name', 'Type', 'Groups Using', 'Techniques', '']);
  rSC++;

  for (const sw of report.software) {
    const row = wsSC.getRow(rSC);
    row.height = 22;
    const alt = (rSC % 2) === 1;

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

    rSC++;
  }

  // Spacer
  rSC++;

  // Campaign section header
  const campaignHeaderRow = wsSC.getRow(rSC);
  campaignHeaderRow.height = 28;
  wsSC.mergeCells(rSC, 1, rSC, SC_COLS);
  const campaignHeaderCell = campaignHeaderRow.getCell(1);
  campaignHeaderCell.value = `  CAMPAIGNS  \u2014  ${report.campaigns.length} items`;
  campaignHeaderCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.primary } };
  campaignHeaderCell.font = { bold: true, size: 11, color: { argb: C.textOnPrimary }, name: 'Calibri' };
  campaignHeaderCell.alignment = { horizontal: 'left', vertical: 'middle' };
  rSC++;

  addColumnHeaders(wsSC, rSC, ['Name', 'Attributed Group', 'First Seen', 'Last Seen', 'Techniques']);
  rSC++;

  for (const camp of report.campaigns) {
    const row = wsSC.getRow(rSC);
    row.height = 22;
    const alt = (rSC % 2) === 1;

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

    rSC++;
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
