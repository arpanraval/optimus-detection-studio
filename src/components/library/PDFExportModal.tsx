import React, { useState } from 'react';
import { Detection } from '../../types';
import { Icon } from '../Icon';
import { logAuditEvent } from '../../lib/audit';
import { 
  PDF_EXPORT_SECTIONS, 
  DEFAULT_PDF_SECTIONS,
  generateDetectionPDF,
  PDFExportSection
} from '../pdf-export-utils';

interface PDFExportModalProps {
  detection: Detection;
  isOpen: boolean;
  onClose: () => void;
  onExportStart?: () => void;
  onExportComplete?: () => void;
  onExportError?: (error: string) => void;
}

// #783264 for fills/backgrounds; white/light text for readability on dark mode
const FILL = '#783264';
const FILL_BG = `${FILL}25`;       // subtle tinted background
const FILL_BORDER = `${FILL}50`;   // visible border

export const PDFExportModal: React.FC<PDFExportModalProps> = ({
  detection,
  isOpen,
  onClose,
  onExportStart,
  onExportComplete,
  onExportError
}) => {
  const [selectedSections, setSelectedSections] = useState<string[]>(DEFAULT_PDF_SECTIONS);
  const [isExporting, setIsExporting] = useState(false);
  const [includeHeader, setIncludeHeader] = useState(true);

  if (!isOpen) return null;

  const toggleSection = (key: string) => {
    // Header is always included if includeHeader is true
    if (key === 'header') {
      setIncludeHeader(!includeHeader);
      if (!includeHeader) {
        setSelectedSections(prev => [...prev, 'header']);
      } else {
        setSelectedSections(prev => prev.filter(s => s !== 'header'));
      }
      return;
    }

    setSelectedSections(prev => 
      prev.includes(key) 
        ? prev.filter(s => s !== key)
        : [...prev, key]
    );
  };

  const selectAll = () => {
    setSelectedSections(PDF_EXPORT_SECTIONS.map(s => s.key));
    setIncludeHeader(true);
  };

  const selectNone = () => {
    setSelectedSections(['header']); // Keep header minimum
    setIncludeHeader(true);
  };

  const selectDefault = () => {
    setSelectedSections(DEFAULT_PDF_SECTIONS);
    setIncludeHeader(true);
  };

  const handleExport = async () => {
    setIsExporting(true);
    onExportStart?.();

    try {
      const sectionsToExport = includeHeader 
        ? [...new Set(['header', ...selectedSections])]
        : selectedSections.filter(s => s !== 'header');

      await generateDetectionPDF(detection, sectionsToExport);
      logAuditEvent({
        action: 'export.pdf',
        entity_type: 'detection',
        entity_id: detection.id,
        entity_name: detection.name,
        details: { sections: sectionsToExport },
      });
      onExportComplete?.();
      onClose();
    } catch (error: any) {
      console.error('PDF export failed:', error);
      onExportError?.(error.message || 'Failed to generate PDF');
    } finally {
      setIsExporting(false);
    }
  };

  // Group sections for better organization
  const essentialSections = PDF_EXPORT_SECTIONS.filter(s => 
    ['header', 'description', 'classification'].includes(s.key)
  );
  const technicalSections = PDF_EXPORT_SECTIONS.filter(s => 
    ['datasources', 'mitre', 'detection_logic'].includes(s.key)
  );
  const contextSections = PDF_EXPORT_SECTIONS.filter(s => 
    ['threat_intel', 'investigation', 'tuning', 'validation'].includes(s.key)
  );
  const metaSections = PDF_EXPORT_SECTIONS.filter(s => 
    ['metadata', 'audit'].includes(s.key)
  );

  const SectionGroup: React.FC<{ title: string; sections: PDFExportSection[] }> = ({ title, sections }) => (
    <div className="mb-4">
      <h4 className="text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-2">{title}</h4>
      <div className="space-y-1">
        {sections.map(section => {
          const isSelected = selectedSections.includes(section.key);
          const isHeader = section.key === 'header';
          
          return (
            <button
              key={section.key}
              onClick={() => toggleSection(section.key)}
              className={`w-full flex items-start gap-3 p-3 rounded-xl border transition-all text-left ${
                isSelected
                  ? 'hover:brightness-110'
                  : 'bg-surface-container border-outline-variant/20 hover:bg-surface-container-high'
              }`}
              style={isSelected ? { backgroundColor: FILL_BG, borderColor: FILL_BORDER } : {}}
            >
              {/* Checkbox */}
              <div
                className={`flex-shrink-0 w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors ${
                  !isSelected ? 'border-outline-variant bg-transparent' : ''
                }`}
                style={isSelected ? { backgroundColor: FILL, borderColor: FILL } : {}}
              >
                {isSelected && (
                  <Icon name="check" className="w-3 h-3 text-white" />
                )}
              </div>

              {/* Icon */}
              <div
                className={`flex-shrink-0 p-1.5 rounded-lg ${!isSelected ? 'bg-surface-container-highest' : ''}`}
                style={isSelected ? { backgroundColor: FILL_BG } : {}}
              >
                <Icon
                  name={section.icon}
                  className={`w-4 h-4 ${isSelected ? 'text-on-surface' : 'text-on-surface-variant'}`}
                />
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-medium ${
                    isSelected ? 'text-on-surface' : 'text-on-surface-variant'
                  }`}>
                    {section.label}
                  </span>
                  {isHeader && (
                    <span className="px-1.5 py-0.5 text-[9px] font-bold rounded text-white" style={{ backgroundColor: FILL }}>
                      RECOMMENDED
                    </span>
                  )}
                </div>
                <p className="text-xs text-on-surface-variant/70 mt-0.5 line-clamp-1">
                  {section.description}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
        <div className="bg-surface-container rounded-3xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden border border-outline-variant/30">
          
          {/* Header */}
          <div className="flex-shrink-0 px-6 py-5 border-b border-outline-variant/30 bg-surface-container-low">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl" style={{ backgroundColor: FILL }}>
                  <Icon name="file-text" className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-on-surface">Export as PDF</h2>
                  <p className="text-sm text-on-surface-variant mt-0.5">
                    Select sections to include in your PDF report
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded-full hover:bg-surface-container-highest transition-colors text-on-surface-variant"
              >
                <Icon name="x" className="w-5 h-5" />
              </button>
            </div>

            {/* Detection info */}
            <div className="mt-4 p-3 bg-surface-container rounded-xl border border-outline-variant/20">
              <div className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-on-surface truncate">{detection.name}</p>
                  <p className="text-xs text-on-surface-variant mt-0.5">
                    ID: {detection.id.slice(0, 8)}... • {detection.status} • {detection.severity}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg" style={{ backgroundColor: FILL }}>
                  <span className="text-sm font-bold text-white">{detection.qualityScore}%</span>
                  <span className="text-xs text-white/70">Quality</span>
                </div>
              </div>
            </div>
          </div>

          {/* Quick actions */}
          <div className="flex-shrink-0 px-6 py-3 border-b border-outline-variant/20 bg-surface-container-low/50">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-on-surface-variant">
                {selectedSections.length} of {PDF_EXPORT_SECTIONS.length} sections selected
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={selectAll}
                  className="px-3 py-1.5 text-xs font-medium text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest rounded-lg transition-colors"
                >
                  Select All
                </button>
                <button
                  onClick={selectDefault}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg transition-colors text-on-surface hover:bg-surface-container-highest"
                >
                  Default
                </button>
                <button
                  onClick={selectNone}
                  className="px-3 py-1.5 text-xs font-medium text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest rounded-lg transition-colors"
                >
                  Minimum
                </button>
              </div>
            </div>
          </div>

          {/* Sections list */}
          <div className="flex-1 overflow-y-auto px-6 py-4 custom-scrollbar">
            <SectionGroup title="Essential" sections={essentialSections} />
            <SectionGroup title="Technical Details" sections={technicalSections} />
            <SectionGroup title="Context & Response" sections={contextSections} />
            <SectionGroup title="Metadata & History" sections={metaSections} />
          </div>

          {/* Footer */}
          <div className="flex-shrink-0 px-6 py-4 border-t border-outline-variant/30 bg-surface-container-low">
            <div className="flex items-center justify-between">
              <div className="text-xs text-on-surface-variant">
                <Icon name="info" className="w-3.5 h-3.5 inline-block align-text-bottom mr-1" />
                PDF will be generated and downloaded automatically
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={onClose}
                  disabled={isExporting}
                  className="px-4 py-2.5 text-sm font-medium text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest rounded-xl transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleExport}
                  disabled={isExporting || selectedSections.length === 0}
                  className="px-6 py-2.5 text-sm font-medium text-white rounded-xl hover:brightness-110 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-lg"
                  style={{ backgroundColor: FILL }}
                >
                  {isExporting ? (
                    <>
                      <Icon name="loader" className="w-4 h-4 animate-spin" />
                      <span>Generating...</span>
                    </>
                  ) : (
                    <>
                      <Icon name="download" className="w-4 h-4" />
                      <span>Export PDF</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default PDFExportModal;
