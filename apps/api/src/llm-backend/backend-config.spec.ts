import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BackendEntry, selectBackendEntry } from './backend-config';

const CHECKED_IN_CONFIG: unknown = JSON.parse(
  readFileSync(join(__dirname, '../../config/llm-backends.json'), 'utf8'),
);

const CLAUDE_SONNET: Record<string, unknown> = {
  id: 'claude-sonnet',
  kind: 'claude',
  model: 'claude-sonnet-5-5',
  effort: 'high',
  maxTokens: 16000,
};

const LOCAL_QWEN: Record<string, unknown> = {
  id: 'local-qwen',
  kind: 'anthropicCompatible',
  baseURL: 'http://localhost:11434',
  model: 'qwen3.6:27b',
  maxTokens: 16000,
  contextPolicy: { keepScreenshots: 2 },
};

describe('selectBackendEntry', () => {
  it('defaults to claude-opus on Opus 5.5 at medium effort in the checked-in config', () => {
    const entry: BackendEntry = selectBackendEntry(
      CHECKED_IN_CONFIG,
      undefined,
    );

    expect(entry).toMatchObject({
      id: 'claude-opus',
      kind: 'claude',
      model: 'claude-opus-5-5',
      effort: 'medium',
      maxTokens: 16000,
    });
    expect(entry.pricing).toBeDefined();
  });

  it('picks the entry named by its id', () => {
    const entry: BackendEntry = selectBackendEntry(
      { backends: [CLAUDE_SONNET, LOCAL_QWEN] },
      'local-qwen',
    );

    expect(entry).toEqual(LOCAL_QWEN);
  });

  it('rejects an id with no entry, naming the ones there are', () => {
    expect(() =>
      selectBackendEntry({ backends: [CLAUDE_SONNET, LOCAL_QWEN] }, 'gpt'),
    ).toThrow(/"gpt".*claude-sonnet, local-qwen/);
  });

  it('rejects a config whose entries share an id', () => {
    expect(() =>
      selectBackendEntry(
        { backends: [CLAUDE_SONNET, { ...CLAUDE_SONNET, model: 'other' }] },
        'claude-sonnet',
      ),
    ).toThrow(/claude-sonnet/);
  });

  it('rejects a malformed entry, saying where', () => {
    expect(() =>
      selectBackendEntry(
        { backends: [{ ...CLAUDE_SONNET, kind: 'openai' }] },
        'claude-sonnet',
      ),
    ).toThrow(/backends\.0\.kind/);
  });

  it('rejects an entry with a field it does not know', () => {
    expect(() =>
      selectBackendEntry(
        { backends: [{ ...CLAUDE_SONNET, apiKey: 'sk-ant-secret' }] },
        'claude-sonnet',
      ),
    ).toThrow(/apiKey/);
  });
});
