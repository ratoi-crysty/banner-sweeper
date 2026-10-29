import { DetectionBackend } from '@banner-sweeper/llm-backend';
import { BackendEntry } from './backend-config';
import { ClaudeBackend } from './claude-backend';

/** The backend class for the entry's `kind`, with the API key read from the env var `apiKeyEnv` names. */
export function createDetectionBackend(
  entry: BackendEntry,
  env: NodeJS.ProcessEnv,
): DetectionBackend {
  const apiKey: string | undefined = entry.apiKeyEnv
    ? env[entry.apiKeyEnv]
    : undefined;
  if (entry.apiKeyEnv && !apiKey) {
    throw new Error(
      `LLM backend "${entry.id}" reads its API key from ${entry.apiKeyEnv}, which is not set.`,
    );
  }

  switch (entry.kind) {
    case 'claude':
      return new ClaudeBackend(entry, { apiKey });
    case 'anthropicCompatible':
      throw new Error(
        `LLM backend "${entry.id}" is anthropicCompatible, which has no implementation yet.`,
      );
  }
}
