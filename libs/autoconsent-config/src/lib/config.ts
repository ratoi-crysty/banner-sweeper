import { Config } from '@duckduckgo/autoconsent';

/**
 * The autoconsent config the extension runs with. Detection's stock check uses this exact
 * config so that "Covered" means the extension would already Decline the banner.
 */
export const autoconsentConfig: Config = {
  enabled: true,
  autoAction: 'optOut',
  disabledCmps: [],
  enablePrehide: true,
  enableCosmeticRules: true,
  enableGeneratedRules: true,
  enableHeuristicDetection: false,
  enablePopupMutationObserver: false,
  detectRetries: 20,
  isMainWorld: false,
  prehideTimeout: 2000,
  visualTest: false,
  logs: {
    lifecycle: false,
    rulesteps: false,
    evals: false,
    errors: true,
    messages: false,
    detectionsteps: false,
    waits: false,
  },
  performanceLoggingEnabled: false,
  heuristicPopupSearchTimeout: 100,
  heuristicMode: 'off',
};
