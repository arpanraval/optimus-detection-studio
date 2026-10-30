import { describe, expect, it } from 'vitest';
import { SUPPORTED_BACKENDS } from '../backends';

// No release of these supports pySigma 1.x, so there is nothing to pin.
const NO_COMPATIBLE_RELEASE = new Set(['qradar', 'datadog']);

describe('Sigma backend packages', () => {
  it.each(Object.entries(SUPPORTED_BACKENDS).filter(([key]) => !NO_COMPATIBLE_RELEASE.has(key)))(
    '%s pins every requirement to an exact version',
    (_key, config) => {
      // An unpinned install takes the latest release, which can require a pySigma
      // the browser cannot load (pysigma-backend-splunk 3.0.0 needs pySigma 2.x).
      for (const requirement of config.package.split(' ')) {
        expect(requirement).toMatch(/^pysigma-[a-z0-9-]+==\d+(\.\d+)+$/);
      }
    },
  );
});
