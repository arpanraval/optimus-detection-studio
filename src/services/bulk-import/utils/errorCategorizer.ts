/**
 * Error Categorizer - Maps raw error strings to actionable CategorizedError objects
 */

import { CategorizedError, ImportErrorCategory } from '../types';
import type { IconName } from '../../../components/Icon';

interface ErrorPattern {
  patterns: RegExp[];
  category: ImportErrorCategory;
  message: string;
  suggestion: string;
}

const ERROR_PATTERNS: ErrorPattern[] = [
  {
    patterns: [/duplicate key/i, /unique constraint/i, /already exists/i, /conflict/i],
    category: 'duplicate',
    message: 'A detection with this ID already exists in the library.',
    suggestion: 'Change duplicate strategy to "Update" or "Create New Version".',
  },
  {
    patterns: [/permission/i, /rls/i, /row.level.security/i, /unauthorized/i, /forbidden/i],
    category: 'permission_error',
    message: 'Insufficient permissions to perform this operation.',
    suggestion: 'Check your role and library permissions.',
  },
  {
    patterns: [/yaml/i, /syntax error/i, /invalid yaml/i, /unexpected token/i, /parsing/i],
    category: 'parse_error',
    message: 'Invalid file syntax.',
    suggestion: 'Check the rule formatting and ensure valid YAML/TOML/JSON syntax.',
  },
  {
    patterns: [/rate.limit/i, /429/i, /too many requests/i, /x-ratelimit/i],
    category: 'rate_limit',
    message: 'GitHub API rate limit exceeded.',
    suggestion: 'Add a GitHub Personal Access Token to increase limit from 60 to 5,000/hr.',
  },
  {
    patterns: [/network/i, /fetch failed/i, /econnrefused/i, /timeout/i, /abort/i, /dns/i],
    category: 'network_error',
    message: 'Network connectivity issue.',
    suggestion: 'Check your internet connection and try again.',
  },
  {
    patterns: [/too large/i, /size exceed/i, /payload/i, /max.*size/i],
    category: 'size_error',
    message: 'File or payload exceeds size limit.',
    suggestion: 'Split the import into smaller batches.',
  },
  {
    patterns: [/unsupported format/i, /unknown format/i, /invalid structure/i, /missing required/i],
    category: 'format_error',
    message: 'Unsupported or invalid detection format.',
    suggestion: 'Ensure files match a supported vendor format (Sigma, Splunk ESCU, Elastic, etc.).',
  },
  {
    patterns: [/validation/i, /invalid field/i, /required field/i],
    category: 'validation_error',
    message: 'Rule failed validation checks.',
    suggestion: 'Review the rule fields and fix missing or invalid values.',
  },
  {
    patterns: [/database/i, /supabase/i, /postgres/i, /insert/i, /update.*failed/i],
    category: 'database_error',
    message: 'Database operation failed.',
    suggestion: 'This may be a transient error. Try again or check the database status.',
  },
];

/**
 * Categorize a raw error string into a CategorizedError
 */
export function categorizeError(
  rawError: string,
  context?: { fileName?: string; ruleTitle?: string; code?: string }
): CategorizedError {
  for (const pattern of ERROR_PATTERNS) {
    for (const regex of pattern.patterns) {
      if (regex.test(rawError)) {
        return {
          category: pattern.category,
          code: context?.code || pattern.category.toUpperCase(),
          message: pattern.message,
          suggestion: pattern.suggestion,
          details: rawError,
          fileName: context?.fileName,
          ruleTitle: context?.ruleTitle,
        };
      }
    }
  }

  // Default fallback
  return {
    category: 'database_error',
    code: context?.code || 'UNKNOWN_ERROR',
    message: 'Import failed.',
    suggestion: 'Check the error details and try again.',
    details: rawError,
    fileName: context?.fileName,
    ruleTitle: context?.ruleTitle,
  };
}

/**
 * Get display info for an error category
 */
export function getCategoryDisplayInfo(category: ImportErrorCategory): {
  label: string;
  color: string;
  icon: IconName;
} {
  switch (category) {
    case 'parse_error':
      return { label: 'Parse Errors', color: '#E65100', icon: 'file-x' };
    case 'validation_error':
      return { label: 'Validation Errors', color: '#F57C00', icon: 'alert-triangle' };
    case 'duplicate':
      return { label: 'Duplicates', color: '#7B1FA2', icon: 'copy' };
    case 'permission_error':
      return { label: 'Permission Errors', color: '#C62828', icon: 'lock' };
    case 'database_error':
      return { label: 'Database Errors', color: '#AD1457', icon: 'database' };
    case 'rate_limit':
      return { label: 'Rate Limit', color: '#E65100', icon: 'clock' };
    case 'network_error':
      return { label: 'Network Errors', color: '#4527A0', icon: 'wifi-off' };
    case 'size_error':
      return { label: 'Size Errors', color: '#00695C', icon: 'maximize' };
    case 'format_error':
      return { label: 'Format Errors', color: '#BF360C', icon: 'file-minus' };
  }
}

/**
 * Generate a copyable error report from categorized errors
 */
export function generateErrorReport(
  failedRules: Array<{ title: string; error: string; categorizedError?: CategorizedError }>
): string {
  const lines: string[] = [
    'Bulk Import Error Report',
    `Generated: ${new Date().toISOString()}`,
    `Total failures: ${failedRules.length}`,
    '',
  ];

  // Group by category
  const grouped = new Map<string, typeof failedRules>();
  for (const rule of failedRules) {
    const cat = rule.categorizedError?.category || 'unknown';
    if (!grouped.has(cat)) grouped.set(cat, []);
    grouped.get(cat)!.push(rule);
  }

  for (const [category, rules] of grouped) {
    const info = getCategoryDisplayInfo(category as ImportErrorCategory);
    lines.push(`--- ${info.label} (${rules.length}) ---`);
    for (const rule of rules) {
      lines.push(`  - ${rule.title}: ${rule.categorizedError?.message || rule.error}`);
      if (rule.categorizedError?.suggestion) {
        lines.push(`    Suggestion: ${rule.categorizedError.suggestion}`);
      }
    }
    lines.push('');
  }

  return lines.join('\n');
}
