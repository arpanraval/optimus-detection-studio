import { getImportExtensions } from '../extensions';
/**
 * BaseParser - Abstract base class for vendor-specific parsers
 *
 * Defines the contract that all vendor parsers must implement.
 * Provides common utilities for MITRE extraction and error handling.
 */

import {
  ParsedRule,
  ParseResult,
  ParseError,
  ParseErrorCode,
  VendorFormat,
  extractMitreFromTags,
} from '../types';

/**
 * Abstract base class for detection rule parsers
 */
export abstract class BaseParser {
  /** The vendor format this parser handles */
  abstract readonly vendorFormat: VendorFormat;

  /**
   * Parse a single file's content into a ParsedRule
   * @param content - The file content as a string
   * @param fileName - The name of the file being parsed
   * @param filePath - Optional full path within archive
   * @returns ParseResult with success/failure and parsed rule or error
   */
  abstract parse(content: string, fileName: string, filePath?: string): ParseResult;

  /**
   * Check if this parser can handle the given file
   * @param fileName - The name of the file
   * @param content - Optional content for format sniffing
   * @returns true if this parser should handle the file
   */
  abstract canParse(fileName: string, content?: string): boolean;

  /**
   * Get list of file extensions this parser supports
   * @returns Array of extensions like ['.yml', '.yaml']
   */
  getSupportedExtensions(): string[] {
    return getImportExtensions([this.vendorFormat]);
  }

  /**
   * Extract MITRE ATT&CK data from tags
   * Common utility for all parsers
   */
  protected extractMitreFromTags(tags: string[]): { techniqueIds: string[]; tactics: string[] } {
    return extractMitreFromTags(tags);
  }

  /**
   * Create a successful parse result
   */
  protected createSuccessResult(
    rule: ParsedRule,
    warnings: string[] = [],
    parsingTime?: number
  ): ParseResult {
    return {
      success: true,
      rule,
      warnings,
      parsingTime,
    };
  }

  /**
   * Create a failed parse result
   */
  protected createErrorResult(
    code: ParseErrorCode,
    message: string,
    details?: {
      line?: number;
      column?: number;
      details?: string;
    }
  ): ParseResult {
    return {
      success: false,
      error: {
        code,
        message,
        ...details,
      },
      warnings: [],
    };
  }

  /**
   * Validate that required fields exist
   */
  protected validateRequiredFields(
    data: Record<string, unknown>,
    requiredFields: string[]
  ): { valid: boolean; missing: string[] } {
    const missing: string[] = [];

    for (const field of requiredFields) {
      const value = data[field];
      if (value === undefined || value === null || value === '') {
        missing.push(field);
      }
    }

    return {
      valid: missing.length === 0,
      missing,
    };
  }

  /**
   * Safely get a string value from an object
   */
  protected getString(obj: Record<string, unknown>, key: string, defaultValue = ''): string {
    const value = obj[key];
    if (typeof value === 'string') return value;
    if (typeof value === 'number') return String(value);
    if (Array.isArray(value) && value.length > 0) return String(value[0]);
    return defaultValue;
  }

  /**
   * Safely get a string array from an object
   */
  protected getStringArray(obj: Record<string, unknown>, key: string): string[] {
    const value = obj[key];
    if (Array.isArray(value)) {
      return value.map((v) => String(v)).filter((v) => v.length > 0);
    }
    if (typeof value === 'string' && value.length > 0) {
      return [value];
    }
    return [];
  }

  /**
   * Extract file extension from filename
   */
  protected getFileExtension(fileName: string): string {
    const lastDot = fileName.lastIndexOf('.');
    if (lastDot === -1) return '';
    return fileName.slice(lastDot).toLowerCase();
  }

  /**
   * Generate a source ID from filename if none provided
   */
  protected generateSourceId(fileName: string): string {
    // Remove extension and clean up
    const base = fileName.replace(/\.(ya?ml|toml|json|md|kql|yaral|yar|s1ql|powerquery|pq|txt)$/i, '');
    // Replace special characters with underscores
    return base.replace(/[^a-zA-Z0-9_-]/g, '_');
  }

  /**
   * Clean and normalize text content
   */
  protected normalizeText(text: unknown): string {
    if (typeof text !== 'string') return '';
    // Normalize whitespace and trim
    return text.replace(/\s+/g, ' ').trim();
  }

  /**
   * Parse ISO date string or return undefined
   */
  protected parseDate(dateValue: unknown): string | undefined {
    if (!dateValue) return undefined;

    if (dateValue instanceof Date) {
      return dateValue.toISOString().split('T')[0];
    }

    if (typeof dateValue === 'string') {
      // Try to parse various date formats
      const dateStr = dateValue.trim();

      // Already ISO format (YYYY-MM-DD)
      if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        return dateStr;
      }

      // Try Date parsing
      try {
        const parsed = new Date(dateStr);
        if (!isNaN(parsed.getTime())) {
          return parsed.toISOString().split('T')[0];
        }
      } catch {
        // Ignore parse errors
      }
    }

    return undefined;
  }

  /**
   * Extract CVE identifiers from tags or text
   */
  protected extractCVEs(tags: string[], description?: string): string[] {
    const cves: Set<string> = new Set();
    const cvePattern = /CVE-\d{4}-\d{4,}/gi;

    // Extract from tags
    for (const tag of tags) {
      const matches = tag.match(cvePattern);
      if (matches) {
        matches.forEach((cve) => cves.add(cve.toUpperCase()));
      }
    }

    // Extract from description if provided
    if (description) {
      const matches = description.match(cvePattern);
      if (matches) {
        matches.forEach((cve) => cves.add(cve.toUpperCase()));
      }
    }

    return Array.from(cves);
  }

  /**
   * Map common logsource products to platforms
   */
  protected mapProductToPlatform(product: string): string[] {
    const productLower = product.toLowerCase();

    const platformMap: Record<string, string[]> = {
      windows: ['Windows'],
      linux: ['Linux'],
      macos: ['macOS'],
      mac: ['macOS'],
      azure: ['Azure AD', 'Azure'],
      aws: ['AWS'],
      gcp: ['GCP'],
      office365: ['Office 365'],
      m365: ['Office 365'],
      okta: ['SaaS'],
    };

    for (const [key, platforms] of Object.entries(platformMap)) {
      if (productLower.includes(key)) {
        return platforms;
      }
    }

    return [];
  }

  /**
   * Map logsource to data sources
   */
  protected mapLogsourceToDataSources(logsource: {
    product?: string;
    service?: string;
    category?: string;
  }): string[] {
    const dataSources: Set<string> = new Set();

    const { product, service, category } = logsource;

    // Map common categories to MITRE data sources
    const categoryMap: Record<string, string[]> = {
      process_creation: ['Process: Process Creation'],
      image_load: ['Module: Module Load'],
      network_connection: ['Network Traffic: Network Connection Creation'],
      dns: ['Network Traffic: Network Traffic Content'],
      dns_query: ['Network Traffic: Network Traffic Content'],
      file_event: ['File: File Creation', 'File: File Modification'],
      file_delete: ['File: File Deletion'],
      file_access: ['File: File Access'],
      registry_event: ['Windows Registry: Windows Registry Key Creation'],
      registry_add: ['Windows Registry: Windows Registry Key Creation'],
      registry_delete: ['Windows Registry: Windows Registry Key Deletion'],
      registry_set: ['Windows Registry: Windows Registry Key Modification'],
      firewall: ['Network Traffic: Network Traffic Flow'],
      authentication: ['Logon Session: Logon Session Creation'],
      webserver: ['Application Log: Application Log Content'],
      proxy: ['Network Traffic: Network Traffic Content'],
    };

    if (category && categoryMap[category.toLowerCase()]) {
      categoryMap[category.toLowerCase()].forEach((ds) => dataSources.add(ds));
    }

    // Add service as data source if specific
    if (service && !['security', 'system', 'application'].includes(service.toLowerCase())) {
      dataSources.add(service);
    }

    return Array.from(dataSources);
  }
}
