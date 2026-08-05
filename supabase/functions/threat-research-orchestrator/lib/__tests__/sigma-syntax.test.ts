import { describe, it, expect } from 'vitest';
import { runSigmaSyntaxValidator } from '../validators/sigma-syntax';

describe('runSigmaSyntaxValidator', () => {
  it('no-ops for any non-Sigma query language', () => {
    expect(runSigmaSyntaxValidator('not sigma at all', 'KQL')).toBeNull();
    expect(runSigmaSyntaxValidator('', 'SPL')).toBeNull();
  });

  it('no-ops for an empty Sigma query body', () => {
    expect(runSigmaSyntaxValidator('   ', 'Sigma')).toBeNull();
  });

  it('passes a well-formed Sigma rule', () => {
    const rule = [
      'title: Suspicious mshta execution',
      'logsource:',
      '  category: process_creation',
      '  product: windows',
      'detection:',
      '  selection:',
      '    Image|endswith: \\mshta.exe',
      '  condition: selection',
    ].join('\n');
    expect(runSigmaSyntaxValidator(rule, 'Sigma')).toBeNull();
  });

  it('flags missing top-level keys', () => {
    const rule = [
      'title: Missing logsource and detection',
      'description: incomplete rule',
    ].join('\n');
    const finding = runSigmaSyntaxValidator(rule, 'Sigma');
    expect(finding).toContain('logsource');
    expect(finding).toContain('detection');
  });

  it('flags a detection block with no condition key', () => {
    const rule = [
      'title: No condition',
      'logsource:',
      '  category: process_creation',
      'detection:',
      '  selection:',
      '    Image|endswith: \\mshta.exe',
    ].join('\n');
    const finding = runSigmaSyntaxValidator(rule, 'Sigma');
    expect(finding).toContain('condition');
  });

  it('does not mistake a condition-shaped line in a later top-level key as satisfying the requirement', () => {
    const rule = [
      'title: Condition outside detection block',
      'logsource:',
      '  category: process_creation',
      'detection:',
      '  selection:',
      '    Image|endswith: \\mshta.exe',
      'fields:',
      '  condition: not real',
    ].join('\n');
    const finding = runSigmaSyntaxValidator(rule, 'Sigma');
    expect(finding).toContain('condition');
  });
});
