// supabase/functions/threat-research-orchestrator/lib/budget.ts
//
// Per-session budget tracker. Three counters: tool calls, model calls, tokens.
// Tool and model calls are hard caps; tokens are an alarm threshold (event,
// not a stop). The hard wall-clock stop lives in the orchestrator.

export interface BudgetCaps {
  toolCalls: number;       // default 30
  modelCalls: number;      // default 40
  tokenAlarm: number;      // default 400_000
}

export const DEFAULT_BUDGET_CAPS: BudgetCaps = {
  toolCalls: 30,
  modelCalls: 40,
  tokenAlarm: 400_000,
};

export class Budget {
  private toolUsed = 0;
  private modelUsed = 0;
  private tokensUsed = 0;
  private alarmEmitted = false;

  constructor(public readonly caps: BudgetCaps = DEFAULT_BUDGET_CAPS) {}

  canSpendToolCall(): boolean { return this.toolUsed < this.caps.toolCalls; }
  spendToolCall(): void { this.toolUsed++; }

  canSpendModelCall(): boolean { return this.modelUsed < this.caps.modelCalls; }
  spendModelCall(): void { this.modelUsed++; }

  recordTokens(n: number): void { this.tokensUsed += n; }

  /** Returns true the first time the alarm threshold is crossed; false thereafter. */
  shouldFireTokenAlarm(): boolean {
    if (this.alarmEmitted) return false;
    if (this.tokensUsed >= this.caps.tokenAlarm) {
      this.alarmEmitted = true;
      return true;
    }
    return false;
  }

  snapshot(): { tool_calls_used: number; model_calls_used: number; tokens_used: number } {
    return {
      tool_calls_used:  this.toolUsed,
      model_calls_used: this.modelUsed,
      tokens_used:      this.tokensUsed,
    };
  }
}
