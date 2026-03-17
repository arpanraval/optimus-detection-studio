/**
 * Safely coerce an unknown caught value into an Error instance.
 *
 * TypeScript catch clauses type the error as `unknown`. This helper
 * avoids the unsafe `err as Error` cast by handling the common shapes
 * a thrown value can take.
 */
export function toError(err: unknown): Error {
  if (err instanceof Error) return err;
  if (typeof err === 'string') return new Error(err);
  if (typeof err === 'object' && err !== null && 'message' in err) {
    return new Error(String((err as { message: unknown }).message));
  }
  return new Error('Unknown error');
}
