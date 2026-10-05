import { expect, it } from 'vitest';
import { packTechniqueCoverage, packCoverageClass } from '../PackMiniMatrix';
import type { Detection } from '../../../types';

it('counts only unique rules in the pack and uses technique-specific reference tactics', () => {
  const detections = [
    { id: 'a', mitreAttackIds: ['T1059', 'T1059'], mitreTactics: ['Initial Access', 'Execution'] },
    { id: 'a', mitreAttackIds: ['T1059'] },
    { id: 'b', mitreAttackIds: ['T1059', 'T1566'] },
  ] as Detection[];
  expect(
    packTechniqueCoverage(detections, [
      { mitre_id: 'T1059', name: 'Command and Scripting Interpreter', tactics: [{ shortname: 'execution' }] },
      { mitre_id: 'T1566', name: 'Phishing', tactics: [{ shortname: 'initial-access' }] },
    ]),
  ).toEqual([
    { id: 'T1059', name: 'Command and Scripting Interpreter', tactics: ['execution'], count: 2 },
    { id: 'T1566', name: 'Phishing', tactics: ['initial-access'], count: 1 },
  ]);
  expect(packTechniqueCoverage(detections, [])[0].tactics).toEqual([]);
});

it('visually distinguishes zero, one, two-to-three and four-plus rules', () => {
  expect(new Set([0, 1, 2, 4].map(packCoverageClass)).size).toBe(4);
  expect(packCoverageClass(2)).toBe(packCoverageClass(3));
  expect(packCoverageClass(4)).toBe(packCoverageClass(9));
});
