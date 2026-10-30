// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  missingNames,
  parseCliNames,
  parseTableNames,
  requiredEdgeFunctions,
  requiredTables,
  schemaTableNames,
} from '../../../scripts/setup-state';

describe('installation inventory', () => {
  it('accepts the snapshot tables plus unrelated application tables', () => {
    const required = schemaTableNames();
    expect(required).toContain('auto_digest_job_entries');
    expect(missingNames(required, [...required, 'extra_table'])).toEqual([]);
  });

  it('reports a missing table even when the total count is unchanged', () => {
    const required = schemaTableNames();
    expect(missingNames(required, [...required.filter((name) => name !== 'integrations'), 'extra_table'])).toEqual([
      'integrations',
    ]);
  });

  it('reads unique CREATE TABLE declarations and refuses an empty contract', () => {
    expect(
      requiredTables(
        'CREATE TABLE public.one (\n);\nCREATE TABLE IF NOT EXISTS public.two (\n);\nCREATE TABLE public.one (',
      ),
    ).toEqual(['one', 'two']);
    expect(() => requiredTables('-- no schema')).toThrow('No public tables');
    expect(parseTableNames(' one\r\ntwo\r\n')).toEqual(['one', 'two']);
    expect(parseTableNames('')).toEqual([]);
  });

  it('finds missing functions by name even with enough unrelated deployments', () => {
    const required = requiredEdgeFunctions();
    expect(required).not.toContain('_shared');
    const deployed = required.filter((name) => name !== 'integration-ops');
    expect(missingNames(required, [...deployed, 'unrelated-function'])).toEqual(['integration-ops']);
  });

  it.each([
    '[{"name":"integration-ops"}]',
    '{"functions":[{"name":"integration-ops"}]}',
    ' ID | NAME | SLUG | STATUS\n----|------|------|-------\n uuid | integration-ops | integration-ops | ACTIVE',
  ])('reads deployed function names from CLI output', (output) => {
    expect([...parseCliNames(output)]).toEqual(['integration-ops']);
  });

  it.each(['{"secrets":[{"name":"GEMINI_API_KEY"}]}', ' NAME | DIGEST\n------|-------\n GEMINI_API_KEY | abc123'])(
    'keeps secret-name parsing compatible',
    (output) => {
      expect([...parseCliNames(output)]).toEqual(['GEMINI_API_KEY']);
    },
  );
});
