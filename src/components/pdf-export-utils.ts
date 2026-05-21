import { Detection } from '../types';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { logger } from '../lib/logger';

// ============================================================================
// OPTIMUS LOGO - Using public folder approach
// Place optimus-logo-white.png in /public folder
// ============================================================================
const LOGO_PATH = '/optimus-logo-white.png';

// ============================================================================
// DESIGN TOKENS (Matching your M3 theme)
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
  success: '#1B7D3E',
  successLight: '#E8F5EC',
  warning: '#B65E1A',
  warningLight: '#FFF3E6',
  error: '#B3261E',
  errorLight: '#FDECEA',
  info: '#0066CC',
  infoLight: '#E6F0FA',
  textPrimary: '#1C1B1F',
  textSecondary: '#49454F',
  textMuted: '#79747E',
  border: '#E0E0E0',
  borderDark: '#BDBDBD',
};

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  Production: { bg: COLORS.successLight, text: COLORS.success },
  Testing: { bg: COLORS.infoLight, text: COLORS.info },
  Review: { bg: '#F3E8FF', text: '#7C3AED' },
  Development: { bg: COLORS.warningLight, text: COLORS.warning },
  Draft: { bg: COLORS.surfaceDim, text: COLORS.textSecondary },
  Backlog: { bg: COLORS.surfaceDim, text: COLORS.textMuted },
  Deprecated: { bg: COLORS.errorLight, text: COLORS.error },
  Archived: { bg: COLORS.surfaceDim, text: COLORS.textMuted },
};

const SEVERITY_COLORS: Record<string, { bg: string; text: string }> = {
  Critical: { bg: COLORS.errorLight, text: COLORS.error },
  High: { bg: COLORS.tertiaryLight, text: COLORS.tertiary },
  Medium: { bg: COLORS.warningLight, text: COLORS.warning },
  Low: { bg: COLORS.primaryLight, text: COLORS.primary },
  Informational: { bg: COLORS.surfaceDim, text: COLORS.textMuted },
};

const DETECTION_TYPE_COLORS: Record<string, { bg: string; text: string }> = {
  Analytic: { bg: COLORS.primaryLight, text: COLORS.primary },
  IOC: { bg: COLORS.infoLight, text: COLORS.info },
  Hunt: { bg: COLORS.tertiaryLight, text: COLORS.tertiary },
  Heuristic: { bg: COLORS.warningLight, text: COLORS.warning },
};

// ============================================================================
// PDF EXPORT SECTIONS CONFIGURATION
// ============================================================================

export interface PDFExportSection {
  key: string;
  label: string;
  description: string;
  icon: string;
}

export const PDF_EXPORT_SECTIONS: PDFExportSection[] = [
  { key: 'header', label: 'Header & Summary', description: 'Detection name, ID, status badges, quality score', icon: 'file-text' },
  { key: 'description', label: 'Description', description: 'Full detection description text', icon: 'align-left' },
  { key: 'classification', label: 'Classification', description: 'Status, severity, detection type', icon: 'tag' },
  { key: 'datasources', label: 'Data Sources', description: 'Log sources, platforms, technologies', icon: 'database' },
  { key: 'mitre', label: 'MITRE ATT&CK', description: 'Tactics, techniques, and sub-techniques mapping', icon: 'shield' },
  { key: 'threat_intel', label: 'Threat Intelligence', description: 'Linked groups, software, campaigns', icon: 'users' },
  { key: 'detection_logic', label: 'Detection Logic', description: 'Query language and detection query code', icon: 'code' },
  { key: 'investigation', label: 'Investigation', description: 'Investigation steps and response actions', icon: 'search' },
  { key: 'tuning', label: 'Tuning & Context', description: 'False positive guidance, caveats, fine-tuning notes', icon: 'sliders' },
  { key: 'validation', label: 'Validation', description: 'Test status, validation date, test cases', icon: 'check-circle' },
  { key: 'metadata', label: 'Metadata', description: 'Tags, references, CVEs', icon: 'info' },
  { key: 'audit', label: 'History & Audit', description: 'Created/updated dates, version, change history', icon: 'clock' },
];

export const DEFAULT_PDF_SECTIONS = [
  'header', 'description', 'classification', 'datasources', 'mitre',
  'threat_intel', 'detection_logic', 'investigation', 'tuning', 'validation', 'metadata',
];

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function hexToRgb(hex: string): [number, number, number] {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)] : [0, 0, 0];
}

function formatDate(dateStr: string | undefined): string {
  if (!dateStr) return 'N/A';
  try {
    return new Date(dateStr).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return dateStr; }
}

/**
 * Load image and convert to data URL for jsPDF
 * Returns null if loading fails
 */
async function loadImageAsDataUrl(src: string): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0);
          resolve(canvas.toDataURL('image/png'));
        } else {
          resolve(null);
        }
      } catch (err) {
        logger.warn('Failed to load image as data URL:', err);
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/**
 * Wrap code text for monospace fonts - handles long strings without spaces
 * by forcing breaks at maxChars
 */
function wrapCodeText(text: string, maxCharsPerLine: number): string[] {
  const lines: string[] = [];
  const inputLines = text.split('\n');
  
  for (const inputLine of inputLines) {
    if (inputLine.length <= maxCharsPerLine) {
      lines.push(inputLine);
    } else {
      // Force wrap long lines
      let remaining = inputLine;
      while (remaining.length > 0) {
        // Try to break at a space if possible
        let breakPoint = maxCharsPerLine;
        if (remaining.length > maxCharsPerLine) {
          const lastSpace = remaining.lastIndexOf(' ', maxCharsPerLine);
          const lastPipe = remaining.lastIndexOf('|', maxCharsPerLine);
          const lastComma = remaining.lastIndexOf(',', maxCharsPerLine);
          const lastParen = remaining.lastIndexOf(')', maxCharsPerLine);
          const bestBreak = Math.max(lastSpace, lastPipe, lastComma, lastParen);
          if (bestBreak > maxCharsPerLine * 0.4) {
            breakPoint = bestBreak + 1;
          }
        }
        lines.push(remaining.substring(0, breakPoint));
        remaining = remaining.substring(breakPoint);
      }
    }
  }
  
  return lines;
}

function drawPill(doc: jsPDF, x: number, y: number, text: string, bgColor: string, textColor: string, minWidth: number = 20): number {
  doc.setFontSize(7);
  const textWidth = doc.getTextWidth(text.toUpperCase());
  const pillWidth = Math.max(minWidth, textWidth + 6);
  doc.setFillColor(...hexToRgb(bgColor));
  doc.roundedRect(x, y - 4, pillWidth, 6, 1.5, 1.5, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...hexToRgb(textColor));
  doc.text(text.toUpperCase(), x + pillWidth / 2, y, { align: 'center' });
  return pillWidth;
}

function drawQualityScore(doc: jsPDF, x: number, y: number, score: number): number {
  const scoreColor = score >= 80 ? COLORS.success : score >= 60 ? COLORS.warning : COLORS.error;
  doc.setFillColor(...hexToRgb(COLORS.surfaceDim));
  doc.roundedRect(x, y - 4, 22, 6, 1.5, 1.5, 'F');
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...hexToRgb(scoreColor));
  doc.text(`${score}%`, x + 11, y, { align: 'center' });
  return 22;
}

// ============================================================================
// MAIN PDF GENERATION FUNCTION
// ============================================================================

export async function generateDetectionPDF(
  detection: Detection,
  selectedSections: string[] = DEFAULT_PDF_SECTIONS,
  filename?: string
): Promise<void> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;
  const contentWidth = pageWidth - margin * 2;
  let yPos = margin;
  let currentPage = 1;

  // Load logo as data URL for jsPDF compatibility
  let logoDataUrl: string | null = null;
  try {
    logoDataUrl = await loadImageAsDataUrl(LOGO_PATH);
  } catch (err) {
    logger.warn('Failed to load PDF logo:', err);
    logoDataUrl = null;
  }

  const checkNewPage = (requiredHeight: number) => {
    if (yPos + requiredHeight > pageHeight - 25) {
      doc.addPage();
      currentPage++;
      yPos = margin;
      if (currentPage > 1) {
        doc.setFontSize(8);
        doc.setTextColor(...hexToRgb(COLORS.textMuted));
        doc.text(`${detection.name} (continued)`, margin, 9);
        doc.setDrawColor(...hexToRgb(COLORS.tertiary));
        doc.setLineWidth(0.5);
        doc.line(margin, 12, pageWidth - margin, 12);
        yPos = 18;
      }
    }
  };

  const addFooter = (pageNum: number) => {
    doc.setFontSize(8);
    doc.setTextColor(...hexToRgb(COLORS.textMuted));
    doc.text(`Page ${pageNum} | Generated by Optimus Detection Studio | ${new Date().toLocaleDateString()}`, pageWidth / 2, pageHeight - 8, { align: 'center' });
  };

  // HEADER SECTION - Doubled height with detection name and ID
  if (selectedSections.includes('header')) {
    const headerHeight = 58;
    
    // Main header background
    doc.setFillColor(...hexToRgb(COLORS.tertiary));
    doc.rect(0, 0, pageWidth, headerHeight, 'F');
    
    // Bottom accent stripe
    doc.setFillColor(...hexToRgb(COLORS.tertiaryDark));
    doc.rect(0, headerHeight - 4, pageWidth, 4, 'F');
    
    // Add logo using data URL (if available)
    if (logoDataUrl) {
      try {
        doc.addImage(logoDataUrl, 'PNG', margin, 8, 18, 18);
      } catch (e) {
        console.warn('Failed to add logo to PDF:', e);
      }
    }
    
    // Title and branding (top left) - adjusted for no logo case
    const titleX = logoDataUrl ? margin + 24 : margin;
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.text('Detection Report', titleX, 16);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text('Optimus Detection Studio', titleX, 23);
    
    // Generated date (top right)
    doc.setFontSize(8);
    doc.text(`Generated: ${new Date().toLocaleDateString()}`, pageWidth - margin, 10, { align: 'right' });
    
    // Quality score badge in header (top right area)
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(pageWidth - margin - 24, 14, 24, 14, 2, 2, 'F');
    doc.setFontSize(6);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...hexToRgb(COLORS.tertiary));
    doc.text('QUALITY', pageWidth - margin - 12, 19, { align: 'center' });
    const scoreColor = detection.qualityScore >= 80 ? COLORS.success : detection.qualityScore >= 60 ? COLORS.warning : COLORS.error;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...hexToRgb(scoreColor));
    doc.text(`${detection.qualityScore}%`, pageWidth - margin - 12, 26, { align: 'center' });
    
    // Detection name in header (main focus)
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(255, 255, 255);
    const headerNameLines = doc.splitTextToSize(detection.name, contentWidth + 20);
    let nameY = 34;
    headerNameLines.slice(0, 2).forEach((line: string) => {
      doc.text(line, margin, nameY);
      nameY += 5;
    });
    
    // Detection ID in header
    doc.setFont('courier', 'normal');
    doc.setFontSize(7);
    doc.text(`ID: ${detection.id}`, margin, nameY + 3);
    
    yPos = headerHeight + 8;
    
    // Status badges row below header
    let badgeX = margin;
    const statusColors = STATUS_COLORS[detection.status] ?? { bg: COLORS.surfaceDim, text: COLORS.textSecondary };
    badgeX += drawPill(doc, badgeX, yPos, detection.status, statusColors.bg, statusColors.text, 26) + 4;
    const severityColors = SEVERITY_COLORS[detection.severity] ?? { bg: COLORS.surfaceDim, text: COLORS.textSecondary };
    badgeX += drawPill(doc, badgeX, yPos, detection.severity, severityColors.bg, severityColors.text, 22) + 4;
    const typeColors = DETECTION_TYPE_COLORS[detection.detectionType] ?? { bg: COLORS.infoLight, text: COLORS.info };
    drawPill(doc, badgeX, yPos, detection.detectionType, typeColors.bg, typeColors.text, 26);

    yPos += 12;
    doc.setDrawColor(...hexToRgb(COLORS.border));
    doc.setLineWidth(0.3);
    doc.line(margin, yPos, pageWidth - margin, yPos);
    yPos += 8;
  }

  // DESCRIPTION SECTION
  if (selectedSections.includes('description') && detection.description) {
    checkNewPage(30);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...hexToRgb(COLORS.tertiary));
    doc.text('DESCRIPTION', margin, yPos);
    yPos += 6;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...hexToRgb(COLORS.textPrimary));
    const descLines = doc.splitTextToSize(detection.description, contentWidth);
    descLines.forEach((line: string) => { checkNewPage(5); doc.text(line, margin, yPos); yPos += 5; });
    yPos += 6;
  }

  // CLASSIFICATION SECTION
  if (selectedSections.includes('classification')) {
    checkNewPage(50);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...hexToRgb(COLORS.tertiary));
    doc.text('CLASSIFICATION', margin, yPos);
    yPos += 8;
    const classificationRows = [
      ['Status', detection.status, 'status'],
      ['Severity', detection.severity, 'severity'],
      ['Detection Type', detection.detectionType, 'type'],
      ['Author', detection.author || 'N/A', 'text'],
    ];
    
    autoTable(doc, {
      startY: yPos,
      head: [['Field', 'Value']],
      body: classificationRows.map(row => [row[0], row[1]]),
      theme: 'grid',
      styles: { fontSize: 9, cellPadding: 3 },
      headStyles: { fillColor: hexToRgb(COLORS.tertiary), textColor: [255, 255, 255], fontStyle: 'bold' },
      columnStyles: { 0: { cellWidth: 35, fontStyle: 'bold', textColor: hexToRgb(COLORS.textSecondary) }, 1: { cellWidth: contentWidth - 35 } },
      margin: { left: margin, right: margin },
      didParseCell: (data) => {
        if (data.section !== 'body' || data.column.index !== 1) return;
        const rowType = classificationRows[data.row.index]?.[2];
        const value = classificationRows[data.row.index]?.[1] as string;
        let colors: { bg: string; text: string } | undefined;
        if (rowType === 'status') colors = STATUS_COLORS[value];
        else if (rowType === 'severity') colors = SEVERITY_COLORS[value];
        else if (rowType === 'type') colors = DETECTION_TYPE_COLORS[value];
        if (colors) { data.cell.styles.fillColor = hexToRgb(colors.bg); data.cell.styles.textColor = hexToRgb(colors.text); data.cell.styles.fontStyle = 'bold'; }
      },
    });
    yPos = (doc as any).lastAutoTable.finalY + 8;
  }

  // DATA SOURCES SECTION
  if (selectedSections.includes('datasources')) {
    checkNewPage(50);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...hexToRgb(COLORS.tertiary));
    doc.text('DATA SOURCES', margin, yPos);
    yPos += 8;
    const datasourceRows = [
      ['Technology', detection.technology || 'N/A'],
      ['Log Source', detection.logSource || 'N/A'],
      ['Log Sources', (detection.logSources || []).join(', ') || 'N/A'],
      ['Data Sources', (detection.dataSources || []).join(', ') || 'N/A'],
      ['Data Components', (detection.dataComponents || []).join(', ') || 'N/A'],
      ['Platforms', (detection.platforms || []).join(', ') || 'N/A'],
    ];
    
    autoTable(doc, {
      startY: yPos,
      head: [['Field', 'Details']],
      body: datasourceRows,
      theme: 'grid',
      styles: { fontSize: 9, cellPadding: 3 },
      headStyles: { fillColor: hexToRgb(COLORS.primaryDark), textColor: [255, 255, 255], fontStyle: 'bold' },
      columnStyles: { 0: { cellWidth: 35, fontStyle: 'bold', textColor: hexToRgb(COLORS.textSecondary) }, 1: { cellWidth: contentWidth - 35, textColor: hexToRgb(COLORS.textPrimary) } },
      margin: { left: margin, right: margin },
      didParseCell: (data) => {
        if (data.section !== 'body') return;
        const label = data.row.raw?.[0] as string;
        if (['Technology', 'Log Source', 'Platforms'].includes(label) && data.column.index === 1) {
          data.cell.styles.fillColor = hexToRgb(COLORS.primaryLight);
          data.cell.styles.fontStyle = 'bold';
        }
      },
    });
    yPos = (doc as any).lastAutoTable.finalY + 8;
  }

  // MITRE ATT&CK SECTION - With pills and boxes
  if (selectedSections.includes('mitre') && detection.mitreAttackIds?.length) {
    checkNewPage(50);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...hexToRgb(COLORS.tertiary));
    doc.text('MITRE ATT&CK MAPPING', margin, yPos);
    yPos += 10;
    
    // Tactics as pills in a box
    if (detection.mitreTactics?.length) {
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...hexToRgb(COLORS.textSecondary));
      doc.text('Tactics', margin, yPos);
      yPos += 5;
      
      let tacticX = margin;
      detection.mitreTactics.forEach((tactic) => {
        const tacticWidth = Math.max(doc.getTextWidth(tactic) + 8, 25);
        if (tacticX + tacticWidth > margin + contentWidth) {
          tacticX = margin;
          yPos += 8;
          checkNewPage(10);
        }
        // Draw tactic pill with primary color
        doc.setFillColor(...hexToRgb(COLORS.primaryLight));
        doc.roundedRect(tacticX, yPos - 4, tacticWidth, 7, 1.5, 1.5, 'F');
        doc.setDrawColor(...hexToRgb(COLORS.primary));
        doc.setLineWidth(0.3);
        doc.roundedRect(tacticX, yPos - 4, tacticWidth, 7, 1.5, 1.5, 'S');
        doc.setFontSize(7);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...hexToRgb(COLORS.primary));
        doc.text(tactic, tacticX + tacticWidth / 2, yPos, { align: 'center' });
        tacticX += tacticWidth + 3;
      });
      yPos += 12;
    }
    
    // Technique IDs as pills
    if (detection.mitreAttackIds?.length) {
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...hexToRgb(COLORS.textSecondary));
      doc.text('Techniques', margin, yPos);
      yPos += 5;
      
      let techX = margin;
      detection.mitreAttackIds.forEach((techId) => {
        const techWidth = Math.max(doc.getTextWidth(techId) + 8, 20);
        if (techX + techWidth > margin + contentWidth) {
          techX = margin;
          yPos += 8;
          checkNewPage(10);
        }
        // Draw technique pill with info color
        doc.setFillColor(...hexToRgb(COLORS.infoLight));
        doc.roundedRect(techX, yPos - 4, techWidth, 7, 1.5, 1.5, 'F');
        doc.setFontSize(7);
        doc.setFont('courier', 'bold');
        doc.setTextColor(...hexToRgb(COLORS.info));
        doc.text(techId, techX + techWidth / 2, yPos, { align: 'center' });
        techX += techWidth + 3;
      });
      yPos += 12;
    }
    
    // Technique names in a subtle box (if different from IDs)
    if (detection.mitreTechniques?.length) {
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...hexToRgb(COLORS.textSecondary));
      doc.text('Technique Names', margin, yPos);
      yPos += 5;
      
      // Draw containing box
      const techNamesText = detection.mitreTechniques.join(' • ');
      const techNamesLines = doc.splitTextToSize(techNamesText, contentWidth - 8);
      const boxHeight = techNamesLines.length * 4 + 6;
      
      checkNewPage(boxHeight + 5);
      doc.setFillColor(...hexToRgb(COLORS.surfaceDim));
      doc.roundedRect(margin, yPos, contentWidth, boxHeight, 2, 2, 'F');
      
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...hexToRgb(COLORS.textPrimary));
      let techNameY = yPos + 4;
      techNamesLines.forEach((line: string) => {
        doc.text(line, margin + 4, techNameY);
        techNameY += 4;
      });
      yPos += boxHeight + 6;
    }
    
    yPos += 4;
  }

  // THREAT INTELLIGENCE SECTION - With pills and boxes
  if (selectedSections.includes('threat_intel')) {
    const hasLinkedEntities = (detection.linkedGroups?.length || 0) > 0 || (detection.linkedSoftware?.length || 0) > 0 || (detection.linkedCampaigns?.length || 0) > 0;
    if (hasLinkedEntities) {
      checkNewPage(50);
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...hexToRgb(COLORS.tertiary));
      doc.text('THREAT INTELLIGENCE', margin, yPos);
      yPos += 10;
      
      // Threat Groups as pills
      if (detection.linkedGroups?.length) {
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...hexToRgb(COLORS.textSecondary));
        doc.text('Threat Groups', margin, yPos);
        yPos += 5;
        
        let groupX = margin;
        detection.linkedGroups.forEach((group) => {
          const label = `${group.name} (${group.mitre_id})`;
          const groupWidth = Math.max(doc.getTextWidth(label) * 0.85 + 10, 30);
          if (groupX + groupWidth > margin + contentWidth) {
            groupX = margin;
            yPos += 9;
            checkNewPage(12);
          }
          // Draw group pill with error/red color (threat indicator)
          doc.setFillColor(...hexToRgb(COLORS.errorLight));
          doc.roundedRect(groupX, yPos - 4, groupWidth, 8, 2, 2, 'F');
          doc.setDrawColor(...hexToRgb(COLORS.error));
          doc.setLineWidth(0.3);
          doc.roundedRect(groupX, yPos - 4, groupWidth, 8, 2, 2, 'S');
          doc.setFontSize(7);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(...hexToRgb(COLORS.error));
          doc.text(label, groupX + groupWidth / 2, yPos + 0.5, { align: 'center' });
          groupX += groupWidth + 4;
        });
        yPos += 14;
      }
      
      // Software/Tools as pills
      if (detection.linkedSoftware?.length) {
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...hexToRgb(COLORS.textSecondary));
        doc.text('Software / Tools', margin, yPos);
        yPos += 5;
        
        let softwareX = margin;
        detection.linkedSoftware.forEach((sw) => {
          const label = `${sw.name} (${sw.mitre_id})`;
          const swWidth = Math.max(doc.getTextWidth(label) * 0.85 + 10, 30);
          if (softwareX + swWidth > margin + contentWidth) {
            softwareX = margin;
            yPos += 9;
            checkNewPage(12);
          }
          // Draw software pill with warning/orange color
          doc.setFillColor(...hexToRgb(COLORS.warningLight));
          doc.roundedRect(softwareX, yPos - 4, swWidth, 8, 2, 2, 'F');
          doc.setDrawColor(...hexToRgb(COLORS.warning));
          doc.setLineWidth(0.3);
          doc.roundedRect(softwareX, yPos - 4, swWidth, 8, 2, 2, 'S');
          doc.setFontSize(7);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(...hexToRgb(COLORS.warning));
          doc.text(label, softwareX + swWidth / 2, yPos + 0.5, { align: 'center' });
          softwareX += swWidth + 4;
        });
        yPos += 14;
      }
      
      // Campaigns as pills
      if (detection.linkedCampaigns?.length) {
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...hexToRgb(COLORS.textSecondary));
        doc.text('Campaigns', margin, yPos);
        yPos += 5;
        
        let campX = margin;
        detection.linkedCampaigns.forEach((camp) => {
          const label = `${camp.name} (${camp.mitre_id})`;
          const campWidth = Math.max(doc.getTextWidth(label) * 0.85 + 10, 30);
          if (campX + campWidth > margin + contentWidth) {
            campX = margin;
            yPos += 9;
            checkNewPage(12);
          }
          // Draw campaign pill with tertiary/purple color
          doc.setFillColor(...hexToRgb(COLORS.tertiaryLight));
          doc.roundedRect(campX, yPos - 4, campWidth, 8, 2, 2, 'F');
          doc.setDrawColor(...hexToRgb(COLORS.tertiary));
          doc.setLineWidth(0.3);
          doc.roundedRect(campX, yPos - 4, campWidth, 8, 2, 2, 'S');
          doc.setFontSize(7);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(...hexToRgb(COLORS.tertiary));
          doc.text(label, campX + campWidth / 2, yPos + 0.5, { align: 'center' });
          campX += campWidth + 4;
        });
        yPos += 12;
      }
      
      yPos += 4;
    }
  }

  // DETECTION LOGIC SECTION - Full query with pagination support
  if (selectedSections.includes('detection_logic') && detection.detectionQuery) {
    checkNewPage(30);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...hexToRgb(COLORS.tertiary));
    doc.text('DETECTION LOGIC', margin, yPos);
    yPos += 6;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...hexToRgb(COLORS.textSecondary));
    doc.text('Language: ', margin, yPos);
    const langText = detection.queryLanguage || 'N/A';
    drawPill(doc, margin + doc.getTextWidth('Language: '), yPos, langText, COLORS.primaryLight, COLORS.primary, 25);
    yPos += 10;

    // Calculate max characters per line for monospace font at 7pt
    const codeBlockPadding = 4;
    const usableWidth = contentWidth - (codeBlockPadding * 2);
    const charWidthMm = 1.7; // Approximate width of courier character at 7pt in mm
    const maxCharsPerLine = Math.floor(usableWidth / charWidthMm);
    
    // Wrap the query text properly - NO LINE LIMIT
    const queryLines = wrapCodeText(detection.detectionQuery, maxCharsPerLine);
    const lineHeight = 3.5;
    const codeFontSize = 7;
    
    // Calculate available space on current page for code block
    const footerSpace = 25;
    const minCodeBlockHeight = 20; // Minimum height before starting new page
    
    let lineIndex = 0;
    let isFirstCodeBlock = true;
    
    // Render all lines with pagination
    while (lineIndex < queryLines.length) {
      // Calculate how many lines fit on current page
      const availableHeight = pageHeight - yPos - footerSpace - 10;
      const linesPerPage = Math.floor(availableHeight / lineHeight);
      
      // If not enough space for meaningful content, start new page
      if (linesPerPage < 5 && !isFirstCodeBlock) {
        doc.addPage();
        currentPage++;
        yPos = margin;
        // Add continuation header
        doc.setFontSize(8);
        doc.setTextColor(...hexToRgb(COLORS.textMuted));
        doc.text(`${detection.name} - Detection Query (continued)`, margin, 9);
        doc.setDrawColor(...hexToRgb(COLORS.tertiary));
        doc.setLineWidth(0.5);
        doc.line(margin, 12, pageWidth - margin, 12);
        yPos = 18;
      }
      
      // Recalculate available space after potential page break
      const currentAvailableHeight = pageHeight - yPos - footerSpace - 6;
      const currentLinesPerPage = Math.max(5, Math.floor(currentAvailableHeight / lineHeight));
      const linesToRender = Math.min(currentLinesPerPage, queryLines.length - lineIndex);
      const blockHeight = linesToRender * lineHeight + 8;
      
      // Draw code block background for this chunk
      doc.setFillColor(...hexToRgb(COLORS.surfaceDim));
      doc.roundedRect(margin, yPos, contentWidth, blockHeight, 2, 2, 'F');
      doc.setDrawColor(...hexToRgb(COLORS.border));
      doc.setLineWidth(0.2);
      doc.roundedRect(margin, yPos, contentWidth, blockHeight, 2, 2, 'S');
      
      // Add line numbers indicator on first block
      if (isFirstCodeBlock) {
        doc.setFontSize(6);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...hexToRgb(COLORS.textMuted));
        doc.text(`${queryLines.length} lines`, margin + contentWidth - 2, yPos + 4, { align: 'right' });
      }
      
      // Render code lines
      doc.setFontSize(codeFontSize);
      doc.setFont('courier', 'normal');
      doc.setTextColor(...hexToRgb(COLORS.textPrimary));
      
      let codeY = yPos + 5;
      for (let i = 0; i < linesToRender; i++) {
        const line = queryLines[lineIndex + i];
        doc.text(line, margin + codeBlockPadding, codeY);
        codeY += lineHeight;
      }
      
      lineIndex += linesToRender;
      yPos += blockHeight + 4;
      isFirstCodeBlock = false;
      
      // If more lines remain, add page break
      if (lineIndex < queryLines.length) {
        doc.addPage();
        currentPage++;
        yPos = margin;
        // Add continuation header
        doc.setFontSize(8);
        doc.setTextColor(...hexToRgb(COLORS.textMuted));
        doc.text(`${detection.name} - Detection Query (continued)`, margin, 9);
        doc.setDrawColor(...hexToRgb(COLORS.tertiary));
        doc.setLineWidth(0.5);
        doc.line(margin, 12, pageWidth - margin, 12);
        yPos = 18;
      }
    }
    
    yPos += 4;
    
    // Query explanation - simple text style
    if (detection.queryExplanation) {
      checkNewPage(20);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...hexToRgb(COLORS.textSecondary));
      doc.text('Explanation:', margin, yPos);
      yPos += 5;
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...hexToRgb(COLORS.textPrimary));
      const explLines = doc.splitTextToSize(detection.queryExplanation, contentWidth);
      explLines.forEach((line: string) => { 
        checkNewPage(5); 
        doc.text(line, margin, yPos); 
        yPos += 4; 
      });
      yPos += 4;
    }
    yPos += 4;
  }

  // INVESTIGATION & RESPONSE SECTION - Simple style with pagination
  if (selectedSections.includes('investigation')) {
    const hasInvestigation = (detection.investigationSteps?.length || 0) > 0 || (detection.responseActions?.length || 0) > 0;
    if (hasInvestigation) {
      checkNewPage(25);
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...hexToRgb(COLORS.tertiary));
      doc.text('INVESTIGATION & RESPONSE', margin, yPos);
      yPos += 8;
      
      // Investigation Steps - simple list with pagination
      if (detection.investigationSteps?.length) {
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...hexToRgb(COLORS.textSecondary));
        doc.text('Investigation Steps:', margin, yPos);
        yPos += 6;
        
        detection.investigationSteps.forEach((step, index) => {
          // Check if we need a new page for this step
          const descLines = step.description ? doc.splitTextToSize(step.description, contentWidth - 12) : [];
          const stepHeight = 6 + (descLines.length * 4) + 4;
          checkNewPage(stepHeight);
          
          // Step number circle
          doc.setFillColor(...hexToRgb(COLORS.tertiary));
          doc.circle(margin + 3, yPos - 1, 3, 'F');
          doc.setFontSize(8);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(255, 255, 255);
          doc.text(`${index + 1}`, margin + 3, yPos + 0.5, { align: 'center' });
          
          // Step title
          doc.setFontSize(9);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(...hexToRgb(COLORS.textPrimary));
          doc.text(step.title, margin + 10, yPos);
          yPos += 5;
          
          // Step description with wrapping
          if (step.description) {
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(8);
            doc.setTextColor(...hexToRgb(COLORS.textSecondary));
            descLines.forEach((line: string) => {
              checkNewPage(5);
              doc.text(line, margin + 10, yPos);
              yPos += 4;
            });
          }
          yPos += 3;
        });
        yPos += 4;
      }
      
      // Response Actions - simple list with pagination
      if (detection.responseActions?.length) {
        checkNewPage(15);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...hexToRgb(COLORS.textSecondary));
        doc.text('Response Actions:', margin, yPos);
        yPos += 6;
        
        detection.responseActions.forEach((action) => {
          const actionLines = doc.splitTextToSize(action, contentWidth - 8);
          const actionHeight = actionLines.length * 4 + 2;
          checkNewPage(actionHeight);
          
          // Bullet point
          doc.setFillColor(...hexToRgb(COLORS.tertiary));
          doc.circle(margin + 2, yPos - 1, 1.5, 'F');
          doc.setFontSize(8);
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(...hexToRgb(COLORS.textPrimary));
          actionLines.forEach((line: string, lineIdx: number) => {
            doc.text(line, margin + 6, yPos);
            yPos += 4;
          });
          yPos += 2;
        });
        yPos += 4;
      }
    }
  }

  // TUNING & CONTEXT SECTION - Simple text style with proper wrapping
  if (selectedSections.includes('tuning')) {
    const hasTuning = detection.falsePositiveGuidance || detection.caveats || detection.fineTuning;
    if (hasTuning) {
      checkNewPage(20);
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...hexToRgb(COLORS.tertiary));
      doc.text('TUNING & CONTEXT', margin, yPos);
      yPos += 8;
      
      // False Positive Guidance - simple text
      if (detection.falsePositiveGuidance) {
        checkNewPage(15);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...hexToRgb(COLORS.textSecondary));
        doc.text('False Positive Guidance:', margin, yPos);
        yPos += 5;
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...hexToRgb(COLORS.textPrimary));
        const fpLines = doc.splitTextToSize(detection.falsePositiveGuidance, contentWidth);
        fpLines.forEach((line: string) => { 
          checkNewPage(5); 
          doc.text(line, margin, yPos); 
          yPos += 4; 
        });
        yPos += 6;
      }
      
      // Caveats - simple text
      if (detection.caveats) {
        checkNewPage(15);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...hexToRgb(COLORS.textSecondary));
        doc.text('Caveats:', margin, yPos);
        yPos += 5;
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...hexToRgb(COLORS.textPrimary));
        const caveatLines = doc.splitTextToSize(detection.caveats, contentWidth);
        caveatLines.forEach((line: string) => { 
          checkNewPage(5); 
          doc.text(line, margin, yPos); 
          yPos += 4; 
        });
        yPos += 6;
      }
      
      // Fine Tuning - simple text
      if (detection.fineTuning) {
        checkNewPage(15);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...hexToRgb(COLORS.textSecondary));
        doc.text('Fine Tuning:', margin, yPos);
        yPos += 5;
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...hexToRgb(COLORS.textPrimary));
        const tuneLines = doc.splitTextToSize(detection.fineTuning, contentWidth);
        tuneLines.forEach((line: string) => { 
          checkNewPage(5); 
          doc.text(line, margin, yPos); 
          yPos += 4; 
        });
        yPos += 6;
      }
    }
  }

  // VALIDATION SECTION
  if (selectedSections.includes('validation')) {
    checkNewPage(30);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...hexToRgb(COLORS.tertiary));
    doc.text('VALIDATION', margin, yPos);
    yPos += 8;
    const isValidated = detection.testedAndValidated;
    const validationBg = isValidated ? COLORS.successLight : COLORS.surfaceDim;
    const validationText = isValidated ? COLORS.success : COLORS.textMuted;
    const validationLabel = isValidated ? 'Tested & Validated' : 'Not Yet Validated';
    doc.setFillColor(...hexToRgb(validationBg));
    doc.roundedRect(margin, yPos, 50, 8, 2, 2, 'F');
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...hexToRgb(validationText));
    doc.text(validationLabel, margin + 25, yPos + 5.5, { align: 'center' });
    yPos += 14;
    
    const validationData = [['Validation Date', detection.validationDate || 'N/A'], ['Environment', detection.validationEnvironment || 'N/A']];
    
    autoTable(doc, {
      startY: yPos, head: [], body: validationData, theme: 'plain', styles: { fontSize: 9, cellPadding: 2 },
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 35, textColor: hexToRgb(COLORS.textSecondary) }, 1: { cellWidth: contentWidth - 35, textColor: hexToRgb(COLORS.textPrimary) } },
      margin: { left: margin, right: margin },
    });
    yPos = (doc as any).lastAutoTable.finalY + 4;
    if (detection.testCases?.length) {
      checkNewPage(15);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...hexToRgb(COLORS.textSecondary));
      doc.text('Test Cases:', margin, yPos);
      yPos += 5;
      detection.testCases.forEach((tc) => {
        checkNewPage(5);
        doc.setFillColor(...hexToRgb(COLORS.tertiary));
        doc.circle(margin + 2, yPos - 1, 1.5, 'F');
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...hexToRgb(COLORS.textPrimary));
        doc.text(tc, margin + 6, yPos);
        yPos += 5;
      });
      yPos += 4;
    }
  }

  // METADATA SECTION
  if (selectedSections.includes('metadata')) {
    const hasMetadata = (detection.tags?.length || 0) > 0 || (detection.references?.length || 0) > 0 || (detection.associatedCVEs?.length || 0) > 0;
    if (hasMetadata) {
      checkNewPage(30);
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...hexToRgb(COLORS.tertiary));
      doc.text('METADATA', margin, yPos);
      yPos += 8;
      if (detection.tags?.length) {
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...hexToRgb(COLORS.textSecondary));
        doc.text('Tags:', margin, yPos);
        yPos += 6;
        let tagX = margin;
        detection.tags.forEach((tag) => {
          const tagWidth = Math.max(doc.getTextWidth(tag) + 6, 15);
          if (tagX + tagWidth > margin + contentWidth) { tagX = margin; yPos += 7; checkNewPage(7); }
          drawPill(doc, tagX, yPos, tag, COLORS.surfaceDim, COLORS.textSecondary, 15);
          tagX += tagWidth + 3;
        });
        yPos += 10;
      }
      if (detection.associatedCVEs?.length) {
        checkNewPage(15);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...hexToRgb(COLORS.textSecondary));
        doc.text('Associated CVEs:', margin, yPos);
        yPos += 6;
        let cveX = margin;
        detection.associatedCVEs.forEach((cve) => {
          const cveWidth = Math.max(doc.getTextWidth(cve) + 6, 25);
          if (cveX + cveWidth > margin + contentWidth) { cveX = margin; yPos += 7; checkNewPage(7); }
          drawPill(doc, cveX, yPos, cve, COLORS.errorLight, COLORS.error, 25);
          cveX += cveWidth + 3;
        });
        yPos += 10;
      }
      if (detection.references?.length) {
        checkNewPage(15);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...hexToRgb(COLORS.textSecondary));
        doc.text('References:', margin, yPos);
        yPos += 5;
        detection.references.forEach((ref) => {
          checkNewPage(5);
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(...hexToRgb(COLORS.info));
          const refLines = doc.splitTextToSize(ref, contentWidth - 4);
          doc.text(`-> ${refLines[0]}`, margin + 2, yPos);
          yPos += 4;
        });
        yPos += 4;
      }
    }
  }

  // AUDIT SECTION
  if (selectedSections.includes('audit')) {
    checkNewPage(30);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...hexToRgb(COLORS.tertiary));
    doc.text('HISTORY & AUDIT', margin, yPos);
    yPos += 8;
    
    // Version badge
    doc.setFillColor(...hexToRgb(COLORS.primaryLight));
    doc.roundedRect(margin, yPos, 20, 7, 2, 2, 'F');
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...hexToRgb(COLORS.primary));
    doc.text(`v${detection.version}`, margin + 10, yPos + 5, { align: 'center' });
    yPos += 12;
    
    const auditData = [['Created', formatDate(detection.createdDate)], ['Last Updated', formatDate(detection.updatedDate)], ['Created By', detection.created_by || 'N/A'], ['Updated By', detection.updated_by || 'N/A']];
    
    autoTable(doc, {
      startY: yPos, head: [], body: auditData, theme: 'plain', styles: { fontSize: 9, cellPadding: 2 },
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 35, textColor: hexToRgb(COLORS.textSecondary) }, 1: { cellWidth: contentWidth - 35, textColor: hexToRgb(COLORS.textPrimary) } },
      margin: { left: margin, right: margin },
    });
    yPos = (doc as any).lastAutoTable.finalY + 8;
  }

  // ADD FOOTERS
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) { doc.setPage(i); addFooter(i); }

  // SAVE
  const safeName = detection.name.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 50);
  const finalFilename = filename || `detection_${safeName}_${new Date().toISOString().split('T')[0]}.pdf`;
  doc.save(finalFilename);
}