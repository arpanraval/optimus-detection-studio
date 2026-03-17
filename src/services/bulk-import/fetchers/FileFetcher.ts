/**
 * FileFetcher - Handles direct file uploads
 *
 * Processes files uploaded directly by the user.
 */

import { FetchedFile, FetchResult } from '../types';

/**
 * Options for file fetching
 */
export interface FileFetchOptions {
  /** Maximum size per file (bytes) */
  maxFileSize?: number;
  /** File extensions to include */
  extensions?: string[];
  /** Progress callback */
  onProgress?: (current: number, total: number, fileName: string) => void;
}

const DEFAULT_OPTIONS: FileFetchOptions = {
  maxFileSize: 10 * 1024 * 1024, // 10MB per file
  extensions: ['.yml', '.yaml', '.json', '.toml', '.md', '.kql', '.yaral', '.yar'],
};

/**
 * Fetcher for direct file uploads
 */
export class FileFetcher {
  /**
   * Process uploaded files
   */
  async fetch(files: File[], options: FileFetchOptions = {}): Promise<FetchResult> {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const fetchedFiles: FetchedFile[] = [];
    let totalSize = 0;
    const errors: string[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];

      // Report progress
      if (opts.onProgress) {
        opts.onProgress(i + 1, files.length, file.name);
      }

      // Check extension
      const ext = this.getExtension(file.name);
      if (opts.extensions && !opts.extensions.includes(ext)) {
        errors.push(`Skipped ${file.name}: unsupported file type`);
        continue;
      }

      // Check file size
      if (file.size > opts.maxFileSize!) {
        errors.push(`Skipped ${file.name}: file too large (max ${opts.maxFileSize! / 1024 / 1024}MB)`);
        continue;
      }

      try {
        // Read file content
        const content = await this.readFileAsText(file);

        fetchedFiles.push({
          name: file.name,
          path: file.name,
          content,
          size: content.length,
          lastModified: new Date(file.lastModified).toISOString(),
        });

        totalSize += content.length;
      } catch (error) {
        errors.push(`Failed to read ${file.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    return {
      success: fetchedFiles.length > 0,
      files: fetchedFiles,
      totalSize,
      error: errors.length > 0 ? errors.join('\n') : undefined,
    };
  }

  /**
   * Read a file as text
   */
  private readFileAsText(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = () => {
        if (typeof reader.result === 'string') {
          resolve(reader.result);
        } else {
          reject(new Error('Failed to read file as text'));
        }
      };

      reader.onerror = () => {
        reject(new Error('Failed to read file'));
      };

      reader.readAsText(file);
    });
  }

  /**
   * Get file extension
   */
  private getExtension(fileName: string): string {
    const lastDot = fileName.lastIndexOf('.');
    if (lastDot === -1) return '';
    return fileName.slice(lastDot).toLowerCase();
  }

  /**
   * Validate file before processing
   */
  validateFile(file: File, options: FileFetchOptions = {}): { valid: boolean; error?: string } {
    const opts = { ...DEFAULT_OPTIONS, ...options };

    // Check extension
    const ext = this.getExtension(file.name);
    if (opts.extensions && !opts.extensions.includes(ext)) {
      return { valid: false, error: `Unsupported file type: ${ext}` };
    }

    // Check size
    if (file.size > opts.maxFileSize!) {
      return {
        valid: false,
        error: `File too large: ${(file.size / 1024 / 1024).toFixed(2)}MB (max ${opts.maxFileSize! / 1024 / 1024}MB)`,
      };
    }

    return { valid: true };
  }

  /**
   * Get summary of files
   */
  getFilesSummary(files: File[]): {
    total: number;
    totalSize: number;
    byExtension: Record<string, number>;
  } {
    const byExtension: Record<string, number> = {};
    let totalSize = 0;

    for (const file of files) {
      totalSize += file.size;
      const ext = this.getExtension(file.name) || 'no extension';
      byExtension[ext] = (byExtension[ext] || 0) + 1;
    }

    return {
      total: files.length,
      totalSize,
      byExtension,
    };
  }
}

// Singleton instance
export const fileFetcher = new FileFetcher();
