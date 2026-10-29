import {
  RunOutcome,
  ToolDefinition,
  ToolResult,
  toolFailure,
  TurnEvent,
} from '@banner-sweeper/llm-backend';
import { z } from 'zod';

export interface CounterInput {
  by: number;
}

export interface FinishInput {
  total: number;
}

export interface RunResult {
  events: TurnEvent[];
  outcome: RunOutcome;
}

/** The toy loop: `count` adds to a counter, and `finish` ends the run once it reports the right total. */
export function toyTools(): ToolDefinition[] {
  let counter = 0;
  const count: ToolDefinition<CounterInput> = {
    name: 'count',
    description: 'Add a number to the counter. Returns the new value.',
    inputSchema: z.object({ by: z.number() }),
    readOnly: false,
    terminal: false,
    run: async (input: CounterInput): Promise<ToolResult> => {
      counter += input.by;
      return [{ type: 'text', text: `counter: ${counter}` }];
    },
  };
  const finish: ToolDefinition<FinishInput> = {
    name: 'finish',
    description: "Report the counter's final value. Ends the task.",
    inputSchema: z.object({ total: z.number() }),
    readOnly: false,
    terminal: true,
    run: async (input: FinishInput): Promise<ToolResult> =>
      input.total === counter
        ? [{ type: 'text', text: 'done' }]
        : toolFailure(`wrong total, the counter is ${counter}`),
  };
  return [count, finish];
}

/** Runs a backend's loop to the end, collecting its turn events. */
export async function drain(
  run: AsyncGenerator<TurnEvent, RunOutcome, undefined>,
): Promise<RunResult> {
  const events: TurnEvent[] = [];
  for (;;) {
    const step: IteratorResult<TurnEvent, RunOutcome> = await run.next();
    if (step.done) {
      return { events, outcome: step.value };
    }
    events.push(step.value);
  }
}
