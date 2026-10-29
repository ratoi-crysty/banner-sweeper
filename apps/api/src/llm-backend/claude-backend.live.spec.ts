import { DetectionBackend, TurnEvent } from '@banner-sweeper/llm-backend';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { selectBackendEntry } from './backend-config';
import { createDetectionBackend } from './create-detection-backend';
import { drain, RunResult, toyTools } from './testing/toy-tools';

/**
 * Runs the toy loop against the real API: opt in with `LIVE_LLM_TEST=1` (it costs money). Uses the backend
 * `DETECTION_BACKEND` names, `claude-opus` by default, and the SDK's usual credentials (`ANTHROPIC_API_KEY`).
 *
 *   LIVE_LLM_TEST=1 npx nx test @banner-sweeper/api -- claude-backend.live
 */
describe.skipIf(!process.env['LIVE_LLM_TEST'])('ClaudeBackend, live', () => {
  it('counts to 3 and finishes', { timeout: 300_000 }, async () => {
    const backend: DetectionBackend = createDetectionBackend(
      selectBackendEntry(
        JSON.parse(
          readFileSync(
            join(__dirname, '../../config/llm-backends.json'),
            'utf8',
          ),
        ),
        process.env['DETECTION_BACKEND'],
      ),
      process.env,
    );

    const { events, outcome }: RunResult = await drain(
      backend.run({
        system:
          'You operate a counter through tools. Use `count` to change it and `finish` to report its final value.',
        firstMessage: [
          {
            type: 'text',
            text: 'Add 1 to the counter three times, one call at a time, then finish.',
          },
        ],
        tools: toyTools(),
        maxTurns: 10,
        signal: AbortSignal.timeout(240_000),
      }),
    );

    expect(outcome).toEqual({ kind: 'terminal', tool: 'finish' });
    expect(events.at(-1)?.toolCalls.at(-1)).toMatchObject({
      name: 'finish',
      input: { total: 3 },
    });
    expect(
      events.every((event: TurnEvent): boolean => event.usage.outputTokens > 0),
    ).toBe(true);
  });
});
