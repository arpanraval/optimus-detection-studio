export interface SentinelOneToken {
  text: string;
  kind: 'space' | 'literal' | 'comment' | 'syntax';
  start: number;
  end: number;
}

/** Scan once, preserving literals and comments as opaque tokens. */
export function tokenizeSentinelOne(query: string): SentinelOneToken[] | null {
  const tokens: SentinelOneToken[] = [];
  const plain = /\s+|[\w.$:#-]+|&&|\|\||==|!=|<=|>=|[^\s]/y;
  let i = 0;
  while (i < query.length) {
    const start = i;
    let kind: SentinelOneToken['kind'] = 'syntax';
    if (query.startsWith('//', i)) {
      kind = 'comment';
      while (i < query.length && !/[\r\n]/.test(query[i])) i++;
    } else if (query.startsWith('/*', i)) {
      kind = 'comment';
      const end = query.indexOf('*/', i + 2);
      if (end < 0) return null;
      i = end + 2;
    } else if (query[i] === '"' || query[i] === "'") {
      kind = 'literal';
      const delimiter = query.startsWith('"""', i) ? '"""' : query[i];
      i += delimiter.length;
      while (i < query.length) {
        if (query[i] === '\\') i += 2;
        else if (query.startsWith(delimiter, i)) break;
        else i++;
      }
      if (i >= query.length) return null;
      i += delimiter.length;
    } else {
      plain.lastIndex = i;
      const match = plain.exec(query)!;
      i = plain.lastIndex;
      if (/^\s/.test(match[0])) kind = 'space';
    }
    tokens.push({ text: query.slice(start, i), kind, start, end: i });
  }
  return tokens;
}
