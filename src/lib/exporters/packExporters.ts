/**
 * packExporters — SIEM-native export formats for detection packs.
 *
 * Supported formats:
 *   - json    Proprietary Optimus bundle (pack metadata + raw detections)
 *   - sigma   ZIP of Sigma YAML files (universal format)
 *   - splunk  Splunk savedsearches.conf stanzas
 *   - sentinel Microsoft Sentinel ARM template
 */

import JSZip from 'jszip';
import type { Detection, DetectionPack } from '../../types';

export type ExportFormat = 'json' | 'sigma' | 'splunk' | 'sentinel';

export interface ExportResult {
  filename: string;
  blob: Blob;
  contentType: string;
}

interface PackWithDetections extends DetectionPack {
  detections?: Detection[];
}

// ============================================================================
// Shared helpers
// ============================================================================

function sanitizeFilename(name: string): string {
  // Preserve alphanumeric, dash, underscore, dot. Collapse runs of other chars to _.
  return name.replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80) || 'pack';
}

function sanitizeForYaml(value: string | null | undefined): string {
  if (value == null) return '';
  // Escape double quotes, remove control chars
  return value.replace(/\x00-\x1F\x7F/g, '').replace(/"/g, '\\"');
}

function getPrimaryQuery(detection: Detection): { query: string; language: string } {
  const primaryQuery = detection.queries?.[0]?.query || detection.detectionQuery || '';
  const queryLanguage = detection.queries?.[0]?.language || detection.queryLanguage || '';
  return { query: primaryQuery, language: queryLanguage };
}

function dateStamp(): string {
  return new Date().toISOString().split('T')[0];
}

// ============================================================================
// JSON bundle (native Optimus format)
// ============================================================================

export function exportAsJson(pack: PackWithDetections): ExportResult {
  const bundle = {
    format: 'optimus-pack-bundle',
    version: '1.0',
    exported_at: new Date().toISOString(),
    pack: {
      name: pack.name,
      description: pack.description,
      icon: pack.icon,
      tags: pack.tags,
      platforms: pack.platforms,
      source: pack.source,
      pack_type: pack.pack_type,
      mitre_technique_ids: pack.mitre_technique_ids,
    },
    detections: pack.detections || [],
  };

  const json = JSON.stringify(bundle, null, 2);
  return {
    filename: `${sanitizeFilename(pack.name)}_pack_${dateStamp()}.json`,
    blob: new Blob([json], { type: 'application/json' }),
    contentType: 'application/json',
  };
}

// ============================================================================
// Sigma YAML ZIP bundle
// ============================================================================

function detectionToSigmaYaml(detection: Detection, packName: string): string {
  const { query, language } = getPrimaryQuery(detection);
  const title = sanitizeForYaml(detection.name);
  const description = sanitizeForYaml(detection.description || '');
  const tags = (detection.mitreAttackIds || []).map((id) => `attack.${id.toLowerCase()}`);
  const platformTags = (detection.platforms || []).map((p) => p.toLowerCase());

  // If the detection already has a Sigma query, use it verbatim as the detection block.
  // Otherwise, emit a minimal Sigma skeleton with the raw query as a comment.
  const isAlreadySigma = language.toLowerCase() === 'sigma';

  const lines: string[] = [];
  lines.push(`title: ${title}`);
  lines.push(`id: ${detection.id}`);
  lines.push(`status: ${detection.status === 'Production' ? 'stable' : 'experimental'}`);
  lines.push(`description: |`);
  for (const line of description.split('\n')) {
    lines.push(`  ${line}`);
  }
  lines.push(`author: ${sanitizeForYaml(detection.author || 'Optimus')}`);
  lines.push(`date: ${dateStamp()}`);
  lines.push(`tags:`);
  for (const tag of [...tags, ...platformTags]) {
    lines.push(`  - ${tag}`);
  }
  if (detection.logSources && detection.logSources.length > 0) {
    lines.push(`logsource:`);
    lines.push(`  product: ${sanitizeForYaml(detection.logSources[0])}`);
  }
  lines.push(`# Exported from Optimus Detection Studio pack: ${sanitizeForYaml(packName)}`);
  lines.push(`# Original query language: ${language || 'unknown'}`);
  if (isAlreadySigma) {
    lines.push(`detection:`);
    // Assume the query is valid Sigma detection block content
    for (const line of query.split('\n')) {
      lines.push(`  ${line}`);
    }
  } else {
    lines.push(`detection:`);
    lines.push(`  # TODO: Convert from ${language} to Sigma detection syntax`);
    lines.push(`  # Original query:`);
    for (const line of query.split('\n')) {
      lines.push(`  #   ${line}`);
    }
    lines.push(`  selection:`);
    lines.push(`    # placeholder — manual conversion required`);
    lines.push(`  condition: selection`);
  }
  lines.push(`level: ${(detection.severity || 'medium').toLowerCase()}`);
  lines.push(`falsepositives:`);
  const fps = detection.falsePositiveGuidance
    ? [detection.falsePositiveGuidance]
    : ['Unknown'];
  for (const fp of fps) {
    lines.push(`  - ${sanitizeForYaml(fp)}`);
  }

  return lines.join('\n') + '\n';
}

export async function exportAsSigmaZip(pack: PackWithDetections): Promise<ExportResult> {
  const zip = new JSZip();
  const packFolder = zip.folder(sanitizeFilename(pack.name)) || zip;

  // README explaining the format
  const readme = [
    `# ${pack.name}`,
    '',
    pack.description || '',
    '',
    '## Contents',
    `- ${(pack.detections || []).length} detection rules in Sigma YAML format`,
    `- Exported from Optimus Detection Studio on ${new Date().toISOString()}`,
    '',
    '## Notes',
    'Rules with non-Sigma source languages include the original query as a comment',
    'and a placeholder Sigma detection block — manual conversion may be required.',
    '',
  ].join('\n');
  packFolder.file('README.md', readme);

  // Pack manifest
  const manifest = {
    name: pack.name,
    description: pack.description,
    tags: pack.tags,
    platforms: pack.platforms,
    mitre_technique_ids: pack.mitre_technique_ids,
    detection_count: (pack.detections || []).length,
    exported_at: new Date().toISOString(),
  };
  packFolder.file('pack.json', JSON.stringify(manifest, null, 2));

  // Sigma YAML per detection
  const rulesFolder = packFolder.folder('rules') || packFolder;
  for (const detection of pack.detections || []) {
    const yaml = detectionToSigmaYaml(detection, pack.name);
    const filename = `${sanitizeFilename(detection.name || detection.id)}.yml`;
    rulesFolder.file(filename, yaml);
  }

  const blob = await zip.generateAsync({ type: 'blob' });
  return {
    filename: `${sanitizeFilename(pack.name)}_sigma_${dateStamp()}.zip`,
    blob,
    contentType: 'application/zip',
  };
}

// ============================================================================
// Splunk savedsearches.conf
// ============================================================================

function sanitizeSplunkStanza(name: string): string {
  return name.replace(/[\[\]]/g, '').replace(/\n/g, ' ').trim();
}

function detectionToSplunkStanza(detection: Detection): string {
  const { query, language } = getPrimaryQuery(detection);
  const stanzaName = sanitizeSplunkStanza(detection.name || detection.id);
  const isSpl = language.toLowerCase() === 'spl';

  const lines: string[] = [];
  lines.push(`[${stanzaName}]`);
  lines.push(`description = ${(detection.description || '').replace(/\n/g, ' ').slice(0, 500)}`);
  lines.push(`search = ${isSpl ? query.replace(/\n/g, ' ') : `# NOT SPL — manual conversion required. Original (${language}): ${query.replace(/\n/g, ' ')}`}`);
  lines.push(`disabled = 0`);
  lines.push(`is_scheduled = 1`);
  lines.push(`cron_schedule = */10 * * * *`);
  lines.push(`dispatch.earliest_time = -15m`);
  lines.push(`dispatch.latest_time = now`);
  lines.push(`alert.severity = ${severityToSplunkLevel(detection.severity)}`);
  lines.push(`alert.suppress = 0`);
  lines.push(`action.correlationsearch.enabled = 1`);
  lines.push(`action.correlationsearch.label = ${stanzaName}`);
  if (detection.mitreAttackIds && detection.mitreAttackIds.length > 0) {
    lines.push(`action.correlationsearch.annotations = ${JSON.stringify({ mitre_attack: detection.mitreAttackIds })}`);
  }
  lines.push('');
  return lines.join('\n');
}

function severityToSplunkLevel(severity: string | undefined): string {
  switch ((severity || '').toLowerCase()) {
    case 'critical': return '5';
    case 'high': return '4';
    case 'medium': return '3';
    case 'low': return '2';
    case 'informational': return '1';
    default: return '3';
  }
}

export function exportAsSplunkConf(pack: PackWithDetections): ExportResult {
  const header = [
    `# Splunk savedsearches.conf — exported from Optimus Detection Studio`,
    `# Pack: ${pack.name}`,
    `# Description: ${pack.description || ''}`,
    `# Exported: ${new Date().toISOString()}`,
    `# Detections: ${(pack.detections || []).length}`,
    ``,
    ``,
  ].join('\n');

  const stanzas = (pack.detections || [])
    .map((d) => detectionToSplunkStanza(d))
    .join('\n');

  const content = header + stanzas;

  return {
    filename: `${sanitizeFilename(pack.name)}_savedsearches_${dateStamp()}.conf`,
    blob: new Blob([content], { type: 'text/plain' }),
    contentType: 'text/plain',
  };
}

// ============================================================================
// Microsoft Sentinel ARM template
// ============================================================================

function severityToSentinel(severity: string | undefined): string {
  switch ((severity || '').toLowerCase()) {
    case 'critical':
    case 'high':
      return 'High';
    case 'medium':
      return 'Medium';
    case 'low':
    case 'informational':
      return 'Low';
    default:
      return 'Medium';
  }
}

function detectionToSentinelRule(detection: Detection, index: number): Record<string, unknown> {
  const { query, language } = getPrimaryQuery(detection);
  const isKql = language.toLowerCase() === 'kql' || language.toLowerCase() === 'kuery';

  return {
    type: 'Microsoft.OperationalInsights/workspaces/providers/alertRules',
    apiVersion: '2022-11-01',
    name: `[concat(parameters('workspace'),'/Microsoft.SecurityInsights/',guid('${detection.id}'))]`,
    kind: 'Scheduled',
    properties: {
      displayName: detection.name || detection.id,
      description: detection.description || '',
      severity: severityToSentinel(detection.severity),
      enabled: true,
      query: isKql ? query : `// NOT KQL — manual conversion required. Original (${language}):\n// ${query.replace(/\n/g, '\n// ')}`,
      queryFrequency: 'PT5M',
      queryPeriod: 'PT5M',
      triggerOperator: 'GreaterThan',
      triggerThreshold: 0,
      suppressionDuration: 'PT1H',
      suppressionEnabled: false,
      tactics: (detection.mitreTactics || []).map((t) => t.replace(/\s+/g, '')),
      techniques: detection.mitreAttackIds || [],
    },
    dependsOn: [],
  };
}

export function exportAsSentinelArm(pack: PackWithDetections): ExportResult {
  const template = {
    $schema: 'https://schema.management.azure.com/schemas/2019-04-01/deploymentTemplate.json#',
    contentVersion: '1.0.0.0',
    metadata: {
      description: `${pack.name} — exported from Optimus Detection Studio`,
      pack_name: pack.name,
      exported_at: new Date().toISOString(),
    },
    parameters: {
      workspace: {
        type: 'String',
        metadata: {
          description: 'Log Analytics workspace name',
        },
      },
    },
    resources: (pack.detections || []).map((d, i) => detectionToSentinelRule(d, i)),
  };

  const json = JSON.stringify(template, null, 2);
  return {
    filename: `${sanitizeFilename(pack.name)}_sentinel_arm_${dateStamp()}.json`,
    blob: new Blob([json], { type: 'application/json' }),
    contentType: 'application/json',
  };
}

// ============================================================================
// Dispatcher
// ============================================================================

export async function exportPackAs(
  pack: PackWithDetections,
  format: ExportFormat
): Promise<ExportResult> {
  switch (format) {
    case 'json':
      return exportAsJson(pack);
    case 'sigma':
      return exportAsSigmaZip(pack);
    case 'splunk':
      return exportAsSplunkConf(pack);
    case 'sentinel':
      return exportAsSentinelArm(pack);
    default:
      throw new Error(`Unknown export format: ${format}`);
  }
}

/**
 * Trigger a browser download for an export result.
 */
export function downloadExport(result: ExportResult): void {
  const url = URL.createObjectURL(result.blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = result.filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
