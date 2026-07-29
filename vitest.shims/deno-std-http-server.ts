// vitest.shims/deno-std-http-server.ts
//
// Stands in for `https://deno.land/std@0.177.0/http/server.ts` under vitest.
//
// Edge function entrypoints call `serve(handler)` at module scope. On Deno that
// binds a listener; under test we only want the handler, so `serve` records it
// and returns. A test then drives the entrypoint by calling
// `getRegisteredHandler()` with a Request, which exercises the real routing,
// auth and action-dispatch code without opening a socket.

export type ServeHandler = (req: Request) => Response | Promise<Response>;

let registered: ServeHandler | null = null;

export function serve(handler: ServeHandler): void {
  registered = handler;
}

/** The handler the entrypoint passed to `serve`, or null if the module under
 *  test has not been imported yet. */
export function getRegisteredHandler(): ServeHandler | null {
  return registered;
}

/** Reset between tests so a stale handler from a previous import cannot be
 *  mistaken for the current one. */
export function resetRegisteredHandler(): void {
  registered = null;
}
