export interface TokenUsage {
  /** Uncached input tokens. */
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

/** USD per million tokens, from the backend's config entry. */
export interface Pricing {
  inputPerMTok: number;
  outputPerMTok: number;
  cacheReadPerMTok: number;
  cacheWritePerMTok: number;
}

const TOKENS_PER_MTOK = 1_000_000;

/** The cost of `usage` at `pricing`, or `null` for a backend without pricing (a local one). */
export function costUsd(
  usage: TokenUsage,
  pricing: Pricing | null,
): number | null {
  if (!pricing) {
    return null;
  }

  const microDollars: number =
    usage.inputTokens * pricing.inputPerMTok +
    usage.outputTokens * pricing.outputPerMTok +
    usage.cacheReadTokens * pricing.cacheReadPerMTok +
    usage.cacheWriteTokens * pricing.cacheWritePerMTok;

  return microDollars / TOKENS_PER_MTOK;
}
