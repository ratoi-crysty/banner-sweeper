import { autoconsentConfig } from './config.js';

describe('autoconsentConfig', () => {
  it('Declines the banners it finds', () => {
    expect(autoconsentConfig.enabled).toBe(true);
    expect(autoconsentConfig.autoAction).toBe('optOut');
  });

  // Heuristic detection (tier1/tier2) acts on banners that no Rule describes, so it must never be enabled
  it('never runs heuristic detection', () => {
    expect(autoconsentConfig.enableHeuristicDetection).toBe(false);
    expect(autoconsentConfig.heuristicMode).toBe('off');
  });
});
