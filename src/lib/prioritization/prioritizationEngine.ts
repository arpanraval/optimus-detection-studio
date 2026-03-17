/**
 * Prioritization Engine
 *
 * Pure scoring logic for detection priority ranking.
 * Extracted from useProfileIntelligence hook so it can be reused
 * across the codebase without React or Supabase dependencies.
 */

import { scoreToGrade } from '../quality/scoringEngine';

// ============================================
// TYPES
// ============================================

export interface PriorityBreakdown {
  severity: number;
  confidence: number;
  threatGroups: number;
  siemReady: number;
  crownJewel: number;
  quality: number;
  validated: number;
}

export interface PriorityContext {
  userQueryLanguages: string[];
  crownJewels: string[];
  /** Map of regex pattern -> crown jewel name, pre-built for performance */
  crownJewelPatterns: Map<RegExp, string>;
  /** Names of threat groups that target techniques in this detection */
  matchedGroupNames: string[];
}

export interface PriorityResult {
  score: number;
  breakdown: PriorityBreakdown;
  siemReady: boolean;
  crownJewelMatch: string | null;
}

// ============================================
// SCORING CONSTANTS
// ============================================

export const SEVERITY_SCORE: Record<string, number> = {
  'Critical': 4, 'High': 3, 'Medium': 2, 'Low': 1, 'Informational': 0,
};

export const CONFIDENCE_SCORE: Record<string, number> = {
  'High': 1, 'Medium': 0, 'Low': -1,
};

export const QUALITY_BOOST: Record<string, number> = {
  'A': 3, 'B': 1, 'C': 0, 'D': -1, 'F': -3,
};

// ============================================
// CROWN JEWEL KEYWORDS
// ============================================

/** Crown jewel keywords -> detection keywords to boost */
export const CROWN_JEWEL_KEYWORDS: Record<string, string[]> = {
  'Domain Controllers': ['active-directory', 'kerberos', 'ldap', 'domain controller', 'ntds', 'dcsync', 'dcpromo'],
  'Financial Systems': ['financial', 'payment', 'banking', 'transaction', 'swift'],
  'Customer Databases': ['database', 'sql', 'exfiltration', 'data theft'],
  'Source Code Repositories': ['git', 'repository', 'source code', 'bitbucket', 'github'],
  'Executive Accounts': ['executive', 'vip', 'privileged', 'admin', 'c-level'],
  'Medical Records': ['medical', 'health', 'hipaa', 'patient', 'ehr'],
  'Payment Systems': ['payment', 'pci', 'credit card', 'pos', 'stripe'],
  'SCADA / ICS': ['scada', 'ics', 'industrial', 'plc', 'hmi', 'modbus'],
  'Email Systems': ['email', 'exchange', 'smtp', 'phishing', 'mail'],
  'HR / PII Systems': ['hr', 'pii', 'personnel', 'employee', 'ssn'],
};

// ============================================
// NON-SIEM TECHNIQUE PREFIXES
// ============================================

/**
 * MITRE ATT&CK technique ID prefixes for Reconnaissance (TA0043) and
 * Resource Development (TA0042). These tactics describe activity on
 * attacker-controlled infrastructure and cannot be observed through
 * SIEM or endpoint telemetry.
 */
export const NON_SIEM_TECHNIQUE_PREFIXES = [
  // Reconnaissance (TA0043)
  'T1595', 'T1592', 'T1589', 'T1590', 'T1591', 'T1593', 'T1594', 'T1596', 'T1597', 'T1598',
  // Resource Development (TA0042)
  'T1583', 'T1584', 'T1585', 'T1586', 'T1587', 'T1588', 'T1608', 'T1650',
];

// ============================================
// UTILITY FUNCTIONS
// ============================================

export function isSiemDetectable(mitreId: string): boolean {
  return !NON_SIEM_TECHNIQUE_PREFIXES.some(prefix => mitreId.startsWith(prefix));
}

/**
 * Build a Map of word-boundary RegExp patterns to crown jewel names
 * from a list of crown jewel identifiers. Pre-building avoids repeated
 * regex compilation inside the scoring loop.
 */
export function buildCrownJewelPatterns(crownJewels: string[]): Map<RegExp, string> {
  const patterns = new Map<RegExp, string>();
  for (const jewel of crownJewels) {
    const keywords = CROWN_JEWEL_KEYWORDS[jewel];
    if (keywords) {
      for (const k of keywords) {
        const escaped = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        patterns.set(new RegExp('\\b' + escaped + '\\b', 'i'), jewel);
      }
    }
  }
  return patterns;
}

// ============================================
// CORE SCORING FUNCTION
// ============================================

/**
 * Compute a priority score for a single detection given its attributes
 * and the user's environment context.
 *
 * Score components:
 *  - Severity:      0-12 (weighted x3 for stronger differentiation)
 *  - Confidence:    -2 to +2 (weighted x2)
 *  - Threat groups: 0-6 (capped, scales with matched group count)
 *  - SIEM ready:    0-3 (native=3, Sigma=1, other=0)
 *  - Crown jewel:   0 or 3
 *  - Quality:       -3 to +3 (based on quality grade)
 *  - Validated:     0 or 2
 */
export function computePriorityScore(
  detection: {
    name: string;
    severity: string;
    confidence: string;
    queryLanguage: string;
    qualityScore: number;
    testedAndValidated: boolean;
  },
  context: PriorityContext,
): PriorityResult {
  // SIEM readiness: only native language is truly "ready"; Sigma needs conversion
  const isNative = context.userQueryLanguages.includes(detection.queryLanguage);
  const isSigma = detection.queryLanguage === 'Sigma';
  const siemReady = isNative;

  // Severity: 0-12 (weighted x3 for stronger differentiation)
  const sevScore = (SEVERITY_SCORE[detection.severity] || 0) * 3;
  // Confidence: -2 to +2 (weighted x2)
  const confScore = (CONFIDENCE_SCORE[detection.confidence] || 0) * 2;
  // Threat groups: scales with count, capped at 6
  const groupBoost = Math.min(context.matchedGroupNames.length * 2, 6);
  // SIEM readiness: native > Sigma > other
  const siemBoost = isNative ? 3 : isSigma ? 1 : 0;

  // Crown jewels boost: check if detection name matches crown jewel keywords
  let crownBoost = 0;
  let crownJewelMatch: string | null = null;
  if (context.crownJewelPatterns.size > 0) {
    for (const [pattern, jewelName] of context.crownJewelPatterns) {
      if (pattern.test(detection.name)) {
        crownBoost = 3;
        crownJewelMatch = jewelName;
        break;
      }
    }
  }

  // Quality: -3 to +3 based on quality grade
  const qualityGrade = scoreToGrade(detection.qualityScore);
  const qualityBoost = QUALITY_BOOST[qualityGrade] ?? 0;
  // Validated/tested bonus
  const validatedBoost = detection.testedAndValidated ? 2 : 0;

  const score = sevScore + confScore + groupBoost + siemBoost + crownBoost + qualityBoost + validatedBoost;

  const breakdown: PriorityBreakdown = {
    severity: sevScore,
    confidence: confScore,
    threatGroups: groupBoost,
    siemReady: siemBoost,
    crownJewel: crownBoost,
    quality: qualityBoost,
    validated: validatedBoost,
  };

  return { score, breakdown, siemReady, crownJewelMatch };
}
