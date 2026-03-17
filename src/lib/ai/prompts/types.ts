/**
 * TypeScript types for AI prompt management.
 *
 * These types define the structure of prompts and their metadata
 * for consistent handling across the application.
 */

/**
 * Metadata about a prompt template.
 */
export interface PromptMetadata {
  /** Unique identifier for the prompt */
  name: string;
  /** Human-readable description */
  description: string;
  /** Version string for tracking changes */
  version: string;
  /** Placeholders that need to be filled in the template */
  placeholders: string[];
  /** Expected output format */
  outputFormat: 'json' | 'text' | 'markdown';
  /** Estimated token count for the template (without content) */
  estimatedTokens?: number;
}

/**
 * A prompt template with its metadata.
 */
export interface PromptTemplate {
  /** The raw template string with placeholders like {{CONTENT}} */
  template: string;
  /** Metadata about this prompt */
  metadata: PromptMetadata;
}

/**
 * Collection of all threat intelligence prompt templates.
 */
export interface ThreatIntelPromptTemplates {
  /** System instruction for the AI analyst role */
  systemInstruction: string;
  /** Template for extracting report summary */
  summary: string;
  /** Template for classifying the threat type */
  classification: string;
  /** Template for extracting TTPs */
  ttps: string;
  /** Template for extracting IoCs and detection rules */
  iocsAndRules: string;
}

/**
 * Parameters for building the summary extraction prompt.
 */
export interface SummaryPromptParams {
  /** The report content to analyze */
  content: string;
  /** Maximum characters to include (default: 30000) */
  maxContentLength?: number;
}

/**
 * Parameters for building the classification prompt.
 */
export interface ClassificationPromptParams {
  /** The report content to analyze */
  content: string;
  /** Previously extracted summary as JSON string */
  summary: string;
  /** Maximum characters to include (default: 15000) */
  maxContentLength?: number;
}

/**
 * Parameters for building the TTPs extraction prompt.
 */
export interface TTPsPromptParams {
  /** The report content to analyze */
  content: string;
  /** Maximum characters to include (default: 50000) */
  maxContentLength?: number;
}

/**
 * Parameters for building the IoCs and rules extraction prompt.
 */
export interface IoCsAndRulesPromptParams {
  /** The report content to analyze */
  content: string;
  /** Source URL of the report (for context) */
  sourceUrl: string;
}

/**
 * Standard response format for summary extraction.
 */
export interface SummaryExtractionResponse {
  title: string;
  publishDate: string | null;
  author: string | null;
  organization: string | null;
  executiveSummary: string;
  keyFindings: string[];
  threatLevel: 'Critical' | 'High' | 'Medium' | 'Low' | 'Informational';
  targetedIndustries: string[];
  targetedRegions: string[];
  attackTimeline: {
    firstSeen: string | null;
    lastSeen: string | null;
    duration: string | null;
  };
}

/**
 * Standard response format for classification extraction.
 */
export interface ClassificationExtractionResponse {
  primaryType: string;
  secondaryTypes: string[];
  confidence: 'high' | 'medium' | 'low';
  reasoning: string;
}

/**
 * Standard response format for TTP extraction.
 */
export interface TTPExtractionResponse {
  ttps: Array<{
    mitreId: string;
    techniqueName: string;
    tacticName: string;
    tacticId: string;
    sourceType: 'explicit' | 'contextual';
    confidence: 'high' | 'medium' | 'low';
    evidence: string;
    explanation: string;
    isSubTechnique: boolean;
    parentTechniqueId?: string;
  }>;
}

/**
 * Standard response format for IoC extraction.
 */
export interface IoCExtractionResponse {
  iocs: {
    ipv4_addresses: Array<{ value: string; context: string; potential_false_positive: boolean }>;
    ipv6_addresses: Array<{ value: string; context: string; potential_false_positive: boolean }>;
    domains: Array<{ value: string; context: string; potential_false_positive: boolean }>;
    urls: Array<{ value: string; context: string; potential_false_positive: boolean }>;
    email_addresses: Array<{ value: string; context: string; potential_false_positive: boolean }>;
    asn: Array<{ value: string; context: string; potential_false_positive: boolean }>;
    cidr_ranges: Array<{ value: string; context: string; potential_false_positive: boolean }>;
    user_agents: Array<{ value: string; context: string; potential_false_positive: boolean }>;
    ja3_fingerprints: Array<{ value: string; context: string; potential_false_positive: boolean }>;
    ja3s_fingerprints: Array<{ value: string; context: string; potential_false_positive: boolean }>;
    ssl_certificates: Array<{ value: string; context: string; potential_false_positive: boolean }>;
    file_hashes: Array<{ value: string; hash_type: string; context: string; potential_false_positive: boolean }>;
    ssdeep_hashes: Array<{ value: string; context: string; potential_false_positive: boolean }>;
    imphashes: Array<{ value: string; context: string; potential_false_positive: boolean }>;
    file_paths: Array<{ value: string; context: string; potential_false_positive: boolean }>;
    file_names: Array<{ value: string; context: string; potential_false_positive: boolean }>;
    pdb_paths: Array<{ value: string; context: string; potential_false_positive: boolean }>;
    registry_keys: Array<{ value: string; context: string; potential_false_positive: boolean }>;
    mutexes: Array<{ value: string; context: string; potential_false_positive: boolean }>;
    named_pipes: Array<{ value: string; context: string; potential_false_positive: boolean }>;
    service_names: Array<{ value: string; context: string; potential_false_positive: boolean }>;
    scheduled_tasks: Array<{ value: string; context: string; potential_false_positive: boolean }>;
    process_names: Array<{ value: string; context: string; potential_false_positive: boolean }>;
    command_lines: Array<{ value: string; context: string; potential_false_positive: boolean }>;
    cves: Array<{ value: string; context: string; potential_false_positive: boolean }>;
    crypto_addresses: Array<{ value: string; currency_type: string; context: string; potential_false_positive: boolean }>;
    android_packages: Array<{ value: string; context: string; potential_false_positive: boolean }>;
    ios_bundles: Array<{ value: string; context: string; potential_false_positive: boolean }>;
    mac_addresses: Array<{ value: string; context: string; potential_false_positive: boolean }>;
    ssh_keys: Array<{ value: string; context: string; potential_false_positive: boolean }>;
  };
  detection_queries: Array<{
    query_type: string;
    query_content: string;
    description: string;
    context: string;
  }>;
  summary: {
    total_iocs_extracted: number;
    total_queries_extracted: number;
    notes: string;
  };
}
