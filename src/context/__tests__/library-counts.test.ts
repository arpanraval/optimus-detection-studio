import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Guard against regressing to estimated counts. Library tab badges
// must reflect actual row counts, not pg_statistic planner estimates.
describe('LibraryContext library count queries', () => {
  const source = readFileSync(
    resolve(__dirname, '../LibraryContext.tsx'),
    'utf8'
  );

  it('uses count: "exact" for production tab count', () => {
    // Find the production count query (preceded by "Production Library" comment)
    const productionBlock = source.slice(
      source.indexOf('Production Library is shared'),
      source.indexOf('Data query WITH filters', source.indexOf('Production Library is shared'))
    );
    expect(productionBlock).toContain("count: 'exact'");
    expect(productionBlock).not.toContain("count: 'estimated'");
  });

  it('uses count: "exact" for development tab count', () => {
    // Locate the callback definition (not the interface declaration).
    const callbackStart = source.indexOf('const refreshDevelopmentLibrary = useCallback');
    const devBlock = source.slice(callbackStart, callbackStart + 2000);
    expect(devBlock).toContain("count: 'exact'");
    expect(devBlock).not.toContain("count: 'estimated'");
  });
});
