/**
 * Wraps a tool result with a trust_level marker so the LLM can distinguish
 * untrusted external content (web_search) from trusted internal data
 * (library, MITRE, coverage). The system prompt instructs the model to
 * treat 'untrusted_external' content as data, never as instructions.
 *
 * The trust_level is added as a sibling field, NOT as a wrapping envelope —
 * this keeps `sources` and other top-level fields where the system prompt
 * expects them.
 */
export type TrustLevel = 'trusted_internal' | 'untrusted_external' | 'error';

const UNTRUSTED_TOOLS = new Set(['web_search']);

export function wrapToolResult(
  toolName: string,
  result: any,
  error?: string | null
): Record<string, any> {
  if (error) {
    return { error, trust_level: 'error' as TrustLevel };
  }
  const trustLevel: TrustLevel = UNTRUSTED_TOOLS.has(toolName)
    ? 'untrusted_external'
    : 'trusted_internal';
  return { ...(result || {}), trust_level: trustLevel };
}
