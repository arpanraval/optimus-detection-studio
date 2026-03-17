/**
 * GitHubFetcher - Fetches detection rules from GitHub repositories
 *
 * Two fetch strategies:
 * 1. Tree-based (preferred): Uses Git Trees API (1 API call) to get file list,
 *    then downloads from raw.githubusercontent.com (no API rate limit).
 * 2. Contents API (legacy fallback): Recursively walks directories via Contents API.
 *    Costs 1 API call per directory - impractical for large repos without auth.
 */

import { FetchedFile, FetchResult, ReconReport, RateLimitInfo } from '../types';

/**
 * Options for GitHub fetching
 */
export interface GitHubFetchOptions {
  /** GitHub personal access token (for private repos or higher rate limits) */
  token?: string;
  /** Branch to fetch from (default: default branch) */
  branch?: string;
  /** Subdirectory path to fetch from (e.g., 'rules/windows') */
  path?: string;
  /** Maximum files to fetch */
  maxFiles?: number;
  /** File extensions to include */
  extensions?: string[];
  /** Path patterns to exclude (regex) - applied to DIRECTORY segments only */
  excludePatterns?: RegExp[];
  /** Progress callback */
  onProgress?: (current: number, total: number, fileName: string) => void;
  /** Rate limit callback (legacy - fires when remaining < 10) */
  onRateLimit?: (remaining: number, resetTime: Date) => void;
  /** Enhanced rate limit callback - fires on every API response */
  onRateLimitUpdate?: (info: RateLimitInfo) => void;
  /** Fires when entering rate limit wait loop */
  onRateLimitWait?: (waitMs: number, resetTime: Date) => void;
}

interface GitHubRepoInfo {
  owner: string;
  repo: string;
  defaultBranch: string;
}

const SUPPORTED_EXTENSIONS = ['.yml', '.yaml', '.json', '.toml', '.yaral', '.yar'];

/** Patterns to exclude - matched against directory path segments only */
const DIRECTORY_EXCLUDE_PATTERNS = [
  /^node_modules$/i,
  /^__pycache__$/i,
  /^\.git$/i,
  /^tests?$/i,
  /^deprecated$/i,
];

const DEFAULT_OPTIONS: GitHubFetchOptions = {
  maxFiles: 10000,
  extensions: SUPPORTED_EXTENSIONS,
  excludePatterns: DIRECTORY_EXCLUDE_PATTERNS,
};

/** Concurrency limit for raw file downloads */
const DOWNLOAD_CONCURRENCY = 10;

/**
 * Fetcher for GitHub repositories
 */
export class GitHubFetcher {
  private rateLimitRemaining = 60;
  private rateLimitLimit = 60;
  private rateLimitReset: Date | null = null;
  private authenticated = false;
  private aborted = false;

  /**
   * Abort current operation
   */
  abort(): void {
    this.aborted = true;
  }

  /**
   * Reset abort flag
   */
  resetAbort(): void {
    this.aborted = false;
  }

  /**
   * Parse a GitHub URL into owner/repo components
   */
  parseUrl(url: string): { owner: string; repo: string; path?: string; branch?: string } | null {
    try {
      const patterns = [
        /github\.com\/([^\/]+)\/([^\/]+?)(?:\.git)?(?:\/tree\/([^\/]+)(?:\/(.+))?)?$/,
        /github\.com\/([^\/]+)\/([^\/]+?)(?:\.git)?$/,
      ];

      for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match) {
          return {
            owner: match[1],
            repo: match[2].replace(/\.git$/, ''),
            branch: match[3] ? decodeURIComponent(match[3]) : undefined,
            path: match[4] ? decodeURIComponent(match[4]) : undefined,
          };
        }
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Get repository info including default branch
   */
  async getRepoInfo(owner: string, repo: string, token?: string): Promise<GitHubRepoInfo | null> {
    try {
      const headers: HeadersInit = {
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'Detection-Studio-Importer',
      };

      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }

      const response = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
        headers,
      });

      this.updateRateLimits(response);

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error(`Repository not found: ${owner}/${repo}`);
        }
        if (response.status === 403) {
          throw new Error('Rate limited. Please wait or provide a GitHub token.');
        }
        throw new Error(`GitHub API error: ${response.status}`);
      }

      const data = await response.json();

      return {
        owner,
        repo,
        defaultBranch: data.default_branch,
      };
    } catch (error) {
      console.error('Failed to get repo info:', error);
      return null;
    }
  }

  /**
   * Fetch files from a GitHub repository.
   * Uses Git Trees API + raw downloads (2 API calls total, unlimited raw downloads).
   */
  async fetch(url: string, options: GitHubFetchOptions = {}): Promise<FetchResult> {
    const opts = { ...DEFAULT_OPTIONS, ...options };

    try {
      const parsed = this.parseUrl(url);
      if (!parsed) {
        return {
          success: false,
          files: [],
          totalSize: 0,
          error: 'Invalid GitHub URL. Expected format: https://github.com/owner/repo',
        };
      }

      const { owner, repo, path: urlPath, branch: urlBranch } = parsed;

      // Get repo info (1 API call)
      const repoInfo = await this.getRepoInfo(owner, repo, opts.token);
      if (!repoInfo) {
        return {
          success: false,
          files: [],
          totalSize: 0,
          error: `Could not access repository: ${owner}/${repo}`,
        };
      }

      const branch = opts.branch || urlBranch || repoInfo.defaultBranch;
      const basePath = opts.path || urlPath || '';

      // Use Tree API to get all file paths (1 API call)
      const filePaths = await this.getFilePathsFromTree(owner, repo, branch, basePath, opts);

      if (filePaths.length === 0) {
        return {
          success: true,
          files: [],
          totalSize: 0,
        };
      }

      // Download files from raw.githubusercontent.com (no API rate limit)
      const files = await this.downloadFilesFromRaw(
        owner, repo, branch, filePaths, opts
      );

      const totalSize = files.reduce((sum, f) => sum + f.size, 0);

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
        error: error instanceof Error ? error.message : 'Failed to fetch from GitHub',
      };
    }
  }

  /**
   * Get matching file paths using Git Trees API (1 API call)
   */
  private async getFilePathsFromTree(
    owner: string,
    repo: string,
    branch: string,
    basePath: string,
    options: GitHubFetchOptions
  ): Promise<string[]> {
    const headers: HeadersInit = {
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'Detection-Studio-Importer',
    };

    if (options.token) {
      headers.Authorization = `Bearer ${options.token}`;
    }

    const treeUrl = `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`;
    const response = await fetch(treeUrl, { headers });
    this.updateRateLimits(response, options);

    if (!response.ok) {
      throw new Error(`GitHub API error fetching tree: ${response.status}`);
    }

    const data = await response.json();
    const allBlobs = (data.tree || []).filter((entry: any) => entry.type === 'blob');
    const pathPrefix = basePath ? basePath + '/' : '';

    // Filter to path, extensions, and exclude patterns
    const matching = allBlobs
      .filter((entry: any) => {
        const filePath = entry.path as string;

        // Must be in the target path
        if (pathPrefix && !filePath.startsWith(pathPrefix)) return false;

        // Must have supported extension
        const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase();
        if (options.extensions && !options.extensions.includes(ext)) return false;

        // Check directory exclude patterns against each directory segment
        if (options.excludePatterns) {
          const segments = filePath.split('/');
          // Check all segments except the filename (last segment)
          for (let i = 0; i < segments.length - 1; i++) {
            for (const pattern of options.excludePatterns) {
              if (pattern.test(segments[i])) return false;
            }
          }
        }

        return true;
      })
      .map((entry: any) => entry.path as string);

    // Respect maxFiles limit
    return matching.slice(0, options.maxFiles || 10000);
  }

  /**
   * Download files from raw.githubusercontent.com in parallel batches.
   * These downloads do NOT count against the GitHub API rate limit.
   */
  private async downloadFilesFromRaw(
    owner: string,
    repo: string,
    branch: string,
    filePaths: string[],
    options: GitHubFetchOptions
  ): Promise<FetchedFile[]> {
    const files: FetchedFile[] = [];
    const total = filePaths.length;

    // Process in concurrent batches
    for (let i = 0; i < filePaths.length; i += DOWNLOAD_CONCURRENCY) {
      if (this.aborted) break;

      const batch = filePaths.slice(i, i + DOWNLOAD_CONCURRENCY);
      const promises = batch.map(async (filePath) => {
        const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${filePath}`;
        try {
          const headers: HeadersInit = {
            'User-Agent': 'Detection-Studio-Importer',
          };
          // Token can help with private repos on raw CDN too
          if (options.token) {
            headers.Authorization = `Bearer ${options.token}`;
          }

          const response = await fetch(rawUrl, { headers });
          if (!response.ok) {
            console.warn(`Failed to download ${filePath}: ${response.status}`);
            return null;
          }

          const content = await response.text();
          const name = filePath.split('/').pop() || filePath;

          return {
            name,
            path: filePath,
            content,
            size: content.length,
          } as FetchedFile;
        } catch (error) {
          console.warn(`Failed to download ${filePath}:`, error);
          return null;
        }
      });

      const results = await Promise.all(promises);
      for (const result of results) {
        if (result) {
          files.push(result);
        }
      }

      // Report progress
      if (options.onProgress) {
        options.onProgress(files.length, total, batch[batch.length - 1] || '');
      }
    }

    return files;
  }

  /**
   * Scan a GitHub repository to produce a ReconReport (uses Trees API - 1 API call)
   */
  async scanRepository(url: string, options?: { token?: string }): Promise<ReconReport> {
    const parsed = this.parseUrl(url);
    if (!parsed) {
      return {
        source: 'github',
        totalFilesInPath: 0,
        matchingFiles: 0,
        estimatedRules: 0,
        filePaths: [],
        existingLibraryCount: 0,
        warnings: ['Invalid GitHub URL'],
      };
    }

    const { owner, repo, path: urlPath } = parsed;
    const token = options?.token;

    // Get repo info (1 API call)
    const repoInfo = await this.getRepoInfo(owner, repo, token);
    if (!repoInfo) {
      return {
        source: 'github',
        totalFilesInPath: 0,
        matchingFiles: 0,
        estimatedRules: 0,
        filePaths: [],
        existingLibraryCount: 0,
        warnings: [`Could not access repository: ${owner}/${repo}`],
      };
    }

    const branch = parsed.branch || repoInfo.defaultBranch;

    // Use Git Trees API for single-call file tree (1 API call)
    const headers: HeadersInit = {
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'Detection-Studio-Importer',
    };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const treeUrl = `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`;
    const response = await fetch(treeUrl, { headers });
    this.updateRateLimits(response);

    if (!response.ok) {
      return {
        source: 'github',
        repoInfo: { owner, repo, defaultBranch: repoInfo.defaultBranch },
        totalFilesInPath: 0,
        matchingFiles: 0,
        estimatedRules: 0,
        filePaths: [],
        existingLibraryCount: 0,
        rateLimitInfo: this.buildRateLimitInfo(0),
        warnings: [`GitHub API error: ${response.status}`],
      };
    }

    const data = await response.json();
    const warnings: string[] = [];

    if (data.truncated) {
      warnings.push('Repository has over 100,000 files. Tree was truncated - counts may be approximate.');
    }

    const allBlobs = (data.tree || []).filter((entry: any) => entry.type === 'blob');
    const pathPrefix = urlPath ? urlPath + '/' : '';

    // Filter to path
    const inPath = pathPrefix
      ? allBlobs.filter((entry: any) => (entry.path as string).startsWith(pathPrefix))
      : allBlobs;

    // Filter to supported extensions and non-excluded directories
    const matchingFiles = inPath.filter((entry: any) => {
      const filePath = entry.path as string;
      const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase();
      if (!SUPPORTED_EXTENSIONS.includes(ext)) return false;

      // Check directory segments against exclude patterns
      const segments = filePath.split('/');
      for (let i = 0; i < segments.length - 1; i++) {
        for (const pattern of DIRECTORY_EXCLUDE_PATTERNS) {
          if (pattern.test(segments[i])) return false;
        }
      }

      return true;
    });

    // Estimate API calls: with tree-based fetch, only 2 API calls needed (repo info + tree)
    // Raw downloads don't count against API limit
    const estimatedApiCalls = 2;
    const rateLimitInfo = this.buildRateLimitInfo(estimatedApiCalls);

    return {
      source: 'github',
      repoInfo: { owner, repo, defaultBranch: repoInfo.defaultBranch },
      totalFilesInPath: inPath.length,
      matchingFiles: matchingFiles.length,
      estimatedRules: matchingFiles.length,
      filePaths: matchingFiles.map((f: any) => f.path as string),
      existingLibraryCount: 0, // Set by orchestrator
      rateLimitInfo,
      warnings,
    };
  }

  /**
   * Build a RateLimitInfo object from current state
   */
  private buildRateLimitInfo(estimatedApiCalls: number): RateLimitInfo {
    return {
      remaining: this.rateLimitRemaining,
      limit: this.rateLimitLimit,
      resetTime: this.rateLimitReset,
      authenticated: this.authenticated,
      estimatedApiCalls,
      willExceedLimit: estimatedApiCalls > this.rateLimitRemaining,
      isWaiting: false,
      waitingUntil: null,
    };
  }

  /**
   * Update rate limit tracking from response headers
   */
  private updateRateLimits(response: Response, options?: GitHubFetchOptions): void {
    const remaining = response.headers.get('X-RateLimit-Remaining');
    const limit = response.headers.get('X-RateLimit-Limit');
    const reset = response.headers.get('X-RateLimit-Reset');

    if (remaining) {
      this.rateLimitRemaining = parseInt(remaining, 10);
    }

    if (limit) {
      this.rateLimitLimit = parseInt(limit, 10);
      this.authenticated = this.rateLimitLimit > 60;
    }

    if (reset) {
      this.rateLimitReset = new Date(parseInt(reset, 10) * 1000);
    }

    // Fire enhanced callback on every response
    if (options?.onRateLimitUpdate) {
      options.onRateLimitUpdate(this.buildRateLimitInfo(0));
    }
  }

  /**
   * Get current rate limit status
   */
  getRateLimitStatus(): { remaining: number; resetTime: Date | null } {
    return {
      remaining: this.rateLimitRemaining,
      resetTime: this.rateLimitReset,
    };
  }

  /**
   * Validate a GitHub URL
   */
  validateUrl(url: string): { valid: boolean; error?: string } {
    const parsed = this.parseUrl(url);

    if (!parsed) {
      return {
        valid: false,
        error: 'Invalid GitHub URL. Expected format: https://github.com/owner/repo',
      };
    }

    return { valid: true };
  }
}

// Singleton instance
export const githubFetcher = new GitHubFetcher();
