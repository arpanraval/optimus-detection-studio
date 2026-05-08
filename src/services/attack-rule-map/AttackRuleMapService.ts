
import { AtomicTest, AtomicTestMatch, AtomicTestMatches } from '@/types/attack-rule-map';
import { Detection } from '@/types';

// ARM = krdmnbrk's curated mapping of sigma/splunk rule names → atomic test GUIDs
// (sigma/splunk-mapped subset only — 646 tests, 169 techniques).
const ARM_URL = 'https://raw.githubusercontent.com/krdmnbrk/AttackRuleMap/main/attack_rule_map.json';

// AT canonical index from Red Canary — superset by GUID, lacks rule mappings
// but covers all 1790 published tests across 331 techniques. Used to fill the
// technique-tier when a TID has no sigma/splunk mapping in ARM.
const AT_INDEX_URL = 'https://raw.githubusercontent.com/redcanaryco/atomic-red-team/master/atomics/Indexes/Indexes-CSV/index.csv';
const REQUIRED_CSV_HEADERS = ['Tactic', 'Technique #', 'Technique Name', 'Test Name', 'Test GUID', 'Executor Name'];

const CACHE_KEY = 'attackRuleMap:v2';

const EXECUTOR_TO_PLATFORM: Record<string, string> = {
  powershell: 'Windows',
  command_prompt: 'Windows',
  bash: 'Linux',
  sh: 'Linux',
  manual: 'Manual',
};

// Most corporate proxies / captive portals serve an HTML page when blocking a
// raw.githubusercontent.com request — `response.json()` would throw a confusing
// SyntaxError. Surface a clear cause instead.
function looksLikeHtml(text: string): boolean {
  return /^\s*<(?:!doctype|html|head|body|meta|script|title)\b/i.test(text);
}

function parseCsvRow(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else cur += ch;
    } else {
      if (ch === ',') { out.push(cur); cur = ''; }
      else if (ch === '"') inQuotes = true;
      else cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function parseAtIndexCsv(csvText: string): AtomicTest[] {
  const trimmed = (csvText || '').trim();
  if (!trimmed) throw new Error('AT index CSV was empty');
  if (looksLikeHtml(trimmed)) throw new Error('AT index returned HTML — likely proxy/captive-portal interception');

  const lines = trimmed.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) throw new Error('AT index CSV had no data rows');

  const header = parseCsvRow(lines[0]);
  const missing = REQUIRED_CSV_HEADERS.filter((h) => !header.includes(h));
  if (missing.length) throw new Error(`AT index CSV missing columns: ${missing.join(', ')}`);

  const cTid = header.indexOf('Technique #');
  const cTestName = header.indexOf('Test Name');
  const cGuid = header.indexOf('Test GUID');
  const cExec = header.indexOf('Executor Name');

  const out: AtomicTest[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvRow(lines[i]);
    const tid = cols[cTid]?.trim();
    const guid = cols[cGuid]?.trim();
    if (!tid || !guid) continue;
    const exec = (cols[cExec] || '').trim().toLowerCase();
    out.push({
      tech_id: tid,
      atomic_attack_guid: guid,
      atomic_attack_name: cols[cTestName]?.trim() || tid,
      platform: EXECUTOR_TO_PLATFORM[exec] || 'Manual',
    });
  }
  return out;
}

// Sigma rule titles live at the document root (column 0). Capture the value
// after `title:`, strip an inline `# comment`, then strip a single pair of
// surrounding quotes — in that order so quoted-with-trailing-space values
// (e.g. `title: 'My rule '`) get fully cleaned up before lookup.
function extractSigmaTitle(yamlText: string): string | null {
  const stripped = yamlText.replace(/^﻿/, '');
  const match = stripped.match(/^title[ \t]*:[ \t]*(.*)$/m);
  if (!match) return null;
  let raw = match[1].trim();
  raw = raw.replace(/\s+#.*$/, '').trim();
  const quoted = raw.match(/^(['"])([\s\S]*)\1$/);
  if (quoted) raw = quoted[2].trim();
  return raw || null;
}

class AttackRuleMapService {
  private tests: AtomicTest[] = [];
  private initialized = false;

  // Indexes
  private bySigmaRule: Map<string, AtomicTest[]> = new Map();
  private bySplunkRule: Map<string, AtomicTest[]> = new Map();
  private byTechnique: Map<string, AtomicTest[]> = new Map();

  async initialize() {
    if (this.initialized) return;

    // Try sessionStorage cache first (avoids two GitHub fetches on page refresh)
    try {
      const cached = sessionStorage.getItem(CACHE_KEY);
      if (cached) {
        this.tests = JSON.parse(cached);
        this.buildIndexes();
        this.initialized = true;
        console.log(`[AttackRuleMap] Loaded from cache: ${this.tests.length} tests`);
        return;
      }
    } catch { /* cache miss or parse error, fall through to network fetch */ }

    // Fetch ARM (rule mappings) and AT canonical index (gap-fill) in parallel.
    // Either source failing is non-fatal — we degrade rather than break.
    const [armResult, atResult] = await Promise.allSettled([
      this.fetchArm(),
      this.fetchAtIndex(),
    ]);

    const armTests = armResult.status === 'fulfilled' ? armResult.value : [];
    const atTests = atResult.status === 'fulfilled' ? atResult.value : [];
    if (armResult.status === 'rejected') {
      console.error('[AttackRuleMap] ARM fetch failed:', armResult.reason);
    }
    if (atResult.status === 'rejected') {
      console.error('[AttackRuleMap] AT index fetch failed:', atResult.reason);
    }

    // Merge by lowercased GUID. ARM entries are richer (carry sigma_rules /
    // splunk_rules), so they take precedence over the canonical CSV row for
    // the same test.
    const seen = new Set<string>();
    const merged: AtomicTest[] = [];
    for (const t of armTests) {
      const key = t.atomic_attack_guid.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(t);
    }
    for (const t of atTests) {
      const key = t.atomic_attack_guid.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(t);
    }

    this.tests = merged;
    if (this.tests.length === 0) {
      console.error('[AttackRuleMap] Both data sources failed; atomic test matching disabled');
      return;
    }

    this.buildIndexes();
    this.initialized = true;
    const armCount = armTests.length;
    const atOnlyCount = this.tests.length - armCount;
    console.log(`[AttackRuleMap] Initialized with ${this.tests.length} tests (ARM ${armCount} + AT-only ${atOnlyCount})`);

    try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(this.tests)); } catch { /* quota exceeded, skip */ }
  }

  private async fetchArm(): Promise<AtomicTest[]> {
    const r = await fetch(ARM_URL);
    if (!r.ok) throw new Error(`ARM HTTP ${r.status}`);
    const text = await r.text();
    if (looksLikeHtml(text)) throw new Error('ARM returned HTML — likely proxy/captive-portal interception');
    const data = JSON.parse(text);
    if (!Array.isArray(data)) throw new Error('ARM payload was not a JSON array');
    return data as AtomicTest[];
  }

  private async fetchAtIndex(): Promise<AtomicTest[]> {
    const r = await fetch(AT_INDEX_URL);
    if (!r.ok) throw new Error(`AT index HTTP ${r.status}`);
    const text = await r.text();
    return parseAtIndexCsv(text);
  }

  private normalize(str: string): string {
    return str.toLowerCase().trim();
  }

  private buildIndexes() {
    this.bySigmaRule.clear();
    this.bySplunkRule.clear();
    this.byTechnique.clear();

    this.tests.forEach(test => {
      // Index by Sigma Rules
      test.sigma_rules?.forEach(rule => {
        const key = this.normalize(rule.rule_name);
        if (!this.bySigmaRule.has(key)) this.bySigmaRule.set(key, []);
        this.bySigmaRule.get(key)!.push(test);
      });

      // Index by Splunk Rules
      test.splunk_rules?.forEach(rule => {
        const key = this.normalize(rule.rule_name);
        if (!this.bySplunkRule.has(key)) this.bySplunkRule.set(key, []);
        this.bySplunkRule.get(key)!.push(test);
      });

      // Index by Technique
      if (test.tech_id) {
        const key = test.tech_id.toUpperCase();
        if (!this.byTechnique.has(key)) this.byTechnique.set(key, []);
        this.byTechnique.get(key)!.push(test);
      }
    });
  }

  findMatches(detection: Detection): AtomicTestMatches {
    if (!this.initialized) {
        console.warn("[AttackRuleMap] Service not initialized");
        return { direct: [], related: [] };
    }

    const matches = new Map<string, AtomicTestMatch>();

    // 1. Match by Sigma Rules (High Confidence)
    const sigmaQueries = detection.queries.filter(q =>
        q.language.toLowerCase().includes('sigma') ||
        q.language.toLowerCase().includes('yaml')
    );

    sigmaQueries.forEach(q => {
        const title = extractSigmaTitle(q.query);
        if (!title) return;
        const normalized = this.normalize(title);
        const foundTests = this.bySigmaRule.get(normalized);

        foundTests?.forEach(test => {
            const ruleInfo = test.sigma_rules?.find(r => this.normalize(r.rule_name) === normalized);
            matches.set(test.atomic_attack_guid, {
                test,
                matchedVia: {
                    type: 'sigma',
                    ruleName: ruleInfo?.rule_name || title,
                    ruleLink: ruleInfo?.rule_link
                }
            });
        });
    });

    // 2. Match by Splunk Rules (High Confidence)
    // Assuming detection.name matches the ESCU rule name for SPL queries
    if (detection.queries.some(q => q.language.toLowerCase().includes('spl'))) {
        const name = this.normalize(detection.name);
        const foundTests = this.bySplunkRule.get(name);

        foundTests?.forEach(test => {
            // Prefer existing match if it's already sigma (both high confidence), otherwise overwrite or add
            if (!matches.has(test.atomic_attack_guid)) {
                const ruleInfo = test.splunk_rules?.find(r => this.normalize(r.rule_name) === name);
                matches.set(test.atomic_attack_guid, {
                    test,
                    matchedVia: {
                        type: 'splunk',
                        ruleName: ruleInfo?.rule_name || detection.name,
                        ruleLink: ruleInfo?.rule_link
                    }
                });
            }
        });
    }

    // 3. Match by Technique (Lower Confidence / Related)
    detection.mitreAttackIds.forEach(id => {
        const techniqueId = id.toUpperCase();
        const foundTests = this.byTechnique.get(techniqueId);

        foundTests?.forEach(test => {
            if (!matches.has(test.atomic_attack_guid)) {
                matches.set(test.atomic_attack_guid, {
                    test,
                    matchedVia: {
                        type: 'technique',
                        ruleName: `Technique ${techniqueId}`
                    }
                });
            }
        });
    });

    // Categorize
    const direct: AtomicTestMatch[] = [];
    const related: AtomicTestMatch[] = [];

    matches.forEach(match => {
        if (match.matchedVia.type === 'technique') {
            related.push(match);
        } else {
            direct.push(match);
        }
    });

    return { direct, related };
  }
}

export const attackRuleMapService = new AttackRuleMapService();
