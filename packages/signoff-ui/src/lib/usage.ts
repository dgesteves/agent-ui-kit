import type { LanguageModelUsage } from 'ai';
import type { RunUsage } from './ai';

/** USD per million tokens. */
export interface ModelPricing {
  input: number;
  output: number;
  /** Price for cache-read input tokens. Defaults to `input`. */
  cachedInput?: number | undefined;
  /** Price for input tokens written to the prompt cache (e.g. 1.25x input on Anthropic). Defaults to `input`. */
  cacheWrite?: number | undefined;
}

export interface CostBreakdown {
  /** Input tokens that were neither read from nor written to the cache. */
  input: number;
  cachedInput: number;
  cacheWrite: number;
  output: number;
  total: number;
}

/** Estimate the cost of a run from AI SDK usage and per-million-token pricing. */
export function estimateCost(usage: RunUsage | undefined, pricing: ModelPricing): CostBreakdown {
  const inputTokens = usage?.inputTokens ?? 0;
  // `inputTokens` includes cache reads and writes; never count more of either than it holds.
  const cached = Math.min(usage?.inputTokenDetails?.cacheReadTokens ?? 0, inputTokens);
  const written = Math.min(usage?.inputTokenDetails?.cacheWriteTokens ?? 0, inputTokens - cached);
  const fresh = inputTokens - cached - written;
  const output = usage?.outputTokens ?? 0;
  const c = {
    input: (fresh * pricing.input) / 1e6,
    cachedInput: (cached * (pricing.cachedInput ?? pricing.input)) / 1e6,
    cacheWrite: (written * (pricing.cacheWrite ?? pricing.input)) / 1e6,
    output: (output * pricing.output) / 1e6,
  };
  return { ...c, total: c.input + c.cachedInput + c.cacheWrite + c.output };
}

const sum = (a: number | undefined, b: number | undefined) =>
  a === undefined && b === undefined ? undefined : (a ?? 0) + (b ?? 0);

/**
 * Add two usages field by field. A run that continues after an approval or a
 * client-side tool is a new request with its own `totalUsage`, and `useChat`
 * replaces `metadata.usage` rather than adding to it, so sum on the server:
 * `addUsage(lastMessage.metadata?.usage, part.totalUsage)`.
 */
export function addUsage(a: RunUsage | undefined, b: RunUsage | undefined): LanguageModelUsage {
  return {
    inputTokens: sum(a?.inputTokens, b?.inputTokens),
    inputTokenDetails: {
      noCacheTokens: sum(a?.inputTokenDetails?.noCacheTokens, b?.inputTokenDetails?.noCacheTokens),
      cacheReadTokens: sum(a?.inputTokenDetails?.cacheReadTokens, b?.inputTokenDetails?.cacheReadTokens),
      cacheWriteTokens: sum(a?.inputTokenDetails?.cacheWriteTokens, b?.inputTokenDetails?.cacheWriteTokens),
    },
    outputTokens: sum(a?.outputTokens, b?.outputTokens),
    outputTokenDetails: {
      textTokens: sum(a?.outputTokenDetails?.textTokens, b?.outputTokenDetails?.textTokens),
      reasoningTokens: sum(a?.outputTokenDetails?.reasoningTokens, b?.outputTokenDetails?.reasoningTokens),
    },
    totalTokens: sum(a?.totalTokens, b?.totalTokens),
  };
}
