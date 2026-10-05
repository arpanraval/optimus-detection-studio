/**
 * PackExportMenu — dropdown menu for exporting a pack in various formats.
 */

import React, { useState, useRef, useEffect } from 'react';
import { Icon } from '../Icon';
import { Button } from '../ui/Button';
import { exportPackAs, downloadExport, ExportFormat } from '../../lib/exporters/packExporters';
import { useToast } from '../../hooks/useToast';
import type { Detection, DetectionPack } from '../../types';

interface Props {
  pack: DetectionPack & { detections?: Detection[] };
}

interface FormatOption {
  value: ExportFormat;
  label: string;
  description: string;
  tooltip: string;
  icon: 'file-text' | 'archive' | 'database' | 'cloud';
}

export const PACK_EXPORT_FORMATS: FormatOption[] = [
  {
    value: 'json',
    label: 'JSON Bundle',
    description: 'Optimus native format',
    tooltip:
      'Full pack bundle: metadata, detections, MITRE mapping, versioning context. Best for backup or re-import into Optimus.',
    icon: 'file-text',
  },
  {
    value: 'sigma',
    label: 'Sigma ZIP',
    description: 'Universal YAML rules',
    tooltip:
      'ZIP of Sigma YAML rules. Note: detections already in Sigma format may carry indentation quirks — review before sharing with third parties.',
    icon: 'archive',
  },
  {
    value: 'splunk',
    label: 'Splunk conf',
    description: 'savedsearches.conf',
    tooltip:
      'Splunk savedsearches.conf file. SPL queries only. No pack metadata; per-rule settings (cron, severity) use app defaults.',
    icon: 'database',
  },
  {
    value: 'sentinel',
    label: 'Sentinel ARM',
    description: 'ARM template JSON',
    tooltip: 'Azure Sentinel ARM template JSON. Deploys analytics rules via Azure Resource Manager. KQL queries only.',
    icon: 'cloud',
  },
];

export const PackExportMenu: React.FC<Props> = ({ pack }) => {
  const [open, setOpen] = useState(false);
  const [exporting, setExporting] = useState<ExportFormat | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const { showToast } = useToast();

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleExport = async (format: ExportFormat) => {
    setExporting(format);
    setOpen(false);
    try {
      const result = await exportPackAs(pack, format);
      downloadExport(result);
      showToast('success', 'Pack Exported', `Downloaded ${result.filename}`);
    } catch (err) {
      showToast('error', 'Export Failed', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setExporting(null);
    }
  };

  return (
    <div ref={menuRef} className="relative">
      <Button
        onClick={() => setOpen(!open)}
        disabled={exporting !== null}
        size="md"
        variant="outlined"
        color="surface"
        title="Export pack in various formats"
      >
        {exporting ? (
          <>
            <Icon name="spinner" className="w-4 h-4 animate-spin" />
            Exporting...
          </>
        ) : (
          <>
            <Icon name="download" className="w-4 h-4" />
            Export
            <Icon name="chevron-down" className="w-3 h-3" />
          </>
        )}
      </Button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-64 bg-surface border border-outline-variant/30 rounded-xl shadow-lg overflow-hidden z-20">
          <div className="px-3 py-2 border-b border-outline-variant/10">
            <div className="text-[10px] font-semibold text-on-surface-variant uppercase tracking-wider">
              Export Format
            </div>
          </div>
          {PACK_EXPORT_FORMATS.map((format) => (
            <button
              key={format.value}
              onClick={() => handleExport(format.value)}
              title={format.tooltip}
              className="w-full px-4 py-3 flex items-center gap-3 hover:bg-surface-container text-left transition-colors"
            >
              <Icon name={format.icon} className="w-4 h-4 text-on-surface-variant flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-on-surface">{format.label}</div>
                <div className="text-xs text-on-surface-variant">{format.description}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
