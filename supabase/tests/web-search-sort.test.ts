// Layer 3: web-search ordering — verifies that identical queries produce
// identical ordered results, removing a known source of run-to-run variance.
//
// Run with:
//   bun run supabase/tests/web-search-sort.test.ts
//
// Doesn't hit Tavily. Mocks fetch to return shuffled results, asserts the
// adapter sorts them deterministically.

const PORT = 8788;
const MOCK_URL = `http://localhost:${PORT}/search`;

process.env.TAVILY_API_KEY = "test-key";

// @ts-expect-error — install Deno.env shim
globalThis.Deno = { env: { get: (k: string) => process.env[k] } };

// Patch global fetch to redirect tavily.com calls to our mock.
const realFetch = globalThis.fetch;
globalThis.fetch = ((input: any, init?: any) => {
  const urlStr = typeof input === "string" ? input : input.url ?? input.toString();
  if (urlStr.includes("api.tavily.com")) {
    return realFetch(MOCK_URL, init);
  }
  return realFetch(input, init);
}) as typeof fetch;

import { createServer } from "node:http";

// Deliberately shuffled results — sort should put highest score first, ties
// broken by URL ascending.
const tavilyPayload = {
  results: [
    { title: "B", url: "https://b.example/foo", content: "...", score: 0.7 },
    { title: "A", url: "https://a.example/zzz", content: "...", score: 0.95 },
    { title: "C", url: "https://c.example", content: "...", score: 0.9 },
    { title: "D", url: "https://a.example/aaa", content: "...", score: 0.95 }, // tie with A
  ],
  answer: "synthesised answer",
};

const server = createServer((req, res) => {
  const chunks: Buffer[] = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(tavilyPayload));
  });
});
await new Promise<void>((r) => server.listen(PORT, () => r()));

const failures: string[] = [];
function assert(cond: unknown, label: string) {
  if (!cond) { failures.push(`✗ ${label}`); console.log(`✗ ${label}`); }
  else { console.log(`✓ ${label}`); }
}

try {
  const { webSearch } = await import("../functions/_shared/web-search.ts");

  const r1 = await webSearch({ query: "test query", focus: "general" });
  const r2 = await webSearch({ query: "test query", focus: "general" });

  assert(r1.results.length === 4, `expect 4 results, got ${r1.results.length}`);

  // Ordering should be:
  //   D (score 0.95, url a.example/aaa)  — wins tie on URL ascending
  //   A (score 0.95, url a.example/zzz)
  //   C (score 0.9)
  //   B (score 0.7)
  const expectedOrder = [
    "https://a.example/aaa",
    "https://a.example/zzz",
    "https://c.example",
    "https://b.example/foo",
  ];
  for (let i = 0; i < expectedOrder.length; i++) {
    assert(
      r1.results[i].url === expectedOrder[i],
      `position ${i}: expect ${expectedOrder[i]}, got ${r1.results[i].url}`,
    );
  }

  // Two identical queries must produce identical orderings.
  const r1urls = r1.results.map((x: any) => x.url).join("|");
  const r2urls = r2.results.map((x: any) => x.url).join("|");
  assert(r1urls === r2urls, "two identical queries → identical result ordering");
} finally {
  await new Promise<void>((r) => server.close(() => r()));
}

console.log(`\n${failures.length === 0 ? "ALL TESTS PASSED" : `${failures.length} FAILURE(S)`}`);
process.exit(failures.length === 0 ? 0 : 1);
