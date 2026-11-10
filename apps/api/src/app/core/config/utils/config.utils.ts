export function positiveInteger(name: string, value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer, got "${value}"`);
  }

  return parsed;
}

export function languageTag(name: string, value: string | undefined, fallback: string): string {
  if (!value) {
    return fallback;
  }

  // A well-formed tag isn't enough: "english" parses, but no locale data backs it
  let supported: string[] = [];

  try {
    supported = Intl.DateTimeFormat.supportedLocalesOf(value);
  } catch {
    // Malformed, like "en_GB"
  }

  if (supported.length === 0) {
    throw new Error(`${name} must be a supported locale such as "en-GB", got "${value}"`);
  }

  return value;
}

// Returns the canonical IANA name, so a differently cased value still reaches the browser correctly
export function timeZone(name: string, value: string | undefined, fallback: string): string {
  if (!value) {
    return fallback;
  }

  try {
    return new Intl.DateTimeFormat('en', { timeZone: value }).resolvedOptions().timeZone;
  } catch {
    throw new Error(`${name} must be an IANA time zone such as "Europe/Bucharest", got "${value}"`);
  }
}
