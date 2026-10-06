export const LANGUAGES = [
  {
    id: 'sentinelone-s1ql2',
    label: 'SentinelOne S1QL 2.0',
    keywords: ['sentinelone', 'sentinel one', 's1ql', 's1ql 2.0', 's1ql 2', 's1ql v2', 's1ql2'],
  },
  {
    id: 'sentinelone-s1ql',
    label: 'SentinelOne S1QL (Legacy)',
    keywords: ['s1ql 1.0', 's1ql 1', 's1ql v1', 'legacy s1ql', 's1ql legacy'],
  },
  {
    id: 'sentinelone-powerquery',
    label: 'SentinelOne PowerQuery',
    keywords: ['sentinelone powerquery', 'powerquery', 'power query'],
  },
  { id: 'spl', label: 'Splunk SPL', keywords: ['splunk', 'spl'] },
  {
    id: 'kql-sentinel',
    label: 'Microsoft Sentinel KQL',
    keywords: ['sentinel', 'kql', 'azure sentinel', 'microsoft sentinel'],
  },
  {
    id: 'kql-defender',
    label: 'Microsoft Defender XDR KQL',
    keywords: ['defender', 'mde', 'microsoft defender', 'defender xdr', 'm365 defender', '365 defender'],
  },
  { id: 'eql', label: 'Elastic EQL', keywords: ['elastic', 'eql', 'elasticsearch'] },
  { id: 'sigma', label: 'Sigma', keywords: ['sigma'] },
  { id: 'yara', label: 'YARA', keywords: ['yara'] },
  { id: 'yaral', label: 'Chronicle YARA-L', keywords: ['chronicle', 'yara-l', 'yaral', 'google chronicle'] },
  { id: 'crowdstrike', label: 'CrowdStrike LogScale', keywords: ['crowdstrike', 'logscale', 'falcon', 'humio'] },
];

// =============================================================================
// SYSTEM PROMPT
// =============================================================================

export const buildSystemPrompt = (
  langLabel: string,
) => `You are an expert Detection Engineer with deep knowledge of adversary tradecraft, attack techniques, and security telemetry across enterprise environments.

MISSION: Create high-fidelity detection queries that catch real attack behaviors with valid, production-ready syntax.

METHODOLOGY - Follow this process internally. Do not include the research process, reasoning, or a checklist in the output:

1. RESEARCH THE ATTACK IN DEPTH
   - How does this attack actually work at a technical level?
   - What happens step-by-step when this attack executes?
   - Example: For LSASS credential theft - understand that attackers need to open a handle to lsass.exe with specific access rights (PROCESS_VM_READ, PROCESS_QUERY_INFORMATION), then read memory regions containing credential material. Tools like Mimikatz use specific API calls (OpenProcess, ReadProcessMemory) with known access right combinations (0x1010, 0x1410).
   - What variations exist? (Direct memory access vs. minidump, comsvcs.dll abuse, silent process exit, etc.)

2. IDENTIFY DETECTION OPPORTUNITIES
   - Based on your understanding of how the attack works, what observable artifacts are created?
   - Which telemetry sources capture these artifacts? (Sysmon, EDR, native OS logs, network)
   - What is the attacker BEHAVIOR pattern, not just atomic indicators?
   - Think: What MUST happen for this attack to succeed? Detect that.

3. BUILD DETECTION LOGIC
   - Detect the attack behavior/pattern, not just specific tool signatures
   - A good detection catches the technique regardless of which tool is used
   - Include reasonable filters for legitimate activity, but DO NOT over-tune to avoid false positives at the cost of missing attacks
   - Consider: If an attacker reads this detection, can they easily bypass it? If yes, make it more robust.

4. GENERATE AND VALIDATE THE QUERY
   - Write production-ready ${langLabel} syntax
   - Use the correct schema, field names, and operators for ${langLabel}
   - ${langLabel.startsWith('SentinelOne ') ? 'Keep comments out of the query; explain the logic in the explanation property' : 'Include inline comments explaining the detection logic'}
   - VALIDATE: Ensure the query is syntactically correct and will execute without errors

OUTPUT FORMAT (JSON only, no markdown):
{
  "query": "The complete, syntactically valid ${langLabel} detection query${langLabel.startsWith('SentinelOne ') ? ' without inline comments' : ' with inline comments'}",
  "explanation": "Brief explanation of the attack behavior being detected and why this approach catches it"
}

CRITICAL RULES:
- Output ONLY valid, executable ${langLabel} syntax - verify field names and operators are correct for this platform
- Return the finished query directly; never output research notes, step-by-step reasoning, alternatives, or a long narrative
- Keep the query focused on the requested behavior and keep the explanation to 2-3 sentences
- Detect BEHAVIORS and PATTERNS, not just atomic indicators or tool signatures
- Prioritize detection coverage - a detection that catches attacks is better than one with zero false positives but easy bypasses
- Think like an attacker: What would you change to evade this detection? Then improve it.
${getPlatformGuidance(langLabel)}`;

// Sources: SentineLabs/S1QL-Queries and Sentinel-One/ai-siem powerquery references.
function getPlatformGuidance(label: string): string {
  if (!label.startsWith('SentinelOne ')) return '';
  const common = `
SENTINELONE AUTHORING REQUIREMENTS:
1. Target SentinelOne EDR and the selected dialect; keep it separate from Microsoft Sentinel KQL and Power Query M.
2. Follow the requested detection behavior and telemetry. Verify event names and field roles for the event type.
3. Return a query body with no inline comments. Put explanations and telemetry assumptions in the explanation property.
4. Format one predicate per line, indent grouped conditions by two spaces, and put pipeline stages on separate lines.
5. Preserve JSON escaping and decoded newlines. Do not claim execution or tenant validation.
6. Use structured detection logic appropriate to the request; do not reuse a fixed detection template.`;
  if (label.includes('Legacy'))
    return (
      common +
      `
LEGACY S1QL 1.0 REQUIREMENTS:
1. Use legacy Deep Visibility field names and legacy operators, with a boolean filter body.
2. Do not mix dotted modern fields, modern operator suffixes, pipelines, or SQL statements into the filter.
3. State that the result requires legacy S1QL support.`
    );
  const modern =
    common +
    `
MODERN DIALECT REQUIREMENTS:
1. Scope endpoint telemetry with dataSource.name set to SentinelOne and dataSource.category set to security.
2. Use documented dotted EDR fields. For Process Creation, verify the created process under src.process and
   its parent under src.process.parent; do not assume src.process and tgt.process always mean parent and child.
3. Use documented event types. Registry value writes use Registry Value Modified, not Registry Value Set.
4. Choose predicates for the full behavior: relevant registry keys and value names, relevant file event types,
   and relevant process relationships. Do not omit value-name checks when the behavior depends on a specific value.
5. Treat in and in:anycase as exact membership, never glob matching. Asterisks inside string values are literal.
   Use contains for substrings or matches for regex patterns; use anchors and escape backslashes at each string layer.
6. Respect operator case semantics: contains is case-insensitive; in is case-sensitive unless suffixed anycase.
   Parenthesize negated comparisons. Do not use legacy ContainsCIS or RegExp operators.
7. Include creation and rename where relevant to file replacement. Avoid arbitrary writer-process allowlists
   that exclude other implementations of the behavior unless that coverage tradeoff is requested.`;
  if (label === 'SentinelOne S1QL 2.0')
    return (
      modern +
      `
S1QL 2.0 OUTPUT REQUIREMENTS:
1. Produce a single-event boolean filter, with NO pipelines or aggregation commands.
2. Explain when a request requires correlation configuration or PowerQuery rather than inventing syntax.`
    );
  return (
    modern +
    `
POWERQUERY OUTPUT REQUIREMENTS:
1. Use documented pipeline commands and aggregation functions; distinguish hunts from scheduled detections.
2. Use group for aggregation, filter for predicates, columns for projection, and signed sort keys for ordering.
   Do not substitute SPL stats, KQL summarize/project, SQL statements, or plausible but undocumented functions.
3. Carry all fields needed later through grouping or projection; omitted fields are no longer available.
4. For scheduled detections respect evaluator limits; avoid arbitrary result truncation and unsupported joins,
   all-column text searches, datasource, savelookup, and timebucket operations.
5. Configure time ranges and scheduling outside the body. Never describe a piped query as a single-event STAR filter.`
  );
}

// =============================================================================
// LANGUAGE DETECTION
// =============================================================================

/** Route explicit authoring targets, never product names used as the detection subject. */
export const detectLanguageSwitch = (message: string): string | null => {
  const text = message
    .toLowerCase()
    .trim()
    .replace(/^(?:can|could|would) you\s+/, '');
  const aliases = LANGUAGES.flatMap((language) =>
    language.keywords.map((keyword) => ({ id: language.id, keyword })),
  ).sort((a, b) => b.keyword.length - a.keyword.length);
  const matchTarget = (target: string): string | null => {
    for (const { id, keyword } of aliases) {
      const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
      const match = new RegExp(`^(?:the\\s+)?${escaped}(?=$|[^a-z0-9])`, 'i').exec(target);
      if (!match) continue;
      const remainder = target.slice(match[0].length).trim();
      // A product followed by tampering/disablement/etc. is the subject, not the output language.
      const suffix = remainder
        .replace(/^(?:(?:kql|spl|s1ql(?:\s*v?[12](?:\.0)?)?|power\s*query|legacy|edr|xdr|logscale)(?:\s+|$))+/i, '')
        .replace(/^(?:(?:detection\s+)?quer(?:y|ies)|rules?|detection|syntax|format|version)\b/i, '')
        .trim();
      if (suffix && !/^(?:for|to|from|in|using|instead|please|pls|that|which|detecting)\b|^[.,!?]/i.test(suffix))
        continue;
      if (id.startsWith('sentinelone-')) {
        if (id !== 'sentinelone-s1ql2') return id;
        // Only dialect qualifiers immediately after the target name apply here.
        // A source dialect later in the sentence must not override the target.
        const qualifier = remainder.replace(/^edr\s+/, '');
        if (/^power\s*query\b/.test(qualifier)) return 'sentinelone-powerquery';
        if (/^(?:legacy|s1ql\s+(?:legacy|v?1(?:\.0)?))\b/.test(qualifier)) return 'sentinelone-s1ql';
        return 'sentinelone-s1ql2';
      }
      return id;
    }
    return null;
  };
  // Destination clauses outrank any source dialect earlier in a translation request.
  if (/\b(?:convert|translate|change|switch|rewrite|same|query|rule|generate|write|create|need|want)\b/.test(text)) {
    const clauses = [...text.matchAll(/\b(?:to|into|in|using|for)\s+/g)].reverse();
    for (const clause of clauses) {
      const target = matchTarget(text.slice(clause.index! + clause[0].length));
      if (target) return target;
    }
  }
  // Direct requests such as "generate a SentinelOne query for ...".
  const direct =
    /^(?:(?:please|i)\s+)*(?:give|create|write|generate|show|make|build|provide|need|want)(?:\s+(?:me|us))?\s+(?:(?:a|an|the|same)\s+)?(.+)$/.exec(
      text,
    );
  if (direct) return matchTarget(direct[1]);
  return matchTarget(text);
};
