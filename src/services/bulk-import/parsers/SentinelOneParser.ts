import * as yaml from 'js-yaml';
import { BaseParser } from './BaseParser';
import type { ParsedRule, ParseResult, VendorFormat } from '../types';
import { detectSentinelOneLanguage, hasPowerQueryPipeline, type SentinelOneLanguage } from '@/lib/sentinelOne';
import { normalizeQueryLanguage } from '@/lib/queryLanguage';

/** Imports single rules in the SentineLabs YAML schema, JSON equivalents, or raw query files. */
export class SentinelOneParser extends BaseParser {
  readonly vendorFormat: VendorFormat = 'sentinelone';

  private isStructured(fileName: string): boolean {
    return ['.yml', '.yaml', '.json'].includes(this.getFileExtension(fileName));
  }

  private cachedRule?: { content: string; fileName: string; value: Record<string, unknown> | null };

  private readRule(content: string, fileName: string): Record<string, unknown> | null {
    if (this.cachedRule?.content === content && this.cachedRule.fileName === fileName) return this.cachedRule.value;
    const value: unknown = this.getFileExtension(fileName) === '.json' ? JSON.parse(content) : yaml.load(content);
    const rule =
      value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
    this.cachedRule = { content, fileName, value: rule };
    return rule;
  }

  private isOtherVendor(rule: Record<string, unknown>): boolean {
    const explicit = this.getString(rule, 'queryLanguage') || this.getString(rule, 'language');
    if (explicit && !this.isSentinelLanguage(normalizeQueryLanguage(explicit))) return true;
    const vendor = this.getString(rule, 'vendor');
    if (vendor && !/^sentinel\s?one$/i.test(vendor)) return true;
    return [
      'detection',
      'logsource',
      'cql',
      'search',
      'requiredDataConnectors',
      'queryFrequency',
      'entityMappings',
    ].some((key) => key in rule);
  }

  private isSentinelLanguage(language: string | null): language is SentinelOneLanguage {
    return language === 'S1QL' || language === 'S1QL 2.0' || language === 'PowerQuery';
  }

  private declaredLanguage(rule: Record<string, unknown>): SentinelOneLanguage | null {
    const language = normalizeQueryLanguage(this.getString(rule, 'queryLanguage') || this.getString(rule, 'language'));
    if (this.isSentinelLanguage(language)) return language;
    const version = String(rule['s1ql supported version'] ?? '').trim();
    if (/^1(?:\.0)?$/.test(version)) return 'S1QL';
    if (/^2(?:\.0)?$/.test(version)) return 'S1QL 2.0';
    return null;
  }

  private identifiesVendor(rule: Record<string, unknown>): boolean {
    return (
      's1ql supported version' in rule ||
      's1ql' in rule ||
      !!this.declaredLanguage(rule) ||
      /^sentinel\s?one$/i.test(this.getString(rule, 'vendor'))
    );
  }

  canParse(fileName: string, content?: string): boolean {
    const ext = this.getFileExtension(fileName);
    if (!this.getSupportedExtensions().includes(ext)) return false;
    const dedicated = ['.s1ql', '.powerquery', '.pq'].includes(ext);
    if (!content) return dedicated;
    if (!this.isStructured(fileName)) return detectSentinelOneLanguage(content, dedicated) !== null;
    // Cheap candidate sniff before decoding; retain just the last decoded rule for parse().
    if (!/['"]?(?:query|s1ql|s1ql supported version)['"]?\s*:/i.test(content)) return false;
    if (
      !/sentinel\s?one|s1ql|powerquery|\b(?:SrcProc\w+|TgtProc\w+|ProcessCmd|ProcessGroupId|AgentOS|FileFullName|FileIsExecutable|DNSRequest)\b|\b(?:(?:src|tgt)\.process\.|tgt\.file\.|endpoint\.os\.|agent\.uuid|event\.login\.|registry\.keyPath|dns\.request|i\.scheme)/i.test(
        content,
      )
    )
      return false;
    try {
      const rule = this.readRule(content, fileName);
      if (!rule || this.isOtherVendor(rule)) return false;
      return (
        this.identifiesVendor(rule) ||
        (typeof rule.query === 'string' && detectSentinelOneLanguage(rule.query) !== null)
      );
    } catch {
      return /^s1ql(?: supported version)?\s*:/im.test(content);
    }
  }

  parse(content: string, fileName: string, filePath?: string): ParseResult {
    const started = performance.now();
    const ext = this.getFileExtension(fileName);
    if (!this.getSupportedExtensions().includes(ext)) {
      return this.createErrorResult('UNSUPPORTED_FORMAT', 'Unsupported SentinelOne file extension');
    }
    let metadata: Record<string, unknown> = {};
    if (this.isStructured(fileName)) {
      try {
        const value = this.readRule(content, fileName);
        if (!value) return this.createErrorResult('INVALID_STRUCTURE', 'Expected one SentinelOne rule object');
        metadata = value;
      } catch (error) {
        return this.createErrorResult(
          this.getFileExtension(fileName) === '.json' ? 'INVALID_STRUCTURE' : 'INVALID_YAML',
          `Cannot parse SentinelOne rule: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      if (this.isOtherVendor(metadata)) {
        return this.createErrorResult('UNSUPPORTED_FORMAT', 'This rule has another vendor’s format');
      }
    }
    const rawQuery = this.isStructured(fileName) ? (metadata.query ?? metadata.s1ql) : content;
    if (typeof rawQuery !== 'string' || !rawQuery.trim()) {
      return this.createErrorResult('MISSING_REQUIRED_FIELD', 'SentinelOne rule requires a non-empty query string');
    }
    const query = rawQuery.trim();
    const knownVendor = ['.s1ql', '.pq', '.powerquery'].includes(ext) || this.identifiesVendor(metadata);
    const inferred = detectSentinelOneLanguage(query, knownVendor);
    if (!inferred)
      return this.createErrorResult('UNSUPPORTED_FORMAT', 'Content is not an identifiable SentinelOne query');
    const declared = this.declaredLanguage(metadata);
    if (hasPowerQueryPipeline(query) && declared && declared !== 'PowerQuery') {
      return this.createErrorResult('INVALID_STRUCTURE', 'A boolean S1QL dialect cannot contain a PowerQuery pipeline');
    }
    const queryLanguage: SentinelOneLanguage =
      declared ?? (['.pq', '.powerquery'].includes(ext) ? 'PowerQuery' : inferred);
    const warnings: string[] = [];
    if (declared && declared !== inferred && declared !== 'PowerQuery') {
      warnings.push(`Declared dialect ${declared} differs from the identified ${inferred} syntax`);
    }
    const title = this.normalizeText(metadata.title ?? metadata.name) || this.generateSourceId(fileName);
    const tags = this.getStringArray(metadata, 'tags');
    // SentineLabs uses mitre.T#### tags; normalize only the extraction input, preserving original tags.
    const mitre = this.extractMitreFromTags(tags.map((tag) => tag.replace(/^mitre\./i, 'attack.')));
    const description = this.getString(metadata, 'description').trim();
    const rule: ParsedRule = {
      sourceId: this.getString(metadata, 'id') || this.generateSourceId(filePath ?? fileName),
      sourceFormat: this.vendorFormat,
      sourceFileName: fileName,
      sourceFilePath: filePath,
      title,
      description,
      author: this.getString(metadata, 'author'),
      status: this.getString(metadata, 'status', 'experimental'),
      level: this.getString(metadata, 'level') || this.getString(metadata, 'severity', 'medium'),
      date: this.parseDate(metadata.created_date ?? metadata.date),
      modified: this.parseDate(metadata.last_update ?? metadata.modified),
      query,
      queryLanguage,
      mitreAttackIds: mitre.techniqueIds,
      mitreTactics: mitre.tactics,
      platforms: [
        ...new Set(this.getStringArray(metadata, 'operating_system').flatMap((os) => this.mapProductToPlatform(os))),
      ],
      dataSources: ['SentinelOne EDR'],
      tags,
      references: this.getStringArray(metadata, 'references'),
      falsePositives: this.getStringArray(metadata, 'false_positives'),
      cves: this.extractCVEs(tags, description),
      rawContent: content,
      rawRule: metadata,
    };
    return this.createSuccessResult(rule, warnings, performance.now() - started);
  }
}
