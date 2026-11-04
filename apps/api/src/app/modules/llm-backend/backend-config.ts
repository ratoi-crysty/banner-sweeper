import { z } from 'zod';

export const DEFAULT_BACKEND_ID = 'claude-opus';

const pricingSchema = z.strictObject({
  inputPerMTok: z.number().nonnegative(),
  outputPerMTok: z.number().nonnegative(),
  cacheReadPerMTok: z.number().nonnegative(),
  cacheWritePerMTok: z.number().nonnegative(),
});

const backendEntrySchema = z.strictObject({
  id: z.string().min(1),
  kind: z.enum(['claude', 'anthropicCompatible']),
  baseURL: z.url().optional(),
  /** The env var holding the API key. Without it, the SDK resolves credentials itself. */
  apiKeyEnv: z.string().min(1).optional(),
  model: z.string().min(1),
  effort: z.enum(['low', 'medium', 'high', 'xhigh', 'max']).optional(),
  maxTokens: z.int().positive(),
  pricing: pricingSchema.optional(),
  contextPolicy: z
    .strictObject({ keepScreenshots: z.int().nonnegative() })
    .optional(),
});

const backendConfigSchema = z
  .strictObject({ backends: z.array(backendEntrySchema).min(1) })
  .superRefine((config: BackendConfig, context: z.RefinementCtx): void => {
    const seen: Set<string> = new Set();
    config.backends.forEach((entry: BackendEntry, index: number): void => {
      if (seen.has(entry.id)) {
        context.addIssue({
          code: 'custom',
          path: ['backends', index, 'id'],
          message: `duplicate id "${entry.id}"`,
        });
      }
      seen.add(entry.id);
    });
  });

/** One entry of `apps/api/config/llm-backends.json`. It holds no secrets: `apiKeyEnv` names an env var. */
export type BackendEntry = z.infer<typeof backendEntrySchema>;

export type BackendConfig = z.infer<typeof backendConfigSchema>;

/**
 * Validates the backend config and returns the entry `requestedId` names (`DETECTION_BACKEND`),
 * or `claude-opus` without one. Throws on any problem, so a bad config stops the API at boot.
 */
export function selectBackendEntry(
  rawConfig: unknown,
  requestedId: string | undefined,
): BackendEntry {
  const parsed: z.ZodSafeParseResult<BackendConfig> =
    backendConfigSchema.safeParse(rawConfig);
  if (!parsed.success) {
    const problems: string = parsed.error.issues
      .map(
        (issue: z.core.$ZodIssue): string =>
          `${issue.path.join('.') || '(root)'}: ${issue.message}`,
      )
      .join('; ');
    throw new Error(`Invalid LLM backend config: ${problems}`);
  }

  const id: string = requestedId || DEFAULT_BACKEND_ID;
  const entry: BackendEntry | undefined = parsed.data.backends.find(
    (candidate: BackendEntry): boolean => candidate.id === id,
  );
  if (!entry) {
    const known: string = parsed.data.backends
      .map((candidate: BackendEntry): string => candidate.id)
      .join(', ');
    throw new Error(
      `No LLM backend "${id}" in the config. Configured: ${known}`,
    );
  }
  return entry;
}
