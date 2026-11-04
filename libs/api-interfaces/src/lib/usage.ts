/**
 * What a Detection job cost. Every outcome reports it. The backend fields are `null` when the
 * job ended before any LLM backend ran (a Site Covered by the stock check, or an early error).
 */
export interface DetectionUsage {
  backend: string | null;
  model: string | null;
  effort: string | null;
  promptVersion: string | null;
  turns: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  // `null` when the backend has no pricing
  costUsd: number | null;
  durationMs: number;
}
