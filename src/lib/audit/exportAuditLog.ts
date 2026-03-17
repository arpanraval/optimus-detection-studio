/**
 * Audit Log Export Utilities
 *
 * Export audit events to CSV or JSON for compliance reporting.
 */

import { AuditEvent } from '../../types';

/**
 * Export audit events as CSV and trigger browser download.
 */
export function exportAuditCSV(events: AuditEvent[], filename = 'audit-log.csv'): void {
  const headers = [
    'Timestamp',
    'User',
    'Role',
    'Action',
    'Entity Type',
    'Entity ID',
    'Entity Name',
    'Changed Fields',
    'IP Address',
    'Source',
  ];

  const rows = events.map(e => [
    e.created_at,
    e.user_email || '',
    e.user_role || '',
    e.action,
    e.entity_type || '',
    e.entity_id || '',
    e.entity_name || '',
    e.changed_fields?.join('; ') || '',
    e.ip_address || '',
    e.source,
  ]);

  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')),
  ].join('\n');

  downloadFile(csvContent, filename, 'text/csv;charset=utf-8;');
}

/**
 * Export audit events as JSON and trigger browser download.
 */
export function exportAuditJSON(events: AuditEvent[], filename = 'audit-log.json'): void {
  const jsonContent = JSON.stringify(events, null, 2);
  downloadFile(jsonContent, filename, 'application/json');
}

function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
