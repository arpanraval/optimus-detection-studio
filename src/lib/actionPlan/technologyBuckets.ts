export type TechBucket = 'endpoint' | 'cloud' | 'identity' | 'saas' | 'network';

export const BUCKET_ORDER: readonly TechBucket[] = [
  'endpoint',
  'cloud',
  'identity',
  'saas',
  'network',
] as const;

export const BUCKET_LABELS: Record<TechBucket, string> = {
  endpoint: 'Endpoint',
  cloud: 'Cloud',
  identity: 'Identity',
  saas: 'SaaS',
  network: 'Network',
};

const PLATFORM_TO_BUCKET: Record<string, TechBucket> = {
  // Endpoint
  windows: 'endpoint',
  macos: 'endpoint',
  linux: 'endpoint',
  // Cloud
  iaas: 'cloud',
  containers: 'cloud',
  esxi: 'cloud',
  // Identity
  'identity provider': 'identity',
  // SaaS
  saas: 'saas',
  'office suite': 'saas',
  'office 365': 'saas',
  'google workspace': 'saas',
  // Network
  network: 'network',
  'network devices': 'network',
};

export function bucketForPlatform(platform: string): TechBucket | null {
  if (!platform) return null;
  return PLATFORM_TO_BUCKET[platform.toLowerCase().trim()] ?? null;
}

export function bucketsForPlatforms(platforms: string[]): Set<TechBucket> {
  const out = new Set<TechBucket>();
  for (const p of platforms) {
    const b = bucketForPlatform(p);
    if (b) out.add(b);
  }
  return out;
}
