import { DetectionBackend } from '@banner-sweeper/llm-backend';
import { Test, TestingModule } from '@nestjs/testing';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ClaudeBackend } from './claude-backend';
import { DETECTION_BACKEND, LlmBackendModule } from './llm-backend.module';

const CHECKED_IN_CONFIG: string = join(
  __dirname,
  '../../config/llm-backends.json',
);

function configFile(backends: Record<string, unknown>[]): string {
  const path: string = join(
    mkdtempSync(join(tmpdir(), 'llm-backends-')),
    'llm-backends.json',
  );
  writeFileSync(path, JSON.stringify({ backends }));
  return path;
}

async function detectionBackend(configPath: string): Promise<DetectionBackend> {
  const moduleRef: TestingModule = await Test.createTestingModule({
    imports: [LlmBackendModule.register({ configPath })],
  }).compile();
  return moduleRef.get<DetectionBackend>(DETECTION_BACKEND);
}

describe('LlmBackendModule', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('provides claude-opus by default', async () => {
    vi.stubEnv('DETECTION_BACKEND', '');

    const backend: DetectionBackend = await detectionBackend(CHECKED_IN_CONFIG);

    expect(backend).toBeInstanceOf(ClaudeBackend);
    expect(backend.description).toMatchObject({
      backend: 'claude-opus',
      model: 'claude-opus-5-5',
      effort: 'medium',
    });
  });

  it('provides the backend DETECTION_BACKEND names', async () => {
    vi.stubEnv('DETECTION_BACKEND', 'claude-sonnet');

    const backend: DetectionBackend = await detectionBackend(
      configFile([
        {
          id: 'claude-opus',
          kind: 'claude',
          model: 'claude-opus-5-5',
          maxTokens: 16000,
        },
        {
          id: 'claude-sonnet',
          kind: 'claude',
          model: 'claude-sonnet-5-5',
          maxTokens: 16000,
        },
      ]),
    );

    expect(backend.description.model).toBe('claude-sonnet-5-5');
  });

  it('fails at boot when the env var named by apiKeyEnv is unset', async () => {
    vi.stubEnv('DETECTION_BACKEND', '');
    vi.stubEnv('MISSING_KEY', '');

    await expect(
      detectionBackend(
        configFile([
          {
            id: 'claude-opus',
            kind: 'claude',
            apiKeyEnv: 'MISSING_KEY',
            model: 'claude-opus-5-5',
            maxTokens: 16000,
          },
        ]),
      ),
    ).rejects.toThrow(/MISSING_KEY/);
  });

  it('fails at boot on a backend kind that has no implementation yet', async () => {
    vi.stubEnv('DETECTION_BACKEND', 'local');

    await expect(
      detectionBackend(
        configFile([
          {
            id: 'local',
            kind: 'anthropicCompatible',
            baseURL: 'http://localhost:11434',
            model: 'qwen3.6:27b',
            maxTokens: 16000,
          },
        ]),
      ),
    ).rejects.toThrow(/anthropicCompatible/);
  });
});
