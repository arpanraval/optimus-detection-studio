// supabase/functions/threat-research-orchestrator/lib/__tests__/module-graph.test.ts
//
// Guards the vitest seam itself.
//
// Until now no test could import orchestrator.ts or any agent: the module graph
// reaches a Deno-style remote URL import (orchestrator -> agent-loop ->
// anthropic-direct -> _shared/aiTelemetry.ts, which imports supabase-js from
// esm.sh), and vitest cannot resolve those. That is why every reliability
// change to this pipeline had to be validated by paying for a live session —
// and why a change that could never fit the platform's worker ceiling reached
// production with the local gates all green.
//
// These assertions are deliberately shallow. They are not testing behaviour;
// they are testing that behaviour is now testable at all. If someone adds a new
// remote specifier to the import chain without adding a matching alias in
// vitest.config.ts, this file fails immediately with a resolution error instead
// of the capability quietly disappearing again.

import { describe, it, expect } from 'vitest';

describe('threat-research orchestrator module graph', () => {
  it('loads orchestrator.ts, which reaches supabase-js through the agent loop', async () => {
    const mod = await import('../orchestrator.ts');
    expect(typeof mod.runJob).toBe('function');
  });

  it('loads the shared agent loop', async () => {
    const mod = await import('../agents/agent-loop.ts');
    expect(typeof mod.runAgentLoop).toBe('function');
  });

  it('loads every agent module', async () => {
    const agents = await Promise.all([
      import('../agents/research-agent.ts'),
      import('../agents/attack-researcher.ts'),
      import('../agents/opportunity-planner.ts'),
      import('../agents/detection-engineer.ts'),
      import('../agents/qa-agent.ts'),
      import('../agents/input-classifier.ts'),
    ]);
    for (const agent of agents) {
      expect(Object.keys(agent).length).toBeGreaterThan(0);
    }
  });

  it('loads the transport and telemetry layer', async () => {
    const raw = await import('../llm/anthropic-raw.ts');
    expect(typeof raw.callAnthropicRaw).toBe('function');

    // anthropic-direct is the module that pulls in _shared/aiTelemetry.ts and
    // therefore the esm.sh specifier. Importing it is the actual proof the
    // alias works.
    const direct = await import('../llm/anthropic-direct.ts');
    expect(typeof direct.callAnthropic).toBe('function');
  });

  it('loads the tool registry, including the tools that call out to the network', async () => {
    const tools = await import('../tools/index.ts');
    expect(typeof tools.executeTool).toBe('function');
  });

  it('exposes a Deno shim so modules can read configuration', async () => {
    // Not asserting a value: an unset variable reading as undefined is the
    // correct, testable representation of a misconfigured deployment.
    const deno = (globalThis as unknown as { Deno: { env: { get(k: string): string | undefined } } }).Deno;
    expect(typeof deno?.env?.get).toBe('function');
    expect(() => deno.env.get('ANTHROPIC_API_KEY')).not.toThrow();
  });
});
