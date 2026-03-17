
import { AtomicTest, AtomicTestMatch, AtomicTestMatches, MatchType } from '@/types/attack-rule-map';
import { Detection } from '@/types';

const DATA_URL = 'https://raw.githubusercontent.com/krdmnbrk/AttackRuleMap/main/attack_rule_map.json';
const CACHE_KEY = 'attackRuleMap:v1';

class AttackRuleMapService {
  private tests: AtomicTest[] = [];
  private initialized = false;

  // Indexes
  private bySigmaRule: Map<string, AtomicTest[]> = new Map();
  private bySplunkRule: Map<string, AtomicTest[]> = new Map();
  private byTechnique: Map<string, AtomicTest[]> = new Map();

  async initialize() {
    if (this.initialized) return;

    // Try sessionStorage cache first (avoids GitHub fetch on page refresh)
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

    // Fetch from GitHub
    try {
      const response = await fetch(DATA_URL);
      if (!response.ok) throw new Error('Failed to fetch AttackRuleMap data');
      this.tests = await response.json();
      this.buildIndexes();
      this.initialized = true;
      console.log(`[AttackRuleMap] Initialized with ${this.tests.length} tests`);
      // Cache for subsequent page loads within this browser session
      try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(this.tests)); } catch { /* quota exceeded, skip */ }
    } catch (error) {
      console.error('[AttackRuleMap] Initialization failed:', error);
    }
  }

  private normalize(str: string): string {
    return str.toLowerCase().trim();
  }

  private buildIndexes() {
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
        // Extract title from Sigma YAML
        const titleMatch = q.query.match(/^title:\s*['"]?(.+?)['"]?\s*$/m);
        if (titleMatch && titleMatch[1]) {
            const title = this.normalize(titleMatch[1]);
            const foundTests = this.bySigmaRule.get(title);
            
            foundTests?.forEach(test => {
                const ruleInfo = test.sigma_rules?.find(r => this.normalize(r.rule_name) === title);
                matches.set(test.atomic_attack_guid, {
                    test,
                    matchedVia: {
                        type: 'sigma',
                        ruleName: ruleInfo?.rule_name || title,
                        ruleLink: ruleInfo?.rule_link
                    }
                });
            });
        }
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
