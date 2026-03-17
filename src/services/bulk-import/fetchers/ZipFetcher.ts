/**
 * ZipFetcher - Extracts detection rules from ZIP archives
 *
 * Handles extraction of ZIP files containing detection rules.
 *
 * Required dependency: jszip
 * Install: bun add jszip
 */

import JSZip from 'jszip';
import { FetchedFile, FetchResult } from '../types';

/**
 * Options for ZIP extraction
 */
export interface ZipFetchOptions {
  /** Maximum total size to extract (bytes) */
  maxTotalSize?: number;
  /** Maximum size per file (bytes) */
  maxFileSize?: number;
  /** File extensions to include */
  extensions?: string[];
  /** Path patterns to include (regex) */
  includePatterns?: RegExp[];
  /** Path patterns to exclude (regex) */
  excludePatterns?: RegExp[];
  /** Progress callback */
  onProgress?: (current: number, total: number, fileName: string) => void;
}

const DEFAULT_OPTIONS: ZipFetchOptions = {
  maxTotalSize: 100 * 1024 * 1024, // 100MB
  maxFileSize: 10 * 1024 * 1024,   // 10MB per file
  extensions: ['.yml', '.yaml', '.json', '.toml', '.md', '.kql', '.yaral', '.yar'],
  excludePatterns: [
    /node_modules/i,
    /__pycache__/i,
    /\.git\//i,
    /test[s]?\//i,
    /example[s]?\//i,
    /template[s]?\//i,
    /deprecated\//i,
  ],
};

/**
 * Fetcher for ZIP archives
 */
export class ZipFetcher {
  /**
   * Extract files from a ZIP archive
   */
  async fetch(zipFile: File | Blob, options: ZipFetchOptions = {}): Promise<FetchResult> {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const files: FetchedFile[] = [];
    let totalSize = 0;

    try {
      // Load the ZIP file
      const zip = await JSZip.loadAsync(zipFile);

      // Get all file entries
      const entries = Object.entries(zip.files).filter(([_, file]) => !file.dir);
      const totalEntries = entries.length;

      let processedEntries = 0;

      for (const [path, file] of entries) {
        // Sanitize path — reject traversal sequences
        const normalizedPath = path.replace(/\\/g, '/');
        if (normalizedPath.includes('..') || normalizedPath.startsWith('/') || normalizedPath.includes('\0')) {
          console.warn(`Rejected suspicious path in ZIP: ${path}`);
          processedEntries++;
          continue;
        }

        // Check if we should include this file
        if (!this.shouldInclude(normalizedPath, opts)) {
          processedEntries++;
          continue;
        }

        // Check file size before extracting
        const uncompressedSize = (file as any)._data?.uncompressedSize ?? 0;
        const compressedSize = (file as any)._data?.compressedSize ?? 0;

        // Block suspicious compression ratios (zip bomb indicator)
        const SAFE_RATIO = 100;
        if (compressedSize > 0 && uncompressedSize > 0 && uncompressedSize / compressedSize > SAFE_RATIO) {
          console.warn(`Suspicious compression ratio for ${normalizedPath}: ${uncompressedSize}/${compressedSize}`);
          processedEntries++;
          continue;
        }

        if (uncompressedSize > opts.maxFileSize!) {
          console.warn(`Skipping ${normalizedPath}: file too large (${uncompressedSize} bytes)`);
          processedEntries++;
          continue;
        }

        // Check total size limit
        if (totalSize + uncompressedSize > opts.maxTotalSize!) {
          console.warn('Reached total size limit, stopping extraction');
          break;
        }

        try {
          // Extract file content
          const content = await file.async('string');
          const fileName = normalizedPath.split('/').pop() || normalizedPath;

          files.push({
            name: fileName,
            path: normalizedPath,
            content,
            size: content.length,
            lastModified: file.date?.toISOString(),
          });

          totalSize += content.length;
        } catch (extractError) {
          console.warn(`Failed to extract ${path}:`, extractError);
        }

        processedEntries++;

        // Report progress
        if (opts.onProgress) {
          opts.onProgress(processedEntries, totalEntries, path);
        }
      }

      return {
        success: true,
        files,
        totalSize,
      };
    } catch (error) {
      return {
        success: false,
        files: [],
        totalSize: 0,
        error: error instanceof Error ? error.message : 'Failed to extract ZIP file',
      };
    }
  }

  /**
   * Check if a file path should be included
   */
  private shouldInclude(path: string, options: ZipFetchOptions): boolean {
    // Check extension
    const ext = this.getExtension(path);
    if (options.extensions && !options.extensions.includes(ext)) {
      return false;
    }

    // Check exclude patterns
    if (options.excludePatterns) {
      for (const pattern of options.excludePatterns) {
        if (pattern.test(path)) {
          return false;
        }
      }
    }

    // Check include patterns (if specified, file must match at least one)
    if (options.includePatterns && options.includePatterns.length > 0) {
      let matches = false;
      for (const pattern of options.includePatterns) {
        if (pattern.test(path)) {
          matches = true;
          break;
        }
      }
      if (!matches) {
        return false;
      }
    }

    return true;
  }

  /**
   * Get file extension
   */
  private getExtension(path: string): string {
    const lastDot = path.lastIndexOf('.');
    if (lastDot === -1) return '';
    return path.slice(lastDot).toLowerCase();
  }

  /**
   * List files in a ZIP without extracting
   */
  async listFiles(zipFile: File | Blob): Promise<string[]> {
    try {
      const zip = await JSZip.loadAsync(zipFile);
      return Object.keys(zip.files).filter((path) => !zip.files[path].dir);
    } catch {
      return [];
    }
  }

  /**
   * Get ZIP file info without full extraction
   */
  async getInfo(zipFile: File | Blob): Promise<{
    totalFiles: number;
    totalSize: number;
    detectionFiles: number;
  }> {
    try {
      const zip = await JSZip.loadAsync(zipFile);
      const entries = Object.entries(zip.files).filter(([_, file]) => !file.dir);

      let totalSize = 0;
      let detectionFiles = 0;

      for (const [path, file] of entries) {
        const uncompressedSize = (file as any)._data?.uncompressedSize || 0;
        totalSize += uncompressedSize;

        const ext = this.getExtension(path);
        if (['.yml', '.yaml'].includes(ext)) {
          detectionFiles++;
        }
      }

      return {
        totalFiles: entries.length,
        totalSize,
        detectionFiles,
      };
    } catch {
      return { totalFiles: 0, totalSize: 0, detectionFiles: 0 };
    }
  }
}

// Singleton instance
export const zipFetcher = new ZipFetcher();
