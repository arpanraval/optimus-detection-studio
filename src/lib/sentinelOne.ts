import { tokenizeSentinelOne } from './sentinelOneTokens';

/** Identification only, not syntax validation or a SentinelOne execution client. */
export type SentinelOneLanguage = 'S1QL' | 'S1QL 2.0' | 'PowerQuery';

export function hasPowerQueryPipeline(query: string): boolean {
  return tokenizeSentinelOne(query)?.some((token) => token.kind === 'syntax' && token.text === '|') ?? false;
}

/** Ambiguous columns require an explicit SentinelOne file extension or metadata declaration. */
export function detectSentinelOneLanguage(query: string, knownSentinelOne = false): SentinelOneLanguage | null {
  const tokens = tokenizeSentinelOne(query)?.filter((token) => token.kind !== 'space' && token.kind !== 'comment');
  if (!tokens?.length) return null;
  const structure = tokens.map((token) => (token.kind === 'literal' ? 'VALUE' : token.text)).join(' ');
  // Other languages can reference the same telemetry columns. Their grammar takes precedence.
  if (
    /^(?:select\b|let\b|(?:process|file|sequence)\s+(?:where|by)\b)|\b(?:index|sourcetype)\s*=|#event_simpleName|\|\s*(?:where|project|summarize|extend|stats|search|eval|table|groupBy|select)\b/i.test(
      structure,
    )
  )
    return null;
  const operator =
    '(?:[=!<>]|contains(?:cis)?\\b|matches\\b|in\\b|regexp\\b|starts_with\\b|ends_with\\b|is\\b|does\\s+not\\b)';
  // Require a predicate at the start; prose containing an embedded query is not a query file.
  if (!new RegExp('^(?:\\(\\s*|NOT\\s+)*[\\w.]+\\s*' + operator, 'i').test(structure)) return null;
  const legacy = new RegExp(
    '\\b(?:SrcProc[\\w]+|TgtProc[\\w]+|ProcessCmd|ProcessGroupId|AgentOS|FileFullName|FileIsExecutable|DNSRequest)\\s*' +
      operator,
    'i',
  ).test(structure);
  const modern = new RegExp(
    '\\b(?:(?:src|tgt)\\.process\\.[\\w.]+|tgt\\.file\\.[\\w.]+|endpoint\\.os\\.[\\w.]+|agent\\.uuid|event\\.login\\.[\\w.]+|registry\\.keyPath|dns\\.request)\\s*' +
      operator,
    'i',
  ).test(structure);
  const edrScope = tokens.some((token, index) => {
    if (token.kind !== 'syntax' || !/^(?:dataSource\.name|i\.scheme)$/i.test(token.text)) return false;
    const operatorToken = tokens[index + 1];
    const value = tokens[index + 2];
    return (
      operatorToken?.kind === 'syntax' &&
      /^(?:=|==)$/.test(operatorToken.text) &&
      value?.kind === 'literal' &&
      (token.text.toLowerCase() === 'datasource.name'
        ? /^(['"])SentinelOne\1$/i.test(value.text)
        : /^(['"])edr\1$/i.test(value.text))
    );
  });
  const knownModern =
    knownSentinelOne && /\b(?:event\.type|endpoint\.name|dst\.ip\.address|dst\.port\.number)\s*[=!<>]/i.test(structure);
  const knownLegacy =
    knownSentinelOne &&
    new RegExp('\\b(?:ProcessName|AgentName|RegistryPath|EventType)\\s*' + operator, 'i').test(structure);
  if (!legacy && !modern && !edrScope && !knownModern && !knownLegacy) return null;
  if (tokens.some((token) => token.kind === 'syntax' && token.text === '|')) return 'PowerQuery';
  return modern || edrScope || knownModern ? 'S1QL 2.0' : 'S1QL';
}
