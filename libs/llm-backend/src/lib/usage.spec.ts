import { costUsd, Pricing, TokenUsage } from './usage.js';

const OPUS_PRICING: Pricing = {
  inputPerMTok: 4,
  outputPerMTok: 20,
  cacheReadPerMTok: 0.2,
  cacheWritePerMTok: 5,
};

describe('costUsd', () => {
  it('prices each kind of token at its own rate', () => {
    const usage: TokenUsage = {
      inputTokens: 100_000,
      outputTokens: 10_000,
      cacheReadTokens: 1_000_000,
      cacheWriteTokens: 200_000,
    };

    // 0.4 input + 0.2 output + 0.2 cache read + 1.0 cache write
    expect(costUsd(usage, OPUS_PRICING)).toBeCloseTo(1.8, 10);
  });

  it('is null without pricing', () => {
    const usage: TokenUsage = {
      inputTokens: 100_000,
      outputTokens: 10_000,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    };

    expect(costUsd(usage, null)).toBeNull();
  });
});
