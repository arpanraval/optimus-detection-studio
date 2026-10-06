import { tokenizeSentinelOne } from './sentinelOneTokens';

/** Changes whitespace only. This is presentation formatting, not a SentinelOne syntax validator. */
export function formatSentinelOneQuery(query: string): string {
  const tokens = tokenizeSentinelOne(query);
  if (!tokens) return query;
  const pairs = new Map<number, number>();
  const stack: number[] = [];
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].kind !== 'syntax') continue;
    if (tokens[i].text === '(') stack.push(i);
    if (tokens[i].text === ')') {
      const open = stack.pop();
      if (open === undefined) return query;
      pairs.set(open, i);
    }
  }
  if (stack.length) return query;

  const booleans = [0];
  const commas = [0];
  for (const token of tokens) {
    booleans.push(booleans.at(-1)! + Number(token.kind === 'syntax' && /^(AND|OR|&&|\|\|)$/i.test(token.text)));
    commas.push(commas.at(-1)! + Number(token.kind === 'syntax' && token.text === ','));
  }
  const multiline = new Set<number>();
  for (const [open, close] of pairs) {
    const hasBoolean = booleans[close] > booleans[open + 1];
    const longList = commas[close] > commas[open + 1] && tokens[close].start - tokens[open].end > 90;
    if (hasBoolean || longList) multiline.add(open);
  }

  let result = '';
  let pendingSpace = '';
  let indent = 0;
  const active: boolean[] = [];
  const newline = () => {
    result = result.trimEnd() + '\n' + '  '.repeat(indent);
    pendingSpace = '';
  };
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.kind === 'space') {
      pendingSpace = ' ';
      continue;
    }
    if (token.kind === 'syntax' && token.text === ')') {
      if (active.pop()) {
        indent--;
        newline();
      }
    } else if (token.kind === 'syntax' && /^(AND|OR|&&|\|\||\|)$/i.test(token.text) && result.trim()) {
      newline();
    }
    if (pendingSpace && result && !/\s$/.test(result)) result += pendingSpace;
    result += token.text;
    pendingSpace = '';
    if (token.kind === 'syntax' && token.text === '(') {
      active.push(multiline.has(i));
      if (multiline.has(i)) {
        indent++;
        newline();
      }
    } else if (token.kind === 'syntax' && token.text === ',' && active.at(-1)) {
      newline();
    } else if (token.kind === 'comment' && token.text.startsWith('//')) {
      newline();
    }
  }
  return result.trim();
}

export function formatAIQuery(query: string, languageId: string): string {
  const clean = query
    .replace(/^\s*```[^\r\n]*\r?\n/, '')
    .replace(/\r?\n?```\s*$/, '')
    .trim();
  return languageId.startsWith('sentinelone-') ? formatSentinelOneQuery(clean) : clean;
}
