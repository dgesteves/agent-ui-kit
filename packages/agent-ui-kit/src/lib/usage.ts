import type { RunUsage } from './ai';

/** USD per million tokens. */
export interface ModelPricing {
  input: number;
  output: number;
  /** Price for cache-read input tokens. Defaults to `input`. */
  cachedInput?: number | undefined;
}

export interface CostBreakdown {
  input: number;
  cachedInput: number;
  output: number;
  total: number;
}

/** Estimate the cost of a run from AI SDK usage and per-million-token pricing. */
export function estimateCost(usage: RunUsage | undefined, pricing: ModelPricing): CostBreakdown {
  const inputTokens = usage?.inputTokens ?? 0;
  const cached = Math.min(usage?.inputTokenDetails?.cacheReadTokens ?? 0, inputTokens);
  const fresh = inputTokens - cached;
  const output = usage?.outputTokens ?? 0;
  const c = {
    input: (fresh * pricing.input) / 1e6,
    cachedInput: (cached * (pricing.cachedInput ?? pricing.input)) / 1e6,
    output: (output * pricing.output) / 1e6,
  };
  return { ...c, total: c.input + c.cachedInput + c.output };
}
