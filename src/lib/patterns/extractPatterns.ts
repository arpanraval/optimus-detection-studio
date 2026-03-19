import { inferCategories } from './categoryHeuristics';

// Field extraction patterns
const FIELD_PATTERNS = [
  /(\w+)\s*[!=<>]=?\s*/g,
  /\|\s*where\s+(\w+)/gi,
  /selection[\w.]*\.(\w+):/g,
  /(?:Process|Endpoint|Filesystem|Network_Traffic|Authentication)\.(\w+)/g,
];

const EXCLUDED_FIELDS = new Set([
  'AND', 'OR', 'NOT', 'IN', 'LIKE', 'BY', 'AS', 'FROM', 'WHERE', 'SELECT',
  'true', 'false', 'null', 'count', 'sum', 'avg', 'min', 'max', 'values',
  'stats', 'table', 'index', 'if', 'else', 'then', 'when', 'case',
]);

function extractFields(queryText: string): string[] {
  const fields = new Set<string>();
  for (const pattern of FIELD_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;
    while ((match = regex.exec(queryText)) !== null) {
      const field = match[1];
      if (field && field.length > 2 && field.length < 50 && !EXCLUDED_FIELDS.has(field.toLowerCase())) {
        fields.add(field);
      }
    }
  }
  return Array.from(fields);
}

interface DetectionLike {
  id: string;
  mitreAttackIds?: string[];
  mitreTactics?: string[];
  logSources?: string[];
  platforms?: string[];
  queries?: Array<{ language: string; query: string; isPrimary?: boolean }>;
  queryLanguage?: string;
  detectionQuery?: string;
  source?: string;
  severity?: string;
}

export interface ExtractedPattern {
  user_id: string;
  detection_id: string;
  technique_ids: string[];
  tactics: string[];
  log_sources: string[];
  platforms: string[];
  query_languages: string[];
  source: string;
  severity: string;
  fields_used: string[];
  query_snippet: string | null;
  detection_categories: string[];
}

export function extractPatternFromDetection(detection: DetectionLike, userId: string): ExtractedPattern {
  const queries = (detection.queries || []) as Array<{ language: string; query: string; isPrimary?: boolean }>;
  const primaryQuery = queries.find(q => q.isPrimary) || queries[0];
  const allQueryTexts = queries.map(q => q.query).filter(Boolean);

  // Fallback to legacy single query
  if (allQueryTexts.length === 0 && detection.detectionQuery) {
    allQueryTexts.push(detection.detectionQuery);
  }

  const queryLanguages = [...new Set(queries.map(q => q.language).filter(Boolean))];
  if (queryLanguages.length === 0 && detection.queryLanguage) {
    queryLanguages.push(detection.queryLanguage);
  }

  const fields = extractFields(allQueryTexts.join('\n'));
  const categories = inferCategories(detection.logSources || [], allQueryTexts);

  return {
    user_id: userId,
    detection_id: detection.id,
    technique_ids: detection.mitreAttackIds || [],
    tactics: detection.mitreTactics || [],
    log_sources: detection.logSources || [],
    platforms: detection.platforms || [],
    query_languages: queryLanguages.length > 0 ? queryLanguages : ['unknown'],
    source: detection.source || 'custom',
    severity: detection.severity || 'Medium',
    fields_used: fields,
    query_snippet: primaryQuery?.query?.substring(0, 300) || detection.detectionQuery?.substring(0, 300) || null,
    detection_categories: categories,
  };
}
