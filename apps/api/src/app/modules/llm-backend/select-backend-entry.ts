import { plainToInstance } from 'class-transformer';
import { ValidationError, validateSync } from 'class-validator';
import { BackendConfig, BackendEntry } from './backend-config';

export const DEFAULT_BACKEND_ID = 'claude-opus';

/**
 * Validates the backend config and returns the entry `requestedId` names (`DETECTION_BACKEND`),
 * or `claude-opus` without one. Throws on any problem, so a bad config stops the API at boot.
 */
export function selectBackendEntry(rawConfig: unknown, requestedId: string | undefined): BackendEntry {
  if (typeof rawConfig !== 'object' || rawConfig === null || Array.isArray(rawConfig)) {
    throw new Error('Invalid LLM backend config: (root): must be an object');
  }

  const config: BackendConfig = plainToInstance(BackendConfig, rawConfig);
  // The same strictness as the HTTP DTOs: an unknown field is an error, not silently dropped
  const errors: ValidationError[] = validateSync(config, { whitelist: true, forbidNonWhitelisted: true });
  if (errors.length > 0) {
    throw new Error(`Invalid LLM backend config: ${describeProblems(errors, []).join('; ')}`);
  }

  const id: string = requestedId || DEFAULT_BACKEND_ID;
  const entry: BackendEntry | undefined = config.backends.find(
    (candidate: BackendEntry): boolean => candidate.id === id,
  );
  if (!entry) {
    const known: string = config.backends.map((candidate: BackendEntry): string => candidate.id).join(', ');
    throw new Error(`No LLM backend "${id}" in the config. Configured: ${known}`);
  }
  return entry;
}

// Flattens class-validator's error tree into `backends.0.kind: kind must be …` lines
function describeProblems(errors: ValidationError[], parentPath: string[]): string[] {
  return errors.flatMap((error: ValidationError): string[] => {
    const path: string[] = [...parentPath, error.property];
    const own: string[] = Object.values(error.constraints ?? {}).map(
      (message: string): string => `${path.join('.')}: ${message}`,
    );
    return [...own, ...describeProblems(error.children ?? [], path)];
  });
}
