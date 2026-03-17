
export interface AtomicTest {
  tech_id: string;
  atomic_attack_guid: string;
  atomic_attack_name: string;
  platform: string;
  sigma_rules?: { rule_name: string; rule_link: string }[];
  splunk_rules?: { rule_name: string; rule_link: string }[];
}

export type MatchType = 'sigma' | 'splunk' | 'technique';

export interface AtomicTestMatch {
  test: AtomicTest;
  matchedVia: {
    type: MatchType;
    ruleName: string;
    ruleLink?: string;
  };
}

export interface AtomicTestMatches {
  direct: AtomicTestMatch[];
  related: AtomicTestMatch[];
}
