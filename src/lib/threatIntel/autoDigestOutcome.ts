export type AutoDigestOutcome = 'complete' | 'partial' | 'failed' | 'cancelled';

export function deriveAutoDigestOutcome(input: {
  summaryAvailable: boolean;
  classificationAvailable: boolean;
  sectionErrors?: Record<string, unknown> | null;
  cancelled?: boolean;
}): AutoDigestOutcome {
  if (input.cancelled) return 'cancelled';
  if (!input.summaryAvailable && !input.classificationAvailable) return 'failed';
  if (Object.keys(input.sectionErrors || {}).length > 0) return 'partial';
  return 'complete';
}
