import { BadRequestException, ValidationPipe, type ArgumentMetadata } from '@nestjs/common';
import { VALIDATION_PIPE_OPTIONS } from '../../../shared/validation';
import { ValidateRuleRequestDto } from './validate-rule-request.dto';

const pipe: ValidationPipe = new ValidationPipe(VALIDATION_PIPE_OPTIONS);
const metadata: ArgumentMetadata = { type: 'body', metatype: ValidateRuleRequestDto };

const RULE_MESSAGE = 'rule must be an autoconsent rule object (name, detectCmp, detectPopup, optOut, optIn)';

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

describe('ValidateRuleRequestDto', () => {
  it('keeps rule fields the DTO does not declare', async () => {
    const rule: Record<string, unknown> = {
      name: 'llm_example',
      prehideSelectors: ['#banner'],
      runContext: { urlPattern: '^https://example\\.com' },
      detectCmp: [{ exists: '#banner' }],
      detectPopup: [{ visible: '#banner' }],
      optOut: [{ waitForThenClick: '#reject' }],
      optIn: [{ waitForThenClick: '#accept' }],
    };
    const dto: ValidateRuleRequestDto = await pipe.transform(
      { url: 'https://example.com', rule, timeoutMs: 20000 },
      metadata,
    );
    expect(dto.rule).toEqual(rule);
  });

  it.each([undefined, 'rule', [], {}, { name: 'x' }, { name: '', detectCmp: [] }, { detectCmp: [] }])(
    'rejects rule %p',
    async (rule: unknown) => {
      expect(await errorsFor({ url: 'https://example.com', rule })).toEqual([RULE_MESSAGE]);
    },
  );

  it('rejects a bad url and out-of-range timeout together', async () => {
    expect(await errorsFor({ url: 'nope', rule: { name: 'x', detectCmp: [] }, timeoutMs: 10 })).toEqual([
      'url must be an absolute http(s) URL',
      'timeoutMs must not be less than 1000',
    ]);
  });
});
