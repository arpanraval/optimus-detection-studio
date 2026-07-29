// vitest.setup.ts
//
// Makes the Supabase Edge Function modules loadable under vitest.
//
// Those modules target Deno. Three things about that runtime leak into module
// evaluation, and each is shimmed here rather than by changing the production
// source — the source has to keep running on Deno unchanged:
//
//   1. `Deno.env.get(...)` for secrets. Nothing in the threat-research import
//      chain calls it at module scope (verified: every call sits inside a
//      function body, and anthropic-raw.ts guards with `typeof Deno`), but the
//      moment a test drives a code path that reads a secret we need a real
//      accessor rather than a ReferenceError.
//   2. `EdgeRuntime.waitUntil(...)` for fire-and-forget background work.
//   3. Remote URL imports — handled by `resolve.alias` in vitest.config.ts,
//      not here.
//
// Tests set process.env to control what a module sees. Nothing here provides
// real credentials; an unset variable reads as undefined exactly as it would
// on a misconfigured deployment, which is itself a case worth testing.

interface DenoEnvShim {
  get(key: string): string | undefined;
  set(key: string, value: string): void;
  has(key: string): boolean;
  toObject(): Record<string, string>;
}

interface DenoShim {
  env: DenoEnvShim;
}

const denoShim: DenoShim = {
  env: {
    get: (key) => process.env[key],
    set: (key, value) => { process.env[key] = value; },
    has: (key) => process.env[key] !== undefined,
    toObject: () => ({ ...process.env } as Record<string, string>),
  },
};

const g = globalThis as typeof globalThis & {
  Deno?: DenoShim;
  EdgeRuntime?: { waitUntil(p: Promise<unknown>): void };
};

if (g.Deno === undefined) {
  g.Deno = denoShim;
}

// The real EdgeRuntime.waitUntil hands a promise to the platform so the isolate
// stays alive past the response. Under test there is no isolate to keep alive;
// swallowing rejections here matches the platform's behaviour of not failing
// the request when background work throws.
if (g.EdgeRuntime === undefined) {
  g.EdgeRuntime = {
    waitUntil: (p: Promise<unknown>) => { void Promise.resolve(p).catch(() => {}); },
  };
}
