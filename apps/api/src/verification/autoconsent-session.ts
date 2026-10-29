import type {
  AutoconsentLogEntry,
  FrameMessageLog,
} from '@banner-sweeper/api-interfaces';
import type { FrameContext } from '@banner-sweeper/autoconsent-config';
import type {
  BackgroundMessage,
  Config,
  ContentScriptMessage,
  EvalMessage,
  InitMessage,
  RuleBundle,
} from '@duckduckgo/autoconsent';
import { evalSnippets } from '@duckduckgo/autoconsent';

// autoconsent gives up on an `eval` after 1 s, so a later answer is useless
const EVAL_TIMEOUT_MS = 1000;

// Messages too frequent or too internal to be worth keeping in a Verification Report
const UNLOGGED_TYPES: ContentScriptMessage['type'][] = [
  'eval',
  'report',
  'visualDelay',
];

/** One frame's autoconsent content script, reached through the isolated-world bridge. */
export interface ContentScriptFrame {
  // Unique per document: a frame that navigates gets a new id
  id: string;
  isMainFrame: boolean;
  send(message: BackgroundMessage): Promise<void>;
  evalInMainWorld(code: string): Promise<unknown>;
}

export interface AutoconsentSessionOptions {
  config: Config;
  rulesForFrame(frame: FrameContext): RuleBundle;
}

export interface ReceivedMessage<
  T extends ContentScriptMessage = ContentScriptMessage,
> {
  message: T;
  frame: ContentScriptFrame;
  // Milliseconds since the session started
  atMs: number;
}

export type MessageMatcher<T extends ContentScriptMessage> = (
  message: ContentScriptMessage,
  frame: ContentScriptFrame,
) => message is T;

interface Waiter {
  match: (received: ReceivedMessage) => boolean;
  resolve: (received: ReceivedMessage) => void;
}

/**
 * Node's half of an autoconsent run: it plays the extension background for every frame of one
 * page (answering `init` and `eval`) and keeps every message, so checks can wait for them.
 */
export class AutoconsentSession {
  private readonly startedAt: number = Date.now();
  private readonly received: ReceivedMessage[] = [];
  private waiters: Waiter[] = [];
  private readonly frameUrls: Map<string, string> = new Map<string, string>();

  constructor(private readonly options: AutoconsentSessionOptions) {}

  async receive(
    message: ContentScriptMessage,
    frame: ContentScriptFrame,
  ): Promise<void> {
    const received: ReceivedMessage = {
      message,
      frame,
      atMs: this.elapsedMs(),
    };
    this.received.push(received);
    this.rememberFrameUrl(message, frame);
    this.waiters = this.waiters.filter((waiter: Waiter): boolean => {
      if (!waiter.match(received)) {
        return true;
      }

      waiter.resolve(received);

      return false;
    });

    switch (message.type) {
      case 'init':
        await this.answerInit(message, frame);
        break;
      case 'eval':
        await this.answerEval(message, frame);
        break;
    }
  }

  /**
   * The first message `match` accepts, already received or arriving within `timeoutMs`.
   * Resolves `null` when none arrives in time: autoconsent sends nothing on a negative outcome.
   */
  waitFor<T extends ContentScriptMessage>(
    match: MessageMatcher<T>,
    timeoutMs: number,
  ): Promise<ReceivedMessage<T> | null> {
    const matches = (received: ReceivedMessage): boolean =>
      match(received.message, received.frame);
    const found: ReceivedMessage | undefined = this.received.find(matches);

    if (found) {
      return Promise.resolve(found as ReceivedMessage<T>);
    }

    return new Promise<ReceivedMessage<T> | null>(
      (resolve: (received: ReceivedMessage<T> | null) => void): void => {
        const waiter: Waiter = {
          match: matches,
          resolve: (received: ReceivedMessage): void => {
            clearTimeout(timer);
            resolve(received as ReceivedMessage<T>);
          },
        };
        const timer: NodeJS.Timeout = setTimeout(
          (): void => {
            this.waiters = this.waiters.filter(
              (other: Waiter): boolean => other !== waiter,
            );
            resolve(null);
          },
          Math.max(0, timeoutMs),
        );
        this.waiters.push(waiter);
      },
    );
  }

  // Received messages of a type, in arrival order
  messagesOfType<T extends ContentScriptMessage['type']>(
    type: T,
  ): ReceivedMessage<Extract<ContentScriptMessage, { type: T }>>[] {
    return this.received.filter(
      (received: ReceivedMessage): boolean => received.message.type === type,
    ) as ReceivedMessage<Extract<ContentScriptMessage, { type: T }>>[];
  }

  frameUrl(frame: ContentScriptFrame): string {
    return this.frameUrls.get(frame.id) ?? 'unknown';
  }

  elapsedMs(): number {
    return Date.now() - this.startedAt;
  }

  messageLog(): FrameMessageLog[] {
    const logs: Map<string, FrameMessageLog> = new Map<
      string,
      FrameMessageLog
    >();

    for (const { message, frame, atMs } of this.received) {
      if (UNLOGGED_TYPES.includes(message.type)) {
        continue;
      }

      let log: FrameMessageLog | undefined = logs.get(frame.id);

      if (!log) {
        log = {
          frameUrl: this.frameUrl(frame),
          mainFrame: frame.isMainFrame,
          messages: [],
        };
        logs.set(frame.id, log);
      }

      log.messages.push(toLogEntry(message, atMs));
    }

    return [...logs.values()];
  }

  private rememberFrameUrl(
    message: ContentScriptMessage,
    frame: ContentScriptFrame,
  ): void {
    if ('url' in message && !this.frameUrls.has(frame.id)) {
      this.frameUrls.set(frame.id, message.url);
    }
  }

  private async answerInit(
    message: InitMessage,
    frame: ContentScriptFrame,
  ): Promise<void> {
    await frame.send({
      type: 'initResp',
      config: this.options.config,
      rules: this.options.rulesForFrame({
        url: message.url,
        mainFrame: frame.isMainFrame,
      }),
    });
  }

  // Like the extension: only autoconsent's own snippets run, never the `code` a page could have sent
  private async answerEval(
    message: EvalMessage,
    frame: ContentScriptFrame,
  ): Promise<void> {
    const snippet: (() => unknown) | undefined = message.snippetId
      ? evalSnippets[message.snippetId]
      : undefined;
    const result: boolean = snippet
      ? await withTimeout(
          frame
            .evalInMainWorld(`(${snippet.toString()})()`)
            .then((value: unknown): boolean => value === true)
            .catch((): boolean => false),
          EVAL_TIMEOUT_MS,
          false,
        )
      : false;

    await frame.send({ type: 'evalResp', id: message.id, result });
  }
}

function toLogEntry(
  message: ContentScriptMessage,
  atMs: number,
): AutoconsentLogEntry {
  const entry: AutoconsentLogEntry = { atMs, type: message.type };

  if ('cmp' in message) {
    entry.cmp = message.cmp;
  }

  if ('result' in message) {
    entry.result = message.result;
  }

  if ('isCosmetic' in message) {
    entry.isCosmetic = message.isCosmetic;
  }

  return entry;
}

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  fallback: T,
): Promise<T> {
  return new Promise<T>((resolve: (value: T) => void): void => {
    const timer: NodeJS.Timeout = setTimeout(
      (): void => resolve(fallback),
      timeoutMs,
    );
    void promise.then((value: T): void => {
      clearTimeout(timer);
      resolve(value);
    });
  });
}
