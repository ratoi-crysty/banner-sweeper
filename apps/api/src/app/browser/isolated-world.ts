/*
 * This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of
 * the MPL was not distributed with this file, You can obtain one at https://mozilla.org/MPL/2.0/.
 *
 * A TypeScript port of `playwright/isolated-world.mjs` from @duckduckgo/autoconsent 16.60.0
 * (https://github.com/duckduckgo/autoconsent), Copyright DuckDuckGo, Inc., MPL-2.0. Changes from
 * upstream: typed against playwright-core, and the message handler receives the parsed message as
 * `unknown`.
 */
import type { CDPSession, Frame, Page } from 'playwright-core';

// The parts of the CDP payloads this bridge reads. playwright-core doesn't export its `Protocol` types.
interface ExecutionContextDescription {
  uniqueId: string;
  name: string;
  origin: string;
  auxData?: Record<string, unknown>;
}

interface ExecutionContextCreatedEvent {
  context: ExecutionContextDescription;
}

interface ExecutionContextDestroyedEvent {
  executionContextUniqueId: string;
}

interface BindingCalledEvent {
  name: string;
  payload: string;
}

interface FrameNavigatedEvent {
  frame: { id: string; parentId?: string };
}

interface EvaluateResult {
  result: { value?: unknown };
  exceptionDetails?: unknown;
}

interface FrameTreeResult {
  frameTree: { frame: { id: string } };
}

/**
 * Primitives the message handler uses to talk to a specific frame's content script.
 * `frameRef` is the isolated world's execution-context uniqueId the message arrived from;
 * the transport resolves it to the owning CDP session and the matching page-world context.
 */
export interface MessageTransport {
  sendToContentScript(frameRef: string, message: object): Promise<void>;
  evalInMainWorld(frameRef: string, code: string): Promise<unknown>;
  // Whether the frame is the page's top frame
  isMainFrame(frameRef: string): boolean;
}

export type MessageHandler = (message: unknown, frameRef: string) => void;

export type MessageHandlerFactory = (
  transport: MessageTransport,
) => MessageHandler;

// Isolated world name: `<prefix><pageWorldUniqueId><separator><frameId>`. Encoding the page-world
// uniqueId lets us later run eval snippets in that frame's main world.
const WORLD_PREFIX = 'autoconsent_iw_';
const WORLD_SEPARATOR = '_frame_';
const BINDING_PREFIX = 'autoconsentSendMessage_';

/**
 * Isolated-world injection via CDP (Chromium only). For each frame we create a dedicated isolated
 * world via `Page.createIsolatedWorld`, then inject the content script there and bridge messages
 * over a per-context CDP binding.
 *
 * @param contentScript The autoconsent content script bundle.
 * @param extraScript Runs in each isolated world after the content script.
 */
export async function injectIntoIsolatedWorld(
  page: Page,
  createMessageHandler: MessageHandlerFactory,
  contentScript: string,
  extraScript = '',
): Promise<void> {
  // isolated-world uniqueId -> page (main) world uniqueId
  const isolated2pageWorld: Map<string, string> = new Map<string, string>();
  // isolated-world uniqueId -> CDP session that owns it
  const sessionByContext: Map<string, CDPSession> = new Map<
    string,
    CDPSession
  >();
  // binding name -> isolated-world uniqueId
  const contextByBinding: Map<string, string> = new Map<string, string>();
  // isolated-world uniqueId -> binding name
  const bindingByContext: Map<string, string> = new Map<string, string>();
  // isolated-world uniqueId -> CDP frame id
  const frameByContext: Map<string, string> = new Map<string, string>();
  // CDP frame id -> uniqueId of the frame's current page (main) world
  const pageWorldByFrame: Map<string, string> = new Map<string, string>();
  let pageSession: CDPSession | null = null;
  let mainFrameId: string | null = null;

  const handle: MessageHandler = createMessageHandler({
    sendToContentScript: async (
      isolatedUniqueId: string,
      message: object,
    ): Promise<void> => {
      const client: CDPSession | undefined =
        sessionByContext.get(isolatedUniqueId);
      if (!client) return;
      try {
        await client.send('Runtime.evaluate', {
          expression: `autoconsentReceiveMessage(${JSON.stringify(message)})`,
          uniqueContextId: isolatedUniqueId,
          awaitPromise: true,
          // Some pages' CSP would otherwise block evaluating in the isolated world.
          allowUnsafeEvalBlockedByCSP: true,
        });
      } catch {
        // The context may be gone if the frame navigated or detached.
      }
    },
    evalInMainWorld: async (
      isolatedUniqueId: string,
      code: string,
    ): Promise<unknown> => {
      const client: CDPSession | undefined =
        sessionByContext.get(isolatedUniqueId);
      const pageWorldUniqueId: string | undefined =
        isolated2pageWorld.get(isolatedUniqueId);
      if (!client || !pageWorldUniqueId) return false;
      const { result, exceptionDetails }: EvaluateResult = await client.send(
        'Runtime.evaluate',
        {
          expression: code,
          uniqueContextId: pageWorldUniqueId,
          returnByValue: true,
          awaitPromise: true,
          // Eval snippets must run even when the page's CSP disallows eval.
          allowUnsafeEvalBlockedByCSP: true,
        },
      );
      return exceptionDetails ? false : (result.value ?? false);
    },
    isMainFrame: (isolatedUniqueId: string): boolean =>
      sessionByContext.get(isolatedUniqueId) === pageSession &&
      frameByContext.get(isolatedUniqueId) === mainFrameId,
  });

  async function attachToSession(client: CDPSession): Promise<void> {
    client.on(
      'Runtime.executionContextCreated',
      async (event: ExecutionContextCreatedEvent): Promise<void> => {
        const { context }: ExecutionContextCreatedEvent = event;
        const frameId: unknown = context.auxData?.['frameId'];
        const type: unknown = context.auxData?.['type'];

        // Our isolated world finished initializing: wire up its binding and content script.
        if (type === 'isolated' && context.name.startsWith(WORLD_PREFIX)) {
          const separatorIndex: number = context.name.indexOf(WORLD_SEPARATOR);
          const pageWorldUniqueId: string = context.name.slice(
            WORLD_PREFIX.length,
            separatorIndex,
          );
          const intendedFrameId: string = context.name.slice(
            separatorIndex + WORLD_SEPARATOR.length,
          );
          // Chromium may create the named world in other frames too, and recreates it in the frame's
          // next document; keep only the one we asked for in the current document.
          if (
            typeof frameId !== 'string' ||
            intendedFrameId !== frameId ||
            pageWorldByFrame.get(frameId) !== pageWorldUniqueId
          )
            return;

          isolated2pageWorld.set(context.uniqueId, pageWorldUniqueId);
          sessionByContext.set(context.uniqueId, client);
          frameByContext.set(context.uniqueId, frameId);

          const bindingName = `${BINDING_PREFIX}${context.uniqueId.replace(/\W/g, '_')}`;
          contextByBinding.set(bindingName, context.uniqueId);
          bindingByContext.set(context.uniqueId, bindingName);
          try {
            await client.send('Runtime.addBinding', {
              name: bindingName,
              executionContextName: context.name,
            });
            // CDP bindings take a single string arg, so wrap it in the shape the content script expects.
            await client.send('Runtime.evaluate', {
              expression: `window.autoconsentSendMessage = (m) => { window.${bindingName}(JSON.stringify(m)); return Promise.resolve(); };\n${contentScript}\n${extraScript}`,
              uniqueContextId: context.uniqueId,
              allowUnsafeEvalBlockedByCSP: true,
            });
          } catch {
            // The frame may have navigated or detached before we finished wiring it up.
          }
          return;
        }

        // A regular page (main) world: request an isolated world for it, tagged with its id.
        if (typeof frameId !== 'string' || type !== 'default') return;
        pageWorldByFrame.set(frameId, context.uniqueId);
        if (!context.origin || context.origin === '://') return;
        try {
          await client.send('Page.createIsolatedWorld', {
            frameId,
            worldName: `${WORLD_PREFIX}${context.uniqueId}${WORLD_SEPARATOR}${frameId}`,
          });
        } catch {
          // The frame may have navigated or detached.
        }
      },
    );

    client.on(
      'Runtime.executionContextDestroyed',
      (event: ExecutionContextDestroyedEvent): void => {
        const uniqueId: string = event.executionContextUniqueId;
        if (!uniqueId) return;
        isolated2pageWorld.delete(uniqueId);
        sessionByContext.delete(uniqueId);
        frameByContext.delete(uniqueId);
        const bindingName: string | undefined = bindingByContext.get(uniqueId);
        if (bindingName) {
          bindingByContext.delete(uniqueId);
          contextByBinding.delete(bindingName);
          // Each document gets its own binding, so drop the old one with its context.
          client
            .send('Runtime.removeBinding', { name: bindingName })
            .catch((): void => undefined);
        }
      },
    );

    client.on('Runtime.bindingCalled', (event: BindingCalledEvent): void => {
      const isolatedUniqueId: string | undefined = contextByBinding.get(
        event.name,
      );
      if (!isolatedUniqueId) return;
      let message: unknown;
      try {
        message = JSON.parse(event.payload);
      } catch {
        return;
      }
      handle(message, isolatedUniqueId);
    });

    // Page must be enabled before createIsolatedWorld; Runtime.enable replays existing contexts.
    await client.send('Page.enable');
    await client.send('Runtime.enable');
  }

  // The page session covers the main frame and all same-process (in-process) iframes.
  pageSession = await page.context().newCDPSession(page);
  const { frameTree }: FrameTreeResult =
    await pageSession.send('Page.getFrameTree');
  mainFrameId = frameTree.frame.id;
  // Follow the top frame if Chromium replaces it (e.g. on prerender activation).
  pageSession.on('Page.frameNavigated', (event: FrameNavigatedEvent): void => {
    if (!event.frame.parentId) mainFrameId = event.frame.id;
  });
  await attachToSession(pageSession);

  // Out-of-process iframes (OOPIFs) are separate CDP targets, so each needs its own session.
  // newCDPSession throws for in-process frames, which are already handled above.
  const attachedFrames: WeakSet<Frame> = new WeakSet<Frame>();
  async function attachToOopif(frame: Frame): Promise<void> {
    if (!frame.parentFrame() || attachedFrames.has(frame)) return;
    // Mark synchronously (before any await) so concurrent frameattached/framenavigated events
    // can't open duplicate sessions for the same frame. Unmark on failure so a later event retries.
    attachedFrames.add(frame);
    let client: CDPSession;
    try {
      client = await page.context().newCDPSession(frame);
    } catch {
      // In-process frame (already covered by the page session) or the frame detached.
      attachedFrames.delete(frame);
      return;
    }
    try {
      await attachToSession(client);
    } catch {
      // Wiring up the session failed (e.g. the OOPIF navigated/detached). Detach the
      // half-initialized session before unmarking, otherwise a retry would open a second
      // session for the same frame, leaving duplicate listeners and possible double injection.
      try {
        await client.detach();
      } catch {
        // The session may already be gone.
      }
      attachedFrames.delete(frame);
    }
  }
  page.on('frameattached', attachToOopif);
  page.on('framenavigated', attachToOopif);
  await Promise.all(page.frames().map(attachToOopif));
}
