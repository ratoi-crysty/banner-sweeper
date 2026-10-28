import {
  BackgroundMessage,
  CompactCMPRuleset,
  ContentScriptMessage,
  EvalMessage,
  InitMessage,
  evalSnippets,
} from '@duckduckgo/autoconsent';
import { autoconsentConfig, compactRulesForFrame } from '@banner-sweeper/autoconsent-config';

interface FrameTarget {
  tabId: number;
  frameId: number;
  // Pins replies to the document that asked, so a page that navigated in the same frame never gets them
  documentId: string | undefined;
}

// Raised when the document that sent a message is gone (navigated, closed, or frozen in the back/forward cache)
const DOCUMENT_GONE_ERRORS: string[] = [
  'back/forward cache',
  'Receiving end does not exist',
  'No frame with id',
  'No document with id',
];

function isDocumentGoneError(error: unknown): boolean {
  return (
    error instanceof Error &&
    DOCUMENT_GONE_ERRORS.some((text: string): boolean =>
      error.message.includes(text),
    )
  );
}

function ignoreDocumentGone(error: unknown): void {
  if (!isDocumentGoneError(error)) {
    throw error;
  }
}

/**
 * Serves the autoconsent content scripts: hands out the rules on `init` and runs the
 * page-world `eval` snippets that an isolated content script cannot run by itself.
 */
export class AutoConsentBackground {
  protected static self: AutoConsentBackground | undefined;

  static getInstance(): AutoConsentBackground {
    if (!this.self) {
      this.self = new AutoConsentBackground();
    }

    return this.self;
  }

  protected initialized = false;

  // This is to prevent manually instantiating the service
  protected constructor() {
    /* empty */
  }

  init(): void {
    if (this.initialized) {
      throw new Error('Instance was already initialized');
    }

    this.initialized = true;

    chrome.runtime.onMessage.addListener(
      (
        message: ContentScriptMessage,
        sender: chrome.runtime.MessageSender,
      ): void => {
        const tabId: number | undefined = sender.tab?.id;
        const frameId: number | undefined = sender.frameId;

        if (tabId === undefined || frameId === undefined) {
          return;
        }

        const target: FrameTarget = {
          tabId,
          frameId,
          documentId: sender.documentId,
        };

        switch (message.type) {
          case 'init':
            void this.handleInit(message, target).catch(ignoreDocumentGone);
            break;
          case 'eval':
            void this.handleEval(message, target).catch(ignoreDocumentGone);
            break;
        }
      },
    );
  }

  protected async handleInit(message: InitMessage, target: FrameTarget): Promise<void> {
    const compact: CompactCMPRuleset = compactRulesForFrame({
      url: message.url,
      mainFrame: target.frameId === 0,
    });

    await this.send(target, {
      type: 'initResp',
      rules: { autoconsent: [], compact },
      config: autoconsentConfig,
    });
  }

  protected async handleEval(
    message: EvalMessage,
    target: FrameTarget,
  ): Promise<void> {
    let result = false;

    // Snippets are the only thing we run in the page; arbitrary `code` strings are blocked by MV3 anyway
    if (message.snippetId) {
      const [injection]: chrome.scripting.InjectionResult<boolean | void>[] =
        await chrome.scripting.executeScript({
          target: target.documentId
            ? { tabId: target.tabId, documentIds: [target.documentId] }
            : { tabId: target.tabId, frameIds: [target.frameId] },
          world: 'MAIN',
          func: evalSnippets[message.snippetId],
        });

      result = injection?.result === true;
    }

    await this.send(target, { type: 'evalResp', id: message.id, result });
  }

  protected async send(
    target: FrameTarget,
    message: BackgroundMessage,
  ): Promise<void> {
    const options: chrome.tabs.MessageSendOptions = target.documentId
      ? { documentId: target.documentId }
      : { frameId: target.frameId };

    await chrome.tabs.sendMessage(target.tabId, message, options);
  }
}
