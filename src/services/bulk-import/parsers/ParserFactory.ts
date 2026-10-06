import { getImportExtensions } from '../extensions';
/**
 * ParserFactory - Factory for creating and selecting appropriate parsers
 *
 * Manages parser registration and selection based on file type and content.
 * Uses lazy initialization to avoid loading parsers until needed.
 */

import { BaseParser } from './BaseParser';
import { VendorFormat, ParseResult } from '../types';

/**
 * Factory for creating and selecting parsers
 */
export class ParserFactory {
  private parsers: BaseParser[] = [];
  private initialized = false;

  /**
   * Initialize parsers lazily to avoid loading js-yaml until needed.
   * Each parser is loaded independently so one failure doesn't break all parsing.
   */
  private async ensureInitialized(): Promise<void> {
    if (this.initialized) return;

    // Define parsers in priority order (most specific first)
    // 1. SplunkESCU: YAML with search: + tags.mitre_attack_id
    // 2. CrowdStrike CQL: YAML with cql: (completely unique field)
    // 3. SentinelOne: SentineLabs YAML/JSON or distinctive S1QL / PowerQuery fields
    // 4. Microsoft Sentinel: YAML with requiredDataConnectors / queryFrequency
    // 5. Elastic: TOML files (unique extension)
    // 6. Chronicle: YARA-L files (unique extension)
    // 7. Sigma: YAML with logsource: + detection: (catchall for YAML)
    const parserImports: Array<{ name: string; loader: () => Promise<BaseParser> }> = [
      { name: 'SplunkESCU', loader: async () => { const m = await import('./SplunkESCUParser'); return new m.SplunkESCUParser(); } },
      { name: 'CrowdStrikeCQL', loader: async () => { const m = await import('./CrowdStrikeCQLParser'); return new m.CrowdStrikeCQLParser(); } },
      { name: 'SentinelOne', loader: async () => { const m = await import('./SentinelOneParser'); return new m.SentinelOneParser(); } },
      { name: 'MicrosoftSentinel', loader: async () => { const m = await import('./MicrosoftSentinelParser'); return new m.MicrosoftSentinelParser(); } },
      { name: 'Elastic', loader: async () => { const m = await import('./ElasticParser'); return new m.ElasticParser(); } },
      { name: 'Chronicle', loader: async () => { const m = await import('./ChronicleParser'); return new m.ChronicleParser(); } },
      { name: 'Sigma', loader: async () => { const m = await import('./SigmaParser'); return new m.SigmaParser(); } },
    ];

    // Load each parser independently - one failure won't break others
    const results = await Promise.allSettled(
      parserImports.map(({ name, loader }) =>
        loader().catch((err) => {
          console.error(`Failed to load ${name} parser:`, err);
          throw err;
        })
      )
    );

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result.status === 'fulfilled') {
        this.registerParser(result.value);
      } else {
        console.warn(`Parser ${parserImports[i].name} failed to load and will be unavailable:`, result.reason);
      }
    }

    this.initialized = true;
  }

  /**
   * Synchronous initialization check (for methods that can't be async)
   */
  private ensureInitializedSync(): void {
    if (!this.initialized) {
      throw new Error('ParserFactory not initialized. Call initialize() first.');
    }
  }

  /**
   * Explicit initialization - call before using the factory
   */
  async initialize(): Promise<void> {
    await this.ensureInitialized();
  }

  /**
   * Register a parser with the factory
   */
  registerParser(parser: BaseParser): void {
    this.parsers.push(parser);
  }

  /**
   * Get all registered parsers
   */
  getParsers(): BaseParser[] {
    this.ensureInitializedSync();
    return [...this.parsers];
  }

  /**
   * Get a parser for a specific vendor format
   */
  getParserForFormat(format: VendorFormat): BaseParser | undefined {
    this.ensureInitializedSync();
    return this.parsers.find((p) => p.vendorFormat === format);
  }

  /**
   * Find the appropriate parser for a file (async version)
   * @param fileName - Name of the file
   * @param content - Optional content for format detection
   * @returns The parser that can handle this file, or undefined
   */
  async findParserAsync(fileName: string, content?: string): Promise<BaseParser | undefined> {
    await this.ensureInitialized();
    for (const parser of this.parsers) {
      if (parser.canParse(fileName, content)) {
        return parser;
      }
    }
    return undefined;
  }

  /**
   * Find the appropriate parser for a file (sync version - must be initialized first)
   * @param fileName - Name of the file
   * @param content - Optional content for format detection
   * @returns The parser that can handle this file, or undefined
   */
  findParser(fileName: string, content?: string): BaseParser | undefined {
    this.ensureInitializedSync();
    for (const parser of this.parsers) {
      if (parser.canParse(fileName, content)) {
        return parser;
      }
    }
    return undefined;
  }

  /**
   * Parse a file using the appropriate parser (async version)
   * @param content - File content
   * @param fileName - Name of the file
   * @param filePath - Optional full path
   * @returns ParseResult or null if no parser can handle the file
   */
  async parseAsync(content: string, fileName: string, filePath?: string): Promise<ParseResult | null> {
    await this.ensureInitialized();
    const parser = this.findParser(fileName, content);
    if (!parser) {
      return null;
    }
    return parser.parse(content, fileName, filePath);
  }

  /**
   * Parse a file using the appropriate parser (sync version - must be initialized first)
   * @param content - File content
   * @param fileName - Name of the file
   * @param filePath - Optional full path
   * @returns ParseResult or null if no parser can handle the file
   */
  parse(content: string, fileName: string, filePath?: string): ParseResult | null {
    this.ensureInitializedSync();
    const parser = this.findParser(fileName, content);
    if (!parser) {
      return null;
    }
    return parser.parse(content, fileName, filePath);
  }

  /**
   * Get all supported file extensions across all parsers
   */
  getSupportedExtensions(formats?: VendorFormat[]): string[] {
    // Return defaults if not initialized
    if (!this.initialized) {
      return getImportExtensions(formats);
    }
    const extensions = new Set<string>();
    for (const parser of this.parsers) {
      if (formats?.length && !formats.includes(parser.vendorFormat)) continue;
      for (const ext of parser.getSupportedExtensions()) {
        extensions.add(ext);
      }
    }
    return Array.from(extensions);
  }

  /**
   * Check if a file extension is supported by any parser
   */
  isExtensionSupported(fileName: string): boolean {
    const ext = this.getFileExtension(fileName);
    return this.getSupportedExtensions().includes(ext);
  }

  /**
   * Filter vendor formats to only include those with registered parsers
   */
  getAvailableFormats(): VendorFormat[] {
    if (!this.initialized) {
      return ['sigma', 'splunk_escu', 'elastic', 'kql', 'crowdstrike_cql', 'chronicle', 'sentinelone'];
    }
    return this.parsers.map((p) => p.vendorFormat);
  }

  /**
   * Extract file extension
   */
  private getFileExtension(fileName: string): string {
    const lastDot = fileName.lastIndexOf('.');
    if (lastDot === -1) return '';
    return fileName.slice(lastDot).toLowerCase();
  }

  /**
   * Check if factory is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }
}

// Singleton instance - use lazy initialization
export const parserFactory = new ParserFactory();
