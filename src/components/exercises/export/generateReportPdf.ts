import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { StateSponsoredReport } from '../types.js';

// ============================================================================
// Design tokens (same as pdf-export-utils.ts)
// ============================================================================

const COLORS = {
  primary: '#006D77',
  primaryDark: '#004E57',
  primaryLight: '#E6F3F4',
  tertiary: '#783264',
  tertiaryDark: '#5C2750',
  tertiaryLight: '#F5E6EF',
  surface: '#FFFFFF',
  surfaceAlt: '#F8FAFB',
  surfaceDim: '#F0F4F5',
  success: '#4D7C6F',
  successLight: '#E1EDE9',
  warning: '#9A4E0F',
  warningLight: '#FFF3E6',
  error: '#9C1B14',
  errorLight: '#FDECEA',
  info: '#004D99',
  infoLight: '#E6F0FA',
  textPrimary: '#1C1B1F',
  textSecondary: '#49454F',
  textMuted: '#79747E',
  border: '#E0E0E0',
};

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  Production: { bg: COLORS.successLight, text: COLORS.success },
  Testing: { bg: COLORS.infoLight, text: COLORS.info },
  Review: { bg: '#F3E8FF', text: '#7C3AED' },
  Development: { bg: COLORS.warningLight, text: COLORS.warning },
  Draft: { bg: COLORS.surfaceDim, text: COLORS.textSecondary },
};

const SEVERITY_COLORS: Record<string, { bg: string; text: string }> = {
  Critical: { bg: COLORS.errorLight, text: COLORS.error },
  High: { bg: COLORS.tertiaryLight, text: COLORS.tertiary },
  Medium: { bg: COLORS.warningLight, text: COLORS.warning },
  Low: { bg: COLORS.primaryLight, text: COLORS.primary },
  Informational: { bg: COLORS.surfaceDim, text: COLORS.textMuted },
};

const RISK_COLORS: Record<string, { bg: string; text: string }> = {
  Critical: { bg: COLORS.errorLight, text: COLORS.error },
  High: { bg: COLORS.warningLight, text: COLORS.warning },
  Medium: { bg: COLORS.infoLight, text: COLORS.info },
  Low: { bg: COLORS.successLight, text: COLORS.success },
};

// ============================================================================
// Helpers
// ============================================================================

function hexToRgb(hex: string): [number, number, number] {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return [0, 0, 0];
  return [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)];
}

function coverageColors(pct: number): { bg: string; text: string } {
  if (pct >= 75) return { bg: COLORS.successLight, text: COLORS.success };
  if (pct >= 50) return { bg: COLORS.infoLight, text: COLORS.info };
  if (pct >= 25) return { bg: COLORS.warningLight, text: COLORS.warning };
  return { bg: COLORS.errorLight, text: COLORS.error };
}

function tawColors(taw: number): { bg: string; text: string } {
  if (taw >= 80) return { bg: COLORS.errorLight, text: COLORS.error };
  if (taw >= 60) return { bg: COLORS.warningLight, text: COLORS.warning };
  if (taw >= 40) return { bg: COLORS.infoLight, text: COLORS.info };
  return { bg: COLORS.successLight, text: COLORS.success };
}

function qualityColors(score: number): { bg: string; text: string } {
  if (score >= 80) return { bg: COLORS.successLight, text: COLORS.success };
  if (score >= 60) return { bg: COLORS.infoLight, text: COLORS.info };
  if (score >= 40) return { bg: COLORS.warningLight, text: COLORS.warning };
  return { bg: COLORS.errorLight, text: COLORS.error };
}

function priorityColors(priority: number): { bg: string; text: string } {
  if (priority >= 80) return { bg: COLORS.errorLight, text: COLORS.error };
  if (priority >= 60) return { bg: COLORS.warningLight, text: COLORS.warning };
  if (priority >= 40) return { bg: COLORS.infoLight, text: COLORS.info };
  return { bg: COLORS.successLight, text: COLORS.success };
}

function formatShortDate(dateStr: string | null): string {
  if (!dateStr) return '\u2014';
  try {
    return new Date(dateStr).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return dateStr;
  }
}

// ============================================================================
// MAIN PDF EXPORT
// ============================================================================

export async function generateReportPdf(report: StateSponsoredReport): Promise<void> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;
  const contentWidth = pageWidth - margin * 2;
  let yPos: number;

  const dateLabel = new Date().toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  });

  const avgTaw = report.groups.length > 0
    ? Math.round(report.groups.reduce((s, g) => s + g.taw, 0) / report.groups.length)
    : 0;

  // ================================================================
  // Footer helper (added to every page at the end)
  // ================================================================
  function addFooter(pageNum: number, totalPages: number): void {
    doc.setFontSize(8);
    doc.setTextColor(...hexToRgb(COLORS.textMuted));
    doc.text(
      `Generated by Optimus Detection Studio  |  Page ${pageNum} of ${totalPages}`,
      pageWidth / 2,
      pageHeight - 8,
      { align: 'center' },
    );
  }

  // ================================================================
  // SECTION 1: Cover Header (first ~60mm)
  // ================================================================
  const headerHeight = 60;

  // Main background
  doc.setFillColor(...hexToRgb(COLORS.tertiary));
  doc.rect(0, 0, pageWidth, headerHeight, 'F');

  // Bottom accent stripe
  doc.setFillColor(...hexToRgb(COLORS.tertiaryDark));
  doc.rect(0, headerHeight - 4, pageWidth, 4, 'F');

  // Branding
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.text('OPTIMUS', margin, 18);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text('Detection Studio', margin, 25);

  // Report title + scope
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('State Sponsored Attack Report', margin, 38);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(report.filterDescription, margin, 45);

  // Date (top right)
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(`Generated: ${dateLabel}`, pageWidth - margin, 12, { align: 'right' });

  // Risk rating badge (top right area)
  const riskC = RISK_COLORS[report.riskRating] || { bg: COLORS.surfaceDim, text: COLORS.textSecondary };
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(pageWidth - margin - 28, 18, 28, 16, 2, 2, 'F');
  doc.setFontSize(6);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...hexToRgb(COLORS.tertiary));
  doc.text('RISK RATING', pageWidth - margin - 14, 23, { align: 'center' });
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...hexToRgb(riskC.text));
  doc.text(report.riskRating.toUpperCase(), pageWidth - margin - 14, 31, { align: 'center' });

  // Stats line at bottom of header
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(
    `${report.groups.length} Groups  |  ${report.allTechniques.length} Techniques  |  ${report.coveragePercent.toFixed(1)}% Coverage  |  Avg TAW: ${avgTaw}`,
    margin,
    53,
  );

  yPos = headerHeight + 10;

  // ================================================================
  // SECTION 2: Executive Summary (stat boxes via autoTable)
  // ================================================================
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...hexToRgb(COLORS.tertiary));
  doc.text('EXECUTIVE SUMMARY', margin, yPos);
  yPos += 8;

  autoTable(doc, {
    startY: yPos,
    head: [['Threat Groups', 'Unique Techniques', 'Coverage', 'Risk Rating']],
    body: [[
      String(report.groups.length),
      String(report.allTechniques.length),
      `${report.coveragePercent.toFixed(1)}%`,
      report.riskRating,
    ]],
    theme: 'grid',
    styles: { fontSize: 12, cellPadding: 5, halign: 'center', fontStyle: 'bold' },
    headStyles: { fillColor: hexToRgb(COLORS.tertiary), textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 },
    margin: { left: margin, right: margin },
    didParseCell: (data) => {
      if (data.section !== 'body') return;
      if (data.column.index === 2) {
        const c = coverageColors(report.coveragePercent);
        data.cell.styles.fillColor = hexToRgb(c.bg);
        data.cell.styles.textColor = hexToRgb(c.text);
      }
      if (data.column.index === 3) {
        const c = RISK_COLORS[report.riskRating];
        if (c) {
          data.cell.styles.fillColor = hexToRgb(c.bg);
          data.cell.styles.textColor = hexToRgb(c.text);
        }
      }
    },
  });
  yPos = (doc as any).lastAutoTable.finalY + 6;

  // Additional stats row
  autoTable(doc, {
    startY: yPos,
    head: [['Detections', 'Coverage Gaps', 'Software', 'Campaigns']],
    body: [[
      String(report.relatedDetections.length),
      String(report.gaps.length),
      String(report.software.length),
      String(report.campaigns.length),
    ]],
    theme: 'grid',
    styles: { fontSize: 11, cellPadding: 4, halign: 'center', fontStyle: 'bold' },
    headStyles: { fillColor: hexToRgb(COLORS.primaryDark), textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 },
    margin: { left: margin, right: margin },
  });
  yPos = (doc as any).lastAutoTable.finalY + 12;

  // ================================================================
  // SECTION 3: Threat Groups Table
  // ================================================================
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...hexToRgb(COLORS.tertiary));
  doc.text('THREAT GROUPS', margin, yPos);
  yPos += 8;

  const groupRows = report.groups.map((g) => [
    g.name,
    g.aliases.filter(a => a !== g.name).join(', ') || '\u2014',
    g.activityType || '\u2014',
    String(g.techniqueCount),
    `${g.coveragePercent.toFixed(0)}%`,
    String(g.taw),
    g.lastModified ? formatShortDate(g.lastModified) : '\u2014',
  ]);

  autoTable(doc, {
    startY: yPos,
    head: [['Name', 'Aliases', 'Activity', 'Techniques', 'Coverage', 'TAW', 'Modified']],
    body: groupRows,
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 2.5 },
    headStyles: { fillColor: hexToRgb(COLORS.tertiary), textColor: [255, 255, 255], fontStyle: 'bold' },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 30 },
      1: { cellWidth: 35 },
      3: { halign: 'center', cellWidth: 18 },
      4: { halign: 'center', cellWidth: 18 },
      5: { halign: 'center', cellWidth: 14 },
      6: { cellWidth: 22 },
    },
    margin: { left: margin, right: margin },
    didParseCell: (data) => {
      if (data.section !== 'body') return;
      const group = report.groups[data.row.index];
      if (!group) return;

      // Coverage column
      if (data.column.index === 4) {
        const c = coverageColors(group.coveragePercent);
        data.cell.styles.fillColor = hexToRgb(c.bg);
        data.cell.styles.textColor = hexToRgb(c.text);
        data.cell.styles.fontStyle = 'bold';
      }

      // TAW column
      if (data.column.index === 5) {
        const c = tawColors(group.taw);
        data.cell.styles.fillColor = hexToRgb(c.bg);
        data.cell.styles.textColor = hexToRgb(c.text);
        data.cell.styles.fontStyle = 'bold';
      }
    },
  });
  yPos = (doc as any).lastAutoTable.finalY + 12;

  // ================================================================
  // SECTION 4: Detections Table
  // ================================================================
  if (yPos > pageHeight - 60) {
    doc.addPage();
    yPos = margin;
  }

  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...hexToRgb(COLORS.tertiary));
  doc.text('DETECTION COVERAGE ANALYSIS', margin, yPos);
  yPos += 8;

  const detRows = report.relatedDetections.map((d) => [
    d.name,
    d.id,
    d.source,
    d.attribution === 'direct' ? 'Direct' : 'Indirect',
    String(d.relevanceScore),
    d.mitreAttackIds.join(', '),
    d.status,
    d.severity,
    String(d.qualityScore),
  ]);

  autoTable(doc, {
    startY: yPos,
    head: [['Name', 'ID', 'Source', 'Attribution', 'Relevance', 'MITRE', 'Status', 'Severity', 'Quality']],
    body: detRows,
    theme: 'grid',
    styles: { fontSize: 7, cellPadding: 2 },
    headStyles: { fillColor: hexToRgb(COLORS.primaryDark), textColor: [255, 255, 255], fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 30 },
      1: { cellWidth: 22, fontStyle: 'bold' },
      2: { cellWidth: 14, halign: 'center' },
      3: { halign: 'center', cellWidth: 16 },
      4: { halign: 'center', cellWidth: 14 },
      5: { cellWidth: 24 },
      6: { halign: 'center', cellWidth: 16 },
      7: { halign: 'center', cellWidth: 16 },
      8: { halign: 'center', cellWidth: 12 },
    },
    margin: { left: margin, right: margin },
    didParseCell: (data) => {
      if (data.section !== 'body') return;
      const det = report.relatedDetections[data.row.index];
      if (!det) return;

      // Attribution column
      if (data.column.index === 3) {
        if (det.attribution === 'direct') {
          data.cell.styles.fillColor = hexToRgb(COLORS.successLight);
          data.cell.styles.textColor = hexToRgb(COLORS.success);
        } else {
          data.cell.styles.fillColor = hexToRgb(COLORS.warningLight);
          data.cell.styles.textColor = hexToRgb(COLORS.warning);
        }
        data.cell.styles.fontStyle = 'bold';
      }

      // Relevance column
      if (data.column.index === 4) {
        const score = det.relevanceScore;
        if (score >= 70) {
          data.cell.styles.fillColor = hexToRgb(COLORS.successLight);
          data.cell.styles.textColor = hexToRgb(COLORS.success);
        } else if (score >= 40) {
          data.cell.styles.fillColor = hexToRgb(COLORS.infoLight);
          data.cell.styles.textColor = hexToRgb(COLORS.info);
        } else {
          data.cell.styles.fillColor = hexToRgb(COLORS.warningLight);
          data.cell.styles.textColor = hexToRgb(COLORS.warning);
        }
        data.cell.styles.fontStyle = 'bold';
      }

      // Status column
      if (data.column.index === 6) {
        const c = STATUS_COLORS[det.status];
        if (c) {
          data.cell.styles.fillColor = hexToRgb(c.bg);
          data.cell.styles.textColor = hexToRgb(c.text);
          data.cell.styles.fontStyle = 'bold';
        }
      }

      // Severity column
      if (data.column.index === 7) {
        const c = SEVERITY_COLORS[det.severity];
        if (c) {
          data.cell.styles.fillColor = hexToRgb(c.bg);
          data.cell.styles.textColor = hexToRgb(c.text);
          data.cell.styles.fontStyle = 'bold';
        }
      }

      // Quality column
      if (data.column.index === 8) {
        const c = qualityColors(det.qualityScore);
        data.cell.styles.fillColor = hexToRgb(c.bg);
        data.cell.styles.textColor = hexToRgb(c.text);
        data.cell.styles.fontStyle = 'bold';
      }
    },
  });
  yPos = (doc as any).lastAutoTable.finalY + 12;

  // ================================================================
  // SECTION 5: Gap Analysis Table
  // ================================================================
  if (yPos > pageHeight - 60) {
    doc.addPage();
    yPos = margin;
  }

  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...hexToRgb(COLORS.tertiary));
  doc.text('GAP ANALYSIS', margin, yPos);
  yPos += 8;

  const gapRows = report.gaps.map((g) => [
    g.techniqueId,
    g.techniqueName,
    g.tactic,
    String(g.groupCount),
    String(g.tisScore),
    String(g.priority),
  ]);

  autoTable(doc, {
    startY: yPos,
    head: [['Technique ID', 'Name', 'Tactic', 'Groups', 'TIS', 'Priority']],
    body: gapRows,
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 2.5 },
    headStyles: { fillColor: hexToRgb(COLORS.tertiary), textColor: [255, 255, 255], fontStyle: 'bold' },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 20, halign: 'center' },
      1: { cellWidth: 40 },
      2: { cellWidth: 30 },
      3: { halign: 'center', cellWidth: 16 },
      4: { halign: 'center', cellWidth: 16 },
      5: { halign: 'center', cellWidth: 16 },
    },
    margin: { left: margin, right: margin },
    didParseCell: (data) => {
      if (data.section !== 'body') return;
      const gap = report.gaps[data.row.index];
      if (!gap) return;

      // TIS Score column
      if (data.column.index === 4) {
        const c = priorityColors(gap.tisScore);
        data.cell.styles.fillColor = hexToRgb(c.bg);
        data.cell.styles.textColor = hexToRgb(c.text);
        data.cell.styles.fontStyle = 'bold';
      }

      // Priority column
      if (data.column.index === 5) {
        const c = priorityColors(gap.priority);
        data.cell.styles.fillColor = hexToRgb(c.bg);
        data.cell.styles.textColor = hexToRgb(c.text);
        data.cell.styles.fontStyle = 'bold';
      }
    },
  });

  // ================================================================
  // ADD FOOTERS TO ALL PAGES
  // ================================================================
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    addFooter(i, pageCount);
  }

  // ================================================================
  // SAVE
  // ================================================================
  const safeName = report.filterDescription.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase().slice(0, 40);
  const dateStamp = new Date().toISOString().split('T')[0];
  doc.save(`optimus-state-sponsored-${safeName}-${dateStamp}.pdf`);
}
