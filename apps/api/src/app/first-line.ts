/** The first line of an error's message: Playwright appends a multi-line call log to its own. */
export function firstLine(error: unknown): string {
  const message: string =
    error instanceof Error ? error.message : String(error);

  return message.split('\n')[0] ?? '';
}
