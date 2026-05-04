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
});
