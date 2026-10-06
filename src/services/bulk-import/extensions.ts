import type { VendorFormat } from './types';

const EXTENSIONS: Record<VendorFormat, string[]> = {
  sigma: ['.yml', '.yaml'],
  splunk_escu: ['.yml', '.yaml'],
  elastic: ['.toml'],
  kql: ['.yml', '.yaml'],
  crowdstrike_cql: ['.yml', '.yaml'],
  chronicle: ['.yaral', '.yar'],
  sentinelone: ['.yml', '.yaml', '.json', '.s1ql', '.powerquery', '.pq', '.txt'],
};

/** Shared by parsers, upload controls, repository scans, and downloads. */
export function getImportExtensions(formats?: VendorFormat[]): string[] {
  const selected = formats?.length ? formats : (Object.keys(EXTENSIONS) as VendorFormat[]);
  return [...new Set(selected.flatMap((format) => EXTENSIONS[format] ?? []))];
}
