export interface StixExportIoC {
  type: string;
  value: string;
  severity?: string;
  category?: string;
}

export interface StixIndicator {
  type: 'indicator';
  spec_version: '2.1';
  id: string;
  created: string;
  modified: string;
  name: string;
  pattern_type: 'stix';
  pattern_version: '2.1';
  pattern: string;
  valid_from: string;
  labels?: string[];
}

export interface StixBundle {
  type: 'bundle';
  id: string;
  objects: StixIndicator[];
}

const uuid = (): string => {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();

  const bytes = Array.from({ length: 16 }, () => Math.floor(Math.random() * 256));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

const escapeStixString = (value: string): string => value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

const asBase64 = (value: string): string => {
  if (typeof globalThis.btoa !== 'function') return '';
  const bytes = new TextEncoder().encode(value);
  return globalThis.btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(''));
};

export const getStixPattern = (ioc: StixExportIoC): string => {
  const value = escapeStixString(ioc.value);
  switch (ioc.type.toLowerCase()) {
    case 'ipv4': return `[ipv4-addr:value = '${value}']`;
    case 'ipv6': return `[ipv6-addr:value = '${value}']`;
    case 'domain':
    case 'subdomain': return `[domain-name:value = '${value}']`;
    case 'url':
    case 'uri': return `[url:value = '${value}']`;
    case 'email': return `[email-addr:value = '${value}']`;
    case 'md5': return `[file:hashes.MD5 = '${value}']`;
    case 'sha1': return `[file:hashes.'SHA-1' = '${value}']`;
    case 'sha256': return `[file:hashes.'SHA-256' = '${value}']`;
    case 'sha512': return `[file:hashes.'SHA-512' = '${value}']`;
    case 'ssdeep': return `[file:hashes.SSDEEP = '${value}']`;
    case 'file_name':
    case 'file_name_win':
    case 'file_name_unix': return `[file:name = '${value}']`;
    case 'registry':
    case 'registry_key': return `[windows-registry-key:key = '${value}']`;
    case 'mutex': return `[mutex:name = '${value}']`;
    case 'user_agent': return `[network-traffic:extensions.'http-request-ext'.request_header.'User-Agent' = '${value}']`;
    case 'asn': return `[autonomous-system:number = ${ioc.value.replace(/^AS/i, '')}]`;
    case 'cve': return `[vulnerability:name = '${value}']`;
    default: return `[artifact:payload_bin = '${asBase64(ioc.value)}']`;
  }
};

export const createStixBundle = (iocs: StixExportIoC[], timestamp = new Date().toISOString()): StixBundle => ({
  type: 'bundle',
  id: `bundle--${uuid()}`,
  objects: iocs.map((ioc) => ({
    type: 'indicator',
    spec_version: '2.1',
    id: `indicator--${uuid()}`,
    created: timestamp,
    modified: timestamp,
    name: `${ioc.type}: ${ioc.value}`,
    pattern_type: 'stix',
    pattern_version: '2.1',
    pattern: getStixPattern(ioc),
    valid_from: timestamp,
    labels: [ioc.severity, ioc.category].filter((label): label is string => Boolean(label)),
  })),
});
