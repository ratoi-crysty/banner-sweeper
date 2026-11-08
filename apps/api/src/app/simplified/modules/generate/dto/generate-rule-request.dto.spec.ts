import { BadRequestException, ValidationPipe, type ArgumentMetadata } from '@nestjs/common';
import { VALIDATION_PIPE_OPTIONS } from '../../../common/validation';
import { ContextSettingsDto } from '../../playwright/dto/context-settings.dto';
import { GenerateRuleRequestDto } from './generate-rule-request.dto';

const pipe: ValidationPipe = new ValidationPipe(VALIDATION_PIPE_OPTIONS);
const metadata: ArgumentMetadata = { type: 'body', metatype: GenerateRuleRequestDto };

async function errorsFor(body: unknown): Promise<string[]> {
  try {
    await pipe.transform(body, metadata);
    return [];
  } catch (err) {
    if (!(err instanceof BadRequestException)) throw err;
    const response: { message: string[] } = err.getResponse() as { message: string[] };
    return response.message;
  }
}

describe('GenerateRuleRequestDto', () => {
  it('accepts a full valid request and builds nested DTO instances', async () => {
    const body: unknown = {
      url: 'http://localhost:8080/page',
      provider: { type: 'ollama', model: 'qwen3:8b', host: 'http://127.0.0.1:11434', vision: true },
      name: 'llm_example',
      checkBundledRules: false,
      maxSteps: 50,
      settleMs: 0,
      context: { locale: 'ro-RO', timezoneId: 'Europe/Bucharest', viewport: { width: 1280, height: 800 } },
    };
    const dto: GenerateRuleRequestDto = await pipe.transform(body, metadata);
    expect(dto).toBeInstanceOf(GenerateRuleRequestDto);
    expect(dto.context).toBeInstanceOf(ContextSettingsDto);
    expect(dto.provider?.host).toBe('http://127.0.0.1:11434');
  });

  it('accepts the minimal request', async () => {
    expect(await errorsFor({ url: 'https://example.com' })).toEqual([]);
  });

  it.each([undefined, '', 'example.com', 'ftp://example.com', 'javascript:alert(1)', 42])('rejects url %p', async (url: unknown) => {
    expect(await errorsFor({ url })).toEqual(['url must be an absolute http(s) URL']);
  });

  it('rejects names reserved by autoconsent', async () => {
    expect(await errorsFor({ url: 'https://example.com', name: 'auto_x' })).toEqual([
      'name must not start with "auto_" (reserved by autoconsent)',
    ]);
  });

  it.each([0, 51, 2.5, '10'])('rejects maxSteps %p', async (maxSteps: unknown) => {
    expect(await errorsFor({ url: 'https://example.com', maxSteps })).not.toEqual([]);
  });

  it('rejects an unknown provider type', async () => {
    expect(await errorsFor({ url: 'https://example.com', provider: { type: 'openai' } })).toEqual([
      'provider.type must be one of the following values: claude-agent-sdk, claude-api, ollama',
    ]);
  });

  it('validates nested context fields', async () => {
    expect(await errorsFor({ url: 'https://example.com', context: { viewport: { width: 0, height: 800 } } })).toEqual([
      'context.viewport.width must not be less than 1',
    ]);
  });

  it('rejects unknown fields instead of dropping them', async () => {
    expect(await errorsFor({ url: 'https://example.com', maxStep: 5 })).toEqual(['property maxStep should not exist']);
  });
});
