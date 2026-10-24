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
    const autoConsent: AutoConsent = new AutoConsent(
      (message: ContentScriptMessage): Promise<void> => this.sendToBackground(message),
    );

    chrome.runtime.onMessage.addListener((message: BackgroundMessage): void => {
      void autoConsent.receiveMessageCallback(message);
    });

    // Messages in flight are dropped while the page sits in the back/forward cache, so `initResp` may never have arrived
    window.addEventListener('pageshow', (event: PageTransitionEvent): void => {
      if (event.persisted && autoConsent.state.lifecycle === 'waitingForInitResponse') {
        void this.sendToBackground({ type: 'init', url: window.location.href });
      }
    });

    this.autoConsent = autoConsent;
  }

  protected async sendToBackground(message: ContentScriptMessage): Promise<void> {
    try {
      await chrome.runtime.sendMessage(message);
    } catch (error: unknown) {
      // Chrome closes the channel when the page enters the back/forward cache; there is nobody left to answer
      if (error instanceof Error && error.message.includes('back/forward cache')) {
        return;
      }

      throw error;
    }
  }
}
