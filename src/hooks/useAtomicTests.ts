
import { useState, useEffect } from 'react';
import { Detection } from '@/types';
import { attackRuleMapService } from '@/services/attack-rule-map/AttackRuleMapService';
import { AtomicTestMatches } from '@/types/attack-rule-map';

export function useAtomicTests(detection: Detection) {
  const [matches, setMatches] = useState<AtomicTestMatches>({ direct: [], related: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Small delay to ensure service is initialized or non-blocking
    const find = async () => {
        setLoading(true);
        // Ensure service is initialized (idempotent)
        await attackRuleMapService.initialize();
        const result = attackRuleMapService.findMatches(detection);
        setMatches(result);
        setLoading(false);
    };
    find();
  }, [detection]);

  return { matches, loading };
}
