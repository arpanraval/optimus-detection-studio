// Shared type contracts for components used by both the single-digest page
// (ThreatIntelReportPage) and the multi-source story page (CampaignDetailPage).
//
// These are intentionally looser than ExtractedTTP/ExtractedIoC/ExtractedRule
// from src/types/threatIntel.ts — they accept the union of digest + story
// shapes. Shared components only read fields they need.

export interface TTPLike {
  id?: string;
  mitreId: string;
  techniqueName: string;
  tacticName?: string;
  tacticId?: string;
  sourceType?: string;
  confidence?: 'high' | 'medium' | 'low';
  evidence?: string;
  explanation?: string;
  isSubTechnique?: boolean;
  hasExistingDetection?: boolean;
  existingDetectionCount?: number;
  /** Vendor names that mentioned this TTP. Undefined or single-item on digest. */
  sources?: string[];
}

export interface IoCLike {
  id?: string;
  type: string;
  category?: string;
  value: string;
  severity?: 'malicious' | 'suspicious' | 'unknown' | string;
  context?: string;
  /** Vendor names that mentioned this IoC. Undefined or single-item on digest. */
  sources?: string[];
}

export interface RuleLike {
  id?: string;
  type: string;
  name?: string;
  content: string;
  sourceUrl?: string;
  description?: string;
  /** Vendor names. On story, normalized from singular `source` into this array. */
  sources?: string[];
}

export interface VendorTone {
  bg: string;
  text: string;
  border: string;
  dot: string;
}
