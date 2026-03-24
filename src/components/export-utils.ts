import { Detection } from '../types';
import ExcelJS from 'exceljs';
import yaml from 'js-yaml';

// ============================================================================
// OPTIMUS LOGO (Base64 PNG - 80x80)
// ============================================================================

export const OPTIMUS_LOGO_BASE64 = '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';

// ============================================================================
// DESIGN TOKENS (Matching your M3 theme)
// ============================================================================

const COLORS = {
  // Primary palette (Teal)
  primary: '006D77',
  primaryDark: '004E57',
  primaryLight: 'E6F3F4',
  
  // Tertiary palette (Purple/Magenta)
  tertiary: '783264',
  tertiaryDark: '5C2750',
  tertiaryLight: 'F5E6EF',
  
  // Surface colors
  surface: 'FFFFFF',
  surfaceAlt: 'F8FAFB',
  surfaceDim: 'F0F4F5',
  
  // Status colors
  success: '1B7D3E',
  successLight: 'E8F5EC',
  warning: 'B65E1A',
  warningLight: 'FFF3E6',
  error: 'B3261E',
  errorLight: 'FDECEA',
  info: '0066CC',
  infoLight: 'E6F0FA',
  
  // Text colors
  textOnPrimary: 'FFFFFF',
  textOnTertiary: 'FFFFFF',
  textPrimary: '1C1B1F',
  textSecondary: '49454F',
  textMuted: '79747E',
  
  // Border colors
  border: 'E0E0E0',
  borderDark: 'BDBDBD',
  borderLight: 'F0F0F0',
};

// Status color mapping
const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  'Production': { bg: COLORS.successLight, text: COLORS.success },
  'Testing': { bg: COLORS.infoLight, text: COLORS.info },
  'Review': { bg: 'F3E8FF', text: '7C3AED' },
  'Development': { bg: COLORS.warningLight, text: COLORS.warning },
  'Draft': { bg: COLORS.surfaceDim, text: COLORS.textSecondary },
  'Backlog': { bg: COLORS.surfaceDim, text: COLORS.textMuted },
  'Deprecated': { bg: COLORS.errorLight, text: COLORS.error },
  'Archived': { bg: COLORS.surfaceDim, text: COLORS.textMuted },
};

// Severity color mapping
const SEVERITY_COLORS: Record<string, { bg: string; text: string }> = {
  'Critical': { bg: COLORS.errorLight, text: COLORS.error },
  'High': { bg: COLORS.tertiaryLight, text: COLORS.tertiary },
  'Medium': { bg: COLORS.warningLight, text: COLORS.warning },
  'Low': { bg: COLORS.primaryLight, text: COLORS.primary },
  'Informational': { bg: COLORS.surfaceDim, text: COLORS.textMuted },
};

// Confidence color mapping
const CONFIDENCE_COLORS: Record<string, { bg: string; text: string }> = {
  'High': { bg: COLORS.successLight, text: COLORS.success },
  'Medium': { bg: COLORS.warningLight, text: COLORS.warning },
  'Low': { bg: COLORS.errorLight, text: COLORS.error },
};

// Maturity color mapping
const MATURITY_COLORS: Record<string, { bg: string; text: string }> = {
  'Stable': { bg: COLORS.successLight, text: COLORS.success },
  'Production': { bg: COLORS.primaryLight, text: COLORS.primary },
  'Beta': { bg: COLORS.warningLight, text: COLORS.warning },
  'Experimental': { bg: COLORS.surfaceDim, text: COLORS.textSecondary },
};

// Detection type color mapping
const DETECTION_TYPE_COLORS: Record<string, { bg: string; text: string }> = {
  'Detection': { bg: COLORS.infoLight, text: COLORS.info },
  'Threat Hunting': { bg: 'F3E8FF', text: '7C3AED' },
  'Correlation': { bg: COLORS.primaryLight, text: COLORS.primary },
  'Anomaly': { bg: COLORS.warningLight, text: COLORS.warning },
};

// Library type color mapping
const LIBRARY_COLORS: Record<string, { bg: string; text: string }> = {
  'universal': { bg: COLORS.infoLight, text: COLORS.info },
  'user': { bg: COLORS.tertiaryLight, text: COLORS.tertiary },
};

// Publish status color mapping
const PUBLISH_STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  'published': { bg: COLORS.successLight, text: COLORS.success },
  'pending': { bg: COLORS.warningLight, text: COLORS.warning },
  'rejected': { bg: COLORS.errorLight, text: COLORS.error },
  'unpublished': { bg: COLORS.surfaceDim, text: COLORS.textMuted },
};

// Source color mapping
const SOURCE_COLORS: Record<string, { bg: string; text: string }> = {
  'sigmahq': { bg: 'E6F0FA', text: '0066CC' },
  'splunk_escu': { bg: 'FFF3E6', text: 'D64000' },
  'elastic': { bg: 'FFF9E6', text: 'B68900' },
  'microsoft': { bg: 'E6F7FA', text: '0078D4' },
  'community': { bg: 'F3E8FF', text: '7C3AED' },
  'custom': { bg: COLORS.surfaceDim, text: COLORS.textSecondary },
};

// ============================================================================
// COLUMN CONFIGURATION - ALL DETECTION FIELDS
// ============================================================================

export interface ExportColumn {
  key: string;
  header: string;
  getValue: (d: Detection) => string;
  width?: number;
  category: string;
}

export const EXPORT_COLUMNS: ExportColumn[] = [
  // === IDENTITY ===
  { key: 'id', header: 'ID', getValue: d => d.id || '', width: 36, category: 'identity' },
  { key: 'user_id', header: 'User ID', getValue: d => d.user_id || '', width: 36, category: 'identity' },
  { key: 'version', header: 'Version', getValue: d => String(d.version || 1), width: 10, category: 'identity' },
  { key: 'external_id', header: 'External ID', getValue: d => d.external_id || '', width: 20, category: 'identity' },
  
  // === BASIC INFORMATION ===
  { key: 'name', header: 'Name', getValue: d => d.name || '', width: 45, category: 'basic' },
  { key: 'description', header: 'Description', getValue: d => d.description || '', width: 60, category: 'basic' },
  { key: 'author', header: 'Author', getValue: d => d.author || '', width: 20, category: 'basic' },
  { key: 'status', header: 'Status', getValue: d => d.status || '', width: 14, category: 'basic' },
  { key: 'maturity', header: 'Maturity', getValue: d => d.maturity || '', width: 14, category: 'basic' },
  { key: 'detectionType', header: 'Detection Type', getValue: d => d.detectionType || '', width: 16, category: 'basic' },
  { key: 'severity', header: 'Severity', getValue: d => d.severity || '', width: 12, category: 'basic' },
  { key: 'confidence', header: 'Confidence', getValue: d => d.confidence || '', width: 12, category: 'basic' },
  { key: 'qualityScore', header: 'Quality Score', getValue: d => String(d.qualityScore || 0), width: 14, category: 'basic' },
  
  // === DATA SOURCES ===
  { key: 'logSource', header: 'Log Source', getValue: d => d.logSource || '', width: 22, category: 'datasources' },
  { key: 'logSources', header: 'Log Sources', getValue: d => (d.logSources || []).join('; '), width: 35, category: 'datasources' },
  { key: 'dataSources', header: 'Data Sources', getValue: d => (d.dataSources || []).join('; '), width: 35, category: 'datasources' },
  { key: 'dataComponents', header: 'Data Components', getValue: d => (d.dataComponents || []).join('; '), width: 35, category: 'datasources' },
  { key: 'platforms', header: 'Platforms', getValue: d => (d.platforms || []).join('; '), width: 25, category: 'datasources' },
  { key: 'technology', header: 'Technology', getValue: d => d.technology || '', width: 18, category: 'datasources' },
  
  // === DETECTION LOGIC ===
  { key: 'queryLanguage', header: 'Query Language', getValue: d => d.queryLanguage || '', width: 16, category: 'detection' },
  { key: 'detectionQuery', header: 'Detection Query', getValue: d => d.detectionQuery || '', width: 80, category: 'detection' },
  { key: 'queryExplanation', header: 'Query Explanation', getValue: d => d.queryExplanation || '', width: 55, category: 'detection' },
  { key: 'queries', header: 'All Queries (JSON)', getValue: d => d.queries?.length ? JSON.stringify(d.queries) : '', width: 80, category: 'detection' },
  
  // === MITRE ATT&CK ===
  { key: 'mitreAttackIds', header: 'MITRE Technique IDs', getValue: d => (d.mitreAttackIds || []).join('; '), width: 28, category: 'mitre' },
  { key: 'mitreTactics', header: 'MITRE Tactics', getValue: d => (d.mitreTactics || []).join('; '), width: 35, category: 'mitre' },
  { key: 'mitreTechniques', header: 'MITRE Techniques', getValue: d => (d.mitreTechniques || []).join('; '), width: 45, category: 'mitre' },
  
  // === THREAT INTELLIGENCE (Linked Entities) ===
  { key: 'linkedGroups', header: 'Linked Threat Groups', getValue: d => (d.linkedGroups || []).map(g => `${g.name} (${g.mitre_id})`).join('; '), width: 40, category: 'threat' },
  { key: 'linkedSoftware', header: 'Linked Software', getValue: d => (d.linkedSoftware || []).map(s => `${s.name} (${s.mitre_id})`).join('; '), width: 40, category: 'threat' },
  { key: 'linkedCampaigns', header: 'Linked Campaigns', getValue: d => (d.linkedCampaigns || []).map(c => `${c.name} (${c.mitre_id})`).join('; '), width: 40, category: 'threat' },
  
  // === THREAT INTELLIGENCE (Legacy) ===
  { key: 'threatActors', header: 'Threat Actors (Legacy)', getValue: d => (d.threatActors || []).join('; '), width: 28, category: 'threat_legacy' },
  { key: 'campaigns', header: 'Campaigns (Legacy)', getValue: d => (d.campaigns || []).join('; '), width: 28, category: 'threat_legacy' },
  { key: 'software', header: 'Software (Legacy)', getValue: d => (d.software || []).join('; '), width: 28, category: 'threat_legacy' },
  
  // === VULNERABILITIES ===
  { key: 'associatedCVEs', header: 'CVEs', getValue: d => (d.associatedCVEs || []).join('; '), width: 28, category: 'vulnerabilities' },
  
  // === INVESTIGATION & RESPONSE ===
  { key: 'investigationSteps', header: 'Investigation Steps (JSON)', getValue: d => d.investigationSteps?.length ? JSON.stringify(d.investigationSteps) : '', width: 60, category: 'response' },
  { key: 'responseActions', header: 'Response Actions', getValue: d => (d.responseActions || []).join('; '), width: 45, category: 'response' },
  { key: 'falsePositiveGuidance', header: 'False Positive Guidance', getValue: d => d.falsePositiveGuidance || '', width: 55, category: 'response' },
  { key: 'prerequisites', header: 'Prerequisites', getValue: d => (d.prerequisites || []).join('; '), width: 35, category: 'response' },
  
  // === TUNING & CONTEXT ===
  { key: 'caveats', header: 'Caveats', getValue: d => d.caveats || '', width: 45, category: 'tuning' },
  { key: 'fineTuning', header: 'Fine Tuning', getValue: d => d.fineTuning || '', width: 45, category: 'tuning' },
  
  // === VALIDATION ===
  { key: 'testedAndValidated', header: 'Validated', getValue: d => d.testedAndValidated ? 'Yes' : 'No', width: 12, category: 'validation' },
  { key: 'validationDate', header: 'Validation Date', getValue: d => d.validationDate || '', width: 18, category: 'validation' },
  { key: 'validationEnvironment', header: 'Validation Environment', getValue: d => d.validationEnvironment || '', width: 28, category: 'validation' },
  { key: 'testCases', header: 'Test Cases', getValue: d => (d.testCases || []).join('; '), width: 45, category: 'validation' },
  
  // === METADATA ===
  { key: 'references', header: 'References', getValue: d => (d.references || []).join('; '), width: 55, category: 'metadata' },
  { key: 'tags', header: 'Tags', getValue: d => (d.tags || []).join('; '), width: 35, category: 'metadata' },
  
  // === LIBRARY INFO ===
  { key: 'library_type', header: 'Library Type', getValue: d => d.library_type || '', width: 14, category: 'library' },
  { key: 'source', header: 'Source', getValue: d => d.source || '', width: 14, category: 'library' },
  { key: 'source_rule_id', header: 'Source Rule ID', getValue: d => d.source_rule_id || '', width: 36, category: 'library' },
  { key: 'source_url', header: 'Source URL', getValue: d => d.source_url || '', width: 45, category: 'library' },
  { key: 'promotion_status', header: 'Promotion Status', getValue: d => d.promotion_status || '', width: 16, category: 'library' },
  { key: 'promoted_to_id', header: 'Promoted To ID', getValue: d => d.promoted_to_id || '', width: 36, category: 'library' },
  { key: 'promoted_at', header: 'Promoted At', getValue: d => d.promoted_at || '', width: 22, category: 'library' },
  
  // === DATES ===
  { key: 'createdDate', header: 'Created Date', getValue: d => d.createdDate || '', width: 22, category: 'dates' },
  { key: 'updatedDate', header: 'Updated Date', getValue: d => d.updatedDate || '', width: 22, category: 'dates' },
  { key: 'created_by', header: 'Created By', getValue: d => d.created_by || '', width: 22, category: 'dates' },
  { key: 'updated_by', header: 'Updated By', getValue: d => d.updated_by || '', width: 22, category: 'dates' },
  
  // === AUDIT ===
  { key: 'auditLog', header: 'Audit Log (JSON)', getValue: d => d.auditLog?.length ? JSON.stringify(d.auditLog) : '', width: 60, category: 'audit' },
];

// Column categories for export modal
export const COLUMN_CATEGORIES: { key: string; label: string; columns: string[] }[] = [
  { key: 'identity', label: 'Identity', columns: ['id', 'user_id', 'version', 'external_id'] },
  { key: 'basic', label: 'Basic Information', columns: ['name', 'description', 'author', 'status', 'maturity', 'detectionType', 'severity', 'confidence', 'qualityScore'] },
  { key: 'datasources', label: 'Data Sources', columns: ['logSource', 'logSources', 'dataSources', 'dataComponents', 'platforms', 'technology'] },
  { key: 'detection', label: 'Detection Logic', columns: ['queryLanguage', 'detectionQuery', 'queryExplanation', 'queries'] },
  { key: 'mitre', label: 'MITRE ATT&CK', columns: ['mitreAttackIds', 'mitreTactics', 'mitreTechniques'] },
  { key: 'threat', label: 'Threat Intelligence', columns: ['linkedGroups', 'linkedSoftware', 'linkedCampaigns'] },
  { key: 'threat_legacy', label: 'Threat Intel (Legacy)', columns: ['threatActors', 'campaigns', 'software'] },
  { key: 'vulnerabilities', label: 'Vulnerabilities', columns: ['associatedCVEs'] },
  { key: 'response', label: 'Investigation & Response', columns: ['investigationSteps', 'responseActions', 'falsePositiveGuidance', 'prerequisites'] },
  { key: 'tuning', label: 'Tuning & Context', columns: ['caveats', 'fineTuning'] },
  { key: 'validation', label: 'Validation', columns: ['testedAndValidated', 'validationDate', 'validationEnvironment', 'testCases'] },
  { key: 'metadata', label: 'Metadata', columns: ['references', 'tags'] },
  { key: 'library', label: 'Library Info', columns: ['library_type', 'source', 'source_rule_id', 'source_url', 'publish_status', 'published_to_id', 'published_at'] },
  { key: 'dates', label: 'Dates & Audit', columns: ['createdDate', 'updatedDate', 'created_by', 'updated_by', 'auditLog'] },
];

export const DEFAULT_LIST_COLUMNS = ['id', 'name', 'severity', 'status', 'updatedDate', 'detectionType'];

export const DEFAULT_EXPORT_COLUMNS = [
  'id', 'name', 'status', 'severity', 'detectionType', 'qualityScore',
  'description', 'author', 'technology', 'logSource',
  'mitreTactics', 'mitreAttackIds', 'mitreTechniques',
  'linkedGroups', 'linkedSoftware', 'linkedCampaigns',
  'queryLanguage', 'detectionQuery',
  'tags', 'createdDate', 'updatedDate'
];

// ============================================================================
// CSV EXPORT
// ============================================================================

function escapeCSVValue(value: string): string {
  if (!value) return '';
  const needsEscape = value.includes(',') || value.includes('"') || value.includes('\n') || value.includes('\r');
  return needsEscape ? `"${value.replace(/"/g, '""')}"` : value;
}

export function generateCSV(detections: Detection[], columnKeys?: string[]): string {
  const keys = columnKeys && columnKeys.length > 0 ? columnKeys : DEFAULT_EXPORT_COLUMNS;
  const columns = EXPORT_COLUMNS.filter(c => keys.includes(c.key));
  
  const headers = columns.map(col => escapeCSVValue(col.header)).join(',');
  const rows = detections.map(detection => 
    columns.map(col => escapeCSVValue(col.getValue(detection))).join(',')
  );
  
  return [headers, ...rows].join('\n');
}

export function downloadCSV(detections: Detection[], filename?: string, columnKeys?: string[]): void {
  const csv = generateCSV(detections, columnKeys);
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
  downloadBlob(blob, filename || `detections-${new Date().toISOString().split('T')[0]}.csv`);
}

// ============================================================================
// EXCEL EXPORT (ExcelJS with full formatting + Logo)
// ============================================================================

// Helper to apply color styling to a cell
function applyColorStyle(cell: ExcelJS.Cell, colors: { bg: string; text: string }) {
  cell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: colors.bg }
  };
  cell.font = {
    ...cell.font,
    color: { argb: colors.text },
    bold: true
  };
  cell.alignment = {
    horizontal: 'center',
    vertical: 'middle'
  };
}

// Helper to get quality score color
function getQualityScoreStyle(score: number): { bg: string; text: string } {
  if (score >= 80) return { bg: COLORS.successLight, text: COLORS.success };
  if (score >= 60) return { bg: COLORS.primaryLight, text: COLORS.primary };
  if (score >= 40) return { bg: COLORS.warningLight, text: COLORS.warning };
  return { bg: COLORS.errorLight, text: COLORS.error };
}

// Thin border style
const thinBorder: Partial<ExcelJS.Border> = { style: 'thin', color: { argb: COLORS.border } };
const noBorder: Partial<ExcelJS.Border> = { style: undefined };

export async function downloadExcel(detections: Detection[], filename?: string, columnKeys?: string[]): Promise<void> {
  const keys = columnKeys && columnKeys.length > 0 ? columnKeys : DEFAULT_EXPORT_COLUMNS;
  const columns = EXPORT_COLUMNS.filter(c => keys.includes(c.key));
  
  try {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Optimus Detection Studio';
    workbook.created = new Date();
    workbook.modified = new Date();
    
    // ========================================
    // MAIN DATA SHEET
    // ========================================
    const worksheet = workbook.addWorksheet('Detections', {
      views: [{ state: 'frozen', xSplit: 0, ySplit: 7 }]
    });
    
    const totalColumns = columns.length;
    const lastCol = totalColumns > 0 ? totalColumns : 1;
    const midCol = Math.floor(lastCol / 2);
    
    // Set column widths first
    columns.forEach((col, idx) => {
      worksheet.getColumn(idx + 1).width = col.width || 15;
    });
    
    // ----- ADD LOGO IMAGE -----
    const logoImageId = workbook.addImage({
      base64: OPTIMUS_LOGO_BASE64,
      extension: 'png',
    });
    
    worksheet.addImage(logoImageId, {
      tl: { col: 0.2, row: 0.2 },
      ext: { width: 50, height: 50 }
    });
    
    // ----- ROW 1: Brand Name -----
    worksheet.getRow(1).height = 30;
    worksheet.mergeCells(1, 2, 1, 4);
    const brandCell = worksheet.getCell(1, 2);
    brandCell.value = 'OPTIMUS';
    brandCell.font = { size: 24, bold: true, color: { argb: COLORS.primary }, name: 'Calibri' };
    brandCell.alignment = { horizontal: 'left', vertical: 'middle' };
    
    // Title in center
    if (totalColumns > 8) {
      worksheet.mergeCells(1, 5, 1, lastCol - 4);
      const titleCell = worksheet.getCell(1, 5);
      titleCell.value = 'DETECTION LIBRARY EXPORT';
      titleCell.font = { size: 16, bold: true, color: { argb: COLORS.textPrimary }, name: 'Calibri' };
      titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    }
    
    // Client logo placeholder
    if (totalColumns > 4) {
      worksheet.mergeCells(1, lastCol - 3, 2, lastCol);
      const clientCell = worksheet.getCell(1, lastCol - 3);
      clientCell.value = '[ Insert Client Logo ]';
      clientCell.font = { size: 10, italic: true, color: { argb: COLORS.textMuted }, name: 'Calibri' };
      clientCell.alignment = { horizontal: 'center', vertical: 'middle' };
      clientCell.border = {
        top: { style: 'dashed', color: { argb: COLORS.border } },
        bottom: { style: 'dashed', color: { argb: COLORS.border } },
        left: { style: 'dashed', color: { argb: COLORS.border } },
        right: { style: 'dashed', color: { argb: COLORS.border } }
      };
    }
    
    // ----- ROW 2: Subtitle -----
    worksheet.getRow(2).height = 18;
    worksheet.mergeCells(2, 2, 2, 4);
    const subtitleCell = worksheet.getCell(2, 2);
    subtitleCell.value = 'Detection Studio';
    subtitleCell.font = { size: 11, color: { argb: COLORS.tertiary }, name: 'Calibri' };
    subtitleCell.alignment = { horizontal: 'left', vertical: 'top' };
    
    // ----- ROW 3: Tertiary Brand Bar -----
    worksheet.getRow(3).height = 6;
    worksheet.mergeCells(3, 1, 3, lastCol);
    const brandBar = worksheet.getCell(3, 1);
    brandBar.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: COLORS.tertiary }
    };
    
    // ----- ROW 4: Export Info -----
    worksheet.getRow(4).height = 20;
    worksheet.mergeCells(4, 1, 4, lastCol);
    const exportDate = new Date();
    const dateStr = exportDate.toLocaleDateString('en-US', { 
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' 
    });
    const timeStr = exportDate.toLocaleTimeString('en-US', { 
      hour: '2-digit', minute: '2-digit', timeZoneName: 'short'
    });
    const infoCell = worksheet.getCell(4, 1);
    infoCell.value = `Exported: ${dateStr} at ${timeStr}`;
    infoCell.font = { size: 10, color: { argb: COLORS.textSecondary }, name: 'Calibri' };
    infoCell.alignment = { horizontal: 'left', vertical: 'middle' };
    infoCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.surfaceAlt } };
    
    // ----- ROW 5: Stats -----
    worksheet.getRow(5).height = 20;
    worksheet.mergeCells(5, 1, 5, lastCol);
    const statsCell = worksheet.getCell(5, 1);
    statsCell.value = `Total Records: ${detections.length}  •  Columns: ${columns.length}  •  Generated by Optimus Detection Studio`;
    statsCell.font = { size: 10, color: { argb: COLORS.textSecondary }, name: 'Calibri' };
    statsCell.alignment = { horizontal: 'left', vertical: 'middle' };
    statsCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.surfaceAlt } };
    
    // ----- ROW 6: Spacer -----
    worksheet.getRow(6).height = 4;
    
    // ----- ROW 7: Column Headers -----
    const headerRow = worksheet.getRow(7);
    headerRow.height = 32;
    columns.forEach((col, idx) => {
      const cell = headerRow.getCell(idx + 1);
      cell.value = col.header;
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: COLORS.primaryDark }
      };
      cell.font = {
        bold: true,
        color: { argb: COLORS.textOnPrimary },
        size: 11,
        name: 'Calibri'
      };
      cell.alignment = {
        horizontal: 'center',
        vertical: 'middle',
        wrapText: true
      };
      cell.border = {
        top: { style: 'thin', color: { argb: COLORS.primary } },
        bottom: { style: 'medium', color: { argb: COLORS.tertiary } },
        left: { style: 'thin', color: { argb: COLORS.primaryDark } },
        right: { style: 'thin', color: { argb: COLORS.primaryDark } }
      };
    });
    
    // ----- DATA ROWS -----
    detections.forEach((detection, rowIndex) => {
      const row = worksheet.getRow(rowIndex + 8);
      const isAltRow = rowIndex % 2 === 1;
      
      columns.forEach((col, colIndex) => {
        const cell = row.getCell(colIndex + 1);
        const value = col.getValue(detection);
        cell.value = value;
        
        // Base styling
        cell.font = { size: 10, name: 'Calibri', color: { argb: COLORS.textPrimary } };
        cell.alignment = { vertical: 'top', wrapText: true };
        cell.border = {
          top: thinBorder,
          bottom: thinBorder,
          left: thinBorder,
          right: thinBorder
        };
        
        // Alternating row background
        if (isAltRow) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.surfaceAlt } };
        }
        
        // === COLUMN-SPECIFIC COLOR CODING ===
        if (col.key === 'severity' && value && SEVERITY_COLORS[value]) {
          applyColorStyle(cell, SEVERITY_COLORS[value]);
        }
        
        if (col.key === 'status' && value && STATUS_COLORS[value]) {
          applyColorStyle(cell, STATUS_COLORS[value]);
        }
        
        if (col.key === 'maturity' && value && MATURITY_COLORS[value]) {
          applyColorStyle(cell, MATURITY_COLORS[value]);
        }
        
        if (col.key === 'confidence' && value && CONFIDENCE_COLORS[value]) {
          applyColorStyle(cell, CONFIDENCE_COLORS[value]);
        }
        
        if (col.key === 'detectionType' && value && DETECTION_TYPE_COLORS[value]) {
          applyColorStyle(cell, DETECTION_TYPE_COLORS[value]);
        }
        
        if (col.key === 'qualityScore') {
          const score = parseInt(value, 10) || 0;
          applyColorStyle(cell, getQualityScoreStyle(score));
          cell.value = score;
        }
        
        if (col.key === 'testedAndValidated') {
          if (value === 'Yes') {
            cell.value = '✓ Yes';
            applyColorStyle(cell, { bg: COLORS.successLight, text: COLORS.success });
          } else {
            cell.value = '✗ No';
            applyColorStyle(cell, { bg: COLORS.surfaceDim, text: COLORS.textMuted });
          }
        }
        
        if (col.key === 'library_type' && value && LIBRARY_COLORS[value]) {
          applyColorStyle(cell, LIBRARY_COLORS[value]);
          cell.value = value === 'universal' ? '🌐 Universal' : '👤 User';
        }
        
        if (col.key === 'publish_status' && value && PUBLISH_STATUS_COLORS[value]) {
          applyColorStyle(cell, PUBLISH_STATUS_COLORS[value]);
          const icons: Record<string, string> = { 'published': '✓', 'pending': '⏳', 'rejected': '✗', 'unpublished': '○' };
          cell.value = `${icons[value] || ''} ${value.charAt(0).toUpperCase() + value.slice(1)}`;
        }
        
        if (col.key === 'source' && value && SOURCE_COLORS[value]) {
          applyColorStyle(cell, SOURCE_COLORS[value]);
          const labels: Record<string, string> = { 'sigmahq': 'SigmaHQ', 'splunk_escu': 'Splunk ESCU', 'elastic': 'Elastic', 'microsoft': 'Microsoft', 'community': 'Community', 'custom': 'Custom' };
          cell.value = labels[value] || value;
        }
        
        if ((col.key === 'references' || col.key === 'source_url') && value) {
          cell.font = { ...cell.font, color: { argb: COLORS.info }, underline: true };
        }
        
        if (['mitreAttackIds', 'mitreTactics', 'mitreTechniques'].includes(col.key) && value) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8E6' } };
          cell.font = { ...cell.font, color: { argb: 'B65E1A' } };
        }
        
        if (['linkedGroups', 'linkedSoftware', 'linkedCampaigns'].includes(col.key) && value) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.errorLight } };
          cell.font = { ...cell.font, color: { argb: COLORS.error } };
        }
      });
    });
    
    // Auto-filter
    if (columns.length > 0) {
      worksheet.autoFilter = { from: { row: 7, column: 1 }, to: { row: 7, column: columns.length } };
    }
    
    // ========================================
    // EXPORT INFO SHEET
    // ========================================
    const infoSheet = workbook.addWorksheet('Export Info');
    
    // Add logo to info sheet too
    infoSheet.addImage(logoImageId, { tl: { col: 0.2, row: 0.2 }, ext: { width: 40, height: 40 } });
    
    infoSheet.mergeCells('B1:D1');
    const infoTitle = infoSheet.getCell('B1');
    infoTitle.value = 'Optimus Detection Studio';
    infoTitle.font = { bold: true, size: 18, color: { argb: COLORS.primary } };
    infoSheet.getRow(1).height = 35;
    
    infoSheet.mergeCells('B2:D2');
    const infoSubtitle = infoSheet.getCell('B2');
    infoSubtitle.value = 'Export Report';
    infoSubtitle.font = { size: 12, color: { argb: COLORS.tertiary } };
    
    // Tertiary bar
    infoSheet.getRow(3).height = 4;
    infoSheet.mergeCells('A3:D3');
    infoSheet.getCell('A3').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.tertiary } };
    
    const infoData: [string, string][] = [
      ['', ''],
      ['Export Date', exportDate.toLocaleString()],
      ['Total Detections', String(detections.length)],
      ['Columns Exported', String(columns.length)],
      ['', ''],
      ['CATEGORIES INCLUDED', ''],
    ];
    
    const includedCategories = [...new Set(columns.map(c => c.category))];
    COLUMN_CATEGORIES.filter(cat => includedCategories.includes(cat.key)).forEach(cat => {
      infoData.push(['  • ' + cat.label, '']);
    });
    
    infoData.push(['', ''], ['COLUMNS INCLUDED', '']);
    columns.forEach(col => infoData.push(['  • ' + col.header, col.key]));
    
    infoData.forEach((rowData, idx) => {
      const row = infoSheet.getRow(idx + 4);
      row.getCell(1).value = rowData[0];
      row.getCell(2).value = rowData[1];
      
      if (rowData[0] === 'CATEGORIES INCLUDED' || rowData[0] === 'COLUMNS INCLUDED') {
        row.getCell(1).font = { bold: true, size: 11, color: { argb: COLORS.tertiary } };
      } else if (rowData[0]?.startsWith('  •')) {
        row.getCell(1).font = { size: 10, color: { argb: COLORS.textSecondary } };
        row.getCell(2).font = { size: 10, color: { argb: COLORS.textMuted }, italic: true };
      } else if (rowData[0] && rowData[1]) {
        row.getCell(1).font = { bold: true, size: 10 };
        row.getCell(2).font = { size: 10 };
      }
    });
    
    infoSheet.getColumn(1).width = 35;
    infoSheet.getColumn(2).width = 45;
    
    // ========================================
    // GENERATE FILE
    // ========================================
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    downloadBlob(blob, filename || `detections-${new Date().toISOString().split('T')[0]}.xlsx`);
    
  } catch (error) {
    console.error('Excel export failed, falling back to CSV:', error);
    downloadCSV(detections, filename?.replace('.xlsx', '.csv'), columnKeys);
  }
}

// ============================================================================
// JSON EXPORT
// ============================================================================

export function downloadJSON(detections: Detection[], filename?: string, columnKeys?: string[]): void {
  let exportData: any[];
  
  if (columnKeys && columnKeys.length > 0) {
    const columns = EXPORT_COLUMNS.filter(c => columnKeys.includes(c.key));
    exportData = detections.map(d => {
      const obj: Record<string, string> = {};
      columns.forEach(c => { obj[c.key] = c.getValue(d); });
      return obj;
    });
  } else {
    exportData = detections;
  }
  
  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json;charset=utf-8;' });
  downloadBlob(blob, filename || `detections-${new Date().toISOString().split('T')[0]}.json`);
}

// ============================================================================
// YAML EXPORT (Sigma-compatible format)
// ============================================================================

/**
 * Convert a detection to Sigma YAML format
 */
function detectionToSigmaYAML(detection: Detection): object {
  // Map severity to Sigma level
  const levelMap: Record<string, string> = {
    'Critical': 'critical',
    'High': 'high',
    'Medium': 'medium',
    'Low': 'low',
    'Informational': 'informational',
  };

  // Map status to Sigma status
  const statusMap: Record<string, string> = {
    'Production': 'stable',
    'Testing': 'test',
    'Review': 'test',
    'Development': 'experimental',
    'Draft': 'experimental',
    'Backlog': 'experimental',
    'Deprecated': 'deprecated',
    'Archived': 'deprecated',
  };

  // Build MITRE ATT&CK tags
  const mitreTags: string[] = [];
  if (detection.mitreTactics?.length) {
    detection.mitreTactics.forEach(tactic => {
      const tacticSlug = tactic.toLowerCase().replace(/\s+/g, '_');
      mitreTags.push(`attack.${tacticSlug}`);
    });
  }
  if (detection.mitreAttackIds?.length) {
    detection.mitreAttackIds.forEach(id => {
      mitreTags.push(`attack.${id.toLowerCase()}`);
    });
  }

  // Build CVE tags
  const cveTags = (detection.associatedCVEs || []).map(cve => `cve.${cve.toLowerCase()}`);

  // Build logsource from detection fields
  const logsource: Record<string, string> = {};
  if (detection.technology) {
    logsource.product = detection.technology.toLowerCase();
  }
  if (detection.logSource) {
    // Try to parse log source intelligently
    const logSourceLower = detection.logSource.toLowerCase();
    if (logSourceLower.includes('process') || logSourceLower.includes('sysmon')) {
      logsource.category = 'process_creation';
    } else if (logSourceLower.includes('network')) {
      logsource.category = 'network_connection';
    } else if (logSourceLower.includes('file')) {
      logsource.category = 'file_event';
    } else if (logSourceLower.includes('registry')) {
      logsource.category = 'registry_event';
    } else {
      logsource.service = detection.logSource;
    }
  }
  if (detection.platforms?.length) {
    // Use first platform as product if not set
    if (!logsource.product) {
      logsource.product = detection.platforms[0].toLowerCase();
    }
  }

  // Build the Sigma rule structure
  const sigmaRule: Record<string, any> = {
    title: detection.name || 'Untitled Detection',
    id: detection.external_id || detection.id,
    status: statusMap[detection.status] || 'experimental',
    description: detection.description || '',
    references: detection.references || [],
    author: detection.author || 'Unknown',
    date: detection.createdDate ? detection.createdDate.split('T')[0] : new Date().toISOString().split('T')[0],
    modified: detection.updatedDate ? detection.updatedDate.split('T')[0] : undefined,
    tags: [...mitreTags, ...cveTags, ...(detection.tags || [])],
    logsource: Object.keys(logsource).length > 0 ? logsource : { category: 'process_creation', product: 'windows' },
    detection: {
      // If we have a query, try to parse it as detection logic
      // Otherwise provide a placeholder
      selection: detection.detectionQuery || '# Detection query not available',
      condition: 'selection',
    },
    falsepositives: detection.falsePositiveGuidance
      ? detection.falsePositiveGuidance.split('\n').filter(l => l.trim())
      : ['Unknown'],
    level: levelMap[detection.severity] || 'medium',
  };

  // Add optional fields
  if (detection.queryLanguage) {
    sigmaRule['# queryLanguage'] = detection.queryLanguage;
  }
  if (detection.qualityScore !== undefined) {
    sigmaRule['# qualityScore'] = detection.qualityScore;
  }

  // Remove undefined values
  Object.keys(sigmaRule).forEach(key => {
    if (sigmaRule[key] === undefined || sigmaRule[key] === '') {
      delete sigmaRule[key];
    }
  });

  return sigmaRule;
}

/**
 * Export detections as YAML (Sigma format)
 * Each detection becomes a separate YAML document in the file
 */
export function downloadYAML(detections: Detection[], filename?: string): void {
  const yamlDocuments = detections.map(detection => {
    const sigmaRule = detectionToSigmaYAML(detection);
    return yaml.dump(sigmaRule, {
      indent: 4,
      lineWidth: 120,
      noRefs: true,
      sortKeys: false,
      quotingType: '"',
      forceQuotes: false,
    });
  });

  // Join with YAML document separator
  const content = yamlDocuments.join('\n---\n\n');

  const blob = new Blob([content], { type: 'text/yaml;charset=utf-8;' });
  downloadBlob(blob, filename || `detections-${new Date().toISOString().split('T')[0]}.yaml`);
}

/**
 * Export a single detection as YAML
 */
export function downloadSingleYAML(detection: Detection, filename?: string): void {
  const sigmaRule = detectionToSigmaYAML(detection);
  const content = yaml.dump(sigmaRule, {
    indent: 4,
    lineWidth: 120,
    noRefs: true,
    sortKeys: false,
    quotingType: '"',
    forceQuotes: false,
  });

  const safeName = (detection.name || 'detection').toLowerCase().replace(/[^a-z0-9]+/g, '_');
  const blob = new Blob([content], { type: 'text/yaml;charset=utf-8;' });
  downloadBlob(blob, filename || `${safeName}.yaml`);
}

// ============================================================================
// HELPERS
// ============================================================================

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export type ExportFormat = 'csv' | 'excel' | 'json' | 'yaml';

export async function exportDetections(
  detections: Detection[],
  format: ExportFormat,
  columns?: string[],
  filename?: string
): Promise<void> {
  switch (format) {
    case 'csv': downloadCSV(detections, filename, columns); break;
    case 'excel': await downloadExcel(detections, filename, columns); break;
    case 'json': downloadJSON(detections, filename, columns); break;
    case 'yaml': downloadYAML(detections, filename); break;
  }
}