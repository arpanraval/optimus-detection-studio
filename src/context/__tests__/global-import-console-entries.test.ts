import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('GlobalImportContext exposes consoleEntries', () => {
  const source = readFileSync(
    resolve(__dirname, '../GlobalImportContext.tsx'),
    'utf8'
  );

  it('declares consoleEntries on the context value', () => {
    expect(source).toMatch(/consoleEntries:\s*ConsoleEntry\[\]/);
  });

  it('exposes addConsoleEntry and clearConsoleEntries actions', () => {
    expect(source).toMatch(/addConsoleEntry:\s*\(/);
    expect(source).toMatch(/clearConsoleEntries:\s*\(/);
  });

  it('restores the mounted callback guard during every Strict Mode effect setup', () => {
    expect(source).toMatch(/useEffect\(\(\) => \{[\s\S]*?mountedRef\.current = true;[\s\S]*?mountedRef\.current = false;/);
  });

  it('keeps the selected rule total on the tracked job and reconciles persisted completion', () => {
    expect(source).toContain('job.progress.totalRules = selectedRules.length');
    expect(source).toContain('Import completion recovered from the server');
  });
});
