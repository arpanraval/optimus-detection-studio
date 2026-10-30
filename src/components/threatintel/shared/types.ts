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
  /**
   * The detections behind `existingDetectionCount`. Written by the library
   * matcher alongside the count and, until G8, read by nothing -- so the card
   * asserted coverage the reader had no way to check.
   */
  existingDetectionIds?: string[];
  /** Contextual coverage verdict for this TTP; absent on legacy reports. */
  coverageGrade?: 'covered' | 'partial' | 'not_covered' | 'not_assessable';
  /** Rules that check some, but not all, of the evidence's identifiers. */
  partialDetectionIds?: string[];
  /** Vendor names that mentioned this TTP. Undefined or single-item on digest. */
  sources?: string[];
}

/**
 * A library detection claimed as covering a TTP, resolved for display (G8).
 *
 * Deliberately not `LibraryMatch`: the card needs a name and a link target, and
 * coupling it to the digest's match shape would stop the story page ever
 * supplying one from a different source.
 */
export interface CoveringDetection {
  id: string;
  name: string;
  status?: string;
  severity?: string;
  /** Identifiers from the report evidence that the rule's logic checks. */
  identifiers?: string[];
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
