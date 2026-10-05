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

// A deep link such as /library?queryLanguage=Sigma sets serverFilters while the unfiltered
// first load is still in flight. Guarding on a ref dropped those filters permanently — the
// chips said "Language: Sigma" while the list showed every rule. The flag has to be a
// dependency so the effect re-runs once the initial load lands.
describe('LibraryContext filter re-fetch after initial load', () => {
  const source = readFileSync(resolve(__dirname, '../LibraryContext.tsx'), 'utf8');

  const effectBlock = () => {
    const start = source.indexOf('// Re-fetch when serverFilters change');
    return source.slice(start, source.indexOf('}, [serverFilters', start) + 40);
  };

  it('waits for the initial load instead of discarding filters that arrive during it', () => {
    expect(effectBlock()).not.toContain('initialLoadDone.current');
    expect(effectBlock()).toContain('if (!initialLoadDone) return;');
  });

  it('re-runs when the initial load completes', () => {
    expect(effectBlock()).toContain('}, [serverFilters, initialLoadDone]);');
  });
});

// Several things refetch a library at once — pagination, sorting, switching library, and
// filters changing. `refreshAll` depends on the refresh callbacks, which depend on
// serverFilters, so a deep link's filters change its identity and re-run the initial-load
// effect while the first unfiltered fetch is still in flight. Without a ticket, whichever
// response lands last wins, and the list silently showed every rule while the chips and the
// URL both said it was filtered.
describe('LibraryContext out-of-order fetch protection', () => {
  const source = readFileSync(resolve(__dirname, '../LibraryContext.tsx'), 'utf8');

  const bodyOf = (fnName: string) => {
    const start = source.indexOf(`const ${fnName} = useCallback`);
    expect(start, `${fnName} not found`).toBeGreaterThan(-1);
    return source.slice(start, source.indexOf('\n  }, [', start));
  };

  it.each([
    ['refreshProductionLibrary', 'productionRequestRef'],
    ['refreshDevelopmentLibrary', 'developmentRequestRef'],
  ])('%s takes a ticket and drops a superseded result', (fnName, ref) => {
    const body = bodyOf(fnName);
    expect(body).toContain(`++${ref}.current`);
    expect(body).toContain(`requestId !== ${ref}.current`);
  });

  it('checks the ticket before writing rows into state', () => {
    const body = bodyOf('refreshProductionLibrary');
    expect(body.indexOf('requestId !== productionRequestRef.current'))
      .toBeLessThan(body.indexOf('setProductionDetections('));
  });
});
