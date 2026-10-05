import { expect, it } from 'vitest';
import { packEligibility, validatePack } from '../packValidation';
import { Status, type Detection, type DetectionPack } from '../../types';
const pack = { platforms: ['sentinel'] } as DetectionPack;
const detection = {
  id: 'd',
  name: 'Azure rule',
  library_type: 'production',
  status: 'Review',
  platforms: ['Azure'],
  queries: [{ language: 'KQL', query: 'AzureActivity' }],
} as Detection;
it('does not confuse Sentinel provider with Azure telemetry platform', () => {
  expect(validatePack(pack, [detection]).issues).toEqual([]);
  expect(packEligibility(pack, [detection])).toEqual({ eligible: 1, ineligible: 0, total: 1 });
});
it('checks all queries and accepts Review/Testing while excluding Development', () => {
  const multi = {
    ...detection,
    queries: [{ ...detection.queries![0], language: 'SPL', query: 'index=test' }, ...detection.queries!],
  };
  expect(
    packEligibility(pack, [
      multi,
      { ...detection, status: Status.Testing },
      { ...detection, status: Status.Development },
    ]),
  ).toEqual({ eligible: 2, ineligible: 1, total: 3 });
  expect(validatePack(pack, [{ ...detection, status: Status.Development }]).isDeployable).toBe(false);
});
it('flags actual query incompatibility without comparing telemetry labels', () => {
  const incompatible = { ...detection, queries: [{ ...detection.queries![0], language: 'SPL', query: 'index=test' }] };
  expect(validatePack(pack, [incompatible]).issues.map((i) => i.code)).toContain('QUERY_LANGUAGE_MISMATCH');
  expect(packEligibility(pack, [incompatible]).eligible).toBe(0);
});
it('retains warnings for actual environment platform mismatches', () => {
  expect(
    validatePack({ ...pack, platforms: ['Linux'] }, [{ ...detection, platforms: ['Windows'] }]).issues.map(
      (i) => i.code,
    ),
  ).toContain('PLATFORM_MISMATCH');
});
