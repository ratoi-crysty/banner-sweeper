import { Injectable } from '@nestjs/common';
import type { AutoConsentCMPRule } from '@duckduckgo/autoconsent';

/**
 * Our Published Rules, which run alongside the Bundled Rules. Rules aren't persisted yet, so
 * there are none; the persistence stage implements this with Published Revisions only.
 */
@Injectable()
export class PublishedRuleSource {
  async list(): Promise<AutoConsentCMPRule[]> {
    return [];
  }
}
