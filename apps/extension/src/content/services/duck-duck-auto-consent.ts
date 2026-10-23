import AutoConsent, { BackgroundMessage, ContentScriptMessage } from '@duckduckgo/autoconsent';

export class DuckDuckAutoConsent {
  protected static self: DuckDuckAutoConsent | undefined;

  static getInstance(): DuckDuckAutoConsent {
    if (!this.self) {
      this.self = new DuckDuckAutoConsent();
    }

    return this.self;
  }

  protected autoConsent: AutoConsent | undefined;

  // This is to prevent manually instantiating the service
  protected constructor() {
    /* empty */
  }

  init(): void {
    if (this.autoConsent) {
      throw new Error('Instance was already initialized');
    }

    // Without config and rules, AutoConsent sends `init` to the background and waits for its `initResp`
    const autoConsent: AutoConsent = new AutoConsent(async (message: ContentScriptMessage): Promise<void> => {
      await chrome.runtime.sendMessage(message);
    });

    chrome.runtime.onMessage.addListener((message: BackgroundMessage): void => {
      void autoConsent.receiveMessageCallback(message);
    });

    this.autoConsent = autoConsent;
  }
}
