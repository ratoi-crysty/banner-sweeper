export const GENERATE_OPTIONS = Symbol('GENERATE_OPTIONS');

export interface GenerateModuleOptions {
  /** Jobs running at the same time (each uses browser contexts and model turns). Default 2. */
  maxConcurrentJobs: number;
  /** Finished jobs kept in memory for GET requests. Default 100. */
  keepFinishedJobs: number;
}

export const DEFAULT_GENERATE_OPTIONS: GenerateModuleOptions = { maxConcurrentJobs: 2, keepFinishedJobs: 100 };
